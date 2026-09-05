import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import CheckEmailClient from "./CheckEmailClient";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <CheckEmailClient initialBrand={brand} />;
}
