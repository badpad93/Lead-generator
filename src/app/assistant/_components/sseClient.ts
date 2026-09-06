import type { SseEvent } from "./types";

/**
 * Minimal SSE frame parser over a fetch() body. EventSource cannot POST,
 * so the stream is read manually. Frames are `event: <type>\ndata: <json>\n\n`.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const onAbort = () => reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = drainFrames(buffer, onEvent);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function drainFrames(buffer: string, onEvent: (event: SseEvent) => void): string {
  let rest = buffer;
  for (;;) {
    const idx = rest.indexOf("\n\n");
    if (idx < 0) return rest;
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const data = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!data) continue;
    try {
      onEvent(JSON.parse(data.slice(6)) as SseEvent);
    } catch {
      /* ignore malformed frame */
    }
  }
}
