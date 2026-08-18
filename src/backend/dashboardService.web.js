import { availabilityCalendar } from 'wix-bookings.v2';
import { extendedBookings } from '@wix/bookings';
import { orders as ecomOrders } from '@wix/ecom';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { mediaManager } from 'wix-media-backend';
import { currentMember } from 'wix-members-backend';
import { sendGreenApiWhatsApp } from 'backend/whatsappService.jsw';
import { SKETCH_STATUS, SKETCH_STATUSES, normalizeSketchStatus, isLockedStatus } from 'backend/sketchStatus.js';
import { PERMISSION_KEYS, PERMISSION_DEFAULTS, refId } from 'backend/staffRoles.js';
import { getItemWithRetry } from 'backend/wixDataRetry.js';
import { TUFTING_SERVICE_IDS } from 'backend/sketchEditingPolicy.js';
import {
    TEMPLATE_USE,
    assertTemplateUse,
    mapTemplateRow,
    resolveTemplateUse,
} from 'backend/whatsappTemplates.js';

const SA = { suppressAuth: true };
const ORDER_DEBUG_USER_ID = 'e5af95ac-27b1-45e9-9de4-bd89adffc953';

function isOrderDebugUser(member) {
    return !!member?._id && member._id === ORDER_DEBUG_USER_ID;
}
const ISRAEL_TZ = 'Asia/Jerusalem';
const elevatedGetEcomOrder = auth.elevate(ecomOrders.getOrder);
const elevatedQueryExtendedBookings = auth.elevate(extendedBookings.queryExtendedBookings);

// Must stay in sync with TUFTING_SERVICE_IDS in bookingService.web.js — used only
// as a fallback when the `workshops` CMS collection has no serviceIds mapped yet.
const FALLBACK_SERVICE_IDS = [
    '3406e74d-949b-44b0-a5cc-064548129c08',
    '22e86498-525e-4580-9c83-a4470b0c874d',
    'c1c1e799-84a9-4847-adf6-2a34480c5bfe',
];

// Keep in sync with CANDLES_SERVICE_IDS in bookingService.web.js
const CANDLES_SERVICE_ID_SET = new Set([
    'eb8fec0e-5d04-48a3-a795-e3e8051d07da',
    'f0f6e447-02d8-4808-80ba-3c380ce9eae8',
]);

function isCandlesOrder(order) {
    if (order?.workshopType) return order.workshopType === 'candles';
    return !!order?.serviceId && CANDLES_SERVICE_ID_SET.has(order.serviceId);
}

// Keep in sync with CERAMICS_SERVICE_IDS in bookingService.web.js
const CERAMICS_SERVICE_ID_SET = new Set([
    'ad89914a-1845-48c6-804d-544cd17f179b',
    '06508cd0-92ec-49d9-bd27-a3d4999afc89',
]);

function isCeramicsOrder(order) {
    if (order?.workshopType) return order.workshopType === 'ceramics';
    return !!order?.serviceId && CERAMICS_SERVICE_ID_SET.has(order.serviceId);
}

/** Convert Wix media URLs to browser-displayable HTTPS URLs. */
function convertWixImageUrl(wixUrl, width = 400, height = 400, quality = 80) {
    if (!wixUrl) return null;
    const raw = String(wixUrl).trim();
    if (!raw) return null;
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;

    const match = raw.match(/wix:image:\/\/v1\/([^/]+)/);
    if (match && match[1]) {
        return `https://static.wixstatic.com/media/${match[1]}/v1/fill/w_${width},h_${height},q_${quality}/${match[1]}`;
    }
    return null;
}

function parseProductSnapshot(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
}

const DEFAULT_TYPE_COLOR_HEX = '#6B7280'; // Tailwind gray-500 — fallback when colorTag is missing/invalid.
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// `workshops.colorTag` is now a HEX color field (e.g. "#4F46E5"); the custom
// element applies it as an inline style rather than a Tailwind class.
function normalizeColorHex(colorTag) {
    const value = (colorTag || '').trim();
    return HEX_COLOR_RE.test(value) ? value : DEFAULT_TYPE_COLOR_HEX;
}

function formatDateIL(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    return new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function formatTimeIL(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    return new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

function hoursUntil(dateObj) {
    if (!dateObj) return null;
    const now = new Date();
    const target = new Date(dateObj);
    return (target.getTime() - now.getTime()) / (60 * 60 * 1000);
}

function normalizePhone(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) digits = '972' + digits.slice(1);
    if (!digits.startsWith('972')) digits = '972' + digits;
    return `+${digits}`;
}

function formatLogTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const parts = new Intl.DateTimeFormat('he-IL', {
        timeZone: ISRAEL_TZ,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
}

async function loadWorkshopTypes() {
    const result = await wixData.query('workshops').find(SA);
    const items = result.items || [];
    const typesMap = {};
    const serviceIdToTypeId = {};

    for (const item of items) {
        const serviceIds = String(item.serviceIds || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!serviceIds.length) continue;
        typesMap[item._id] = {
            id: item._id,
            title: item.workshopName || 'סדנה',
            colorHex: normalizeColorHex(item.colorTag),
            requiresSketch: item.requiresSketch !== false,
            serviceIds,
        };
        for (const sid of serviceIds) serviceIdToTypeId[sid] = item._id;
    }

    if (!Object.keys(typesMap).length) {
        typesMap.unknown = {
            id: 'unknown',
            title: 'סדנת טאפטינג',
            colorHex: '#A21CAF',
            requiresSketch: true,
            serviceIds: FALLBACK_SERVICE_IDS,
        };
        for (const sid of FALLBACK_SERVICE_IDS) serviceIdToTypeId[sid] = 'unknown';
    }

    return { typesMap, serviceIdToTypeId, allServiceIds: Object.keys(serviceIdToTypeId) };
}

async function loadStaffNamesById() {
    const result = await wixData.query('Bookings/Staff').find(SA);
    const map = {};
    for (const s of (result.items || [])) map[s._id] = s.name;
    return map;
}

/**
 * Loads Bookings sessions and builds:
 *  - `sessions`: deduplicated list (one row per workshop slot)
 *  - `idLookup`: maps any slot id variant (sessionId, eventId, stored order id) → canonical workshop id
 *
 * Wix deprecated sessionId in favour of eventId; WorkshopOrders may store either,
 * so we must index both or orders silently fail to match (0 groups in the UI).
 */
async function loadSessions(serviceIds, startDate, endDate) {
    const options = { slotsPerDay: 100 };
    const allResults = await Promise.all(serviceIds.map(async serviceId => {
        try {
            const query = { filter: { serviceId, startDate: startDate.toISOString(), endDate: endDate.toISOString() } };
            const availability = await availabilityCalendar.queryAvailability(query, options);
            return availability.availabilityEntries || [];
        } catch (err) {
            console.error(`[dashboardService] availability error for service ${serviceId}:`, err?.message || err);
            return [];
        }
    }));

    // Dedupe by serviceId + start time, NOT by raw id: the same physical slot
    // can come back with different id variants (old sessionId vs new eventId),
    // which used to create duplicate workshop rows with orders split between
    // them. All id variants of the same slot map to one canonical id.
    const uniqueBySlotKey = new Map();
    const idLookup = {};

    for (const entries of allResults) {
        for (const entry of entries) {
            const slot = entry.slot || {};
            const anyId = slot.eventId || slot.sessionId;
            if (!anyId) continue;

            const startTs = slot.startDate ? new Date(slot.startDate).getTime() : null;
            const slotKey = startTs !== null ? `${slot.serviceId}_${startTs}` : anyId;

            let session = uniqueBySlotKey.get(slotKey);
            if (!session) {
                session = {
                    id: anyId,
                    sessionId: slot.sessionId || null,
                    eventId: slot.eventId || null,
                    serviceId: slot.serviceId,
                    start: slot.startDate ? new Date(slot.startDate) : null,
                    end: slot.endDate ? new Date(slot.endDate) : null,
                    totalSpots: entry.totalSpots || 0,
                    openSpots: entry.openSpots || 0,
                    staffId: slot.resource?._id || null,
                };
                uniqueBySlotKey.set(slotKey, session);
            } else {
                // Merge id variants from the duplicate entry into the canonical session.
                if (!session.sessionId && slot.sessionId) session.sessionId = slot.sessionId;
                if (!session.eventId && slot.eventId) session.eventId = slot.eventId;
                if (!session.staffId && slot.resource?._id) session.staffId = slot.resource._id;
            }

            if (slot.sessionId) idLookup[slot.sessionId] = session.id;
            if (slot.eventId) idLookup[slot.eventId] = session.id;
            idLookup[anyId] = session.id;
            idLookup[session.id] = session.id;
        }
    }

    return { sessions: [...uniqueBySlotKey.values()], idLookup };
}

const SESSION_MATCH_TOLERANCE_MS = 5 * 60 * 1000;

function summarizeSession(session, extra) {
    if (!session) return null;
    return {
        id: session.id,
        sessionId: session.sessionId || null,
        eventId: session.eventId || null,
        serviceId: session.serviceId || null,
        start: session.start ? session.start.toISOString() : null,
        startLabel: session.start ? `${formatDateIL(session.start)} ${formatTimeIL(session.start)}` : null,
        ...(extra || {}),
    };
}

/**
 * Same matching rules as the dashboard, plus why a match succeeded/failed.
 * Mutates idLookup on a datetime hit (same as the live grouping path).
 */
function inspectOrderSessionMatch(order, idLookup, sessions) {
    const storedId = order.sessionId || null;
    if (storedId && idLookup[storedId]) {
        return { resolvedId: idLookup[storedId], method: 'idLookup', storedId };
    }

    const orderStart = order.workshopStart ? new Date(order.workshopStart).getTime() : null;
    if (!orderStart || Number.isNaN(orderStart)) {
        return { resolvedId: null, method: null, storedId, failReason: 'missing-workshopStart' };
    }
    if (!order.serviceId) {
        return { resolvedId: null, method: null, storedId, failReason: 'missing-serviceId' };
    }

    let closest = null;
    for (const session of sessions) {
        if (session.serviceId !== order.serviceId || !session.start) continue;
        const diffMs = Math.abs(session.start.getTime() - orderStart);
        if (!closest || diffMs < closest.diffMs) closest = { session, diffMs };
        if (diffMs <= SESSION_MATCH_TOLERANCE_MS) {
            if (storedId) idLookup[storedId] = session.id;
            return {
                resolvedId: session.id,
                method: 'datetime',
                storedId,
                timeDiffMs: diffMs,
                closestSession: summarizeSession(session, { diffMs }),
            };
        }
    }

    return {
        resolvedId: null,
        method: null,
        storedId,
        failReason: closest
            ? 'datetime-out-of-tolerance'
            : (storedId ? 'sessionId-not-in-calendar' : 'no-session-for-service'),
        closestSession: closest ? summarizeSession(closest.session, { diffMs: closest.diffMs }) : null,
    };
}

/** Resolves a WorkshopOrders row to the canonical Bookings session id. */
function resolveOrderSessionId(order, idLookup, sessions) {
    return inspectOrderSessionMatch(order, idLookup, sessions).resolvedId;
}

function buildOrderMatchDiagnosis({ order, participants, match, inDateRange, queryLimitHit }) {
    const reasons = [];
    if (order.status && order.status !== 'paid') {
        reasons.push({
            code: 'not-paid',
            text: `סטטוס ב-CMS הוא "${order.status}" — הדאשבורד טוען רק הזמנות paid.`,
        });
    }
    if (order.cancelledAt) {
        reasons.push({
            code: 'cancelled',
            text: 'ההזמנה מבוטלת — מוסתרת בטבלה אלא אם מסומן "הצג הזמנות מבוטלות".',
        });
    }
    if (inDateRange === false) {
        reasons.push({
            code: 'out-of-range',
            text: 'workshopStart מחוץ לטווח התאריכים שנטען בדאשבורד.',
        });
    }
    if (queryLimitHit) {
        reasons.push({
            code: 'query-limit',
            text: 'ייתכן שההזמנה לא נטענה — שאילתת WorkshopOrders מוגבלת ל-50 רשומות.',
        });
    }
    if (!match?.resolvedId) {
        const failMap = {
            'missing-workshopStart': 'אין workshopStart — אי אפשר להתאים לסשן לפי זמן.',
            'missing-serviceId': 'אין serviceId — אי אפשר להתאים לסשן.',
            'sessionId-not-in-calendar': 'sessionId מה-CMS לא נמצא ביומן Bookings של הטווח, וגם fallback לפי תאריך נכשל.',
            'datetime-out-of-tolerance': 'נמצא סשן קרוב לאותו serviceId, אבל הפרש הזמן גדול מ-5 דקות.',
            'no-session-for-service': 'אין סשן ביומן Bookings עם אותו serviceId בטווח שנטען.',
        };
        reasons.push({
            code: match?.failReason || 'unmatched',
            text: failMap[match?.failReason] || 'ההזמנה לא הותאמה לאף סשן — לכן לא תופיע בטבלה.',
        });
    }
    const participantCount = (participants || []).filter((p) => !p.cancelledAt).length;
    const adults = order.adults || 0;
    const isOrganizerMode = !order.selectionMode || order.selectionMode === 'organizer';
    if (isOrganizerMode) {
        reasons.push({
            code: 'organizer-one-row',
            text: `זו הזמנת מארגן (selectionMode=organizer). בטבלה היא שורה אחת / קבוצה אחת — גם אם יש ${adults || participantCount || 1} מבוגרים. מספר המבוגרים הוא גודל הקבוצה, לא מספר הקבוצות.`,
        });
        if (participantCount > 1) {
            reasons.push({
                code: 'organizer-hides-participant-rows',
                text: `יש ${participantCount} רשומות ב-WorkshopParticipants, אבל במצב מארגן הן לא נספרות כשורות נפרדות. רק selectionMode=participants מציג כל רשומה כקבוצה.`,
            });
        }
    }
    if (order.selectionMode === 'participants' && participantCount === 0) {
        reasons.push({
            code: 'no-participants',
            text: 'selectionMode=participants אבל אין רשומות פעילות ב-WorkshopParticipants — ספירת הקבוצות נופלת ל-1 (ההזמנה עצמה).',
        });
    }
    return reasons;
}

/**
 * Loads every real Wix Bookings booking for the given services/date range,
 * regardless of whether it went through the new WorkshopOrders/CMS flow.
 * Used to surface "legacy" orders (booked directly via Wix Bookings, with
 * no matching WorkshopOrders record) when the dashboard's "show all orders"
 * toggle is enabled.
 */
async function loadAllServiceBookings(serviceIds, startDate, endDate) {
    if (!serviceIds.length) return [];
    const allBookings = [];
    let cursor = null;
    try {
        do {
            const response = await elevatedQueryExtendedBookings({
                filter: {
                    'bookedEntity.item.slot.serviceId': { $in: serviceIds },
                    $and: [
                        { startDate: { $gte: startDate.toISOString() } },
                        { startDate: { $lte: endDate.toISOString() } },
                    ],
                },
                cursorPaging: { limit: 100, cursor },
            });
            allBookings.push(...(response.extendedBookings || []));
            cursor = response.pagingMetadata?.cursors?.next || null;
        } while (cursor);
    } catch (err) {
        console.error('[dashboardService] loadAllServiceBookings error:', err?.message || err);
        return allBookings;
    }
    return allBookings;
}

/** Maps a raw Wix Booking (not backed by a WorkshopOrders CMS record) into a dashboard-order-shaped object. */
function buildLegacyOrder(booking, resolvedSessionId) {
    const contact = booking.contactDetails || {};
    const organizerName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'ללא שם (הזמנה ישנה)';
    const quantity = booking.totalParticipants || 1;
    return {
        id: `legacy_${booking._id}`,
        workshopId: resolvedSessionId,
        selectionMode: null,
        organizerName,
        organizerEmail: contact.email || '',
        organizerPhone: contact.phone || '',
        adults: quantity,
        children: 0,
        hasAdultAndChild: false,
        quantity,
        rugCount: 0,
        orderStatus: booking.status === 'CANCELED' ? 'cancelled' : 'active',
        notes: '',
        logs: [],
        sketches: [],
        participantGroups: [],
        isLegacyOrder: true,
    };
}

/** Fetches eCom buyer info for orders missing organizer contact fields. */
async function loadEcomBuyerByOrderId(orders) {
    const cache = {};
    const needsBuyer = orders.filter(o =>
        o.ecomOrderId && (!o.organizerName || !o.organizerEmail || !o.organizerPhone)
    );
    await Promise.all(needsBuyer.map(async (order) => {
        try {
            const ecomOrder = await elevatedGetEcomOrder(order.ecomOrderId);
            const buyer = ecomOrder?.buyerInfo || ecomOrder?.billingInfo || {};
            cache[order._id] = buyer;
        } catch (err) {
            console.warn(`[dashboardService] ecom buyer fetch failed for order ${order._id}:`, err?.message || err);
        }
    }));
    return cache;
}

/** Fills missing organizer contact from eCom buyer, then WorkshopParticipants. */
function enrichOrganizerFields(order, participantsForOrder, ecomBuyer) {
    const participants = participantsForOrder || [];
    const withPhone = participants.find(p => p.phone || p.rawPhone);
    const buyerName = ecomBuyer
        ? `${ecomBuyer.firstName || ''} ${ecomBuyer.lastName || ''}`.trim()
        : '';

    let organizerName = (order.organizerName || '').trim();
    if (!organizerName) organizerName = buyerName || participants[0]?.name || '';

    const organizerEmail = (order.organizerEmail || '').trim() || ecomBuyer?.email || '';
    const organizerPhone = (order.organizerPhone || '').trim()
        || ecomBuyer?.phone
        || withPhone?.phone
        || withPhone?.rawPhone
        || '';

    return { organizerName, organizerEmail, organizerPhone };
}

/** Counts active (non-cancelled) groups for a session. */
function countSessionGroups(sessionOrders, participantsByOrderId) {
    return sessionOrders.reduce((sum, order) => {
        if (order.cancelledAt) return sum;
        const participants = (participantsByOrderId[order._id] || []).filter((p) => !p.cancelledAt);
        if (order.selectionMode === 'participants' && participants.length > 0) {
            return sum + participants.length;
        }
        return sum + 1;
    }, 0);
}

async function loadSketchesForOrders(orderIds) {
    const byOrderId = {};
    if (!orderIds.length) return byOrderId;
    const result = await wixData.query('SketchSelections').hasSome('orderId', orderIds).find(SA);
    for (const sel of (result.items || [])) {
        if (!byOrderId[sel.orderId]) byOrderId[sel.orderId] = [];
        byOrderId[sel.orderId].push(sel);
    }
    return byOrderId;
}

async function loadParticipantsForOrders(orderIds) {
    const byOrderId = {};
    if (!orderIds.length) return byOrderId;
    const result = await wixData.query('WorkshopParticipants').hasSome('orderId', orderIds).find(SA);
    for (const p of (result.items || [])) {
        if (!byOrderId[p.orderId]) byOrderId[p.orderId] = [];
        byOrderId[p.orderId].push(p);
    }
    return byOrderId;
}

/** Per-rug parent+child flag — not whole-group. rugIndex is local per participant (0..rugAllowance-1). */
function resolveSketchChildInfo(sel, participantsForOrder, order) {
    const participants = participantsForOrder || [];
    let participant = null;
    if (sel.participantId) {
        participant = participants.find((p) => p._id === sel.participantId);
    }
    if (!participant && sel.participantName) {
        participant = participants.find((p) => p.name === sel.participantName);
    }

    const rugIndex = sel.rugIndex != null ? Number(sel.rugIndex) : null;
    if (rugIndex == null || Number.isNaN(rugIndex)) {
        return { includesChild: false, childrenCount: 0 };
    }

    if (participant) {
        const groupChildren = participant.childrenCount || 0;
        if (groupChildren <= 0) return { includesChild: false, childrenCount: 0 };
        // First N rug slots in the group (by local rugIndex) are הורה+ילד.
        const includesChild = rugIndex < groupChildren;
        return { includesChild, childrenCount: includesChild ? 1 : 0 };
    }

    const orderChildren = order?.children || 0;
    if (orderChildren <= 0) return { includesChild: false, childrenCount: 0 };

    const parentChildRugs = Math.min(orderChildren, order?.rugCount || 0);
    const includesChild = rugIndex < parentChildRugs;
    return { includesChild, childrenCount: includesChild ? 1 : 0 };
}

function parseDifficultyTags(raw) {
    if (raw == null || raw === '') return '';
    if (Array.isArray(raw)) {
        const first = raw[0];
        return typeof first === 'string' ? first.trim() : String(first ?? '').trim();
    }
    if (typeof raw !== 'string') return String(raw).trim();
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const tryParseArray = (value) => {
        if (typeof value !== 'string' || !value.startsWith('[')) return '';
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return String(parsed[0]).trim();
            }
        } catch {}
        return '';
    };
    const fromJson = tryParseArray(trimmed);
    if (fromJson) return fromJson;
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            const unquoted = JSON.parse(trimmed);
            if (typeof unquoted === 'string') {
                const nested = tryParseArray(unquoted);
                if (nested) return nested;
                return unquoted.trim();
            }
        } catch {}
    }
    return trimmed;
}

function getProductWixImageFromMap(productsById, productId) {
    const entry = productId ? productsById[productId] : null;
    if (!entry) return null;
    return typeof entry === 'string' ? entry : entry.image || null;
}

function resolveSketchWixFileUrl(sel, productWixImageById = {}) {
    const snapshot = parseProductSnapshot(sel?.productSnapshot);
    const candidates = [
        sel?.sketchWixFileUrl,
        snapshot?.wixFileUrl,
        snapshot?.image,
        sel?.sketchImage,
        getProductWixImageFromMap(productWixImageById, sel?.productId),
    ];
    for (const url of candidates) {
        const trimmed = String(url || '').trim();
        if (trimmed.startsWith('wix:image://')) return trimmed;
    }
    return null;
}

function resolveSketchDisplayImage(sel, productWixImageById = {}) {
    const snapshot = parseProductSnapshot(sel?.productSnapshot);
    const candidates = [
        sel?.sketchImage,
        sel?.imageUrl,
        snapshot?.imageUrl,
        snapshot?.image,
        getProductWixImageFromMap(productWixImageById, sel?.productId),
    ];
    for (const url of candidates) {
        const converted = convertWixImageUrl(url, 400, 400, 75);
        if (converted) return converted;
    }
    return null;
}

async function loadProductWixImagesById(productIds) {
    const uniqueIds = [...new Set((productIds || []).filter(Boolean))];
    const map = {};
    if (!uniqueIds.length) return map;
    const result = await wixData.query('bookingProducts').hasSome('_id', uniqueIds).find(SA);
    for (const product of (result.items || [])) {
        map[product._id] = {
            image: String(product?.image || '').trim() || null,
            difficulty: parseDifficultyTags(product?.difficulty) || '',
            price: parseFloat(product.productName) || 0,
        };
    }
    return map;
}

function parseSelectedProductsField(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function mapSelectedProductsForOrder(order, productsById = {}) {
    const rawSelected = parseSelectedProductsField(order?.selectedProducts);
    return rawSelected.map((sel) => {
        const productMeta = productsById[sel.productId];
        const wixImage = sel.image || getProductWixImageFromMap(productsById, sel.productId) || null;
        const image = sel.imageUrl
            || convertWixImageUrl(wixImage, 200, 200, 75);
        const price = sel.price != null
            ? Number(sel.price) || 0
            : (productMeta && typeof productMeta === 'object' && productMeta.price != null
                ? Number(productMeta.price) || 0
                : 0);
        const difficulty = (typeof productMeta === 'object' && productMeta?.difficulty) || '';
        return {
            productId: sel.productId,
            quantity: Math.max(1, Number(sel.quantity) || 1),
            price,
            image: image || null,
            difficulty,
        };
    });
}

function mapSketch(sel, participantsForOrder, order, productWixImageById = {}) {
    const { includesChild, childrenCount } = resolveSketchChildInfo(sel, participantsForOrder, order);
    return {
        id: sel._id,
        img: resolveSketchDisplayImage(sel, productWixImageById),
        wixFileUrl: resolveSketchWixFileUrl(sel, productWixImageById),
        size: sel.canvasSize || '60x60',
        status: normalizeSketchStatus(sel.sketchStatus),
        source: sel.source || 'catalog',
        frameType: sel.frameType || null,
        rugIndex: sel.rugIndex,
        participantName: sel.participantName || null,
        participantId: sel.participantId || null,
        includesChild,
        childrenCount,
        // Carried back so staff mutations (updateSketchState) can pass it
        // as expectedUpdatedDate — lets the backend detect a concurrent
        // edit (another staff member / customer) since this data was loaded.
        updatedDate: sel._updatedDate ? new Date(sel._updatedDate).toISOString() : null,
    };
}

function sortSketchesByRugIndex(sketches) {
    return (sketches || []).slice().sort((a, b) => {
        const aIdx = a.rugIndex != null ? Number(a.rugIndex) : Number.MAX_SAFE_INTEGER;
        const bIdx = b.rugIndex != null ? Number(b.rugIndex) : Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
    });
}

function buildSketchLogContext(sel, participantsForOrder, order) {
    const participants = participantsForOrder || [];
    const sketchNum = sel.rugIndex != null && sel.rugIndex !== ''
        ? Number(sel.rugIndex) + 1
        : null;
    let groupName = (sel.participantName || '').trim();
    if (!groupName && sel.participantId) {
        const participant = participants.find((p) => p._id === sel.participantId);
        groupName = (participant?.name || '').trim();
    }
    if (!groupName) groupName = (order?.organizerName || '').trim();
    if (!groupName) groupName = 'קבוצה';
    const numLabel = sketchNum != null ? `סקיצה ${sketchNum}` : 'סקיצה';
    return `${groupName} · ${numLabel}`;
}

async function logSketchOrderAction(orderId, sel, actionText, userOverride) {
    const [participantsByOrderId, order] = await Promise.all([
        loadParticipantsForOrders([orderId]),
        getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'logSketchOrderAction' }),
    ]);
    const context = buildSketchLogContext(sel, participantsByOrderId[orderId], order);
    await logOrderAction(orderId, `${context} — ${actionText}`, userOverride);
}

function mapOrderLog(actionLog) {
    return (actionLog || []).map(entry => ({
        time: formatLogTime(entry.timestamp),
        user: entry.user || 'מערכת',
        action: entry.action || '',
    }));
}

/**
 * Access control lives entirely in the CMS: the logged-in member's email must
 * match a `Dashboard_Roles.userEmail` row, or `userId` (Reference →
 * privateMembersData). `connectedStaff` (Reference → Bookings/Staff) must be
 * set — used as presence check, not for email resolution.
 */
const MEMBER_FIELDSET_OPTIONS = { fieldsets: ['FULL'] };

async function getLoggedInMember() {
    return currentMember.getMember(MEMBER_FIELDSET_OPTIONS).catch(() => null);
}

function extractMemberEmail(member) {
    if (!member) return null;
    return member.loginEmail || member.contactDetails?.emails?.[0] || null;
}

function extractMemberName(member, email) {
    if (!member) return email || null;
    const fromContact = [member.contactDetails?.firstName, member.contactDetails?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
    if (fromContact) return fromContact;
    const nickname = (member.profile?.nickname || '').trim();
    if (nickname) return nickname;
    return email || null;
}

async function resolveStaffName(staffRef) {
    const staffId = refId(staffRef);
    if (!staffId) return null;
    try {
        const staff = await wixData.get('Bookings/Staff', staffId, SA);
        return staff?.name || null;
    } catch (_) {
        return null;
    }
}

async function findDashboardRoleForMember(member) {
    if (!member) return null;

    const email = extractMemberEmail(member);
    if (email) {
        const byEmail = await wixData.query('Dashboard_Roles').eq('userEmail', email).find(SA);
        if (byEmail.items?.[0]) return byEmail.items[0];
    }

    if (member._id) {
        const byUserId = await wixData.query('Dashboard_Roles').eq('userId', member._id).find(SA);
        if (byUserId.items?.[0]) return byUserId.items[0];
    }

    return null;
}

async function getCurrentDashboardRoleRecord(member) {
    const resolvedMember = member || await getLoggedInMember();
    if (!resolvedMember) return null;

    const role = await findDashboardRoleForMember(resolvedMember);
    if (!refId(role?.connectedStaff)) return null;

    return role;
}

async function assertDashboardAccess() {
    const role = await getCurrentDashboardRoleRecord();
    if (!role) {
        throw new Error('ACCESS_DENIED: This user is not registered in Dashboard_Roles.');
    }
    if (!hasPermission(role, 'viewDashboard')) {
        throw new Error('ACCESS_DENIED: User lacks viewDashboard permission.');
    }
    return role;
}

/**
 * Dashboard_Roles permissions — each capability is a dedicated boolean field on
 * the CMS row (viewDashboard, editSketchStatus, …). The legacy `permissions`
 * JSON object is still read as a fallback for rows not yet migrated.
 * Any key missing/undefined/null falls back to PERMISSION_DEFAULTS.
 *
 * PERMISSION_KEYS / PERMISSION_DEFAULTS moved to backend/staffRoles.js —
 * shared with employeeService.web.js (employee portal, Module F).
 */
function getRolePermissionValue(role, key) {
    if (!role) return PERMISSION_DEFAULTS[key] !== false;

    // New CMS structure: top-level boolean field on the Dashboard_Roles row.
    if (Object.prototype.hasOwnProperty.call(role, key)) {
        const direct = role[key];
        if (direct !== undefined && direct !== null) return !!direct;
    }

    // Legacy fallback: permissions JSON object (pre-migration rows).
    const perms = role.permissions;
    if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
        const legacy = perms[key];
        if (legacy !== undefined && legacy !== null) return !!legacy;
    }

    return PERMISSION_DEFAULTS[key] !== false;
}

/** Normalized permissions object for the dashboard UI (always booleans). */
function buildPermissionsFromRole(role) {
    const out = {};
    for (const key of PERMISSION_KEYS) {
        out[key] = getRolePermissionValue(role, key);
    }
    return out;
}

function hasPermission(role, key) {
    return getRolePermissionValue(role, key);
}

async function assertPermission(key) {
    const role = await assertDashboardAccess();
    if (!hasPermission(role, key)) {
        throw new Error(`PERMISSION_DENIED:${key}`);
    }
    return role;
}

/** Paginated load — default wixData.find() caps at 50 rows. */
async function loadPaidWorkshopOrdersInRange(startDate, endDate) {
    const items = [];
    let result = await wixData.query('WorkshopOrders')
        .eq('status', 'paid')
        .ge('workshopStart', startDate)
        .le('workshopStart', endDate)
        .ascending('workshopStart')
        .limit(100)
        .find(SA);
    items.push(...(result.items || []));
    while (typeof result.hasNext === 'function' && result.hasNext()) {
        result = await result.next();
        items.push(...(result.items || []));
    }
    return { items, queryReturned: items.length };
}

/** Authoritative workshop bucket key — CMS sessionId groups all ticket variants. */
function cmsWorkshopKey(order) {
    if (order.sessionId) return `sid:${order.sessionId}`;
    const t = order.workshopStart ? new Date(order.workshopStart).getTime() : null;
    if (t && !Number.isNaN(t) && order.serviceId) return `slot:${order.serviceId}_${t}`;
    return null;
}

function workshopIdFromCmsKey(cmsKey, sampleOrder) {
    if (sampleOrder?.sessionId) return sampleOrder.sessionId;
    return cmsKey.replace(/^(sid:|slot:)/, '');
}

function findCalendarSessionForOrder(order, idLookup, sessions) {
    if (order.sessionId && idLookup[order.sessionId]) {
        const id = idLookup[order.sessionId];
        return sessions.find((s) => s.id === id) || null;
    }
    const match = inspectOrderSessionMatch(order, { ...idLookup }, sessions);
    if (!match.resolvedId) return null;
    return sessions.find((s) => s.id === match.resolvedId) || null;
}

/** Pick the richest calendar slot metadata for a CMS order group. */
function pickCalendarSessionForOrderGroup(groupOrders, idLookup, sessions) {
    let best = null;
    for (const order of groupOrders) {
        const cal = findCalendarSessionForOrder(order, idLookup, sessions);
        if (!cal) continue;
        if (!best || (cal.totalSpots || 0) > (best.totalSpots || 0)) best = cal;
    }
    return best;
}

export const getInitialDashboardData = webMethod(Permissions.SiteMember, async (filters) => {
    const dashboardRole = await assertDashboardAccess();
    const canManageOrdersSystem = hasPermission(dashboardRole, 'manageOrdersSystem');
    const hasSketchSewingSkill = hasPermission(dashboardRole, 'sketchSewingSkill');
    const myStaffId = refId(dashboardRole.connectedStaff);
    const loggedInMember = await getLoggedInMember();
    const showOrderDebug = isOrderDebugUser(loggedInMember);

    const refreshOnly = !!filters?.refreshOnly;
    const now = new Date();
    const startDate = filters?.dateRangeStart ? new Date(filters.dateRangeStart) : now;
    const endDate = filters?.dateRangeEnd ? new Date(filters.dateRangeEnd) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    console.log(`[dashboardService] getInitialDashboardData${refreshOnly ? ' (refresh)' : ''}: range ${startDate.toISOString()} → ${endDate.toISOString()}`);

    const [{ typesMap, serviceIdToTypeId, allServiceIds }, staffNamesById] = await Promise.all([
        loadWorkshopTypes(),
        loadStaffNamesById(),
    ]);
    console.log(`[dashboardService] Loaded ${Object.keys(typesMap).length} workshop type(s), serviceIds:`, allServiceIds);
    console.log(`[dashboardService] Loaded ${Object.keys(staffNamesById).length} staff member(s):`, staffNamesById);

    const [{ sessions, idLookup }, ordersLoad] = await Promise.all([
        loadSessions(allServiceIds, startDate, endDate),
        loadPaidWorkshopOrdersInRange(startDate, endDate),
    ]);
    const orders = ordersLoad.items || [];
    const ordersQueryTotal = ordersLoad.queryReturned;
    const queryLimitHit = false;
    console.log(`[dashboardService] Loaded ${sessions.length} Bookings session(s) and ${orders.length} paid WorkshopOrders record(s) in range.`);
    if (!refreshOnly) console.warn('📦 [dashboardService] Raw WorkshopOrders from CMS:', orders);

    const orderIds = orders.map(o => o._id);
    const [sketchesByOrderId, participantsByOrderId, templatesResult, currentUser] = await Promise.all([
        loadSketchesForOrders(orderIds),
        loadParticipantsForOrders(orderIds),
        refreshOnly ? Promise.resolve(null) : wixData.query('WhatsApp_Templates').find(SA),
        refreshOnly ? Promise.resolve(null) : resolveCurrentDashboardUser(),
    ]);
    const totalSketches = Object.values(sketchesByOrderId).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[dashboardService] Loaded ${totalSketches} SketchSelections record(s) across ${Object.keys(sketchesByOrderId).length} order(s).`);

    const allSketchSelections = Object.values(sketchesByOrderId).flat();
    const allProductIds = [
        ...allSketchSelections.map((sel) => sel.productId),
        ...orders.flatMap((order) => parseSelectedProductsField(order.selectedProducts)
            .map((sel) => sel.productId)),
    ];
    const productWixImageById = await loadProductWixImagesById(allProductIds);

    // CMS sessionId is the authoritative grouping key. Orders that share a
    // sessionId must land on one workshop row even when they were booked via
    // different ticket/service variants (e.g. parent+child vs regular adult).
    const ordersByCmsKey = {};
    const unmatchedOrders = [];
    for (const order of orders) {
        const cmsKey = cmsWorkshopKey(order);
        if (!cmsKey) {
            unmatchedOrders.push({
                orderId: order._id,
                organizerName: order.organizerName || 'ללא שם',
                failReason: 'missing-sessionId-and-slot',
            });
            continue;
        }
        if (!ordersByCmsKey[cmsKey]) ordersByCmsKey[cmsKey] = [];
        ordersByCmsKey[cmsKey].push(order);
    }

    const workshopSessions = [];
    const ordersBySessionId = {};
    const orderMatchLog = [];

    for (const [cmsKey, groupOrders] of Object.entries(ordersByCmsKey)) {
        const sample = groupOrders[0];
        const workshopId = workshopIdFromCmsKey(cmsKey, sample);
        const calSession = pickCalendarSessionForOrderGroup(groupOrders, idLookup, sessions);
        const start = sample.workshopStart
            ? new Date(sample.workshopStart)
            : (calSession?.start || null);

        if (sample.sessionId) idLookup[sample.sessionId] = workshopId;
        if (calSession) {
            idLookup[calSession.id] = workshopId;
            if (calSession.sessionId) idLookup[calSession.sessionId] = workshopId;
            if (calSession.eventId) idLookup[calSession.eventId] = workshopId;
        }

        workshopSessions.push({
            id: workshopId,
            sessionId: sample.sessionId || calSession?.sessionId || null,
            eventId: calSession?.eventId || null,
            serviceId: sample.serviceId || calSession?.serviceId || null,
            start,
            end: calSession?.end || null,
            totalSpots: calSession?.totalSpots || 0,
            openSpots: calSession?.openSpots || 0,
            staffId: calSession?.staffId || null,
            isSynthetic: !calSession,
            cmsKey,
        });

        ordersBySessionId[workshopId] = groupOrders;
        for (const order of groupOrders) {
            orderMatchLog.push({
                orderId: order._id,
                storedSessionId: order.sessionId,
                resolvedSessionId: workshopId,
                matchMethod: 'cms-sessionId',
                serviceId: order.serviceId,
                workshopStart: order.workshopStart,
                organizerName: order.organizerName,
            });
        }
    }

    console.warn('🔗 [dashboardService] Order → session matching (CMS sessionId first):', orderMatchLog);
    if (unmatchedOrders.length) {
        console.warn(`⚠️ [dashboardService] ${unmatchedOrders.length} paid WorkshopOrders missing sessionId/slot key:`, unmatchedOrders);
    }

    const ecomBuyerByOrderId = refreshOnly ? {} : await loadEcomBuyerByOrderId(orders);

    const workshopRows = [];
    const dashboardOrders = [];
    let missingSketchesCount = 0;
    const alertWorkshopIds = [];
    // Instructor per session — used to scope workshops/orders to the logged-in
    // employee's own sessions when they lack the manageOrdersSystem permission.
    const sessionStaffMap = {};

    for (const session of workshopSessions) {
        const sessionId = session.id;
        sessionStaffMap[sessionId] = session.staffId || null;
        const typeId = serviceIdToTypeId[session.serviceId] || 'unknown';
        const typeInfo = typesMap[typeId] || typesMap.unknown;

        const sessionOrders = ordersBySessionId[sessionId] || [];
        let totalSketchesNeeded = 0;
        let sketchesReady = 0;
        let sketchesSelected = 0;
        let cmsCapacity = 0;

        for (const order of sessionOrders) {
            const isCancelled = !!order.cancelledAt;
            const isCandles = isCandlesOrder(order);
            const isCeramics = isCeramicsOrder(order);
            const orderParticipants = participantsByOrderId[order._id] || [];
            const organizer = enrichOrganizerFields(order, orderParticipants, ecomBuyerByOrderId[order._id]);
            const adults = order.adults || 0;
            const children = order.children || 0;
            const selectedProducts = mapSelectedProductsForOrder(order, productWixImageById);
            const sketches = sortSketchesByRugIndex(
                (sketchesByOrderId[order._id] || []).map((sel) => mapSketch(sel, orderParticipants, order, productWixImageById))
            );
            if (!isCancelled) {
                cmsCapacity += adults + children;
                if (isCandles) {
                    // Candles orders track cups (no readiness state) — takes precedence
                    // over the type's requiresSketch flag.
                    const cupQty = selectedProducts.reduce((sum, cup) => sum + (Number(cup.quantity) || 1), 0);
                    totalSketchesNeeded += order.rugCount || 0;
                    sketchesSelected += cupQty;
                    sketchesReady += cupQty;
                } else if (typeInfo.requiresSketch) {
                    // rugCount is the authoritative "how many rugs this group ordered" —
                    // sketches.length only reflects selections created so far.
                    totalSketchesNeeded += Math.max(sketches.length, order.rugCount || 0);
                    sketchesSelected += sketches.filter(s => !!s.img).length;
                    sketchesReady += sketches.filter(s => s.status === SKETCH_STATUS.READY).length;
                }
            }

            dashboardOrders.push({
                id: order._id,
                workshopId: sessionId,
                workshopType: order.workshopType || (isCandles ? 'candles' : isCeramics ? 'ceramics' : 'tufting'),
                selectionMode: order.selectionMode || null,
                organizerName: organizer.organizerName,
                organizerEmail: organizer.organizerEmail,
                organizerPhone: organizer.organizerPhone,
                adults,
                children,
                hasAdultAndChild: adults > 0 && children > 0,
                quantity: adults + children,
                rugCount: order.rugCount || 0,
                orderStatus: order.cancelledAt ? 'cancelled' : 'active',
                customerNotes: order.customerNotes || '',
                notes: order.internalNotes || '',
                logs: mapOrderLog(order.actionLog),
                sketches,
                selectedProducts,
                participantGroups: orderParticipants.map(p => ({
                    id: p._id,
                    name: p.name || '',
                    phone: p.phone || p.rawPhone || '',
                    childrenCount: p.childrenCount || 0,
                    hasChildren: !!p.hasChildren,
                })),
                ecomOrderId: order.ecomOrderId || null,
                paidTotal: order.paidTotal || order.basePrice || 0,
                paidDiscount: order.paidDiscount || 0,
                couponCode: order.couponCode || null,
                couponName: order.couponName || null,
            });
        }

        // Hour-based (not day-rounded) so a session 47h away isn't pushed to
        // "2 days" and accidentally excluded/included at the wrong boundary.
        const hoursToStart = session.start ? hoursUntil(session.start) : null;
        const tracksSelectionProgress = typeInfo.requiresSketch || totalSketchesNeeded > 0;
        const inAlertWindow = tracksSelectionProgress && hoursToStart !== null && hoursToStart >= 0 && hoursToStart <= 6 * 24;
        const hasMissingAlert = inAlertWindow && sketchesSelected < totalSketchesNeeded;
        const hasNotReadyAlert = typeInfo.requiresSketch && inAlertWindow && sketchesReady < totalSketchesNeeded;
        const hasAlert = hasMissingAlert;
        const isUrgent = (hasMissingAlert || hasNotReadyAlert) && hoursToStart <= 48;
        if (hasMissingAlert || hasNotReadyAlert) {
            missingSketchesCount += Math.max(0, totalSketchesNeeded - sketchesSelected);
            alertWorkshopIds.push(sessionId);
        }

        const groupsCount = countSessionGroups(sessionOrders, participantsByOrderId);
        workshopRows.push({
            id: sessionId,
            type: typeId,
            title: typeInfo.title,
            date: formatDateIL(session.start),
            time: formatTimeIL(session.start),
            endTime: formatTimeIL(session.end),
            startTimestamp: session.start ? session.start.getTime() : null,
            maxCapacity: session.isSynthetic ? cmsCapacity : session.totalSpots,
            // currentCapacity is the REAL headcount from Wix Bookings (includes legacy,
            // non-CMS bookings). cmsCapacity counts only participants from WorkshopOrders
            // CMS records — used as the default display until "show all orders" is on.
            currentCapacity: session.isSynthetic ? cmsCapacity : (session.totalSpots - session.openSpots),
            cmsCapacity,
            groupsCount,
            allGroupsCount: groupsCount,
            waitlist: 0,
            instructors: session.staffId && staffNamesById[session.staffId] ? [staffNamesById[session.staffId]] : [],
            totalSketchesNeeded,
            sketchesSelected,
            sketchesReady,
            hasAlert,
            hasNotReadyAlert,
            isUrgent,
        });
    }

    // --- Legacy orders: real Wix Bookings for these services/range that have no
    // matching WorkshopOrders CMS record (i.e. not made via the new flow).
    // Only fetched when the dashboard's "show all orders" toggle is on.
    const legacyGroupsBySessionId = {};
    if (filters?.includeAllOrders) {
        const coveredBookingIds = new Set(orders.flatMap(o => o.bookingIds || []));
        const allServiceBookings = await loadAllServiceBookings(allServiceIds, startDate, endDate);
        let legacyOrdersCount = 0;
        for (const extBooking of allServiceBookings) {
            const booking = extBooking.booking;
            if (!booking?._id || coveredBookingIds.has(booking._id)) continue;
            const slot = booking.bookedEntity?.slot || {};
            const resolvedId = idLookup[slot.eventId] || idLookup[slot.sessionId];
            if (!resolvedId) continue;
            dashboardOrders.push(buildLegacyOrder(booking, resolvedId));
            legacyGroupsBySessionId[resolvedId] = (legacyGroupsBySessionId[resolvedId] || 0) + 1;
            legacyOrdersCount++;
        }
        console.log(`[dashboardService] Found ${legacyOrdersCount} legacy booking(s) (not in WorkshopOrders CMS, deduped by bookingId) out of ${allServiceBookings.length} total booking(s) checked.`);
    }

    // Default view: only workshop slots that have at least one WorkshopOrders CMS
    // record. "Show all" adds slots that have legacy (non-CMS) bookings too.
    // Empty calendar slots with zero bookings are never shown.
    for (const w of workshopRows) {
        w.allGroupsCount = w.groupsCount + (legacyGroupsBySessionId[w.id] || 0);
    }
    const visibleWorkshopRows = workshopRows.filter(w =>
        filters?.includeAllOrders ? w.allGroupsCount > 0 : w.groupsCount > 0
    );

    // CMS workshop type ids that map to tufting Bookings services — used so
    // sketch-sewing staff can see all tufting workshops, not only their own slots.
    const tuftingTypeIds = new Set(
        Object.values(TUFTING_SERVICE_IDS)
            .map((sid) => serviceIdToTypeId[sid])
            .filter(Boolean),
    );

    // Employees without manageOrdersSystem see workshops where they're the
    // instructor, plus all tufting workshops when they hold sketchSewingSkill.
    const scopedWorkshopRows = canManageOrdersSystem
        ? visibleWorkshopRows
        : visibleWorkshopRows.filter((w) => {
            const isOwnSession = myStaffId && sessionStaffMap[w.id] === myStaffId;
            const isTufting = tuftingTypeIds.has(w.type);
            return isOwnSession || (hasSketchSewingSkill && isTufting);
        });

    // Recompute alerts against the scoped workshop set only.
    missingSketchesCount = 0;
    alertWorkshopIds.length = 0;
    for (const w of scopedWorkshopRows) {
        if (!w.hasAlert && !w.hasNotReadyAlert) continue;
        missingSketchesCount += Math.max(0, (w.totalSketchesNeeded || 0) - (w.sketchesSelected || 0));
        alertWorkshopIds.push(w.id);
    }

    // Nearest date/time first — sessions with no resolvable start date sink
    // to the bottom rather than breaking the sort.
    scopedWorkshopRows.sort((a, b) => {
        if (a.startTimestamp === null) return 1;
        if (b.startTimestamp === null) return -1;
        return a.startTimestamp - b.startTimestamp;
    });
    console.log('[dashboardService] Per-workshop alert flags:', scopedWorkshopRows.map(w => ({ id: w.id, date: w.date, time: w.time, hasAlert: w.hasAlert, isUrgent: w.isUrgent, sketches: `${w.sketchesReady}/${w.totalSketchesNeeded}` })));

    // Same scoping for orders — plus, for non-managers, strip payment/coupon
    // details and the Wix eCom order id (used by the UI to build the
    // "open in Wix" link) so that data never leaves the backend for them.
    const scopedWorkshopIds = new Set(scopedWorkshopRows.map(w => w.id));
    let scopedOrders = canManageOrdersSystem
        ? dashboardOrders
        : dashboardOrders.filter(o => scopedWorkshopIds.has(o.workshopId));
    if (!canManageOrdersSystem) {
        scopedOrders = scopedOrders.map(({ paidTotal, paidDiscount, couponCode, couponName, ecomOrderId, ...rest }) => rest);
    }

    const templates = templatesResult
        ? (templatesResult.items || [])
            .map(mapTemplateRow)
            .filter(t => t.use === TEMPLATE_USE.ORDERS)
        : undefined;
    if (!refreshOnly) console.log(`[dashboardService] Loaded ${(templates || []).length} WhatsApp template(s).`);
    if (!refreshOnly) console.log('[dashboardService] Resolved current dashboard user:', currentUser);
    console.log(`[dashboardService] getInitialDashboardData done: ${scopedWorkshopRows.length} workshop(s), ${scopedOrders.length} order(s), ${missingSketchesCount} missing sketch(es) across ${alertWorkshopIds.length} alerted workshop(s).`);
    if (!refreshOnly) console.warn('🧾 [dashboardService] Dashboard orders (UI-ready, with sketches):', scopedOrders);

    return {
        refreshOnly,
        workshopTypes: typesMap,
        workshops: scopedWorkshopRows,
        orders: scopedOrders,
        ...(templates ? { templates } : {}),
        alertsSummary: { count: missingSketchesCount, workshopIds: alertWorkshopIds },
        ...(currentUser ? { currentUser } : {}),
        includeAllOrders: !!filters?.includeAllOrders,
        ...(showOrderDebug ? {
            ordersDebug: {
                queryReturned: orders.length,
                queryTotal: ordersQueryTotal,
                queryLimitHit,
                unmatched: unmatchedOrders,
            },
        } : {}),
    };
});

async function resolveCurrentDashboardUser() {
    try {
        const member = await getLoggedInMember();
        if (!member) return { name: null, email: null, role: null, permissions: null, userId: null, showOrderDebug: false };

        const email = extractMemberEmail(member);
        const roleRecord = await getCurrentDashboardRoleRecord(member);
        const permissions = roleRecord ? buildPermissionsFromRole(roleRecord) : null;
        const role = roleRecord?.roleType || roleRecord?.role || null;

        let name = extractMemberName(member, email);
        if (!name && roleRecord?.connectedStaff) {
            name = await resolveStaffName(roleRecord.connectedStaff);
        }
        if (!name) name = email;

        return {
            name: name || null,
            email: email || null,
            role,
            permissions,
            userId: member._id || null,
            showOrderDebug: isOrderDebugUser(member),
        };
    } catch (err) {
        console.error('[dashboardService] resolveCurrentDashboardUser error:', err?.message || err);
        return { name: null, email: null, role: null, permissions: null, userId: null, showOrderDebug: false };
    }
}

export const getCurrentDashboardUser = webMethod(Permissions.SiteMember, async () => {
    await assertDashboardAccess();
    return resolveCurrentDashboardUser();
});

const DEBUG_SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isWorkshopStartInRange(workshopStart, startDate, endDate) {
    if (!workshopStart) return false;
    const t = new Date(workshopStart).getTime();
    if (Number.isNaN(t)) return false;
    return t >= startDate.getTime() && t <= endDate.getTime();
}

async function loadSiblingWorkshopOrders(order) {
    const queries = [];
    if (order.sessionId) {
        queries.push(
            wixData.query('WorkshopOrders').eq('sessionId', order.sessionId).limit(100).find(SA)
                .catch(() => ({ items: [] }))
        );
    }
    if (order.workshopStart && order.serviceId) {
        const t = new Date(order.workshopStart).getTime();
        queries.push(
            wixData.query('WorkshopOrders')
                .eq('serviceId', order.serviceId)
                .ge('workshopStart', new Date(t - SESSION_MATCH_TOLERANCE_MS))
                .le('workshopStart', new Date(t + SESSION_MATCH_TOLERANCE_MS))
                .limit(100)
                .find(SA)
                .catch(() => ({ items: [] }))
        );
    }
    const results = await Promise.all(queries);
    const byId = new Map();
    for (const result of results) {
        for (const item of (result.items || [])) byId.set(item._id, item);
    }
    return [...byId.values()];
}

function mapDebugParticipant(p) {
    return {
        id: p._id,
        name: p.name || '',
        phone: p.phone || p.rawPhone || '',
        childrenCount: p.childrenCount || 0,
        cancelledAt: p.cancelledAt || null,
        orderId: p.orderId || null,
    };
}

function expectedUiGroupCount(order, participants) {
    const active = (participants || []).filter((p) => !p.cancelledAt);
    if (order.selectionMode === 'participants' && active.length > 0) return active.length;
    return order.cancelledAt ? 0 : 1;
}

/** On-demand CMS + session-match report. Accepts WorkshopOrders or WorkshopParticipants _id. */
export const debugOrderMatch = webMethod(Permissions.SiteMember, async (orderId) => {
    await assertDashboardAccess();
    const member = await getLoggedInMember();
    if (!isOrderDebugUser(member)) {
        throw new Error('PERMISSION_DENIED:orderDebug');
    }
    if (!orderId) throw new Error('MISSING_ORDER_ID');

    let lookedUpFrom = 'order';
    let lookupParticipant = null;
    let order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'debugOrderMatch' });
    if (!order) {
        lookupParticipant = await getItemWithRetry('WorkshopParticipants', orderId, { callerLabel: 'debugOrderMatch.participant' });
        if (lookupParticipant?.orderId) {
            lookedUpFrom = 'participant';
            order = await getItemWithRetry('WorkshopOrders', lookupParticipant.orderId, { callerLabel: 'debugOrderMatch.parentOrder' });
        }
    }
    if (!order) {
        return {
            ok: false,
            orderId,
            error: 'ORDER_NOT_FOUND',
            diagnosis: [{ code: 'not-found', text: 'המזהה לא נמצא ב-WorkshopOrders ולא ב-WorkshopParticipants.' }],
        };
    }

    const siblingOrders = await loadSiblingWorkshopOrders(order);
    const siblingIds = siblingOrders.map((o) => o._id);
    const [{ allServiceIds }, participantsByOrderId, sketchesByOrderId] = await Promise.all([
        loadWorkshopTypes(),
        loadParticipantsForOrders(siblingIds.length ? siblingIds : [order._id]),
        loadSketchesForOrders([order._id]),
    ]);
    const participants = participantsByOrderId[order._id] || [];
    const sketches = sketchesByOrderId[order._id] || [];

    const now = new Date();
    const workshopStart = order.workshopStart ? new Date(order.workshopStart) : null;
    const windowCenter = workshopStart && !Number.isNaN(workshopStart.getTime()) ? workshopStart : now;
    const startDate = new Date(windowCenter.getTime() - DEBUG_SESSION_WINDOW_MS);
    const endDate = new Date(windowCenter.getTime() + DEBUG_SESSION_WINDOW_MS);
    const { sessions, idLookup } = await loadSessions(allServiceIds, startDate, endDate);
    const match = inspectOrderSessionMatch(order, idLookup, sessions);

    const dashboardStart = now;
    const dashboardEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const inDefaultDashboardRange = isWorkshopStartInRange(order.workshopStart, dashboardStart, dashboardEnd);

    const nearbySessions = sessions
        .filter((s) => !order.serviceId || s.serviceId === order.serviceId)
        .map((s) => {
            const orderTs = workshopStart && !Number.isNaN(workshopStart.getTime()) ? workshopStart.getTime() : null;
            const diffMs = orderTs && s.start ? Math.abs(s.start.getTime() - orderTs) : null;
            return summarizeSession(s, { diffMs });
        })
        .sort((a, b) => (a.diffMs ?? Infinity) - (b.diffMs ?? Infinity))
        .slice(0, 8);

    const siblingReports = siblingOrders.map((sibling) => {
        const siblingMatch = inspectOrderSessionMatch(sibling, idLookup, sessions);
        const siblingParticipants = participantsByOrderId[sibling._id] || [];
        const uiGroups = expectedUiGroupCount(sibling, siblingParticipants);
        return {
            orderId: sibling._id,
            isCurrent: sibling._id === order._id,
            organizerName: sibling.organizerName || 'ללא שם',
            status: sibling.status || null,
            cancelledAt: sibling.cancelledAt || null,
            selectionMode: sibling.selectionMode || null,
            adults: sibling.adults || 0,
            children: sibling.children || 0,
            participantCount: siblingParticipants.filter((p) => !p.cancelledAt).length,
            uiGroups,
            appearsInUi: sibling.status === 'paid' && !sibling.cancelledAt && !!siblingMatch.resolvedId,
            matchMethod: siblingMatch.method,
            failReason: siblingMatch.failReason || null,
            resolvedSessionId: siblingMatch.resolvedId,
        };
    });

    const diagnosis = buildOrderMatchDiagnosis({
        order,
        participants,
        match,
        inDateRange: inDefaultDashboardRange,
        queryLimitHit: false,
    });
    if (lookedUpFrom === 'participant') {
        diagnosis.unshift({
            code: 'looked-up-participant',
            text: `המזהה שהוזן הוא קבוצה ב-WorkshopParticipants ("${lookupParticipant.name || 'ללא שם'}"). ההזמנה האב: ${order._id}.`,
        });
    }

    const hiddenSiblings = siblingReports.filter((s) => !s.isCurrent && !s.appearsInUi);
    const visibleSiblings = siblingReports.filter((s) => !s.isCurrent && s.appearsInUi);
    const uiGroupsHere = expectedUiGroupCount(order, participants);
    diagnosis.push({
        code: 'ui-count',
        text: `בטבלה הזמנה זו אמורה להופיע כ-${uiGroupsHere} קבוצה. בסשן הזה יש ${siblingReports.length} הזמנות CMS: ${visibleSiblings.length + (match.resolvedId && order.status === 'paid' && !order.cancelledAt ? 1 : 0)} יופיעו, ${hiddenSiblings.length + (!(match.resolvedId && order.status === 'paid' && !order.cancelledAt) ? 1 : 0)} יוסתרו.`,
    });
    for (const hidden of hiddenSiblings) {
        const why = hidden.status !== 'paid'
            ? `סטטוס ${hidden.status}`
            : hidden.cancelledAt
                ? 'מבוטלת'
                : hidden.failReason || 'לא הותאמה לסשן';
        diagnosis.push({
            code: 'hidden-sibling',
            text: `הזמנת אחות חסרה ב-UI: ${hidden.organizerName} (${hidden.orderId}) — ${why}.`,
        });
    }

    return {
        ok: true,
        orderId: order._id,
        lookedUpFrom,
        lookupId: orderId,
        cms: {
            id: order._id,
            status: order.status || null,
            sessionId: order.sessionId || null,
            serviceId: order.serviceId || null,
            workshopStart: order.workshopStart || null,
            workshopStartLabel: order.workshopStart
                ? `${formatDateIL(order.workshopStart)} ${formatTimeIL(order.workshopStart)}`
                : null,
            selectionMode: order.selectionMode || null,
            adults: order.adults || 0,
            children: order.children || 0,
            rugCount: order.rugCount || 0,
            cancelledAt: order.cancelledAt || null,
            organizerName: order.organizerName || '',
            organizerEmail: order.organizerEmail || '',
            organizerPhone: order.organizerPhone || '',
            ecomOrderId: order.ecomOrderId || null,
            bookingIds: order.bookingIds || [],
        },
        match: {
            resolvedSessionId: match.resolvedId,
            method: match.method,
            failReason: match.failReason || null,
            storedSessionId: match.storedId,
            timeDiffMs: match.timeDiffMs ?? null,
            closestSession: match.closestSession || null,
            inDefaultDashboardRange,
            sessionsLoaded: sessions.length,
            uiGroups: uiGroupsHere,
        },
        participants: participants.map(mapDebugParticipant),
        siblingOrders: siblingReports,
        sketchesCount: sketches.length,
        nearbySessions,
        diagnosis,
    };
});

async function logOrderAction(orderId, action, userOverride) {
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'logOrderAction' });
    if (!order) return;

    let userName = userOverride;
    if (!userName) {
        const current = await resolveCurrentDashboardUser();
        userName = current.name || current.email || 'מערכת';
    }

    const timestamp = new Date().toISOString();
    console.log(`[dashboardService] ${formatLogTime(timestamp)} • ${userName}: ${action}`);

    const entry = { timestamp, user: userName, action };
    const actionLog = [entry, ...(order.actionLog || [])].slice(0, 200);
    await wixData.update('WorkshopOrders', { ...order, actionLog }, SA);
}

export const updateSketchState = webMethod(Permissions.SiteMember, async (orderId, sketchId, newStatus, options) => {
    const role = await assertPermission('editSketchStatus');
    console.log(`[dashboardService] updateSketchState: order=${orderId} sketch=${sketchId} newStatus="${newStatus}"`);

    if (!SKETCH_STATUSES.includes(newStatus)) {
        throw new Error(`INVALID_STATUS:${newStatus}`);
    }

    if (newStatus === SKETCH_STATUS.REJECTED && !hasPermission(role, 'rejectSketchStatus')) {
        throw new Error('PERMISSION_DENIED:rejectSketchStatus');
    }

    const sel = await wixData.get('SketchSelections', sketchId, SA);
    if (!sel) throw new Error('Sketch not found');

    if (options?.expectedUpdatedDate && sel._updatedDate) {
        const expected = new Date(options.expectedUpdatedDate).getTime();
        const actual = new Date(sel._updatedDate).getTime();
        if (expected !== actual) {
            throw new Error('CONFLICT:Sketch was modified by someone else — please refresh.');
        }
    }

    if (newStatus === SKETCH_STATUS.REJECTED) {
        const updated = await wixData.update('SketchSelections', {
            ...sel,
            sketchImage: null,
            sketchWixFileUrl: null,
            productId: null,
            productSnapshot: null,
            sketchStatus: SKETCH_STATUS.OPEN,
            isLocked: false,
        }, SA);

        await logSketchOrderAction(orderId, sel, 'לא מאושרת לביצוע — הסקיצה נמחקה', options?.user);

        if (options?.sendWhatsApp && options?.customMessage) {
            try {
                const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'updateSketchState(whatsapp)' });
                const targetPhone = normalizePhone(order?.organizerPhone);
                if (targetPhone) {
                    await sendGreenApiWhatsApp(targetPhone, options.customMessage);
                    await logSketchOrderAction(orderId, sel, 'נשלחה הודעת WhatsApp — סקיצה לא מאושרת', options?.user);
                }
            } catch (err) {
                console.error('[dashboardService] updateSketchState WhatsApp alert failed:', err?.message || err);
            }
        }

        return { sketch: mapSketch(updated, (await loadParticipantsForOrders([orderId]))[orderId], await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'updateSketchState(rejected)' }), await loadProductWixImagesById([updated.productId])) };
    }

    const updated = await wixData.update('SketchSelections', {
        ...sel,
        sketchStatus: newStatus,
        isLocked: isLockedStatus(newStatus),
    }, SA);

    await logSketchOrderAction(orderId, sel, `סטטוס שונה ל"${newStatus}"`, options?.user);

    const [participantsByOrderId, orderRecord, productWixImageById] = await Promise.all([
        loadParticipantsForOrders([orderId]),
        getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'updateSketchState' }),
        loadProductWixImagesById([updated.productId]),
    ]);
    return { sketch: mapSketch(updated, participantsByOrderId[orderId], orderRecord, productWixImageById) };
});

export const deleteSketchImage = webMethod(Permissions.SiteMember, async (orderId, sketchId, options) => {
    await assertPermission('deleteSketchImage');
    console.log(`[dashboardService] deleteSketchImage: order=${orderId} sketch=${sketchId}`);

    const sel = await wixData.get('SketchSelections', sketchId, SA);
    if (!sel) throw new Error('Sketch not found');

    const updated = await wixData.update('SketchSelections', {
        ...sel,
        sketchImage: null,
        sketchWixFileUrl: null,
        productId: null,
        productSnapshot: null,
        sketchStatus: SKETCH_STATUS.OPEN,
        isLocked: false,
    }, SA);

    await logSketchOrderAction(orderId, sel, 'תמונת הסקיצה נמחקה על ידי העובד', options?.user);
    const [participantsByOrderId, orderRecord] = await Promise.all([
        loadParticipantsForOrders([orderId]),
        getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'deleteSketchImage' }),
    ]);
    return { sketch: mapSketch(updated, participantsByOrderId[orderId], orderRecord) };
});

export const updateOrderInternalNotes = webMethod(Permissions.SiteMember, async (orderId, text, options) => {
    await assertPermission('editOrderNotes');

    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'updateOrderInternalNotes' });
    if (!order) throw new Error('Order not found');
    await wixData.update('WorkshopOrders', { ...order, internalNotes: text || '' }, SA);
    await logOrderAction(orderId, 'הערות פנימיות עודכנו', options?.user);
    return { success: true };
});

export const sendDashboardWhatsApp = webMethod(Permissions.SiteMember, async (orderId, phone, templateId, customMessage, options) => {
    await assertPermission('sendWhatsApp');
    console.log(`[dashboardService] sendDashboardWhatsApp: order=${orderId} phone=${phone} templateId=${templateId || '(custom message)'}`);

    const targetPhone = normalizePhone(phone);
    if (!targetPhone) throw new Error('Invalid phone number');

    let message = customMessage;
    if (!message && templateId) {
        const template = await wixData.get('WhatsApp_Templates', templateId, SA);
        message = template?.messageBody || '';
    }
    if (!message) throw new Error('No message content to send');

    await sendGreenApiWhatsApp(targetPhone, message);
    await logOrderAction(orderId, `הודעת WhatsApp נשלחה ל-${targetPhone}`, options?.user);
    return { success: true };
});

export const getTemplates = webMethod(Permissions.SiteMember, async () => {
    await assertDashboardAccess();

    const result = await wixData.query('WhatsApp_Templates').find(SA);
    return (result.items || [])
        .map(mapTemplateRow)
        .filter(t => t.use === TEMPLATE_USE.ORDERS);
});

export const saveTemplate = webMethod(Permissions.SiteMember, async (template) => {
    await assertPermission('manageTemplates');

    const use = assertTemplateUse(template?.use, TEMPLATE_USE.ORDERS);
    const data = {
        title: template.title,
        messageBody: template.body,
        isSystem: !!template.isSystem,
        use,
    };
    let saved;
    if (template.id) {
        const existing = await wixData.get('WhatsApp_Templates', template.id, SA);
        if (!existing) throw new Error('Template not found');
        if (resolveTemplateUse(existing) !== TEMPLATE_USE.ORDERS) {
            throw new Error('Cannot edit an employee-system template from the orders dashboard');
        }
        saved = await wixData.update('WhatsApp_Templates', { ...existing, ...data }, SA);
    } else {
        saved = await wixData.insert('WhatsApp_Templates', data, SA);
    }
    return mapTemplateRow(saved);
});

export const deleteTemplate = webMethod(Permissions.SiteMember, async (templateId) => {
    await assertPermission('manageTemplates');

    const existing = await wixData.get('WhatsApp_Templates', templateId, SA);
    if (!existing) throw new Error('Template not found');
    if (existing.isSystem) throw new Error('Cannot delete a system template');
    await wixData.remove('WhatsApp_Templates', templateId, SA);
    return { success: true };
});

/** Resolves a Wix media file URL for download (never a public CDN URL). */
async function resolveSketchDownloadFileUrl(fileUrl, sketchId) {
    const trimmed = String(fileUrl || '').trim();
    if (trimmed.startsWith('wix:image://')) return trimmed;

    if (!sketchId) return null;

    const sel = await wixData.get('SketchSelections', sketchId, SA);
    if (!sel) return null;

    const productWixImageById = await loadProductWixImagesById([sel.productId]);
    return resolveSketchWixFileUrl(sel, productWixImageById);
}

export const getSketchDownloadUrl = webMethod(Permissions.SiteMember, async (fileUrl, options) => {
    await assertDashboardAccess();

    const wixFileUrl = await resolveSketchDownloadFileUrl(fileUrl, options?.sketchId);
    if (!wixFileUrl) {
        throw new Error('INVALID_FILE_URL: Sketch image requires a Wix media file URL (wix:image://).');
    }

    const expirationTime = options?.expirationTime != null ? Number(options.expirationTime) : null;
    const downloadedFileName = options?.downloadedFileName ? String(options.downloadedFileName) : null;
    const expiredTokenRedirectUrl = options?.expiredTokenRedirectUrl
        ? String(options.expiredTokenRedirectUrl)
        : null;

    const downloadUrl = await mediaManager.getDownloadUrl(
        wixFileUrl,
        expirationTime,
        downloadedFileName,
        expiredTokenRedirectUrl,
    );
    if (!downloadUrl) {
        throw new Error('DOWNLOAD_URL_UNAVAILABLE');
    }
    return downloadUrl;
});

/**
 * One-time backfill: populate WorkshopOrders.sketches multi-reference from
 * existing SketchSelections.orderId values. Safe to re-run — inserting an
 * existing reference is a no-op on Wix Data's side.
 */
export const backfillOrderSketchesReferences = webMethod(Permissions.SiteMember, async () => {
    await assertDashboardAccess();

    const ordersResult = await wixData.query('WorkshopOrders').find(SA);
    let linked = 0;
    let failed = 0;
    for (const order of (ordersResult.items || [])) {
        const sketchesResult = await wixData.query('SketchSelections').eq('orderId', order._id).find(SA);
        for (const sel of (sketchesResult.items || [])) {
            try {
                await wixData.insertReference('WorkshopOrders', 'sketches', order._id, sel._id, SA);
                linked++;
            } catch (err) {
                failed++;
                console.error('[dashboardService] backfill insertReference failed:', order._id, sel._id, err?.message || err);
            }
        }
    }
    return { linked, failed };
});