import { describe, it, expect, vi } from "vitest";

// The runner transitively imports the Supabase admin client, whose env
// guard runs at import time; stub it so this test only exercises the
// OpenAI-side laziness.
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("unused"); } } }));
import { getAssistantConfig, getAssistantLimits, NUMERIC_BOUNDS, readBoundedInt } from "./config";
import { AssistantError } from "./errors";

describe("assistant config — fail closed", () => {
  it("throws a typed configuration_error when OPENAI_MODEL is missing", () => {
    const env = { OPENAI_API_KEY: "test-key" };
    expect(() => getAssistantConfig(env)).toThrowError(AssistantError);
    try {
      getAssistantConfig(env);
    } catch (e) {
      expect((e as AssistantError).code).toBe("configuration_error");
      expect((e as AssistantError).status).toBe(503);
    }
  });

  it("throws when the API key is missing", () => {
    expect(() => getAssistantConfig({ OPENAI_MODEL: "any" })).toThrowError(AssistantError);
  });

  it("never falls back to a hard-coded model", () => {
    const env = { OPENAI_API_KEY: "k", OPENAI_MODEL: "configured-model" };
    expect(getAssistantConfig(env).model).toBe("configured-model");
    expect(() => getAssistantConfig({ OPENAI_API_KEY: "k", OPENAI_MODEL: "   " })).toThrow();
  });

  it("bounds numeric settings and applies safe defaults", () => {
    expect(readBoundedInt(undefined, NUMERIC_BOUNDS.maxToolRounds)).toBe(4);
    expect(readBoundedInt("abc", NUMERIC_BOUNDS.maxToolRounds)).toBe(4);
    expect(readBoundedInt("999", NUMERIC_BOUNDS.maxToolRounds)).toBe(8);
    expect(readBoundedInt("0", NUMERIC_BOUNDS.maxToolRounds)).toBe(1);
    expect(readBoundedInt("50", NUMERIC_BOUNDS.maxOutputTokens)).toBe(100);
  });

  it("limits are available without any OpenAI secret", () => {
    const limits = getAssistantLimits({});
    expect(limits.rateLimitPerHour).toBe(30);
    expect(limits.maxMessageLength).toBe(2000);
  });
});

describe("assistant modules — import without runtime secrets", () => {
  it("importing the client module does not construct a client or require a key", async () => {
    const mod = await import("./openaiClient");
    expect(typeof mod.getOpenAIClient).toBe("function");
    const saved = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    try {
      expect(() => mod.getOpenAIClient()).toThrowError(AssistantError);
    } finally {
      if (saved.key) process.env.OPENAI_API_KEY = saved.key;
      if (saved.model) process.env.OPENAI_MODEL = saved.model;
    }
  });

  it("the runner and route modules import cleanly with no secrets", async () => {
    await expect(import("./runner")).resolves.toBeTruthy();
    await expect(import("./systemPrompt")).resolves.toBeTruthy();
  });
});
