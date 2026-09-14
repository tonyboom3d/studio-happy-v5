/**
 * orderLookupService.js — identifies an existing order by phone number for
 * the ManyChat "existing order" flow (process 1).
 *
 * Two lookup paths run in parallel and merge into one unified order shape:
 *  - CMS path: WorkshopOrders (tufting/candles/ceramics) matched by
 *    organizerPhone, cross-checked against Wix Bookings to make sure the
 *    linked booking(s) are still active (not cancelled).
 *  - Booking-only path: charms/jewelry never get a WorkshopOrders record —
 *    matched directly against Wix Bookings by contact phone.
 *
 * No wix-http-functions/ManyChat concerns here — kept pure/testable, called
 * from http-functions.js.
 */
import { extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
import {
    getPhoneLookupVariants,
    getExpandedPhoneLookupVariants,
    getIsraeliMobileCoreDigits,
    phonesMatch,
} from 'backend/orderUtils.js';
import {
    WORKSHOP_SERVICE_IDS,
    BOOKING_ONLY_WORKSHOP_TYPES,
    WORKSHOP_TYPE_LABELS_HE,
    serviceIdToWorkshopType,
} from 'backend/workshopServiceIds.js';

const SA_CONSISTENT = { suppressAuth: true, consistentRead: true };
const ISRAEL_TZ = 'Asia/Jerusalem';

// Booking-only path scans this window — wide enough to cover upcoming
// workshops plus recently-passed ones (for "last order" lookups).
const BOOKING_ONLY_LOOKBACK_DAYS = 30;
const BOOKING_ONLY_LOOKAHEAD_DAYS = 180;

const elevatedQueryExtendedBookings = auth.elevate(extendedBookings.queryExtendedBookings);

function isCancelledBookingStatus(status) {
    return status === 'CANCELED' || status === 'CANCELLED' || status === 'DECLINED';
}

// ------------------------------------------------------------------
// CMS path — WorkshopOrders by organizerPhone (tufting/candles/ceramics)
// ------------------------------------------------------------------

/** Every PAID WorkshopOrders record matching any phone-lookup variant. */
async function queryCmsOrdersByPhone(phone) {
    const byId = new Map();

    // Phase 1: exact eq on every known format (052..., +972..., 972..., raw from ManyChat).
    for (const variant of getExpandedPhoneLookupVariants(phone)) {
        try {
            const result = await wixData.query('WorkshopOrders')
                .eq('organizerPhone', variant)
                .eq('status', 'paid')
                .descending('_createdDate')
                .limit(50)
                .find(SA_CONSISTENT);
            result.items.forEach((item) => byId.set(item._id, item));
        } catch (err) {
            console.warn('[orderLookupService] queryCmsOrdersByPhone eq failed for variant:', variant, err?.message || err);
        }
    }

    // Phase 2: contains on 9-digit mobile core — catches stored values with dashes/spaces
    // (e.g. "052-381-3929") that exact eq cannot hit.
    if (byId.size === 0) {
        const coreDigits = getIsraeliMobileCoreDigits(phone);
        if (coreDigits.length >= 8) {
            try {
                const result = await wixData.query('WorkshopOrders')
                    .contains('organizerPhone', coreDigits)
                    .eq('status', 'paid')
                    .descending('_createdDate')
                    .limit(50)
                    .find(SA_CONSISTENT);
                result.items
                    .filter((item) => phonesMatch(item.organizerPhone, phone))
                    .forEach((item) => byId.set(item._id, item));
            } catch (err) {
                console.warn('[orderLookupService] queryCmsOrdersByPhone contains failed:', err?.message || err);
            }
        }
    }

    return [...byId.values()];
}

/** Batch-fetches bookings by id, keyed by bookingId, so callers can check status. */
async function fetchBookingsByIds(bookingIds) {
    const ids = [...new Set((bookingIds || []).filter(Boolean))];
    if (!ids.length) return new Map();
    try {
        const response = await elevatedQueryExtendedBookings({
            filter: { _id: { $in: ids } },
        });
        const byId = new Map();
        (response?.extendedBookings || []).forEach((b) => {
            if (b?._id) byId.set(b._id, b);
        });
        return byId;
    } catch (err) {
        console.warn('[orderLookupService] fetchBookingsByIds failed:', err?.message || err);
        return new Map();
    }
}

function extractBookingIds(order) {
    const ids = order?.bookingIds;
    if (Array.isArray(ids)) return ids.filter(Boolean);
    if (typeof ids === 'string' && ids) return [ids];
    return [];
}

/** Maps a WorkshopOrders CMS record + its verified booking(s) into the unified order shape. */
function mapCmsOrder(order, bookingsById) {
    const bookingIds = extractBookingIds(order);
    const bookings = bookingIds.map((id) => bookingsById.get(id)).filter(Boolean);

    // No matching booking found at all for this order → treat as invalid/stale.
    if (bookingIds.length && !bookings.length) return null;
    // If we did find bookings, none of them may be cancelled.
    if (bookings.length && bookings.every((b) => isCancelledBookingStatus(b.status))) return null;

    return {
        source: 'cms',
        id: order._id,
        workshopType: order.workshopType || null,
        workshopStart: order.workshopStart ? new Date(order.workshopStart) : null,
        organizerName: order.organizerName || '',
        adults: order.adults || 0,
        children: order.children || 0,
        amount: order.paidTotal ?? order.basePrice ?? null,
        status: 'confirmed',
        bookingIds,
    };
}

async function findCmsOrders(phone) {
    const cmsOrders = await queryCmsOrdersByPhone(phone);
    if (!cmsOrders.length) return [];

    const allBookingIds = cmsOrders.flatMap(extractBookingIds);
    const bookingsById = await fetchBookingsByIds(allBookingIds);

    return cmsOrders
        .map((order) => mapCmsOrder(order, bookingsById))
        .filter(Boolean);
}

// ------------------------------------------------------------------
// Booking-only path — charms/jewelry, matched directly against Wix Bookings
// ------------------------------------------------------------------

/** All bookings for the booking-only service IDs within the lookup window. */
async function loadBookingOnlyCandidates() {
    const serviceIds = BOOKING_ONLY_WORKSHOP_TYPES.flatMap((type) => WORKSHOP_SERVICE_IDS[type] || []);
    if (!serviceIds.length) return [];

    const now = new Date();
    const startDate = new Date(now.getTime() - BOOKING_ONLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() + BOOKING_ONLY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const allBookings = [];
    let cursor = null;
    try {
        do {
            const response = await elevatedQueryExtendedBookings({
                ...(cursor
                    ? {}
                    : {
                        filter: {
                            'bookedEntity.item.slot.serviceId': { $in: serviceIds },
                            $and: [
                                { startDate: { $gte: startDate.toISOString() } },
                                { startDate: { $lte: endDate.toISOString() } },
                            ],
                        },
                    }),
                cursorPaging: { limit: 100, cursor },
            });
            allBookings.push(...(response?.extendedBookings || []));
            cursor = response?.pagingMetadata?.cursors?.next || null;
        } while (cursor);
    } catch (err) {
        console.warn('[orderLookupService] loadBookingOnlyCandidates failed:', err?.message || err);
    }
    return allBookings;
}

function bookingMatchesPhone(booking, inputPhone) {
    return phonesMatch(booking?.contactDetails?.phone, inputPhone);
}

function mapBookingOnlyOrder(booking) {
    const serviceId = booking?.bookedEntity?.item?.slot?.serviceId || booking?.bookedEntity?.item?.schedule?.serviceId;
    const startDate = booking?.bookedEntity?.item?.slot?.startDate || booking?.bookedEntity?.item?.startDate;
    const contact = booking?.contactDetails || {};

    return {
        source: 'booking',
        id: booking._id,
        workshopType: serviceIdToWorkshopType(serviceId),
        workshopStart: startDate ? new Date(startDate) : null,
        organizerName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        adults: booking.totalParticipants || 1,
        children: 0,
        amount: null,
        status: 'confirmed',
        bookingIds: [booking._id],
    };
}

async function findBookingOnlyOrders(phone) {
    if (!getPhoneLookupVariants(phone).length) return [];

    const candidates = await loadBookingOnlyCandidates();
    return candidates
        .filter((b) => !isCancelledBookingStatus(b.status))
        .filter((b) => bookingMatchesPhone(b, phone))
        .map(mapBookingOnlyOrder);
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Runs both lookup paths in parallel and returns the unified, de-duplicated
 * list of matching orders (unsorted). Never throws — returns [] on failure.
 */
export async function findOrdersByPhone(phone) {
    if (!phone) return [];
    try {
        const [cmsOrders, bookingOnlyOrders] = await Promise.all([
            findCmsOrders(phone),
            findBookingOnlyOrders(phone),
        ]);
        return [...cmsOrders, ...bookingOnlyOrders];
    } catch (err) {
        console.error('[orderLookupService] findOrdersByPhone failed:', err?.message || err);
        return [];
    }
}

/**
 * Picks the order to lead with: the nearest upcoming workshop; if none are
 * upcoming, the most recent past one. Orders without a known date sort last.
 */
export function pickPrimaryOrder(orders) {
    if (!orders?.length) return null;
    const now = Date.now();

    const withDate = orders.filter((o) => o.workshopStart instanceof Date && !isNaN(o.workshopStart));
    const upcoming = withDate
        .filter((o) => o.workshopStart.getTime() >= now)
        .sort((a, b) => a.workshopStart - b.workshopStart);
    if (upcoming.length) return upcoming[0];

    const past = withDate.sort((a, b) => b.workshopStart - a.workshopStart);
    if (past.length) return past[0];

    return orders[0];
}

function formatDateIL(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: ISRAEL_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get('day')}/${get('month')}/${get('year')}`;
}

function formatTimeIL(date) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
}

/** Builds the WhatsApp-friendly Hebrew message for the primary order. */
export function formatOrderMessage(order, hasMore = false) {
    if (!order) return 'לא מצאנו הזמנה קיימת עם המספר הזה ❌';

    const lines = ['📋 מצאנו את ההזמנה שלך!', ''];

    const typeLabel = WORKSHOP_TYPE_LABELS_HE[order.workshopType] || order.workshopType || 'סדנה';
    lines.push(`🎨 סדנה: ${typeLabel}`);

    if (order.workshopStart) {
        lines.push(`📅 תאריך: ${formatDateIL(order.workshopStart)} בשעה ${formatTimeIL(order.workshopStart)}`);
    }

    const participantsParts = [];
    if (order.adults) participantsParts.push(`${order.adults} מבוגרים`);
    if (order.children) participantsParts.push(`${order.children} ילדים`);
    if (participantsParts.length) lines.push(`👥 משתתפים: ${participantsParts.join(', ')}`);

    if (order.amount != null) lines.push(`💰 סכום ששולם: ${order.amount} ₪`);

    lines.push('✅ סטטוס: מאושר');

    if (hasMore) {
        lines.push('');
        lines.push('יש לך עוד הזמנות נוספות עם המספר הזה — רוצה לראות את ההזמנה הבאה?');
    }

    return lines.join('\n');
}
