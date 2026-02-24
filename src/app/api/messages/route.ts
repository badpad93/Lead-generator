import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMessageSchema } from "@/lib/schemas";

/** GET /api/messages — list conversations for current user */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadWith = req.nextUrl.searchParams.get("with");

  if (threadWith) {
    // Get all messages in a thread between two users
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*, sender:profiles!sender_id(id, full_name, avatar_url), recipient:profiles!recipient_id(id, full_name, avatar_url)")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${threadWith}),and(sender_id.eq.${threadWith},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark unread messages as read
    await supabaseAdmin
      .from("messages")
      .update({ read: true })
      .eq("recipient_id", userId)
      .eq("sender_id", threadWith)
      .eq("read", false);

    return NextResponse.json(data || []);
  }

  // Get conversation list (latest message per conversation partner)
  const { data: sent } = await supabaseAdmin
    .from("messages")
    .select("*, recipient:profiles!recipient_id(id, full_name, avatar_url, company_name)")
    .eq("sender_id", userId)
    .order("created_at", { ascending: false });

  const { data: received } = await supabaseAdmin
    .from("messages")
    .select("*, sender:profiles!sender_id(id, full_name, avatar_url, company_name)")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false });

  // Build conversation list
  const conversations = new Map<string, { partner: { id: string; full_name: string; avatar_url: string | null; company_name: string | null }; lastMessage: string; lastDate: string; unread: number }>();

  for (const msg of [...(received || []), ...(sent || [])]) {
    const isReceived = msg.recipient_id === userId;
    const partnerId = isReceived ? msg.sender_id : msg.recipient_id;
    const partner = isReceived
      ? (msg as { sender: { id: string; full_name: string; avatar_url: string | null; company_name: string | null } }).sender
      : (msg as { recipient: { id: string; full_name: string; avatar_url: string | null; company_name: string | null } }).recipient;

    if (!conversations.has(partnerId)) {
      conversations.set(partnerId, {
        partner,
        lastMessage: msg.body,
        lastDate: msg.created_at,
        unread: 0,
      });
    }
    if (isReceived && !msg.read) {
      const conv = conversations.get(partnerId)!;
      conv.unread++;
    }
  }

  return NextResponse.json(Array.from(conversations.values()));
}

/** POST /api/messages — send a message */
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        sender_id: userId,
        recipient_id: parsed.data.recipient_id,
        match_id: parsed.data.match_id || null,
        subject: parsed.data.subject || null,
        body: parsed.data.body,
        read: false,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
