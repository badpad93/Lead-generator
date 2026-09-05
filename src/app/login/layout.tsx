// Metadata is resolved per-request in page.tsx (generateMetadata), so
// it can brand the title with the operator's storefront when one is in
// context. This layout is just a pass-through.
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
