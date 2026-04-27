# Stripe Integration Setup

## Environment Variables

Add these to your `.env.local` (and production environment):

```
STRIPE_SECRET_KEY=sk_live_...       # or sk_test_... for sandbox
STRIPE_WEBHOOK_SECRET=whsec_...     # signing secret from Stripe dashboard
```

## Stripe Dashboard Configuration

### 1. Register the webhook endpoint

1. Go to **Developers > Webhooks** in the [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Set the URL to: `https://vendingconnector.com/api/webhooks/stripe`
4. Under **Events to send**, select:
   - `payment_intent.succeeded`
   - `checkout.session.completed`
   - `checkout.session.expired`
5. Click **Add endpoint**

### 2. Copy the signing secret

1. After creating the endpoint, click on it to view details
2. Under **Signing secret**, click **Reveal** and copy the value
3. Set it as `STRIPE_WEBHOOK_SECRET` in your environment

### 3. Connect Stripe to PandaDoc (for embedded payments)

PandaDoc handles Stripe payment collection inside signed documents. The PandaDoc+Stripe integration must be configured in the PandaDoc dashboard separately. The Stripe webhook at `/api/webhooks/stripe` serves as a backup reconciliation — it marks `pipeline_payments` as completed when `payment_intent.succeeded` fires with `pipeline_item_id` and `step_id` in the payment intent metadata.

## How It Works

1. **PandaDoc sends the document** with an embedded Stripe payment block
2. **Customer signs + pays** inside the PandaDoc viewer
3. **PandaDoc webhook** (`/api/webhooks/esign`) fires first — marks payment completed, reveals location, generates full proposal
4. **Stripe webhook** (`/api/webhooks/stripe`) fires as backup — reconciles `pipeline_payments` status via `payment_intent.succeeded`

Both webhooks are idempotent — receiving the event twice won't cause duplicate processing.
