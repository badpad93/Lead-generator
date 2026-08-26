/**
 * Central list of Apex admin email recipients for outbound notifications.
 *
 * Consumed by:
 *   - src/app/api/sales/orders/[id]/send/route.ts     (Orders + Quotes)
 *   - src/app/api/sales/agreements/[id]/send/route.ts (Agreement send)
 *   - src/app/api/agreements/sign/[token]/sign/route.ts (Operator signed)
 *   - src/app/api/request-location/route.ts           (Location Services intake)
 *   - src/lib/workflows/notifications.ts              (Every workflow event)
 *
 * Change recipients here and every surface updates on the next deploy.
 */

/**
 * Always-CC on every quote/order/agreement email the CRM fires
 * and every location services request admin notification. Also
 * added to every workflow notification recipient list.
 */
export const APEX_ADMIN_NOTIFY = [
  "james@apexaivending.com",
  "anthony.heidal@apexaivending.com",
  "bryan.rice@apexaivending.com",
] as const;
