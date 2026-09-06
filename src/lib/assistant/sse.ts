import { z } from "zod";

/**
 * Server-sent event protocol between the messages route and the browser.
 * Every event is versioned and schema-validated on the way out so the
 * client can rely on the shape, and nothing unplanned (tool internals,
 * stack traces, reasoning) can slip into the stream.
 */
export const SSE_PROTOCOL_VERSION = 1 as const;

const base = { v: z.literal(SSE_PROTOCOL_VERSION) };

export const uiBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("product_cards"), kind: z.string(), items: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal("product_detail"), item: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("comparison"), kind: z.string(), attribute_labels: z.array(z.string()), items: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal("customer_context"), context: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("order_status"), status: z.string(), record: z.record(z.string(), z.unknown()).nullable() }),
  z.object({ type: z.literal("notice"), text: z.string() }),
]);
export type UiBlock = z.infer<typeof uiBlockSchema>;

export const sseEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("response_started"), thread_id: z.string(), user_message_id: z.string() }),
  z.object({ ...base, type: z.literal("text_delta"), delta: z.string() }),
  z.object({ ...base, type: z.literal("tool_started"), tool: z.string(), label: z.string() }),
  z.object({ ...base, type: z.literal("tool_completed"), tool: z.string(), ok: z.boolean() }),
  z.object({ ...base, type: z.literal("block"), block: uiBlockSchema }),
  z.object({ ...base, type: z.literal("response_completed"), message_id: z.string(), usage: z.object({ input_tokens: z.number().nullable(), output_tokens: z.number().nullable() }) }),
  z.object({ ...base, type: z.literal("response_interrupted"), message_id: z.string().nullable(), reason: z.enum(["client_disconnected", "max_tool_rounds", "upstream"]) }),
  z.object({ ...base, type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type SseEvent = z.infer<typeof sseEventSchema>;
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type SseEventInput = DistributiveOmit<SseEvent, "v">;

/** Validate and encode one event as an SSE frame. */
export function encodeSseEvent(input: SseEventInput): string {
  const event = sseEventSchema.parse({ v: SSE_PROTOCOL_VERSION, ...input });
  // Newlines inside JSON are escaped by JSON.stringify, so one data line suffices.
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const TOOL_LABELS: Record<string, string> = {
  search_catalog: "Checking the catalog",
  get_product_details: "Looking up product details",
  compare_products: "Comparing products",
  get_customer_context: "Checking your account",
  get_order_status: "Checking order status",
};

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
