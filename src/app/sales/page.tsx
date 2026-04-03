"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Users, Kanban, Building2, ClipboardList, Loader2 } from "lucide-react";
import Link from "next/link";

interface Stats {
  leads: number;
  deals: number;
  accounts: number;
  orders: number;
}

export default function SalesDashboard() {
  const [stats, setStats] = useState<Stats>({ leads: 0, deals: 0, accounts: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [leadsRes, dealsRes, accountsRes, ordersRes] = await Promise.all([
        fetch("/api/sales/leads", { headers }),
        fetch("/api/sales/deals", { headers }),
        fetch("/api/sales/accounts", { headers }),
        fetch("/api/sales/orders", { headers }),
      ]);

      const [leads, deals, accounts, orders] = await Promise.all([
        leadsRes.ok ? leadsRes.json() : [],
        dealsRes.ok ? dealsRes.json() : [],
        accountsRes.ok ? accountsRes.json() : [],
        ordersRes.ok ? ordersRes.json() : [],
      ]);

      setStats({
        leads: leads.length,
        deals: deals.length,
        accounts: accounts.length,
        orders: orders.length,
      });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: "Leads", value: stats.leads, icon: Users, href: "/sales/leads", color: "text-blue-600 bg-blue-50" },
    { label: "Deals", value: stats.deals, icon: Kanban, href: "/sales/deals", color: "text-green-600 bg-green-50" },
    { label: "Accounts", value: stats.accounts, icon: Building2, href: "/sales/accounts", color: "text-purple-600 bg-purple-50" },
    { label: "Orders", value: stats.orders, icon: ClipboardList, href: "/sales/orders", color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                  <card.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
