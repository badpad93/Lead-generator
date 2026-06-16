import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  sendReceiptEmail,
  sendLeadDetailsEmail,
  sendPurchaseConfirmationEmail,
  isLeadInfoComplete,
} from "@/lib/email";
import { sendMachinePurchaseThankYouEmail, sendMachinePurchaseNotificationEmail } from "@/lib/machinePurchaseEmail";
import { generateSiteDetailsPdf } from "@/lib/pdf/agreementPdf";
import { sendFullSiteDetailsEmail } from "@/lib/agreementEmail";
import { sendLocationDealClosedEmail } from "@/lib/locationAgreementEmail";
import { PricingResult } from "@/lib/pricing/locationPricing";

// ─── Lead Purchase ───

export async function handleLeadPurchaseCompleted(params: {
  sessionId: string;
  userId: string;
  requestId: string;
  agreementId?: string | null;
  buyerEmail: string | null;
  paymentId: string | null;
}) {
  const { sessionId, userId, requestId, agreementId, buyerEmail, paymentId } = params;

  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from("lead_purchases")
    .update({
      status: "completed",
      buyer_email: buyerEmail,
      stripe_payment_intent_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .or(`stripe_checkout_session_id.eq.${sessionId},qb_invoice_id.eq.${sessionId}`)
    .select("id, amount_cents, created_at")
    .single();

  if (purchaseError) {
    console.error("[payment-handler] Failed to update lead purchase:", purchaseError);
    return;
  }

  await supabaseAdmin
    .from("vending_requests")
    .update({ is_public: false, status: "matched" })
    .eq("id", requestId);

  if (agreementId && purchase) {
    await supabaseAdmin
      .from("signed_agreements")
      .update({ purchase_id: purchase.id })
      .eq("id", agreementId);
  }

  const { data: lead } = await supabaseAdmin
    .from("vending_requests")
    .select("title, city, state, location_name, address, zip, description, contact_phone, contact_email, decision_maker_name")
    .eq("id", requestId)
    .single();

  if (buyerEmail && lead) {
    try {
      await sendPurchaseConfirmationEmail({
        to: buyerEmail,
        leadTitle: lead.title,
        locationName: lead.location_name,
      });
    } catch (e) {
      console.error("[payment-handler] Failed to send purchase confirmation:", e);
    }
  }

  if (buyerEmail && lead && purchase) {
    const leadLocation = `${lead.city}, ${lead.state}`;
    try {
      await sendReceiptEmail({
        to: buyerEmail,
        leadTitle: lead.title,
        leadLocation,
        purchaseDate: purchase.created_at,
        amountCents: purchase.amount_cents,
        orderId: purchase.id,
      });
    } catch (e) {
      console.error("[payment-handler] Failed to send receipt:", e);
    }

    try {
      const complete = isLeadInfoComplete(lead);
      await sendLeadDetailsEmail({
        to: buyerEmail,
        leadTitle: lead.title,
        leadLocation,
        locationName: lead.location_name,
        address: lead.address,
        zip: lead.zip,
        contactPhone: lead.contact_phone,
        contactEmail: lead.contact_email,
        decisionMakerName: lead.decision_maker_name,
        description: lead.description,
        isComplete: complete,
      });
    } catch (e) {
      console.error("[payment-handler] Failed to send lead details:", e);
    }
  }
}

// ─── Agreement Payment (Location Placement) ───

export async function handleAgreementPaymentCompleted(params: {
  agreementTokenId: string;
  pipelineItemId?: string | null;
  stepId?: string | null;
  paymentId: string | null;
}) {
  const { agreementTokenId, pipelineItemId, stepId, paymentId } = params;

  await supabaseAdmin
    .from("agreement_tokens")
    .update({
      status: "paid",
      stripe_payment_intent_id: paymentId,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreementTokenId);

  if (pipelineItemId && stepId) {
    await supabaseAdmin
      .from("pipeline_payments")
      .update({
        status: "completed",
        stripe_payment_intent_id: paymentId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("pipeline_item_id", pipelineItemId)
      .eq("step_id", stepId)
      .in("status", ["pending", "created"]);

    await supabaseAdmin
      .from("pipeline_items")
      .update({ proposal_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", pipelineItemId);

    // Auto-create commission
    try {
      const { data: pipelineItem } = await supabaseAdmin
        .from("pipeline_items")
        .select("deal_id, assigned_to, value")
        .eq("id", pipelineItemId)
        .single();

      const dealId = pipelineItem?.deal_id;
      let repId = pipelineItem?.assigned_to;
      let dealValue = Number(pipelineItem?.value) || 0;

      if (dealId) {
        const { data: deal } = await supabaseAdmin
          .from("sales_deals")
          .select("assigned_to, deal_services(price)")
          .eq("id", dealId)
          .single();
        if (deal?.assigned_to) repId = deal.assigned_to;
        if (deal?.deal_services?.length) {
          dealValue = deal.deal_services.reduce(
            (sum: number, s: { price: number }) => sum + Number(s.price), 0
          );
        }
      }

      if (!dealValue) {
        const { data: agr } = await supabaseAdmin
          .from("agreement_tokens")
          .select("pricing_price")
          .eq("id", agreementTokenId)
          .single();
        dealValue = Number(agr?.pricing_price) || 0;
      }

      if (repId && dealValue > 0) {
        const COMMISSION_RATE = 0.10;
        const existing = await supabaseAdmin
          .from("sales_commissions")
          .select("id")
          .eq("deal_id", dealId || pipelineItemId)
          .eq("user_id", repId)
          .maybeSingle();

        if (!existing.data) {
          await supabaseAdmin.from("sales_commissions").insert({
            deal_id: dealId || null,
            order_id: null,
            user_id: repId,
            commission_rate: COMMISSION_RATE,
            deal_value: dealValue,
            commission_amount: dealValue * COMMISSION_RATE,
            status: "pending",
            notes: `Auto-created from agreement payment (${agreementTokenId})`,
          });
          console.log(`[payment-handler] Created commission for rep ${repId}, value ${dealValue}`);
        }
      }
    } catch (commErr) {
      console.error("[payment-handler] Failed to create commission:", commErr);
    }
  }

  // Fetch agreement + location for full site details
  const { data: agreement } = await supabaseAdmin
    .from("agreement_tokens")
    .select("*, sales_accounts(business_name, contact_name)")
    .eq("id", agreementTokenId)
    .single();

  if (!agreement) return;

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", agreement.location_id)
    .single();

  if (!location) return;

  let locationAgreement: {
    signature_name: string | null;
    signed_at: string | null;
    business_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    title_role: string | null;
    status: string;
  } | null = null;

  if (location.sales_lead_id) {
    const { data: la } = await supabaseAdmin
      .from("location_agreements")
      .select("signature_name, signed_at, business_name, contact_name, email, phone, address, title_role, status")
      .eq("lead_id", location.sales_lead_id)
      .eq("status", "signed")
      .maybeSingle();
    locationAgreement = la;
  }

  await supabaseAdmin
    .from("locations")
    .update({ is_revealed: true, revealed_at: new Date().toISOString() })
    .eq("id", location.id);

  try {
    const pricing: PricingResult = {
      total_score: agreement.pricing_score,
      traffic_score: 0,
      hours_score: 0,
      machine_score: 0,
      tier: agreement.pricing_tier as 1 | 2 | 3 | 4 | 5,
      tier_label: `Tier ${agreement.pricing_tier}`,
      price: Number(agreement.pricing_price),
    };

    const pdfBytes = await generateSiteDetailsPdf({
      businessName: agreement.sales_accounts?.business_name || agreement.recipient_name || "",
      contactName: agreement.recipient_name || "",
      locationName: location.location_name || "",
      address: location.address || "",
      phone: location.phone || "",
      decisionMakerName: location.decision_maker_name || "",
      decisionMakerEmail: location.decision_maker_email || "",
      industry: location.industry || "",
      zip: location.zip || "",
      employeeCount: location.employee_count || 0,
      trafficCount: location.traffic_count || 0,
      machineType: location.machine_type || "",
      machinesRequested: location.machines_requested || 1,
      businessHours: location.business_hours || "",
      pricing,
      generatedAt: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      locationAgreement: locationAgreement ? {
        signatureName: locationAgreement.signature_name || "",
        signedAt: locationAgreement.signed_at || "",
        contactName: locationAgreement.contact_name || "",
        titleRole: locationAgreement.title_role || "",
        email: locationAgreement.email || "",
        phone: locationAgreement.phone || "",
      } : undefined,
    });

    const pdfPath = `agreements/${agreement.id}-full-details.pdf`;
    await supabaseAdmin.storage
      .from("sales-documents")
      .upload(pdfPath, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });

    const { data: urlData } = supabaseAdmin.storage.from("sales-documents").getPublicUrl(pdfPath);

    await supabaseAdmin
      .from("agreement_tokens")
      .update({
        full_details_sent_at: new Date().toISOString(),
        full_details_pdf_url: urlData.publicUrl,
      })
      .eq("id", agreementTokenId);

    await sendFullSiteDetailsEmail({
      to: agreement.recipient_email,
      recipientName: agreement.recipient_name || "",
      businessName: agreement.sales_accounts?.business_name || "",
      locationName: location.location_name || "Location",
      pdfBuffer: pdfBytes,
      locationAgreement: locationAgreement ? {
        signatureName: locationAgreement.signature_name || "",
        signedAt: locationAgreement.signed_at || "",
        contactName: locationAgreement.contact_name || "",
        email: locationAgreement.email || "",
        phone: locationAgreement.phone || "",
      } : undefined,
    });

    if (locationAgreement?.email) {
      try {
        await sendLocationDealClosedEmail({
          to: locationAgreement.email,
          recipientName: locationAgreement.contact_name || "Business Owner",
          businessName: locationAgreement.business_name || location.location_name || "",
          locationName: location.location_name || "your location",
        });
      } catch (locErr) {
        console.error("[payment-handler] Failed to send location deal-closed email:", locErr);
      }
    } else if (location.decision_maker_email) {
      try {
        await sendLocationDealClosedEmail({
          to: location.decision_maker_email,
          recipientName: location.decision_maker_name || "Business Owner",
          businessName: location.location_name || "",
          locationName: location.location_name || "your location",
        });
      } catch (locErr) {
        console.error("[payment-handler] Failed to send location deal-closed email:", locErr);
      }
    }
  } catch (e) {
    console.error("[payment-handler] Failed to send full site details:", e);
  }
}

// ─── Machine Purchase ───

export async function handleMachinePurchaseCompleted(params: {
  purchaseId: string;
  listingId?: string | null;
  paymentId: string | null;
}) {
  const { purchaseId, listingId, paymentId } = params;

  const { data: purchase } = await supabaseAdmin
    .from("machine_listing_purchases")
    .update({
      status: "completed",
      stripe_payment_intent_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchaseId)
    .select("*")
    .single();

  if (!purchase) return;

  const { data: listing } = await supabaseAdmin
    .from("machine_listings")
    .select("id, title, machine_type, machine_make, machine_model, buy_now_price, asking_price")
    .eq("id", listingId)
    .single();

  const machineTitle = listing?.title || "Vending Machine";

  // Auto-create CRM records
  try {
    const purchaseBizName = purchase.business_name || purchase.full_name;
    const { data: existingLead } = await supabaseAdmin
      .from("sales_leads")
      .select("id, account_id")
      .eq("business_name", purchaseBizName)
      .limit(1)
      .maybeSingle();

    if (existingLead) {
      await supabaseAdmin
        .from("machine_listing_purchases")
        .update({
          crm_account_id: existingLead.account_id,
          crm_lead_id: existingLead.id,
        })
        .eq("id", purchaseId);
    } else {
      const { data: account } = await supabaseAdmin
        .from("sales_accounts")
        .insert({
          business_name: purchaseBizName,
          contact_name: purchase.full_name,
          phone: purchase.phone,
          email: purchase.email,
          address: purchase.location_address || null,
          entity_type: "operator",
        })
        .select("id")
        .single();

      if (account) {
        const { data: lead } = await supabaseAdmin
          .from("sales_leads")
          .insert({
            business_name: purchaseBizName,
            contact_name: purchase.full_name,
            phone: purchase.phone,
            email: purchase.email,
            address: purchase.location_address || null,
            city: purchase.location_city || null,
            state: purchase.location_state || null,
            entity_type: "operator",
            source: "machine_purchase",
            status: "qualified",
            account_id: account.id,
            notes: `Machine purchase: ${machineTitle} — $${(purchase.amount_cents / 100).toFixed(2)}\nBuyer type: ${purchase.buyer_type || "N/A"}\nLocation status: ${purchase.location_status || "N/A"}\nDeployment: ${purchase.deployment_timeline || "N/A"}\nShipping: ${purchase.shipping_intent || "N/A"}`,
          })
          .select("id")
          .single();

        await supabaseAdmin
          .from("machine_listing_purchases")
          .update({
            crm_account_id: account.id,
            crm_lead_id: lead?.id || null,
          })
          .eq("id", purchaseId);
      }
    }
  } catch (e) {
    console.error("[payment-handler] Failed to create CRM records:", e);
  }

  try {
    await sendMachinePurchaseThankYouEmail({
      to: purchase.email,
      buyerName: purchase.full_name,
      machineTitle,
      amountCents: purchase.amount_cents,
      purchaseId: purchase.id,
      stripePaymentIntentId: paymentId,
    });
  } catch (e) {
    console.error("[payment-handler] Failed to send thank-you email:", e);
  }

  try {
    const notifyEmail = process.env.MACHINE_PURCHASE_NOTIFY_EMAIL || "james@apexaivending.com";
    await sendMachinePurchaseNotificationEmail({
      to: notifyEmail,
      purchase,
      machineTitle,
      listing,
    });
  } catch (e) {
    console.error("[payment-handler] Failed to send notification:", e);
  }
}

// ─── Coffee Order ───

export async function handleCoffeeOrderCompleted(params: {
  orderId: string;
  userId?: string | null;
  paymentId: string | null;
  buyerEmail?: string | null;
}) {
  const { orderId, userId, paymentId, buyerEmail } = params;

  const { data: order, error: updateErr } = await supabaseAdmin
    .from("coffee_orders")
    .update({
      status: "pending",
      stripe_payment_intent_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("*, coffee_order_items(*)")
    .single();

  if (updateErr || !order) {
    console.error("[payment-handler] Failed to update coffee order:", updateErr);
    return;
  }

  if (userId) {
    await supabaseAdmin
      .from("coffee_cart_items")
      .delete()
      .eq("user_id", userId);
  }

  try {
    const { sendCoffeeOrderNotification, sendCoffeeOrderConfirmation } = await import("@/lib/coffeeEmail");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", order.operator_id)
      .single();

    const emailParams = {
      orderNumber: order.order_number,
      operatorName: profile?.full_name || "Operator",
      operatorEmail: profile?.email || buyerEmail || "",
      items: (order.coffee_order_items || []).map((i: Record<string, unknown>) => ({
        product_name: i.product_name as string,
        product_sku: i.product_sku as string,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
      subtotal: Number(order.subtotal),
      shippingEstimate: Number(order.shipping_estimate),
      total: Number(order.total),
      shippingName: order.shipping_name,
      shippingAddress: order.shipping_address,
      shippingCity: order.shipping_city,
      shippingState: order.shipping_state,
      shippingZip: order.shipping_zip,
    };

    await Promise.all([
      sendCoffeeOrderNotification(emailParams),
      sendCoffeeOrderConfirmation(emailParams),
    ]);
  } catch (e) {
    console.error("[payment-handler] Failed to send coffee order emails:", e);
  }
}

// ─── Marketplace Purchase ───

export async function handleMarketplacePurchaseCompleted(params: {
  sessionId: string;
  listingId: string;
  buyerId?: string | null;
  sellerId?: string | null;
  paymentId: string | null;
  buyerEmail?: string | null;
}) {
  const { sessionId, listingId, sellerId, paymentId, buyerEmail } = params;

  const { data: purchase } = await supabaseAdmin
    .from("user_listing_purchases")
    .update({
      status: "completed",
      stripe_payment_intent_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .or(`stripe_checkout_session_id.eq.${sessionId},qb_invoice_id.eq.${sessionId}`)
    .select("id, amount_cents, platform_fee_cents, seller_payout_cents")
    .single();

  await supabaseAdmin
    .from("user_listings")
    .update({ status: "sold", is_public: false, updated_at: new Date().toISOString() })
    .eq("id", listingId);

  const { data: listing } = await supabaseAdmin
    .from("user_listings")
    .select("title, listing_type, city, state, price")
    .eq("id", listingId)
    .single();

  const { data: sellerUser } = sellerId
    ? await supabaseAdmin.auth.admin.getUserById(sellerId)
    : { data: null };

  // Fetch seller payout info for admin notification
  let sellerProfile: {
    full_name: string | null;
    payout_method: string | null;
    payout_email: string | null;
    payout_bank_name: string | null;
    payout_routing_number: string | null;
    payout_account_number: string | null;
    payout_notes: string | null;
  } | null = null;

  if (sellerId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("full_name, payout_method, payout_email, payout_bank_name, payout_routing_number, payout_account_number, payout_notes")
      .eq("id", sellerId)
      .single();
    sellerProfile = data;
  }

  if (sellerUser?.user?.email && listing) {
    try {
      const { sendMarketplaceSaleEmail } = await import("@/lib/marketplaceEmail");
      await sendMarketplaceSaleEmail({
        to: sellerUser.user.email,
        listingTitle: listing.title,
        amount: Number(listing.price),
        buyerEmail: buyerEmail || "a buyer",
      });
    } catch (e) {
      console.error("[payment-handler] Failed to send marketplace sale email:", e);
    }
  }

  if (buyerEmail && listing) {
    try {
      const { sendMarketplacePurchaseEmail } = await import("@/lib/marketplaceEmail");
      await sendMarketplacePurchaseEmail({
        to: buyerEmail,
        listingTitle: listing.title,
        amount: Number(listing.price),
        listingType: listing.listing_type,
        location: `${listing.city || ""}, ${listing.state}`.trim(),
      });
    } catch (e) {
      console.error("[payment-handler] Failed to send marketplace purchase email:", e);
    }
  }

  // Send admin payout notification
  if (listing && purchase) {
    try {
      const { sendMarketplacePayoutNotification } = await import("@/lib/marketplaceEmail");
      const saleAmount = Number(listing.price);
      await sendMarketplacePayoutNotification({
        listingTitle: listing.title,
        saleAmount,
        platformFee: saleAmount * 0.15,
        sellerPayout: saleAmount * 0.85,
        sellerName: sellerProfile?.full_name || "Unknown Seller",
        sellerEmail: sellerUser?.user?.email || "",
        buyerEmail: buyerEmail || "",
        payoutMethod: sellerProfile?.payout_method || null,
        payoutEmail: sellerProfile?.payout_email || null,
        payoutBankName: sellerProfile?.payout_bank_name || null,
        payoutRoutingNumber: sellerProfile?.payout_routing_number || null,
        payoutAccountNumber: sellerProfile?.payout_account_number || null,
        payoutNotes: sellerProfile?.payout_notes || null,
        purchaseId: purchase.id,
      });
    } catch (e) {
      console.error("[payment-handler] Failed to send admin payout notification:", e);
    }
  }
}

// ─── Session Expired / Cancelled ───

export async function handlePaymentExpired(sessionId: string) {
  const now = new Date().toISOString();

  await Promise.all([
    supabaseAdmin
      .from("lead_purchases")
      .update({ status: "failed", updated_at: now })
      .or(`stripe_checkout_session_id.eq.${sessionId},qb_invoice_id.eq.${sessionId}`),
    supabaseAdmin
      .from("machine_listing_purchases")
      .update({ status: "failed", updated_at: now })
      .or(`stripe_checkout_session_id.eq.${sessionId},qb_invoice_id.eq.${sessionId}`),
    supabaseAdmin
      .from("user_listing_purchases")
      .update({ status: "failed", updated_at: now })
      .or(`stripe_checkout_session_id.eq.${sessionId},qb_invoice_id.eq.${sessionId}`),
    supabaseAdmin
      .from("coffee_orders")
      .update({ status: "cancelled", updated_at: now })
      .or(`stripe_checkout_session_id.eq.${sessionId},qb_invoice_id.eq.${sessionId}`)
      .eq("status", "awaiting_payment"),
  ]);
}
