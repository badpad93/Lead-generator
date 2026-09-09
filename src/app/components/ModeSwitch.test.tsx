import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { isAppShellPath } from "@/lib/storefrontCtxCookie";

/**
 * The Dashboard / Vinnie switch is discoverability only. These tests pin:
 * the flag on/off/unknown rendering (reserved slot, no layout shift), the
 * authenticated and guest Dashboard destinations, both active states from
 * the route alone, the compact mobile form, the accessible markup, and
 * that /assistant keeps its no-global-nav shell.
 */
const nav = { pathname: "/" as string | null };
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { ModeSwitch, activeMode, dashboardHref, DASHBOARD_HREF, GUEST_DASHBOARD_HREF, VINNIE_HREF } from "./ModeSwitch";

type Props = Parameters<typeof ModeSwitch>[0];
const render = (props: Partial<Props> = {}) => renderToStaticMarkup(createElement(ModeSwitch, { authenticated: true, vinnieEnabled: true, ...props }));
const link = (html: string, testId: string) => html.match(new RegExp(`<a [^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? null;

beforeEach(() => {
  nav.pathname = "/";
});

describe("ModeSwitch flag behaviour", () => {
  it("offers both options when assistant.enabled is true", () => {
    const html = render({ vinnieEnabled: true });
    expect(link(html, "mode-switch-dashboard")).toContain(`href="${DASHBOARD_HREF}"`);
    expect(link(html, "mode-switch-vinnie")).toContain(`href="${VINNIE_HREF}"`);
    expect(html).toContain('data-vinnie="on"');
    expect(html).not.toContain("mode-switch-vinnie-slot");
  });

  it("hides Vinnie when the flag is false and keeps an inert slot of the same size so nothing shifts", () => {
    const html = render({ vinnieEnabled: false });
    expect(html).not.toContain(`href="${VINNIE_HREF}"`);
    expect(html).toContain('data-vinnie="off"');
    const slot = html.match(/<span [^>]*data-testid="mode-switch-vinnie-slot"[^>]*>/)?.[0] ?? "";
    expect(slot).toContain('aria-hidden="true"');
    expect(slot).toContain("invisible");
    for (const size of ["h-9", "w-9", "sm:h-8", "sm:w-24"]) {
      expect(slot).toContain(size);
      expect(link(html, "mode-switch-dashboard")).toContain(size);
    }
  });

  it("treats an unknown status (still loading) exactly like off", () => {
    const html = render({ vinnieEnabled: null });
    expect(html).not.toContain(`href="${VINNIE_HREF}"`);
    expect(html).toContain("mode-switch-vinnie-slot");
    expect(html).toContain('data-vinnie="off"');
  });

  it("uses a transparent border while Vinnie is hidden and the real track only when both options show", () => {
    expect(render({ vinnieEnabled: true })).toContain("border border-gray-200");
    expect(render({ vinnieEnabled: false })).toContain("border border-transparent");
  });
});

describe("ModeSwitch destinations", () => {
  it("sends signed-in viewers to /dashboard and guests through login back to /dashboard", () => {
    expect(link(render({ authenticated: true }), "mode-switch-dashboard")).toContain('href="/dashboard"');
    expect(link(render({ authenticated: false }), "mode-switch-dashboard")).toContain('href="/login?redirect=/dashboard"');
    expect(dashboardHref(true)).toBe(DASHBOARD_HREF);
    expect(dashboardHref(false)).toBe(GUEST_DASHBOARD_HREF);
    expect(GUEST_DASHBOARD_HREF).toBe("/login?redirect=/dashboard");
  });

  it("always points Vinnie at /assistant, signed in or not", () => {
    expect(link(render({ authenticated: false }), "mode-switch-vinnie")).toContain('href="/assistant"');
  });
});

describe("ModeSwitch active state comes only from the route", () => {
  it("marks Vinnie active on /assistant and below, Dashboard everywhere else", () => {
    expect(activeMode("/assistant")).toBe("vinnie");
    expect(activeMode("/assistant/anything")).toBe("vinnie");
    expect(activeMode("/assistant-not")).toBe("dashboard");
    expect(activeMode("/dashboard")).toBe("dashboard");
    expect(activeMode("/coffee")).toBe("dashboard");
    expect(activeMode("/")).toBe("dashboard");
    expect(activeMode(null)).toBe("dashboard");
  });

  it("renders Dashboard active with aria-current and the Vinnie green on /dashboard", () => {
    nav.pathname = "/dashboard";
    const html = render();
    expect(link(html, "mode-switch-dashboard")).toContain('aria-current="page"');
    expect(link(html, "mode-switch-dashboard")).toContain("bg-vinnie-green");
    expect(link(html, "mode-switch-vinnie")).not.toContain("aria-current");
    expect(link(html, "mode-switch-vinnie")).not.toContain("bg-vinnie-green");
  });

  it("renders Vinnie active on /assistant", () => {
    nav.pathname = "/assistant";
    const html = render();
    expect(link(html, "mode-switch-vinnie")).toContain('aria-current="page"');
    expect(link(html, "mode-switch-vinnie")).toContain("bg-vinnie-green");
    expect(link(html, "mode-switch-dashboard")).not.toContain("aria-current");
  });

  it("defaults everyone to Dashboard on unrelated routes", () => {
    nav.pathname = "/coffee";
    expect(link(render(), "mode-switch-dashboard")).toContain('aria-current="page"');
  });

  it("never persists a preference: no cookie, storage, or profile access in the component", () => {
    const src = readFileSync(new URL("./ModeSwitch.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie|profile|useEffect|redirect\(/);
  });
});

describe("ModeSwitch mobile and accessibility", () => {
  it("is a compact icon-only pair below sm and shows labels from sm up", () => {
    const html = render();
    expect(html.match(/<svg/g)?.length).toBe(2);
    expect(html.match(/<span class="hidden sm:inline">Dashboard<\/span>/)).not.toBeNull();
    expect(html.match(/<span class="hidden sm:inline">Vinnie AI<\/span>/)).not.toBeNull();
    expect(link(html, "mode-switch-dashboard")).toMatch(/\bh-9 w-9\b.*\bsm:h-8 sm:w-24\b/);
  });

  it("is a labelled group of real links (not a second nav landmark) with accessible names and visible focus rings", () => {
    const html = render();
    expect(html).toMatch(/<div [^>]*role="group"[^>]*aria-label="Interface mode"/);
    expect(html).not.toContain("<nav");
    expect(link(html, "mode-switch-dashboard")).toContain('aria-label="Dashboard"');
    expect(link(html, "mode-switch-vinnie")).toContain('aria-label="Vinnie AI"');
    for (const id of ["mode-switch-dashboard", "mode-switch-vinnie"]) {
      expect(link(html, id)).toContain("focus-visible:ring-2");
      expect(link(html, id)).toContain("focus-visible:ring-vinnie-green");
    }
  });

  it("supports a dark tone for Vinnie's header: green outline active state, no green surface, no other hue", () => {
    nav.pathname = "/assistant";
    const html = render({ tone: "dark" });
    expect(html).toContain("border-neutral-800");
    expect(link(html, "mode-switch-vinnie")).toContain("border-vinnie-green bg-black text-vinnie-green");
    expect(html).not.toContain("bg-vinnie-green");
    expect(link(html, "mode-switch-dashboard")).toContain("text-white");
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:green|emerald)-/);
  });

  it("keeps every option the same size in both states (a border is always present)", () => {
    const html = render();
    expect(link(html, "mode-switch-dashboard")).toMatch(/\brounded-full border\b/);
    expect(link(html, "mode-switch-vinnie")).toMatch(/\brounded-full border\b/);
    expect(link(html, "mode-switch-vinnie")).toContain("border-transparent");
  });
});

describe("/assistant keeps its own shell", () => {
  it("is an app-shell path (no global Navbar) while /dashboard is not", () => {
    expect(isAppShellPath("/assistant")).toBe(true);
    expect(isAppShellPath("/assistant/x")).toBe(true);
    expect(isAppShellPath("/dashboard")).toBe(false);
  });
});
