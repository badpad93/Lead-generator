import { describe, it, expect } from "vitest";
import { APPROVED_COPY, APPROVED_COPY_VERSION } from "./content/approvedCopy";
import { PROMPT_VERSION } from "./config";
import { buildSystemPrompt } from "./systemPrompt";
import { TOOL_DESCRIPTIONS } from "./tools/schemas";

/**
 * The prompt teaches the sales workflow without ever letting the model do
 * the math: 10/10/10 first, honest downsell, website unless declined,
 * confirmation before the plan, explicit confirmation before the quote,
 * the financing close, and the sensitive-data rule.
 */
describe("business-plan prompt behaviour", () => {
  const prompt = buildSystemPrompt({ authenticated: true, storefrontName: null });
  it("was versioned for the change and the approved copy matches", () => {
    expect(PROMPT_VERSION).toBe("2026-09-10.2");
    expect(APPROVED_COPY_VERSION).toBe(PROMPT_VERSION);
  });
  it("never lets the model compute a financial figure", () => {
    expect(prompt).toContain("never compute, estimate, or adjust a number yourself");
    expect(prompt).toContain("comes from calculate_vending_business_plan or the saved-plan tools");
    expect(TOOL_DESCRIPTIONS.calculate_vending_business_plan).toContain("never compute them yourself");
  });
  it("sells top-down with an honest downsell and keeps the website unless declined", () => {
    expect(prompt).toContain("lead with the 10/10/10 Launch Plan");
    expect(prompt).toContain("step down to the 5-Machine Growth Plan and finally the 1-Machine Starter Plan only on capital, capacity, or risk objections");
    expect(prompt).toContain("never present the three as equal choices");
    expect(prompt).toContain("say so plainly and recommend the smaller start");
    expect(prompt).toContain("included in every package unless the customer affirmatively declines it");
    expect(prompt).toContain("never drop it silently");
  });
  it("asks one to three questions at a time, labels sources, and confirms before the plan and before the quote", () => {
    expect(prompt).toContain("ask one to three related questions per turn");
    expect(prompt).toContain("never repeat a question already answered");
    expect(prompt).toContain("labelled customer-supplied, Vending Connector default, or calculated");
    expect(prompt).toContain("get the customer's confirmation before presenting the final plan");
    expect(prompt).toContain("send confirm:true only after the customer explicitly asks for the quote");
  });
  it("closes with the financing application without implying approval, and never collects sensitive data", () => {
    expect(prompt).toContain("start_financing_application; it is an application the lender decides, never an approval, and it creates no invoice");
    expect(prompt).toContain("ask for an approximate credit score or range when financing interests them");
    expect(prompt).toContain("An approximate credit score or credit range is welcome as a planning input");
    expect(prompt).toContain("Never ask for, and never accept, card numbers, bank or routing numbers, Social Security numbers");
    expect(prompt).toContain("illustrative projection, never guaranteed income");
    expect(prompt).toContain("No pressure, no invented scarcity");
  });
  it("the approved copy states the defaults, the ladder, and the illustrative payments without promising outcomes", () => {
    for (const s of ["$800 stabilized monthly sales per cooler", "$3.50 average transaction", "5.85% processing", "$0.22 per debit transaction", "about $726.83 a month", "about $1,366.89 a month", "10/10/10 Launch Plan", "5-Machine Growth Plan", "1-Machine Starter Plan", "working capital is never an invoice line", "never assigns a location tier"]) {
      expect(APPROVED_COPY).toContain(s);
    }
    expect(APPROVED_COPY).not.toMatch(/is guaranteed|guaranteed (income|approval) of|you will be approved/i);
  });
});
