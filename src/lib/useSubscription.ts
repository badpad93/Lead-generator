"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "./supabase";

interface SubscriptionState {
  loading: boolean;
  subscribed: boolean;
  status: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Hook to check the current user's subscription status */
export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>({
    loading: true,
    subscribed: false,
    status: null,
    cancelAtPeriodEnd: false,
  });

  useEffect(() => {
    async function check() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setState({ loading: false, subscribed: false, status: null, cancelAtPeriodEnd: false });
        return;
      }

      try {
        const res = await fetch("/api/subscription", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setState({
            loading: false,
            subscribed: !!data.subscribed,
            status: data.status,
            cancelAtPeriodEnd: !!data.cancel_at_period_end,
          });
        } else {
          setState({ loading: false, subscribed: false, status: null, cancelAtPeriodEnd: false });
        }
      } catch {
        setState({ loading: false, subscribed: false, status: null, cancelAtPeriodEnd: false });
      }
    }

    check();
  }, []);

  return state;
}
