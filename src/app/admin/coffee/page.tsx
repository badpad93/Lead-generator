"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Loader2,
  Package,
  ShoppingCart,
  FileText,
  BookOpen,
  Tag,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  Eye,
  ArrowLeft,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

type Tab = "products" | "orders" | "applications" | "guides" | "categories";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order?: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  shipping_cost: number;
  image_url: string | null;
  stock_status: string;
  unit: string;
  min_order_qty: number;
  active: boolean;
  sort_order: number;
  category_id: string | null;
  coffee_categories: Category | null;
}

interface OrderProfile {
  id: string;
  full_name: string;
  email: string;
}

interface Order {
  id: string;
  order_number: string;
  operator_id: string;
  status: string;
  subtotal: number;
  shipping_estimate: number;
  total: number;
  notes: string | null;
  created_at: string;
  profiles: OrderProfile | null;
  coffee_order_items?: { id: string; product_name: string; quantity: number; unit_price: number; line_total: number }[];
}

interface Application {
  id: string;
  operator_id: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  profiles: { id: string; full_name: string; email: string } | null;
}

interface Guide {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  image_url: string | null;
  category_id: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  coffee_categories: Category | null;
}

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
        type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {message}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  awaiting_payment: "bg-orange-100 text-orange-700",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const ORDER_STATUSES = ["awaiting_payment", "pending", "processing", "shipped", "delivered", "cancelled"];

const inputClass = "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

export default function AdminCoffeePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  const [guides, setGuides] = useState<Guide[]>([]);

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    description: "",
    price: "",
    shipping_cost: "0",
    image_url: "",
    stock_status: "in_stock",
    unit: "each",
    min_order_qty: "1",
    active: true,
    sort_order: "0",
    category_id: "",
  });
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);
  const [processingApp, setProcessingApp] = useState<string | null>(null);

  const [showGuideForm, setShowGuideForm] = useState(false);
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null);
  const [guideForm, setGuideForm] = useState({
    title: "",
    summary: "",
    content: "",
    image_url: "",
    category_id: "",
    sort_order: "0",
    active: true,
  });
  const [savingGuide, setSavingGuide] = useState(false);
  const [deletingGuide, setDeletingGuide] = useState<string | null>(null);
  const [uploadingGuideImage, setUploadingGuideImage] = useState(false);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", sort_order: "0" });
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

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
        const adminRes = await fetch("/api/admin/check", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!adminRes.ok) {
          router.push("/");
          return;
        }
        const adminData = await adminRes.json();
        if (!adminData.isAdmin) {
          router.push("/");
          return;
        }
      } catch {
        router.push("/");
        return;
      }
      setLoading(false);
    }
    init();
  }, [router]);

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/coffee/products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {}
  }, [token]);

  const fetchCategories = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/coffee/categories", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {}
  }, [token]);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/coffee/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch {}
  }, [token]);

  const fetchApplications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/coffee/applications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch {}
  }, [token]);

  const fetchGuides = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/coffee/guides", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGuides(data.guides || []);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchProducts();
    fetchCategories();
    fetchOrders();
    fetchApplications();
    fetchGuides();
  }, [token, fetchProducts, fetchCategories, fetchOrders, fetchApplications, fetchGuides]);

  function resetProductForm() {
    setProductForm({
      name: "",
      sku: "",
      description: "",
      price: "",
      shipping_cost: "0",
      image_url: "",
      stock_status: "in_stock",
      unit: "each",
      min_order_qty: "1",
      active: true,
      sort_order: "0",
      category_id: "",
    });
    setEditingProduct(null);
    setShowProductForm(false);
  }

  function startEditProduct(product: Product) {
    setProductForm({
      name: product.name,
      sku: product.sku,
      description: product.description || "",
      price: String(product.price),
      shipping_cost: String(product.shipping_cost || 0),
      image_url: product.image_url || "",
      stock_status: product.stock_status,
      unit: product.unit,
      min_order_qty: String(product.min_order_qty),
      active: product.active,
      sort_order: String(product.sort_order),
      category_id: product.category_id || "",
    });
    setEditingProduct(product);
    setShowProductForm(true);
  }

  async function handleImageUpload(file: File) {
    if (!token) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be under 5MB", "error");
      return;
    }
    setUploadingImage(true);
    try {
      const supabase = createBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `coffee-products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadErr) {
        showToast(`Upload failed: ${uploadErr.message}`, "error");
        return;
      }
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
      setProductForm((p) => ({ ...p, image_url: urlData.publicUrl }));
      showToast("Image uploaded", "success");
    } catch {
      showToast("Upload failed", "error");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSavingProduct(true);
    try {
      const body: Record<string, unknown> = {
        name: productForm.name,
        sku: productForm.sku,
        description: productForm.description || null,
        price: parseFloat(productForm.price),
        shipping_cost: parseFloat(productForm.shipping_cost) || 0,
        image_url: productForm.image_url || null,
        stock_status: productForm.stock_status,
        unit: productForm.unit,
        min_order_qty: parseInt(productForm.min_order_qty) || 1,
        active: productForm.active,
        sort_order: parseInt(productForm.sort_order) || 0,
        category_id: productForm.category_id || null,
      };

      if (editingProduct) {
        body.id = editingProduct.id;
      }

      const res = await fetch("/api/admin/coffee/products", {
        method: editingProduct ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(editingProduct ? "Product updated" : "Product created", "success");
        resetProductForm();
        fetchProducts();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save product", "error");
      }
    } catch {
      showToast("Failed to save product", "error");
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleDeleteProduct(id: string) {
    if (!confirm("Are you sure you want to delete this product?")) return;
    setDeletingProduct(id);
    try {
      const res = await fetch("/api/admin/coffee/products", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast("Product deleted", "success");
        fetchProducts();
      } else {
        showToast("Failed to delete product", "error");
      }
    } catch {
      showToast("Failed to delete product", "error");
    } finally {
      setDeletingProduct(null);
    }
  }

  async function handleToggleActive(product: Product) {
    try {
      const res = await fetch("/api/admin/coffee/products", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: product.id, active: !product.active }),
      });
      if (res.ok) {
        fetchProducts();
      }
    } catch {}
  }

  async function handleUpdateOrderStatus(orderId: string, status: string) {
    setUpdatingOrder(orderId);
    try {
      const res = await fetch("/api/admin/coffee/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: orderId, status }),
      });
      if (res.ok) {
        showToast("Order status updated", "success");
        fetchOrders();
      } else {
        showToast("Failed to update order", "error");
      }
    } catch {
      showToast("Failed to update order", "error");
    } finally {
      setUpdatingOrder(null);
    }
  }

  async function handleApplicationAction(appId: string, status: "approved" | "rejected") {
    setProcessingApp(appId);
    try {
      const res = await fetch("/api/admin/coffee/applications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: appId, status }),
      });
      if (res.ok) {
        showToast(`Application ${status}`, "success");
        fetchApplications();
      } else {
        showToast(`Failed to ${status === "approved" ? "approve" : "reject"} application`, "error");
      }
    } catch {
      showToast("Action failed", "error");
    } finally {
      setProcessingApp(null);
    }
  }

  function resetGuideForm() {
    setGuideForm({
      title: "",
      summary: "",
      content: "",
      image_url: "",
      category_id: "",
      sort_order: "0",
      active: true,
    });
    setEditingGuide(null);
    setShowGuideForm(false);
  }

  function startEditGuide(guide: Guide) {
    setGuideForm({
      title: guide.title,
      summary: guide.summary || "",
      content: guide.content,
      image_url: guide.image_url || "",
      category_id: guide.category_id || "",
      sort_order: String(guide.sort_order),
      active: guide.active,
    });
    setEditingGuide(guide);
    setShowGuideForm(true);
  }

  async function handleGuideImageUpload(file: File) {
    if (!token) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be under 5MB", "error");
      return;
    }
    setUploadingGuideImage(true);
    try {
      const supabase = createBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `coffee-guides/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadErr) {
        showToast(`Upload failed: ${uploadErr.message}`, "error");
        return;
      }
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
      setGuideForm((g) => ({ ...g, image_url: urlData.publicUrl }));
      showToast("Image uploaded", "success");
    } catch {
      showToast("Upload failed", "error");
    } finally {
      setUploadingGuideImage(false);
    }
  }

  async function handleSaveGuide(e: React.FormEvent) {
    e.preventDefault();
    setSavingGuide(true);
    try {
      const body: Record<string, unknown> = {
        title: guideForm.title,
        summary: guideForm.summary || null,
        content: guideForm.content,
        image_url: guideForm.image_url || null,
        category_id: guideForm.category_id || null,
        sort_order: parseInt(guideForm.sort_order) || 0,
        active: guideForm.active,
      };

      if (editingGuide) {
        body.id = editingGuide.id;
      }

      const res = await fetch("/api/admin/coffee/guides", {
        method: editingGuide ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(editingGuide ? "Guide updated" : "Guide created", "success");
        resetGuideForm();
        fetchGuides();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save guide", "error");
      }
    } catch {
      showToast("Failed to save guide", "error");
    } finally {
      setSavingGuide(false);
    }
  }

  async function handleDeleteGuide(id: string) {
    if (!confirm("Are you sure you want to delete this guide?")) return;
    setDeletingGuide(id);
    try {
      const res = await fetch("/api/admin/coffee/guides", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast("Guide deleted", "success");
        fetchGuides();
      } else {
        showToast("Failed to delete guide", "error");
      }
    } catch {
      showToast("Failed to delete guide", "error");
    } finally {
      setDeletingGuide(null);
    }
  }

  async function handleToggleGuideActive(guide: Guide) {
    try {
      const res = await fetch("/api/admin/coffee/guides", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: guide.id, active: !guide.active }),
      });
      if (res.ok) {
        fetchGuides();
      }
    } catch {}
  }

  function resetCategoryForm() {
    setCategoryForm({ name: "", description: "", sort_order: "0" });
    setEditingCategory(null);
    setShowCategoryForm(false);
  }

  function startEditCategory(cat: Category) {
    setCategoryForm({
      name: cat.name,
      description: cat.description || "",
      sort_order: String(cat.sort_order ?? 0),
    });
    setEditingCategory(cat);
    setShowCategoryForm(true);
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    setSavingCategory(true);
    try {
      const body: Record<string, unknown> = {
        name: categoryForm.name,
        description: categoryForm.description || null,
        sort_order: parseInt(categoryForm.sort_order) || 0,
      };

      if (editingCategory) {
        body.id = editingCategory.id;
      }

      const res = await fetch("/api/admin/coffee/categories", {
        method: editingCategory ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(editingCategory ? "Category updated" : "Category created", "success");
        resetCategoryForm();
        fetchCategories();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save category", "error");
      }
    } catch {
      showToast("Failed to save category", "error");
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm("Delete this category? Products and guides in this category will be uncategorized.")) return;
    setDeletingCategory(id);
    try {
      const res = await fetch("/api/admin/coffee/categories", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast("Category deleted", "success");
        fetchCategories();
      } else {
        showToast("Failed to delete category", "error");
      }
    } catch {
      showToast("Failed to delete category", "error");
    } finally {
      setDeletingCategory(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "products", label: "Products", icon: <Package className="h-4 w-4" />, count: products.length },
    { key: "orders", label: "Orders", icon: <ShoppingCart className="h-4 w-4" />, count: orders.length },
    { key: "applications", label: "Applications", icon: <FileText className="h-4 w-4" />, count: applications.filter((a) => a.status === "pending").length },
    { key: "guides", label: "How-to Guides", icon: <BookOpen className="h-4 w-4" />, count: guides.length },
    { key: "categories", label: "Categories", icon: <Tag className="h-4 w-4" />, count: categories.length },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-green-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Panel
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Coffee Management</h1>
        </div>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.key
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === tab.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "products" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{products.length} product(s)</p>
            <button
              type="button"
              onClick={() => { resetProductForm(); setShowProductForm(true); }}
              className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </div>

          {showProductForm && (
            <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{editingProduct ? "Edit Product" : "New Product"}</h2>
                <button type="button" onClick={resetProductForm} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveProduct} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">SKU</label>
                  <input
                    type="text"
                    required
                    value={productForm.sku}
                    onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={productForm.category_id}
                    onChange={(e) => setProductForm((p) => ({ ...p, category_id: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={productForm.price}
                    onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Shipping Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={productForm.shipping_cost}
                    onChange={(e) => setProductForm((p) => ({ ...p, shipping_cost: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Stock Status</label>
                  <select
                    value={productForm.stock_status}
                    onChange={(e) => setProductForm((p) => ({ ...p, stock_status: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="low_stock">Low Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Unit</label>
                  <select
                    value={productForm.unit}
                    onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="each">Each</option>
                    <option value="bag">Bag</option>
                    <option value="box">Box</option>
                    <option value="case">Case</option>
                    <option value="packet">Packet</option>
                    <option value="bottle">Bottle</option>
                    <option value="container">Container</option>
                    <option value="pack">Pack</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Min Order Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={productForm.min_order_qty}
                    onChange={(e) => setProductForm((p) => ({ ...p, min_order_qty: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Sort Order</label>
                  <input
                    type="number"
                    value={productForm.sort_order}
                    onChange={(e) => setProductForm((p) => ({ ...p, sort_order: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Product Image</label>
                  <div className="flex items-start gap-4">
                    {productForm.image_url && (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                        <img src={productForm.image_url} alt="Preview" className="h-full w-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setProductForm((p) => ({ ...p, image_url: "" }))}
                          className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white shadow-sm hover:bg-red-600 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 transition-colors hover:border-green-400 hover:text-green-600">
                        {uploadingImage ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            {productForm.image_url ? "Replace Image" : "Upload Image"}
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingImage}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <p className="mt-1.5 text-xs text-gray-400">JPG, PNG, WebP — max 5MB</p>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    rows={2}
                    value={productForm.description}
                    onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
                    className={inputClass + " resize-none"}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={productForm.active}
                      onChange={(e) => setProductForm((p) => ({ ...p, active: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={resetProductForm}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingProduct}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                    >
                      {savingProduct && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingProduct ? "Update" : "Create"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Name</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">SKU</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Category</th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">Price</th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">Shipping</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Stock</th>
                    <th className="px-5 py-3 text-center font-semibold text-gray-600">Active</th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-gray-500">No products yet</td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-medium text-gray-900">{product.name}</td>
                        <td className="px-5 py-3 text-gray-600">{product.sku}</td>
                        <td className="px-5 py-3 text-gray-600">{product.coffee_categories?.name || "—"}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">${Number(product.price).toFixed(2)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{Number(product.shipping_cost) > 0 ? `$${Number(product.shipping_cost).toFixed(2)}` : "Free"}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            product.stock_status === "in_stock" ? "bg-green-100 text-green-700" :
                            product.stock_status === "low_stock" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {product.stock_status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(product)}
                            className={`h-5 w-9 rounded-full transition-colors cursor-pointer ${product.active ? "bg-green-600" : "bg-gray-300"}`}
                          >
                            <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${product.active ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startEditProduct(product)}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(product.id)}
                              disabled={deletingProduct === product.id}
                              className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                            >
                              {deletingProduct === product.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "orders" && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Order #</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Operator</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Total</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-gray-500">No orders yet</td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <Fragment key={order.id}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-medium text-gray-900">{order.order_number}</td>
                        <td className="px-5 py-3">
                          <p className="text-gray-900">{order.profiles?.full_name || "Unknown"}</p>
                          <p className="text-xs text-gray-500">{order.profiles?.email}</p>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">${Number(order.total).toFixed(2)}</td>
                        <td className="px-5 py-3">
                          <div className="relative inline-block">
                            <select
                              value={order.status}
                              onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                              disabled={updatingOrder === order.id}
                              className={`appearance-none rounded-full px-3 py-1 pr-7 text-xs font-medium cursor-pointer ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"}`}
                            >
                              {ORDER_STATUSES.map((s) => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2" />
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 cursor-pointer ml-auto"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {expandedOrder === order.id ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {expandedOrder === order.id && order.coffee_order_items && (
                        <tr key={`${order.id}-items`}>
                          <td colSpan={6} className="bg-gray-50 px-8 py-4">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="pb-2 text-left font-medium">Product</th>
                                  <th className="pb-2 text-center font-medium">Qty</th>
                                  <th className="pb-2 text-right font-medium">Price</th>
                                  <th className="pb-2 text-right font-medium">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {order.coffee_order_items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-1 text-gray-900">{item.product_name}</td>
                                    <td className="py-1 text-center text-gray-600">{item.quantity}</td>
                                    <td className="py-1 text-right text-gray-600">${Number(item.unit_price).toFixed(2)}</td>
                                    <td className="py-1 text-right font-medium text-gray-900">${Number(item.line_total).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "applications" && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Business</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Contact</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Email</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-gray-500">No applications yet</td>
                  </tr>
                ) : (
                  applications.map((app) => (
                    <tr key={app.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-900">{app.business_name || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{app.contact_name || app.profiles?.full_name || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{app.email || app.profiles?.email || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{new Date(app.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[app.status] || "bg-gray-100 text-gray-600"}`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {app.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApplicationAction(app.id, "approved")}
                                disabled={processingApp === app.id}
                                className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-100 disabled:opacity-50 cursor-pointer"
                              >
                                {processingApp === app.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApplicationAction(app.id, "rejected")}
                                disabled={processingApp === app.id}
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "guides" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{guides.length} guide(s)</p>
            <button
              type="button"
              onClick={() => { resetGuideForm(); setShowGuideForm(true); }}
              className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Guide
            </button>
          </div>

          {showGuideForm && (
            <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{editingGuide ? "Edit Guide" : "New Guide"}</h2>
                <button type="button" onClick={resetGuideForm} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveGuide} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Title</label>
                  <input
                    type="text"
                    required
                    value={guideForm.title}
                    onChange={(e) => setGuideForm((g) => ({ ...g, title: e.target.value }))}
                    className={inputClass}
                    placeholder="e.g. How to Clean Your Coffee Machine"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={guideForm.category_id}
                    onChange={(e) => setGuideForm((g) => ({ ...g, category_id: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Summary</label>
                  <input
                    type="text"
                    value={guideForm.summary}
                    onChange={(e) => setGuideForm((g) => ({ ...g, summary: e.target.value }))}
                    className={inputClass}
                    placeholder="Brief description shown on guide cards"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Cover Image</label>
                  <div className="flex items-start gap-4">
                    {guideForm.image_url && (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                        <img src={guideForm.image_url} alt="Preview" className="h-full w-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setGuideForm((g) => ({ ...g, image_url: "" }))}
                          className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white shadow-sm hover:bg-red-600 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 transition-colors hover:border-green-400 hover:text-green-600">
                        {uploadingGuideImage ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            {guideForm.image_url ? "Replace Image" : "Upload Image"}
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingGuideImage}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleGuideImageUpload(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <p className="mt-1.5 text-xs text-gray-400">JPG, PNG, WebP — max 5MB</p>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Content</label>
                  <textarea
                    rows={8}
                    required
                    value={guideForm.content}
                    onChange={(e) => setGuideForm((g) => ({ ...g, content: e.target.value }))}
                    className={inputClass + " resize-none"}
                    placeholder="Write your guide content here. You can use line breaks for formatting."
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Sort Order</label>
                  <input
                    type="number"
                    value={guideForm.sort_order}
                    onChange={(e) => setGuideForm((g) => ({ ...g, sort_order: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={guideForm.active}
                      onChange={(e) => setGuideForm((g) => ({ ...g, active: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={resetGuideForm}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingGuide}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                    >
                      {savingGuide && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingGuide ? "Update" : "Create"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Title</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Category</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Summary</th>
                    <th className="px-5 py-3 text-center font-semibold text-gray-600">Active</th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guides.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-500">No guides yet</td>
                    </tr>
                  ) : (
                    guides.map((guide) => (
                      <tr key={guide.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {guide.image_url && (
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                                <img src={guide.image_url} alt="" className="h-full w-full object-cover" />
                              </div>
                            )}
                            <span className="font-medium text-gray-900">{guide.title}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{guide.coffee_categories?.name || "—"}</td>
                        <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{guide.summary || "—"}</td>
                        <td className="px-5 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleGuideActive(guide)}
                            className={`h-5 w-9 rounded-full transition-colors cursor-pointer ${guide.active ? "bg-green-600" : "bg-gray-300"}`}
                          >
                            <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${guide.active ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startEditGuide(guide)}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteGuide(guide.id)}
                              disabled={deletingGuide === guide.id}
                              className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                            >
                              {deletingGuide === guide.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "categories" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{categories.length} category(ies)</p>
            <button
              type="button"
              onClick={() => { resetCategoryForm(); setShowCategoryForm(true); }}
              className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Category
            </button>
          </div>

          {showCategoryForm && (
            <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{editingCategory ? "Edit Category" : "New Category"}</h2>
                <button type="button" onClick={resetCategoryForm} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveCategory} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))}
                    className={inputClass}
                    placeholder="e.g. Coffee Beans"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Sort Order</label>
                  <input
                    type="number"
                    value={categoryForm.sort_order}
                    onChange={(e) => setCategoryForm((c) => ({ ...c, sort_order: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                  <input
                    type="text"
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm((c) => ({ ...c, description: e.target.value }))}
                    className={inputClass}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={resetCategoryForm}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingCategory}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                    >
                      {savingCategory && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingCategory ? "Update" : "Create"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Name</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Slug</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Description</th>
                    <th className="px-5 py-3 text-center font-semibold text-gray-600">Sort Order</th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-500">No categories yet</td>
                    </tr>
                  ) : (
                    categories.map((cat) => (
                      <tr key={cat.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-medium text-gray-900">{cat.name}</td>
                        <td className="px-5 py-3 text-gray-600">{cat.slug}</td>
                        <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{cat.description || "—"}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{cat.sort_order ?? 0}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startEditCategory(cat)}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat.id)}
                              disabled={deletingCategory === cat.id}
                              className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                            >
                              {deletingCategory === cat.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
