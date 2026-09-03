import { randomBytes } from "crypto";

/**
 * Customer-facing order tracking numbers.
 *
 * Every coffee order (marketplace, guest, and storefront checkout)
 * gets one at creation. It's the reference a customer quotes when
 * they call support — printed prominently in the confirmation
 * email next to the support number and the delivery window.
 *
 * Format: VC- + 8 chars from an unambiguous alphabet (no 0/O/1/I)
 * so it survives being read over the phone. ~1e12 combinations;
 * the DB's unique index is the collision backstop.
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateTrackingNumber(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `VC-${out}`;
}

/** Support line quoted in customer-facing order emails. */
export const SUPPORT_PHONE_DISPLAY = "(888) 851-1462";
export const SUPPORT_PHONE_TEL = "+18888511462";

/** Standard delivery expectation set in order-confirmation emails. */
export const DELIVERY_WINDOW = "3–5 business days";

/**
 * Shared email block: tracking number + delivery window + support
 * instructions. Dropped into both the marketplace confirmation and
 * the storefront receipt so the two emails give customers the same
 * story.
 */
export function trackingEmailBlockHtml(trackingNumber: string): string {
  return `
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 16px 0;">
        <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #1d4ed8; font-weight: 600;">Your Tracking Number</p>
        <p style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #1e3a8a; letter-spacing: 0.05em;">${trackingNumber}</p>
        <p style="margin: 0 0 8px; font-size: 13px; color: #1e40af; line-height: 1.6;">
          Your delivery should arrive within <strong>${DELIVERY_WINDOW}</strong>.
        </p>
        <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.6;">
          Questions about your order? Call support at
          <a href="tel:${SUPPORT_PHONE_TEL}" style="color: #1d4ed8; font-weight: 600;">${SUPPORT_PHONE_DISPLAY}</a>
          and provide your tracking number above so we can pull up the details.
        </p>
      </div>`;
}
