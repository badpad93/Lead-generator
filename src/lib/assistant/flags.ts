import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * Assistant gates. All three reuse the platform flag reader (fail-closed,
 * cached, server-only) and default to false.
 *
 *   assistant.enabled              the interface and every /api/assistant route
 *   assistant.write_tools_enabled  saved quote mutations (update_quote, quote routes)
 *   assistant.checkout_enabled     invoice creation and the Checkout button
 */
export function isAssistantEnabled(): Promise<boolean> {
  return isStorefrontFlagEnabled("assistant.enabled");
}

export function isAssistantWriteToolsEnabled(): Promise<boolean> {
  return isStorefrontFlagEnabled("assistant.write_tools_enabled");
}

export function isAssistantCheckoutEnabled(): Promise<boolean> {
  return isStorefrontFlagEnabled("assistant.checkout_enabled");
}
