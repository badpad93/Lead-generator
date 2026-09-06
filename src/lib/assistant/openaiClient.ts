import OpenAI from "openai";
import { getAssistantConfig } from "./config";

/**
 * Memoized OpenAI client. Server-only: importing this module from a
 * client component fails the build. The client is constructed on first
 * use at request time, never at import time, so builds and tests never
 * need an API key.
 *
 * Tests replace the factory via `setOpenAIClientFactoryForTests` and
 * therefore never reach the network.
 */
export type OpenAIClientFactory = (apiKey: string) => OpenAI;

let factory: OpenAIClientFactory = (apiKey) => new OpenAI({ apiKey });
let cached: { apiKey: string; client: OpenAI } | null = null;

export function getOpenAIClient(): OpenAI {
  if (typeof window !== "undefined") {
    throw new Error("getOpenAIClient is server-only");
  }
  const { apiKey } = getAssistantConfig();
  if (cached && cached.apiKey === apiKey) return cached.client;
  const client = factory(apiKey);
  cached = { apiKey, client };
  return client;
}

/** Test seam — never call from application code. */
export function setOpenAIClientFactoryForTests(next: OpenAIClientFactory | null): void {
  factory = next ?? ((apiKey) => new OpenAI({ apiKey }));
  cached = null;
}
