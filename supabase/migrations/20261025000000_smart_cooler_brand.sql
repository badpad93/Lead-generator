-- AI Vending Brands now group the Smart Coolers inventory (the AI coolers),
-- not marketplace machine_listings. A cooler is assigned to a brand via
-- smart_cooler_machines.brand_id; the brand lineup shows its coolers.

ALTER TABLE public.smart_cooler_machines
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.vending_brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_smart_cooler_machines_brand ON public.smart_cooler_machines (brand_id);

NOTIFY pgrst, 'reload schema';
