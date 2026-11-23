/**
 * checkin/checkinReceipts.js — prints the customer + staff copies after a
 * successful self check-in, reusing the existing PrintQueue/mqtt-bridge
 * pipeline (see wix/src/backend/studioUpsell/printDispatch.js). Fire-and-
 * forget by design: a printer problem must never fail the check-in itself —
 * the order is already marked checked-in before this runs, and the hourly
 * retryPendingPrintJobs() job is the safety net for anything that doesn't
 * get through right away (see printDispatch.js's skip rule for stale
 * check-in rows — staff should use reprintCheckinReceipts manually instead
 * of a surprise late auto-print).
 *
 * PrintQueue rows from this module: addOnOrderId stays null; workshopOrderId
 * + kind ('checkin_customer' | 'checkin_staff') identify them instead — see
 * wix/src/backend/checkin/README.md for the required CMS fields.
 */
import wixData from 'wix-data';
import { dispatchPrintJob } from 'backend/studioUpsell/printDispatch.js';

const SA = { suppressAuth: true };

const CHECKIN_PRINT_KINDS = ['checkin_customer', 'checkin_staff'];

function buildCustomerPayload(dto) {
    return {
        orderNumber: dto.orderNumber,
        buyerName: dto.organizerName,
        items: dto.items,
        total: dto.total,
        amountPaid: dto.total,
        paidAt: new Date().toISOString(),
        workshopTitle: dto.workshopTypeLabel,
        title: 'אישור הגעה',
        infoLines: [
            { label: 'סדנה', value: `${dto.workshopTypeLabel} - ${dto.timeLabel}` },
        ],
        noteLines: ['נא לשמור קבלה זו'],
    };
}

function buildStaffPayload(dto) {
    const infoLines = [
        { label: 'סדנה', value: `${dto.workshopTypeLabel} - ${dto.timeLabel}` },
        { label: 'מבוגרים', value: String(dto.adults || 0) },
    ];
    if (dto.children) infoLines.push({ label: 'ילדים', value: String(dto.children) });
    if (dto.rugCount) infoLines.push({ label: 'שטיחים', value: String(dto.rugCount) });
    if (dto.extraCandleCount) infoLines.push({ label: 'נרות נוספים', value: String(dto.extraCandleCount) });

    return {
        orderNumber: dto.orderNumber,
        buyerName: dto.organizerName,
        items: dto.items,
        total: dto.total,
        amountPaid: dto.total,
        paidAt: new Date().toISOString(),
        workshopTitle: dto.workshopTypeLabel,
        title: 'עותק צוות - צ\'ק-אין',
        infoLines,
        // Staff copy is about what to prep/hand over, not the payment — no prices needed.
        hidePrices: true,
    };
}

async function insertAndDispatch(workshopOrderId, kind, payload) {
    const row = await wixData.insert('PrintQueue', {
        addOnOrderId: null,
        workshopOrderId,
        kind,
        status: 'pending',
        payload,
        attempts: 0,
        lastAttemptAt: null,
        printedAt: null,
        errorMessage: null,
    }, SA).catch((err) => {
        console.error('[checkin/checkinReceipts] insert failed:', kind, err?.message || err);
        return null;
    });
    if (!row) return null;

    dispatchPrintJob(row).catch((err) => {
        console.error('[checkin/checkinReceipts] immediate dispatch failed (will retry via hourly job):', kind, err?.message || err);
    });
    return row;
}

/** Fire-and-forget — never throws. Call without awaiting if the caller can't afford the round trip. */
export async function printCheckinReceipts(order, dto) {
    try {
        await Promise.all([
            insertAndDispatch(order._id, 'checkin_customer', buildCustomerPayload(dto)),
            insertAndDispatch(order._id, 'checkin_staff', buildStaffPayload(dto)),
        ]);
        return { ok: true };
    } catch (err) {
        console.error('[checkin/checkinReceipts] printCheckinReceipts failed:', err?.message || err);
        return { ok: false };
    }
}

/** Manual re-print from the order dashboard (Permissions.SiteMember-gated webMethod calls this) — always a fresh ticket id so HSPOS doesn't dedupe against an old failed attempt. */
export async function reprintCheckinReceipts(workshopOrderId) {
    if (!workshopOrderId) return { reprinted: 0 };

    const existing = await wixData.query('PrintQueue')
        .eq('workshopOrderId', workshopOrderId)
        .hasSome('kind', CHECKIN_PRINT_KINDS)
        .find(SA);

    const results = await Promise.all(
        (existing.items || []).map((row) => dispatchPrintJob(row, { forceNewTicket: true }))
    );
    return { reprinted: results.length };
}
