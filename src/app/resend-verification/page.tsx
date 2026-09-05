import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import ResendClient from "./ResendClient";

export default async function ResendVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <ResendClient initialBrand={brand} />;
}
