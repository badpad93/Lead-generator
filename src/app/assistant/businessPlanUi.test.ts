import { describe, it, expect, vi } from "vitest";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AssistantClient from "./AssistantClient";
import { BlockView } from "./_components/Blocks";
import { MessageList } from "./_components/MessageList";
import { QuoteProvider } from "./_components/useQuote";
import type { ChatMessage, UiBlock } from "./_components/types";
import { CATALOG } from "@/lib/businessPlan/__testutils__/catalogFixture";
import { buildPlanView, defaultInputs } from "@/lib/businessPlan/plan";
import { mergeProfile, EMPTY_PROFILE } from "@/lib/businessPlan/profile";
import { recommendPackage, PACKAGES } from "@/lib/businessPlan/packages";

vi.mock("next/navigation", () => ({ usePathname: () => "/assistant" }));

/**
 * Static renders of the business-plan blocks inside the real shell.
 * Guards: every block renders from tool output alone, the palette rule
 * (only vinnie-green), tables scroll horizontally on phones, every
 * action is a real link with a visible focus ring, guests get the fixed
 * sign-in path, and the website state is explicit in both variants.
 * With VISUAL_OUT set, the shell + a long plan conversation is written
 * as HTML for the headless-browser screenshots.
 */
const COLOR = /\b(?:bg|text|border|ring|from|to|via)-(?:green|amber|red|blue|yellow|emerald|orange|purple|pink|light)(?:-|\b)/;
const render = (el: ReactNode) => renderToStaticMarkup(createElement(QuoteProvider, { viewer: "guest" } as Parameters<typeof QuoteProvider>[0], el));

const profile = mergeProfile(EMPTY_PROFILE, { operator_type: "new", business_name: "Sunrise Vending", territory: "Tampa Bay", weekly_hours_available: 20, staffing: "owner_operated", has_vehicle: true, has_storage: true, cash_available: 8000, financing_interest: true, target_machine_count: 10, monthly_cash_flow_goal: 3000, desired_launch: "Q1", vending_experience: "none", expected_location_fee_rate: 0 });
const inputs = { ...defaultInputs(), profile, confirmed: true };
const view = buildPlanView(inputs, CATALOG);
const declinedView = buildPlanView({ ...inputs, package: "five_machine", website_included: false, website_decision: "declined" }, CATALOG);
const savedOutput = { status: "saved", saved: true, plan_id: "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11", plan_number: "VP-260910-0007", version: 3, plan_status: "confirmed", quote: null, financing_status: "none", plan: view, missing_discovery: [], next_step: "", notices: [], sign_in_href: null };
const guestOutput = { ...savedOutput, status: "estimate", saved: false, plan_id: null, plan_number: null, version: null, plan_status: null, plan: declinedView, notices: ["Educational estimate only; nothing is saved."], sign_in_href: "/login?redirect=/assistant" };
const rec = recommendPackage({ ...profile, weekly_hours_available: 6 });
const BLOCKS: UiBlock[] = [
  { type: "business_plan", output: savedOutput },
  { type: "package_recommendation", recommendation: rec as unknown as Record<string, unknown>, packages: rec.ladder.map((l) => ({ package: l.package, name: l.name, machines: l.machines, estimate_total: l.estimate_total, estimate_working_capital: PACKAGES[l.package].estimate_working_capital, pitch: PACKAGES[l.package].pitch })) },
  { type: "plan_quote_preview", preview: [{ ref: "vendera-ai-cooler", name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, line_total: 37000 }, { ref: "location-service-10-10-10", name: "Location Services 10/10/10", quantity: 10, unit_price: 400, line_total: 4000 }, { ref: "website-creation", name: "Website Creation", quantity: 1, unit_price: 500, line_total: 500 }], reconciliation: { quote_subtotal: 46500, working_capital_allowance: 10000, cash_contribution: 0, financing_request: 56500, note: "Working capital is never an invoice line." } },
  { type: "plan_exports", plan_number: "VP-260910-0007", exports: [{ format: "xlsx", label: "Excel workbook (.xlsx)", href: "/api/assistant/business-plan/0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11/export?format=xlsx" }, { format: "docx", label: "Word document (.docx)", href: "/api/assistant/business-plan/0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11/export?format=docx" }, { format: "pdf", label: "PDF", href: "/api/assistant/business-plan/0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11/export?format=pdf" }] },
  { type: "financing_action", action: { status: "financing_action", plan_id: "p", package_name: "10/10/10 Launch Plan", financing_request: 56500, monthly_payment_estimates: [{ label: "SBA estimate", term_years: 10, annual_rate: 0.1, monthly_payment: 746.65 }], href: "/financing?plan=abc.def&quote=ghi.jkl", financing_status: "application_started", notice: "It is an application, not an approval." } },
];

describe("business-plan block", () => {
  const html = render(createElement(BlockView, { block: BLOCKS[0] }));
  it("renders the saved-plan header, every section, and the disclaimers from tool output alone", () => {
    expect(html).toContain("Saved plan VP-260910-0007 · version 3");
    expect(html).toContain("10/10/10 Launch Plan");
    for (const id of ["plan-assumptions", "plan-scenarios", "plan-economics", "plan-sources-uses", "plan-timeline", "plan-financing", "plan-recommendation"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain("Vending Connector default");
    expect(html).toContain("$726.83");
    expect(html).toContain("not guaranteed income");
    expect(html).toContain("Assumptions confirmed");
    expect(html).not.toContain("plan-guest-actions");
  });
  it("shows the website as included, and the declined variant explicitly (never silently dropped)", () => {
    expect(html).toMatch(/data-testid="plan-website-state">Website included</);
    const guest = render(createElement(BlockView, { block: { type: "business_plan", output: guestOutput } }));
    expect(guest).toMatch(/data-testid="plan-website-state">Website declined</);
    expect(guest).toContain("Declined by the customer.");
    expect(guest).toContain("5-Machine Growth Plan");
    expect(guest).toContain("allowance");
  });
  it("gives guests one fixed sign-in link and marks the estimate as unsaved", () => {
    const guest = render(createElement(BlockView, { block: { type: "business_plan", output: guestOutput } }));
    expect(guest).toContain("Educational estimate · not saved");
    expect(guest).toMatch(/<a [^>]*href="\/login\?redirect=\/assistant"[^>]*>Sign in to save this plan<\/a>/);
    expect(guest.match(/href="\/login/g)?.length).toBe(1);
  });
  it("keeps every table in its own horizontal scroll region and uses only the vinnie-green accent", () => {
    const tables = html.match(/<table/g)?.length ?? 0;
    expect(tables).toBeGreaterThanOrEqual(6);
    expect(html.match(/overflow-x-auto/g)?.length).toBe(tables);
    expect(html).not.toMatch(COLOR);
    expect(html).not.toContain("bg-vinnie-green");
    expect(html).not.toContain("<svg");
  });
  it("long sections are native <details> with a keyboard-operable summary; the summary and scenarios start open", () => {
    expect(html.match(/<details/g)?.length).toBe(6);
    expect(html).toMatch(/<details open="" class="[^"]*" data-testid="plan-assumptions">/);
    expect(html).toMatch(/<details class="[^"]*" data-testid="plan-economics">/);
    expect(html.match(/<summary class="cursor-pointer[^"]*focus-visible:ring-2/g)?.length).toBe(6);
  });
});

describe("other plan blocks", () => {
  it("package recommendation lists the ladder top-down with the lead first and the honest recommendation marked", () => {
    const html = render(createElement(BlockView, { block: BLOCKS[1] }));
    const order = ["10/10/10 Launch Plan", "5-Machine Growth Plan", "1-Machine Starter Plan"].map((n) => html.indexOf(n));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("Lead offer · 10/10/10 Launch Plan");
    expect(html).toContain("recommended starting point");
    expect(html).toContain("hours a week");
  });
  it("quote preview shows lines and reconciliation but no create button (confirmation happens in chat)", () => {
    const html = render(createElement(BlockView, { block: BLOCKS[2] }));
    expect(html).toContain("Quote preview (not created yet)");
    expect(html).toContain("$46,500.00");
    expect(html).toContain("financing request $56,500.00");
    expect(html).not.toContain("<button");
  });
  it("exports are three real links to the server route", () => {
    const html = render(createElement(BlockView, { block: BLOCKS[3] }));
    for (const f of ["xlsx", "docx", "pdf"]) expect(html).toMatch(new RegExp(`<a href="/api/assistant/business-plan/[0-9a-f-]{36}/export\\?format=${f}"[^>]*data-testid="plan-export-${f}"`));
  });
  it("financing action is a prominent VC-branded link to the fixed first-party path, never an external URL, with no approval language", () => {
    const html = render(createElement(BlockView, { block: BLOCKS[4] }));
    const link = html.match(/<a [^>]*data-testid="financing-action-link"[^>]*>Open the secure financing application<\/a>/)?.[0] ?? "";
    expect(link).toContain('href="/financing?plan=abc.def&amp;quote=ghi.jkl"');
    expect(html).toContain("border-vinnie-green");
    expect(html).not.toMatch(/approved/i);
    const external = render(createElement(BlockView, { block: { type: "financing_action", action: { href: "https://evil.example/steal", package_name: "x" } } }));
    expect(external).toContain('href="/financing"');
    expect(external).not.toContain("evil.example");
  });
  it("every actionable element carries a visible focus style and a 44px target", () => {
    const html = BLOCKS.slice(1).map((b) => render(createElement(BlockView, { block: b }))).join("");
    for (const a of html.match(/<a [^>]*>/g) ?? []) {
      expect(a).toContain("focus-visible:ring-2");
      expect(a).toContain("min-h-11");
    }
  });
});

describe("inside the full-screen shell", () => {
  const messages: ChatMessage[] = [
    { id: "u1", role: "user", content: "I want to start a vending business in Tampa with about $8,000 and 20 hours a week.", blocks: [], interrupted: false, created_at: "2026-09-10T00:00:00Z" },
    { id: "a1", role: "assistant", content: "Here is the plan with the assumptions labelled by source. Confirm them and I will build the quote.", blocks: BLOCKS, interrupted: false, created_at: "2026-09-10T00:00:01Z" },
  ];
  it("renders a long plan conversation without adding a second scroll container or a nav/main landmark", () => {
    const shell = renderToStaticMarkup(createElement(AssistantClient, { maxMessageLength: 2000 }));
    const conversation = render(createElement(MessageList, { messages }));
    expect(conversation.match(/overflow-y-auto/g)).toBeNull();
    expect(conversation).not.toContain("<nav");
    expect(conversation).not.toContain("<main");
    expect(conversation).not.toMatch(COLOR);
    const out = process.env.VISUAL_OUT;
    if (out) {
      // The shell's empty-state greeting is replaced by the rendered conversation for the headless screenshots.
      const start = shell.indexOf('data-testid="assistant-greeting"');
      const openTag = shell.lastIndexOf("<", start);
      const inner = shell.slice(openTag);
      let depth = 0;
      let end = 0;
      for (const m of inner.matchAll(/<(\/?)[a-z][^>]*?(\/?)>/g)) {
        if (m[2] === "/") continue;
        depth += m[1] === "/" ? -1 : 1;
        if (depth === 0) {
          end = openTag + m.index + m[0].length;
          break;
        }
      }
      const composed = shell.slice(0, openTag) + conversation + shell.slice(end);
      const cssDir = join(process.cwd(), ".next", "static", "chunks");
      const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n");
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "plan-shell.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body class="bg-black">${composed}</body></html>`);
    }
  });
});
