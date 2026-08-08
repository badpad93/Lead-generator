/**
 * Guest cart — localStorage-backed cart for unauthenticated visitors.
 *
 * Authenticated operators keep using coffee_cart_items (server-side,
 * keyed by user_id). Guests use this module, which reads/writes a
 * single JSON array under GUEST_CART_KEY. On checkout the guest cart
 * is POSTed to /api/coffee/guest-checkout, where prices/stock are
 * re-resolved server-side.
 *
 * The two callers today are the shop page and the guest checkout page,
 * so this is where both should live to avoid divergent formats.
 */

export const GUEST_CART_KEY = "coffee_guest_cart_v1";

export interface GuestCartLine {
  product_id: string;
  quantity: number;
}

export function readGuestCart(): GuestCartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((l: unknown) => {
        const rec = l as Record<string, unknown>;
        const id = typeof rec.product_id === "string" ? rec.product_id : "";
        const qty = Math.floor(Number(rec.quantity));
        return id && Number.isFinite(qty) && qty > 0
          ? { product_id: id, quantity: qty }
          : null;
      })
      .filter((l): l is GuestCartLine => l !== null);
  } catch {
    return [];
  }
}

export function writeGuestCart(lines: GuestCartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
    window.dispatchEvent(new Event("guest-cart-changed"));
  } catch {
    // localStorage full or blocked — cart is transient, ignore
  }
}

export function addToGuestCart(productId: string, quantity: number): void {
  const qty = Math.max(1, Math.floor(quantity));
  const cart = readGuestCart();
  const existing = cart.find((l) => l.product_id === productId);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ product_id: productId, quantity: qty });
  }
  writeGuestCart(cart);
}

export function removeFromGuestCart(productId: string): void {
  writeGuestCart(readGuestCart().filter((l) => l.product_id !== productId));
}

export function clearGuestCart(): void {
  writeGuestCart([]);
}

export function guestCartCount(): number {
  return readGuestCart().reduce((sum, l) => sum + l.quantity, 0);
}
