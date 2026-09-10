"use client";

import Link from "next/link";
import { pct, text, usd, usd0 } from "./format";

/**
 * Vending business-plan blocks. Every number shown here arrived in a tool
 * result computed by the deterministic engine; these components only
 * format and arrange it. Monochrome with the single vinnie-green accent,
 * native <details> for the long tables (keyboard-operable, no JS), and
 * every table inside its own horizontal scroll region for phones.
 */
type Rec = Record<string, unknown>;
type Row = Array<string | number | null>;

const CARD = "rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-white";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900";
const TABLE = "w-full min-w-[28rem] border-collapse text-xs [&_th]:!border-neutral-700 [&_th]:!bg-neutral-900 [&_th]:!text-neutral-400 [&_td]:!border-neutral-800 [&_td]:!text-white [&_tr:hover_td]:!bg-neutral-800";
const BUTTON = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${FOCUS}`;
const PRIMARY = `${BUTTON} border-vinnie-green text-vinnie-green hover:bg-neutral-800`;
const SECONDARY = `${BUTTON} border-neutral-600 text-white hover:bg-neutral-800`;
const SUMMARY = `cursor-pointer select-none rounded py-1 text-sm font-semibold text-white ${FOCUS}`;

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);
const money = (v: unknown) => usd(v) ?? "—";
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const SOURCE_LABEL: Record<string, string> = { customer: "Customer-supplied", default: "Vending Connector default", calculated: "Calculated" };
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => text(x)) : []);

function websiteLabel(website: Rec): string {
  if (website.included === false) return "Website declined";
  if (website.available === false) return "Website: catalog correction needed";
  return "Website included";
}

/** One ladder rung's fit sentence. */
function fitText(l: Rec, recommended: boolean): string {
  const reasons = strings(l.reasons).join(" ") || "Not a fit";
  const base = l.suitable === true ? "Fits your answers" : reasons;
  return recommended ? `${base} · recommended starting point` : base;
}

function DataTable({ caption, columns, rows, testId }: { caption: string; columns: string[]; rows: Row[]; testId?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800" data-testid={testId}>
      <table className={TABLE}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>{columns.map((c, i) => <th key={c} scope="col" className={`whitespace-nowrap px-2 py-1.5 ${i > 0 ? "text-right" : "text-left"}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((v, ci) => <td key={ci} className={`px-2 py-1.5 ${ci > 0 ? "text-right tabular-nums" : "whitespace-nowrap"}`}>{v ?? "—"}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, open, testId, children }: { title: string; open?: boolean; testId: string; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border border-neutral-800 p-3" data-testid={testId}>
      <summary className={SUMMARY}>{title}</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-base font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

// ─── Business plan ──────────────────────────────────────────────────

function PlanHeader({ output, plan }: { output: Rec; plan: Rec }) {
  const saved = output.saved === true;
  const website = rec(plan.website);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs text-neutral-400">{saved ? `Saved plan ${text(output.plan_number)} · version ${text(output.version)}` : "Educational estimate · not saved"}</p>
        <h3 className="text-base font-semibold text-white">{text(plan.package_name)}</h3>
      </div>
      <div className="flex flex-wrap gap-1 text-[11px]">
        <span className={`rounded border px-2 py-0.5 ${website.included === false ? "border-neutral-600 text-neutral-300" : "border-vinnie-green text-vinnie-green"}`} data-testid="plan-website-state">{websiteLabel(website)}</span>
        {plan.confirmed === true ? <span className="rounded border border-vinnie-green px-2 py-0.5 text-vinnie-green">Assumptions confirmed</span> : <span className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300">Awaiting your confirmation</span>}
      </div>
    </div>
  );
}

function Assumptions({ plan }: { plan: Rec }) {
  const rows: Row[] = list(plan.assumptions).map((a) => [text(a.label), a.format === "percent" ? (pct(a.value) ?? "—") : money(a.value), SOURCE_LABEL[text(a.source)] ?? text(a.source)]);
  const rollout = rec(plan.rollout);
  const ramp = Array.isArray(rollout.ramp) ? rollout.ramp.map((r) => pct(r) ?? "—").join(" / ") : "—";
  rows.push(["Rollout: machines per month", text(rollout.machines_per_month), SOURCE_LABEL[text(rollout.source)] ?? "—"], ["Rollout: ramp (month 1 / 2 / 3+)", ramp, SOURCE_LABEL[text(rollout.source)] ?? "—"]);
  return (
    <Section title="Assumption summary" open testId="plan-assumptions">
      <DataTable caption="Assumptions with their sources" columns={["Assumption", "Value", "Source"]} rows={rows} />
    </Section>
  );
}

function Scenarios({ plan }: { plan: Rec }) {
  const scenarios = list(plan.scenarios);
  const pick = (k: string, f: (s: Rec) => string | number | null): Row => [k, ...scenarios.map(f)];
  const rows: Row[] = [
    pick("Monthly sales per cooler", (s) => money(s.sales_per_cooler)),
    pick("Stabilized monthly machine contribution", (s) => money(rec(s.stabilized_month).contribution)),
    pick("Year 1 machine contribution", (s) => money(rec(s.year1).contribution)),
    pick("Year 1 net after debt service", (s) => money(rec(s.year1).net_after_debt_service)),
    pick("Stabilized annual net after debt service", (s) => money(rec(s.stabilized_year).net_after_debt_service)),
    pick("Cash low point (Year 1)", (s) => money(s.cash_low_point)),
    pick("Break-even sales per cooler (VMS + debt)", (s) => money(rec(s.break_even).sales_per_cooler_for_vms_and_debt)),
  ];
  return (
    <Section title="Scenario comparison" open testId="plan-scenarios">
      <DataTable caption="Conservative, base, and growth scenarios" columns={["Measure", ...scenarios.map((s) => cap(text(s.scenario)))]} rows={rows} />
      <p className="text-[11px] text-neutral-400">Machine contribution is before company overhead, taxes, owner compensation, and debt service.</p>
    </Section>
  );
}

const ECON_LINES: Array<[string, string]> = [["sales", "Sales"], ["transactions", "Transactions"], ["cogs", "Product cost (COGS)"], ["gross_profit", "Gross margin"], ["vms", "VMS"], ["processing", "Percentage processing"], ["debit_fees", "Debit transaction fees"], ["shrink", "Shrink"], ["repair_reserve", "Repair reserve"], ["restocking", "Restocking labor and fuel"], ["pre_fee_contribution", "Pre-commission machine contribution"], ["location_fee", "Location commission"], ["contribution", "Machine contribution"], ["contribution_after_stress", "Contribution under 10% commission stress"]];

function Economics({ plan }: { plan: Rec }) {
  const scenarios = list(plan.scenarios);
  const rows: Row[] = ECON_LINES.map(([k, label]) => [label, ...scenarios.map((s) => (k === "transactions" ? text(rec(s.per_cooler_month)[k]) : money(rec(s.per_cooler_month)[k])))]);
  return (
    <Section title="Per-machine economics (one cooler, per month)" testId="plan-economics">
      <DataTable caption="Per-machine unit economics" columns={["Line", ...scenarios.map((s) => cap(text(s.scenario)))]} rows={rows} />
    </Section>
  );
}

/** Treatment column: quote line, declined (website), or financing request only. */
function treatmentOf(u: Rec): string {
  if (u.quotable !== true) return "Financing request only";
  return u.quantity === 0 ? "Declined by the customer." : "Quote line";
}

function SourcesUses({ plan }: { plan: Rec }) {
  const su = rec(plan.sources_and_uses);
  const rows: Row[] = list(su.uses).map((u) => [text(u.label), text(u.quantity), money(u.unit_amount), money(u.amount), treatmentOf(u)]);
  rows.push(["Total uses", "", "", money(su.total_uses), ""], ["Owner cash", "", "", money(su.owner_cash), "Source"], ["Financing request", "", "", money(su.financing_request), "Source"]);
  return (
    <Section title="Sources and uses of funds" open testId="plan-sources-uses">
      <DataTable caption="Sources and uses of funds" columns={["Use", "Qty", "Unit", "Amount", "Treatment"]} rows={rows} />
      <p className="text-[11px] text-neutral-400">Quote subtotal {money(su.quotable_subtotal)} + working capital {money(su.working_capital_allowance)} − owner cash {money(su.owner_cash)} = financing request {money(su.financing_request)}. Working capital is never an invoice line.</p>
      <p className="text-[11px] text-neutral-400">{text(su.placement_note)}</p>
    </Section>
  );
}

function Timeline({ plan }: { plan: Rec }) {
  const rows: Row[] = list(plan.timeline).map((t) => [`Month ${text(t.month)}`, text(t.deployed_this_month), text(t.machines_active), money(t.sales), money(t.contribution), money(t.debt_service), money(t.cumulative_cash)]);
  return (
    <Section title="Rollout timeline (base scenario, Year 1)" testId="plan-timeline">
      <DataTable caption="Deployment timeline" columns={["Month", "Placed", "Active", "Sales", "Contribution", "Debt service", "Cumulative cash"]} rows={rows} />
    </Section>
  );
}

function Financing({ plan }: { plan: Rec }) {
  const fin = rec(plan.financing);
  const rows: Row[] = list(fin.options).map((o) => [`${text(o.label)} (${text(o.term_years)} yrs at ${pct(o.annual_rate) ?? "—"})`, money(rec(o.illustrative).monthly_payment), money(rec(o.plan).monthly_payment), money(rec(o.plan).total_interest)]);
  return (
    <Section title="Debt-payment comparison" testId="plan-financing">
      <DataTable caption="Debt-payment comparison" columns={["Case", "Illustrative $55,000", "This plan's request", "Total interest"]} rows={rows} />
      <p className="text-[11px] text-neutral-400">{text(fin.lender_note)}</p>
    </Section>
  );
}

function Recommendation({ plan }: { plan: Rec }) {
  const r = rec(plan.recommendation);
  return (
    <div className="rounded-lg border border-neutral-800 p-3" data-testid="plan-recommendation">
      <p className="text-sm font-semibold text-white">Package fit</p>
      <ul className="mt-1 space-y-1 text-xs">
        {list(r.ladder).map((l) => (
          <li key={text(l.package)} className={l.package === r.recommended ? "text-vinnie-green" : "text-neutral-300"}>
            <span className="font-semibold">{text(l.name)}</span> · {usd0(l.estimate_total) ?? "—"} · {fitText(l, l.package === r.recommended)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuestActions({ output }: { output: Rec }) {
  if (output.saved === true || typeof output.sign_in_href !== "string") return null;
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="plan-guest-actions">
      <Link href={output.sign_in_href} prefetch={false} className={PRIMARY}>Sign in to save this plan</Link>
      <p className="text-xs text-neutral-400">Saving, exports, the quote, and the financing application need an account. Your conversation stays here.</p>
    </div>
  );
}

export function BusinessPlanBlock({ output }: { output: Rec }) {
  const plan = rec(output.plan);
  const base = list(plan.scenarios).find((s) => s.scenario === "base") ?? rec(list(plan.scenarios)[0]);
  const su = rec(plan.sources_and_uses);
  const notices = strings(output.notices);
  return (
    <div className={`${CARD} space-y-3`} data-testid="business-plan-block">
      <PlanHeader output={output} plan={plan} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Machines" value={text(plan.machines)} />
        <Stat label="Financing request" value={usd0(su.financing_request) ?? "—"} />
        <Stat label="Base Year 1 contribution" value={usd0(rec(base.year1).contribution) ?? "—"} />
        <Stat label="Selected case payment" value={`${money(rec(plan.financing).monthly_debt_service)}/mo`} />
      </div>
      {notices.length ? <ul className="space-y-1 text-xs text-neutral-300">{notices.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      <Assumptions plan={plan} />
      <Scenarios plan={plan} />
      <Economics plan={plan} />
      <SourcesUses plan={plan} />
      <Timeline plan={plan} />
      <Financing plan={plan} />
      <Recommendation plan={plan} />
      <GuestActions output={output} />
      <ul className="space-y-0.5 text-[11px] text-neutral-400">{strings(plan.disclaimers).map((d) => <li key={d}>{d}</li>)}</ul>
    </div>
  );
}

// ─── Other plan blocks ──────────────────────────────────────────────

function LadderItem({ rung, pkg, lead, recommended }: { rung: Rec; pkg: Rec; lead: boolean; recommended: boolean }) {
  return (
    <li className={`rounded-lg border p-3 ${recommended ? "border-vinnie-green" : "border-neutral-800"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-white">{lead ? "Lead offer · " : ""}{text(rung.name)}</p>
        <p className="text-xs text-neutral-400">≈ {usd0(rung.estimate_total) ?? "—"} incl. ≈ {usd0(pkg.estimate_working_capital) ?? "—"} working capital</p>
      </div>
      <p className="mt-1 text-xs text-neutral-300">{text(pkg.pitch)}</p>
      <p className={`mt-1 text-xs ${recommended ? "text-vinnie-green" : "text-neutral-400"}`}>{fitText(rung, recommended)}</p>
    </li>
  );
}

export function PackageRecommendationBlock({ recommendation, packages }: { recommendation: Rec; packages: Rec[] }) {
  return (
    <div className={`${CARD} space-y-2`} data-testid="package-recommendation-block">
      <p className="text-sm font-semibold text-white">Vending Connector launch packages</p>
      <ol className="space-y-2">
        {list(recommendation.ladder).map((l, i) => (
          <LadderItem key={text(l.package)} rung={l} pkg={packages.find((p) => p.package === l.package) ?? {}} lead={i === 0} recommended={l.package === recommendation.recommended} />
        ))}
      </ol>
    </div>
  );
}

export function PlanQuotePreviewBlock({ preview, reconciliation }: { preview: Rec[]; reconciliation: Rec }) {
  const rows: Row[] = preview.map((p) => [text(p.name), text(p.quantity), money(p.unit_price), money(p.line_total)]);
  return (
    <div className={`${CARD} space-y-2`} data-testid="plan-quote-preview-block">
      <p className="text-sm font-semibold text-white">Quote preview (not created yet)</p>
      <DataTable caption="Lines the quote would contain" columns={["Item", "Qty", "Unit", "Line"]} rows={rows} />
      <p className="text-[11px] text-neutral-400">Freight is added by the server, one per cooler. {text(reconciliation.note)}</p>
      <p className="text-xs text-neutral-300">Quote subtotal {money(reconciliation.quote_subtotal)} · working capital {money(reconciliation.working_capital_allowance)} · financing request {money(reconciliation.financing_request)}.</p>
      <p className="text-xs text-white">Tell Vinnie to create the quote when you are ready; nothing is created until you confirm.</p>
    </div>
  );
}

export function PlanExportsBlock({ planNumber, exports }: { planNumber: string; exports: Array<{ format: string; label: string; href: string }> }) {
  return (
    <div className={`${CARD} space-y-2`} data-testid="plan-exports-block">
      <p className="text-sm font-semibold text-white">Download plan {planNumber}</p>
      <div className="flex flex-wrap gap-2">
        {exports.map((e) => (
          <a key={e.format} href={e.href} className={SECONDARY} data-testid={`plan-export-${e.format}`}>{e.label}</a>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400">Generated on our servers from your saved plan. Upload the Word or Excel file to Google Docs or Sheets if you prefer.</p>
    </div>
  );
}

export function FinancingActionBlock({ action }: { action: Rec }) {
  const href = typeof action.href === "string" && action.href.startsWith("/financing") ? action.href : "/financing";
  const estimates = list(action.monthly_payment_estimates);
  return (
    <div className={`${CARD} space-y-3 border-vinnie-green`} data-testid="financing-action-block">
      <div>
        <p className="text-xs uppercase tracking-wide text-vinnie-green">Next step</p>
        <p className="text-base font-semibold text-white">Apply for financing on the {text(action.package_name)}</p>
        <p className="text-xs text-neutral-300">Financing request {money(action.financing_request)}{estimates.length ? ` · illustrative payments ${estimates.map((e) => `${text(e.label)} ${money(e.monthly_payment)}/mo`).join(", ")}` : ""}.</p>
      </div>
      <Link href={href} prefetch={false} className={`${PRIMARY} w-full sm:w-auto`} data-testid="financing-action-link">Open the secure financing application</Link>
      <p className="text-[11px] text-neutral-400">{text(action.notice)}</p>
    </div>
  );
}
