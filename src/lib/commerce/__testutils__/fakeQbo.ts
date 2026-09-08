/**
 * In-memory QuickBooks Online fake for Vinnie adapter tests. Implements
 * just enough of the Accounting API surface the adapter touches, records
 * every request (method, path, body) so tests can prove what was and was
 * not sent, and never reaches the network. Test-only.
 */
export interface FakeRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeInvoice {
  Id: string;
  DocNumber: string;
  TotalAmt: number;
  Balance: number;
  InvoiceLink?: string;
  Line: unknown[];
  BillAddr?: unknown;
  CustomerRef?: unknown;
}

export interface FakeQbo {
  requests: FakeRequest[];
  customers: Array<{ Id: string; DisplayName: string; PrimaryEmailAddr?: { Address: string } }>;
  invoices: FakeInvoice[];
  items: Array<Record<string, unknown>>;
  /** Hosted link returned for invoices; set to something hostile to test validation. */
  invoiceLink: string | null | undefined;
  /** When set, the next invoice create fails with this body/status. */
  failNextInvoiceCreate: { status: number; body: string } | null;
  api: (path: string, options?: RequestInit) => Promise<Response>;
  writes: () => FakeRequest[];
  reset: () => void;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (body: string, status: number) => new Response(body, { status });

function decodeQuery(path: string): string {
  const q = new URL(`https://qbo.invalid${path}`).searchParams.get("query") ?? "";
  return q;
}

export function createFakeQbo(): FakeQbo {
  let seq = 100;
  const fake: FakeQbo = {
    requests: [],
    customers: [],
    invoices: [],
    items: [],
    invoiceLink: "https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-abc",
    failNextInvoiceCreate: null,
    writes: () => fake.requests.filter((r) => r.method !== "GET"),
    reset: () => {
      fake.requests = [];
      fake.customers = [];
      fake.invoices = [];
      fake.items = [];
      fake.invoiceLink = "https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-abc";
      fake.failNextInvoiceCreate = null;
      seq = 100;
    },
    api: async (path, options) => {
      const method = (options?.method ?? "GET").toUpperCase();
      const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
      fake.requests.push({ method, path, body });
      return route(fake, { method, path, body }, () => String(++seq));
    },
  };
  return fake;
}

const first = (re: RegExp, sql: string) => re.exec(sql)?.[1];
const queryResponse = (entity: string, rows: unknown[]) => json({ QueryResponse: rows.length ? { [entity]: rows } : {} });

const QUERIES: Record<string, (fake: FakeQbo, sql: string) => Response> = {
  Customer: (fake, sql) => {
    const email = first(/PrimaryEmailAddr = '([^']*)'/, sql);
    const name = first(/DisplayName = '([^']*)'/, sql);
    return queryResponse("Customer", fake.customers.filter((c) => (email ? c.PrimaryEmailAddr?.Address === email : c.DisplayName === name)));
  },
  Invoice: (fake, sql) => {
    const doc = first(/DocNumber = '([^']*)'/, sql);
    return queryResponse("Invoice", fake.invoices.filter((i) => i.DocNumber === doc));
  },
  Item: (fake, sql) => {
    const start = Number(first(/STARTPOSITION (\d+)/, sql) ?? 1);
    const max = Number(first(/MAXRESULTS (\d+)/, sql) ?? 1000);
    return queryResponse("Item", fake.items.slice(start - 1, start - 1 + max));
  },
};

function handleQuery(fake: FakeQbo, sql: string): Response {
  const handler = QUERIES[first(/FROM (\w+)/, sql) ?? ""];
  return handler ? handler(fake, sql) : text("unsupported query", 400);
}

type Handler = (fake: FakeQbo, body: unknown, nextId: () => string, match: RegExpExecArray) => Response;

function createCustomer(fake: FakeQbo, body: unknown, nextId: () => string): Response {
  const b = body as { DisplayName: string; PrimaryEmailAddr?: { Address: string } };
  const customer = { Id: `C${nextId()}`, DisplayName: b.DisplayName, PrimaryEmailAddr: b.PrimaryEmailAddr };
  fake.customers.push(customer);
  return json({ Customer: customer });
}

function createInvoice(fake: FakeQbo, body: unknown, nextId: () => string): Response {
  if (fake.failNextInvoiceCreate) {
    const f = fake.failNextInvoiceCreate;
    fake.failNextInvoiceCreate = null;
    return text(f.body, f.status);
  }
  const b = body as { DocNumber: string; Line: Array<{ Amount: number }>; BillAddr?: unknown; CustomerRef?: unknown };
  if (fake.invoices.some((i) => i.DocNumber === b.DocNumber)) return text('{"Fault":{"Error":[{"code":"6140","Message":"Duplicate Document Number Error"}]}}', 400);
  const total = b.Line.reduce((n, l) => n + l.Amount, 0);
  const invoice: FakeInvoice = { Id: `INV${nextId()}`, DocNumber: b.DocNumber, TotalAmt: total, Balance: total, Line: b.Line, BillAddr: b.BillAddr, CustomerRef: b.CustomerRef };
  fake.invoices.push(invoice);
  return json({ Invoice: invoice });
}

function getInvoice(fake: FakeQbo, _body: unknown, _nextId: () => string, match: RegExpExecArray): Response {
  const inv = fake.invoices.find((i) => i.Id === match[1]);
  if (!inv) return text("not found", 404);
  const withLink = match[2] && fake.invoiceLink !== undefined ? { ...inv, InvoiceLink: fake.invoiceLink } : inv;
  return json({ Invoice: withLink });
}

const ROUTES: Array<[string, RegExp, Handler]> = [
  ["GET", /^\/query\?/, (fake, _b, _n, m) => handleQuery(fake, decodeQuery(m.input))],
  ["POST", /^\/customer$/, createCustomer],
  ["POST", /^\/invoice$/, createInvoice],
  ["POST", /^\/invoice\/([^/?]+)\/send/, (_f, _b, _n, m) => json({ Invoice: { Id: m[1] } })],
  ["GET", /^\/invoice\/([^/?]+)(\?include=invoiceLink)?$/, getInvoice],
];

function route(fake: FakeQbo, req: FakeRequest, nextId: () => string): Response {
  for (const [m, re, handler] of ROUTES) {
    const match = re.exec(req.path);
    if (m === req.method && match) return handler(fake, req.body, nextId, match);
  }
  return text(`unhandled ${req.method} ${req.path}`, 404);
}
