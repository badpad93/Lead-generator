/** Client-side mirrors of the API and SSE contracts (v1). */
export type Viewer = "user" | "guest" | "anonymous";

export interface ThreadSummary {
  id: string;
  title: string | null;
  status: string;
  last_activity_at: string;
  created_at: string;
}

export type UiBlock =
  | { type: "product_cards"; kind: string; items: Array<Record<string, unknown>> }
  | { type: "product_detail"; item: Record<string, unknown> }
  | { type: "comparison"; kind: string; attribute_labels: string[]; items: Array<Record<string, unknown>> }
  | { type: "customer_context"; context: Record<string, unknown> }
  | { type: "order_status"; status: string; record: Record<string, unknown> | null }
  | { type: "notice"; text: string }
  | { type: "quote"; status: "guest" | "empty" | "quote"; message: string | null; quote: Record<string, unknown> | null };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: UiBlock[];
  interrupted: boolean;
  created_at: string;
  /** Client-only: currently streaming. */
  streaming?: boolean;
  /** Client-only: tool activity label while streaming. */
  activity?: string | null;
}

export type SseEvent =
  | { v: 1; type: "response_started"; thread_id: string; user_message_id: string }
  | { v: 1; type: "text_delta"; delta: string }
  | { v: 1; type: "tool_started"; tool: string; label: string }
  | { v: 1; type: "tool_completed"; tool: string; ok: boolean }
  | { v: 1; type: "block"; block: UiBlock }
  | { v: 1; type: "response_completed"; message_id: string; usage: { input_tokens: number | null; output_tokens: number | null } }
  | { v: 1; type: "response_interrupted"; message_id: string | null; reason: string }
  | { v: 1; type: "error"; code: string; message: string };

export type UiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "streaming" }
  | { kind: "disabled" }
  | { kind: "rate_limited"; message: string }
  | { kind: "config_error"; message: string }
  | { kind: "network_error"; message: string }
  | { kind: "rejected"; message: string };

export interface ApiError {
  error?: { code?: string; message?: string; retry_after_seconds?: number };
}

/** Mirror of the server QuoteView (src/lib/commerce/quoteView.ts). */
export interface QuoteLineView {
  line_id: string;
  ref: string;
  source_type: "catalog_item" | "coffee_product";
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  pricing_basis: string;
  is_auto_add_on: boolean;
  parent_line_id: string | null;
  validation_status: string;
  staff_determined: boolean;
}

export interface QuoteView {
  quote_id: string;
  quote_number: string;
  status: string;
  version: number;
  currency: "USD";
  subtotal: number;
  total: number;
  tax_status: string;
  tax_note: string;
  expires_at: string | null;
  confirmed_at: string | null;
  financing: { program: "standard" | "ten_ten_ten" | null; status: string };
  agreement_state: string;
  lines: QuoteLineView[];
  changes: Array<{ kind: string; description: string; previous: number | null; current: number | null }>;
  notices: string[];
  checkout: { available: boolean; blocked_reasons: Array<{ code: string; message: string; line_id?: string }>; location_intake_quantity: number };
}

export interface QuoteFlags {
  write_tools_enabled: boolean;
  checkout_enabled: boolean;
}
