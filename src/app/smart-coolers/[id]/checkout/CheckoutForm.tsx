"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ArrowRight, Coffee, Truck, Gift, FileText } from "lucide-react";

// Mirrors the server fee constants in smartCoolerCheckout.ts. Kept inline so
// this client bundle doesn't import the server-only pricing module.
const DELIVERY_STANDARD = 375;
const DELIVERY_WHITE_GLOVE = 500;
const HAUL_AWAY = 250;
const BREWER_SHIPPING = 99; // Flavia C600 ships for $99; the brewer itself is free on loan.

// The three Free-On-Loan acknowledgments (mirrors COFFEE_ACK_LABELS server-side).
const ACK_LABELS: { key: string; label: string }[] = [
  { key: "coffee_ack_exclusive_supply", label: "I agree to source coffee, pods, and supplies exclusively through the marketplace while the brewer is on loan." },
  { key: "coffee_ack_minimum_purchase", label: "I understand the $1,000 per machine, per month minimum purchase requirement." },
  { key: "coffee_ack_shipping_service_return", label: "I understand I'm responsible for shipping, installation, maintenance, and return of the loaned brewer." },
];

interface AgreementTemplate { version: number; title: string; content_html: string }

interface CoffeeProduct {
  id: string;
  name: string;
  price: number;
  description?: string | null;
}

interface CoffeeFields {
  business_name: string;
  num_locations: string;
  estimated_volume: string;
  notes: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  same_as_delivery: boolean;
}

const EMPTY_COFFEE: CoffeeFields = {
  business_name: "", num_locations: "", estimated_volume: "", notes: "",
  delivery_address: "", delivery_city: "", delivery_state: "", delivery_zip: "", same_as_delivery: true,
};

const label = "mb-1 block text-xs font-medium text-gray-500";
const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none";
const money = (n: number) => `$${n.toLocaleString()}`;

/** Pure order-total math (dollars) for the live summary. */
function priceTotals(a: { machinePrice: number; whiteGlove: boolean; haulAway: boolean; wantsCoffee: boolean; products: CoffeeProduct[]; qty: Record<string, number> }) {
  const deliveryFee = a.whiteGlove ? DELIVERY_WHITE_GLOVE : DELIVERY_STANDARD;
  const haulFee = a.haulAway ? HAUL_AWAY : 0;
  const coffeeProductsTotal = a.wantsCoffee ? a.products.reduce((sum, p) => sum + (a.qty[p.id] || 0) * p.price, 0) : 0;
  const brewerShip = a.wantsCoffee ? BREWER_SHIPPING : 0;
  const total = a.machinePrice + deliveryFee + haulFee + coffeeProductsTotal + brewerShip;
  return { deliveryFee, haulFee, coffeeProductsTotal, brewerShip, total };
}

export default function CheckoutForm({ machineId, machineName, priceCents }: { machineId: string; machineName: string; priceCents: number }) {
  const machinePrice = Math.round(priceCents / 100);
  const [contact, setContact] = useState({ full_name: "", email: "", phone: "" });
  const [delivery, setDelivery] = useState({ delivery_address: "", delivery_city: "", delivery_state: "", delivery_zip: "" });
  const [whiteGlove, setWhiteGlove] = useState(false);
  const [haulAway, setHaulAway] = useState(false);
  const [wantsCoffee, setWantsCoffee] = useState(false);
  const [coffee, setCoffee] = useState<CoffeeFields>(EMPTY_COFFEE);
  const [products, setProducts] = useState<CoffeeProduct[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [agreement, setAgreement] = useState<AgreementTemplate | null>(null);
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCoffee = useCallback(async () => {
    try {
      const [prodRes, agrRes] = await Promise.all([
        fetch("/api/coffee/products"),
        fetch("/api/smart-coolers/coffee-agreement"),
      ]);
      const prod = await prodRes.json().catch(() => ({}));
      const agr = await agrRes.json().catch(() => ({}));
      setProducts(Array.isArray(prod.products) ? prod.products : []);
      setAgreement(agr.template || null);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    if (!wantsCoffee || (products.length > 0 && agreement)) return;
    const run = async () => { await loadCoffee(); };
    run();
  }, [wantsCoffee, products.length, agreement, loadCoffee]);

  const { deliveryFee, haulFee, coffeeProductsTotal, brewerShip, total } = priceTotals({ machinePrice, whiteGlove, haulAway, wantsCoffee, products, qty });
  const folSigned = ACK_LABELS.every((a) => acks[a.key]) && signature.trim().length > 0;
  const canSubmit = !submitting && (!wantsCoffee || folSigned);

  function buildCoffeePart() {
    if (!wantsCoffee) return undefined;
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
    const addr = coffee.same_as_delivery ? delivery : {
      delivery_address: coffee.delivery_address, delivery_city: coffee.delivery_city,
      delivery_state: coffee.delivery_state, delivery_zip: coffee.delivery_zip,
    };
    return {
      business_name: coffee.business_name, contact_name: contact.full_name, email: contact.email, phone: contact.phone,
      num_locations: coffee.num_locations, estimated_volume: coffee.estimated_volume, notes: coffee.notes,
      ...addr, items,
      fol_signature: signature, acks, fol_template_version: agreement?.version ?? null,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...contact, ...delivery,
        white_glove: whiteGlove, haul_away: haulAway,
        coffee_requested: wantsCoffee, coffee: buildCoffeePart(),
      };
      const res = await fetch(`/api/smart-coolers/machines/${machineId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Checkout failed"); return; }
      if (data.url) window.location.href = data.url;
      else setError("Invoice sent — check your email to complete payment.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const setC = (k: keyof typeof contact, v: string) => setContact((f) => ({ ...f, [k]: v }));
  const setD = (k: keyof typeof delivery, v: string) => setDelivery((f) => ({ ...f, [k]: v }));
  const setCoffeeField = (k: keyof CoffeeFields, v: string | boolean) => setCoffee((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Your details">
        <Field label="Full name"><input required value={contact.full_name} onChange={(e) => setC("full_name", e.target.value)} className={input} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Email"><input required type="email" value={contact.email} onChange={(e) => setC("email", e.target.value)} className={input} /></Field>
          <Field label="Phone"><input type="tel" value={contact.phone} onChange={(e) => setC("phone", e.target.value)} className={input} /></Field>
        </div>
      </Section>

      <Section title="Delivery" icon={Truck}>
        <Field label="Street address"><input required value={delivery.delivery_address} onChange={(e) => setD("delivery_address", e.target.value)} className={input} /></Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2"><Field label="City"><input required value={delivery.delivery_city} onChange={(e) => setD("delivery_city", e.target.value)} className={input} /></Field></div>
          <Field label="State"><input required value={delivery.delivery_state} onChange={(e) => setD("delivery_state", e.target.value)} className={input} /></Field>
          <Field label="ZIP"><input required value={delivery.delivery_zip} onChange={(e) => setD("delivery_zip", e.target.value)} className={input} /></Field>
        </div>
        <Choice
          name="delivery"
          value={whiteGlove ? "white" : "standard"}
          onChange={(v) => setWhiteGlove(v === "white")}
          options={[
            { value: "standard", title: "Standard delivery", desc: "Curbside drop-off", price: DELIVERY_STANDARD },
            { value: "white", title: "White-glove delivery & install", desc: "Placed, set up, and ready to run", price: DELIVERY_WHITE_GLOVE },
          ]}
        />
        <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
          <input type="checkbox" checked={haulAway} onChange={(e) => setHaulAway(e.target.checked)} className="mt-0.5" />
          <span>Haul away or relocate my old machine <span className="font-semibold text-gray-900">(+{money(HAUL_AWAY)})</span><br /><span className="text-xs text-gray-400">Within 30 miles.</span></span>
        </label>
      </Section>

      <CoffeeSection
        wantsCoffee={wantsCoffee} setWantsCoffee={setWantsCoffee}
        coffee={coffee} setCoffeeField={setCoffeeField}
        products={products} qty={qty} setQty={setQty}
        agreement={agreement} acks={acks} setAcks={setAcks}
        signature={signature} setSignature={setSignature}
      />

      <OrderSummary
        machineName={machineName} machinePrice={machinePrice}
        whiteGlove={whiteGlove} deliveryFee={deliveryFee}
        haulAway={haulAway} haulFee={haulFee}
        wantsCoffee={wantsCoffee} coffeeProductsTotal={coffeeProductsTotal} brewerShip={brewerShip} total={total}
      />

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <SubmitBar canSubmit={canSubmit} submitting={submitting} total={total} showFolWarning={wantsCoffee && !folSigned} />
    </form>
  );
}

function SubmitBar({ canSubmit, submitting, total, showFolWarning }: { canSubmit: boolean; submitting: boolean; total: number; showFolWarning: boolean }) {
  return (
    <>
      {showFolWarning && (
        <p className="text-center text-xs text-amber-600">Accept the agreement terms and sign below to continue with coffee service.</p>
      )}
      <button type="submit" disabled={!canSubmit}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-hover disabled:opacity-50">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue to payment — {money(total)} <ArrowRight className="h-4 w-4" /></>}
      </button>
      <p className="text-center text-xs text-gray-400">We&apos;ll email a secure invoice to complete payment. No account required.</p>
    </>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: typeof Truck; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-black-primary">
        {Icon && <Icon className="h-4 w-4 text-green-primary" />} {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className={label}>{text}</span>{children}</label>;
}

function Choice({ name, value, onChange, options }: {
  name: string; value: string; onChange: (v: string) => void;
  options: { value: string; title: string; desc: string; price: number }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.value}
          className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${value === o.value ? "border-green-primary bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">{o.title}</span>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{o.desc}</p>
          <p className="mt-1 text-sm font-bold text-green-primary">{money(o.price)}</p>
        </label>
      ))}
    </div>
  );
}

function CoffeeSection({ wantsCoffee, setWantsCoffee, coffee, setCoffeeField, products, qty, setQty, agreement, acks, setAcks, signature, setSignature }: {
  wantsCoffee: boolean; setWantsCoffee: (v: boolean) => void;
  coffee: CoffeeFields; setCoffeeField: (k: keyof CoffeeFields, v: string | boolean) => void;
  products: CoffeeProduct[]; qty: Record<string, number>; setQty: (updater: (q: Record<string, number>) => Record<string, number>) => void;
  agreement: AgreementTemplate | null; acks: Record<string, boolean>; setAcks: (updater: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  signature: string; setSignature: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-black-primary">
        <Coffee className="h-4 w-4 text-green-primary" /> Coffee service <span className="text-xs font-normal text-gray-400">(optional)</span>
      </h2>
      <div className="mb-4 overflow-hidden rounded-xl border border-green-primary/30 bg-gradient-to-br from-green-50 to-light-warm p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-green-primary px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
            <Gift className="h-3.5 w-3.5" /> Free
          </span>
          <span className="text-sm font-bold text-black-primary">
            Flavia C600 brewer — a <span className="text-green-primary">$2,000 value</span>, yours <span className="underline decoration-green-primary decoration-2 underline-offset-2">free</span>
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-600">
          Say yes and we&apos;ll put a commercial <strong className="font-semibold text-black-primary">Flavia C600</strong> single-serve brewer
          in your space — the brewer itself is <strong className="font-semibold text-green-primary">$0 to buy and $0 to lease, yours free on loan</strong>.
          You cover a one-time <strong className="font-semibold text-black-primary">$99 brewer shipping</strong>, plus installation and
          maintenance, and keep the brewer free as long as you order supplies through our marketplace
          (<strong className="font-semibold text-black-primary">$1,000 per machine, per month minimum</strong>). Sign the quick agreement
          below and it ships with your cooler — stocked and earning from day one.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[{ v: false, t: "No coffee for now" }, { v: true, t: "Yes, add coffee service" }].map((o) => (
          <label key={String(o.v)}
            className={`cursor-pointer rounded-lg border p-3 text-sm font-semibold transition-colors ${wantsCoffee === o.v ? "border-green-primary bg-green-50 text-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
            <input type="radio" name="coffee" className="mr-2" checked={wantsCoffee === o.v} onChange={() => setWantsCoffee(o.v)} />
            {o.t}
          </label>
        ))}
      </div>

      {wantsCoffee && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Business name"><input value={coffee.business_name} onChange={(e) => setCoffeeField("business_name", e.target.value)} className={input} /></Field>
            <Field label="Number of locations"><input value={coffee.num_locations} onChange={(e) => setCoffeeField("num_locations", e.target.value)} className={input} /></Field>
          </div>
          <Field label="Estimated monthly volume"><input value={coffee.estimated_volume} onChange={(e) => setCoffeeField("estimated_volume", e.target.value)} placeholder="e.g. 20 lbs / 500 pods" className={input} /></Field>

          <CoffeeAddress coffee={coffee} setCoffeeField={setCoffeeField} />

          <div>
            <p className={label}>Add coffee products {products.length === 0 && <span className="text-gray-300">(loading…)</span>}</p>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {products.map((p) => (
                <ProductRow key={p.id} product={p} quantity={qty[p.id] || 0}
                  onChange={(n) => setQty((q) => ({ ...q, [p.id]: n }))} />
              ))}
              {products.length === 0 && <p className="p-3 text-xs text-gray-400">No coffee products available yet.</p>}
            </div>
          </div>
          <Field label="Anything else we should know?"><textarea rows={2} value={coffee.notes} onChange={(e) => setCoffeeField("notes", e.target.value)} className={input} /></Field>

          <FolAgreement agreement={agreement} acks={acks} setAcks={setAcks} signature={signature} setSignature={setSignature} />
        </div>
      )}
    </div>
  );
}

function CoffeeAddress({ coffee, setCoffeeField }: { coffee: CoffeeFields; setCoffeeField: (k: keyof CoffeeFields, v: string | boolean) => void }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input type="checkbox" checked={coffee.same_as_delivery} onChange={(e) => setCoffeeField("same_as_delivery", e.target.checked)} />
        Coffee ships to the same delivery address
      </label>
      {!coffee.same_as_delivery && (
        <div className="mt-3 space-y-3">
          <Field label="Coffee street address"><input value={coffee.delivery_address} onChange={(e) => setCoffeeField("delivery_address", e.target.value)} className={input} /></Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2"><Field label="City"><input value={coffee.delivery_city} onChange={(e) => setCoffeeField("delivery_city", e.target.value)} className={input} /></Field></div>
            <Field label="State"><input value={coffee.delivery_state} onChange={(e) => setCoffeeField("delivery_state", e.target.value)} className={input} /></Field>
            <Field label="ZIP"><input value={coffee.delivery_zip} onChange={(e) => setCoffeeField("delivery_zip", e.target.value)} className={input} /></Field>
          </div>
        </div>
      )}
    </div>
  );
}

function FolAgreement({ agreement, acks, setAcks, signature, setSignature }: {
  agreement: AgreementTemplate | null; acks: Record<string, boolean>;
  setAcks: (updater: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  signature: string; setSignature: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-green-primary/30 bg-green-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-green-primary" />
        <h3 className="text-sm font-bold text-black-primary">{agreement?.title || "Equipment Loan & Beverage Supply Agreement"}</h3>
        {agreement?.version != null && <span className="text-[11px] text-gray-400">v{agreement.version}</span>}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        The Flavia C600 is loaned free; this Free-On-Loan agreement covers the supply minimum and the shipping,
        installation, and maintenance you&apos;re responsible for. Please review and sign to add coffee service.
      </p>
      {agreement ? (
        <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: agreement.content_html }} />
      ) : (
        <p className="mb-3 text-xs text-gray-400">Loading agreement…</p>
      )}
      <div className="space-y-2">
        {ACK_LABELS.map((a) => (
          <label key={a.key} className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={!!acks[a.key]} onChange={(e) => setAcks((s) => ({ ...s, [a.key]: e.target.checked }))} className="mt-0.5" />
            <span>{a.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-3">
        <span className={label}>Signature — type your full legal name</span>
        <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full name"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 font-serif text-base italic focus:border-green-500 focus:outline-none" />
        <p className="mt-1 text-[11px] text-gray-400">Typing your name constitutes a legally binding electronic signature dated today.</p>
      </div>
    </div>
  );
}

function ProductRow({ product, quantity, onChange }: { product: CoffeeProduct; quantity: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{product.name}</p>
        <p className="text-xs text-green-primary">{money(product.price)} each</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(Math.max(0, quantity - 1))}
          className="h-7 w-7 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">−</button>
        <span className="w-6 text-center text-sm font-medium">{quantity}</span>
        <button type="button" onClick={() => onChange(quantity + 1)}
          className="h-7 w-7 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">+</button>
      </div>
    </div>
  );
}

function OrderSummary({ machineName, machinePrice, whiteGlove, deliveryFee, haulAway, haulFee, wantsCoffee, coffeeProductsTotal, brewerShip, total }: {
  machineName: string; machinePrice: number; whiteGlove: boolean; deliveryFee: number;
  haulAway: boolean; haulFee: number; wantsCoffee: boolean; coffeeProductsTotal: number; brewerShip: number; total: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-base font-bold text-black-primary">Order summary</h2>
      <dl className="space-y-1.5 text-sm">
        <Row label={machineName} value={money(machinePrice)} />
        <Row label={whiteGlove ? "White-glove delivery & install" : "Standard delivery"} value={money(deliveryFee)} />
        {haulAway && <Row label="Haul-away / relocation" value={money(haulFee)} />}
        {wantsCoffee && <Row label="Flavia C600 brewer shipping" value={money(brewerShip)} />}
        {wantsCoffee && coffeeProductsTotal > 0 && <Row label="Coffee products" value={money(coffeeProductsTotal)} />}
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-sm font-semibold text-gray-900">Total</span>
        <span className="text-xl font-bold text-green-primary">{money(total)}</span>
      </div>
    </div>
  );
}

function Row({ label: text, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-gray-600">
      <dt className="pr-4">{text}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
