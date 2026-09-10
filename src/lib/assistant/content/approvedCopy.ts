/**
 * Approved static content for Phase 1 (no embeddings).
 *
 * Every statement below is drawn from current public Vending Connector
 * pages (homepage offering cards, how-it-works, website-services,
 * request-location, financing, machines-for-sale, coffee program) or
 * from canonical repository constants (location tier ladder). Nothing
 * here states a supplier cost, commission, margin, wholesale price,
 * internal note, or payment-provider detail, and nothing promises
 * income, revenue, or financing approval.
 *
 * Bump PROMPT_VERSION in ../config.ts when this file changes materially.
 */
export const APPROVED_COPY_VERSION = "2026-09-10.2";

export const APPROVED_COPY = `
## About Vending Connector
Vending Connector is a growth platform for modern vending operators, locators, and location managers. It connects locations that need vending machines with operators ready to serve, and offers equipment, coffee, location sourcing, websites, financing referrals, placement marketplaces, and established routes for sale. The company operates at vendingconnector.com; the coffee program and location team operate under the Apex AI Vending name.

## Vending industry basics (general education)
- A vending operator owns and services machines placed at host locations (offices, warehouses, schools, gyms, apartment buildings, hospitals, hotels).
- Locations are usually offered a commission or a free amenity in exchange for hosting a machine; terms are negotiated directly between operator and location.
- Common machine categories: snack, drink, combo (snack + drink), AI-powered smart coolers, coffee brewers, water, and ATMs.
- Good locations generally have steady daily traffic (employees plus visitors), long or 24/7 operating hours, and limited nearby alternatives.
- Operators grow by adding machines to existing locations, securing new locations, adding coffee or micro-market services, and buying established routes.
- Results vary widely by location, product mix, pricing, and service quality. No specific revenue or profit outcome can be promised for any route.

## Equipment: machines for sale
- The machine marketplace lists AI-powered coolers, snack and drink machines, combos, and specialty equipment from operators and manufacturers nationwide, including used and refurbished machines listed by operators.
- Listings show the seller's asking price and, where enabled, a buy-now price; some listings include delivery, installation, or a card reader, and manufacturer listings may show lead time, warranty, dimensions, electrical requirements, and certifications.
- Nationwide shipping and freight support is available; delivery fees are shown on the listing when they apply.
- Machine types used across the platform: Combo, AI, Water, Coffee, ATM.

## Financing (informational only)
- Financing for vending equipment, for single machines or whole fleets, may be available through third-party lenders; terms up to 10 years may be available, subject to eligibility and lender approval.
- Vending Connector connects applicants with vetted SBA-approved lenders; the financing page lets visitors check rates through a partner widget and, for applicants who prequalify, emails the lender's application PDF.
- The assistant cannot take a financing application in chat and cannot say whether anyone will be approved. Illustrative payment estimates come only from the business-plan calculation tool (approved cases: $55,000 over 10 years at 10%, about $726.83 a month; $55,000 over 5 years at 17%, about $1,366.89 a month; before lender fees), and rates, terms, eligibility, and approval are the lender's decision. Direct interested customers to the secure financing application and the sales team.

## Vending business plans (Vinnie's planning workflow)
- Vinnie guides prospective operators through discovery, a complete vending business plan, a top-down Vending Connector offer, an itemized quote, and the financing application. Everything financial is calculated by deterministic tools from approved default assumptions or the customer's own confirmed figures.
- Approved default assumptions: $800 stabilized monthly sales per cooler (conservative $600, growth $1,000), $3.50 average transaction, 55% gross margin (45% product cost), $40 VMS per cooler per month, 5.85% processing, 20% debit share at $0.22 per debit transaction, 3% shrink, 3% repair reserve, 8% restocking labor and fuel, location commission usually $0 with a 10% stress case, $500 opening inventory per cooler as startup cash.
- Offer ladder, always top-down: the 10/10/10 Launch Plan (ten coolers, ten locations; about $55,000 financed, roughly $45,000 of machines, freight, placements, website and startup items plus about $10,000 working capital), then the 5-Machine Growth Plan (about $30,000 including about $5,000 working capital), then the 1-Machine Starter Plan (about $7,000 including about $1,000 working capital). These are planning estimates; the quote uses current catalog prices, and working capital is never an invoice line.
- The website-creation service is part of every package unless the customer declines it. Placements for the smaller packages follow the location team's process; Vinnie never assigns a location tier.

## Coffee program (Apex AI Vending)
- Operators can add coffee to their route: under a qualifying equipment loan and beverage supply agreement, a commercial brewer is provided on loan (ownership does not transfer), and the operator orders coffee, cups, and supplies at operator pricing from the marketplace. Shipping, installation, service, and other terms are set by the agreement and may apply.
- Coffee access is granted after applying on the coffee page; the supply agreement sets the program terms. The assistant can describe the program but cannot sign, apply, or order on a customer's behalf.
- Product prices shown by the assistant come from the live catalog for the signed-in account (or the public list price for guests). Shipping for marketplace orders is estimated at checkout.

## Branded coffee storefronts
- Operators can launch a branded online coffee shop and resell coffee, cups, and supplies to their own customers under their logo, colors, and customer pricing; Vending Connector handles fulfillment and invoicing.
- Customers of a storefront see their operator's prices; those prices are what the assistant shows to an enrolled storefront customer.

## Location services (Apex AI Vending)
- The location team sources qualified vending locations in the operator's service area. The operator describes the market, ZIP codes, and machine types; a locator typically reaches out within one business day of a request; response times vary.
- Pricing is a transparent per-location tier ladder. Each secured location is assigned a tier (Basic, Premium, or Elite) based on its traffic (employees plus daily foot traffic), business hours, and the number of machines requested. The per-location fees for those tiers are the catalog prices the assistant can show; the location team determines the applicable tier for each location.
- A request starts with a deposit of $100 per location requested, credited toward the applicable placement fee; the remaining placement fee is billed as locations are secured.
- A prepaid "10/10/10" program is qualifying bundled program pricing, not a standalone per-location rate: it replaces the tiered fee with one flat per-location price for operators who qualify, subject to availability and the governing agreements. The sales team confirms eligibility and terms.
- The tier for any specific location is assessed by the location team; the assistant can explain the ladder but cannot pre-assign a tier or produce a customer-specific quote.

## Website services (informational only)
- Vending Connector builds professional websites designed for vending operators: credibility, lead capture, and services front and center, findable in search.
- The process is a guided intake (about ten minutes), then the team designs and builds the site and launches it. Pricing is discussed with the team; the assistant does not quote website services.

## Placement marketplace and routes
- Placement providers can list vending placements on the marketplace and connect directly with active operators; provider compensation is disclosed before an assignment is accepted and is governed by the provider agreement.
- Established vending routes with existing locations and cash flow can be browsed or listed for sale; buyers and sellers connect directly.

## How the platform works
1. Post a location or listing: describe the space, foot traffic, and machine type needed, or list available machines as an operator.
2. Get discovered: operators browse open requests and location managers browse operator profiles.
3. Purchase and contact: buying a lead unlocks full contact details to discuss commission terms, machine types, and installation timelines.
4. Machine gets installed: finalize the deal, schedule installation, and leave a review.

## What the assistant can and cannot do right now
- Can: explain the industry and the platform, search the coffee, machine, location-service, and commerce catalogs, show current prices for the signed-in account, compare items, show a signed-in customer's own account summary and order, workflow, or quote status, and (when the quote tools are offered) build and edit the signed-in customer's own draft quote with server-computed prices, automatic freight, and a seven-day expiry after confirmation.
- Cannot: check out, take payment, create invoices, submit financing or applications, sign agreements, send emails, select a location-service tier, or generate business plans. The customer uses the Checkout Securely, Email Quote, and Start Financing Application buttons for those; agreements and tier determinations come from the team. Marketplace machine listings without buy-now are handled by Request information, never a quote line.
- Never: quote a price that a tool did not return, promise income or approval, or ask for card, bank, Social Security, credit, or income details.
`.trim();
