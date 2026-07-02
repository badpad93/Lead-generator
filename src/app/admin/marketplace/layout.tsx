"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Package, TrendingUp, Users, DollarSign, Star } from "lucide-react";

const NAV = [
  { href: "/admin/marketplace/contracts", label: "Contracts", icon: Briefcase },
  { href: "/admin/marketplace/submissions", label: "Submissions", icon: Package },
  { href: "/admin/marketplace/tier-proposals", label: "Tier Bumps", icon: TrendingUp },
  { href: "/admin/marketplace/payouts", label: "Payouts", icon: DollarSign },
  { href: "/admin/marketplace/ratings", label: "Ratings", icon: Star },
  { href: "/admin/marketplace/partners", label: "Partners", icon: Users },
];

export default function AdminMarketplaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto py-2">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${active ? "bg-green-primary text-white" : "text-gray-600 hover:bg-gray-100"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-6xl">
        {children}
      </div>
    </div>
  );
}
