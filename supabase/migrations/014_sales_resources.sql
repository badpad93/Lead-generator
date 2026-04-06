-- Sales resources library: marketing PDFs, guides, agreements, etc.
CREATE TABLE IF NOT EXISTS public.sales_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('marketing', 'guide', 'agreement', 'pricing', 'training', 'other')),
  file_url text NOT NULL,
  file_name text,
  file_size integer,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_resources_category ON public.sales_resources(category);

ALTER TABLE public.sales_resources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_resources') THEN
    CREATE POLICY service_role_sales_resources ON public.sales_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
