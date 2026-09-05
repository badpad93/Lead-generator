import { resolveTenantById } from "@/lib/storefront/tenants";
import { getPublicQuoteByToken } from "@/lib/storefront/quotes";
import AuthBrandHeader from "@/app/components/AuthBrandHeader";
import QuoteAccept from "./QuoteAccept";

/**
 * Public, operator-branded quote page. Resolved by opaque token; renders
 * ONLY customer-safe fields (never cost/margin/internal notes). Uses the
 * customer shell (no global VC nav/footer) via the middleware predicate.
 */
const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let data: Awaited<ReturnType<typeof getPublicQuoteByToken>> | null = null;
  try {
    data = await getPublicQuoteByToken(token);
  } catch {
    data = null;
  }
  if (!data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-lg font-semibold">Quote not available</div>
          <div className="mt-2 text-sm text-gray-600">This link is no longer valid.</div>
        </div>
      </div>
    );
  }

  const q = data.quote as Record<string, unknown>;
  const tenant = await resolveTenantById(q.storefront_tenant_id as string);
  const brand = tenant?.brand ?? {};
  const primary = (brand.primary_color as string) || "#1a1a1a";
  const accent = (brand.accent_color as string) || "#c4a877";
  const authBrand = tenant
    ? {
        slug: tenant.slug,
        display_name: tenant.display_name,
        logo_url: (brand.logo_url as string) || null,
        primary_color: primary,
        accent_color: accent,
      }
    : null;

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 py-10" style={{ background: "#f6f4ef" }}>
      <div className="mx-auto w-full max-w-2xl">
        <AuthBrandHeader brand={authBrand} />
        <div className="rounded-2xl bg-white border border-gray-100 p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-black-primary">Your coffee service quote</h1>
          {q.prospect_company ? <p className="mt-1 text-sm text-gray-600">Prepared for {String(q.prospect_company)}</p> : null}

          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase">
                <th className="py-2">Item</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-2">
                    {String(l.product_name)}
                    {l.product_sku ? <span className="ml-1 text-[11px] text-gray-400">{String(l.product_sku)}</span> : null}
                  </td>
                  <td className="text-right">{String(l.quantity)}</td>
                  <td className="text-right">{money(l.quoted_unit_price)}</td>
                  <td className="text-right">{money(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-right font-semibold">Total</td>
                <td className="pt-3 text-right font-semibold">{money(q.total)}</td>
              </tr>
            </tfoot>
          </table>

          <QuoteAccept
            token={token}
            slug={tenant?.slug ?? null}
            accent={accent}
            primary={primary}
            alreadyAccepted={q.status === "accepted"}
          />
        </div>
        <p className="mt-4 text-center text-[11px] text-gray-400">Powered by Vending Connector</p>
      </div>
    </div>
  );
}
