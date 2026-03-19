import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Browse locations and operators for free. Purchase individual leads to unlock full details.",
  alternates: { canonical: "/pricing" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
