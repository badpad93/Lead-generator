"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  LayoutDashboard,
  Users,
  Kanban,
  Building2,
  ClipboardList,
  FolderOpen,
  PhoneCall,
  DollarSign,
  TrendingUp,
  Zap,
  LogOut,
  Menu,
  X,
  Loader2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/sales", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sales/results", label: "Results", icon: TrendingUp },
  { href: "/sales/leads", label: "Leads", icon: Users },
  { href: "/sales/deals", label: "Deals", icon: Kanban },
  { href: "/sales/accounts", label: "Accounts", icon: Building2 },
  { href: "/sales/orders", label: "Orders", icon: ClipboardList },
  { href: "/sales/commissions", label: "Commissions", icon: DollarSign },
  { href: "/sales/call-lists", label: "Call Lists", icon: PhoneCall },
  { href: "/sales/resources", label: "Resources", icon: FolderOpen },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push("/login?redirect=/sales");
        return;
      }

      // Check profile role
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        router.push("/");
        return;
      }
      const users = await res.json();
      const me = users.find((u: { id: string }) => u.id === session.user.id);
      if (!me) {
        router.push("/");
        return;
      }
      setUserName(me.full_name || me.email);
      setAuthorized(true);
      setLoading(false);
    }
    checkAccess();
  }, [router]);

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden w-56 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-4">
          <span className="flex items-center gap-1.5 text-lg font-bold text-green-600"><Zap className="h-5 w-5 fill-green-600" />Sales CRM</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/sales" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <p className="mb-2 truncate px-3 text-xs text-gray-400">{userName}</p>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
          <span className="flex items-center gap-1.5 text-lg font-bold text-green-600"><Zap className="h-5 w-5 fill-green-600" />Sales CRM</span>
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            <div className="fixed right-0 top-0 z-50 flex h-full w-64 flex-col bg-white shadow-2xl lg:hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
                <span className="flex items-center gap-1.5 text-lg font-bold text-green-600"><Zap className="h-5 w-5 fill-green-600" />Sales CRM</span>
                <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-0.5 px-2 py-3">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href || (item.href !== "/sales" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
                        active ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-gray-100 p-3">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
