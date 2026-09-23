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
    resolveWorkshopType,
    resolveWorkshopTypeKey,
    serviceIdToWorkshopType,
} from 'backend/workshopServiceIds.js';
import { FORTY_EIGHT_HOURS_MS } from 'backend/sketchEditingPolicy.js';

const SA_CONSISTENT = { suppressAuth: true, consistentRead: true };
const ISRAEL_TZ = 'Asia/Jerusalem';

// Booking-only path scans this window — wide enough to cover upcoming
// workshops plus recently-passed ones (for "last order" lookups).
const BOOKING_ONLY_LOOKBACK_DAYS = 30;
const BOOKING_ONLY_LOOKAHEAD_DAYS = 180;

// Workshop must be upcoming or within this window after start to count as "active".
const ACTIVE_ORDER_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

// Same post-payment order hub as the Thank You page iframe (organizer view).
const ORDER_HUB_BASE_URL = 'https://www.studiohappy.art/user-selections';

const BOOKING_ONLY_VIEW_URLS = {
    jewelry: 'https://www.studiohappy.art/workshops/סדנת-תכשיטים',
    charms: 'https://www.studiohappy.art/workshops/סדנת-תכשיטים-צ׳ארמים',
};

const elevatedQueryExtendedBookings = auth.elevate(extendedBookings.queryExtendedBookings);

/** queryExtendedBookings returns `{ booking: Booking, ... }` — not a flat Booking. */
function unwrapExtendedBooking(entry) {
    if (!entry) return null;
    if (entry.booking?._id) return entry.booking;
    if (entry._id && entry.contactDetails) return entry;
    return null;
}

function parseWorkshopDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return !isNaN(raw.getTime()) ? raw : null;
    if (typeof raw === 'object' && raw.$date) return parseWorkshopDate(raw.$date);
    const date = new Date(raw);
    return !isNaN(date.getTime()) ? date : null;
}

function extractBookingServiceId(booking) {
    const slot = booking?.bookedEntity?.slot || booking?.bookedEntity?.item?.slot;
    return slot?.serviceId
        || booking?.bookedEntity?.item?.schedule?.serviceId
        || booking?.bookedEntity?.serviceId
        || booking?.bookedEntity?.item?.serviceId
        || booking?.serviceId;
}

function extractBookingStartDate(booking) {
    const slot = booking?.bookedEntity?.slot || booking?.bookedEntity?.item?.slot;
    const raw = booking?.startDate
        || slot?.startDate
        || booking?.bookedEntity?.item?.startDate;
    return parseWorkshopDate(raw);
}

/** Canonical workshop key (tufting/candles/…) — ignores CMS placeholders like "סדנה". */
function resolveCanonicalWorkshopType(rawType, serviceId, booking) {
    const trimmed = String(rawType || '').trim();
    if (trimmed && WORKSHOP_TYPE_LABELS_HE[trimmed]) return trimmed;
    const fromAlias = resolveWorkshopType(trimmed);
    if (fromAlias && WORKSHOP_TYPE_LABELS_HE[fromAlias]) return fromAlias;
    return serviceIdToWorkshopType(serviceId)
        || serviceIdToWorkshopType(extractBookingServiceId(booking));
}

export function buildOrderViewUrl(order) {
    if (!order) return '';
    if (order.source === 'cms' && order.id) {
        return `${ORDER_HUB_BASE_URL}?orderId=${encodeURIComponent(order.id)}`;
    }
    if (order.workshopType && BOOKING_ONLY_VIEW_URLS[order.workshopType]) {
        return BOOKING_ONLY_VIEW_URLS[order.workshopType];
    }
    return '';
}

function isCancelledBookingStatus(status) {
    const s = String(status || '').toUpperCase();
    return s === 'CANCELED' || s === 'CANCELLED' || s === 'DECLINED';
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
        (response?.extendedBookings || []).forEach((entry) => {
            const booking = unwrapExtendedBooking(entry);
            if (booking?._id) byId.set(booking._id, booking);
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

    // Paid WorkshopOrders are the source of truth for ManyChat lookup — do not
    // hide them when Wix Bookings marks a linked row cancelled (sync lag / edge cases).
    const allLinkedCancelled = bookings.length > 0
        && bookings.every((b) => isCancelledBookingStatus(b.status));
    if (allLinkedCancelled && order.status !== 'paid') return null;

    const primaryBooking = bookings[0] || null;
    const workshopType = resolveCanonicalWorkshopType(
        order.workshopType,
        order.serviceId,
        primaryBooking,
    );
    const workshopStart = parseWorkshopDate(order.workshopStart) || extractBookingStartDate(primaryBooking);

    const mapped = {
        source: 'cms',
        id: order._id,
        workshopType: workshopType || null,
        workshopStart,
        organizerName: order.organizerName || '',
        adults: order.adults || 0,
        children: order.children || 0,
        amount: order.paidTotal ?? order.basePrice ?? null,
        status: 'confirmed',
        bookingIds,
        rugCount: Number(order.rugCount) || 0,
        extraCandleCount: Number(order.extraCandleCount) || 0,
        selectedProducts: Array.isArray(order.selectedProducts) ? order.selectedProducts : [],
        customerRescheduleCount: Number(order.customerRescheduleCount) || 0,
        cancelledAt: order.cancelledAt ? parseWorkshopDate(order.cancelledAt) : null,
        bookingsCancelled: allLinkedCancelled,
    };
    mapped.orderUrl = buildOrderViewUrl(mapped);
    return mapped;
}

/** Heuristic when CMS workshopType/serviceId are missing (e.g. partial CMS row). */
function inferWorkshopTypeKeyFromOrderHints(order) {
    if (!order) return null;
    const wt = String(order.workshopType || '').trim();
    if (wt === 'tufting' || wt === 'candles' || wt === 'ceramics') return wt;
    if (Number(order.extraCandleCount) > 0) return 'candles';
    if (Number(order.rugCount) > 0) return 'tufting';
    if (Array.isArray(order.selectedProducts) && order.selectedProducts.length > 0) return 'ceramics';
    return null;
}

/** Resolves tufting/candles/… for a WorkshopOrders row — CMS fields, then linked booking(s). */
export async function resolveCmsOrderWorkshopTypeKey(order) {
    if (!order) return null;
    let key = resolveWorkshopTypeKey(order.workshopType, order.serviceId);
    if (key) return key;

    const bookingIds = extractBookingIds(order);
    if (bookingIds.length) {
        const bookingsById = await fetchBookingsByIds(bookingIds);
        for (const id of bookingIds) {
            const booking = bookingsById.get(id);
            if (!booking) continue;
            const fromBooking = serviceIdToWorkshopType(extractBookingServiceId(booking));
            if (fromBooking) return fromBooking;
        }
    }

    return inferWorkshopTypeKeyFromOrderHints(order);
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
    const serviceId = extractBookingServiceId(booking);
    const contact = booking?.contactDetails || {};

    const mapped = {
        source: 'booking',
        id: booking._id,
        workshopType: serviceIdToWorkshopType(serviceId),
        workshopStart: extractBookingStartDate(booking),
        organizerName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        adults: booking.totalParticipants || 1,
        children: 0,
        amount: null,
        status: 'confirmed',
        bookingIds: [booking._id],
    };
    mapped.orderUrl = buildOrderViewUrl(mapped);
    return mapped;
}

async function findBookingOnlyOrders(phone) {
    if (!getPhoneLookupVariants(phone).length) return [];

    const candidates = await loadBookingOnlyCandidates();
    return candidates
        .map(unwrapExtendedBooking)
        .filter(Boolean)
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

/** True when workshop is upcoming or ended less than 2 days ago. */
export function isActiveOrder(order, nowMs = Date.now()) {
    if (!order?.workshopStart || !(order.workshopStart instanceof Date) || isNaN(order.workshopStart)) {
        return true;
    }
    return order.workshopStart.getTime() >= nowMs - ACTIVE_ORDER_GRACE_MS;
}

export function isCancelledOrder(order) {
    if (!order) return false;
    if (order.cancelledAt) return true;
    if (order.bookingsCancelled) return true;
    return false;
}

/** Expired (past grace window) or cancelled — not shown as a valid lookup result. */
export function isUnavailableOrder(order, nowMs = Date.now()) {
    if (isCancelledOrder(order)) return true;
    return !isActiveOrder(order, nowMs);
}

export function filterActiveOrders(orders, nowMs = Date.now()) {
    return (orders || []).filter((order) => !isUnavailableOrder(order, nowMs));
}

/** Free customer reschedule blocked when workshop starts within 48 hours. */
export function isRescheduleBlockedWithin48h(order, nowMs = Date.now()) {
    if (!order?.workshopStart || !(order.workshopStart instanceof Date) || isNaN(order.workshopStart.getTime())) {
        return false;
    }
    const msUntil = order.workshopStart.getTime() - nowMs;
    return msUntil > 0 && msUntil <= FORTY_EIGHT_HOURS_MS;
}

/** One free customer reschedule per order — tracked on WorkshopOrders.customerRescheduleCount. */
export function hasCustomerRescheduleUsed(order) {
    const count = Number(order?.customerRescheduleCount);
    if (Number.isFinite(count) && count >= 1) return true;
    return order?.rescheduledByCustomer === true;
}

export function getRescheduleEligibility(order, nowMs = Date.now()) {
    if (!order) {
        return { reschedule_blocked_48h: false, reschedule_already_used: false };
    }
    return {
        reschedule_blocked_48h: isRescheduleBlockedWithin48h(order, nowMs),
        reschedule_already_used: hasCustomerRescheduleUsed(order),
    };
}

/** True while a reschedule request is already sitting with staff for review. */
export function hasOpenRescheduleRequest(order) {
    return order?.pendingRescheduleStatus === 'pending_staff_review';
}

/** Customer already picked a new date — awaiting WhatsApp confirm and/or staff (no new calendar). */
export function hasPendingRescheduleChoice(order) {
    const status = order?.pendingRescheduleStatus;
    return status === 'requested' || status === 'pending_staff_review';
}

export const NO_ACTIVE_ORDER_MESSAGE = 'לא מצאנו הזמנה פעילה — הסדנה שלך כבר התקיימה לפני יותר מ-2 ימים ❌';

export const ORDER_NOT_FOUND_MESSAGE = 'לא מצאנו הזמנה קיימת עם המספר הזה ❌';

export const NO_MORE_ORDERS_MESSAGE = 'אין עוד הזמנות פעילות להצגה ❌';

/** Sorted list: upcoming (nearest first), then recent past, then orders without a date. */
export function sortOrdersForDisplay(orders, nowMs = Date.now()) {
    if (!orders?.length) return [];

    const withDate = [];
    const noDate = [];
    for (const order of orders) {
        if (order.workshopStart instanceof Date && !isNaN(order.workshopStart)) withDate.push(order);
        else noDate.push(order);
    }

    const upcoming = withDate
        .filter((o) => o.workshopStart.getTime() >= nowMs)
        .sort((a, b) => a.workshopStart - b.workshopStart);
    const past = withDate
        .filter((o) => o.workshopStart.getTime() < nowMs)
        .sort((a, b) => b.workshopStart - a.workshopStart);

    return [...upcoming, ...past, ...noDate];
}

/**
 * Picks the order to lead with: the nearest upcoming workshop; if none are
 * upcoming, the most recent past one. Orders without a known date sort last.
 */
export function pickPrimaryOrder(orders) {
    return sortOrdersForDisplay(orders)[0] || null;
}

/**
 * Picks the next order to show. Pass excludeOrderId = the order already shown
 * (order_lookup_order_id) so the user can step through multiple active orders.
 */
export function selectActiveOrder(activeOrders, excludeOrderId = '') {
    const exclude = String(excludeOrderId || '').trim();
    const pool = exclude
        ? activeOrders.filter((order) => order.id !== exclude)
        : activeOrders;
    const sorted = sortOrdersForDisplay(pool);
    return {
        primary: sorted[0] || null,
        hasMore: sorted.length > 1,
        totalActive: activeOrders.length,
        remainingAfterExclude: sorted.length,
    };
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

function sumSelectedProductQuantity(selectedProducts) {
    if (!Array.isArray(selectedProducts)) return 0;
    return selectedProducts.reduce((sum, p) => sum + (Math.max(1, Number(p.quantity) || 1)), 0);
}

/** Workshop-specific quantity line (rugs / candles / ceramics pieces). */
function formatOrderQuantityLine(order) {
    const type = order?.workshopType;
    const total = Number(order?.rugCount) || 0;
    if (!type || total <= 0) return null;

    if (type === 'tufting') return `🧵 שטיחים: ${total}`;
    if (type === 'candles') return `🕯️ נרות: ${total}`;
    if (type === 'ceramics') {
        const extra = Number(order?.extraCandleCount) || 0;
        if (extra > 0) return `🏺 כלי קרמיקה: ${total} (כולל ${extra} נוספים)`;
        return `🏺 כלי קרמיקה: ${total}`;
    }
    return null;
}

/** Builds the WhatsApp-friendly Hebrew message for the primary order. */
export function formatOrderMessage(order) {
    if (!order) return ORDER_NOT_FOUND_MESSAGE;

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

    const quantityLine = formatOrderQuantityLine(order);
    if (quantityLine) lines.push(quantityLine);

    if (order.workshopType === 'candles') {
        const cups = sumSelectedProductQuantity(order.selectedProducts);
        if (cups > 0) lines.push(`☕ כוסות לנר: ${cups}`);
    }

    if (order.amount != null) lines.push(`💰 סכום ששולם: ${order.amount} ₪`);

    lines.push('✅ סטטוס: מאושר');

    // Order link only makes sense to send for tufting today — CMS hub page.
    if (order.orderUrl && order.workshopType === 'tufting') {
        lines.push('');
        lines.push(`🔗 לצפייה בפרטי ההזמנה: ${order.orderUrl}`);
    }

    return lines.join('\n');
}
