-- Add role column so each time entry records the user's role at clock-in time
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS role TEXT;

-- Backfill role from profiles for existing entries
UPDATE public.time_entries te
SET role = p.role
FROM public.profiles p
WHERE te.user_id = p.id AND te.role IS NULL;

-- Add total_hours as a generated column (hours as decimal, e.g. 1.5 = 1h30m)
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS total_hours NUMERIC(6,2) GENERATED ALWAYS AS (
  CASE WHEN clock_out IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0, 2)
    ELSE NULL
  END
) STORED;
