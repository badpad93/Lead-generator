import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveActor } from "@/lib/assistant/actor";
import { AssistantError } from "@/lib/assistant/errors";
import { guarded, publicMessage, publicThread } from "@/lib/assistant/http";
import { getOwnedThread, listMessages, type ThreadOwner } from "@/lib/assistant/threads";
import type { Actor } from "@/lib/assistant/actor";

export const dynamic = "force-dynamic";

export function ownerFromActor(actor: Actor): ThreadOwner {
  if (actor.kind === "user") return { kind: "user", userId: actor.profile.id };
  if (actor.kind === "guest") return { kind: "guest", token: actor.token };
  throw new AssistantError("not_found", "Conversation not found.");
}

/** GET /api/assistant/threads/[id] — one owned thread with its messages. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(async () => {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new AssistantError("not_found", "Conversation not found.");
    const owner = ownerFromActor(await resolveActor(req));
    const thread = await getOwnedThread(id, owner);
    const messages = await listMessages(thread.id);
    return NextResponse.json({ thread: publicThread(thread), messages: messages.map(publicMessage) });
  });
}
