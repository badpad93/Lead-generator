import { cookies } from "next/headers";
import { resolveSignupBrand } from "@/lib/storefrontAuthContext";
import SignupClient from "./SignupClient";

/**
 * Server-resolve the operator brand before render so an invited coffee
 * customer sees their operator's signup on first paint. Signup's entry
 * point is ?invite_token= (not ?storefront=), so the token drives the
 * brand; ?storefront= and the durable vc_sf_ctx cookie back it up.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite_token?: string; storefront?: string }>;
}) {
  const { invite_token, storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveSignupBrand({
    inviteToken: invite_token ?? null,
    paramSlug: storefront ?? null,
    cookies: cookieStore,
  });
  return <SignupClient initialBrand={brand} />;
}
