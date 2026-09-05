import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import CallbackClient from "./CallbackClient";

/**
 * Server-resolve the operator brand so the OAuth/email interstitial
 * ("Signing you in…") is operator-branded from first paint. The login
 * OAuth start carries ?storefront=; the durable vc_sf_ctx cookie and a
 * stashed invite token back it up for the signup/invite paths.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <CallbackClient initialBrand={brand} />;
}
