import type { Metadata } from "next";
import { cookies } from "next/headers";
import { resolveAuthBrand } from "@/lib/storefrontAuthContext";
import LoginClient from "./LoginClient";

/**
 * Server component: resolve the operator brand (from ?storefront=,
 * the durable vc_sf_ctx cookie, or a stashed invite) BEFORE render so
 * an invited coffee customer sees their operator's sign-in on first
 * paint and after a login bounce that dropped the slug. The brand is
 * seeded into the client island; the sign-in flow itself is unchanged.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}): Promise<Metadata> {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  if (brand) {
    return {
      title: `Sign in to ${brand.display_name}`,
      description: `Sign in to order coffee and supplies from ${brand.display_name}.`,
      alternates: { canonical: "/login" },
    };
  }
  return {
    title: "Sign In",
    description: "Sign in to your Vending Connector account.",
    alternates: { canonical: "/login" },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ storefront?: string }>;
}) {
  const { storefront } = await searchParams;
  const cookieStore = await cookies();
  const brand = await resolveAuthBrand({ paramSlug: storefront ?? null, cookies: cookieStore });
  return <LoginClient initialBrand={brand} />;
}
