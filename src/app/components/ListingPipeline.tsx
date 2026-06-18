"use client";

import Link from "next/link";
import { Clock, CheckCircle2, ShoppingBag, AlertTriangle } from "lucide-react";

interface ListingPipelineProps {
  listings: { status: string }[];
}

export default function ListingPipeline({ listings }: ListingPipelineProps) {
  if (listings.length === 0) return null;

  const pending = listings.filter(l => l.status === "pending_verification").length;
  const active = listings.filter(l => l.status === "active").length;
  const sold = listings.filter(l => l.status === "sold").length;
  const expired = listings.filter(l => l.status === "expired").length;

  const stages = [
    { label: "Pending Verification", count: pending, icon: Clock, color: "amber", href: "/my-listings" },
    { label: "Active", count: active, icon: CheckCircle2, color: "green", href: "/my-listings" },
    { label: "Sold", count: sold, icon: ShoppingBag, color: "blue", href: "/my-listings" },
    { label: "Expired", count: expired, icon: AlertTriangle, color: "red", href: "/my-listings" },
  ];

  const colorMap: Record<string, { bg: string; text: string; icon: string; ring: string }> = {
    amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-500", ring: "ring-amber-200" },
    green: { bg: "bg-green-50", text: "text-green-700", icon: "text-green-500", ring: "ring-green-200" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-500", ring: "ring-blue-200" },
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-500", ring: "ring-red-200" },
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900">Listing Pipeline</h3>
        <Link href="/my-listings" className="text-xs font-medium text-green-600 hover:text-green-700">
          View All →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stages.map((stage) => {
          const colors = colorMap[stage.color];
          const Icon = stage.icon;
          return (
            <Link
              key={stage.label}
              href={stage.href}
              className={`rounded-xl ${colors.bg} ring-1 ring-inset ${colors.ring} p-4 text-center transition-all hover:shadow-sm`}
            >
              <Icon className={`h-5 w-5 ${colors.icon} mx-auto mb-2`} />
              <p className={`text-2xl font-bold ${colors.text}`}>{stage.count}</p>
              <p className={`text-xs ${colors.text} mt-0.5`}>{stage.label}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
