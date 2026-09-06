import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { findProhibitedKey, PublicShapeViolation } from "../publicShapes";
import type { ToolContext } from "./context";
import { JSON_SCHEMAS, TOOL_DESCRIPTIONS, TOOL_NAMES, ZOD_SCHEMAS, type JsonSchemaObject, type ToolName } from "./schemas";
import { runSearchCatalog } from "./searchCatalog";
import { runGetProductDetails } from "./getProductDetails";
import { runCompareProducts } from "./compareProducts";
import { runGetCustomerContext } from "./getCustomerContext";
import { runGetOrderStatus } from "./getOrderStatus";

/**
 * Central registry for exactly five read-only tools.
 *
 * The dispatcher is the only path from a model tool call to code: it
 * re-validates arguments with Zod, enforces a wall-clock budget, checks
 * the output against the prohibited-key list and a size cap, digests the
 * output for the audit row, and converts every failure into a small,
 * stable error the model can read. Stack traces and database messages
 * never reach the model or the customer.
 */
export type ToolAuthorization = "public" | "authenticated";

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: JsonSchemaObject;
  authorization: ToolAuthorization;
  strict: true;
}

export type ToolErrorCode = "invalid_arguments" | "timeout" | "output_rejected" | "execution_failed" | "authentication_required";

export interface ToolRunResult {
  ok: boolean;
  /** JSON-serialisable, allowlisted output or a small error object. */
  output: unknown;
  errorCode: ToolErrorCode | null;
  outputDigest: string;
  latencyMs: number;
  sanitizedInput: unknown;
  status: "completed" | "refused" | "error";
}

export const TOOL_TIMEOUT_MS = 8_000;
export const TOOL_OUTPUT_MAX_BYTES = 40_000;

const AUTHORIZATION: Record<ToolName, ToolAuthorization> = {
  search_catalog: "public",
  get_product_details: "public",
  compare_products: "public",
  get_customer_context: "public", // returns authenticated:false for guests
  get_order_status: "authenticated",
};

type Handler = (input: unknown, ctx: ToolContext) => Promise<unknown>;

const HANDLERS: Record<ToolName, Handler> = {
  search_catalog: (i, c) => runSearchCatalog(i as Parameters<typeof runSearchCatalog>[0], c),
  get_product_details: (i, c) => runGetProductDetails(i as Parameters<typeof runGetProductDetails>[0], c),
  compare_products: (i, c) => runCompareProducts(i as Parameters<typeof runCompareProducts>[0], c),
  get_customer_context: (_i, c) => runGetCustomerContext(c),
  get_order_status: (i, c) => runGetOrderStatus(i as Parameters<typeof runGetOrderStatus>[0], c),
};

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = TOOL_NAMES.map((name) => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  parameters: JSON_SCHEMAS[name],
  authorization: AUTHORIZATION[name],
  strict: true as const,
}));

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/** The `tools` array sent to the Responses API. */
export function openAIToolDefinitions(): Array<{
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchemaObject;
  strict: true;
}> {
  return TOOL_DEFINITIONS.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: true,
  }));
}

export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");
}

export function idempotencyKey(threadId: string, tool: string, callId: string, input: unknown): string {
  return createHash("sha256").update(`${threadId}|${tool}|${callId}|${JSON.stringify(input) ?? ""}`).digest("hex");
}

function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

function parseArguments(name: ToolName, rawArgs: string): { ok: true; value: unknown } | { ok: false } {
  let parsed: unknown;
  try {
    parsed = rawArgs.trim() ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false };
  }
  const schema = ZOD_SCHEMAS[name] as ZodType;
  const result = schema.safeParse(parsed);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

function failure(code: ToolErrorCode, sanitizedInput: unknown, startedAt: number, message: string): ToolRunResult {
  const output = { error: { code, message } };
  return {
    ok: false,
    output,
    errorCode: code,
    outputDigest: digest(output),
    latencyMs: Date.now() - startedAt,
    sanitizedInput,
    status: code === "authentication_required" ? "refused" : "error",
  };
}

const ERROR_MESSAGES: Record<ToolErrorCode, string> = {
  invalid_arguments: "The tool arguments were not valid. Re-check the required fields and try again.",
  timeout: "The catalog took too long to respond. Tell the customer to try again in a moment.",
  output_rejected: "The result could not be shared. Apologise and offer to connect the customer with the team.",
  execution_failed: "The lookup could not be completed right now. Apologise and offer to connect the customer with the team.",
  authentication_required: "The customer must be signed in for this. Ask them to sign in and try again.",
};

function checkOutput(output: unknown): ToolErrorCode | null {
  const hit = findProhibitedKey(output);
  if (hit) return "output_rejected";
  const bytes = Buffer.byteLength(JSON.stringify(output) ?? "", "utf8");
  return bytes > TOOL_OUTPUT_MAX_BYTES ? "output_rejected" : null;
}

function classifyError(e: unknown): ToolErrorCode {
  if (e instanceof PublicShapeViolation) return "output_rejected";
  if (e instanceof Error && (e.message === "timeout" || e.message === "aborted")) return "timeout";
  return "execution_failed";
}

/**
 * Validate, authorize, execute, and shape one tool call. Never throws.
 */
export async function dispatchTool(
  name: ToolName,
  rawArgs: string,
  ctx: ToolContext,
  signal?: AbortSignal,
): Promise<ToolRunResult> {
  const startedAt = Date.now();
  const parsed = parseArguments(name, rawArgs);
  if (!parsed.ok) return failure("invalid_arguments", null, startedAt, ERROR_MESSAGES.invalid_arguments);
  const sanitizedInput = parsed.value;
  if (AUTHORIZATION[name] === "authenticated" && !ctx.profile) {
    return failure("authentication_required", sanitizedInput, startedAt, ERROR_MESSAGES.authentication_required);
  }
  try {
    const output = await withTimeout(HANDLERS[name](sanitizedInput, ctx), TOOL_TIMEOUT_MS, signal);
    const rejected = checkOutput(output);
    if (rejected) {
      console.error(`[assistant/tools] ${name} output rejected`);
      return failure(rejected, sanitizedInput, startedAt, ERROR_MESSAGES[rejected]);
    }
    return {
      ok: true,
      output,
      errorCode: null,
      outputDigest: digest(output),
      latencyMs: Date.now() - startedAt,
      sanitizedInput,
      status: "completed",
    };
  } catch (e) {
    const code = classifyError(e);
    console.error(`[assistant/tools] ${name} failed (${code}):`, e instanceof Error ? e.message : String(e));
    return failure(code, sanitizedInput, startedAt, ERROR_MESSAGES[code]);
  }
}
