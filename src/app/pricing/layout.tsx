import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Unlock full access to VendHub's vending machine marketplace with our subscription plan.",
  alternates: { canonical: "/pricing" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
