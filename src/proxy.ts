import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * Auth model: allowlist-based.
 *
 * Every page requires a signed-in session by default. The only
 * exceptions are the paths in PUBLIC_EXACT / PUBLIC_PREFIXES —
 * auth flows themselves, the marketing homepage, legal pages,
 * token-based portals whose URL IS the credential, and the two
 * lead-capture surfaces (/request-location and /financing) the
 * funnel depends on.
 *
 * Anything not on either list is treated as "protected" and
 * unauth visitors are bounced to /login?redirect=<original>.
 * (Signed-in visitors then continue through the existing
 * placement-partner isolation / contact-on-file / email-verification
 * gates below.)
 */
const PUBLIC_EXACT = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/check-email",
  "/resend-verification",
  "/verify-email",
  "/verify-email-required",
  "/privacy-policy",
  "/eula",
  "/non-circumvention",
  "/careers",
  "/request-location",
  "/financing",
  // Root static assets.
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
  "/apple-icon.png",
  "/icon.png",
  "/logo.png",
  "/logo-vc.svg",
  "/og-image.png",
]);

const PUBLIC_PREFIXES = [
  "/auth/",                  // Supabase OAuth / email-callback landing
  "/onboarding/",            // contractor onboarding — /onboarding/{token}
  "/sign/",                  // agreement signing — /sign/{token}
  "/payroll/",               // payroll onboarding — /payroll/{token}
  "/placement/onboarding",   // placement provider self-serve intake
  "/coffee/claim",           // token-based coffee brewer claim
  "/coffee/guest-checkout",
  "/coffee/guest-track/",
  "/coffee/o/",              // public branded storefront tenant pages
  "/coffee/invite/",          // storefront enrollment landing pages
  "/api/storefront/public/",  // anonymous storefront reads (product list, tenant hero)
  "/api/storefront/enrollment/", // token-verify + consume from the invite page
  "/financing/",             // /financing/complete-application + any future step
  "/images/",
  "/fonts/",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const p of PUBLIC_PREFIXES) if (pathname.startsWith(p)) return true;
  return false;
}

/**
 * Storefront-customer chokepoint.
 *
 * Invite-created accounts (role='customer') exist ONLY to shop their
 * operator's storefront. Two things are enforced here — in middleware,
 * so EVERY way a session can come into existence (login page, OAuth
 * callback, password recovery, magic link, future providers) passes
 * through the same gate instead of each entry path carrying its own
 * per-page hook (which missed the recovery path in production):
 *
 *   1. CLAIM: a signed-in user with no storefront_tenant_id gets one
 *      claim-by-email attempt (pending invitation matched against
 *      their own email) before the lock decision is made.
 *   2. LOCK: enrolled customers (role='customer' + storefront_tenant_id,
 *      never admins/owners — those keep their platform roles) are
 *      restricted to the customer allowlist below; everything else
 *      redirects to /coffee/o/{their-slug}.
 *
 * The decision is cached in a short-lived cookie so the profile read
 * runs at most once per TTL per browser, and so the API leg (which has
 * no session client) can enforce the lock with zero DB calls. The
 * cookie only ever RESTRICTS — deleting it merely re-triggers a fresh
 * DB resolution on the next page load, and privileged APIs all carry
 * their own role guards regardless.
 */
const SF_LOCK_COOKIE = "vc_sf_lock";
const SF_LOCK_TTL_SECONDS = 600;

/** Pages an enrolled customer may load besides their (public) storefront. */
function isCustomerAllowedPage(pathname: string): boolean {
  if (pathname === "/account" || pathname.startsWith("/account/")) return true;
  if (pathname === "/complete-profile" || pathname.startsWith("/complete-profile/")) return true;
  if (pathname === "/coffee/orders" || pathname.startsWith("/coffee/orders/")) {
    return !(pathname === "/coffee/orders/admin" || pathname.startsWith("/coffee/orders/admin/"));
  }
  return false;
}

/** API families an enrolled customer's pages actually use. */
const CUSTOMER_API_PREFIXES = [
  "/api/auth/",
  "/api/storefront/",
  "/api/coffee/",
  "/api/account/",
  "/api/agreements",
];

/** Parse the lock cookie: `${uid8}.${slug}` locked / `${uid8}.-` unlocked. */
function parseLockCookie(value: string | undefined): { uidTag: string; slug: string | null } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const rest = value.slice(dot + 1);
  return { uidTag: value.slice(0, dot), slug: rest && rest !== "-" ? rest : null };
}

/**
 * CLAIM leg: one attempt at consuming a pending invitation addressed
 * to the signed-in user's own email. Reuses the existing route
 * (service-role consume + audit trail + quoted-price copy) via an
 * internal fetch so the middleware bundle stays lean. Best-effort —
 * a failure must never block navigation.
 */
async function tryClaimPendingInvite(req: NextRequest, accessToken: string | null): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch(
      new URL("/api/storefront/enrollment/claim-by-email", req.nextUrl.origin),
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Cache-miss resolution of the customer-lock state: read the profile,
 * run the claim attempt when unenrolled, and return the storefront
 * slug when (and only when) the account is a locked customer.
 */
async function resolveCustomerLockSlug(
  req: NextRequest,
  userId: string,
  accessToken: string | null,
): Promise<string | null> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const readProfile = async () => {
    const { data } = await admin
      .from("profiles")
      .select("role, storefront_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    return data as { role: string | null; storefront_tenant_id: string | null } | null;
  };
  let prof = await readProfile();
  if (prof && !prof.storefront_tenant_id && prof.role !== "admin") {
    if (await tryClaimPendingInvite(req, accessToken)) {
      // Consume links the tenant and may upgrade the role — re-read.
      prof = await readProfile();
    }
  }
  if (prof?.role !== "customer" || !prof.storefront_tenant_id) return null;
  const { data: tenant } = await admin
    .from("storefront_tenants")
    .select("slug")
    .eq("id", prof.storefront_tenant_id)
    .maybeSingle();
  return (tenant?.slug as string | undefined) || null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API leg of the storefront-customer lock. API routes were previously
  // excluded from the matcher entirely; they now flow through ONLY for
  // this check and are otherwise passed straight through (no canonical
  // redirect, no auth gate — webhooks and Bearer-auth routes keep their
  // pre-existing behavior). Browser fetches are same-origin so the lock
  // cookie rides along automatically; enforcement is cookie-only (zero
  // DB calls) and defense-in-depth on top of each route's role guards.
  if (pathname.startsWith("/api/")) {
    const lock = parseLockCookie(req.cookies.get(SF_LOCK_COOKIE)?.value);
    if (lock?.slug && !CUSTOMER_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
      return NextResponse.json(
        {
          error: "This account only has access to its coffee storefront",
          code: "CUSTOMER_RESTRICTED",
          redirect: `/coffee/o/${lock.slug}`,
        },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  // Enforce canonical domain — redirect Vercel preview URLs to vendingconnector.com
  const host = req.headers.get("host") || "";
  const canonicalDomain = "vendingconnector.com";
  if (
    process.env.NODE_ENV === "production" &&
    host !== canonicalDomain &&
    host !== `www.${canonicalDomain}` &&
    !host.startsWith("localhost")
  ) {
    const url = new URL(req.url);
    url.hostname = canonicalDomain;
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url, 301);
  }

  // Redirect authenticated users away from auth pages
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // Allowlist-based auth gate. Anything NOT on the public list is
  // protected. Auth pages also flow through so we can bounce
  // signed-in visitors back to /dashboard.
  const isProtected = !isPublicPath(pathname);
  if (!isProtected && !isAuthPage) return NextResponse.next();

  // Create a Supabase server client that reads/writes cookies on the request/response
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Write cookies to the request (for downstream server components)
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          // Also write cookies to the response (for the browser)
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — this also sets updated cookies if the token was refreshed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    const res = NextResponse.redirect(loginUrl);
    // Signed out — drop any stale lock cookie so it can't 403 the next
    // account's API calls (the API leg can't verify which user it was
    // stamped for).
    res.cookies.delete(SF_LOCK_COOKIE);
    return res;
  }

  // ---- Storefront-customer chokepoint (see doc above the helpers) ----
  // Resolve the customer-lock state for EVERY signed-in page request:
  // cookie cache first, DB on miss — and, on miss, one centralized
  // claim-by-email attempt so any session-creation path (login,
  // callback, password recovery, magic link) enrolls a pending invite
  // without needing its own hook.
  let customerLockSlug: string | null = null;
  let lockCookieToSet: string | null = null;
  if (user) {
    const uidTag = user.id.slice(0, 8);
    const cached = parseLockCookie(req.cookies.get(SF_LOCK_COOKIE)?.value);
    if (cached && cached.uidTag === uidTag) {
      customerLockSlug = cached.slug;
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      customerLockSlug = await resolveCustomerLockSlug(
        req,
        user.id,
        session?.access_token ?? null,
      );
      lockCookieToSet = `${uidTag}.${customerLockSlug ?? "-"}`;
    }
  }
  // Every response that leaves after this point carries the (re)stamped
  // cache cookie when one was resolved this request.
  const stampLock = (res: NextResponse): NextResponse => {
    if (lockCookieToSet) {
      res.cookies.set(SF_LOCK_COOKIE, lockCookieToSet, {
        path: "/",
        maxAge: SF_LOCK_TTL_SECONDS,
        sameSite: "lax",
        httpOnly: true,
      });
    }
    return res;
  };

  if (isAuthPage && user) {
    const dashboardUrl = req.nextUrl.clone();
    // Locked customers land on their storefront, never the platform
    // dashboard.
    dashboardUrl.pathname = customerLockSlug
      ? `/coffee/o/${customerLockSlug}`
      : "/dashboard";
    dashboardUrl.search = "";
    return stampLock(NextResponse.redirect(dashboardUrl));
  }

  // LOCK: enrolled customers only get the customer allowlist. Their
  // storefront itself (/coffee/o/…) is a public path and never reaches
  // here; everything else on the platform bounces to it.
  if (customerLockSlug && isProtected && !isCustomerAllowedPage(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/coffee/o/${customerLockSlug}`;
    url.search = "";
    return stampLock(NextResponse.redirect(url));
  }

  // Placement Partner isolation: block them from CRM/admin/account pages.
  // Their entire experience lives under /marketplace. Keeps team-agent
  // accounts from stumbling into internal sales tools.
  if (user) {
    const meta = { ...(user.user_metadata || {}), ...(user.app_metadata || {}) } as Record<string, unknown>;
    // Cheap fast-path: check metadata role first to avoid DB call on every hit.
    const isMaybePartner = meta.role === "placement_partner";
    if (isMaybePartner) {
      const CRM_LOCKED = ["/sales", "/admin", "/crm", "/coffee/orders/admin"];
      const isLocked = CRM_LOCKED.some((p) => pathname === p || pathname.startsWith(p + "/"));
      if (isLocked) {
        const url = req.nextUrl.clone();
        url.pathname = "/placement";
        url.search = "";
        return stampLock(NextResponse.redirect(url));
      }
    }
  }

  // Contact-on-file gate for protected routes. Every account must have a
  // phone number AND a full mailing address (street/city/state/zip) — signup
  // enforces this going forward, but legacy accounts might be missing one.
  // Fast path: check user_metadata / app_metadata (populated at signup + on
  // PATCH /api/auth/me). Slow path: fall back to a service-role profiles
  // read for accounts created before this gate — prevents an infinite
  // redirect loop when the DB row is fine but auth metadata hasn't caught up.
  //
  // Skip this gate entirely when the user is already on /complete-profile
  // (or its subpaths) — otherwise a fresh OAuth signup with no address on
  // file gets redirected to /complete-profile, then the gate fires again
  // and bounces to /complete-profile, and the browser gives up with
  // ERR_TOO_MANY_REDIRECTS. The /complete-profile page itself already
  // redirects unauthenticated visitors to /login.
  const isCompleteProfilePath = pathname === "/complete-profile" || pathname.startsWith("/complete-profile/");
  if (user && isProtected && !isCompleteProfilePath) {
    const meta = { ...(user.user_metadata || {}), ...(user.app_metadata || {}) } as Record<string, unknown>;
    const readField = (k: string): string => typeof meta[k] === "string" ? (meta[k] as string).trim() : "";
    let phone = readField("phone");
    let address = readField("address");
    let city = readField("city");
    let state = readField("state");
    let zip = readField("zip");

    let isStorefrontCustomer = false;
    if (!phone || !address || !city || !state || !zip) {
      // Fallback uses service role — the user's own session may or may not
      // have a SELECT policy on profiles depending on project setup, and a
      // missing policy would silently return no rows and trap the user in a
      // /complete-profile ↔ /dashboard redirect loop even after they saved
      // their info. Service role bypasses RLS so this is reliable.
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: profile } = await admin
        .from("profiles")
        .select("phone, address, city, state, zip, role, storefront_tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      const pick = (v: unknown): string => typeof v === "string" ? v.trim() : "";
      phone = phone || pick(profile?.phone);
      address = address || pick(profile?.address);
      city = city || pick(profile?.city);
      state = state || pick(profile?.state);
      zip = zip || pick(profile?.zip);
      // Storefront customers (invited shoppers of an operator's
      // storefront) are exempt from the contact-on-file gate —
      // shipping/billing is collected at checkout, and parking them
      // on /complete-profile blocks them from the shop they were
      // invited to.
      isStorefrontCustomer =
        profile?.role === "customer" || !!profile?.storefront_tenant_id;
    }

    if ((!phone || !address || !city || !state || !zip) && !isStorefrontCustomer) {
      const completeUrl = req.nextUrl.clone();
      completeUrl.pathname = "/complete-profile";
      completeUrl.search = "";
      return stampLock(NextResponse.redirect(completeUrl));
    }
  }

  // Email verification gate for protected routes.
  // We trust OAuth users (Google/Microsoft/Yahoo) automatically — the provider
  // already verified the address, even if email_confirmed_at isn't set on the
  // user row (existing Yahoo users from before today's deploy may not have it).
  if (user && isProtected && !user.email_confirmed_at) {
    const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
    const userMeta = (user.user_metadata || {}) as Record<string, unknown>;
    const providers: string[] = [];
    if (typeof appMeta.provider === "string") providers.push(appMeta.provider);
    if (Array.isArray(appMeta.providers)) {
      for (const p of appMeta.providers) {
        if (typeof p === "string") providers.push(p);
      }
    }
    if (typeof userMeta.provider === "string") providers.push(userMeta.provider);
    const isOAuthUser = providers.some((p) =>
      ["google", "azure", "yahoo", "microsoft"].includes(p.toLowerCase()),
    );
    if (!isOAuthUser) {
      const verifyUrl = req.nextUrl.clone();
      verifyUrl.pathname = "/verify-email-required";
      verifyUrl.search = "";
      return stampLock(NextResponse.redirect(verifyUrl));
    }
  }

  return stampLock(response);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     * API routes ARE matched (for the storefront-customer lock's API
     * leg) but short-circuit at the top of proxy() — no auth gate or
     * canonical-domain redirect applies to them.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
