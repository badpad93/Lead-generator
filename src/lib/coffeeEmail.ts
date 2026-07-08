import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ADMIN_EMAIL = process.env.COFFEE_ADMIN_EMAIL || "james@apexaivending.com";
// Coffee ORDERS route to the fulfillment mailbox so admin's inbox isn't the
// operational bottleneck. Applications still route to ADMIN_EMAIL.
const FULFILLMENT_EMAIL = process.env.COFFEE_FULFILLMENT_EMAIL || "fulfillment@vendingconnector.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function formatCurrency(amount: number): string {
  return `$${Number(amount).toFixed(2)}`;
}

interface OrderItem {
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface OrderNotificationParams {
  orderNumber: string;
  operatorName: string;
  operatorEmail: string;
  items: OrderItem[];
  subtotal: number;
  shippingEstimate: number;
  total: number;
  // Ship-to
  shippingBusinessName?: string | null;
  shippingName?: string | null;
  shippingAddress?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingZip?: string | null;
  shippingPhone?: string | null;
  // Bill-to
  billingBusinessName?: string | null;
  billingContactName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
}

function addressBlockHtml(label: string, business: string | null | undefined, contact: string | null | undefined, address: string | null | undefined, city: string | null | undefined, state: string | null | undefined, zip: string | null | undefined, phone: string | null | undefined, email: string | null | undefined): string {
  const lines: string[] = [];
  if (business) lines.push(`<strong>${business}</strong>`);
  if (contact) lines.push(contact);
  if (address) lines.push(address);
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityZip = zip ? `${cityState} ${zip}` : cityState;
  if (cityZip) lines.push(cityZip);
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  if (lines.length === 0) return "";
  return `
    <div style="flex: 1; min-width: 220px; padding: 12px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
      <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600;">${label}</p>
      <p style="margin: 0; font-size: 13px; color: #111827; line-height: 1.5;">${lines.join("<br/>")}</p>
    </div>`;
}

export async function sendCoffeeOrderNotification(params: OrderNotificationParams) {
  const {
    orderNumber, operatorName, operatorEmail, items,
    subtotal, shippingEstimate, total,
  } = params;

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">${item.product_name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">${formatCurrency(item.unit_price)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">${formatCurrency(item.line_total)}</td>
        </tr>`
    )
    .join("");

  const billingBlock = addressBlockHtml(
    "Bill To",
    params.billingBusinessName,
    params.billingContactName,
    params.billingAddress,
    params.billingCity,
    params.billingState,
    params.billingZip,
    params.billingPhone,
    params.billingEmail,
  );
  const shippingBlock = addressBlockHtml(
    "Ship To",
    params.shippingBusinessName,
    params.shippingName,
    params.shippingAddress,
    params.shippingCity,
    params.shippingState,
    params.shippingZip,
    params.shippingPhone,
    null,
  );
  const addressRow = (billingBlock || shippingBlock)
    ? `<div style="display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0;">${billingBlock}${shippingBlock}</div>`
    : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">Vending Connector</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">New Coffee Supply Order</p>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827;">Order ${orderNumber}</h2>
        <p style="margin: 0 0 8px; font-size: 14px; color: #374151;"><strong>Placed by:</strong> ${operatorName} (${operatorEmail})</p>
        ${addressRow}

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px;">
          <thead>
            <tr style="background: #e5e7eb;">
              <th style="padding: 8px 12px; text-align: left; color: #374151;">Product</th>
              <th style="padding: 8px 12px; text-align: center; color: #374151;">Qty</th>
              <th style="padding: 8px 12px; text-align: right; color: #374151;">Unit Price</th>
              <th style="padding: 8px 12px; text-align: right; color: #374151;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 16px;">
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Subtotal</td>
            <td style="padding: 4px 0; text-align: right; color: #111827;">${formatCurrency(subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Shipping Estimate</td>
            <td style="padding: 4px 0; text-align: right; color: #111827;">${formatCurrency(shippingEstimate)}</td>
          </tr>
          <tr style="border-top: 1px solid #e5e7eb;">
            <td style="padding: 8px 0 0; color: #111827; font-weight: 700;">Total</td>
            <td style="padding: 8px 0 0; text-align: right; color: #16a34a; font-weight: 700; font-size: 18px;">${formatCurrency(total)}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: FULFILLMENT_EMAIL,
    // CC the admin inbox so James sees every order come through in
    // addition to the fulfillment mailbox. Falls through gracefully if
    // both env vars point at the same address.
    cc: ADMIN_EMAIL && ADMIN_EMAIL !== FULFILLMENT_EMAIL ? [ADMIN_EMAIL] : undefined,
    subject: `New Coffee Order: ${orderNumber} from ${operatorName}`,
    html,
  });
}

export async function sendCoffeeOrderConfirmation(params: OrderNotificationParams) {
  const {
    orderNumber, operatorEmail, items,
    subtotal, shippingEstimate, total,
  } = params;

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">${item.product_name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">${formatCurrency(item.unit_price)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">${formatCurrency(item.line_total)}</td>
        </tr>`
    )
    .join("");

  const billingBlock = addressBlockHtml(
    "Bill To",
    params.billingBusinessName,
    params.billingContactName,
    params.billingAddress,
    params.billingCity,
    params.billingState,
    params.billingZip,
    params.billingPhone,
    params.billingEmail,
  );
  const shippingBlock = addressBlockHtml(
    "Ship To",
    params.shippingBusinessName,
    params.shippingName,
    params.shippingAddress,
    params.shippingCity,
    params.shippingState,
    params.shippingZip,
    params.shippingPhone,
    null,
  );
  const addressRow = (billingBlock || shippingBlock)
    ? `<div style="display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0;">${billingBlock}${shippingBlock}</div>`
    : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">Vending Connector</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">Order Confirmation</p>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827;">Thank you for your order!</h2>
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">Your order <strong>${orderNumber}</strong> has been received and is being processed.</p>
        ${addressRow}

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px;">
          <thead>
            <tr style="background: #e5e7eb;">
              <th style="padding: 8px 12px; text-align: left; color: #374151;">Product</th>
              <th style="padding: 8px 12px; text-align: center; color: #374151;">Qty</th>
              <th style="padding: 8px 12px; text-align: right; color: #374151;">Unit Price</th>
              <th style="padding: 8px 12px; text-align: right; color: #374151;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 16px;">
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Subtotal</td>
            <td style="padding: 4px 0; text-align: right; color: #111827;">${formatCurrency(subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Shipping Estimate</td>
            <td style="padding: 4px 0; text-align: right; color: #111827;">${formatCurrency(shippingEstimate)}</td>
          </tr>
          <tr style="border-top: 1px solid #e5e7eb;">
            <td style="padding: 8px 0 0; color: #111827; font-weight: 700;">Total</td>
            <td style="padding: 8px 0 0; text-align: right; color: #16a34a; font-weight: 700; font-size: 18px;">${formatCurrency(total)}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #6b7280; text-align: center;">
        Questions about your order? Contact us at
        <a href="mailto:james@apexaivending.com" style="color: #16a34a;">james@apexaivending.com</a>
        or call <a href="tel:+18888511462" style="color: #16a34a;">(888) 851-1462</a>
      </p>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: operatorEmail,
    subject: `Order Confirmed: ${orderNumber}`,
    html,
  });
}

interface ApplicationNotificationParams {
  businessName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  numLocations?: number | null;
  existingMachines?: number | null;
  estimatedVolume?: string | null;
}

export async function sendCoffeeApplicationNotification(params: ApplicationNotificationParams) {
  const { businessName, contactName, email, phone, numLocations, existingMachines, estimatedVolume } = params;

  const detailRow = (label: string, value: string | number | null | undefined) =>
    value != null
      ? `<tr>
           <td style="padding: 8px 0; color: #6b7280;">${label}</td>
           <td style="padding: 8px 0; text-align: right; color: #111827; font-weight: 500;">${value}</td>
         </tr>`
      : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">Vending Connector</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">New Coffee Program Application</p>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827;">Application Details</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${detailRow("Business Name", businessName)}
          ${detailRow("Contact Name", contactName)}
          ${detailRow("Email", email)}
          ${detailRow("Phone", phone)}
          ${detailRow("Locations", numLocations)}
          ${detailRow("Existing Machines", existingMachines)}
          ${detailRow("Estimated Volume", estimatedVolume)}
        </table>
      </div>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `New Coffee Application: ${businessName}`,
    html,
  });
}

interface ApprovalEmailParams {
  to: string;
  contactName: string;
  businessName: string;
}

export async function sendCoffeeApprovalEmail(params: ApprovalEmailParams) {
  const { to, contactName, businessName } = params;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">Vending Connector</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">Coffee Program Approved</p>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Welcome to the Coffee Program!</h2>
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
          Hello ${contactName},
        </p>
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
          Your application for <strong>${businessName}</strong> has been approved. You now have access to our full coffee supply catalog and can begin placing orders immediately.
        </p>
        <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
          Log in to your account to browse products and start ordering.
        </p>
      </div>

      <p style="font-size: 13px; color: #6b7280; text-align: center;">
        Questions? Contact us at
        <a href="mailto:james@apexaivending.com" style="color: #16a34a;">james@apexaivending.com</a>
        or call <a href="tel:+18888511462" style="color: #16a34a;">(888) 851-1462</a>
      </p>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Coffee Program Approved: ${businessName}`,
    html,
  });
}
