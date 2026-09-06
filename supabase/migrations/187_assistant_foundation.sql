-- 187_assistant_foundation.sql
--
-- Phase 1 of the AI Commerce Assistant: conversation persistence only.
-- Three tables (threads, messages, tool runs) plus three feature-flag
-- rows, all seeded OFF. No commerce, CRM, quote, cart, order, agreement,
-- QuickBooks, Stripe, Resend, financing, or workflow table is touched.
--
-- Access model
--   * The application writes through the service role only.
--   * Authenticated users may SELECT their own threads and messages.
--   * Guests never touch PostgREST: their thread is reached only through
--     the server API after the guest-token hash is verified.
--   * Tool runs are service-role only (operational audit).
--   * No PUBLIC policies. Every policy names its role explicitly.

-- ─── assistant_threads ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- SHA-256 hex of the guest bearer token; the raw token lives only in
  -- the visitor's httpOnly cookie. Unique so one token owns one thread.
  guest_token_hash      text UNIQUE,
  storefront_tenant_id  uuid REFERENCES public.storefront_tenants(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','closed')),
  title                 text,
  prompt_version        text NOT NULL,
  last_activity_at      timestamptz NOT NULL DEFAULT now(),
  -- Single-writer lock: one streaming response per thread at a time.
  active_run_id         uuid,
  active_run_started_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_threads_owner_ck
    CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL)
);

COMMENT ON TABLE public.assistant_threads IS
  'AI assistant conversations. Owned by a profile (user_id) or by a guest token hash. Service-role writes; owner SELECT only.';

CREATE INDEX IF NOT EXISTS assistant_threads_user_recent_idx
  ON public.assistant_threads (user_id, last_activity_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assistant_threads_recent_idx
  ON public.assistant_threads (last_activity_at DESC);

-- ─── assistant_messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           uuid NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('user','assistant')),
  -- Public conversational text only. Never reasoning or chain-of-thought.
  content             text NOT NULL DEFAULT '',
  -- Structured UI blocks (product cards, comparisons, status) rendered
  -- alongside the text. Always an array.
  blocks              jsonb NOT NULL DEFAULT '[]'::jsonb,
  openai_response_id  text,
  model               text,
  prompt_version      text NOT NULL,
  input_tokens        integer,
  output_tokens       integer,
  interrupted         boolean NOT NULL DEFAULT false,
  -- Operational denormalisation for rate limiting (user messages only).
  author_user_id      uuid,
  -- Keyed hash of the requesting network identifier; never a raw IP.
  network_hash        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_messages_blocks_array_ck CHECK (jsonb_typeof(blocks) = 'array')
);

COMMENT ON TABLE public.assistant_messages IS
  'Persisted conversation turns. Content is public text only; blocks are validated UI payloads. Service-role writes; thread owner SELECT only.';

CREATE INDEX IF NOT EXISTS assistant_messages_thread_created_idx
  ON public.assistant_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS assistant_messages_author_recent_idx
  ON public.assistant_messages (author_user_id, created_at DESC)
  WHERE role = 'user' AND author_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assistant_messages_network_recent_idx
  ON public.assistant_messages (network_hash, created_at DESC)
  WHERE role = 'user' AND network_hash IS NOT NULL;

-- ─── assistant_tool_runs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_tool_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  message_id       uuid REFERENCES public.assistant_messages(id) ON DELETE SET NULL,
  tool_name        text NOT NULL,
  -- Validated, size-bounded copy of the tool arguments.
  sanitized_input  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- SHA-256 of the allowlisted output; raw outputs are never stored here.
  output_digest    text,
  status           text NOT NULL
                     CHECK (status IN ('started','completed','refused','error')),
  error_code       text,
  idempotency_key  text NOT NULL UNIQUE,
  latency_ms       integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assistant_tool_runs IS
  'Audit of every assistant tool invocation (read-only tools in Phase 1). Service-role only.';

CREATE INDEX IF NOT EXISTS assistant_tool_runs_thread_created_idx
  ON public.assistant_tool_runs (thread_id, created_at);
CREATE INDEX IF NOT EXISTS assistant_tool_runs_tool_created_idx
  ON public.assistant_tool_runs (tool_name, created_at DESC);

-- ─── updated_at touch ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assistant_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assistant_threads_touch ON public.assistant_threads;
CREATE TRIGGER trg_assistant_threads_touch
  BEFORE UPDATE ON public.assistant_threads
  FOR EACH ROW EXECUTE FUNCTION public.assistant_touch_updated_at();

-- ─── Row level security ────────────────────────────────────────────
ALTER TABLE public.assistant_threads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_tool_runs ENABLE ROW LEVEL SECURITY;

-- Service role: full access, named explicitly (never PUBLIC).
DROP POLICY IF EXISTS assistant_threads_service_role ON public.assistant_threads;
CREATE POLICY assistant_threads_service_role ON public.assistant_threads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS assistant_messages_service_role ON public.assistant_messages;
CREATE POLICY assistant_messages_service_role ON public.assistant_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS assistant_tool_runs_service_role ON public.assistant_tool_runs;
CREATE POLICY assistant_tool_runs_service_role ON public.assistant_tool_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated owners: read their own threads and messages. No write
-- policies exist for authenticated, so PostgREST inserts/updates/deletes
-- are denied; all writes go through the server API.
DROP POLICY IF EXISTS assistant_threads_owner_select ON public.assistant_threads;
CREATE POLICY assistant_threads_owner_select ON public.assistant_threads
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS assistant_messages_owner_select ON public.assistant_messages;
CREATE POLICY assistant_messages_owner_select ON public.assistant_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assistant_threads t
    WHERE t.id = assistant_messages.thread_id
      AND t.user_id IS NOT NULL
      AND t.user_id = auth.uid()
  ));

-- Belt and braces: anon/authenticated get no table privileges beyond the
-- owner SELECT paths above (default GRANTs would otherwise allow the
-- policy-gated commands).
REVOKE INSERT, UPDATE, DELETE ON public.assistant_threads   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assistant_messages  FROM anon, authenticated;
REVOKE ALL                     ON public.assistant_tool_runs FROM anon, authenticated;

-- ─── Feature flags (all OFF) ───────────────────────────────────────
INSERT INTO public.platform_feature_flags (key, enabled, description)
VALUES
  ('assistant.enabled', false,
   'Kill switch for the AI commerce assistant (/assistant page + /api/assistant/*). Phase 1 is read-only.'),
  ('assistant.write_tools_enabled', false,
   'Reserved for later phases. No behavior is attached in Phase 1.'),
  ('assistant.checkout_enabled', false,
   'Reserved for later phases. No behavior is attached in Phase 1.')
ON CONFLICT (key) DO NOTHING;
