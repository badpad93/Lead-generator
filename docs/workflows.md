# Workflows

The Workflows system is the single source of truth for the fulfillment
lifecycle of every customer product and service. It replaces per-domain
tracking with a shared schema, service layer, notification engine, and
customer + CRM UIs.

## What it covers

| Workflow type | Fires when | Templates ship with these stages |
|---|---|---|
| `ai_machine_fulfillment` | Purchase agreement fully executed (machine section included) OR P2P machine-listing purchase completed | payment_confirmed → ordered → shipped → delivered → **installed** → **activated** (installed AND activated required for completion) |
| `location_services` | Location placement agreement or CRM agreement with location services included; ties into the PP marketplace via `placement_contract_id` | payment_confirmed → requirements_received → search_in_progress → candidates_identified → locations_presented → customer_approvals → secured → installation_coordination → completed (default 60-day deadline, configurable) |
| `financing` | Financing application submitted | 13-status milestone pipeline (application_started → … → funded / declined / cancelled / expired) |
| `coffee_equipment` | Coffee supply agreement fully executed | agreement_completed → committed → ordered → shipped → delivered → installation_scheduled → installed → activated |
| `coffee_service` | Coffee supply agreement fully executed (parallel to equipment) | Long-lived; each coffee order attaches as a `workflow_order_items` sub-item; admin/user can flip each order to `fulfilled` |
| `website_build` | Website builder wizard submitted | submitted → in_review → design_in_progress → content_review → staging_live → revisions_requested → launched |

## Schema

Migration `125_workflows.sql` adds:

- `workflow_templates` + `workflow_template_stages` — versioned templates, seeded from code
- `workflows` — core record with `workflow_number` (WF-000001), idempotency index on `(source_type, source_id, workflow_type, coalesce(product_key, ''))`
- `workflow_stages` — per-workflow stage state
- `workflow_events` — immutable audit log; unique `change_key` prevents duplicate webhook processing
- `workflow_assignments` — multi-collaborator, role-based
- `workflow_notes` — internal vs customer visibility
- `workflow_shipments` — carrier/tracking/quantity
- `workflow_order_items` — per-order sub-items on recurring workflows (coffee)
- `workflow_notification_rules` + `workflow_notification_log` — send-once dedup via partial unique index

Migration `126_workflow_notification_rules_seed.sql` seeds the initial rule catalogue.

## Environment variables

All optional; sensible defaults apply when unset.

| Variable | Purpose | Default |
|---|---|---|
| `WORKFLOWS_TEAM_EMAIL_FULFILLMENT` | Fallback recipient when a fulfillment workflow has no assignee | none — sends nothing |
| `WORKFLOWS_TEAM_EMAIL_LOCATIONS` | Same, for location_services | none |
| `WORKFLOWS_TEAM_EMAIL_FINANCING` | Same, for financing | none |
| `WORKFLOWS_TEAM_EMAIL_COFFEE` | Same, for coffee | none |
| `WORKFLOWS_DUE_SOON_DAYS` | Window used by the daily cron for `deadline.due_soon` | `7` |
| `CRON_SECRET` | Bearer secret required by the cron endpoint | required in prod |

`FROM_EMAIL` and `RESEND_API_KEY` are reused from the existing email
stack — no new email provider.

## Cron

Add a daily schedule (Vercel Cron or equivalent) hitting:

```
GET /api/cron/workflows/due-soon
Authorization: Bearer $CRON_SECRET
```

Fires `deadline.due_soon` for open workflows within
`WORKFLOWS_DUE_SOON_DAYS` and `deadline.overdue` for those past due.
`send_once=false` on those rules so this endpoint safely fires each day
until the workflow completes.

## API surface

Staff (server-side permission-checked):

- `GET /api/workflows` — list with full filter set
- `GET /api/workflows/[id]` — detail (staff + customer safe — server strips internal fields for non-staff)
- `GET /api/workflows/metrics` — aggregate counts for CRM dashboard tiles
- `PATCH /api/workflows/[id]/stages/[stageKey]` — quantity/status/notes/customer_message
- `POST /api/workflows/[id]/assign` — primary or collaborator
- `POST /api/workflows/[id]/notes` — internal or customer note
- `POST /api/workflows/[id]/shipments` — carrier/tracking record
- `PATCH /api/workflows/[id]/order-items/[itemId]` — flip coffee order fulfillment
- `POST /api/workflows/[id]/cancel` — admin only, reason required
- `POST /api/workflows/[id]/reopen` — admin only, reason required
- `PATCH /api/workflows/[id]/deadline` — reason required
- `PATCH /api/workflows/[id]/status` — manual override
- `POST /api/admin/workflows/backfill` — admin-only legacy import

Customer:

- `GET /api/account/workflows` — customer's own list

## UI

- `/sales/workflows` — CRM list (staff)
- `/sales/workflows/[id]` — CRM detail (staff)
- `/account/workflows` — customer list (linked from dashboard as "My Order Status")
- `/account/workflows/[id]` — customer detail
- `/admin/workflows/backfill` — admin backfill tool

## Permissions

| Permission | Granted to |
|---|---|
| `workflows.view_all` | admin, DOS, market_leader |
| `workflows.view_assigned` | sales, sales_manager |
| `workflows.view_own` | any authenticated user |
| `workflows.create` | admin only (auto via hooks) |
| `workflows.edit_status` / `edit_quantity` / `edit_deadline` / `assign` | admin, DOS, market_leader, sales_manager |
| `workflows.add_internal_notes` | all staff |
| `workflows.publish_customer_updates` | admin, DOS, market_leader |
| `workflows.cancel` / `reopen` / `manage_templates` / `override_validation` | admin only |
| `workflows.delete` | nobody (soft-cancel only) |

RLS enforces the customer scope at the DB layer in addition to UI checks.

## Idempotency guarantees

- Same source event never spawns duplicate workflows (unique index on `(source_type, source_id, workflow_type, coalesce(product_key, ''))`)
- Same webhook payload never produces duplicate audit events (unique index on `(workflow_id, change_key)`)
- Same notification trigger never sends duplicate emails when `send_once=true` on the rule (unique index on `(workflow_id, trigger_event, template_key, recipient, coalesce(stage_key, ''))`)

## Legacy backfill

For customers whose purchases predate this system:

1. Go to `/admin/workflows/backfill`
2. Provide customer user ID, workflow type, quantities, dates
3. Optionally prefill completed quantities per stage (e.g. `shipped = 6`)
4. Initial customer email is suppressed; workflow is marked `imported_from_legacy=true`

Backfilled workflows fire notifications from that point forward like any
other; only the initial "workflow.created" email is skipped.

## Integration points

The following existing paths spawn workflows automatically — no manual
intervention required for forward-looking events:

| Existing path | Workflow(s) spawned |
|---|---|
| `handleFullySignedAgreement` (CRM purchase agreement) | ai_machine_fulfillment + location_services (per include_* toggles) |
| Coffee agreement admin countersign | coffee_equipment + coffee_service |
| Machine-listing checkout | ai_machine_fulfillment |
| Financing application POST | financing |
| Website request submit | website_build |
| Coffee checkout | Attaches order to existing coffee_service as sub-item |
| PP marketplace operator-accept | Advances `secured` on linked location_services workflow |
