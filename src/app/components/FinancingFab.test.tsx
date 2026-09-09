import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** The floating financing button never overlays the full-screen Vinnie app. */
const nav = { pathname: "/" };
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import FinancingFab from "./FinancingFab";

describe("FinancingFab", () => {
  it("renders on ordinary routes", () => {
    nav.pathname = "/coffee";
    expect(renderToStaticMarkup(createElement(FinancingFab))).toContain('aria-label="Get Financing"');
  });

  it("renders nothing on /assistant and below, and on its existing exclusions", () => {
    for (const p of ["/assistant", "/assistant/anything", "/financing", "/sales", "/admin/x"]) {
      nav.pathname = p;
      expect(renderToStaticMarkup(createElement(FinancingFab)), p).toBe("");
    }
  });
});
