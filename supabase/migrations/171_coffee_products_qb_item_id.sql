-- Storefront: cache QBO Item id on coffee_products.
--
-- The storefront QB helpers write coffee_products.qb_item_id after
-- the first Invoice / SalesReceipt so subsequent orders point at
-- the same QBO catalog item. Without this cache, we'd search-and-
-- maybe-create on every checkout, which multiplies API calls and
-- creates a race window where two concurrent orders each create
-- their own Item and QBO's unique-name constraint 6240s one of them.
--
-- Nullable — items get populated lazily; a product that has never
-- been sold through the storefront has qb_item_id = NULL and the
-- helper will create + cache on first use.

ALTER TABLE public.coffee_products
  ADD COLUMN IF NOT EXISTS qb_item_id text;

COMMENT ON COLUMN public.coffee_products.qb_item_id IS
  'QuickBooks Online Item catalog id, cached by the storefront helper to keep invoices/receipts pointed at a single catalog row per product.';

CREATE INDEX IF NOT EXISTS idx_coffee_products_qb_item_id
  ON public.coffee_products(qb_item_id)
  WHERE qb_item_id IS NOT NULL;
