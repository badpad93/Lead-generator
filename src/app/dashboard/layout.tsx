import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your Vending Connector account, requests, and listings.",
  alternates: { canonical: "/dashboard" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
