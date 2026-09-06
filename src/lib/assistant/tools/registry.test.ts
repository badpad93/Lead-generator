import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("db should not be reached in schema tests"); } } }));

import { TOOL_DEFINITIONS, openAIToolDefinitions, dispatchTool, TOOL_OUTPUT_MAX_BYTES } from "./registry";
import { JSON_SCHEMAS, TOOL_NAMES, ZOD_SCHEMAS, type JsonSchemaObject } from "./schemas";
import type { ToolContext } from "./context";

const FORBIDDEN_INPUT_WORDS = ["price", "discount", "tax", "shipping", "total", "margin", "commission", "eligib", "payment", "role", "tenant", "owner", "user_id", "profile"];

function walkSchemaObjects(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (o.type === "object") visit(o);
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach((x) => walkSchemaObjects(x, visit));
    else if (v && typeof v === "object") walkSchemaObjects(v, visit);
  }
}

const guestCtx: ToolContext = { threadId: "t1", profile: null, storefront: null };

describe("tool registry — exactly five strict read-only tools", () => {
  it("registers exactly the five allowed tools", () => {
    expect(TOOL_NAMES).toEqual(["search_catalog", "get_product_details", "compare_products", "get_customer_context", "get_order_status"]);
    expect(TOOL_DEFINITIONS).toHaveLength(5);
    expect(openAIToolDefinitions()).toHaveLength(5);
    expect(Object.keys(ZOD_SCHEMAS)).toHaveLength(5);
  });

  it("every tool is a strict function tool", () => {
    for (const t of openAIToolDefinitions()) {
      expect(t.type).toBe("function");
      expect(t.strict).toBe(true);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it("every object level sets additionalProperties:false and lists all properties as required", () => {
    for (const name of TOOL_NAMES) {
      walkSchemaObjects(JSON_SCHEMAS[name], (obj) => {
        expect(obj.additionalProperties).toBe(false);
        const props = Object.keys((obj.properties as Record<string, unknown>) ?? {});
        expect([...(obj.required as string[])].sort()).toEqual([...props].sort());
      });
    }
  });

  it("no tool accepts price, discount, tax, shipping, total, commission, tenant, role, or ownership input", () => {
    for (const name of TOOL_NAMES) {
      const props = Object.keys((JSON_SCHEMAS[name] as JsonSchemaObject).properties);
      for (const p of props) {
        for (const w of FORBIDDEN_INPUT_WORDS) expect(p.toLowerCase()).not.toContain(w);
      }
    }
  });

  it("re-validates arguments server-side with Zod (unknown keys and bad values are rejected)", async () => {
    const bad = await dispatchTool("search_catalog", JSON.stringify({ kind: "coffee", query: null, category_slug: null, limit: 5, price: 1 }), guestCtx);
    expect(bad.ok).toBe(false);
    expect(bad.errorCode).toBe("invalid_arguments");
    const badLimit = await dispatchTool("search_catalog", JSON.stringify({ kind: "coffee", query: null, category_slug: null, limit: 500 }), guestCtx);
    expect(badLimit.errorCode).toBe("invalid_arguments");
    const malformed = await dispatchTool("compare_products", "{not json", guestCtx);
    expect(malformed.errorCode).toBe("invalid_arguments");
    const both = ZOD_SCHEMAS.get_order_status.safeParse({ order_id: "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11", order_number: "VC-1" });
    expect(both.success).toBe(false);
  });

  it("refuses authenticated-only tools for guests with a safe model-visible message", async () => {
    const r = await dispatchTool("get_order_status", JSON.stringify({ order_id: null, order_number: "VC-1" }), guestCtx);
    expect(r.ok).toBe(false);
    expect(r.status).toBe("refused");
    expect(r.errorCode).toBe("authentication_required");
    expect(JSON.stringify(r.output)).not.toMatch(/stack|Error:|supabase/i);
  });

  it("converts execution failures into safe outputs with no stack traces or DB errors", async () => {
    const r = await dispatchTool("search_catalog", JSON.stringify({ kind: "coffee", query: "x", category_slug: null, limit: 3 }), guestCtx);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("execution_failed");
    const text = JSON.stringify(r.output);
    expect(text).not.toContain("db should not be reached");
    expect(text).not.toMatch(/at .*\.ts:\d+/);
    expect(r.outputDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("bounds output size", () => {
    expect(TOOL_OUTPUT_MAX_BYTES).toBeLessThanOrEqual(64_000);
  });
});
