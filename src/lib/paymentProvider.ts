export type PaymentProvider = "stripe" | "quickbooks";

export function getPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER?.toLowerCase();
  if (provider === "quickbooks" || provider === "qb") return "quickbooks";
  return "stripe";
}

export function isQuickBooks(): boolean {
  return getPaymentProvider() === "quickbooks";
}

export function isStripe(): boolean {
  return getPaymentProvider() === "stripe";
}
