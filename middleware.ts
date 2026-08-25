import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Site-wide auth gate.
 *
 * Requires a signed-in Supabase session for every page on the site
 * except the small PUBLIC_ALLOWLIST below (auth flows, legal, the
 * marketing homepage, and token-based portals that carry their own
 * per-URL auth). Unauth visitors hitting a gated page are bounced
 * to /login with a ?next=<original> param so post-login redirects
 * land them back where they started.
 *
 * Public allowlist rules of thumb
 *   * Auth flows and password recovery — mandatory (else you can't
 *     sign in to unlock the site).
 *   * Legal pages — public so link references and disclosures work.
 *   * Token-based portals — the URL itself is the credential
 *     (contractor onboarding, agreement signing, coffee claim,
 *     placement partner onboarding, guest coffee checkout).
 *   * Homepage `/` — so unauth visitors can see what they'd be
 *     signing up for. Everything downstream is gated.
 *
 * Anything not on this list, and not an /_next/*, /api/*, or
 * static-asset path, requires a session.
 */

// Exact-match public paths.
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
  // Public lead-capture / marketing pages the funnel depends on.
  // Operators land here from marketing before signing up.
  "/request-location",
  "/financing",
  // Common static files that live at the root.
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

// Prefix-matched public paths. Anything starting with one of these
// is served without an auth check. Token portals carry their own
// per-URL credential and are safe to leave public.
const PUBLIC_PREFIXES = [
  "/auth/",              // Supabase OAuth / email-callback landing
  "/onboarding/",        // contractor onboarding — /onboarding/{token}
  "/sign/",              // agreement signing — /sign/{token}
  "/placement/onboarding", // placement provider onboarding (self-serve intake)
  "/coffee/claim",       // token-based coffee brewer claim
  "/coffee/guest-checkout",
  "/coffee/guest-track/",
  // /financing/complete-application and any future /financing/*
  // subroute — keep the whole namespace public so the follow-up
  // steps in the funnel don't hit the auth wall.
  "/financing/",
  "/images/",
  "/fonts/",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const p of PUBLIC_PREFIXES) if (pathname.startsWith(p)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Compose a response we can mutate cookies on — supabase/ssr needs
  // this to refresh the session cookie in place.
  const res = NextResponse.next({ request: { headers: req.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // If env is missing (e.g. preview build without secrets), don't
  // hard-fail the request — let it through. Server-side route
  // handlers still enforce auth, so the site isn't leaked here.
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in visitors hitting /login or /signup jump straight to
  // the dashboard — mirrors the existing HomePageClient behavior
  // (which auto-redirects logged-in visitors to /dashboard).
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const to = req.nextUrl.clone();
    to.pathname = "/dashboard";
    to.search = "";
    return NextResponse.redirect(to);
  }

  if (user) return res;
  if (isPublicPath(pathname)) return res;

  // Not signed in and hitting a gated page — bounce to login and
  // preserve where they were trying to go. Uses `?redirect=` to
  // match the login page's existing round-trip handler
  // (src/app/login/page.tsx already reads searchParams.get("redirect")).
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  const back = pathname + (req.nextUrl.search || "");
  login.search = `?redirect=${encodeURIComponent(back)}`;
  return NextResponse.redirect(login);
}

/**
 * Skip static assets and API routes at the matcher level so the
 * middleware never runs for them. Everything else falls through to
 * the handler above, which decides based on PUBLIC_ALLOWLIST.
 *
 * The exclusion list matches Next's own recommended pattern —
 * /_next/static, /_next/image, /_next/data, plus common static
 * file extensions.
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|woff|woff2|ttf|eot|map|pdf|xml)$).*)",
  ],
};
