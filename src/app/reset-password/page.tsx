import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import ResetPasswordClient from "./ResetPasswordClient";

/**
 * Server-resolve the operator brand so the password-reset screen the
 * email lands on wears the same storefront identity as the request
 * that produced it (the reset link carries ?storefront=, and the
 * durable vc_sf_ctx cookie backs it up).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <ResetPasswordClient initialBrand={brand} />;
}
