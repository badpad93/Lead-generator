import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "Learn how VendHub connects locations with vending machine operators in three simple steps.",
  alternates: { canonical: "/how-it-works" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
