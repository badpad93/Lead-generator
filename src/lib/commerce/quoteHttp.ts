import { NextRequest, NextResponse } from "next/server";
import { resolveActor, type Actor } from "@/lib/assistant/actor";
import { isAssistantCheckoutEnabled, isAssistantEnabled, isAssistantWriteToolsEnabled } from "@/lib/assistant/flags";
import { DISABLED_RESPONSE } from "@/lib/assistant/http";
import { isQuoteError, QuoteError } from "./quoteTypes";
import type { QuoteViewer } from "./quotes";

/**
 * Shared plumbing for /api/assistant/quote* routes: the assistant flag,
 * the customer identity (server-resolved, never from the body), the
 * write/checkout flags, and one error mapper.
 */
export interface Customer {
  actor: Extract<Actor, { kind: "user" }>;
  viewer: QuoteViewer;
}

export async function requireCustomer(req: NextRequest): Promise<Customer> {
  const actor = await resolveActor(req);
  if (actor.kind !== "user") throw new QuoteError("authentication_required", "Sign in to build, save, email, or check out a quote.");
  return { actor, viewer: { userId: actor.profile.id, storefront: actor.storefront } };
}

export async function requireWriteTools(): Promise<void> {
  if (!(await isAssistantWriteToolsEnabled())) throw new QuoteError("write_tools_disabled", "Saved quotes are not available yet.");
}

export async function requireCheckout(): Promise<void> {
  if (!(await isAssistantCheckoutEnabled())) throw new QuoteError("checkout_disabled", "Checkout is not available yet.");
}

export function toQuoteErrorResponse(e: unknown): NextResponse {
  if (isQuoteError(e)) return NextResponse.json({ error: { code: e.code, message: e.message, ...e.details } }, { status: e.status });
  console.error("[commerce/http] unexpected error:", e instanceof Error ? e.message : String(e));
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500 });
}

/** Wrap a quote route: 404-as-disabled while assistant.enabled is off, typed errors otherwise. */
export async function quoteRoute(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    if (!(await isAssistantEnabled())) return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
    return await handler();
  } catch (e) {
    return toQuoteErrorResponse(e);
  }
}

export async function readJson<T>(req: NextRequest, parse: (v: unknown) => T): Promise<T> {
  const json = await req.json().catch(() => null);
  try {
    return parse(json);
  } catch {
    throw new QuoteError("invalid_operation", "The request body was not valid.");
  }
}
