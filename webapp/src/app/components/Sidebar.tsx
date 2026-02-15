"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  List,
  Zap,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "New Run", icon: PlusCircle },
  { href: "/runs", label: "All Runs", icon: List },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] flex flex-col z-50">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-slate-700">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Lead Generator</h1>
            <p className="text-[10px] text-slate-400 leading-tight">Business Lead Scraper</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Menu
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-slate-300 hover:bg-[var(--sidebar-active)] hover:text-white"
              }`}
            >
              <Icon className={`w-4.5 h-4.5 ${active ? "text-blue-400" : "text-slate-400"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-700">
        <p className="text-[11px] text-slate-500">
          Denver Lead Gen v1.0
        </p>
      </div>
    </aside>
  );
}
