"use client";

import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Search,
  Loader2,
  LogIn,
} from "lucide-react";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";

interface Conversation {
  partner: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    company_name: string | null;
  };
  lastMessage: string;
  lastDate: string;
  unread: number;
}

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  sender?: { id: string; full_name: string; avatar_url: string | null };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Avatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-14 h-14 text-lg" : "w-10 h-10 text-sm";
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  if (url) {
    return <img src={url} alt={name} className={`${s} rounded-full object-cover`} />;
  }
  return (
    <div className={`${s} rounded-full bg-green-primary text-white font-semibold flex items-center justify-center shrink-0`}>
      {initials}
    </div>
  );
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activePartner, setActivePartner] = useState<Conversation["partner"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Resolve auth token on mount
  useEffect(() => {
    getAccessToken().then((t) => {
      setToken(t);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!token) { setLoading(false); return; }
    // Get current user
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((profile) => {
        if (profile) setUserId(profile.id);
      });
    // Fetch conversations
    fetch("/api/messages", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setConversations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, authChecked]);

  async function openThread(partner: Conversation["partner"]) {
    setActivePartner(partner);
    const res = await fetch(`/api/messages?with=${partner.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !activePartner || !token) return;
    setSending(true);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient_id: activePartner.id,
        body: newMessage.trim(),
      }),
    });
    if (res.ok) {
      setNewMessage("");
      await openThread(activePartner);
    }
    setSending(false);
  }

  if (authChecked && !token) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center px-4">
        <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <LogIn className="w-7 h-7 text-green-primary" />
        </div>
        <h1 className="text-2xl font-bold text-black-primary mb-3">Sign In to View Messages</h1>
        <p className="text-slate-500 mb-6">You need to be logged in to access your messages.</p>
        <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 bg-green-primary text-white rounded-xl font-semibold hover:bg-green-hover transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  const filteredConversations = conversations.filter((c) =>
    !search || c.partner.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-black-primary mb-6">Messages</h1>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex" style={{ height: "600px" }}>
        {/* Conversation List */}
        <div className={`w-full md:w-80 border-r border-slate-200 flex flex-col ${activePartner ? "hidden md:flex" : ""}`}>
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No conversations yet</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.partner.id}
                  onClick={() => openThread(conv.partner)}
                  className={`w-full flex items-center gap-3 p-4 hover:bg-green-50 transition-colors text-left border-b border-slate-50 ${
                    activePartner?.id === conv.partner.id ? "bg-green-50" : ""
                  }`}
                >
                  <Avatar name={conv.partner.full_name} url={conv.partner.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-black-primary truncate">
                        {conv.partner.full_name}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {timeAgo(conv.lastDate)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{conv.lastMessage}</p>
                  </div>
                  {conv.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-green-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {conv.unread}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className={`flex-1 flex flex-col ${!activePartner ? "hidden md:flex" : ""}`}>
          {activePartner ? (
            <>
              <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                <button
                  onClick={() => setActivePartner(null)}
                  className="md:hidden p-1 text-slate-400 hover:text-black-primary"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Avatar name={activePartner.full_name} url={activePartner.avatar_url} size="sm" />
                <div>
                  <p className="font-medium text-sm text-black-primary">{activePartner.full_name}</p>
                  {activePartner.company_name && (
                    <p className="text-[11px] text-slate-400">{activePartner.company_name}</p>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {messages.map((msg) => {
                  const isMine = msg.sender_id === userId;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                          isMine
                            ? "bg-green-primary text-white rounded-br-md"
                            : "bg-white text-black-primary border border-slate-200 rounded-bl-md"
                        }`}
                      >
                        <p>{msg.body}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? "text-green-200" : "text-slate-400"}`}>
                          {timeAgo(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSend} className="p-3 border-t border-slate-100 flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 text-sm"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-green-primary text-white rounded-lg font-medium text-sm hover:bg-green-hover disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Select a conversation to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
