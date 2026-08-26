import crypto from "node:crypto";

/**
 * Field-level AES-256-GCM encryption for payroll PII.
 *
 * Used for every sensitive value the worker submits — SSN, TIN, full
 * bank routing/account numbers, W-4 additional-withholding amounts,
 * anything else classified as sensitive.
 *
 * Key management
 *   * The 32-byte master key is read from PAYROLL_ENCRYPTION_KEY
 *     (base64-encoded 32 bytes). Missing / wrong-size key throws at
 *     first encrypt call — deliberate: silent-plaintext fallback
 *     would be a critical security bug.
 *   * `key_version` is stamped on every ciphertext row so we can
 *     rotate later by adding a KEY_V2 without re-encrypting live
 *     rows in a single migration.
 *   * NEVER expose the key over any API, log line, or error message.
 *
 * The ciphertext, iv, and auth tag are all stored as base64 strings
 * on payroll_encrypted (see migration 157).
 */

const KEY_LEN = 32; // 256 bits
const IV_LEN = 12;  // 96 bits — recommended for GCM
const KEY_VERSION = 1;

let _cachedKey: Buffer | null = null;
function getMasterKey(): Buffer {
  if (_cachedKey) return _cachedKey;
  const raw = process.env.PAYROLL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "PAYROLL_ENCRYPTION_KEY env var is not set — refusing to persist plaintext payroll data.",
    );
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    throw new Error("PAYROLL_ENCRYPTION_KEY must be base64-encoded 32 bytes.");
  }
  if (decoded.length !== KEY_LEN) {
    throw new Error(
      `PAYROLL_ENCRYPTION_KEY must decode to exactly ${KEY_LEN} bytes (got ${decoded.length}).`,
    );
  }
  _cachedKey = decoded;
  return decoded;
}

export interface EncryptedField {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version: number;
}

export function encryptField(plaintext: string): EncryptedField {
  if (plaintext == null) throw new Error("encryptField requires a plaintext string.");
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: tag.toString("base64"),
    key_version: KEY_VERSION,
  };
}

export function decryptField(row: {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version?: number;
}): string {
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(row.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Return the last 4 characters — used for UI display of SSN/bank/TIN. */
export function last4(value: string): string {
  if (!value) return "";
  return value.slice(-4);
}

/** UI mask helpers — never send full values to the browser. */
export function maskSsn(last: string): string {
  return `***-**-${last}`;
}
export function maskBankAccount(last: string): string {
  return `••••••${last}`;
}
export function maskTin(last: string, kind: "ssn" | "ein" | null): string {
  if (kind === "ein") return `**-*****${last.slice(-1)}`;
  return `***-**-${last}`;
}
