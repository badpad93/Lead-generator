export type PaymentProvider = "quickbooks";

export function getPaymentProvider(): PaymentProvider {
  return "quickbooks";
}

export function isQuickBooks(): boolean {
  return true;
}
