"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Clock, Package, Sparkles, User } from "lucide-react";
import type { UiBlock } from "./types";
import { shortDate, text, titleCase, usd } from "./format";

type Item = Record<string, unknown>;

function priceLabel(item: Item): string {
  const price = usd(item.display_price);
  if (!price) return item.pricing_mode === "requires_qualification" ? "Tier pricing" : "Price on request";
  const unit = item.unit ? ` / ${text(item.unit)}` : "";
  return `${price}${unit}`;
}

function availabilityBadge(item: Item): { label: string; cls: string } {
  const a = text(item.availability);
  if (a === "out_of_stock" || a === "unavailable") return { label: "Unavailable", cls: "bg-gray-100 text-gray-600" };
  if (a === "low_stock") return { label: "Low stock", cls: "bg-amber-50 text-amber-700" };
  if (a === "informational") return { label: "Info", cls: "bg-green-50 text-green-dark" };
  return { label: "Available", cls: "bg-green-50 text-green-dark" };
}

function ItemImage({ item }: { item: Item }) {
  const src = typeof item.image_url === "string" ? item.image_url : null;
  if (!src) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-lg bg-light-warm text-gray-300">
        <Package className="h-8 w-8" aria-hidden />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- remote catalog images with unknown hosts
  return <img src={src} alt="" className="h-28 w-full rounded-lg object-cover" loading="lazy" />;
}

function ProductCard({ item }: { item: Item }) {
  const badge = availabilityBadge(item);
  const href = typeof item.href === "string" ? item.href : null;
  const name = text(item.name, "Item");
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm" aria-label={name}>
      <ItemImage item={item} />
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-black-primary">{href ? <Link href={href} className="hover:underline">{name}</Link> : name}</h4>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
      </div>
      {item.category ? <p className="text-xs text-gray-500">{text(item.category)}</p> : null}
      {item.short_description ? <p className="line-clamp-3 text-xs text-gray-600">{text(item.short_description)}</p> : null}
      <p className="mt-auto text-sm font-semibold text-green-dark">{priceLabel(item)}</p>
    </article>
  );
}

export function ProductCards({ items }: { items: Item[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-500">No matching items were found.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <ProductCard key={text(item.product_id)} item={item} />
      ))}
    </div>
  );
}

export function ProductDetail({ item }: { item: Item }) {
  const attrs = Array.isArray(item.attributes) ? (item.attributes as Array<{ label: string; value: string }>) : [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-40 shrink-0">
          <ItemImage item={item} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold text-black-primary">{text(item.name)}</h4>
          <p className="text-sm font-semibold text-green-dark">{priceLabel(item)}</p>
          {item.description ? <p className="mt-2 text-sm text-gray-600">{text(item.description)}</p> : null}
          {item.shipping_note ? <p className="mt-2 text-xs text-gray-500">{text(item.shipping_note)}</p> : null}
        </div>
      </div>
      {attrs.length > 0 ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {attrs.map((a) => (
            <div key={a.label} className="flex justify-between gap-2 border-b border-gray-100 py-1">
              <dt className="text-gray-500">{a.label}</dt>
              <dd className="text-right text-black-primary">{a.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function attrValue(item: Item, label: string): string {
  const attrs = Array.isArray(item.attributes) ? (item.attributes as Array<{ label: string; value: string }>) : [];
  return attrs.find((a) => a.label === label)?.value ?? "—";
}

export function Comparison({ items, labels }: { items: Item[]; labels: string[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th scope="col">Attribute</th>
            {items.map((i) => (
              <th key={text(i.product_id)} scope="col">{text(i.name)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-medium">Price</td>
            {items.map((i) => (
              <td key={text(i.product_id)}>{priceLabel(i)}</td>
            ))}
          </tr>
          {labels.map((label) => (
            <tr key={label}>
              <td className="font-medium">{label}</td>
              {items.map((i) => (
                <td key={text(i.product_id)}>{attrValue(i, label)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerContext({ context }: { context: Item }) {
  if (context.authenticated !== true) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">
        <User className="h-4 w-4 text-gray-400" aria-hidden /> You are browsing as a guest. <Link href="/login?redirect=/assistant" className="text-green-dark underline">Sign in</Link> to see your account.
      </div>
    );
  }
  const counts = (context.counts ?? {}) as Record<string, unknown>;
  const storefront = context.storefront as { display_name?: string } | null | undefined;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-black-primary">
        <User className="h-4 w-4 text-green-primary" aria-hidden />
        {context.first_name ? `Hi ${text(context.first_name)}` : "Your account"}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div><dt className="text-gray-500">Account type</dt><dd className="text-black-primary">{titleCase(text(context.role_class, "member"))}</dd></div>
        {storefront?.display_name ? <div><dt className="text-gray-500">Storefront</dt><dd className="text-black-primary">{storefront.display_name}</dd></div> : null}
        <div><dt className="text-gray-500">Coffee orders</dt><dd className="text-black-primary">{text(counts.coffee_orders, "0")}</dd></div>
        <div><dt className="text-gray-500">Open workflows</dt><dd className="text-black-primary">{text(counts.workflows, "0")}</dd></div>
      </dl>
    </div>
  );
}

function StageIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-primary" aria-hidden />;
  if (status === "in_progress") return <Clock className="h-4 w-4 text-amber-500" aria-hidden />;
  return <Circle className="h-4 w-4 text-gray-300" aria-hidden />;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div><dt className="text-gray-500">{label}</dt><dd>{value}</dd></div>;
}

function OrderFacts({ record }: { record: Item }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
      <Fact label="Payment" value={titleCase(text(record.payment_status, "unknown"))} />
      <Fact label="Total" value={usd(record.total)} />
      <Fact label="Tracking" value={record.tracking_number ? text(record.tracking_number) : null} />
      <Fact label="Current stage" value={record.workflow_stage ? text(record.workflow_stage) : null} />
    </dl>
  );
}

function OrderLines({ record }: { record: Item }) {
  const items = Array.isArray(record.items) ? (record.items as Array<{ name: string; quantity: number }>) : [];
  const stages = Array.isArray(record.stages) ? (record.stages as Array<{ label: string; status: string }>) : [];
  return (
    <>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-gray-700">
          {items.map((i, idx) => (
            <li key={`${i.name}-${idx}`}>{i.quantity} × {i.name}</li>
          ))}
        </ul>
      ) : null}
      {stages.length > 0 ? (
        <ol className="mt-3 space-y-1 text-xs">
          {stages.map((s) => (
            <li key={s.label} className="flex items-center gap-2"><StageIcon status={s.status} />{s.label}</li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

export function OrderStatus({ status, record }: { status: string; record: Item | null }) {
  if (status === "authentication_required") {
    return <p className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">Please <Link href="/login?redirect=/assistant" className="text-green-dark underline">sign in</Link> to check an order.</p>;
  }
  if (status !== "found" || !record) {
    return <p className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">No matching order was found on your account.</p>;
  }
  const href = typeof record.href === "string" ? record.href : null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-black-primary">{text(record.reference)}</p>
          <p className="text-xs text-gray-500">{titleCase(text(record.record_type))} · {shortDate(record.date)}</p>
        </div>
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-dark">{titleCase(text(record.public_status))}</span>
      </div>
      <OrderFacts record={record} />
      <OrderLines record={record} />
      {href ? <Link href={href} className="mt-3 inline-block text-xs text-green-dark underline">View details</Link> : null}
    </div>
  );
}

export function Notice({ text: body }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{body}
    </p>
  );
}

export function BlockView({ block }: { block: UiBlock }) {
  switch (block.type) {
    case "product_cards":
      return <ProductCards items={block.items} />;
    case "product_detail":
      return <ProductDetail item={block.item} />;
    case "comparison":
      return <Comparison items={block.items} labels={block.attribute_labels} />;
    case "customer_context":
      return <CustomerContext context={block.context} />;
    case "order_status":
      return <OrderStatus status={block.status} record={block.record} />;
    case "notice":
      return <Notice text={block.text} />;
    default:
      return null;
  }
}
