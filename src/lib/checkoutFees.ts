export const FEE_EXEMPT_ROLES = ["sales", "director_of_sales", "market_leader", "admin"];
export const BROKER_FEE_RATE = 0.05;
export const PROCESSING_FEE_RATE = 0.029;

export interface FeeBreakdown {
  brokerFeeCents: number;
  processingFeeCents: number;
  totalFeeCents: number;
}

export function calculateFees(subtotalCents: number): FeeBreakdown {
  const brokerFeeCents = Math.round(subtotalCents * BROKER_FEE_RATE);
  const processingFeeCents = Math.round((subtotalCents + brokerFeeCents) * PROCESSING_FEE_RATE);
  return {
    brokerFeeCents,
    processingFeeCents,
    totalFeeCents: brokerFeeCents + processingFeeCents,
  };
}
