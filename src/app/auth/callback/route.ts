import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * GET /auth/callback
 *
 * Server-side OAuth callback handler.  Supabase redirects here with
 * ?code=<authz_code>&flow=<login|signup>.  We exchange the code for a
 * session entirely on the server so that:
 *   1. There is no race with the SSR browser-client's auto-detection
 *      of the code param (the client singleton's `detectSessionInUrl`
 *      fires only after hydration, which is too late — we've already
 *      consumed the code here).
 *   2. Cookies are set atomically on the HTTP response, so the
 *      middleware will always see the session on the very next request.
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
    url.pathname = "/login";
    url.searchParams.delete("code");
    url.searchParams.delete("flow");
    return NextResponse.redirect(url);
  }

  // Build a Supabase server client that reads/writes cookies on the
  // request → response pair, exactly like the middleware does.
  let response = NextResponse.next({ request: req });

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
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Exchange the one-time code for a session.  On success the
  // `setAll` callback above writes the session cookies onto `response`.
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // Build the redirect destination.
  const dest = url.clone();
  dest.searchParams.delete("code");

  if (error) {
    // Exchange failed — send them to login with an error hint.
    dest.pathname = "/login";
    dest.searchParams.delete("flow");
    return NextResponse.redirect(dest);
  }

  // Redirect to the lightweight client page that handles signup-role
  // assignment and the localStorage-stored redirect path.
  dest.pathname = "/auth/complete";
  dest.searchParams.set("flow", flow);

  // We need the cookies from the exchange on the redirect response,
  // so copy them onto a redirect response.
  const redirect = NextResponse.redirect(dest);
  response.cookies.getAll().forEach((c) => {
    redirect.cookies.set(c.name, c.value);
  });

  return redirect;
}
