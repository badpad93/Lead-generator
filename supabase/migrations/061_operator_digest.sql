-- Add digest email preferences to operator profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS digest_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_frequency text NOT NULL DEFAULT 'weekly'
    CHECK (digest_frequency IN ('daily', 'weekly', 'never')),
  ADD COLUMN IF NOT EXISTS digest_last_sent_at timestamptz;

-- Track which leads have been sent to which operators so we don't repeat
CREATE TABLE IF NOT EXISTS public.operator_digest_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.vending_requests(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operator_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_digest_log_operator
  ON public.operator_digest_log(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_digest_log_sent
  ON public.operator_digest_log(sent_at);
