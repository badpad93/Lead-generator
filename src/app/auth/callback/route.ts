import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * GET /auth/callback
 *
 * Server-side OAuth / magic-link callback handler.  Supabase redirects
 * here with ?code=<authz_code>&flow=<login|signup>.  We exchange the
 * code for a session entirely on the server so that:
 *   1. There is no race with the SSR browser-client's auto-detection
 *      of the code param (the client singleton's `detectSessionInUrl`
 *      fires only after hydration, which is too late — we've already
 *      consumed the code here).
 *   2. Cookies are set atomically on the HTTP response, so the
 *      middleware will always see the session on the very next request.
 *
 * IMPORTANT — cookie-option preservation:
 *   The Supabase auth cookies MUST keep their original options
 *   (Path=/, HttpOnly, Secure, SameSite) so that the browser sends
 *   them on every subsequent request.  If we built the redirect
 *   response separately and then copied cookies with
 *   `set(name, value)` we would lose those options and the cookies
 *   would default to `Path=/auth/callback`, which means
 *   `/dashboard` requests would have no auth cookies, the middleware
 *   would bounce the user back to /login, and the user would
 *   appear to need to log in twice.
 *
 *   To avoid that, we build the final redirect response up-front and
 *   let Supabase's `setAll` callback write its cookies directly onto
 *   that response with their full options intact.
 *
 * After a successful exchange we redirect to a thin client page
 * (/auth/complete) that handles localStorage-dependent operations
 * (signup-role PATCH, stored redirect path).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const code = url.searchParams.get("code");
  const flow = url.searchParams.get("flow") || "login";

  // If there's no code, send the user back to login.
  if (!code) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Build the success-redirect response up-front.  Supabase will
  // write its session cookies (with full Path/HttpOnly/Secure/SameSite
  // options) directly onto this response via the setAll callback.
  const successUrl = new URL("/auth/complete", req.url);
  successUrl.searchParams.set("flow", flow);
  const response = NextResponse.redirect(successUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Exchange the one-time code for a session.  On success the
  // `setAll` callback above writes the session cookies onto `response`
  // with their original options preserved.
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Exchange failed — send them to login.  We also need to forward
    // any cookies Supabase wrote (e.g. clearing stale cookies) onto
    // the error response, again preserving full options.
    const errorUrl = new URL("/login", req.url);
    const errorResponse = NextResponse.redirect(errorUrl);
    response.cookies.getAll().forEach((c) => {
      // Pass the whole ResponseCookie object so Path/HttpOnly/Secure/
      // SameSite/Expires/Max-Age are all preserved.
      errorResponse.cookies.set(c);
    });
    return errorResponse;
  }

  return response;
}
