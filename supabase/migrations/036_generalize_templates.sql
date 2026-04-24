-- Migration 036: Allow document templates, email templates, and doc mapping
-- to work with ALL pipelines, not just onboarding.

-- 1. Drop CHECK constraints on document_templates so any pipeline_type and step_key can be used
ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_pipeline_type_check;
ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_step_key_check;

-- 2. Drop the FK from step_document_assignments → onboarding_pipelines
--    so it can reference any pipeline (onboarding or generic)
ALTER TABLE step_document_assignments DROP CONSTRAINT IF EXISTS step_document_assignments_pipeline_id_fkey;
