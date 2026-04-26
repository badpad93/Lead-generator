const PAYPAL_SANDBOX_URL = "https://api-m.sandbox.paypal.com";
const PAYPAL_LIVE_URL = "https://api-m.paypal.com";

function getBaseUrl(): string {
  return process.env.PAYPAL_MODE === "live"
    ? PAYPAL_LIVE_URL
    : PAYPAL_SANDBOX_URL;
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

interface CreateOrderParams {
  amount: number;
  currency?: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  referenceId?: string;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links: { href: string; rel: string; method: string }[];
}

export async function createOrder(
  params: CreateOrderParams
): Promise<PayPalOrder> {
  const token = await getAccessToken();

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: params.referenceId || undefined,
        description: params.description,
        amount: {
          currency_code: params.currency || "USD",
          value: params.amount.toFixed(2),
        },
      },
    ],
    application_context: {
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      brand_name: "Vending Connector",
      user_action: "PAY_NOW",
    },
  };

  const res = await fetch(`${getBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`PayPal create order failed: ${await res.text()}`);
  }

  return res.json();
}

export async function captureOrder(orderId: string): Promise<PayPalOrder> {
  const token = await getAccessToken();

  const res = await fetch(
    `${getBaseUrl()}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`PayPal capture failed: ${await res.text()}`);
  }

  return res.json();
}

export async function getOrderDetails(orderId: string): Promise<PayPalOrder> {
  const token = await getAccessToken();

  const res = await fetch(
    `${getBaseUrl()}/v2/checkout/orders/${orderId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    throw new Error(`PayPal get order failed: ${await res.text()}`);
  }

  return res.json();
}

export async function verifyWebhookSignature(
  webhookId: string,
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  const token = await getAccessToken();

  const res = await fetch(
    `${getBaseUrl()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        transmission_id: headers["paypal-transmission-id"],
        transmission_time: headers["paypal-transmission-time"],
        cert_url: headers["paypal-cert-url"],
        auth_algo: headers["paypal-auth-algo"],
        transmission_sig: headers["paypal-transmission-sig"],
        webhook_event: JSON.parse(body),
      }),
    }
  );

  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === "SUCCESS";
}
