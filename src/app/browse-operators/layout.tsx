import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Operators",
  description:
    "Find verified vending machine operators ready to place machines at your location.",
  alternates: { canonical: "/browse-operators" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
