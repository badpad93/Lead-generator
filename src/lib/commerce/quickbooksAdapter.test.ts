import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeQbo } from "./__testutils__/fakeQbo";

/**
 * The Vinnie adapter: production-only construction, hostile hosted-link
 * rejection, Item-referenced invoice payloads, deterministic idempotency,
 * and read-only Item listing. The low-level QuickBooks fetch is a fake
 * behind a spy so the tests can prove it is never reached when the gate
 * is closed.
 */
const qbo = createFakeQbo();
const lowLevel = vi.fn((path: string, options?: RequestInit) => qbo.api(path, options));
const guard = { production: true };
vi.mock("@/lib/quickbooks", () => ({
  qbApi: (path: string, options?: RequestInit) => lowLevel(path, options),
  isQbProduction: () => guard.production,
}));

import { assertVinnieQuickBooksAllowed, createVinnieQuickBooks, validateHostedInvoiceLink, vinnieQuickBooksGate, VINNIE_QBO_ENV_VARS } from "./quickbooksAdapter";

const PROD = { VERCEL_ENV: "production" };
const YES = () => true;
const NO = () => false;
const LINES = [{ description: "Website Creation", unitPrice: 500, quantity: 1, qbItemId: "77" }];
const INVOICE = { customerId: "C1", customerEmail: "jamie@example.com", billAddr: { line1: "1 Main", city: "Austin", state: "TX", postalCode: "78701" }, lines: LINES, docNumber: "VQ-260908-0001-V1", memo: "m", privateNote: { type: "vinnie_quote" } };

beforeEach(() => {
  qbo.reset();
  lowLevel.mockClear();
  guard.production = true;
});

describe("environment gate", () => {
  it("only VERCEL_ENV=production with the production QuickBooks guard opens; preview, development, test, and missing fail closed before any client exists", () => {
    expect(vinnieQuickBooksGate(PROD, YES).allowed).toBe(true);
    const closed = ["preview", "development", "test", "", undefined].map((value) => ({ VERCEL_ENV: value, QB_ENVIRONMENT: "production" }));
    expect(closed.map((env) => vinnieQuickBooksGate(env, YES).allowed)).toEqual([false, false, false, false, false]);
    const attempts = closed.flatMap((env) => [() => assertVinnieQuickBooksAllowed(env, YES), () => createVinnieQuickBooks(env, lowLevel, YES)]);
    for (const attempt of attempts) expect(attempt).toThrow(/production site/);
    expect(() => createVinnieQuickBooks(PROD, lowLevel, NO)).toThrow(/not configured for production/);
    expect(lowLevel).not.toHaveBeenCalled();
    expect([...VINNIE_QBO_ENV_VARS]).toEqual(["VERCEL_ENV", "QB_ENVIRONMENT"]);
  });

  it("an adapter constructed in production stops calling QuickBooks the moment the environment changes", async () => {
    const env: Record<string, string | undefined> = { VERCEL_ENV: "production" };
    const client = createVinnieQuickBooks(env, lowLevel, () => guard.production);
    env.VERCEL_ENV = "preview";
    await expect(client.listItems()).rejects.toThrow(/production site/);
    env.VERCEL_ENV = "production";
    guard.production = false;
    await expect(client.getInvoiceStatus("1")).rejects.toThrow(/not configured/);
    expect(lowLevel).not.toHaveBeenCalled();
  });
});

describe("validateHostedInvoiceLink", () => {
  it("accepts exact trusted hosts and dot-boundary subdomains over https only", () => {
    for (const ok of ["https://intuit.com/pay/1", "https://connect.intuit.com/portal/x", "https://app.qbo.intuit.com/app/invoice?txnId=1", "https://quickbooks.com/x", "https://c1.qb.quickbooks.com/pay", "HTTPS://Connect.Intuit.COM/x"]) {
      expect(validateHostedInvoiceLink(ok), ok).toMatch(/^https:\/\/(?:[a-z0-9.-]+\.)?(?:intuit|quickbooks)\.com\//);
    }
  });
  it("rejects hostile hostnames, credentials, non-https schemes, protocol-relative, javascript and data URLs, and malformed input", () => {
    const hostile: unknown[] = [
      "https://intuit.com.evil.example/pay",
      "https://evilintuit.com/pay",
      "https://intuit.com.attacker.net/",
      "https://quickbooks.com-pay.example/",
      "https://notquickbooks.com/",
      "https://intuit.co/",
      "https://user:pass@connect.intuit.com/pay",
      "https://connect.intuit.com@evil.example/pay",
      "https://intuit.com%2eevil.example/",
      "http://connect.intuit.com/pay",
      "//connect.intuit.com/pay",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
      "https://",
      "https:///intuit.com",
      "connect.intuit.com/pay",
      "https://connect.intuit.com/pay with space",
      "",
      "   ",
      "https://xn--ntuit-9ta.com/",
      "https://intuit.com..evil/",
      null,
      undefined,
      42,
      { href: "https://connect.intuit.com/" },
      `https://${"a".repeat(2100)}.intuit.com/`,
    ];
    for (const bad of hostile) expect(validateHostedInvoiceLink(bad), String(bad)).toBeNull();
  });
});

describe("invoice creation", () => {
  it("sends ItemRef on every line, the billing address, the deterministic DocNumber, and returns the validated hosted link", async () => {
    const client = createVinnieQuickBooks(PROD, lowLevel, YES);
    const customer = await client.findOrCreateCustomer({ displayName: "Jamie", email: "jamie@example.com", phone: "555" });
    const invoice = await client.createInvoice({ ...INVOICE, customerId: customer.Id });
    expect(invoice.DocNumber).toBe("VQ-260908-0001-V1");
    const create = qbo.requests.find((r) => r.method === "POST" && r.path === "/invoice")!.body as Record<string, unknown>;
    expect(create.DocNumber).toBe("VQ-260908-0001-V1");
    expect(create.BillAddr).toEqual({ Line1: "1 Main", City: "Austin", CountrySubDivisionCode: "TX", PostalCode: "78701" });
    expect((create.Line as Array<{ SalesItemLineDetail: { ItemRef: { value: string } }; Amount: number }>)[0]).toMatchObject({ Amount: 500, SalesItemLineDetail: { ItemRef: { value: "77" } } });
    expect(await client.getHostedInvoiceLink(invoice.Id)).toBe("https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-abc");
    qbo.invoiceLink = "http://connect.intuit.com/insecure";
    expect(await client.getHostedInvoiceLink(invoice.Id)).toBeNull();
    qbo.invoiceLink = undefined;
    expect(await client.getHostedInvoiceLink(invoice.Id)).toBeNull();
  });

  it("refuses free-text lines and never sends them", async () => {
    const client = createVinnieQuickBooks(PROD, lowLevel, YES);
    await expect(client.createInvoice({ ...INVOICE, lines: [{ ...LINES[0], qbItemId: "" }] })).rejects.toThrow(/Item reference/);
    await expect(client.createInvoice({ ...INVOICE, lines: [] })).rejects.toThrow(/at least one/);
    expect(lowLevel).not.toHaveBeenCalled();
  });

  it("is idempotent on DocNumber: a pre-existing invoice is returned and a 6140 duplicate error resolves to it", async () => {
    const client = createVinnieQuickBooks(PROD, lowLevel, YES);
    const first = await client.createInvoice(INVOICE);
    const second = await client.createInvoice(INVOICE);
    expect(second.Id).toBe(first.Id);
    expect(qbo.requests.filter((r) => r.method === "POST" && r.path === "/invoice")).toHaveLength(1);
    // Race: the pre-check misses, Intuit answers 6140, the adapter re-queries.
    qbo.requests = [];
    const raced = { ...INVOICE, docNumber: "VQ-RACE-V1" };
    qbo.failNextInvoiceCreate = { status: 400, body: '{"Fault":{"Error":[{"code":"6140","Message":"Duplicate Document Number Error"}]}}' };
    const pending = client.createInvoice(raced);
    qbo.invoices.push({ Id: "INV-RACED", DocNumber: "VQ-RACE-V1", TotalAmt: 500, Balance: 500, Line: [] });
    expect((await pending).Id).toBe("INV-RACED");
  });
});

describe("Item listing", () => {
  it("is read-only, paginates, and projects only safe fields", async () => {
    qbo.items = [
      { Id: "1", Name: "Website Creation", Sku: "WS0001", Active: true, Type: "Service", Taxable: true, SalesTaxCodeRef: { value: "TAX" }, IncomeAccountRef: { value: "SECRET-ACCOUNT" }, UnitPrice: 500 },
      { Id: "2", Name: "Old", Active: false },
    ];
    const client = createVinnieQuickBooks(PROD, lowLevel, YES);
    const items = await client.listItems();
    expect(items).toEqual([
      { id: "1", name: "Website Creation", sku: "WS0001", active: true, type: "Service", taxable: true, sales_tax_code: "TAX" },
      { id: "2", name: "Old", sku: null, active: false, type: null, taxable: null, sales_tax_code: null },
    ]);
    expect(JSON.stringify(items)).not.toContain("SECRET-ACCOUNT");
    expect(qbo.writes()).toHaveLength(0);
    expect(qbo.requests.every((r) => r.method === "GET" && r.path.startsWith("/query?"))).toBe(true);
  });
});
