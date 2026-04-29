-- Migration 052: Auto-assign form-enabled document templates to onboarding pipeline steps
-- This wires up the NDA, NCA, ICA templates to the interview step and W9, ACH to welcome_docs
-- for both BDP and Market Leader pipelines so the candidate portal shows forms automatically.

-- BDP pipeline (b0000000-0000-0000-0000-000000000001)
INSERT INTO public.step_document_assignments (pipeline_id, step_key, document_template_id, required, order_index)
SELECT
  'b0000000-0000-0000-0000-000000000001',
  dt.step_key,
  dt.id,
  true,
  ROW_NUMBER() OVER (PARTITION BY dt.step_key ORDER BY dt.created_at) - 1
FROM public.document_templates dt
WHERE dt.form_enabled = true
  AND dt.active = true
  AND dt.step_key IN ('interview', 'welcome_docs')
  AND dt.pipeline_type IN ('ALL', 'BDP')
ON CONFLICT DO NOTHING;

-- Market Leader pipeline (b0000000-0000-0000-0000-000000000002)
INSERT INTO public.step_document_assignments (pipeline_id, step_key, document_template_id, required, order_index)
SELECT
  'b0000000-0000-0000-0000-000000000002',
  dt.step_key,
  dt.id,
  true,
  ROW_NUMBER() OVER (PARTITION BY dt.step_key ORDER BY dt.created_at) - 1
FROM public.document_templates dt
WHERE dt.form_enabled = true
  AND dt.active = true
  AND dt.step_key IN ('interview', 'welcome_docs')
  AND dt.pipeline_type IN ('ALL', 'MARKET_LEADER')
ON CONFLICT DO NOTHING;
