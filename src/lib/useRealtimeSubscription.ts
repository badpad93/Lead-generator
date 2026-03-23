import { useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Event = "INSERT" | "UPDATE" | "DELETE";

interface SubscriptionConfig {
  table: string;
  /** Postgres filter, e.g. "id=eq.abc-123" */
  filter?: string;
  event?: Event | "*";
  /** Called with the new row on INSERT/UPDATE or old row on DELETE */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEvent: (payload: { eventType: Event; new: any; old: any }) => void;
}

/**
 * Subscribe to one or more Supabase Realtime Postgres changes.
 * Automatically cleans up on unmount or when deps change.
 *
 * @param subscriptions – array of table subscriptions
 * @param deps – React dependency array that triggers re-subscription
 */
export function useRealtimeSubscription(
  subscriptions: SubscriptionConfig[],
  deps: React.DependencyList = []
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (subscriptions.length === 0) return;

    const supabase = createBrowserClient();
    const channelName = `realtime-${subscriptions.map((s) => s.table).join("-")}-${Date.now()}`;

    let channel = supabase.channel(channelName);

    for (const sub of subscriptions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts: any = {
        event: sub.event ?? "*",
        schema: "public",
        table: sub.table,
      };
      if (sub.filter) opts.filter = sub.filter;

      channel = channel.on("postgres_changes", opts, (payload) => {
        sub.onEvent({
          eventType: payload.eventType as Event,
          new: payload.new,
          old: payload.old,
        });
      });
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
