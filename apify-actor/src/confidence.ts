export interface ConfidenceInput {
  addressParsed: boolean;
  phonePresent: boolean;
  websitePresent: boolean;
  withinRadius: boolean;
  directoryOnly: boolean;
}

/** Compute confidence 0–1 for a lead. */
export function computeConfidence(input: ConfidenceInput): number {
  let score = 0;
  if (input.addressParsed) score += 0.4;
  if (input.phonePresent) score += 0.2;
  if (input.websitePresent) score += 0.2;
  if (input.withinRadius) score += 0.2;
  if (input.directoryOnly) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}
