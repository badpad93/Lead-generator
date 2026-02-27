import { createMiddlewareClient } from "@/lib/supabaseMiddleware";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = ["/dashboard", "/messages", "/post-request", "/listings/new", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) {
    return;
  }

  const { supabase, response } = createMiddlewareClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return Response.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/messages/:path*", "/post-request/:path*", "/listings/new/:path*", "/admin", "/admin/:path*"],
};
