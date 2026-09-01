import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantBySlug } from "@/lib/storefront/tenants";

/**
 * Public storefront read — the anonymous /coffee/o/[slug] page hits
 * this to render tenant brand + catalog. Returns only fields safe to
 * show to a signed-out visitor. Non-approved tenants return 404 so a
 * suspended storefront cannot be enumerated.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.status !== "approved") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: products } = await supabaseAdmin
    .from("coffee_products")
    .select("id, name, slug, sku, description, price, image_url, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      display_name: tenant.display_name,
      legal_name: tenant.legal_name,
      support_email: tenant.support_email,
      brand: tenant.brand,
      public_page: tenant.public_page,
    },
    products: products ?? [],
  });
}
