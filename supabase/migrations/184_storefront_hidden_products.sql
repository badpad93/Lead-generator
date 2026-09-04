-- 184: per-tenant product visibility for coffee storefronts.
--
-- Storefront owners can hide catalog items from THEIR storefront
-- without affecting the main marketplace or any other tenant. A row
-- here means "this product does not exist" for that tenant's public
-- page, price list, quote, and checkout.
--
-- Service-role access only (same posture as the other storefront
-- tables): RLS is enabled with no policies, so anon/authenticated
-- clients can't read or write it directly — every path goes through
-- the owner-authenticated API routes.

CREATE TABLE IF NOT EXISTS public.storefront_tenant_hidden_products (
  tenant_id  uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.coffee_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_id)
);

ALTER TABLE public.storefront_tenant_hidden_products ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.storefront_tenant_hidden_products IS
  'Products a storefront owner has hidden from their own storefront. Presence of a row = hidden for that tenant.';
