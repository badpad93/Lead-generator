"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DollarSign, ListChecks, FileText, RotateCcw, AlertTriangle, PieChart, Users, ArrowLeftRight, Database } from "lucide-react";

const NAV = [
  { href: "/admin/financial", label: "Overview", icon: PieChart, exact: true },
  { href: "/admin/financial/payments", label: "Payments", icon: DollarSign },
  { href: "/admin/financial/invoices", label: "Invoices", icon: FileText },
  { href: "/admin/financial/refunds", label: "Refunds", icon: RotateCcw },
  { href: "/admin/financial/reconciliation", label: "Reconciliation", icon: AlertTriangle },
  { href: "/admin/financial/commissions", label: "Commissions", icon: ListChecks },
  { href: "/admin/financial/attributions", label: "Attributions", icon: Users },
  { href: "/admin/financial/settings", label: "Settings", icon: ArrowLeftRight },
  { href: "/admin/financial/backfill", label: "Backfill", icon: Database },
];

export default function FinancialLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto py-2">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const active = exact
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-green-primary text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
