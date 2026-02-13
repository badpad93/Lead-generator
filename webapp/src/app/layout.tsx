import type { Metadata } from "next";
import "./globals.css";

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
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        <header className="border-b bg-white">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
            <a href="/" className="text-xl font-bold text-blue-600">
              Lead Generator
            </a>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
