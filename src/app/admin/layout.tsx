import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  description: "Vending Connector administration panel.",
  alternates: { canonical: "/admin" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
