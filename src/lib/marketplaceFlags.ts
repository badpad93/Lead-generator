/**
 * Marketplace feature flags. Read from env vars at request time so we can
 * flip them per environment without a redeploy of the client bundle. The
 * NEXT_PUBLIC_ variants are readable from client components.
 *
 * Convention: value "1" or "true" enables; anything else disables.
 */
function on(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/** Phase 2.1 — onboarding + admin partner directory */
export function marketplaceOnboardingEnabled(): boolean {
  return on(process.env.MARKETPLACE_ONBOARDING);
}

export function marketplaceOnboardingEnabledClient(): boolean {
  return on(process.env.NEXT_PUBLIC_MARKETPLACE_ONBOARDING);
}
