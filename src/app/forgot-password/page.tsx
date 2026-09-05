import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import ForgotPasswordClient from "./ForgotPasswordClient";

/**
 * Server-resolve the operator brand so the reset-request screen (and
 * the reset link it emails) carry the storefront's identity. Falls
 * back to generic Vending Connector chrome when no context resolves.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <ForgotPasswordClient initialBrand={brand} />;
}
