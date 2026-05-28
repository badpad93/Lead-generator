"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, ShoppingCart, Coffee, Lock, Loader2, X, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import CoffeeCartDrawer from "@/app/components/CoffeeCartDrawer";

interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock_status: string;
  unit: string;
  min_order_qty: number;
  active: boolean;
  coffee_categories: { id: string; name: string; slug: string } | null;
}

export default function CoffeeMarketplacePage() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setToken(session.access_token);
        try {
          const res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setProfile(data);
          }
        } catch {}
      }
      setLoading(false);
    }
    init();
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set("category", selectedCategory);
      if (search) params.set("search", search);
      const res = await fetch(`/api/coffee/products?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {}
  }, [selectedCategory, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/coffee/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
        }
      } catch {}
    }
    fetchCategories();
  }, []);

  const fetchCartCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/coffee/cart", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCartCount((data.items || []).length);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchCartCount();
  }, [fetchCartCount]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function addToCart(productId: string) {
    if (!token || !profile?.coffee_access_enabled) return;
    setAdding(productId);
    try {
      const qty = quantities[productId] || 1;
      const res = await fetch("/api/coffee/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: productId, quantity: qty }),
      });
      if (res.ok) {
        showToast("Added to cart", "success");
        fetchCartCount();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to add", "error");
      }
    } catch {
      showToast("Failed to add to cart", "error");
    } finally {
      setAdding(null);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const coffeeEnabled = !!profile?.coffee_access_enabled;

  function stockBadge(status: string) {
    switch (status) {
      case "in_stock":
        return <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">In Stock</span>;
      case "low_stock":
        return <span className="inline-block rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">Low Stock</span>;
      case "out_of_stock":
        return <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Out of Stock</span>;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 pb-8 pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Coffee Marketplace</h1>
              <p className="mt-1 text-gray-400">Premium coffee products for your vending operations</p>
            </div>
            {token && (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md cursor-pointer"
              >
                <ShoppingCart className="h-5 w-5" />
                Cart
                {cartCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-600">
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <form onSubmit={handleSearch} className="mt-6 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search products..."
                className="w-full rounded-xl border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(""); setSearch(""); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16">
        {!coffeeEnabled && token && (
          <div className="mb-8 rounded-2xl border border-green-800 bg-green-900/30 p-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
                <div>
                  <p className="font-semibold text-white">Coffee Services Access Required</p>
                  <p className="mt-1 text-sm text-gray-300">Apply for coffee services to place orders and access exclusive products.</p>
                </div>
              </div>
              <Link
                href="/coffee/apply"
                className="flex-shrink-0 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                Apply for Coffee Services
              </Link>
            </div>
          </div>
        )}

        {categories.length > 0 && (
          <div className="mb-8 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              type="button"
              onClick={() => setSelectedCategory("")}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                !selectedCategory
                  ? "bg-green-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.slug)}
                className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  selectedCategory === cat.slug
                    ? "bg-green-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Coffee className="h-16 w-16 text-gray-600 mb-4" />
            <p className="text-lg font-medium text-gray-400">No products found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const isOutOfStock = product.stock_status === "out_of_stock";
              const canAdd = coffeeEnabled && !isOutOfStock;
              const qty = quantities[product.id] || product.min_order_qty || 1;
              const isAdding = adding === product.id;

              return (
                <div
                  key={product.id}
                  className="flex flex-col rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-lg"
                >
                  <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-t-2xl bg-gray-100">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Coffee className="h-16 w-16 text-gray-300" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-1">{stockBadge(product.stock_status)}</div>
                    <h3 className="text-base font-bold text-gray-900">{product.name}</h3>
                    <p className="text-xs text-gray-500">{product.sku}</p>
                    {product.description && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">{product.description}</p>
                    )}
                    <p className="mt-2 text-xl font-bold text-green-600">
                      ${Number(product.price).toFixed(2)}
                      <span className="text-xs font-normal text-gray-400 ml-1">/ {product.unit || "each"}</span>
                    </p>
                    <div className="mt-auto pt-4 flex items-center gap-2">
                      <input
                        type="number"
                        min={product.min_order_qty || 1}
                        value={qty}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [product.id]: Math.max(product.min_order_qty || 1, parseInt(e.target.value) || (product.min_order_qty || 1)),
                          }))
                        }
                        disabled={!canAdd}
                        className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-center text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => addToCart(product.id)}
                        disabled={!canAdd || isAdding || !token}
                        className="relative flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isAdding ? (
                          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                        ) : !coffeeEnabled && token ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <Lock className="h-3.5 w-3.5" />
                            Locked
                          </span>
                        ) : (
                          "Add to Cart"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {token && cartCount > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl lg:hidden cursor-pointer"
        >
          <ShoppingCart className="h-6 w-6" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-600">
            {cartCount}
          </span>
        </button>
      )}

      {token && (
        <CoffeeCartDrawer
          open={cartOpen}
          onClose={() => { setCartOpen(false); fetchCartCount(); }}
          token={token}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
