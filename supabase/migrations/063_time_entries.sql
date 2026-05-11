-- Time tracking for internal staff (sales, market_leader, director_of_sales)
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN clock_out IS NOT NULL
      THEN EXTRACT(EPOCH FROM (clock_out - clock_in))::integer / 60
      ELSE NULL
    END
  ) STORED,
  notes TEXT,
  admin_edited BOOLEAN NOT NULL DEFAULT false,
  edited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON public.time_entries(clock_in);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON public.time_entries(user_id, clock_in DESC);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Service role (used by the API) needs full access
CREATE POLICY "service_role_full_access_time_entries"
  ON public.time_entries FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE TRIGGER time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
