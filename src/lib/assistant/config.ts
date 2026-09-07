import { AssistantError } from "./errors";

/**
 * Assistant runtime configuration.
 *
 * Read lazily at request time — never at module load — so `pnpm build`
 * and static analysis succeed without any OpenAI secret present. The
 * model name is REQUIRED and never defaulted: choosing a production
 * model is a deployment decision, not a code decision.
 */
export interface AssistantConfig {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  maxToolRounds: number;
  rateLimitPerHour: number;
  maxMessageLength: number;
}

/** Version stamp stored with every assistant message. Bump when the
 *  system prompt or approved copy changes materially. */
export const PROMPT_VERSION = "2026-09-07.1";

interface Bound {
  name: string;
  fallback: number;
  min: number;
  max: number;
}

export const NUMERIC_BOUNDS = {
  maxOutputTokens: { name: "ASSISTANT_MAX_OUTPUT_TOKENS", fallback: 1200, min: 100, max: 8000 },
  maxToolRounds: { name: "ASSISTANT_MAX_TOOL_ROUNDS", fallback: 4, min: 1, max: 8 },
  rateLimitPerHour: { name: "ASSISTANT_RATE_LIMIT_PER_HOUR", fallback: 30, min: 1, max: 500 },
  maxMessageLength: { name: "ASSISTANT_MAX_MESSAGE_LENGTH", fallback: 2000, min: 100, max: 8000 },
} as const satisfies Record<string, Bound>;

/** Parse a numeric env var with a safe default and hard bounds. A
 *  malformed value falls back rather than failing the request. */
export function readBoundedInt(raw: string | undefined, bound: Bound): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return bound.fallback;
  return Math.min(bound.max, Math.max(bound.min, n));
}

export type EnvMap = Record<string, string | undefined>;

function readEnv(env: EnvMap, key: string): string | undefined {
  const v = env[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Resolve configuration from the environment. Throws a typed
 * `configuration_error` when the API key or model is missing so the
 * route fails closed with a 503 and a user-safe message.
 */
export function getAssistantConfig(env: EnvMap = process.env): AssistantConfig {
  const apiKey = readEnv(env, "OPENAI_API_KEY");
  const model = readEnv(env, "OPENAI_MODEL");
  if (!apiKey) {
    throw new AssistantError("configuration_error", "The assistant is not configured (missing API credential).");
  }
  if (!model) {
    throw new AssistantError("configuration_error", "The assistant is not configured (missing model).");
  }
  return {
    apiKey,
    model,
    maxOutputTokens: readBoundedInt(env.ASSISTANT_MAX_OUTPUT_TOKENS, NUMERIC_BOUNDS.maxOutputTokens),
    maxToolRounds: readBoundedInt(env.ASSISTANT_MAX_TOOL_ROUNDS, NUMERIC_BOUNDS.maxToolRounds),
    rateLimitPerHour: readBoundedInt(env.ASSISTANT_RATE_LIMIT_PER_HOUR, NUMERIC_BOUNDS.rateLimitPerHour),
    maxMessageLength: readBoundedInt(env.ASSISTANT_MAX_MESSAGE_LENGTH, NUMERIC_BOUNDS.maxMessageLength),
  };
}

/**
 * Limits that must be enforceable even when OpenAI is not configured
 * (rate limiting and message-length checks run before any model call).
 */
export function getAssistantLimits(env: EnvMap = process.env): Pick<AssistantConfig, "rateLimitPerHour" | "maxMessageLength"> {
  return {
    rateLimitPerHour: readBoundedInt(env.ASSISTANT_RATE_LIMIT_PER_HOUR, NUMERIC_BOUNDS.rateLimitPerHour),
    maxMessageLength: readBoundedInt(env.ASSISTANT_MAX_MESSAGE_LENGTH, NUMERIC_BOUNDS.maxMessageLength),
  };
}
