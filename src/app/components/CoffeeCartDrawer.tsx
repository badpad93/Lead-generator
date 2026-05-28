"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { X, Minus, Plus, Trash2, ShoppingCart, Loader2 } from "lucide-react";

interface CartProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  image_url: string | null;
  stock_status: string;
  unit: string;
  min_order_qty: number;
  active: boolean;
}

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  coffee_products: CartProduct;
}

interface CoffeeCartDrawerProps {
  open: boolean;
  onClose: () => void;
  token: string;
}

export default function CoffeeCartDrawer({ open, onClose, token }: CoffeeCartDrawerProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coffee/cart", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (open && token) {
      fetchCart();
    }
  }, [open, token, fetchCart]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function updateQuantity(productId: string, quantity: number) {
    if (quantity < 1) return;
    setUpdating(productId);
    try {
      await fetch("/api/coffee/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: productId, quantity }),
      });
      await fetchCart();
    } catch {
      // silent
    } finally {
      setUpdating(null);
    }
  }

  async function removeItem(productId: string) {
    setUpdating(productId);
    try {
      await fetch("/api/coffee/cart", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: productId }),
      });
      await fetchCart();
    } catch {
      // silent
    } finally {
      setUpdating(null);
    }
  }

  const subtotal = items.reduce((sum, item) => {
    const price = Number(item.coffee_products?.price || 0);
    return sum + price * item.quantity;
  }, 0);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[9990] bg-black/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed right-0 top-0 z-[9991] flex h-full w-[90vw] max-w-md flex-col bg-white shadow-2xl transition-all duration-300 ease-in-out ${
          open ? "translate-x-0 visible opacity-100" : "translate-x-full invisible opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-bold text-gray-900">Your Cart</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Your cart is empty</p>
              <p className="text-sm text-gray-400 mt-1">Browse the marketplace to add products</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const product = item.coffee_products;
                const price = Number(product?.price || 0);
                const lineTotal = price * item.quantity;
                const isUpdating = updating === item.product_id;

                return (
                  <div key={item.id} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden">
                      {product?.image_url ? (
                        <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingCart className="h-6 w-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{product?.name}</p>
                      <p className="text-xs text-gray-500">${price.toFixed(2)} / {product?.unit || "each"}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                          disabled={isUpdating || item.quantity <= 1}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-gray-900">
                          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                          disabled={isUpdating}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.product_id)}
                          disabled={isUpdating}
                          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">${lineTotal.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-gray-200 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Subtotal</span>
              <span className="text-lg font-bold text-gray-900">${subtotal.toFixed(2)}</span>
            </div>
            <Link
              href="/coffee/checkout"
              onClick={onClose}
              className="block w-full rounded-xl bg-green-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md"
            >
              Checkout
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
