/**
 * studioUpsell/reconcile.js — marks a StudioAddOnOrders row paid once its
 * @wix/ecom checkout completes, and enqueues a print job — either right away,
 * or (when the workshop type has "showStaffCode" on) only once an employee
 * approves the order (see approveStaffOnAddOnOrder below).
 *
 * Mirrors orderReconciliation.js's pattern of a single idempotent writer
 * called from two independent triggers:
 *   1) events.js -> wixEcom_onOrderPaymentStatusUpdated (authoritative, backend-first)
 *   2) studioUpsellService.web.js -> confirmAddOnOrder (Thank You page, best-effort UI acceleration)
 */
import wixData from 'wix-data';
import { orders as ecomOrders } from '@wix/ecom';
import { auth } from '@wix/essentials';
import { extractBuyerContact } from 'backend/orderUtils.js';
import { enqueuePrintJob } from './printQueue.js';
import { getSettingsForWorkshopType } from './catalog.js';
import { applyInventoryForPaidOrder } from './inventory.js';

const SA = { suppressAuth: true };
const SA_CONSISTENT = { suppressAuth: true, consistentRead: true };
const elevatedGetEcomOrder = auth.elevate(ecomOrders.getOrder);

function isPaid(ecomOrder) {
    const status = ecomOrder?.paymentStatus;
    return status === 'PAID' || status === 'PARTIALLY_PAID';
}

export async function getAddOnOrderByCheckoutId(checkoutId) {
    if (!checkoutId) return null;
    const result = await wixData.query('StudioAddOnOrders').eq('checkoutId', checkoutId).find(SA_CONSISTENT);
    return result.items?.[0] || null;
}

export async function getAddOnOrderByEcomOrderId(ecomOrderId) {
    if (!ecomOrderId) return null;
    const result = await wixData.query('StudioAddOnOrders').eq('ecomOrderId', ecomOrderId).find(SA_CONSISTENT);
    return result.items?.[0] || null;
}

export async function getAddOnOrderByToken(token) {
    if (!token) return null;
    // consistentRead: true — the Thank You page reads this right after the eCom
    // webhook (or the best-effort accelerator below) just wrote 'paid', so a
    // stale/cached read here would show the customer an endless spinner.
    const result = await wixData.query('StudioAddOnOrders').eq('confirmationToken', token).find(SA_CONSISTENT);
    return result.items?.[0] || null;
}

/**
 * Idempotent writer: safe to call repeatedly / concurrently for the same order.
 * When the workshop type has "showStaffCode" on, the order is marked paid but
 * printing is DEFERRED until an employee approves it (see
 * approveStaffOnAddOnOrder) — either from the Thank You page (customer shows
 * the screen, employee types the code) or from the admin fallback.
 */
export async function confirmAddOnOrderFromEcom(addOnOrder, ecomOrder) {
    if (!addOnOrder) return null;
    if (addOnOrder.status === 'paid') return addOnOrder;
    if (!isPaid(ecomOrder)) return addOnOrder;

    const settings = addOnOrder.workshopTypeId ? await getSettingsForWorkshopType(addOnOrder.workshopTypeId) : null;
    const staffApprovalRequired = !!settings?.showStaffCode;

    // Who actually paid at the Wix checkout — may differ from customerName/Phone
    // (the name the order is placed under), e.g. staff-created orders.
    const buyer = extractBuyerContact(ecomOrder);

    const updated = await wixData.update('StudioAddOnOrders', {
        ...addOnOrder,
        status: 'paid',
        ecomOrderId: ecomOrder._id,
        ecomOrderNumber: ecomOrder.number || null,
        checkoutName: buyer.fullName || null,
        checkoutPhone: buyer.phone || null,
        checkoutEmail: buyer.email || null,
        staffApprovalRequired,
        staffApprovedAt: null,
        paidAt: new Date(),
    }, SA);

    if (!staffApprovalRequired && (!settings || settings.printOnPayment !== false)) {
        await enqueuePrintJob(updated);
    }

    await applyInventoryForPaidOrder(updated);

    return updated;
}

/**
 * Marks an order as staff-approved — triggered either from the Thank You page
 * (customer shows the screen, employee enters the code + picks their name) or
 * from the admin "approve manually" fallback for orders where the customer
 * never showed the screen. Idempotent: re-approving an already-approved order
 * is a no-op. Printing is deferred until this point specifically for
 * staffApprovalRequired orders, so the receipt only comes out once a human
 * has actually looked.
 *
 * @param {object} [meta] - { staffId, staffName } from the Thank You page picker
 */
export async function approveStaffOnAddOnOrder(addOnOrder, meta = {}) {
    if (!addOnOrder) return null;
    if (addOnOrder.staffApprovedAt) return addOnOrder;
    if (addOnOrder.status !== 'paid') return addOnOrder;

    const settings = addOnOrder.workshopTypeId ? await getSettingsForWorkshopType(addOnOrder.workshopTypeId) : null;

    const updated = await wixData.update('StudioAddOnOrders', {
        ...addOnOrder,
        staffApprovedAt: new Date(),
        staffApprovedById: meta.staffId || addOnOrder.staffApprovedById || null,
        staffApprovedByName: meta.staffName || addOnOrder.staffApprovedByName || null,
    }, SA);

    if (!settings || settings.printOnPayment !== false) {
        await enqueuePrintJob(updated);
    }

    return updated;
}

/**
 * Called from the events.js webhook for EVERY paid eCom order on the site —
 * no-ops (reason: 'no_match') for anything that isn't a studio add-on checkout.
 */
export async function reconcileAddOnEcomOrder(ecomOrder) {
    if (!ecomOrder?._id) return { reconciled: false, reason: 'no_ecom_order' };
    if (!isPaid(ecomOrder)) return { reconciled: false, reason: 'not_paid' };

    let addOnOrder = ecomOrder.checkoutId ? await getAddOnOrderByCheckoutId(ecomOrder.checkoutId) : null;
    if (!addOnOrder) addOnOrder = await getAddOnOrderByEcomOrderId(ecomOrder._id);
    if (!addOnOrder) return { reconciled: false, reason: 'no_match' };
    if (addOnOrder.status === 'paid') return { reconciled: false, reason: 'already_paid', addOnOrder };

    const updated = await confirmAddOnOrderFromEcom(addOnOrder, ecomOrder);
    return { reconciled: true, addOnOrder: updated };
}

/** Best-effort accelerator for the Thank You page — re-fetches the eCom order server-side rather than trusting client input. */
export async function confirmAddOnOrderByToken(token, ecomOrderIdHint) {
    const addOnOrder = await getAddOnOrderByToken(token);
    if (!addOnOrder) return null;
    if (addOnOrder.status === 'paid') return addOnOrder;

    const candidateEcomOrderId = addOnOrder.ecomOrderId || ecomOrderIdHint || null;
    if (!candidateEcomOrderId) return addOnOrder;

    let ecomOrder = null;
    try {
        ecomOrder = await elevatedGetEcomOrder(candidateEcomOrderId);
    } catch (err) {
        console.warn('[studioUpsell/reconcile] elevatedGetEcomOrder failed:', err?.message || err);
    }
    if (!ecomOrder) return addOnOrder;

    return confirmAddOnOrderFromEcom(addOnOrder, ecomOrder);
}
