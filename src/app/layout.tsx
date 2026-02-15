import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";

export const metadata: Metadata = {
  title: "Lead Generator",
  description: "Scrape and manage business leads by city and industry",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[var(--background)] text-[var(--foreground)] antialiased min-h-screen flex">
        <Sidebar />
        <main className="flex-1 ml-64 min-h-screen">
          <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
