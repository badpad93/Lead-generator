import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Route-level guarantees for /assistant: the locked title, noindex, the
 * full-screen viewport, and a hard 404 while the flag is off (the page
 * must be indistinguishable from a missing route).
 */
const flag = { enabled: false };
vi.mock("@/lib/assistant/flags", () => ({ isAssistantEnabled: async () => flag.enabled }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("unused"); } } }));

class NotFoundSignal extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundSignal("NEXT_NOT_FOUND");
  },
}));

import AssistantPage, { metadata, viewport } from "./page";

beforeEach(() => {
  flag.enabled = false;
});

describe("/assistant page", () => {
  it("uses the locked absolute title so the layout template cannot double the suffix", () => {
    expect(metadata.title).toEqual({ absolute: "Vinnie | Vending Connector" });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(String(metadata.description)).toContain("Vinnie");
  });

  it("declares a full-screen viewport (safe-area cover, keyboard resizes content, black theme)", () => {
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.interactiveWidget).toBe("resizes-content");
    expect(viewport.themeColor).toBe("#000000");
  });

  it("calls notFound() while assistant.enabled is off and renders nothing", async () => {
    await expect(AssistantPage()).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("renders the full-screen Vinnie shell when the flag is on", async () => {
    flag.enabled = true;
    const html = renderToStaticMarkup(await AssistantPage());
    expect(html).toContain('data-testid="assistant-app"');
    expect(html).toContain("Hi, I&#x27;m Vinnie. What can I help you build today?");
    expect(html).toContain("Vending Connector AI");
    expect(html).toMatch(/vinnie-vc-badge\.png/);
  });
});
