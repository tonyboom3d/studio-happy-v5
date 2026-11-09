/**
 * Helpers for the scheduling calendar's participant list: finds Wix Bookings seats that
 * have no paid WorkshopOrders row, and resolves candle-cup labels.
 */
import wixData from 'wix-data';
import { auth } from '@wix/essentials';
import { extendedBookings } from '@wix/bookings';
import { toDateKey } from 'backend/availabilityRules.js';
import { canonicalSessionKey } from 'backend/schedulingEngine.js';

const SA = { suppressAuth: true };
const elevatedQueryExtendedBookings = auth.elevate(extendedBookings.queryExtendedBookings);
const INACTIVE_BOOKING = new Set(['CANCELED', 'DECLINED', 'WAITING_LIST']);

const ORDER_STATUS_LABELS = {
    pending_payment: 'ממתין לתשלום',
};

function firstTag(raw) {
    if (raw == null || raw === '') return '';
    if (Array.isArray(raw)) return String(raw[0] ?? '').trim();
    const s = String(raw).trim();
    if (s.startsWith('[')) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return String(arr[0] ?? '').trim();
        } catch (_) { /* plain text */ }
    }
    return s.replace(/^"|"$/g, '');
}

function parseSelected(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }
    return [];
}

/** orderId → cup rows aligned 1:1 with order.selectedProducts: [{ label }]. */
export async function loadCupLabels(orders) {
    const out = {};
    const ids = new Set();
    for (const o of orders || []) {
        for (const s of parseSelected(o.selectedProducts)) if (s?.productId) ids.add(s.productId);
    }
    if (!ids.size) return out;
    const res = await wixData.query('bookingProducts').hasSome('_id', [...ids]).limit(100).find(SA).catch(() => ({ items: [] }));
    const label = {};
    for (const p of res.items || []) label[p._id] = firstTag(p.difficulty);
    for (const o of orders) {
        out[o._id] = parseSelected(o.selectedProducts).map(s => ({ label: label[s?.productId] || '' }));
    }
    return out;
}

async function findOrdersByBookingIds(bookingIds) {
    const byBooking = {};
    if (!bookingIds.length) return byBooking;
    for (const field of ['bookingIds', 'bookingId']) {
        const res = await wixData.query('WorkshopOrders').hasSome(field, bookingIds).limit(100).find(SA).catch(() => ({ items: [] }));
        for (const o of res.items || []) {
            const ids = [...(o.bookingIds || []), o.bookingId].filter(Boolean);
            for (const id of ids) if (bookingIds.includes(id) && !byBooking[id]) byBooking[id] = o;
        }
    }
    return byBooking;
}

/**
 * Active Wix bookings of the session that no paid order covers (unpaid holds, direct bookings,
 * cancelled orders). Returned in the same group shape the calendar drawer renders.
 */
export async function loadUncoveredSessionBookings({ serviceIds, dateKey, sessionKey, coveredBookingIds }) {
    if (!serviceIds?.length) return [];
    const base = sessionKey ? new Date(sessionKey) : new Date(`${dateKey}T12:00:00Z`);
    const from = sessionKey ? new Date(base.getTime() - 60000) : new Date(`${dateKey}T00:00:00Z`);
    const to = sessionKey ? new Date(base.getTime() + 60000) : new Date(`${dateKey}T23:59:59Z`);
    if (!sessionKey) { from.setUTCDate(from.getUTCDate() - 1); to.setUTCDate(to.getUTCDate() + 1); }

    const bookings = [];
    try {
        let cursor = null;
        do {
            const request = cursor
                ? { cursorPaging: { limit: 100, cursor } }
                : {
                    filter: {
                        'bookedEntity.item.slot.serviceId': { $in: serviceIds },
                        $and: [{ startDate: { $gte: from.toISOString() } }, { startDate: { $lte: to.toISOString() } }],
                    },
                    cursorPaging: { limit: 100 },
                };
            const response = await elevatedQueryExtendedBookings(request);
            for (const ext of response.extendedBookings || []) {
                const b = ext.booking;
                if (!b?._id || INACTIVE_BOOKING.has(b.status) || coveredBookingIds.has(b._id)) continue;
                const slot = b.bookedEntity?.slot || b.bookedEntity?.item?.slot || {};
                const startRaw = b.startDate || slot.startDate;
                if (!startRaw) continue;
                if (sessionKey ? canonicalSessionKey(startRaw) !== sessionKey : toDateKey(startRaw) !== dateKey) continue;
                bookings.push(b);
            }
            cursor = response.pagingMetadata?.cursors?.next || null;
        } while (cursor);
    } catch (err) {
        console.warn('[sessionGroups] bookings load failed:', err?.message || err);
        return [];
    }
    if (!bookings.length) return [];

    const orderByBooking = await findOrdersByBookingIds(bookings.map(b => b._id));
    const seenOrders = new Set();
    const groups = [];
    for (const b of bookings) {
        const order = orderByBooking[b._id];
        if (order) {
            if (seenOrders.has(order._id)) continue;
            seenOrders.add(order._id);
        }
        const c = b.contactDetails || {};
        const seats = Math.max(1, Number(b.totalParticipants) || 1);
        const status = order
            ? (order.cancelledAt ? 'ההזמנה בוטלה במערכת, אך ההזמנה ב-Wix עדיין פעילה' : (ORDER_STATUS_LABELS[order.status] || `סטטוס הזמנה: ${order.status || 'לא ידוע'}`))
            : 'הזמנה ב-Wix ללא רשומת הזמנה במערכת';
        groups.push({
            id: order ? order._id : `bk:${b._id}`,
            orderId: order?._id || null,
            organizerName: order?.organizerName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'ללא שם',
            organizerPhone: order?.organizerPhone || c.phone || '',
            organizerEmail: order?.organizerEmail || c.email || '',
            adults: order ? (order.adults || 0) : seats,
            children: order ? (order.children || 0) : 0,
            seats,
            unpaid: true,
            statusLabel: status,
            paidTotal: 0,
            paidDiscount: 0,
            couponCode: '',
            couponName: '',
            promoCoupon: null,
            customerNotes: order?.customerNotes || '',
            internalNotes: order?.internalNotes || '',
            notes: order?.customerNotes || order?.internalNotes || '',
            sketches: [],
            cups: [],
            rugCount: order?.rugCount || 0,
            workshopType: order?.workshopType || '',
            extraCandleCount: order?.extraCandleCount || 0,
            orderNumber: order?.ecomOrderNumber || '',
            checkedInAt: null,
            participants: [],
        });
    }
    return groups;
}
