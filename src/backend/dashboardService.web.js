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

const SA = { suppressAuth: true };
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

    const uniqueByCanonical = new Map();
    const idLookup = {};

    for (const entries of allResults) {
        for (const entry of entries) {
            const slot = entry.slot || {};
            const canonicalId = slot.eventId || slot.sessionId;
            if (!canonicalId) continue;

            if (!uniqueByCanonical.has(canonicalId)) {
                uniqueByCanonical.set(canonicalId, {
                    id: canonicalId,
                    sessionId: slot.sessionId || null,
                    eventId: slot.eventId || null,
                    serviceId: slot.serviceId,
                    start: slot.startDate ? new Date(slot.startDate) : null,
                    end: slot.endDate ? new Date(slot.endDate) : null,
                    totalSpots: entry.totalSpots || 0,
                    openSpots: entry.openSpots || 0,
                    staffId: slot.resource?._id || null,
                });
            }

            if (slot.sessionId) idLookup[slot.sessionId] = canonicalId;
            if (slot.eventId) idLookup[slot.eventId] = canonicalId;
            idLookup[canonicalId] = canonicalId;
        }
    }

    return { sessions: [...uniqueByCanonical.values()], idLookup };
}

const SESSION_MATCH_TOLERANCE_MS = 5 * 60 * 1000;

/** Resolves a WorkshopOrders row to the canonical Bookings session id. */
function resolveOrderSessionId(order, idLookup, sessions) {
    const storedId = order.sessionId;
    if (storedId && idLookup[storedId]) return idLookup[storedId];

    const orderStart = order.workshopStart ? new Date(order.workshopStart).getTime() : null;
    if (!orderStart || !order.serviceId) return null;

    for (const session of sessions) {
        if (session.serviceId !== order.serviceId || !session.start) continue;
        if (Math.abs(session.start.getTime() - orderStart) <= SESSION_MATCH_TOLERANCE_MS) {
            // Cache the legacy stored id so subsequent lookups are direct.
            if (storedId) idLookup[storedId] = session.id;
            return session.id;
        }
    }
    return null;
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
                    startDate: { $gte: startDate.toISOString(), $lte: endDate.toISOString() },
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

function resolveSketchWixFileUrl(sel, productWixImageById = {}) {
    const snapshot = parseProductSnapshot(sel?.productSnapshot);
    const candidates = [
        sel?.sketchWixFileUrl,
        snapshot?.wixFileUrl,
        snapshot?.image,
        sel?.sketchImage,
        sel?.productId ? productWixImageById[sel.productId] : null,
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
        sel?.productId ? productWixImageById[sel.productId] : null,
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
        const image = String(product?.image || '').trim();
        if (image) map[product._id] = image;
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
        const product = productsById[sel.productId];
        const wixImage = sel.image || product?.image || null;
        const image = sel.imageUrl
            || convertWixImageUrl(wixImage, 200, 200, 75);
        const price = sel.price != null
            ? Number(sel.price) || 0
            : (product ? parseFloat(product.productName) || 0 : 0);
        return {
            productId: sel.productId,
            quantity: Math.max(1, Number(sel.quantity) || 1),
            price,
            image: image || null,
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
        wixData.get('WorkshopOrders', orderId, SA),
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

export const getInitialDashboardData = webMethod(Permissions.SiteMember, async (filters) => {
    await assertDashboardAccess();

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

    const [{ sessions, idLookup }, ordersResult] = await Promise.all([
        loadSessions(allServiceIds, startDate, endDate),
        wixData.query('WorkshopOrders')
            .eq('status', 'paid')
            .ge('workshopStart', startDate)
            .le('workshopStart', endDate)
            .find(SA),
    ]);
    const orders = ordersResult.items || [];
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

    // Group orders by resolved session id (handles sessionId/eventId mismatch + datetime fallback).
    const ordersBySessionId = {};
    const orderMatchLog = [];
    for (const order of orders) {
        const resolvedId = resolveOrderSessionId(order, idLookup, sessions);
        orderMatchLog.push({
            orderId: order._id,
            storedSessionId: order.sessionId,
            resolvedSessionId: resolvedId,
            serviceId: order.serviceId,
            workshopStart: order.workshopStart,
            organizerName: order.organizerName,
        });
        if (!resolvedId) continue;
        if (!ordersBySessionId[resolvedId]) ordersBySessionId[resolvedId] = [];
        ordersBySessionId[resolvedId].push(order);
    }
    console.warn('🔗 [dashboardService] Order → session matching:', orderMatchLog);

    const ecomBuyerByOrderId = refreshOnly ? {} : await loadEcomBuyerByOrderId(orders);

    const workshopRows = [];
    const dashboardOrders = [];
    let missingSketchesCount = 0;
    const alertWorkshopIds = [];

    for (const session of sessions) {
        const sessionId = session.id;
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
                workshopType: order.workshopType || (isCandles ? 'candles' : 'tufting'),
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
            maxCapacity: session.totalSpots,
            // currentCapacity is the REAL headcount from Wix Bookings (includes legacy,
            // non-CMS bookings). cmsCapacity counts only participants from WorkshopOrders
            // CMS records — used as the default display until "show all orders" is on.
            currentCapacity: session.totalSpots - session.openSpots,
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

    // Recompute alerts against the visible workshop set only.
    missingSketchesCount = 0;
    alertWorkshopIds.length = 0;
    for (const w of visibleWorkshopRows) {
        if (!w.hasAlert && !w.hasNotReadyAlert) continue;
        missingSketchesCount += Math.max(0, (w.totalSketchesNeeded || 0) - (w.sketchesSelected || 0));
        alertWorkshopIds.push(w.id);
    }

    // Nearest date/time first — sessions with no resolvable start date sink
    // to the bottom rather than breaking the sort.
    visibleWorkshopRows.sort((a, b) => {
        if (a.startTimestamp === null) return 1;
        if (b.startTimestamp === null) return -1;
        return a.startTimestamp - b.startTimestamp;
    });
    console.log('[dashboardService] Per-workshop alert flags:', visibleWorkshopRows.map(w => ({ id: w.id, date: w.date, time: w.time, hasAlert: w.hasAlert, isUrgent: w.isUrgent, sketches: `${w.sketchesReady}/${w.totalSketchesNeeded}` })));

    const templates = templatesResult
        ? (templatesResult.items || []).map(t => ({ id: t._id, title: t.title, body: t.messageBody, isSystem: !!t.isSystem }))
        : undefined;
    if (!refreshOnly) console.log(`[dashboardService] Loaded ${(templates || []).length} WhatsApp template(s).`);
    if (!refreshOnly) console.log('[dashboardService] Resolved current dashboard user:', currentUser);
    console.log(`[dashboardService] getInitialDashboardData done: ${visibleWorkshopRows.length} workshop(s), ${dashboardOrders.length} order(s), ${missingSketchesCount} missing sketch(es) across ${alertWorkshopIds.length} alerted workshop(s).`);
    if (!refreshOnly) console.warn('🧾 [dashboardService] Dashboard orders (UI-ready, with sketches):', dashboardOrders);

    return {
        refreshOnly,
        workshopTypes: typesMap,
        workshops: visibleWorkshopRows,
        orders: dashboardOrders,
        ...(templates ? { templates } : {}),
        alertsSummary: { count: missingSketchesCount, workshopIds: alertWorkshopIds },
        ...(currentUser ? { currentUser } : {}),
        includeAllOrders: !!filters?.includeAllOrders,
    };
});

async function resolveCurrentDashboardUser() {
    try {
        const member = await getLoggedInMember();
        if (!member) return { name: null, email: null, role: null, permissions: null };

        const email = extractMemberEmail(member);
        const roleRecord = await getCurrentDashboardRoleRecord(member);
        const permissions = roleRecord ? buildPermissionsFromRole(roleRecord) : null;
        const role = roleRecord?.roleType || roleRecord?.role || null;

        let name = extractMemberName(member, email);
        if (!name && roleRecord?.connectedStaff) {
            name = await resolveStaffName(roleRecord.connectedStaff);
        }
        if (!name) name = email;

        return { name: name || null, email: email || null, role, permissions };
    } catch (err) {
        console.error('[dashboardService] resolveCurrentDashboardUser error:', err?.message || err);
        return { name: null, email: null, role: null, permissions: null };
    }
}

export const getCurrentDashboardUser = webMethod(Permissions.SiteMember, async () => {
    await assertDashboardAccess();
    return resolveCurrentDashboardUser();
});

async function logOrderAction(orderId, action, userOverride) {
    const order = await wixData.get('WorkshopOrders', orderId, SA);
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
                const order = await wixData.get('WorkshopOrders', orderId, SA);
                const targetPhone = normalizePhone(order?.organizerPhone);
                if (targetPhone) {
                    await sendGreenApiWhatsApp(targetPhone, options.customMessage);
                    await logSketchOrderAction(orderId, sel, 'נשלחה הודעת WhatsApp — סקיצה לא מאושרת', options?.user);
                }
            } catch (err) {
                console.error('[dashboardService] updateSketchState WhatsApp alert failed:', err?.message || err);
            }
        }

        return { sketch: mapSketch(updated, (await loadParticipantsForOrders([orderId]))[orderId], await wixData.get('WorkshopOrders', orderId, SA), await loadProductWixImagesById([updated.productId])) };
    }

    const updated = await wixData.update('SketchSelections', {
        ...sel,
        sketchStatus: newStatus,
        isLocked: isLockedStatus(newStatus),
    }, SA);

    await logSketchOrderAction(orderId, sel, `סטטוס שונה ל"${newStatus}"`, options?.user);

    const [participantsByOrderId, orderRecord, productWixImageById] = await Promise.all([
        loadParticipantsForOrders([orderId]),
        wixData.get('WorkshopOrders', orderId, SA),
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
        wixData.get('WorkshopOrders', orderId, SA),
    ]);
    return { sketch: mapSketch(updated, participantsByOrderId[orderId], orderRecord) };
});

export const updateOrderInternalNotes = webMethod(Permissions.SiteMember, async (orderId, text, options) => {
    await assertPermission('editOrderNotes');

    const order = await wixData.get('WorkshopOrders', orderId, SA);
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
    return (result.items || []).map(t => ({ id: t._id, title: t.title, body: t.messageBody, isSystem: !!t.isSystem }));
});

export const saveTemplate = webMethod(Permissions.SiteMember, async (template) => {
    await assertPermission('manageTemplates');

    const data = { title: template.title, messageBody: template.body, isSystem: !!template.isSystem };
    let saved;
    if (template.id) {
        const existing = await wixData.get('WhatsApp_Templates', template.id, SA);
        if (!existing) throw new Error('Template not found');
        saved = await wixData.update('WhatsApp_Templates', { ...existing, ...data }, SA);
    } else {
        saved = await wixData.insert('WhatsApp_Templates', data, SA);
    }
    return { id: saved._id, title: saved.title, body: saved.messageBody, isSystem: !!saved.isSystem };
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