import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * Phase 1 gate. Reuses the platform flag reader (fail-closed, cached,
 * server-only). `assistant.write_tools_enabled` and
 * `assistant.checkout_enabled` are reserved and deliberately not read
 * anywhere in Phase 1.
 */
export function isAssistantEnabled(): Promise<boolean> {
  return isStorefrontFlagEnabled("assistant.enabled");
}
