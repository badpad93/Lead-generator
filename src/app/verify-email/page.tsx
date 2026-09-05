import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import VerifyEmailClient from "./VerifyEmailClient";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <VerifyEmailClient initialBrand={brand} />;
}
