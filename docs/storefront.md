# Coffee Storefronts

Multi-tenant coffee commerce. Each Vending Connector operator can
run a permanently-linked customer subaccount pool on a branded
public storefront page. Vending Connector stays seller of record —
we collect payment + sales tax through QuickBooks, ship the
product, retain the base price, and pay operators the difference
as commission via QuickBooks Bill Pay.

This doc is the operator + admin runbook. It doesn't repeat the
spec — that lives in the internal design doc.

## Concepts

**Storefront tenant** — an operator profile that has been
extended with `storefront_tenants` row. Owner is a `profiles.id`
FK; the same profile keeps its `operator` role. Tenants have a
lifecycle: `pending → approved → suspended | closed`.

**Customer** — a `profiles` row with `storefront_tenant_id` set.
Once set, the link is permanent. Only an Apex admin (via the
audited transfer endpoint) may change it.

**Base price** — the price a tenant pays Vending Connector per
unit. Sourced from `coffee_product_tier_prices` for the tenant's
`base_pricing_tier_id`, or the product's `price` as a fallback.

**Customer price** — the price the customer sees. Set by the
tenant per product (`storefront_tenant_prices`) or per customer
(`storefront_customer_prices`). Must be `>=` the base or checkout
rejects.

**Commission** — `tenant_price - base_price`. Written to
`storefront_commission_ledger` as one row per line item at order
creation with `status='pending'`, transitioning through
`payable → scheduled → paid` as money moves through QBO.

## Pricing precedence (server-side)

`src/lib/coffeePricing.ts` :: `resolveCoffeeProductsPricing` with a
`StorefrontContext` is the single source of truth (the standalone
storefront resolver was collapsed into it). Precedence, highest wins:

1. Accepted proposal line (`coffee_pricing_proposals`)
2. Per-customer override (`storefront_customer_prices`)
3. Tenant-wide price (`storefront_tenant_prices`)
4. Product-recommended (`coffee_products.price`)
5. Base tier (`coffee_product_tier_prices` for tenant's tier)

The browser never sends prices. Every write to
`coffee_order_items` financial columns must go through the
resolver.

## Money & tax

- All money is `NUMERIC(12,2)` (dollars-and-cents). No integer
  minor units in the storefront schema.
- Every storefront transaction is RESALE = tax-exempt at VC →
  customer. The QB storefront helper stamps
  `Taxable=false` + `TaxExemptionReasonId` on the customer
  record and `TaxCodeRef=NON` +
  `GlobalTaxCalculation=NotApplicable` on the invoice/receipt.
  QBO Automated Sales Tax does NOT add sales tax to storefront
  sales.

## Enrollment (one-shot)

Tenant issues an invitation from `/coffee/storefront/invitations`.
The URL is `/coffee/invite/{token}`. Landing page fetches
`/api/storefront/enrollment/preview` (public — no session
required) to render state + tenant branding, then POST to
`/api/storefront/enrollment/consume` with the signed-in session.

Guarantee: a profile that already carries a
`storefront_tenant_id` is refused (`PROFILE_ALREADY_LINKED` or
`PROFILE_LINKED_TO_OTHER_TENANT`). The DB trigger
`storefront_guard_profile_tenant_change` blocks non-service-role
writes to the column so no accidental client update can bypass
this.

## Commission lifecycle

| Status | Set by | Triggered by |
| --- | --- | --- |
| `pending` | `recordOrderCommissions` | order creation |
| `payable` | `settleCommissionsForPayment` | QB Payment webhook |
| `scheduled` | `markCommissionsScheduled` | admin payout release (creates QB Bill) |
| `paid` | `markCommissionsPaid` | QB BillPayment webhook |
| `reversed` | `reverseCommissionsForRefund` | QB RefundReceipt / CreditMemo |
| `on_hold` | `placeCommissionsOnHold` | admin |
| `cancelled` | (direct write) | order cancellation before settlement |

The ledger is APPEND-ONLY. Every reversal is a new negative-
amount row referencing the original via `reversed_of_id`.
Idempotency keys deduplicate webhook replays and admin retries:

- `create:{order}:{item}`
- `settle:{payment}:{item}`
- `refund:{refund}:{item}`
- `adjust:{admin}:{item}:{iso}`

## QuickBooks integration

- `src/lib/quickbooks.ts` — base QBO wrapper (customer /
  invoice / vendor / bill / webhook). Exports `qbApi` +
  `isQbProduction` for storefront reuse.
- `src/lib/storefront/quickbooksStorefront.ts`:
  - `findOrCreateResaleExemptCustomer` — Taxable=false, resale
    exemption reason from env `QB_RESALE_TAX_EXEMPTION_REASON_ID`.
  - `ensureQbItemForProduct` — cache `coffee_products.qb_item_id`
    on first sale so subsequent orders reuse the same catalog id.
  - `createStorefrontInvoice` / `createStorefrontSalesReceipt`
    with NON tax code and `GlobalTaxCalculation=NotApplicable`.

## Payouts

Admin releases a batch from
`/api/admin/storefronts/payouts/release`:

1. Query every `status='payable'` row for a tenant.
2. Find/create the operator's QBO vendor.
3. Create one QB Bill totaling the batch.
4. Flip rows to `status='scheduled'` with `qb_bill_id`.
5. Admin pays the Bill via QB Bill Pay (ACH). The BillPayment
   webhook flips rows to `paid` with `qb_bill_payment_id`.

## Routes

Public / anon:
- `GET /api/storefront/public/[slug]` — tenant hero + catalog
- `GET /api/storefront/enrollment/preview?token=` — invite preview

Authenticated customer:
- `POST /api/storefront/enrollment/consume` — one-shot enroll
- `POST /api/storefront/quote` — cart price preview (thin wrapper
  over the unified resolver)
- `POST /api/coffee/checkout` — storefront checkout runs through the
  base coffee pipeline (idempotent retry, QB timeout guard, tracking
  numbers); it stamps tenant + commission snapshots and writes the
  ledger when the buyer is an enrolled customer

Owner (operator):
- `GET|POST|PATCH /api/storefront/tenant`
- `GET|PUT|DELETE /api/storefront/tenant/prices`
- `GET|PUT|DELETE /api/storefront/tenant/customer-prices`
- `GET|POST|DELETE /api/storefront/tenant/invitations`

Admin:
- `GET /api/admin/storefronts/tenants[?status=]`
- `GET|PATCH /api/admin/storefronts/tenants/[id]` — actions
  approve / suspend / close / assign_tier + generic `patch`
- `POST /api/admin/storefronts/customers/transfer` (audited)
- `POST /api/admin/storefronts/commissions/adjust`
- `POST /api/admin/storefronts/payouts/release`

## Pages

- `/coffee/o/[slug]` — public branded storefront
- `/coffee/invite/[token]` — enrollment landing
- `/coffee/storefront` — operator dashboard hub
- `/coffee/storefront/pricing` — tenant price editor
- `/coffee/storefront/invitations` — issue + revoke invites
- `/admin/storefronts` — admin console
- `/admin/storefronts/[id]` — tenant detail + lifecycle

## Audit

Every mutation writes `storefront_audit_events` via
`recordAuditEvent`. Actions are typed
(`tenant.approved`, `customer.transferred`,
`pricing.tenant_updated`, `commission.reversed`, etc.). The
admin console is expected to render this timeline; the write
side is done.

## Feature flags

Seeded in `platform_feature_flags`:
- `storefront.public_pages_enabled` (default off) — gate the
  public pages once ready to launch.
- `storefront.enrollment_enabled` (default off).
- `storefront.commission_settlement_gating` (default on) — turn
  off in dev to make commission payable immediately without a
  QB webhook.

## Env vars

See `.env.example`. Storefront-relevant keys:
- `NEXT_PUBLIC_APP_URL`
- `STOREFRONT_FROM_EMAIL` (falls back to `FROM_EMAIL`)
- `QB_RESALE_TAX_EXEMPTION_REASON_ID`
- `QB_STOREFRONT_INCOME_ACCOUNT_ID`
- `QB_STOREFRONT_ASSET_ACCOUNT_ID`
- `QB_STOREFRONT_EXPENSE_ACCOUNT_ID`

### NEXT_PUBLIC_SITE_URL vs NEXT_PUBLIC_APP_URL

Both exist in this codebase and neither is fully canonical. The
loose convention that emerged is: email-composing helpers
(`agreementEmail.ts`, `welcomeEmail.ts`, `locationAgreementEmail.ts`,
storefront `emails.ts`, and the storefront invitation route) read
`NEXT_PUBLIC_APP_URL`; almost everything else — auth redirects,
OAuth callbacks, checkout return URLs, cron notification bodies —
reads `NEXT_PUBLIC_SITE_URL`. Both fall back to
`https://vendingconnector.com` if unset. Set both to the same value
in Production unless you have a reason not to. New code should
prefer `NEXT_PUBLIC_SITE_URL` (the older, more widely-used name)
until the two are consolidated.

### QuickBooks environment scoping (audit note)

`QB_ENVIRONMENT` picks the QBO API host (production vs sandbox) but
does NOT decide which company file writes land in — that's
governed by `quickbooks_connection.realm_id` in Supabase, which is
shared across environments. If `QB_ENVIRONMENT=production` in a
Preview or Development env and the shared connection points at the
production company, writes from any QBO-touching code path in that
env land in your real books. Recommended: set
`QB_ENVIRONMENT=sandbox` on Preview so the transport layer refuses
production-realm writes even if the stored connection is
production-scoped. A fully isolated preview environment requires a
separate sandbox QBO company + separate OAuth connection row.

## Testing

`src/lib/storefront/*.test.ts` — 34 vitest tests across
pricing (19), enrollment (7), commissions (8). Run with
`npx vitest run src/lib/storefront/`.
