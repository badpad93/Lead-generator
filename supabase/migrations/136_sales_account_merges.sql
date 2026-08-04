-- Migration 136: sales_account_merges + admin merge/rollback functions
--
-- Everything historical dedup does happens through these functions,
-- called only from the admin-confirmed merge UI. No automated bulk
-- backfill exists or runs.

CREATE TABLE IF NOT EXISTS public.sales_account_merges (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id           uuid NOT NULL REFERENCES public.sales_accounts(id) ON DELETE RESTRICT,
  absorbed_id            uuid NOT NULL REFERENCES public.sales_accounts(id) ON DELETE RESTRICT,
  -- Full snapshot of the absorbed row at merge time so a rollback can
  -- reinstate it byte-for-byte.
  absorbed_row_snapshot  jsonb NOT NULL,
  -- Per-table row-id list of what got repointed. Enables precise
  -- rollback of only THIS merge's FK swaps (not any subsequent
  -- merges that used the same canonical).
  --   { "sales_orders": ["uuid1","uuid2"], "sales_leads": [...], ... }
  fk_swap_details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  merged_by              uuid REFERENCES public.profiles(id),
  merged_at              timestamptz NOT NULL DEFAULT now(),
  rolled_back_at         timestamptz,
  rolled_back_by         uuid REFERENCES public.profiles(id),
  notes                  text
);

CREATE INDEX IF NOT EXISTS idx_sales_account_merges_canonical
  ON public.sales_account_merges (canonical_id);
CREATE INDEX IF NOT EXISTS idx_sales_account_merges_absorbed
  ON public.sales_account_merges (absorbed_id);
CREATE INDEX IF NOT EXISTS idx_sales_account_merges_active
  ON public.sales_account_merges (merged_at) WHERE rolled_back_at IS NULL;

-- Locked-down RLS: service role only. The admin UI calls via the
-- service-role client through /api/admin/sales-accounts/*.
ALTER TABLE public.sales_account_merges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales_account_merges' AND policyname='sales_account_merges_service_role') THEN
    CREATE POLICY sales_account_merges_service_role ON public.sales_account_merges
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── merge_sales_accounts(canonical, absorbed[], merged_by) ──────────
-- Runs as a single implicit transaction. On any failure the whole
-- merge aborts. Returns the array of merge_log ids produced.
CREATE OR REPLACE FUNCTION public.merge_sales_accounts(
  p_canonical_id uuid,
  p_absorbed_ids uuid[],
  p_merged_by    uuid,
  p_notes        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_absorbed_id uuid;
  v_snapshot    jsonb;
  v_details     jsonb;
  v_ids         uuid[];
  v_merge_id    uuid;
  v_merge_ids   uuid[] := '{}';
  v_canonical_exists boolean;
BEGIN
  -- Guard: canonical must exist and be non-deleted.
  SELECT (deleted_at IS NULL) INTO v_canonical_exists
  FROM public.sales_accounts WHERE id = p_canonical_id;
  IF NOT COALESCE(v_canonical_exists, false) THEN
    RAISE EXCEPTION 'canonical account % not found or deleted', p_canonical_id;
  END IF;

  FOREACH v_absorbed_id IN ARRAY p_absorbed_ids LOOP
    IF v_absorbed_id = p_canonical_id THEN
      RAISE EXCEPTION 'cannot absorb canonical into itself: %', v_absorbed_id;
    END IF;

    -- Snapshot the absorbed row.
    SELECT to_jsonb(sa.*) INTO v_snapshot
    FROM public.sales_accounts sa WHERE sa.id = v_absorbed_id;
    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'absorbed account % not found', v_absorbed_id;
    END IF;

    v_details := '{}'::jsonb;

    -- ── FK sweep. Each block: capture ids being changed, then UPDATE. ──
    -- sales_orders.account_id
    SELECT COALESCE(array_agg(id), '{}') INTO v_ids
      FROM public.sales_orders WHERE account_id = v_absorbed_id;
    IF array_length(v_ids, 1) IS NOT NULL THEN
      UPDATE public.sales_orders SET account_id = p_canonical_id WHERE id = ANY(v_ids);
      v_details := jsonb_set(v_details, '{sales_orders}', to_jsonb(v_ids), true);
    END IF;

    -- sales_leads.account_id
    SELECT COALESCE(array_agg(id), '{}') INTO v_ids
      FROM public.sales_leads WHERE account_id = v_absorbed_id;
    IF array_length(v_ids, 1) IS NOT NULL THEN
      UPDATE public.sales_leads SET account_id = p_canonical_id WHERE id = ANY(v_ids);
      v_details := jsonb_set(v_details, '{sales_leads}', to_jsonb(v_ids), true);
    END IF;

    -- sales_deals.account_id
    SELECT COALESCE(array_agg(id), '{}') INTO v_ids
      FROM public.sales_deals WHERE account_id = v_absorbed_id;
    IF array_length(v_ids, 1) IS NOT NULL THEN
      UPDATE public.sales_deals SET account_id = p_canonical_id WHERE id = ANY(v_ids);
      v_details := jsonb_set(v_details, '{sales_deals}', to_jsonb(v_ids), true);
    END IF;

    -- sales_documents.account_id
    IF to_regclass('public.sales_documents') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.sales_documents WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.sales_documents SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{sales_documents}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- intake_leads.account_id
    IF to_regclass('public.intake_leads') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.intake_leads WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.intake_leads SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{intake_leads}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- location_requests.account_id
    IF to_regclass('public.location_requests') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.location_requests WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.location_requests SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{location_requests}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- pipeline_items.account_id
    IF to_regclass('public.pipeline_items') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.pipeline_items WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.pipeline_items SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{pipeline_items}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- agreement_tokens.account_id
    IF to_regclass('public.agreement_tokens') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.agreement_tokens WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.agreement_tokens SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{agreement_tokens}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- invoices.account_id
    IF to_regclass('public.invoices') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.invoices WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.invoices SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{invoices}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- payments.account_id
    IF to_regclass('public.payments') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.payments WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.payments SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{payments}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- account_equipment.account_id
    IF to_regclass('public.account_equipment') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.account_equipment WHERE account_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.account_equipment SET account_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{account_equipment}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- workflows.company_id (note different column name)
    IF to_regclass('public.workflows') IS NOT NULL THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_ids
        FROM public.workflows WHERE company_id = v_absorbed_id;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.workflows SET company_id = p_canonical_id WHERE id = ANY(v_ids);
        v_details := jsonb_set(v_details, '{workflows}', to_jsonb(v_ids), true);
      END IF;
    END IF;

    -- Soft-delete the absorbed row (leave in place for rollback).
    UPDATE public.sales_accounts SET deleted_at = now() WHERE id = v_absorbed_id;

    -- Write merge log row.
    INSERT INTO public.sales_account_merges
      (canonical_id, absorbed_id, absorbed_row_snapshot, fk_swap_details, merged_by, notes)
    VALUES
      (p_canonical_id, v_absorbed_id, v_snapshot, v_details, p_merged_by, p_notes)
    RETURNING id INTO v_merge_id;

    v_merge_ids := array_append(v_merge_ids, v_merge_id);
  END LOOP;

  RETURN jsonb_build_object('merge_ids', v_merge_ids, 'count', array_length(v_merge_ids, 1));
END;
$$;

-- ── rollback_sales_account_merge(merge_id, rolled_back_by) ──────────
-- Reverses ONE merge cleanly. Reads fk_swap_details to know which
-- specific rows to swap back, so if the canonical has been merged
-- into multiple times, we only unwind THIS merge.
CREATE OR REPLACE FUNCTION public.rollback_sales_account_merge(
  p_merge_id        uuid,
  p_rolled_back_by  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merge     public.sales_account_merges;
  v_key       text;
  v_ids       uuid[];
BEGIN
  SELECT * INTO v_merge FROM public.sales_account_merges WHERE id = p_merge_id;
  IF v_merge.id IS NULL THEN
    RAISE EXCEPTION 'merge % not found', p_merge_id;
  END IF;
  IF v_merge.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'merge % already rolled back at %', p_merge_id, v_merge.rolled_back_at;
  END IF;

  -- Un-soft-delete the absorbed row.
  UPDATE public.sales_accounts SET deleted_at = NULL WHERE id = v_merge.absorbed_id;

  -- Swap the specific FK rows back to the absorbed id.
  FOR v_key IN SELECT jsonb_object_keys(v_merge.fk_swap_details) LOOP
    v_ids := ARRAY(SELECT jsonb_array_elements_text(v_merge.fk_swap_details->v_key))::uuid[];
    IF array_length(v_ids, 1) IS NULL THEN CONTINUE; END IF;

    IF v_key = 'sales_orders'      THEN UPDATE public.sales_orders      SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'sales_leads'       THEN UPDATE public.sales_leads       SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'sales_deals'       THEN UPDATE public.sales_deals       SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'sales_documents'   THEN UPDATE public.sales_documents   SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'intake_leads'      THEN UPDATE public.intake_leads      SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'location_requests' THEN UPDATE public.location_requests SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'pipeline_items'    THEN UPDATE public.pipeline_items    SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'agreement_tokens'  THEN UPDATE public.agreement_tokens  SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'invoices'          THEN UPDATE public.invoices          SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'payments'          THEN UPDATE public.payments          SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'account_equipment' THEN UPDATE public.account_equipment SET account_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
    IF v_key = 'workflows'         THEN UPDATE public.workflows         SET company_id = v_merge.absorbed_id WHERE id = ANY(v_ids); END IF;
  END LOOP;

  -- Mark merge as rolled back (keep row for audit).
  UPDATE public.sales_account_merges
    SET rolled_back_at = now(),
        rolled_back_by = p_rolled_back_by
    WHERE id = p_merge_id;

  RETURN jsonb_build_object('ok', true, 'merge_id', p_merge_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_sales_accounts(uuid, uuid[], uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_sales_account_merge(uuid, uuid) TO service_role;
