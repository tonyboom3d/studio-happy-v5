/**
 * checkin/checkinOrder.js — resolves a verified phone to the one WorkshopOrders
 * row self check-in currently applies to (today, within the configured
 * pre-workshop window), marks it checked-in, and builds the Hebrew order DTO
 * used by both the success screen and the printed receipts.
 *
 * Scope: tufting / candles / ceramics only (WorkshopOrders) — same scope as
 * studioUpsell/identify.js's findTodayWorkshopsByPhone, which this reuses for
 * the phone→today's-orders matching (organizer + participant phones).
 */
import wixData from 'wix-data';
import { findTodayWorkshopsByPhone } from 'backend/studioUpsell/identify.js';

const SA = { suppressAuth: true };
const ISRAEL_TZ = 'Asia/Jerusalem';
const DEFAULT_WORKSHOP_DURATION_MS = 3 * 60 * 60 * 1000; // fallback when workshopEnd is missing

const WORKSHOP_TYPE_LABELS = {
    tufting: 'שטיחים',
    candles: 'נרות',
    ceramics: 'קרמיקה',
};

function formatTimeIL(dateInput) {
    if (!dateInput) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dateInput));
}

function formatDateIL(dateInput) {
    if (!dateInput) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: ISRAEL_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateInput));
}

async function loadTodayCandidateOrders(phone) {
    const matches = await findTodayWorkshopsByPhone(phone);
    const withOrders = await Promise.all(
        matches
            .filter((m) => !!m.workshopOrderId)
            .map((m) => wixData.get('WorkshopOrders', m.workshopOrderId, SA).catch(() => null))
    );
    return withOrders.filter(Boolean);
}

/**
 * Among today's paid orders for this phone, picks the one whose workshop
 * falls inside [workshopStart - windowBeforeMin, workshopEnd] right now.
 * Ties (more than one order in-window) are broken by closest start to now.
 * Returns a reason when nothing matches, so the caller can show a precise
 * Hebrew message (too early / too late / no order at all today).
 */
export async function findCheckinEligibleOrder(phone, windowBeforeMin, now = new Date()) {
    const candidates = await loadTodayCandidateOrders(phone);
    if (!candidates.length) return { order: null, reason: 'NO_ORDER_TODAY' };

    const windowMs = windowBeforeMin * 60000;
    const nowMs = now.getTime();

    const active = candidates.filter((o) => !o.cancelledAt);
    if (!active.length) return { order: null, reason: 'NO_ORDER_TODAY' };

    const eligible = active.filter((order) => {
        const start = order.workshopStart ? new Date(order.workshopStart).getTime() : null;
        if (!start) return false;
        const end = order.workshopEnd ? new Date(order.workshopEnd).getTime() : (start + DEFAULT_WORKSHOP_DURATION_MS);
        return nowMs >= start - windowMs && nowMs <= end;
    });

    if (!eligible.length) {
        const anyFuture = active.some((order) => order.workshopStart && new Date(order.workshopStart).getTime() > nowMs);
        return { order: null, reason: anyFuture ? 'TOO_EARLY' : 'TOO_LATE' };
    }

    eligible.sort((a, b) =>
        Math.abs(new Date(a.workshopStart).getTime() - nowMs) - Math.abs(new Date(b.workshopStart).getTime() - nowMs)
    );

    return { order: eligible[0], reason: null };
}

export async function getOrderById(orderId) {
    if (!orderId) return null;
    return wixData.get('WorkshopOrders', orderId, SA).catch(() => null);
}

function mapItemsForReceipt(order) {
    const products = Array.isArray(order.selectedProducts) ? order.selectedProducts : [];
    return products.map((p) => ({
        name: p.title || p.name || 'פריט',
        qty: Number(p.quantity) || 1,
        price: Number(p.price) || 0,
    }));
}

/** Hebrew-facing DTO shared by the success screen + both receipts. */
export function buildOrderDto(order) {
    const workshopTypeLabel = WORKSHOP_TYPE_LABELS[order.workshopType] || 'סדנה';
    return {
        orderId: order._id,
        orderNumber: order.ecomOrderNumber || '',
        organizerName: order.organizerName || '',
        workshopType: order.workshopType || 'tufting',
        workshopTypeLabel,
        dateLabel: formatDateIL(order.workshopStart),
        timeLabel: formatTimeIL(order.workshopStart),
        adults: order.adults || 0,
        children: order.children || 0,
        rugCount: order.rugCount || 0,
        extraCandleCount: order.extraCandleCount || 0,
        total: order.paidTotal || order.basePrice || 0,
        items: mapItemsForReceipt(order),
        checkedInAt: order.checkedInAt || null,
    };
}

/** Idempotent — safe on a refreshed/resumed session that already checked in. */
export async function markCheckedIn(order, { phone, sessionId } = {}) {
    if (order.checkedInAt) return order;
    return wixData.update('WorkshopOrders', {
        ...order,
        checkedInAt: new Date(),
        checkedInPhone: phone || order.organizerPhone || '',
        checkinSessionId: sessionId || null,
    }, SA);
}
