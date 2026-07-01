import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Routes that require an authenticated session.
 * Unauthenticated visitors are redirected to /login.
 */
const PROTECTED_PATHS = [
  "/dashboard",
  "/post-request",
  "/post-route",
  "/listings/new",
  "/routes-for-sale",
  "/your-leads",
  "/admin",
  "/account",
  "/saved-requests",
  "/sales",
  "/financing",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

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

  // Only check protected paths (and auth pages for reverse redirect)
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  ) || /^\/machines-for-sale\/[^/]+\/checkout/.test(pathname);
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

  if (isAuthPage && user) {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  if (!user && isProtected) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
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
        return NextResponse.redirect(url);
      }
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
      return NextResponse.redirect(verifyUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/).*)",
  ],
};
