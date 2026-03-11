import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
  description:
    "Create your free Vending Connector account and start connecting with vending opportunities.",
  alternates: { canonical: "/signup" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
