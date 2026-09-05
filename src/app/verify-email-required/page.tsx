import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import VerifyEmailRequiredClient from "./VerifyEmailRequiredClient";

/**
 * Server-resolve the operator brand (from ?storefront= or the durable
 * vc_sf_ctx cookie) so an invited customer who's bounced here to
 * verify sees their operator's identity instead of a generic
 * "part of Vending Connector" message.
 */
export default async function VerifyEmailRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <VerifyEmailRequiredClient initialBrand={brand} />;
}
