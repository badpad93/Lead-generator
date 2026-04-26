# Location Placement Proposal Flow

## Overview

Two-phase PandaDoc document flow for location placement proposals:
1. **Preliminary Proposal** — sent before payment with limited location info
2. **Full Proposal** — auto-generated after payment with complete location details

## Security Boundary

- Customers only see preliminary fields (industry, zip, employee_count, traffic_count) before payment
- Sensitive fields (location_name, address, phone, decision_maker_name, decision_maker_email) are stripped server-side via `getLocationForUser()` until `locations.is_revealed = true`
- Admins and internal users always see all fields

## Database Objects

### `locations` table (migration 040)
- Preliminary fields: `industry`, `zip`, `employee_count`, `traffic_count`
- Sensitive fields: `location_name`, `address`, `phone`, `decision_maker_name`, `decision_maker_email`
- `is_revealed` (boolean) — controls field visibility
- `revealed_at` (timestamp) — set when payment completes

### `pipeline_steps` additions
- `pandadoc_preliminary_template_id` — PandaDoc template for Phase 1
- `pandadoc_full_template_id` — PandaDoc template for Phase 2
- `payment_provider` — `pandadoc_stripe`, `paypal`, or `none`

### `pipeline_items` additions
- `location_id` — references `locations.id`
- `proposal_status` — `not_sent`, `proposal_sent`, or `paid`

## Phase 1: Send Preliminary Proposal

**Trigger:** Admin clicks "Send Preliminary Proposal" on pipeline item detail page

**API:** `POST /api/pipeline-items/[id]/send-proposal`

**Flow:**
1. Validates item has `location_id` and step has `pandadoc_preliminary_template_id`
2. Creates PandaDoc document from preliminary template with merge fields (industry, zip, employee/traffic counts, customer info, payment amount)
3. Sends document immediately
4. Creates `esign_documents` record with `metadata.type = "preliminary_proposal"`
5. Creates `pipeline_payments` record (pending) if step uses `pandadoc_stripe`
6. Updates `pipeline_items.proposal_status = "proposal_sent"`

## Phase 2: Payment + Auto-Release

**Trigger:** PandaDoc webhook fires `document_state_changed.document.completed`

**Handler:** `POST /api/webhooks/esign`

**Flow (when esign_document has `metadata.type = "preliminary_proposal"`):**
1. Marks `pipeline_payments` as completed
2. Sets `locations.is_revealed = true` and `revealed_at = now()`
3. Generates full PandaDoc document from `pandadoc_full_template_id` with all location fields
4. Sends full document to customer email
5. Creates new `esign_documents` record with `metadata.type = "full_proposal"`
6. Updates `pipeline_items.proposal_status = "paid"`
7. If step requirements met and no admin approval required, auto-advances to next step (or marks won if last step)

## Phase 3: Stripe Backup Reconciliation

**Handler:** `POST /api/webhooks/stripe`

Handles `payment_intent.succeeded` events with `pipeline_item_id` and `step_id` metadata — marks matching `pipeline_payments` as completed as an audit backup.

## Access Control

`src/lib/locations/access.ts` provides:
- `getLocationForUser(locationId, viewerContext)` — returns full or stripped location based on viewer context and `is_revealed` status
- `stripSensitiveFields(location)` — utility to remove sensitive fields

**ViewerContext values:** `admin`, `internal_user`, `customer`

## Configuration (Pipeline Edit Page)

When "E-Sign" is checked on a step:
- Two text inputs for Preliminary Template ID and Full Template ID

When "Payment" is checked on a step:
- Amount and description inputs
- Payment Provider dropdown: PandaDoc + Stripe, PayPal, None
