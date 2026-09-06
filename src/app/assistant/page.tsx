import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAssistantEnabled } from "@/lib/assistant/flags";
import { getAssistantLimits } from "@/lib/assistant/config";
import AssistantClient from "./AssistantClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assistant",
  description: "Ask about vending machines, coffee supplies, location services, and your Vending Connector orders.",
  robots: { index: false, follow: false },
};

/**
 * Full-page assistant. Indistinguishable from a missing route while
 * `assistant.enabled` is off, so nothing about the feature is exposed
 * before launch. Authentication is optional; the API decides what a
 * guest may see.
 */
export default async function AssistantPage() {
  if (!(await isAssistantEnabled())) notFound();
  const { maxMessageLength } = getAssistantLimits();
  return <AssistantClient maxMessageLength={maxMessageLength} />;
}
