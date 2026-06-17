"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { DollarSign } from "lucide-react";

export default function FinancingFab() {
  const pathname = usePathname();

  // Hide on the financing page itself and in CRM/admin areas
  if (pathname === "/financing" || pathname.startsWith("/sales") || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <Link
      href="/financing"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-green-700 active:scale-95 cursor-pointer financing-fab-glow"
      aria-label="Get Financing"
    >
      <DollarSign className="h-5 w-5" />
      <span className="hidden sm:inline">Get Financing</span>
    </Link>
  );
}
