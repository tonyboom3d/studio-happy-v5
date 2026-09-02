/**
 * studioUpsell/printQueue.js — writes a PrintQueue CMS row once an in-person
 * add-on order is paid, then immediately hands it to printDispatch.js to send
 * to the mqtt-bridge Cloudflare Worker. The dispatch call is best-effort here
 * (non-fatal on failure) — jobs.js's hourly retryPendingPrintJobs is the
 * safety net for anything that doesn't get through right away.
 *
 * PrintQueue fields: addOnOrderId, status (pending/printing/printed/failed),
 * payload (object snapshot for the receipt — see buildReceiptPayload below),
 * attempts, lastAttemptAt, printedAt, errorMessage.
 */
import wixData from 'wix-data';
import { dispatchPrintJob } from './printDispatch.js';

const SA = { suppressAuth: true };

// Must match the Thank You page's own URL/query-param format — see
// pages/דף תודה מערכת תשלומים עצמאית.n8pwn.js (reads wixLocation.query.t).
const THANK_YOU_PAGE_URL = 'https://www.studiohappy.art/דף-תודה-מערכת-תשלומים-עצמאית';

/** Whether a receipt ("בון") was ever queued for this order — for the Thank You page / admin display. */
export async function hasPrintJob(addOnOrderId) {
    if (!addOnOrderId) return false;
    const result = await wixData.query('PrintQueue').eq('addOnOrderId', addOnOrderId).limit(1).find(SA);
    return (result.items?.length || 0) > 0;
}

/** Builds the receipt payload snapshot stored on the PrintQueue row — shape matches the Worker's /print-receipt body (see printDispatch.js buildReceiptBody). */
function buildReceiptPayload(addOnOrder) {
    const buyerName = addOnOrder.customerName || '';
    // checkoutName = who actually paid at the Wix checkout (extractBuyerContact in reconcile.js) —
    // only surfaced separately on the receipt when it differs from the order's name.
    const payerName = addOnOrder.checkoutName && addOnOrder.checkoutName !== buyerName ? addOnOrder.checkoutName : '';

    return {
        orderNumber: addOnOrder.ecomOrderNumber || '',
        buyerName,
        payerName,
        customerPhone: addOnOrder.customerPhone || '',
        workshopTitle: addOnOrder.workshopTitle || '',
        items: (addOnOrder.items || []).map((i) => ({
            name: i.title || '',
            qty: Number(i.quantity) || 0,
            price: Number(i.price) || 0,
        })),
        openAmount: addOnOrder.openAmount || 0,
        total: addOnOrder.total || 0,
        amountPaid: addOnOrder.total || 0,
        // Wix's @wix/ecom Orders API doesn't reliably expose a payment method for
        // in-person/custom-line-item checkouts — left blank rather than guessing;
        // staff can set it manually from the admin print-tab detail modal.
        paymentMethod: null,
        staffApprovedByName: addOnOrder.staffApprovedByName || null,
        qrUrl: `${THANK_YOU_PAGE_URL}?t=${encodeURIComponent(addOnOrder.confirmationToken || '')}`,
        paidAt: addOnOrder.paidAt || new Date().toISOString(),
    };
}

export async function enqueuePrintJob(addOnOrder) {
    if (!addOnOrder?._id) return null;

    try {
        const existing = await wixData.query('PrintQueue').eq('addOnOrderId', addOnOrder._id).find(SA);
        if (existing.items?.length) return existing.items[0];

        const row = await wixData.insert('PrintQueue', {
            addOnOrderId: addOnOrder._id,
            status: 'pending',
            payload: buildReceiptPayload(addOnOrder),
            attempts: 0,
            lastAttemptAt: null,
            printedAt: null,
            errorMessage: null,
        }, SA);

        // Fast path — best-effort, non-fatal. The hourly retryPendingPrintJobs
        // scheduled job (jobs.js) is the safety net if this fails or the
        // request/worker/broker is unavailable right now.
        dispatchPrintJob(row).catch((err) => {
            console.error('[studioUpsell/printQueue] immediate dispatch failed (will retry via scheduled job):', err?.message || err);
        });

        return row;
    } catch (err) {
        console.error('[studioUpsell/printQueue] enqueuePrintJob failed:', err?.message || err);
        return null;
    }
}
