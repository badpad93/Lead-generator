-- Add lead generator metadata columns to call_lists
ALTER TABLE public.sales_call_lists
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS lead_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS radius integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'generating', 'active', 'completed', 'paused', 'failed'));

-- Update existing rows to have a valid status
UPDATE public.sales_call_lists SET status = 'active' WHERE status IS NULL OR status = 'new';
