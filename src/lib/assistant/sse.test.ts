import { describe, it, expect } from "vitest";
import { encodeSseEvent, sseEventSchema, SSE_PROTOCOL_VERSION } from "./sse";

describe("SSE event protocol", () => {
  it("encodes every supported event type as a schema-valid frame", () => {
    const events = [
      { type: "response_started", thread_id: "t", user_message_id: "m" },
      { type: "text_delta", delta: "hi\nthere" },
      { type: "tool_started", tool: "search_catalog", label: "Checking the catalog" },
      { type: "tool_completed", tool: "search_catalog", ok: true },
      { type: "block", block: { type: "notice", text: "x" } },
      { type: "response_completed", message_id: "a", usage: { input_tokens: 1, output_tokens: 2 } },
      { type: "response_interrupted", message_id: null, reason: "client_disconnected" },
      { type: "error", code: "upstream_error", message: "x" },
    ] as const;
    for (const e of events) {
      const frame = encodeSseEvent(e);
      expect(frame.startsWith(`event: ${e.type}\ndata: `)).toBe(true);
      expect(frame.endsWith("\n\n")).toBe(true);
      const data = JSON.parse(frame.split("\ndata: ")[1].trim());
      expect(sseEventSchema.safeParse(data).success).toBe(true);
      expect(data.v).toBe(SSE_PROTOCOL_VERSION);
    }
  });

  it("rejects unknown event types and malformed blocks", () => {
    expect(() => encodeSseEvent({ type: "reasoning", delta: "secret" } as never)).toThrow();
    expect(() => encodeSseEvent({ type: "block", block: { type: "raw_sql", rows: [] } } as never)).toThrow();
  });
});
