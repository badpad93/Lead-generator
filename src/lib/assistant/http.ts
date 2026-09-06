import { NextResponse } from "next/server";
import { AssistantError, errorBody, isAssistantError } from "./errors";
import { isAssistantEnabled } from "./flags";

/**
 * Shared route plumbing: the disabled gate and the single error mapper.
 * Every /api/assistant/* handler wraps its body in `guarded()`.
 */
export const DISABLED_RESPONSE = { error: { code: "assistant_disabled", message: "Not found" } } as const;

export async function assertEnabled(): Promise<void> {
  if (!(await isAssistantEnabled())) throw new AssistantError("assistant_disabled", "Not found");
}

export function toErrorResponse(e: unknown): NextResponse {
  if (isAssistantError(e)) return NextResponse.json(errorBody(e), { status: e.status });
  console.error("[assistant/http] unexpected error:", e instanceof Error ? e.message : String(e));
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500 });
}

export async function guarded(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    await assertEnabled();
    return await handler();
  } catch (e) {
    return toErrorResponse(e);
  }
}

export function publicThread(t: { id: string; title: string | null; status: string; last_activity_at: string; created_at: string }) {
  return { id: t.id, title: t.title, status: t.status, last_activity_at: t.last_activity_at, created_at: t.created_at };
}

export function publicMessage(m: { id: string; role: string; content: string; blocks: unknown[]; interrupted: boolean; created_at: string }) {
  return { id: m.id, role: m.role, content: m.content, blocks: m.blocks, interrupted: m.interrupted, created_at: m.created_at };
}
