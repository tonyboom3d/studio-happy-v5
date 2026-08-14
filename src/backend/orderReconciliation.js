/**
 * orderReconciliation.js — plain backend module (no .web.js suffix — not
 * directly callable from the frontend) that centralizes writing "paid" +
 * buyer + cup data onto WorkshopOrders records.
 *
 * This is the backend-first fix for the WorkshopOrders data-loss bug: it is
 * called from THREE independent triggers, so a customer's order survives a
 * refresh, a dropped connection, or a closed tab right after payment:
 *
 *   1) events.js -> wixEcom_onOrderPaymentStatusUpdated
 *      Authoritative + immediate: fires server-side the instant Wix confirms
 *      payment, completely independent of the customer's browser.
 *   2) jobs.js -> reconcileStuckWorkshopOrders (scheduled sweep)
 *      Safety net: catches anything the event above missed (e.g. a
 *      transient failure) by periodically re-checking orders stuck in
 *      'pending_payment' / 'checkout_created'.
 *   3) bookingService.web.js -> confirmOrderPayment / resolveWorkshopOrderFromEcom
 *      Best-effort UI acceleration only (Thank You page) — no longer the
 *      only place this data gets written.
 *
 * All three call the same idempotent linkWorkshopOrderToEcom() writer, so
 * whichever trigger runs first "wins" and the others become no-ops on their
 * next check (status/ecomOrderId already match).
 */
import wixData from 'wix-data';
import { auth } from '@wix/essentials';
import { orders as ecomOrders } from '@wix/ecom';
import { getItemWithRetry } from 'backend/wixDataRetry.js';
import {
    orderContainsBookingId,
    extractBookingIdsFromEcomOrder,
    extractOrganizerNotesFromEcomOrder,
    extractBuyerContact,
    getPhoneLookupVariants,
    isEcomOrderPaid,
} from 'backend/orderUtils.js';

const SA = { suppressAuth: true };
const SA_CONSISTENT = { suppressAuth: true, consistentRead: true };

const elevatedGetEcomOrder = auth.elevate(ecomOrders.getOrder);
const elevatedSearchOrders = auth.elevate(ecomOrders.searchOrders);

export { isEcomOrderPaid };

/**
 * Fetches a WorkshopOrder by id via getItemWithRetry (see wixDataRetry.js):
 * normalizes missing items to null, tags failures with the calling flow so
 * they're traceable in the logs, and retries once after 4s with
 * consistentRead:true before giving up.
 */
export async function getWorkshopOrderSafe(orderId, callerLabel = 'orderReconciliation') {
    return getItemWithRetry('WorkshopOrders', orderId, { callerLabel });
}

export async function getOrderByToken(token) {
    if (!token) throw new Error('Token is required');
    const result = await wixData.query('WorkshopOrders')
        .eq('orderToken', token)
        .find(SA);
    return result.items[0] || null;
}

export async function getOrderByCheckoutId(checkoutId) {
    if (!checkoutId) return null;
    const result = await wixData.query('WorkshopOrders')
        .eq('checkoutId', checkoutId)
        .find(SA_CONSISTENT);
    return result.items[0] || null;
}

export async function getOrderByEcomOrderId(ecomOrderId) {
    if (!ecomOrderId) return null;
    const result = await wixData.query('WorkshopOrders')
        .eq('ecomOrderId', ecomOrderId)
        .find(SA_CONSISTENT);
    return result.items[0] || null;
}

export async function getWorkshopOrderByBookingId(bookingId) {
    if (!bookingId) return null;

    try {
        const byArray = await wixData.query('WorkshopOrders')
            .hasSome('bookingIds', [bookingId])
            .descending('_createdDate')
            .limit(1)
            .find(SA_CONSISTENT);
        if (byArray.items.length > 0) return byArray.items[0];
    } catch (err) {
        console.warn('[orderReconciliation] getWorkshopOrderByBookingId hasSome query failed, falling back:', err?.message);
    }

    const recent = await wixData.query('WorkshopOrders')
        .descending('_createdDate')
        .limit(100)
        .find(SA_CONSISTENT);
    return recent.items.find((item) => orderContainsBookingId(item, bookingId)) || null;
}

// Last-resort match for the race condition where checkoutId/ecomOrderId
// hasn't been written to the WorkshopOrder yet by the time reconciliation
// runs. MUST be restricted to orders not yet linked to ANY ecom order
// (isEmpty('ecomOrderId')) — otherwise a returning buyer who checks out for
// something unrelated gets wrongly matched to their OLD already-paid
// workshop order by phone/email alone.
export async function getWorkshopOrderByBuyerInfo(phone, email) {
    if (!phone && !email) return null;

    if (phone) {
        for (const variant of getPhoneLookupVariants(phone)) {
            const byPhone = await wixData.query('WorkshopOrders')
                .eq('organizerPhone', variant)
                .isEmpty('ecomOrderId')
                .descending('_createdDate')
                .limit(1)
                .find(SA_CONSISTENT);
            if (byPhone.items.length > 0) return byPhone.items[0];
        }
    }

    if (email) {
        const byEmail = await wixData.query('WorkshopOrders')
            .eq('organizerEmail', email)
            .isEmpty('ecomOrderId')
            .descending('_createdDate')
            .limit(1)
            .find(SA_CONSISTENT);
        if (byEmail.items.length > 0) return byEmail.items[0];
    }

    return null;
}

/**
 * The eCom order object sometimes has empty customFields due to a
 * timing/consistency gap right after checkout. Re-fetch via the elevated
 * eCom Orders API (authoritative) when that happens.
 */
export async function ensureCustomFields(ecomOrderInput) {
    if (!ecomOrderInput?._id) return ecomOrderInput;
    if (Array.isArray(ecomOrderInput.customFields) && ecomOrderInput.customFields.length > 0) return ecomOrderInput;
    try {
        const fullOrder = await elevatedGetEcomOrder(ecomOrderInput._id);
        if (Array.isArray(fullOrder?.customFields) && fullOrder.customFields.length > 0) {
            return { ...ecomOrderInput, customFields: fullOrder.customFields };
        }
    } catch (err) {
        console.warn('[orderReconciliation] ensureCustomFields elevated getOrder fallback failed:', err?.message || err);
    }
    return ecomOrderInput;
}

/**
 * Always fetches the full, authoritative order server-side by id — used
 * instead of trusting a client-supplied order object's field values.
 */
export async function fetchFullEcomOrder(ecomOrderId) {
    if (!ecomOrderId) return null;
    try {
        return await elevatedGetEcomOrder(ecomOrderId);
    } catch (err) {
        console.warn('[orderReconciliation] fetchFullEcomOrder failed:', ecomOrderId, err?.message || err);
        return null;
    }
}

/** Finds the eCom order tied to a checkoutId — used by the sweep job, which only has the checkoutId to go on. */
export async function fetchEcomOrderByCheckoutId(checkoutId) {
    if (!checkoutId) return null;
    try {
        const result = await elevatedSearchOrders({ search: { filter: { checkoutId: { $eq: checkoutId } } } });
        return result?.orders?.[0] || null;
    } catch (err) {
        console.warn('[orderReconciliation] fetchEcomOrderByCheckoutId failed:', checkoutId, err?.message || err);
        return null;
    }
}

/**
 * Reconstructs selectedProducts (cups) from the eCom order's custom line
 * items when the CMS row is missing them. The productId is preserved via
 * customLineItems[].physicalProperties.sku on legacy orders (pre-2026-08-14).
 * New checkouts store cups on WorkshopOrders.selectedProducts before payment;
 * sku is no longer sent to checkout (it was shown to customers as מק"ט).
 */
export function backfillCupsFromEcomOrder(ecomOrder) {
    const items = (ecomOrder?.lineItems || []).filter((li) => li?.physicalProperties?.sku && !li.catalogReference);
    if (items.length === 0) return null;
    return items.map((li) => ({
        productId: li.physicalProperties.sku,
        quantity: li.quantity || 1,
        price: li.price?.amount != null ? parseFloat(li.price.amount) : (Number(li.price) || 0),
        image: li.image || null,
        imageUrl: null,
    }));
}

/**
 * Idempotent writer — safe to call concurrently from the eCom event, the
 * sweep job, and the Thank You page. Copies buyer info / paid totals /
 * coupon / cups onto the WorkshopOrder, but only fills organizer fields
 * that are still empty (never overwrites data that's already there).
 */
export async function linkWorkshopOrderToEcom(workshopOrder, ecomOrderInput) {
    const ecomOrder = await ensureCustomFields(ecomOrderInput);
    const buyer = extractBuyerContact(ecomOrder);

    // Support both Thank You page format (totals) and orders API format (priceSummary)
    const totals = ecomOrder?.totals || ecomOrder?.priceSummary || {};
    const totalAmount = totals.total?.amount ? parseFloat(totals.total.amount) : (totals.total || 0);
    const discountAmount = totals.discount?.amount ? parseFloat(totals.discount.amount) : (totals.discount || 0);

    // Support both formats for coupon
    const coupon = ecomOrder?.discount?.appliedCoupon ||
        ecomOrder?.appliedDiscounts?.find(d => d.coupon)?.coupon || null;

    const updates = {
        ...workshopOrder,
        ecomOrderId: ecomOrder._id,
        ecomOrderNumber: ecomOrder.number || null,
        status: 'paid',
        paidTotal: totalAmount || workshopOrder.basePrice || 0,
        paidDiscount: discountAmount,
        couponCode: coupon?.code || null,
        couponName: coupon?.name || null,
    };
    if (!workshopOrder.organizerPhone && buyer.phone) updates.organizerPhone = buyer.phone;
    if (!workshopOrder.organizerEmail && buyer.email) updates.organizerEmail = buyer.email;
    if (!workshopOrder.organizerName && buyer.fullName) updates.organizerName = buyer.fullName;

    const customerNotes = extractOrganizerNotesFromEcomOrder(ecomOrder);
    if (customerNotes && !workshopOrder.customerNotes) updates.customerNotes = customerNotes;

    if (workshopOrder.workshopType === 'candles' && !(workshopOrder.selectedProducts?.length > 0)) {
        const backfilled = backfillCupsFromEcomOrder(ecomOrder);
        if (backfilled) {
            updates.selectedProducts = backfilled;
            console.log(`[orderReconciliation] backfilled ${backfilled.length} cup(s) from eCom order for WorkshopOrder ${workshopOrder._id}`);
        }
    }

    return wixData.update('WorkshopOrders', updates, SA);
}

/**
 * Matching cascade: ecomOrderId -> checkoutId -> bookingId -> buyer info.
 * NOTE: the checkoutId match uses ecomOrder.checkoutId (the eCom Order's
 * OWN checkoutId field) — matching against ecomOrder._id here was a latent
 * bug that made this fallback path effectively dead code.
 */
export async function resolveWorkshopOrder(ecomOrder) {
    if (!ecomOrder?._id) return { workshopOrder: null, matchedBy: null, bookingIds: [] };

    const buyer = extractBuyerContact(ecomOrder);
    let workshopOrder = await getOrderByEcomOrderId(ecomOrder._id);
    let matchedBy = workshopOrder ? 'ecomOrderId' : null;

    if (!workshopOrder && ecomOrder.checkoutId) {
        workshopOrder = await getOrderByCheckoutId(ecomOrder.checkoutId);
        if (workshopOrder) matchedBy = 'checkoutId';
    }

    const bookingIds = extractBookingIdsFromEcomOrder(ecomOrder);
    if (!workshopOrder) {
        for (const bookingId of bookingIds) {
            workshopOrder = await getWorkshopOrderByBookingId(bookingId);
            if (workshopOrder) {
                matchedBy = 'bookingId';
                break;
            }
        }
    }

    if (!workshopOrder && (buyer.phone || buyer.email)) {
        workshopOrder = await getWorkshopOrderByBuyerInfo(buyer.phone, buyer.email);
        if (workshopOrder) matchedBy = 'buyerInfo';
    }

    return { workshopOrder, matchedBy, bookingIds };
}

/**
 * Top-level entry point used by all three triggers (eCom event, sweep job,
 * Thank You page). Resolves the matching WorkshopOrder and — if paid and
 * out of date — writes buyer/cup/paid data via linkWorkshopOrderToEcom.
 * Safe/idempotent to call repeatedly for the same order.
 */
export async function reconcileEcomOrder(ecomOrderInput, { requirePaid = true } = {}) {
    if (!ecomOrderInput?._id) {
        return { workshopOrder: null, matchedBy: null, reconciled: false, reason: 'no_ecom_order' };
    }

    if (requirePaid && !isEcomOrderPaid(ecomOrderInput)) {
        return { workshopOrder: null, matchedBy: null, reconciled: false, reason: 'not_paid' };
    }

    const { workshopOrder, matchedBy, bookingIds } = await resolveWorkshopOrder(ecomOrderInput);
    if (!workshopOrder) {
        return { workshopOrder: null, matchedBy: null, reconciled: false, bookingIds, reason: 'no_match' };
    }

    const missingNotes = !workshopOrder.customerNotes && !!extractOrganizerNotesFromEcomOrder(ecomOrderInput);
    // Cups only apply to the candles workshop — gating on workshopType avoids
    // treating a tufting order's (correctly empty) selectedProducts as
    // perpetually "missing" and re-writing it on every reconciliation pass.
    const missingCups = workshopOrder.workshopType === 'candles' && !(workshopOrder.selectedProducts?.length > 0);
    const needsLink = workshopOrder.status !== 'paid' ||
        workshopOrder.ecomOrderId !== ecomOrderInput._id ||
        missingNotes ||
        missingCups;

    if (needsLink) {
        const updated = await linkWorkshopOrderToEcom(workshopOrder, ecomOrderInput);
        return { workshopOrder: updated, matchedBy, bookingIds, reconciled: true };
    }

    return { workshopOrder, matchedBy, bookingIds, reconciled: false, reason: 'already_up_to_date' };
}
