import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveActor, type Actor } from "@/lib/assistant/actor";
import { PROMPT_VERSION } from "@/lib/assistant/config";
import { AssistantError } from "@/lib/assistant/errors";
import { GUEST_COOKIE, generateGuestToken, guestCookieOptions } from "@/lib/assistant/guestToken";
import { guarded, publicThread } from "@/lib/assistant/http";
import { closeThread, createThread, findGuestThread, listUserThreads, type ThreadRow } from "@/lib/assistant/threads";

export const dynamic = "force-dynamic";

const createBody = z.object({ new_conversation: z.boolean().optional() }).strict();

/** GET /api/assistant/threads — the caller's own threads. */
export async function GET(req: NextRequest) {
  return guarded(async () => {
    const actor = await resolveActor(req);
    if (actor.kind === "user") {
      const threads = await listUserThreads(actor.profile.id);
      return NextResponse.json({ viewer: "user", threads: threads.map(publicThread) });
    }
    if (actor.kind === "guest") {
      const t = await findGuestThread(actor.token);
      return NextResponse.json({ viewer: "guest", threads: t ? [publicThread(t)] : [] });
    }
    return NextResponse.json({ viewer: "anonymous", threads: [] });
  });
}

async function readBody(req: NextRequest): Promise<{ new_conversation?: boolean }> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  const parsed = createBody.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new AssistantError("invalid_input", "Invalid request body.");
  return parsed.data;
}

async function createForUser(actor: Extract<Actor, { kind: "user" }>): Promise<NextResponse> {
  const thread = await createThread(
    { kind: "user", userId: actor.profile.id },
    { promptVersion: PROMPT_VERSION, storefrontTenantId: actor.storefront?.tenantId ?? null },
  );
  return NextResponse.json({ thread: publicThread(thread) }, { status: 201 });
}

async function createForGuest(existing: ThreadRow | null, newConversation: boolean, currentToken: string | null): Promise<NextResponse> {
  if (existing && !newConversation) return NextResponse.json({ thread: publicThread(existing) });
  if (existing && currentToken) await closeThread(existing.id, { kind: "guest", token: currentToken });
  // A fresh token per guest conversation: the old thread is closed and
  // its hash no longer matches anything the browser holds.
  const token = generateGuestToken();
  const thread = await createThread({ kind: "guest", token }, { promptVersion: PROMPT_VERSION });
  const res = NextResponse.json({ thread: publicThread(thread) }, { status: 201 });
  res.cookies.set(GUEST_COOKIE, token, guestCookieOptions());
  return res;
}

/** POST /api/assistant/threads — create (or, for guests, reuse) a thread. */
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const body = await readBody(req);
    const actor = await resolveActor(req);
    if (actor.kind === "user") return createForUser(actor);
    const existing = actor.kind === "guest" ? await findGuestThread(actor.token) : null;
    return createForGuest(existing, !!body.new_conversation, actor.kind === "guest" ? actor.token : null);
  });
}
