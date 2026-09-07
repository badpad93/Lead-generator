"use client";

import { useCallback, useState } from "react";
import { PanelLeft, SquarePen } from "lucide-react";
import { ASSISTANT_LABEL, ASSISTANT_NAME } from "@/lib/assistant/identity";
import { Composer } from "./_components/Composer";
import { ConversationDrawer } from "./_components/ConversationDrawer";
import { Greeting } from "./_components/Greeting";
import { MessageList } from "./_components/MessageList";
import { StatusBanner } from "./_components/StatusBanner";
import { ThreadSidebar } from "./_components/ThreadSidebar";
import { VinnieAvatar } from "./_components/VinnieAvatar";
import { useAssistantChat, type AssistantChat } from "./_components/useAssistantChat";

/**
 * Full-screen, monochrome chat application. The root layout renders no
 * nav/footer for /assistant (proxy-stamped minimal shell), and this
 * component owns exactly one viewport: only the conversation scrolls.
 */
const ICON_BUTTON = "flex h-11 w-11 items-center justify-center rounded-lg text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-40";

const DESKTOP_QUERY = "(min-width: 1024px)";

function useSidebarState() {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggle = useCallback(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) setDesktopOpen((v) => !v);
    else setDrawerOpen((v) => !v);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  return { desktopOpen, drawerOpen, toggle, closeDrawer };
}

function Header({ chat, onToggleSidebar, sidebarOpen }: { chat: AssistantChat; onToggleSidebar: () => void; sidebarOpen: boolean }) {
  const online = chat.state.kind !== "loading" && !chat.disabled;
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-neutral-800 px-2 pt-[env(safe-area-inset-top)] sm:px-3">
      <button type="button" onClick={onToggleSidebar} aria-label="Toggle conversations" aria-expanded={sidebarOpen} className={ICON_BUTTON}>
        <PanelLeft className="h-5 w-5" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <VinnieAvatar size="md" online={online} />
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold text-white">{ASSISTANT_NAME}</h1>
          <p className="truncate text-xs text-neutral-400">{ASSISTANT_LABEL}</p>
        </div>
      </div>
      <button type="button" onClick={() => void chat.newThread()} disabled={chat.busy || chat.disabled} aria-label="New conversation" className={ICON_BUTTON}>
        <SquarePen className="h-5 w-5" aria-hidden />
      </button>
    </header>
  );
}

function Conversation({ chat }: { chat: AssistantChat }) {
  if (chat.messages.length === 0) return <Greeting onPick={(q) => void chat.send(q)} disabled={chat.busy || chat.disabled} />;
  return <MessageList messages={chat.messages} />;
}

export default function AssistantClient({ maxMessageLength }: { maxMessageLength: number }) {
  const chat = useAssistantChat();
  const sidebar = useSidebarState();
  const onSelect = (id: string) => {
    sidebar.closeDrawer();
    void chat.loadThread(id);
  };
  const onNew = () => {
    sidebar.closeDrawer();
    void chat.newThread();
  };
  const history = <ThreadSidebar viewer={chat.viewer} threads={chat.threads} activeId={chat.activeId} onSelect={onSelect} onNew={onNew} disabled={chat.busy || chat.disabled} />;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-black text-white" data-testid="assistant-app">
      {/* Full-screen app: the page must never scroll; only the conversation pane does. */}
      <style>{"html,body{background:#000;overflow:hidden}"}</style>
      {sidebar.desktopOpen ? (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 pt-[env(safe-area-inset-top)] lg:flex" aria-label="Conversations">
          {history}
        </aside>
      ) : null}
      <ConversationDrawer open={sidebar.drawerOpen} onClose={sidebar.closeDrawer}>
        {history}
      </ConversationDrawer>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header chat={chat} onToggleSidebar={sidebar.toggle} sidebarOpen={sidebar.desktopOpen || sidebar.drawerOpen} />
        <StatusBanner state={chat.state} />
        {/* The root layout already provides <main>; this is the only scroll container. */}
        <section className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversation with Vinnie" data-testid="conversation-scroll">
          <div className="mx-auto min-h-full w-full max-w-3xl px-4 py-6 sm:px-6">
            <Conversation chat={chat} />
          </div>
        </section>
        <footer className="shrink-0 border-t border-neutral-800 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto w-full max-w-3xl space-y-2">
            <Composer disabled={chat.disabled} loading={chat.state.kind === "loading"} streaming={chat.state.kind === "streaming"} maxLength={maxMessageLength} onSend={(t) => void chat.send(t)} onStop={chat.stop} />
            <p className="text-center text-[11px] leading-snug text-neutral-400">Do not share card, bank, Social Security, credit, or income details here. Prices shown come from the live catalog for your account.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
