"use client";

/**
 * @deprecated Subscription model has been removed.
 * Locations and operators are now purchased individually.
 * This hook always returns { subscribed: false } for backwards compatibility.
 */
export function useSubscription() {
  return {
    loading: false,
    subscribed: false,
    status: null,
    cancelAtPeriodEnd: false,
  } as const;
}
