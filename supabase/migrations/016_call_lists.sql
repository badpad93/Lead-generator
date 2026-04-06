-- Call lists: Google Sheets / Excel links assigned to sales reps
CREATE TABLE IF NOT EXISTS public.sales_call_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('locations', 'operators')),
  sheet_url text,
  file_url text,
  file_name text,
  assigned_to uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_lists_category ON public.sales_call_lists(category);
CREATE INDEX IF NOT EXISTS idx_call_lists_assigned ON public.sales_call_lists(assigned_to);

ALTER TABLE public.sales_call_lists ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_call_lists') THEN
    CREATE POLICY service_role_call_lists ON public.sales_call_lists FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
