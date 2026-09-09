import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Static first paint of the global Navbar (effects do not run): the mode
 * switch is present outside /assistant, offers Dashboard immediately,
 * sends the not-yet-known viewer through login, and reserves the Vinnie
 * slot without linking to /assistant until the status endpoint answers.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/lib/supabase", () => ({ createBrowserClient: () => { throw new Error("effects must not run in a static render"); } }));

import Navbar from "./Navbar";

describe("Navbar mode switch", () => {
  const html = renderToStaticMarkup(createElement(Navbar));

  it("reserves the switch's place in the bar between the wordmark and the mobile hamburger", () => {
    const at = html.indexOf('data-testid="mode-switch-placeholder"');
    expect(at).toBeGreaterThan(html.indexOf("Vending Connector"));
    expect(at).toBeLessThan(html.indexOf('aria-label="Open menu"'));
  });

  it("shows no switch on first paint (flag unknown): no Dashboard pill, no /assistant link, only the invisible spacer", () => {
    expect(html).not.toContain('data-testid="mode-switch"');
    expect(html).not.toContain('href="/login?redirect=/dashboard"');
    expect(html).not.toContain('href="/assistant"');
    expect(html).toContain('data-testid="mode-switch-placeholder"');
  });

  it("lets only the wordmark yield on very narrow screens so mark, switch, and menu button always fit", () => {
    expect(html).toMatch(/<span class="hidden whitespace-nowrap text-lg font-bold text-gray-900 min-\[420px\]:inline">Vending Connector<\/span>/);
  });

  it("keeps every pre-existing top-level element", () => {
    expect(html).toContain('alt="Vending Connector"');
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain("Request Location Services");
  });
});
