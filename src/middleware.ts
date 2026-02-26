import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Routes that require an authenticated session.
 * Unauthenticated visitors are redirected to /login.
 */
const PROTECTED_PATHS = [
  "/dashboard",
  "/browse-requests",
  "/browse-operators",
  "/post-request",
  "/listings/new",
  "/messages",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only check protected paths
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!isProtected) return NextResponse.next();

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

  if (!user) {
    // Redirect to login with a return-to URL so they come back after auth
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/browse-requests/:path*",
    "/browse-operators/:path*",
    "/post-request/:path*",
    "/listings/new/:path*",
    "/messages/:path*",
  ],
};
