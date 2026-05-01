import Link from "next/link";
import { Phone, Zap } from "lucide-react";
import { TOOLTIP_COPY } from "@/lib/tooltipCopy";

const footerColumns = [
  {
    title: "Explore",
    links: [
      { label: "Locations for Sale", href: "/browse-requests" },
      { label: "Browse Operators", href: "/browse-operators" },
      { label: "How It Works", href: "/how-it-works" },
    ],
  },
  {
    title: "For Operators",
    links: [
      { label: "Post Listing", href: "/listings/new" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "For Locations",
    links: [
      { label: "Post Request", href: "/post-request" },
      { label: "Find Operators", href: "/browse-operators" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "How It Works", href: "/how-it-works" },
      { label: "Sign Up", href: "/signup" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-black-primary text-gray-300">
      {/* Main Footer Content */}
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2">
              <Zap className="h-6 w-6 text-green-600" />
              <span className="text-lg font-bold text-white">Vending Connector</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              The smarter way to connect vending machine operators with prime
              locations. Find your next placement today.
            </p>
            <a
              href="tel:+18888511462"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-green-primary transition-colors hover:text-green-hover"
            >
              <Phone className="h-4 w-4" />
              (888) 851-1462
            </a>
          </div>

          {/* Link Columns */}
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 transition-colors hover:text-green-primary"
                      title={TOOLTIP_COPY[link.label]}
                      aria-label={TOOLTIP_COPY[link.label]}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Vending Connector. All rights reserved.
          </p>
          <p className="text-xs text-gray-500">
            Made with{" "}
            <span className="text-green-primary" aria-label="love">
              &#9829;
            </span>{" "}
            for the vending industry
          </p>
        </div>
      </div>
    </footer>
  );
}
