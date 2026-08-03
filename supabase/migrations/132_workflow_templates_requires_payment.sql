-- Migration 132: workflow_templates.requires_payment
--
-- Perpetual/coaching-style workflows have no invoice attached — showing
-- a "Payment" tile on their detail page is noise. This flag lets the
-- admin CRUD say "this template doesn't involve payment"; the workflow
-- service reads it at spawn time and marks the resulting workflow's
-- payment_status = 'na' so the detail UI can hide the tile.
--
-- Default TRUE preserves existing behaviour for every current template.

ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS requires_payment boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.workflow_templates.requires_payment IS
  'When false, spawned workflows start with payment_status=na and the Payment tile is hidden. Toggled per-template in the admin CRUD.';
