-- Migration 140: default warehouse for auto-consumption paths
--
-- Phase 2 wires coffee-order fulfillment to the inventory ledger.
-- At that phase we routed consumption to "first active warehouse"
-- because only one warehouse existed. Once multi-warehouse is
-- turned on, admins need a way to tell the mirror which warehouse
-- fulfilled coffee orders should debit — otherwise everything
-- silently piles up on whichever warehouse happens to have the
-- oldest created_at.
--
-- Solution: a nullable default_warehouse_id on the single
-- inventory_configuration row. When set, all auto-consumption paths
-- (coffee orders, later machine sales, etc.) route there. When
-- null, the "first active warehouse" fallback still applies —
-- backwards compatible.

ALTER TABLE public.inventory_configuration
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid
    REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inventory_configuration.default_warehouse_id IS
  'Warehouse used by auto-consumption paths (coffee-order fulfillment, etc.) when the source event does not carry an explicit warehouse. When null, code falls back to the oldest active warehouse.';
