import type { DealStage } from "./salesTypes";

const STAGE_ORDER: DealStage[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "closing",
  "won",
  "lost",
];

function idx(stage: DealStage): number {
  return STAGE_ORDER.indexOf(stage);
}

interface DealForValidation {
  stage: DealStage;
  value: number;
  deal_services?: { price: number }[];
}

export function validateStageTransition(
  deal: DealForValidation,
  newStage: DealStage
): { valid: boolean; errors: string[] } {
  if (newStage === "lost") return { valid: true, errors: [] };
  if (idx(newStage) <= idx(deal.stage)) return { valid: true, errors: [] };

  const errors: string[] = [];
  const services = deal.deal_services || [];
  const totalValue = services.reduce((s, svc) => s + Number(svc.price), 0);

  if (idx(newStage) >= idx("qualified") && services.length === 0) {
    errors.push("Add at least one service before moving to Qualified");
  }

  if (idx(newStage) >= idx("proposal")) {
    if (services.length === 0) {
      errors.push("Add services before moving to Proposal");
    } else if (totalValue <= 0) {
      errors.push("Services must have pricing before moving to Proposal");
    }
  }

  if (newStage === "won") {
    if (services.length === 0) {
      errors.push("Add services before marking as Won");
    } else if (totalValue <= 0) {
      errors.push("Deal must have a value greater than $0 before marking as Won");
    }
  }

  return { valid: errors.length === 0, errors };
}
