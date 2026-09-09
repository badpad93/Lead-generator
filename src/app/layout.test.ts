import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The root layout drops the global site chrome (nav, footer, financing
 * FAB) when the proxy stamps the minimal-shell header, which it does for
 * /assistant. The chrome components are stubbed with markers; only the
 * layout's branching is under test.
 */
const headerStore = new Map<string, string>();
const nav = { pathname: "/" };
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => headerStore.get(k) ?? null }) }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("./globals.css", () => ({}));
vi.mock("./components/Navbar", () => ({ default: () => createElement("nav", { "data-testid": "site-nav" }) }));
vi.mock("./components/Footer", () => ({ default: () => createElement("footer", { "data-testid": "site-footer" }) }));
vi.mock("./components/FinancingFab", () => ({ default: () => createElement("div", { "data-testid": "financing-fab" }) }));
vi.mock("./components/MagicLinkHashCatcher", () => ({ default: () => null }));

import RootLayout from "./layout";

async function renderLayout(shellHeader: string | null, pathname = "/"): Promise<string> {
  headerStore.clear();
  nav.pathname = pathname;
  if (shellHeader !== null) headerStore.set("x-vc-customer-shell", shellHeader);
  const el = await RootLayout({ children: createElement("div", { "data-testid": "page" }, "page") });
  return renderToStaticMarkup(el);
}

describe("root layout shell", () => {
  it("renders no site nav, footer, or financing FAB when the minimal-shell header is set (as it is for /assistant)", async () => {
    const html = await renderLayout("1");
    expect(html).toContain('data-testid="page"');
    expect(html).not.toContain('data-testid="site-nav"');
    expect(html).not.toContain('data-testid="site-footer"');
    expect(html).not.toContain('data-testid="financing-fab"');
    expect(html.match(/<main/g)?.length).toBe(1);
  });

  it("renders no site nav, footer, or financing FAB on /assistant even when the proxy header is missing (route-based guard)", async () => {
    for (const p of ["/assistant", "/assistant/anything"]) {
      const html = await renderLayout(null, p);
      expect(html, p).toContain('data-testid="page"');
      expect(html, p).not.toContain('data-testid="site-nav"');
      expect(html, p).not.toContain('data-testid="site-footer"');
      expect(html, p).not.toContain('data-testid="financing-fab"');
      expect(html.match(/<main/g)?.length, p).toBe(1);
    }
  });

  it("keeps the global chrome for ordinary routes", async () => {
    const html = await renderLayout(null);
    expect(html).toContain('data-testid="site-nav"');
    expect(html).toContain('data-testid="site-footer"');
    expect(html).toContain('data-testid="financing-fab"');
  });
});
