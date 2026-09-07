import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isAssistantCheckoutEnabled, isAssistantEnabled, isAssistantWriteToolsEnabled } from "@/lib/assistant/flags";
import { getAssistantLimits } from "@/lib/assistant/config";
import { ASSISTANT_PAGE_TITLE } from "@/lib/assistant/identity";
import AssistantClient from "./AssistantClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Absolute: the root layout's "%s | Vending Connector" template must not
  // double the suffix. Locked product title.
  title: { absolute: ASSISTANT_PAGE_TITLE },
  description: "Vinnie, the Vending Connector AI. Ask about vending machines, coffee supplies, location services, and your Vending Connector orders.",
  robots: { index: false, follow: false },
};

/** Full-screen app: edge-to-edge on notched phones, black behind the UI. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#000000",
};

/**
 * Full-page assistant. Indistinguishable from a missing route while
 * `assistant.enabled` is off, so nothing about the feature is exposed
 * before launch. Authentication is optional; the API decides what a
 * guest may see. The proxy stamps the minimal-shell header for
 * /assistant, so the root layout renders no nav, footer, or FAB here.
 */
export default async function AssistantPage() {
  if (!(await isAssistantEnabled())) notFound();
  const { maxMessageLength } = getAssistantLimits();
  const [write_tools_enabled, checkout_enabled] = await Promise.all([isAssistantWriteToolsEnabled(), isAssistantCheckoutEnabled()]);
  return <AssistantClient maxMessageLength={maxMessageLength} quoteFlags={{ write_tools_enabled, checkout_enabled }} />;
}
