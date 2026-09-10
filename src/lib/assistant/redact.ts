/**
 * Input redaction — runs before a user message is stored or sent to the
 * model. Pattern detection is best-effort (regex cannot be perfect); it
 * exists to stop the common cases: card numbers, SSNs, bank account and
 * routing numbers, and volunteered private financing details. The
 * original sensitive text is never retained.
 */
export interface RedactionResult {
  /** Text safe to persist and send. Empty when rejected. */
  text: string;
  /** Labels of what was removed (user-safe). */
  redactions: string[];
  /** True when the message must not be processed at all. */
  rejected: boolean;
  /** User-safe explanation when something was redacted or rejected. */
  notice: string | null;
}

const SSN_RE = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g;
// 13–19 digits with optional single spaces/dashes between groups.
const CARD_CANDIDATE_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
const BANK_CONTEXT_RE = /\b(routing|aba|account\s*(?:number|no\.?|#)|acct|iban|swift)\b[^\d]{0,25}(\d[\d -]{6,20}\d)/gi;

// A credit score is accepted as a planning input (product decision 2026-09-10);
// income, net worth, SSN, date of birth, bankruptcy, and tax liens are not.
const FINANCING_PATTERNS: RegExp[] = [
  // "my income is $X" is private; "my income goal/target is $X" is a planning target Vinnie asks for.
  /\b(my|our)\s+(annual|yearly|monthly|household)?\s*(income|salary|net\s*worth)\b(?!\s*(goal|target))[^.\n]{0,40}\$?\s?\d/i,
  /\b(income|salary|net\s*worth)\s*(is|of|:)\s*\$?\s?\d/i,
  /\b(social\s*security|ssn)\b/i,
  /\b(date\s*of\s*birth|dob)\b[^.\n]{0,20}\d/i,
  /\b(filed|declared)\s+(for\s+)?bankruptcy\b/i,
  /\btax\s*lien(s)?\b/i,
];

export const SENSITIVE_INPUT_NOTICE =
  "For your security this assistant can't accept card, bank, Social Security, bankruptcy or lien history, or income details. " +
  "Those are handled only through the secure financing and checkout forms. Your other questions are welcome.";

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function redactCards(text: string, found: Set<string>): string {
  return text.replace(CARD_CANDIDATE_RE, (m) => {
    const digits = m.replace(/[ -]/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return m;
    found.add("card number");
    return "[card number removed]";
  });
}

function redactBank(text: string, found: Set<string>): string {
  return text.replace(BANK_CONTEXT_RE, (_m, label: string) => {
    found.add("bank account or routing number");
    return `${label} [number removed]`;
  });
}

function redactSsn(text: string, found: Set<string>): string {
  return text.replace(SSN_RE, () => {
    found.add("Social Security number");
    return "[SSN removed]";
  });
}

export function detectPrivateFinancingData(text: string): boolean {
  return FINANCING_PATTERNS.some((re) => re.test(text));
}

/**
 * Enforce the length limit and scrub sensitive patterns. Messages that
 * volunteer private financing data are rejected outright so no partial
 * copy is stored.
 */
export function redactUserMessage(raw: string, maxLength: number): RedactionResult {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (trimmed.length > maxLength) {
    return {
      text: "",
      redactions: [],
      rejected: true,
      notice: `Please keep messages under ${maxLength} characters.`,
    };
  }
  if (detectPrivateFinancingData(trimmed)) {
    return { text: "", redactions: ["private financing details"], rejected: true, notice: SENSITIVE_INPUT_NOTICE };
  }
  const found = new Set<string>();
  const cleaned = redactSsn(redactBank(redactCards(trimmed, found), found), found);
  const redactions = Array.from(found);
  return {
    text: cleaned,
    redactions,
    rejected: false,
    notice: redactions.length ? SENSITIVE_INPUT_NOTICE : null,
  };
}
