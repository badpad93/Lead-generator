import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AssistantClient from "./AssistantClient";
import { Composer } from "./_components/Composer";
import { ConversationDrawer } from "./_components/ConversationDrawer";
import { MessageList } from "./_components/MessageList";
import { StatusBanner } from "./_components/StatusBanner";
import { ThreadSidebar } from "./_components/ThreadSidebar";
import { VinnieAvatar, VINNIE_BADGE_SRC } from "./_components/VinnieAvatar";
import { BlockView } from "./_components/Blocks";
import type { ChatMessage, UiBlock, UiState } from "./_components/types";

/**
 * Static render of the client UI (server-side, no effects). Guards the
 * locked identity, the full-screen shell, and the palette rule: the only
 * accent is the centralized `vinnie-green` token; the site's green-* scale
 * and every other hue stay out of the assistant markup.
 */
const COLOR = /\b(?:bg|text|border|ring|from|to|via)-(?:green|amber|red|blue|yellow|emerald|orange|purple|pink|light)(?:-|\b)/;
/** The badge is served as a committed public asset through next/image (never base64, never remote). */
const BADGE = /\/assistant\/vinnie-vc-badge\.png|%2Fassistant%2Fvinnie-vc-badge\.png/;
const MONOGRAM = /border border-white font-semibold[^>]*>V</;
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => undefined;

const ITEM = { product_id: "p1", name: "Office Brewer", category: "Coffee", display_price: 199, unit: "each", availability: "available", href: "/coffee/p1", attributes: [{ label: "Capacity", value: "12 cups" }] };
const BLOCKS: UiBlock[] = [
  { type: "product_cards", kind: "coffee", items: [ITEM, { ...ITEM, product_id: "p2", availability: "low_stock" }, { ...ITEM, product_id: "p3", availability: "unavailable" }] },
  { type: "product_detail", item: ITEM },
  { type: "comparison", kind: "coffee", attribute_labels: ["Capacity"], items: [ITEM, { ...ITEM, product_id: "p2" }] },
  { type: "customer_context", context: { authenticated: false } },
  { type: "customer_context", context: { authenticated: true, first_name: "Jamie", role_class: "operator", counts: { coffee_orders: 2, workflows: 1 } } },
  { type: "order_status", status: "authentication_required", record: null },
  { type: "order_status", status: "found", record: { reference: "VC-1", record_type: "coffee_order", public_status: "shipped", date: "2026-09-01", payment_status: "paid", total: 42, items: [{ name: "Beans", quantity: 2 }], stages: [{ label: "Placed", status: "completed" }, { label: "Shipped", status: "in_progress" }, { label: "Delivered", status: "pending" }], href: "/orders/1" } },
  { type: "notice", text: "Tiers are assessed by the location team." },
];
const MESSAGES: ChatMessage[] = [
  { id: "u1", role: "user", content: "Show me coffee options", blocks: [], interrupted: false, created_at: "2026-09-07T00:00:00Z" },
  { id: "a1", role: "assistant", content: "Here are three options.", blocks: BLOCKS, interrupted: false, created_at: "2026-09-07T00:00:01Z", streaming: true, activity: "Searching the catalog" },
  { id: "a2", role: "assistant", content: "", blocks: [], interrupted: true, created_at: "2026-09-07T00:00:02Z" },
];

describe("full-screen Vinnie shell", () => {
  const html = render(createElement(AssistantClient, { maxMessageLength: 2000 }));

  it("owns exactly one viewport: 100dvh root, overflow hidden, single scroll container, no nested <main>", () => {
    expect(html).toContain('class="flex h-[100dvh] w-full overflow-hidden bg-black text-white" data-testid="assistant-app"');
    expect(html).toContain("html,body{background:#000;overflow:hidden}");
    expect(html.match(/overflow-y-auto/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('data-testid="conversation-scroll"');
    expect(html).not.toContain("<main");
    expect(html).not.toContain("<nav");
  });

  it("shows the locked identity: name, label, greeting, and the approved VC badge (not the old monogram)", () => {
    expect(html).toContain("<h1 class=\"truncate text-sm font-semibold text-white\">Vinnie</h1>");
    expect(html).toContain("Vending Connector AI");
    expect(html).toContain("Hi, I&#x27;m Vinnie. What can I help you build today?");
    expect(html).toContain('data-testid="vinnie-avatar"');
    expect(html).toMatch(BADGE);
    expect(html).not.toMatch(MONOGRAM);
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("Vending Connector Assistant");
  });

  it("header badge is ~40px, message badge ~28px; no availability dot before the first fetch resolves", () => {
    expect(html).toContain('data-size="md"');
    expect(html).not.toContain('data-testid="vinnie-online"');
  });

  it("anchors the composer with safe-area padding and 44px touch targets", () => {
    expect(html).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
    expect(html).toContain("pt-[env(safe-area-inset-top)]");
    expect(html).toContain('data-testid="assistant-composer"');
    expect(html).toContain("h-11 w-11");
    expect(html).toContain('aria-label="Toggle conversations"');
    expect(html).toContain('aria-label="New conversation"');
  });

  it("uses only the vinnie-green accent (no other hues) and keeps the desktop sidebar hidden below lg", () => {
    expect(html).not.toMatch(COLOR);
    expect(html).toContain("vinnie-green");
    // Restraint: the accent never paints a surface, only borders/icons/dots.
    expect(html).not.toContain("bg-vinnie-green");
    expect(html).toContain("hidden w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 pt-[env(safe-area-inset-top)] lg:flex");
    expect(html).not.toContain('data-testid="conversation-drawer"');
  });

  it("starts in the loading state with the composer locked (not 'unavailable') and the sensitive-data notice visible", () => {
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Connecting to Vinnie…");
    expect(html).not.toContain("Vinnie is unavailable right now");
    expect(html).toContain("Do not share card, bank, Social Security, credit, or income details here.");
  });
});

describe("VinnieAvatar badge", () => {
  it("renders the approved asset through next/image inside a round, clipped, black-ringed wrapper", () => {
    const html = render(createElement(VinnieAvatar, { size: "md" }));
    expect(VINNIE_BADGE_SRC).toBe("/assistant/vinnie-vc-badge.png");
    expect(html).toMatch(BADGE);
    expect(html).toContain("overflow-hidden rounded-full bg-white ring-2 ring-black");
    expect(html).toContain("scale-[1.04] rounded-full object-cover");
    expect(html).toContain('width="40"');
    expect(html).not.toMatch(MONOGRAM);
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("http");
  });

  it("is decorative by default (beside visible Vinnie text) and labelled when alt text is given", () => {
    const decorative = render(createElement(VinnieAvatar, { size: "sm" }));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).toContain('alt=""');
    expect(decorative).toContain('width="28"');
    const labelled = render(createElement(VinnieAvatar, { alt: "Vinnie, the Vending Connector AI" }));
    expect(labelled).toContain('alt="Vinnie, the Vending Connector AI"');
    expect(labelled).not.toContain('aria-hidden="true"');
  });

  it("shows the green availability dot only when online", () => {
    const online = render(createElement(VinnieAvatar, { size: "md", online: true }));
    expect(online).toContain('data-testid="vinnie-online"');
    expect(online).toContain("bg-vinnie-green");
    expect(online).toContain('aria-label="Vinnie is available"');
    expect(render(createElement(VinnieAvatar, { size: "md" }))).not.toContain('data-testid="vinnie-online"');
  });
});

describe("status banners", () => {
  const states: UiState[] = [
    { kind: "disabled" },
    { kind: "config_error", message: "x" },
    { kind: "rate_limited", message: "Too many messages. Try again in a minute." },
    { kind: "network_error", message: "Connection lost." },
    { kind: "rejected", message: "That looks like a card number." },
  ];
  it("renders the disabled state as Vinnie unavailable, in monochrome", () => {
    const html = render(createElement(StatusBanner, { state: { kind: "disabled" } }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Vinnie is not available right now.");
    expect(html).not.toMatch(COLOR);
  });
  it("renders every error state monochrome and renders nothing when idle", () => {
    for (const state of states) expect(render(createElement(StatusBanner, { state }))).not.toMatch(COLOR);
    expect(render(createElement(StatusBanner, { state: { kind: "idle" } }))).toBe("");
    expect(render(createElement(StatusBanner, { state: { kind: "streaming" } }))).toBe("");
  });
});

describe("existing components under the monochrome theme", () => {
  it("MessageList labels assistant turns as Vinnie with the V avatar and renders every block type", () => {
    const html = render(createElement(MessageList, { messages: MESSAGES }));
    expect(html).toContain('role="log"');
    expect(html).toContain('<div class="text-xs font-medium text-neutral-400">Vinnie</div>');
    expect(html).toContain('data-testid="vinnie-avatar"');
    expect(html).toContain('data-size="sm"');
    expect(html).toMatch(BADGE);
    expect(html).not.toMatch(MONOGRAM);
    expect(html).toContain("Searching the catalog…");
    expect(html).toContain("animate-spin text-vinnie-green");
    expect(html).toContain("This response was interrupted.");
    expect(html).toContain("Office Brewer");
    expect(html).toContain("Tiers are assessed by the location team.");
    expect(html).not.toMatch(COLOR);
  });

  it("each block renders monochrome on its own", () => {
    for (const block of BLOCKS) expect(render(createElement(BlockView, { block }))).not.toMatch(COLOR);
  });

  it("comparison table overrides the light global table theme", () => {
    const html = render(createElement(BlockView, { block: BLOCKS[2] }));
    expect(html).toContain("[&amp;_tr:hover_td]:!bg-neutral-800");
    expect(html).toContain("[&amp;_th]:!bg-neutral-900");
  });

  it("Composer: labeled for Vinnie, white-on-black send button, stop button while streaming", () => {
    const idle = render(createElement(Composer, { disabled: false, streaming: false, maxLength: 10, onSend: noop, onStop: noop }));
    expect(idle).toContain("Message Vinnie");
    expect(idle).toContain('aria-label="Send message"');
    expect(idle).toContain("border-vinnie-green bg-black text-vinnie-green");
    expect(idle).toContain("!text-white");
    expect(idle).not.toMatch(COLOR);
    const streaming = render(createElement(Composer, { disabled: false, streaming: true, maxLength: 10, onSend: noop, onStop: noop }));
    expect(streaming).toContain('aria-label="Stop generating"');
    const disabled = render(createElement(Composer, { disabled: true, streaming: false, maxLength: 10, onSend: noop, onStop: noop }));
    expect(disabled).toContain("Vinnie is unavailable right now");
    const loading = render(createElement(Composer, { disabled: false, loading: true, streaming: false, maxLength: 10, onSend: noop, onStop: noop }));
    expect(loading).toContain("Connecting to Vinnie…");
    expect(loading).toContain('disabled=""');
  });

  it("ThreadSidebar: guest notice for guests, history for users, active thread marked", () => {
    const base = { activeId: "t1", onSelect: noop, onNew: noop, disabled: false };
    const guest = render(createElement(ThreadSidebar, { ...base, viewer: "guest", threads: [] }));
    expect(guest).toContain("Guest conversations are kept on this device.");
    expect(guest).not.toMatch(COLOR);
    const threads = [{ id: "t1", title: "Coffee", status: "open", last_activity_at: "", created_at: "" }, { id: "t2", title: null, status: "open", last_activity_at: "", created_at: "" }];
    const user = render(createElement(ThreadSidebar, { ...base, viewer: "user", threads }));
    expect(user).toContain('aria-current="true"');
    expect(user).toContain("shrink-0 text-vinnie-green");
    expect(user).toContain("Untitled conversation");
    expect(user).toContain('aria-label="Conversation history"');
  });

  it("ConversationDrawer: modal dialog when open, nothing when closed", () => {
    const open = render(createElement(ConversationDrawer, { open: true, onClose: noop }, "history"));
    expect(open).toContain('role="dialog"');
    expect(open).toContain('aria-modal="true"');
    expect(open).toContain('aria-label="Close conversations"');
    expect(open).not.toMatch(COLOR);
    expect(render(createElement(ConversationDrawer, { open: false, onClose: noop }, "history"))).toBe("");
  });
});
