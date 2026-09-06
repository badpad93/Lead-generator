/**
 * Typed operational errors for the assistant. Every error carries a
 * stable `code` so routes can map it to an HTTP status and the UI can
 * render a specific state, without ever leaking internals.
 */
export type AssistantErrorCode =
  | "assistant_disabled"
  | "configuration_error"
  | "unauthorized"
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "sensitive_input_rejected"
  | "thread_busy"
  | "upstream_error"
  | "tool_error";

export class AssistantError extends Error {
  readonly code: AssistantErrorCode;
  readonly status: number;
  /** Extra safe-to-return fields (e.g. retry_after_seconds). */
  readonly details: Record<string, unknown>;

  constructor(code: AssistantErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AssistantError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

const STATUS_BY_CODE: Record<AssistantErrorCode, number> = {
  assistant_disabled: 404,
  configuration_error: 503,
  unauthorized: 401,
  not_found: 404,
  invalid_input: 400,
  rate_limited: 429,
  sensitive_input_rejected: 422,
  thread_busy: 409,
  upstream_error: 502,
  tool_error: 500,
};

export function isAssistantError(e: unknown): e is AssistantError {
  return e instanceof AssistantError;
}

/** Shape every /api/assistant/* error response uses. */
export function errorBody(e: AssistantError): { error: { code: AssistantErrorCode; message: string } & Record<string, unknown> } {
  return { error: { code: e.code, message: e.message, ...e.details } };
}
