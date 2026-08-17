/**
 * Lightweight client-side event tracker.
 *
 * The project doesn't have a bundled analytics SDK today. This helper
 * dispatches to `window.dataLayer` (the standard GTM / GA4 convention)
 * if it exists, otherwise it no-ops. That means when someone later
 * drops a GTM snippet or wires a real provider the existing event
 * calls just start working — no code changes needed.
 *
 * Safe on SSR (guards for typeof window). Never throws.
 */

interface DataLayerWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as DataLayerWindow;
    if (!w.dataLayer) w.dataLayer = [];
    w.dataLayer.push({ event: name, ...(props ?? {}) });
  } catch {
    // Never let analytics break the app.
  }
}

/** Recommended homepage CTA event names — kept in one place so
 *  copy stays consistent and typos don't fragment the funnel. */
export const HomepageEvents = {
  operator: "homepage_operator_click",
  location: "homepage_location_click",
  placementProvider: "homepage_placement_provider_click",
  financing: "homepage_financing_click",
  coffee: "homepage_coffee_click",
  website: "homepage_website_click",
  machines: "homepage_machines_click",
  getStarted: "homepage_get_started_click",
} as const;
