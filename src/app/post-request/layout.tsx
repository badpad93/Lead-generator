import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Post a Request",
  description:
    "Submit a request for a vending machine at your location and get matched with operators.",
  alternates: { canonical: "/post-request" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
