import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveTenantBySlug } from "@/lib/storefront/tenants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";
import CustomerShop from "./CustomerShop";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function sessionContext(
  tenantId: string,
): Promise<{ signedIn: boolean; isEnrolled: boolean }> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { signedIn: false, isEnrolled: false };
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("storefront_tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    const isEnrolled =
      (profileRow as { storefront_tenant_id: string | null } | null)?.storefront_tenant_id ===
      tenantId;
    return { signedIn: true, isEnrolled };
  } catch {
    return { signedIn: false, isEnrolled: false };
  }
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!(await isStorefrontFlagEnabled("storefront.public_pages_enabled"))) {
    return { title: "Storefront" };
  }
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.status !== "approved") return { title: "Storefront" };
  return {
    title: `${tenant.display_name} — Coffee`,
    description: (tenant.brand?.hero_subheadline as string | null | undefined) ??
      `Order coffee, cups, and vending supplies from ${tenant.display_name}.`,
  };
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Kill switch — indistinguishable from tenant-not-found so a
  // disabled storefront cannot be enumerated via the public URL.
  if (!(await isStorefrontFlagEnabled("storefront.public_pages_enabled"))) notFound();
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.status !== "approved") notFound();

  // Deliberately NOT destructuring `data` alone here anymore — the
  // previous shape silently swallowed Postgres errors and rendered
  // "No products available." A missing column (like the earlier
  // `slug` reference against a coffee_products schema that has
  // never had one) surfaced as an empty catalog with no signal.
  // Log the error server-side so operator/admin log tailing catches
  // the class of bug next time.
  const productsRes = await supabaseAdmin
    .from("coffee_products")
    .select("id, name, sku, description, price, image_url, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (productsRes.error) {
    console.error(
      `[storefront/${slug}] coffee_products select failed:`,
      productsRes.error,
    );
  }
  const products = (productsRes.data ?? []) as Product[];

  const { signedIn, isEnrolled } = await sessionContext(tenant.id);

  const brand = tenant.brand ?? {};
  const publicPage = tenant.public_page ?? {};
  const primary = (brand.primary_color as string) || "#1a1a1a";
  const accent = (brand.accent_color as string) || "#c4a877";
  const text = (brand.text_color as string) || "#f4f0e8";

  return (
    <div className="min-h-screen" style={{ background: "#f6f4ef", color: "#111" }}>
      <header
        className="w-full py-12 px-6"
        style={{ background: primary, color: text }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {brand.logo_url ? (
              <img
                src={brand.logo_url as string}
                alt={`${tenant.display_name} logo`}
                className="h-12 w-auto"
              />
            ) : (
              <div className="h-12 w-12 rounded-full" style={{ background: accent }} />
            )}
            <div>
              <div className="text-xl font-semibold">{tenant.display_name}</div>
              <div className="text-xs opacity-70">Powered by Vending Connector</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {publicPage.show_contact && tenant.support_email ? (
              <a
                href={`mailto:${tenant.support_email}`}
                className="opacity-90 hover:opacity-100"
              >
                Contact
              </a>
            ) : null}
            {/* "Sign in to order" is for anonymous visitors only.
                Signed-in customers already see the shop below (or a
                request-invitation nudge if they're not enrolled). */}
            {!signedIn ? (
              <Link
                href="/login"
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{ background: accent, color: primary }}
              >
                Sign in to order
              </Link>
            ) : null}
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-10">
          <h1 className="text-4xl md:text-5xl font-semibold" style={{ color: accent }}>
            {(brand.hero_headline as string) ?? `Coffee from ${tenant.display_name}`}
          </h1>
          {brand.hero_subheadline ? (
            <p className="mt-3 max-w-2xl text-lg opacity-90">
              {brand.hero_subheadline as string}
            </p>
          ) : null}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {publicPage.catalog_intro ? (
          <p className="mb-6 text-sm text-gray-700 max-w-3xl">
            {publicPage.catalog_intro as string}
          </p>
        ) : null}
        {isEnrolled ? (
          <CustomerShop
            tenantId={tenant.id}
            tenantSlug={tenant.slug}
            products={products}
            primary={primary}
            accent={accent}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg overflow-hidden border border-gray-200 bg-white flex flex-col"
                >
                  {p.image_url ? (
                    <div className="w-full aspect-square bg-white flex items-center justify-center p-3">
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                      No image
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">
                      {p.sku}
                    </div>
                    <div className="font-semibold text-gray-900">{p.name}</div>
                    {p.description ? (
                      <div className="mt-1 text-sm text-gray-600 flex-1">
                        {p.description}
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}
                    <div className="mt-3 text-sm text-gray-500">
                      Sign in to see your price
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {products.length === 0 ? (
              <div className="text-center text-gray-500 py-16">
                No products available.
              </div>
            ) : null}
          </>
        )}
      </main>

      <footer
        className="w-full py-8 px-6 mt-16 text-sm"
        style={{ background: primary, color: text, opacity: 0.9 }}
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            © {new Date().getFullYear()} {tenant.legal_name}. All rights reserved.
            {brand.footer_note ? (
              <div className="opacity-75 mt-1">{brand.footer_note as string}</div>
            ) : null}
          </div>
          <div className="opacity-80">
            Orders fulfilled by Vending Connector. Payments processed via
            QuickBooks Payments.
          </div>
        </div>
      </footer>
    </div>
  );
}
