/**
 * In-memory Supabase query stub for assistant tests. Supports the
 * subset of the PostgREST builder the assistant modules use:
 * select/eq/neq/in/is/gte/lt/ilike/or/order/limit, count+head,
 * maybeSingle/single/thenable, insert().select().single(),
 * update().eq()/.or()/.is()/.select(). Test-only; never imported by
 * application code.
 */
import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;
export interface StubStore {
  [table: string]: Row[];
}
export interface StubWrite {
  table: string;
  op: "insert" | "update";
  payload: Row;
}

type Filter = (row: Row) => boolean;

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function clauseFilter(clause: string): Filter {
  const [col, op, ...rest] = clause.split(".");
  const value = rest.join(".");
  if (op === "is") return (r) => (value === "null" ? r[col] === null || r[col] === undefined : r[col] === (value === "true"));
  if (op === "lt") return (r) => typeof r[col] === "string" && (r[col] as string) < value;
  if (op === "gt") return (r) => typeof r[col] === "string" && (r[col] as string) > value;
  if (op === "eq") return (r) => String(r[col]) === value;
  if (op === "ilike") return (r) => typeof r[col] === "string" && likeToRegex(value).test(r[col] as string);
  return () => false;
}

let seq = 0;

export function createSupabaseStub(store: StubStore, writes: StubWrite[] = []) {
  const accessed = new Set<string>();

  function from(table: string) {
    accessed.add(table);
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" = "select";
    let head = false;
    let wantCount = false;
    let payload: Row | Row[] | null = null;
    let inserted: Row[] = [];
    let limitN: number | null = null;
    const order: { col: string; asc: boolean }[] = [];

    const rows = (): Row[] => {
      let out = (store[table] ?? []).filter((r) => filters.every((f) => f(r)));
      for (const o of [...order].reverse()) {
        out = [...out].sort((a, b) => {
          const av = String(a[o.col] ?? "");
          const bv = String(b[o.col] ?? "");
          return o.asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      return limitN === null ? out : out.slice(0, limitN);
    };

    const applyUpdate = (): Row[] => {
      const targets = rows();
      for (const r of targets) Object.assign(r, payload as Row);
      writes.push({ table, op: "update", payload: payload as Row });
      return targets;
    };

    const resolve = (): { data: unknown; error: null; count?: number } => {
      if (mode === "insert") return { data: inserted, error: null };
      if (mode === "update") return { data: applyUpdate(), error: null };
      const out = rows();
      if (head) return { data: null, error: null, count: out.length };
      return { data: out, error: null, count: wantCount ? out.length : undefined };
    };

    const chain: Record<string, unknown> = {};
    chain.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      head = !!opts?.head;
      wantCount = !!opts?.count;
      return chain;
    };
    chain.eq = (col: string, v: unknown) => {
      filters.push((r) => r[col] === v);
      return chain;
    };
    chain.neq = (col: string, v: unknown) => {
      filters.push((r) => r[col] !== v);
      return chain;
    };
    chain.in = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return chain;
    };
    chain.is = (col: string, v: unknown) => {
      filters.push((r) => (v === null ? r[col] === null || r[col] === undefined : r[col] === v));
      return chain;
    };
    chain.gte = (col: string, v: string) => {
      filters.push((r) => String(r[col]) >= v);
      return chain;
    };
    chain.lt = (col: string, v: string) => {
      filters.push((r) => String(r[col]) < v);
      return chain;
    };
    chain.ilike = (col: string, pattern: string) => {
      filters.push((r) => typeof r[col] === "string" && likeToRegex(pattern).test(r[col] as string));
      return chain;
    };
    chain.or = (expr: string) => {
      const clauses = expr.split(",").map(clauseFilter);
      filters.push((r) => clauses.some((c) => c(r)));
      return chain;
    };
    chain.order = (col: string, opts?: { ascending?: boolean }) => {
      order.push({ col, asc: opts?.ascending !== false });
      return chain;
    };
    chain.limit = (n: number) => {
      limitN = n;
      return chain;
    };
    chain.insert = (p: Row | Row[]) => {
      mode = "insert";
      payload = p;
      const arr = Array.isArray(p) ? p : [p];
      inserted = arr.map((r) => ({ id: randomUUID(), created_at: new Date(Date.now() + ++seq).toISOString(), ...r }));
      store[table] = [...(store[table] ?? []), ...inserted];
      writes.push({ table, op: "insert", payload: inserted[0] });
      return chain;
    };
    chain.update = (p: Row) => {
      mode = "update";
      payload = p;
      return chain;
    };
    chain.maybeSingle = async () => {
      const r = resolve();
      const arr = (r.data as Row[] | null) ?? [];
      return { data: arr[0] ?? null, error: null };
    };
    chain.single = async () => {
      const r = resolve();
      const arr = (r.data as Row[] | null) ?? [];
      return { data: arr[0] ?? null, error: arr[0] ? null : { message: "no rows" } };
    };
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected);
    return chain;
  }

  return { from, accessed, writes };
}
