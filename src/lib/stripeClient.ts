import Stripe from "stripe";

let client: Stripe | undefined;

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  client ??= new Stripe(secretKey);
  return client;
}
