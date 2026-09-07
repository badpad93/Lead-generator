-- ==========================================================
-- 189 — Assistant table privileges (forward-only, idempotent)
-- ==========================================================
-- Captures the validated privilege state of the three assistant
-- tables created in migration 187 (which is NOT modified):
--
--   anon           no privileges on assistant_threads,
--                  assistant_messages, assistant_tool_runs
--   authenticated  SELECT only on assistant_threads and
--                  assistant_messages (row visibility is still
--                  decided by the owner-SELECT RLS policies from 187)
--   authenticated  no privileges on assistant_tool_runs
--   service_role   unchanged (not referenced here)
--   PUBLIC         no grants (not referenced here)
--
-- Scope: table privileges only. This migration does not create, alter,
-- or drop policies, functions, schemas, default privileges, or any
-- other table. REVOKE/GRANT are idempotent, so re-running is safe.

REVOKE ALL PRIVILEGES
ON TABLE public.assistant_threads,
         public.assistant_messages,
         public.assistant_tool_runs
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.assistant_threads,
         public.assistant_messages,
         public.assistant_tool_runs
FROM authenticated;

GRANT SELECT
ON TABLE public.assistant_threads,
         public.assistant_messages
TO authenticated;
