import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { isAppShellPath } from "@/lib/storefrontCtxCookie";

/**
 * The Legacy Mode / AI Mode selector is discoverability only. These tests
 * pin: the exact labels, the text-only treatment (no icons, no capsules,
 * no green surfaces), the flag on/off/unknown rendering (reserved place,
 * no layout shift), the authenticated and guest destinations, both active
 * states from the route alone with accessible markup, the focus ring, and
 * that /assistant keeps its no-global-nav shell.
 */
const nav = { pathname: "/" as string | null };
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { ModeSwitch, activeMode, dashboardHref, DASHBOARD_HREF, DASHBOARD_LABEL, GUEST_DASHBOARD_HREF, VINNIE_HREF, VINNIE_LABEL } from "./ModeSwitch";

type Props = Parameters<typeof ModeSwitch>[0];
const render = (props: Partial<Props> = {}) => renderToStaticMarkup(createElement(ModeSwitch, { authenticated: true, vinnieEnabled: true, ...props }));
const link = (html: string, testId: string) => html.match(new RegExp(`<a [^>]*data-testid="${testId}"[^>]*>[^<]*</a>`))?.[0] ?? "";
const CAPSULE = /rounded-full|rounded-\[(?:[7-9]|\d{2,})px\]|rounded-(?:lg|xl|2xl|3xl)\b|shadow|bg-vinnie-green|bg-green/;

beforeEach(() => {
  nav.pathname = "/";
});

describe("ModeSwitch labels and treatment", () => {
  it("displays exactly “Legacy Mode” and “AI Mode”", () => {
    expect(DASHBOARD_LABEL).toBe("Legacy Mode");
    expect(VINNIE_LABEL).toBe("AI Mode");
    const html = render();
    expect(link(html, "mode-switch-dashboard")).toMatch(/>Legacy Mode<\/a>$/);
    expect(link(html, "mode-switch-vinnie")).toMatch(/>AI Mode<\/a>$/);
    expect(html).not.toMatch(/Dashboard<|Vinnie AI</);
  });

  it("contains no img, svg, or icon markup, in either state", () => {
    for (const html of [render({ vinnieEnabled: true }), render({ vinnieEnabled: false })]) {
      expect(html).not.toMatch(/<svg|<img|<picture|lucide|data:image/);
    }
    const src = readFileSync(new URL("./ModeSwitch.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/lucide-react|next\/image|<svg|<img/);
  });

  it("has no capsule, pill, shadow, or green-filled styling; only a 2px underline marks the active tab", () => {
    for (const html of [render(), render({ tone: "dark" }), render({ vinnieEnabled: false })]) {
      expect(html).not.toMatch(CAPSULE);
      expect(html).toContain("border-b-2");
      expect(html).toContain("rounded-[6px]");
    }
    expect(link(render(), "mode-switch-dashboard")).toContain("border-vinnie-green");
    expect(link(render(), "mode-switch-vinnie")).toContain("border-transparent");
  });

  it("is transparent with a subtle divider and 44px-tall targets", () => {
    const html = render();
    const group = html.match(/<div [^>]*data-testid="mode-switch"[^>]*>/)?.[0] ?? "";
    expect(group).not.toMatch(/\bbg-|\bborder\b|border-gray|border-neutral/);
    expect(html).toMatch(/<span aria-hidden="true" class="mx-1 h-4 w-px bg-gray-200"><\/span>/);
    for (const id of ["mode-switch-dashboard", "mode-switch-vinnie"]) expect(link(html, id)).toContain("min-h-11");
  });
});

describe("ModeSwitch flag behaviour", () => {
  it("offers both options when assistant.enabled is true", () => {
    const html = render({ vinnieEnabled: true });
    expect(link(html, "mode-switch-dashboard")).toContain(`href="${DASHBOARD_HREF}"`);
    expect(link(html, "mode-switch-vinnie")).toContain(`href="${VINNIE_HREF}"`);
    expect(html).toContain('data-testid="mode-switch"');
    expect(html).not.toContain("mode-switch-placeholder");
  });

  it("renders no selector when the flag is false: an invisible, inert spacer with the same text holds the place", () => {
    const html = render({ vinnieEnabled: false });
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).not.toContain('data-testid="mode-switch"');
    const spacer = html.match(/<div [^>]*data-testid="mode-switch-placeholder"[^>]*>/)?.[0] ?? "";
    expect(spacer).toContain('aria-hidden="true"');
    expect(spacer).toContain("invisible");
    expect(spacer).not.toContain("role=");
    // The spacer carries the same labels at the heavier weight, so its width equals the widest real state.
    expect(html).toContain(">Legacy Mode</span>");
    expect(html).toContain(">AI Mode</span>");
    expect(html.match(/font-semibold/g)?.length).toBe(2);
  });

  it("treats an unknown status (still loading) exactly like off", () => {
    const html = render({ vinnieEnabled: null });
    expect(html).not.toContain("<a ");
    expect(html).toContain("mode-switch-placeholder");
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

  it("always points AI Mode at /assistant, signed in or not", () => {
    expect(link(render({ authenticated: false }), "mode-switch-vinnie")).toContain('href="/assistant"');
  });
});

describe("ModeSwitch active state comes only from the route", () => {
  it("marks AI Mode active on /assistant and below, Legacy Mode everywhere else", () => {
    expect(activeMode("/assistant")).toBe("vinnie");
    expect(activeMode("/assistant/anything")).toBe("vinnie");
    expect(activeMode("/assistant-not")).toBe("dashboard");
    expect(activeMode("/dashboard")).toBe("dashboard");
    expect(activeMode("/coffee")).toBe("dashboard");
    expect(activeMode("/")).toBe("dashboard");
    expect(activeMode(null)).toBe("dashboard");
  });

  it("renders Legacy Mode active on /dashboard with aria-current, heavier weight, and the green underline", () => {
    nav.pathname = "/dashboard";
    const html = render();
    const active = link(html, "mode-switch-dashboard");
    expect(active).toContain('aria-current="page"');
    expect(active).toContain("font-semibold");
    expect(active).toContain("border-vinnie-green");
    const idle = link(html, "mode-switch-vinnie");
    expect(idle).not.toContain("aria-current");
    expect(idle).toContain("font-medium");
    expect(idle).toContain("border-transparent");
  });

  it("renders AI Mode active on /assistant with the same three signals", () => {
    nav.pathname = "/assistant";
    const html = render();
    const active = link(html, "mode-switch-vinnie");
    expect(active).toContain('aria-current="page"');
    expect(active).toContain("font-semibold");
    expect(active).toContain("border-vinnie-green");
    expect(link(html, "mode-switch-dashboard")).not.toContain("aria-current");
  });

  it("defaults everyone to Legacy Mode on unrelated routes", () => {
    nav.pathname = "/coffee";
    expect(link(render(), "mode-switch-dashboard")).toContain('aria-current="page"');
  });

  it("never persists a preference: no cookie, storage, profile access, effects, or redirects in the component", () => {
    const src = readFileSync(new URL("./ModeSwitch.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie|profile|useEffect|redirect\(/);
  });
});

describe("ModeSwitch accessibility and themes", () => {
  it("is a labelled group of real links (not a second nav landmark) with visible focus rings", () => {
    const html = render();
    expect(html).toMatch(/<div [^>]*role="group"[^>]*aria-label="Interface mode"/);
    expect(html).not.toContain("<nav");
    for (const id of ["mode-switch-dashboard", "mode-switch-vinnie"]) {
      expect(link(html, id)).toContain("focus-visible:ring-2");
      expect(link(html, id)).toContain("focus-visible:ring-vinnie-green");
      expect(link(html, id)).toContain("focus-visible:ring-offset-2");
    }
  });

  it("light tone: dark active text, muted inactive text; dark tone: white active text, muted gray inactive text", () => {
    nav.pathname = "/assistant";
    const light = render();
    expect(link(light, "mode-switch-vinnie")).toContain("text-black-primary");
    expect(link(light, "mode-switch-dashboard")).toContain("text-gray-500");
    expect(light).toContain("focus-visible:ring-offset-white");
    const dark = render({ tone: "dark" });
    expect(link(dark, "mode-switch-vinnie")).toContain("text-white");
    expect(link(dark, "mode-switch-dashboard")).toContain("text-neutral-400");
    expect(dark).toContain("bg-neutral-700");
    expect(dark).toContain("focus-visible:ring-offset-black");
    expect(dark).not.toMatch(/\b(?:bg|text|border)-(?:green|emerald)-/);
  });

  it("keeps both complete labels in the markup at every width (no hidden or abbreviated label)", () => {
    const html = render();
    expect(html).not.toMatch(/hidden sm:inline|sm:hidden|Legacy<|AI</);
  });
});

describe("/assistant keeps its own shell", () => {
  it("is an app-shell path (no global Navbar) while /dashboard is not", () => {
    expect(isAppShellPath("/assistant")).toBe(true);
    expect(isAppShellPath("/assistant/x")).toBe(true);
    expect(isAppShellPath("/dashboard")).toBe(false);
  });
});
