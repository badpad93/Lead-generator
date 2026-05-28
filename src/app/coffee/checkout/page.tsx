"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Loader2, ShoppingCart, ArrowLeft, AlertCircle, CreditCard } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface CartProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  image_url: string | null;
  unit: string;
}

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  coffee_products: CartProduct;
}

export default function CoffeeCheckoutPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    shipping_name: "",
    shipping_address: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    shipping_phone: "",
    notes: "",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push("/login");
        return;
      }
      setToken(session.access_token);

      try {
        const [profileRes, cartRes] = await Promise.all([
          fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch("/api/coffee/cart", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        ]);

        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfile(data);
          if (!data.coffee_access_enabled) {
            router.push("/coffee/apply");
            return;
          }
          setForm((prev) => ({
            ...prev,
            shipping_name: data.full_name || "",
            shipping_address: data.address || "",
            shipping_city: data.city || "",
            shipping_state: data.state || "",
            shipping_zip: data.zip || "",
            shipping_phone: data.phone || "",
          }));
        }

        if (cartRes.ok) {
          const data = await cartRes.json();
          setItems(data.items || []);
        }
      } catch {}
      setLoading(false);
    }
    init();
  }, [router]);

  const subtotal = items.reduce((sum, item) => {
    return sum + Number(item.coffee_products?.price || 0) * item.quantity;
  }, 0);

  const shipping = 0;
  const total = subtotal + shipping;

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/coffee/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          shipping_estimate: shipping,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError("Failed to create payment session");
        }
      } else {
        const data = await res.json();
        setError(data.error || "Failed to process checkout");
      }
    } catch {
      setError("Failed to process checkout");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
        <ShoppingCart className="h-16 w-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Your cart is empty</h2>
        <p className="mt-2 text-gray-500">Add some products before checking out</p>
        <Link
          href="/coffee"
          className="mt-6 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700"
        >
          Browse Marketplace
        </Link>
      </div>
    );
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/coffee"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Checkout</h1>

      {searchParams.get("canceled") && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Payment was canceled. You can try again when you&apos;re ready.
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Shipping Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={form.shipping_name}
                  onChange={(e) => updateForm("shipping_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Address</label>
                <input
                  type="text"
                  required
                  value={form.shipping_address}
                  onChange={(e) => updateForm("shipping_address", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">City</label>
                <input
                  type="text"
                  required
                  value={form.shipping_city}
                  onChange={(e) => updateForm("shipping_city", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">State</label>
                <input
                  type="text"
                  required
                  value={form.shipping_state}
                  onChange={(e) => updateForm("shipping_state", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">ZIP Code</label>
                <input
                  type="text"
                  required
                  value={form.shipping_zip}
                  onChange={(e) => updateForm("shipping_zip", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={form.shipping_phone}
                  onChange={(e) => updateForm("shipping_phone", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Order Notes</h2>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm("notes", e.target.value)}
              placeholder="Any special instructions..."
              rows={3}
              className={inputClass + " resize-none"}
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="sticky top-24 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-3 mb-4">
              {items.map((item) => {
                const product = item.coffee_products;
                const price = Number(product?.price || 0);
                return (
                  <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{product?.name}</p>
                      <p className="text-gray-500">Qty: {item.quantity}</p>
                    </div>
                    <p className="flex-shrink-0 font-medium text-gray-900">${(price * item.quantity).toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
            <hr className="border-gray-100 my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Shipping</span>
                <span className="font-medium text-green-600">Free</span>
              </div>
            </div>
            <hr className="border-gray-100 my-4" />
            <div className="flex justify-between">
              <span className="text-base font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900">${total.toFixed(2)}</span>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md disabled:bg-gray-300 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Pay ${total.toFixed(2)}
                </span>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
