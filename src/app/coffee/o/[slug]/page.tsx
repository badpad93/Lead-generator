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
  stock_status: string | null;
  unit: string | null;
  min_order_qty: number | null;
  category_id: string | null;
  category_ids: string[];
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
    .select(
      "id, name, sku, description, price, image_url, active, sort_order, stock_status, unit, min_order_qty, category_id",
    )
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (productsRes.error) {
    console.error(
      `[storefront/${slug}] coffee_products select failed:`,
      productsRes.error,
    );
  }
  const allProducts = (productsRes.data ?? []) as Array<Omit<Product, "category_ids">>;

  // Owner-curated catalog: products the storefront owner hid are
  // filtered server-side so they never reach the browser at all.
  const { getHiddenProductIds } = await import("@/lib/storefront/visibility");
  const hiddenIds = await getHiddenProductIds(tenant.id);
  const rawProducts = allProducts.filter((p) => !hiddenIds.has(p.id));

  // Categories + m2m memberships — same data the main coffee
  // marketplace filters on, so the tenant storefront can offer the
  // identical category pill bar. Junction fetch is best-effort
  // (mirrors /api/coffee/products): a missing junction table falls
  // back to the legacy single category_id per product.
  const categoriesRes = await supabaseAdmin
    .from("coffee_categories")
    .select("id, name, slug, sort_order")
    .order("sort_order", { ascending: true });
  const categories = (categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
  }>;

  const categoryIdsByProduct = new Map<string, string[]>();
  if (rawProducts.length > 0) {
    const { data: junctionRows } = await supabaseAdmin
      .from("coffee_product_categories")
      .select("product_id, category_id")
      .in("product_id", rawProducts.map((p) => p.id));
    for (const row of (junctionRows ?? []) as Array<{ product_id: string; category_id: string }>) {
      const list = categoryIdsByProduct.get(row.product_id) ?? [];
      list.push(row.category_id);
      categoryIdsByProduct.set(row.product_id, list);
    }
  }
  const products: Product[] = rawProducts.map((p) => {
    const linked = categoryIdsByProduct.get(p.id) ?? [];
    return {
      ...p,
      category_ids: linked.length > 0 ? linked : p.category_id ? [p.category_id] : [],
    };
  });

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
                href={`/login?storefront=${encodeURIComponent(tenant.slug)}&redirect=${encodeURIComponent(`/coffee/o/${tenant.slug}`)}`}
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
        {/* One shop component for both audiences — enrolled
            customers get live tenant pricing + cart + checkout;
            everyone else browses the identical catalog (same
            category pills, search, grid, product modal as the main
            coffee marketplace) with "Sign in to see your price"
            in place of the price + qty controls. */}
        <CustomerShop
          tenantId={tenant.id}
          tenantSlug={tenant.slug}
          products={products}
          categories={categories}
          enrolled={isEnrolled}
          primary={primary}
          accent={accent}
        />
        {products.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            No products available.
          </div>
        ) : null}
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
