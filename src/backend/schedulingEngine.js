/**
 * Scheduling engine (Modules B+C) — internal module, no web methods.
 *
 * Capacity model (per user spec):
 * - Required instructors per day/workshop-type derive from paid WorkshopOrders
 *   participants and the SchedulingRules ratios (client-editable).
 * - Day availability is personalized per employee skills: a day is OPEN only
 *   if some workshop that day matching the employee's skills still needs
 *   instructors; skill-matched but full → STANDBY (waiting list); no skill
 *   match at all → submission rejected; no workshops → FREE (studio work).
 * - Waiting list is FIFO. Offers escalate hourly; exhausted/empty queue →
 *   OPEN_CALL banner (skill-matched employees) + WhatsApp to managers.
 *
 * Collections: ShiftAssignments, ShiftOffers (specs in plan).
 */
import wixData from 'wix-data';
import { auth } from '@wix/essentials';
import { extendedBookings } from '@wix/bookings';
import { availabilityCalendar } from 'wix-bookings.v2';
import { publish } from 'wix-realtime-backend';
import {
    SUBMISSION_STATUS, toDateKey, normalizeSettings, DEFAULT_WORK_TYPE,
    shiftHours as computeShiftHours, validateShiftWithinShortDay, SHIFT_MIN_TIME, SHIFT_MAX_TIME,
} from 'backend/availabilityRules.js';
import { refIds, getRolePermissionValue, attachSkillsToRoles } from 'backend/staffRoles.js';
import { sendGreenApiWhatsApp } from 'backend/whatsappService.jsw';
import { enqueueNotification, enqueueManagerNotification, flushOutbox, PRIORITY } from 'backend/notificationOutbox.js';
import { maybeSuppressForPendingBacklog } from 'backend/pendingItemsQuery.js';
import { maybeSuppressManagerNotification } from 'backend/managerPendingQuery.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const PORTAL_URL = 'https://www.studiohappy.art/employee-portal';
const elevatedQueryExtendedBookings = auth.elevate(extendedBookings.queryExtendedBookings);

export const ASSIGNMENT_STATUS = { STANDBY: 'STANDBY', APPROVED: 'APPROVED', CANCELLED: 'CANCELLED' };
export const OFFER_KIND = { WAITLIST_OFFER: 'WAITLIST_OFFER', OPEN_CALL: 'OPEN_CALL' };
export const OFFER_STATUS = { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', DECLINED: 'DECLINED', EXPIRED: 'EXPIRED', OPEN: 'OPEN', FILLED: 'FILLED' };
export const DAY_STATE = { FREE: 'FREE', OPEN: 'OPEN', WAITLIST: 'WAITLIST', NO_SKILL: 'NO_SKILL' };

export const OFFER_TTL_MS = 60 * 60 * 1000; // 1h FIFO escalation window

const REALTIME_CHANNEL = { name: 'scheduling-updates' };

export function publishSchedulingUpdate(reason, extra = {}) {
    return publish(REALTIME_CHANNEL, { reason, ...extra, ts: Date.now() })
        .catch(err => console.warn('[schedulingEngine] realtime publish failed:', err?.message || err));
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadSettings() {
    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA).catch(() => ({ items: [] }));
    const raw = result.items?.[0] || null;
    return {
        ...normalizeSettings(raw),
        holidays: parseHolidays(raw?.holidays),
        dayNotes: parseDayNotes(raw?.dayNotes),
        sketchSewingDays: parseSketchSewingDays(raw?.sketchSewingDays),
        _rawId: raw?._id || null,
    };
}

function parseHolidays(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.filter(h => h && h.date);
        } catch (_) { /* ignore */ }
    }
    return [];
}

/** { "<dateKey>": { message, updatedBy, updatedAt } } — manager notes on calendar days. */
function parseDayNotes(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) { /* ignore */ }
    }
    return {};
}

/** { "<dateKey>": { startTime, endTime, confirmedOverlap, updatedBy, updatedAt } } — manager-defined "sketch sewing" days, gated by the sketchSewingSkill flag. */
function parseSketchSewingDays(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) { /* ignore */ }
    }
    return {};
}

export async function loadWorkshopTypeMap() {
    const result = await wixData.query('workshops').find(SA).catch(() => ({ items: [] }));
    const typesById = {};
    const serviceIdToTypeId = {};
    for (const item of (result.items || [])) {
        typesById[item._id] = { id: item._id, name: item.workshopName || 'סדנה' };
        for (const sid of String(item.serviceIds || '').split(',').map(s => s.trim()).filter(Boolean)) {
            serviceIdToTypeId[sid] = item._id;
        }
    }
    return { typesById, serviceIdToTypeId };
}

/**
 * Per-workshop-type instructor capacity models.
 * - SIMPLE: legacy linear ratio (adults/ppi + children/pcpi), used as the
 *   fallback for any workshop type without a dedicated model (e.g. ceramics).
 * - TUFTING: pairs-only groups get a richer pair-per-instructor ratio; mixed
 *   groups (any solo adult present) fall back to a people ratio, but the
 *   pair count is still capped per instructor so a solo rug joining a full
 *   pair group forces a second instructor.
 * - CANDLES: instructor load is driven by "stations" (each solo adult,
 *   parent+child pair, or standalone extra child = 1 station); a stricter
 *   pair-only cap applies on top since a full 7 stations of pairs would
 *   overload a single instructor even though the station math allows it.
 * - TOTAL_CAP: flat headcount ceiling split between adults/children
 *   (jewelry, charms) — ready for when those workshops get paid-order data.
 */
export const RULE_TYPES = { SIMPLE: 'SIMPLE', TUFTING: 'TUFTING', CANDLES: 'CANDLES', TOTAL_CAP: 'TOTAL_CAP' };

/** Known workshop-type IDs → default ruleType, used until a manager overrides it. */
export const DEFAULT_RULE_TYPE_BY_WORKSHOP_ID = {
    'd20eb0d0-0485-4e91-8ed9-ca6812a0ed12': RULE_TYPES.TUFTING, // טאפטינג
    '4572e26f-37ae-45c6-a767-5b49ee144bb4': RULE_TYPES.CANDLES, // נרות
    'a5ac42ec-80d3-447a-801c-08fe8e74e0a3': RULE_TYPES.TOTAL_CAP, // תכשיטים
    'bd7f339d-ea8a-4adf-a7c1-15ff042f1558': RULE_TYPES.TOTAL_CAP, // צ'ארמס
    'ee5072ec-3389-496c-917d-bc39a498ba54': RULE_TYPES.SIMPLE, // צביעה בקרמיקה
};

/** Default field values per ruleType — used whenever a SchedulingRules row is missing a field (or missing entirely). */
export const RULE_DEFAULTS = {
    [RULE_TYPES.SIMPLE]: { participantsPerInstructor: 8, parentChildParticipantsPerInstructor: 6, minInstructors: 1 },
    [RULE_TYPES.TUFTING]: { maxPeoplePerInstructor: 8, maxPairsMixed: 2, maxPairsOnly: 4, minInstructors: 1 },
    [RULE_TYPES.CANDLES]: { maxStationsPerInstructor: 7, maxPairStations: 5, minInstructors: 1 },
    [RULE_TYPES.TOTAL_CAP]: { maxAdults: 8, maxChildren: 6, minInstructors: 1 },
};

const posNum = (v, fallback) => (Number(v) > 0 ? Number(v) : fallback);

/**
 * Full capacity ruleset for every known workshop type (from `workshops` CMS),
 * merging manager-editable SchedulingRules overrides on top of ruleType defaults.
 * Every workshop type always gets an entry, even without a SchedulingRules row.
 */
export async function loadRulesByTypeId(typesById) {
    const result = await wixData.query('SchedulingRules').limit(500).find(SA).catch(() => ({ items: [] }));
    const rowsByTypeId = {};
    for (const r of (result.items || [])) {
        if (r.active === false || !r.workshopTypeId) continue;
        rowsByTypeId[r.workshopTypeId] = r;
    }

    const allTypeIds = new Set([
        ...Object.keys(typesById || {}),
        ...Object.keys(rowsByTypeId),
        ...Object.keys(DEFAULT_RULE_TYPE_BY_WORKSHOP_ID),
    ]);

    const map = {};
    for (const workshopTypeId of allTypeIds) {
        const row = rowsByTypeId[workshopTypeId] || null;
        const ruleType = row?.ruleType || DEFAULT_RULE_TYPE_BY_WORKSHOP_ID[workshopTypeId] || RULE_TYPES.SIMPLE;
        const defaults = RULE_DEFAULTS[ruleType] || RULE_DEFAULTS[RULE_TYPES.SIMPLE];

        const rule = { id: row?._id || null, workshopTypeId, ruleType };
        for (const [key, fallback] of Object.entries(defaults)) {
            rule[key] = posNum(row?.[key], fallback);
        }
        map[workshopTypeId] = rule;
    }
    return map;
}

/**
 * @param {object} rule - a ruleset from loadRulesByTypeId (has .ruleType + its own fields).
 * @param {{adults?:number, children?:number, pairs?:number, soloAdults?:number, extraChildren?:number, people?:number}} comp
 *   Per-day/type composition, aggregated per-order (pairs/soloAdults/extraChildren must be
 *   summed per-order — min(adults,children) at the aggregate level would be wrong across
 *   multiple orders).
 */
export function requiredInstructorsFor(rule, comp) {
    const c = comp || {};
    const adults = c.adults || 0;
    const children = c.children || 0;
    const pairs = c.pairs || 0;
    const soloAdults = c.soloAdults != null ? c.soloAdults : Math.max(0, adults - pairs);
    const extraChildren = c.extraChildren != null ? c.extraChildren : Math.max(0, children - pairs);
    const people = c.people != null ? c.people : adults + children;
    const minInstructors = rule?.minInstructors > 0 ? rule.minInstructors : 1;

    let required;
    switch (rule?.ruleType) {
        case RULE_TYPES.TUFTING: {
            const r = { ...RULE_DEFAULTS[RULE_TYPES.TUFTING], ...rule };
            required = soloAdults === 0 && pairs > 0
                ? Math.ceil(pairs / r.maxPairsOnly)
                : Math.max(Math.ceil(people / r.maxPeoplePerInstructor), Math.ceil(pairs / r.maxPairsMixed));
            break;
        }
        case RULE_TYPES.CANDLES: {
            const r = { ...RULE_DEFAULTS[RULE_TYPES.CANDLES], ...rule };
            const stations = soloAdults + pairs + extraChildren;
            required = Math.max(Math.ceil(stations / r.maxStationsPerInstructor), Math.ceil(pairs / r.maxPairStations));
            break;
        }
        case RULE_TYPES.TOTAL_CAP: {
            const r = { ...RULE_DEFAULTS[RULE_TYPES.TOTAL_CAP], ...rule };
            required = Math.max(Math.ceil(adults / r.maxAdults), Math.ceil(children / r.maxChildren));
            break;
        }
        default: {
            const r = { ...RULE_DEFAULTS[RULE_TYPES.SIMPLE], ...rule };
            required = Math.ceil(adults / r.participantsPerInstructor + children / r.parentChildParticipantsPerInstructor);
        }
    }
    return Math.max(minInstructors, required || 0);
}

/** Active Dashboard_Roles rows; skills expanded when the field is a multi-ref. */
export async function loadActiveRoles() {
    const result = await wixData.query('Dashboard_Roles').ne('active', false).limit(1000).find(SA).catch(() => ({ items: [] }));
    return attachSkillsToRoles(result.items || []);
}

function dateRangeFilter(query, fromKey, toKey) {
    // Padded range + exact dateKey matching downstream (Israel/UTC safe).
    const start = new Date(`${fromKey}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(`${toKey}T23:59:59Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
}

async function loadPaidOrders(fromKey, toKey) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const items = [];
    let skip = 0;
    const pageSize = 1000;
    while (true) {
        const result = await wixData.query('WorkshopOrders')
            .eq('status', 'paid')
            .ge('workshopStart', start).le('workshopStart', end)
            .ascending('workshopStart')
            .skip(skip).limit(pageSize).find(SA).catch(() => ({ items: [] }));
        const batch = (result.items || []).filter(o => !o.cancelledAt);
        items.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
    }
    return items;
}

/** Active Wix Bookings (non-cancelled) — supplements paid WorkshopOrders for demand detection. */
async function loadActiveWixBookings(fromKey, toKey, serviceIdToTypeId) {
    const serviceIds = Object.keys(serviceIdToTypeId || {});
    if (!serviceIds.length) return [];

    const startDate = new Date(`${fromKey}T00:00:00Z`);
    const endDate = new Date(`${toKey}T23:59:59Z`);
    const rows = [];
    let cursor = null;

    try {
        do {
            // Wix Bookings API: filter/sort cannot be sent together with a cursor
            // once paging past the first page (the cursor already encodes them).
            const request = cursor
                ? { cursorPaging: { limit: 100, cursor } }
                : {
                    filter: {
                        'bookedEntity.item.slot.serviceId': { $in: serviceIds },
                        $and: [
                            { startDate: { $gte: startDate.toISOString() } },
                            { startDate: { $lte: endDate.toISOString() } },
                        ],
                    },
                    cursorPaging: { limit: 100 },
                };
            const response = await elevatedQueryExtendedBookings(request);
            for (const ext of (response.extendedBookings || [])) {
                const booking = ext.booking;
                if (!booking?._id || booking.status === 'CANCELED') continue;
                const slot = booking.bookedEntity?.slot || booking.bookedEntity?.item?.slot || {};
                const serviceId = slot.serviceId;
                const typeId = serviceIdToTypeId[serviceId];
                const startRaw = booking.startDate || slot.startDate;
                if (!serviceId || !typeId || !startRaw) continue;
                const dateKey = toDateKey(startRaw);
                if (dateKey < fromKey || dateKey > toKey) continue;
                const qty = Math.max(1, Number(booking.totalParticipants) || 1);
                rows.push({
                    bookingId: booking._id,
                    dateKey,
                    typeId,
                    adults: qty,
                    children: 0,
                    startIso: new Date(startRaw).toISOString(),
                });
            }
            cursor = response.pagingMetadata?.cursors?.next || null;
        } while (cursor);
    } catch (err) {
        console.warn('[schedulingEngine] Wix Bookings load failed:', err?.message || err);
    }
    return rows;
}

/** Scheduled Bookings slots — used so the calendar shows workshops even before paid orders exist. */
async function loadBookingsSessions(fromKey, toKey, serviceIdToTypeId) {
    const serviceIds = Object.keys(serviceIdToTypeId || {});
    if (!serviceIds.length) return [];

    const startDate = new Date(`${fromKey}T00:00:00Z`);
    const endDate = new Date(`${toKey}T23:59:59Z`);
    const options = { slotsPerDay: 100 };
    const rows = [];

    await Promise.all(serviceIds.map(async (serviceId) => {
        try {
            const query = {
                filter: {
                    serviceId,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                },
            };
            const availability = await availabilityCalendar.queryAvailability(query, options);
            for (const entry of (availability.availabilityEntries || [])) {
                const slot = entry.slot || {};
                if (!slot.startDate) continue;
                const dateKey = toDateKey(slot.startDate);
                if (dateKey < fromKey || dateKey > toKey) continue;
                const typeId = serviceIdToTypeId[slot.serviceId || serviceId];
                if (!typeId) continue;
                rows.push({
                    dateKey,
                    typeId,
                    startIso: new Date(slot.startDate).toISOString(),
                    endIso: slot.endDate ? new Date(slot.endDate).toISOString() : null,
                });
            }
        } catch (err) {
            console.warn(`[schedulingEngine] Bookings sessions load failed for ${serviceId}:`, err?.message || err);
        }
    }));

    return rows;
}

async function loadSubmissions(fromKey, toKey, consistent) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const result = await wixData.query('AvailabilitySubmissions')
        .ne('status', SUBMISSION_STATUS.REJECTED)
        .ge('date', start).le('date', end)
        .ascending('_createdDate')
        .limit(1000).find(consistent ? SAC : SA).catch(() => ({ items: [] }));
    return result.items || [];
}

async function loadAssignments(fromKey, toKey, consistent) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const result = await wixData.query('ShiftAssignments')
        .ne('status', ASSIGNMENT_STATUS.CANCELLED)
        .ge('date', start).le('date', end)
        .limit(1000).find(consistent ? SAC : SA).catch(() => ({ items: [] }));
    return result.items || [];
}

async function loadOffers(fromKey, toKey) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const result = await wixData.query('ShiftOffers')
        .ge('date', start).le('date', end)
        .limit(1000).find(SAC).catch(() => ({ items: [] }));
    return result.items || [];
}

// ---------------------------------------------------------------------------
// Board — per-day / per-workshop-type capacity picture
// ---------------------------------------------------------------------------

/** Rounds an ISO start time to the minute so calendar slots and order timestamps bucket together. */
export function canonicalSessionKey(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return null;
    return new Date(Math.floor(ms / 60000) * 60000).toISOString();
}

const EMPTY_SESSION_COMP = { adults: 0, children: 0, pairs: 0, soloAdults: 0, extraChildren: 0, people: 0 };

function mergeSessionComp(into, from) {
    into.adults += from.adults || 0;
    into.children += from.children || 0;
    into.pairs += from.pairs || 0;
    into.soloAdults += from.soloAdults || 0;
    into.extraChildren += from.extraChildren || 0;
    into.people += from.people || 0;
}

/** Collapses duplicate session keys (calendar vs orders) and re-keys sessionComps/sessionEnds. */
function normalizeTypeSessions(t) {
    const mergedComps = {};
    for (const [rawKey, comp] of Object.entries(t.sessionComps || {})) {
        const key = canonicalSessionKey(rawKey);
        if (!key) continue;
        if (!mergedComps[key]) mergedComps[key] = { ...EMPTY_SESSION_COMP };
        mergeSessionComp(mergedComps[key], comp);
    }
    const mergedEnds = {};
    for (const [rawKey, endIso] of Object.entries(t.sessionEnds || {})) {
        const key = canonicalSessionKey(rawKey);
        if (key && endIso) mergedEnds[key] = endIso;
    }
    t.sessionComps = mergedComps;
    t.sessionEnds = mergedEnds;
    t.sessions = [...new Set([
        ...t.sessions.map(s => canonicalSessionKey(s)).filter(Boolean),
        ...Object.keys(mergedComps),
    ])].sort();
}

/**
 * @returns {Promise<{
 *   days: Object<string, { hasWorkshops: boolean, types: Object<string, {
 *     typeId: string, name: string, adults: number, children: number,
 *     pairs: number, soloAdults: number, extraChildren: number, people: number,
 *     required: number, activeCount: number,
 *     standbyQueue: Array<{submissionId: string, employeeId: string, createdAt: Date}>,
 *     assignedCount: number, assignedEmployeeIds: string[]
 *   }> }>,
 *   skillsByRoleId: Object<string, string[]>,
 *   rolesById: Object<string, object>,
 *   typesById: Object<string, {id: string, name: string}>,
 *   rules: Object<string, object>,
 *   offers: object[]
 * }>}
 */
export async function buildBoard(fromKey, toKey, { consistent = false, includeOffers = false } = {}) {
    const { typesById, serviceIdToTypeId } = await loadWorkshopTypeMap();
    const [rules, roles, orders, submissions, assignments, offers, sessionRows, wixBookings] = await Promise.all([
        loadRulesByTypeId(typesById),
        loadActiveRoles(),
        loadPaidOrders(fromKey, toKey),
        loadSubmissions(fromKey, toKey, consistent),
        loadAssignments(fromKey, toKey, consistent),
        includeOffers ? loadOffers(fromKey, toKey) : Promise.resolve([]),
        loadBookingsSessions(fromKey, toKey, serviceIdToTypeId),
        loadActiveWixBookings(fromKey, toKey, serviceIdToTypeId),
    ]);

    const rolesById = {};
    const skillsByRoleId = {};
    for (const r of roles) {
        rolesById[r._id] = r;
        skillsByRoleId[r._id] = refIds(r.skills);
    }

    const days = {};
    const dayType = (dateKey, typeId) => {
        if (!days[dateKey]) days[dateKey] = { hasWorkshops: false, types: {} };
        if (!days[dateKey].types[typeId]) {
            days[dateKey].types[typeId] = {
                typeId,
                name: typesById[typeId]?.name || 'סדנה',
                adults: 0, children: 0, required: 0,
                // Composition accumulated per-order (see requiredInstructorsFor):
                // pairs = Σ min(order.adults, order.children); soloAdults/extraChildren
                // are the remainder on each side; people = adults+children.
                pairs: 0, soloAdults: 0, extraChildren: 0, people: 0,
                activeCount: 0, standbyQueue: [],
                assignedCount: 0, assignedEmployeeIds: [],
                sessions: [], // distinct workshopStart ISO timestamps that day (calendar display)
                sessionEnds: {}, // startIso -> endIso, resolved from Bookings availability where known
                sessionComps: {}, // startIso -> per-session participant composition (for split occupancy UI)
                hasActiveCustomers: false, // true when paid WorkshopOrders or live Wix Bookings exist
            };
        }
        return days[dateKey].types[typeId];
    };

    const coveredBookingIds = new Set();
    const bumpSessionComp = (t, startIso, orderAdults, orderChildren) => {
        const key = canonicalSessionKey(startIso);
        if (!key) return;
        if (!t.sessionComps[key]) t.sessionComps[key] = { ...EMPTY_SESSION_COMP };
        const sc = t.sessionComps[key];
        const orderPairs = Math.min(orderAdults, orderChildren);
        sc.adults += orderAdults;
        sc.children += orderChildren;
        sc.pairs += orderPairs;
        sc.soloAdults += orderAdults - orderPairs;
        sc.extraChildren += orderChildren - orderPairs;
        sc.people += orderAdults + orderChildren;
    };
    for (const order of orders) {
        for (const id of (order.bookingIds || [])) if (id) coveredBookingIds.add(id);
        if (order.bookingId) coveredBookingIds.add(order.bookingId);
        const dateKey = toDateKey(order.workshopStart);
        const typeId = serviceIdToTypeId[order.serviceId];
        if (!dateKey || !typeId || dateKey < fromKey || dateKey > toKey) continue;
        const t = dayType(dateKey, typeId);
        const orderAdults = order.adults || 0;
        const orderChildren = order.children || 0;
        const orderPairs = Math.min(orderAdults, orderChildren);
        t.adults += orderAdults;
        t.children += orderChildren;
        t.pairs += orderPairs;
        t.soloAdults += orderAdults - orderPairs;
        t.extraChildren += orderChildren - orderPairs;
        t.people += orderAdults + orderChildren;
        const startIso = order.workshopStart instanceof Date ? order.workshopStart.toISOString() : new Date(order.workshopStart).toISOString();
        bumpSessionComp(t, startIso, orderAdults, orderChildren);
        const sessionKey = canonicalSessionKey(startIso);
        if (sessionKey && !t.sessions.includes(sessionKey)) t.sessions.push(sessionKey);
        days[dateKey].hasWorkshops = true;
    }

    for (const b of wixBookings) {
        if (coveredBookingIds.has(b.bookingId)) continue;
        const t = dayType(b.dateKey, b.typeId);
        const orderPairs = Math.min(b.adults, b.children);
        t.adults += b.adults;
        t.children += b.children;
        t.pairs += orderPairs;
        t.soloAdults += b.adults - orderPairs;
        t.extraChildren += b.children - orderPairs;
        t.people += b.adults + b.children;
        bumpSessionComp(t, b.startIso, b.adults, b.children);
        const sessionKey = canonicalSessionKey(b.startIso);
        if (sessionKey && !t.sessions.includes(sessionKey)) t.sessions.push(sessionKey);
        days[b.dateKey].hasWorkshops = true;
    }

    for (const { dateKey, typeId, startIso, endIso } of sessionRows) {
        const t = dayType(dateKey, typeId);
        const sessionKey = canonicalSessionKey(startIso);
        if (sessionKey && !t.sessions.includes(sessionKey)) t.sessions.push(sessionKey);
        if (sessionKey && endIso) t.sessionEnds[sessionKey] = new Date(endIso).toISOString();
        days[dateKey].hasWorkshops = true;
    }

    for (const dateKey of Object.keys(days)) {
        for (const t of Object.values(days[dateKey].types)) {
            normalizeTypeSessions(t);
            t.hasActiveCustomers = (t.people || 0) > 0;
            t.required = requiredInstructorsFor(rules[t.typeId], t);
        }
    }

    for (const a of assignments) {
        const dateKey = a.dateKey || toDateKey(a.date);
        if (!dateKey || dateKey < fromKey || dateKey > toKey || !a.workshopTypeId) continue;
        const t = dayType(dateKey, a.workshopTypeId);
        t.assignedCount++;
        if (a.employeeId) t.assignedEmployeeIds.push(a.employeeId);
    }

    for (const s of submissions) {
        const dateKey = toDateKey(s.date);
        if (!dateKey || dateKey < fromKey || dateKey > toKey) continue;
        const day = days[dateKey];
        if (!day) continue;
        const skills = skillsByRoleId[s.employeeId] || [];
        for (const typeId of Object.keys(day.types)) {
            if (!skills.includes(typeId)) continue;
            const t = day.types[typeId];
            if (s.status === SUBMISSION_STATUS.STANDBY) {
                t.standbyQueue.push({ submissionId: s._id, employeeId: s.employeeId, createdAt: s._createdDate });
            } else if (t.assignedEmployeeIds.includes(s.employeeId)) {
                // Already counted through the assignment row.
            } else {
                t.activeCount++;
            }
        }
    }

    return { days, skillsByRoleId, rolesById, typesById, rules, offers };
}

/** True when at least one paying/active customer exists for this workshop type on this day. */
export function typeHasActiveCustomers(t) {
    return !!t?.hasActiveCustomers;
}

/** Coverage per type: filled = assigned + not-yet-assigned active submissions. */
export function typeFilledCount(t) {
    return t.assignedCount + t.activeCount;
}

function sessionMsRanges(t) {
    return [...(t?.sessions || [])].map(start => {
        const startMs = new Date(start).getTime();
        if (Number.isNaN(startMs)) return null;
        const endRaw = t.sessionEnds?.[start];
        const endMs = endRaw ? new Date(endRaw).getTime() : startMs + 1;
        return { startMs, endMs: Number.isNaN(endMs) || endMs <= startMs ? startMs + 1 : endMs };
    }).filter(Boolean);
}

function sessionRangesOverlap(a, b) {
    return sessionMsRanges(a).some(r1 => sessionMsRanges(b).some(r2 => r1.startMs < r2.endMs && r2.startMs < r1.endMs));
}

/** Personalized day state for an employee's skills. */
export function personalDayState(day, skillTypeIds) {
    if (!day || !day.hasWorkshops) return DAY_STATE.FREE;
    const matched = Object.values(day.types).filter(t => skillTypeIds.includes(t.typeId));
    if (!matched.length) return DAY_STATE.NO_SKILL;
    return matched.some(t => typeFilledCount(t) < t.required) ? DAY_STATE.OPEN : DAY_STATE.WAITLIST;
}

/** Placement for a new submission at click time: SUBMITTED | STANDBY | null (no skill). */
export function resolvePlacement(day, skillTypeIds) {
    const state = personalDayState(day, skillTypeIds);
    if (state === DAY_STATE.FREE || state === DAY_STATE.OPEN) return SUBMISSION_STATUS.SUBMITTED;
    if (state === DAY_STATE.WAITLIST) return SUBMISSION_STATUS.STANDBY;
    return null;
}

// ---------------------------------------------------------------------------
// WhatsApp helpers
// ---------------------------------------------------------------------------

export async function notifyManagers(message, rolesById = null) {
    const roles = rolesById ? Object.values(rolesById) : await loadActiveRoles();
    const managers = roles.filter(r => getRolePermissionValue(r, 'manageScheduling') && r.phone);
    for (const m of managers) {
        await sendGreenApiWhatsApp(m.phone, message).catch(err =>
            console.error('[schedulingEngine] manager WhatsApp failed:', err?.message || err));
    }
    return managers.length;
}

function formatDateHe(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
    return `${dow}, ${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Waiting-list offers & open calls
// ---------------------------------------------------------------------------

function offersFor(offers, dateKey, typeId) {
    return offers.filter(o => (o.dateKey || toDateKey(o.date)) === dateKey && o.workshopTypeId === typeId);
}

/** Marks OPEN/PENDING offers as FILLED when a day/type is already fully staffed. */
export async function closeResolvedOffersForDate(dateKey) {
    if (!dateKey) return { closed: 0 };
    const board = await buildBoard(dateKey, dateKey, { consistent: true, includeOffers: true });
    let closed = 0;
    for (const t of Object.values(board.days[dateKey]?.types || {})) {
        if (typeFilledCount(t) < t.required) continue;
        for (const o of offersFor(board.offers, dateKey, t.typeId)) {
            if (o.status !== OFFER_STATUS.PENDING && o.status !== OFFER_STATUS.OPEN) continue;
            await wixData.update('ShiftOffers', { ...o, status: OFFER_STATUS.FILLED }, SA);
            closed++;
        }
    }
    return { closed };
}

/**
 * Ensures the day/type shortage is being handled: pending offer to next FIFO
 * standby, or an open call when the queue is exhausted/empty.
 */
async function ensureShortageHandled(dateKey, t, board, { batchNotify = false } = {}) {
    const existing = offersFor(board.offers, dateKey, t.typeId);
    if (existing.some(o => o.status === OFFER_STATUS.PENDING || o.status === OFFER_STATUS.OPEN)) return null;

    const alreadyOffered = new Set(existing
        .filter(o => o.kind === OFFER_KIND.WAITLIST_OFFER)
        .map(o => o.employeeId).filter(Boolean));

    const queue = [...t.standbyQueue].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const next = queue.find(q =>
        !alreadyOffered.has(q.employeeId) && !t.assignedEmployeeIds.includes(q.employeeId));

    const base = {
        dateKey,
        date: new Date(`${dateKey}T12:00:00Z`),
        monthKey: dateKey.slice(0, 7),
        workshopTypeId: t.typeId,
        workshopName: t.name,
        notifiedAt: new Date(),
    };

    if (next) {
        const offer = await wixData.insert('ShiftOffers', {
            ...base,
            kind: OFFER_KIND.WAITLIST_OFFER,
            status: OFFER_STATUS.PENDING,
            employeeId: next.employeeId,
            submissionId: next.submissionId,
            expiresAt: new Date(Date.now() + OFFER_TTL_MS),
        }, SA);
        const role = board.rolesById[next.employeeId];
        if (role?.phone) {
            const suppressed = await maybeSuppressForPendingBacklog(role);
            if (!suppressed) {
                await enqueueNotification({
                    actionKey: 'employee_shift_offer_standby',
                    recipientId: role._id,
                    recipientPhone: role.phone,
                    priority: PRIORITY.NORMAL,
                    entityKey: `offer:${dateKey}:${t.typeId}:${role._id}`,
                    vars: {
                        displayName: role?.displayName || '',
                        workshopName: t.name,
                        date: formatDateHe(dateKey),
                        portalLink: PORTAL_URL,
                    },
                });
            }
        } else {
            console.warn(`[schedulingEngine] role ${role?._id} has no phone — skipping WhatsApp`);
        }
        board.offers.push(offer);
        return offer;
    }

    const call = await wixData.insert('ShiftOffers', {
        ...base,
        kind: OFFER_KIND.OPEN_CALL,
        status: OFFER_STATUS.OPEN,
        employeeId: null,
        submissionId: null,
        expiresAt: null,
    }, SA);
    const openCallLine = `סדנת ${t.name}, ${formatDateHe(dateKey)}`;
    await enqueueManagerNotification('manager_open_call', {
        workshopName: t.name,
        date: formatDateHe(dateKey),
    }, {
        priority: batchNotify ? PRIORITY.NORMAL : PRIORITY.URGENT,
        entityKey: `open-call:${dateKey}:${t.typeId}`,
        rolesById: board.rolesById,
        shouldSuppress: batchNotify ? undefined : maybeSuppressManagerNotification,
        digest: batchNotify ? { line: openCallLine, kind: 'open_call' } : undefined,
    });
    board.offers.push(call);
    return call;
}

// ---------------------------------------------------------------------------
// Engine run
// ---------------------------------------------------------------------------

/**
 * Auto-assigns SUBMITTED availability to workshops that already have active
 * customers (paid WorkshopOrders and/or live Wix Bookings), skill-matched,
 * then routes remaining shortages to waiting-list offers / open calls.
 *
 * Workshops scheduled on the calendar with zero customers are skipped — empty
 * slots stay pending until a booking arrives (processBookingPaid) or a manager
 * assigns manually.
 *
 * Fully disabled when the "אישור אוטומטי של משמרות" setting is OFF — in that
 * mode all submissions stay pending until a manager assigns them manually.
 */
export async function runScheduling(fromKey, toKey, { batchNotify = false } = {}) {
    const settings = await loadSettings();
    if (settings.autoApproveShifts === false) {
        console.log('[schedulingEngine] runScheduling skipped — autoApproveShifts is OFF (manual mode)');
        return { assigned: 0, offers: 0, openCalls: 0, skipped: 'manual-mode' };
    }
    const board = await buildBoard(fromKey, toKey, { consistent: true, includeOffers: true });
    const submissions = await loadSubmissions(fromKey, toKey, true);
    const subsById = {};
    for (const s of submissions) subsById[s._id] = s;

    const report = { assigned: 0, offers: 0, openCalls: 0 };
    const todayKey = toDateKey(new Date());

    for (const dateKey of Object.keys(board.days).sort()) {
        if (dateKey <= todayKey) continue;
        const day = board.days[dateKey];
        for (const t of Object.values(day.types)) {
            // No paying/active customers → never auto-approve for this workshop.
            if (!typeHasActiveCustomers(t)) continue;

            let shortage = t.required - t.assignedCount;
            if (shortage <= 0) {
                for (const o of offersFor(board.offers, dateKey, t.typeId)) {
                    if (o.status !== OFFER_STATUS.PENDING && o.status !== OFFER_STATUS.OPEN) continue;
                    await wixData.update('ShiftOffers', { ...o, status: OFFER_STATUS.FILLED }, SA);
                }
                continue;
            }

            // Candidates: this day's SUBMITTED/SCHEDULED-not-assigned submissions with the skill.
            const candidates = submissions
                .filter(s => toDateKey(s.date) === dateKey
                    && s.status !== SUBMISSION_STATUS.STANDBY
                    && (board.skillsByRoleId[s.employeeId] || []).includes(t.typeId)
                    && !t.assignedEmployeeIds.includes(s.employeeId))
                .sort((a, b) => {
                    const ra = Number(board.rolesById[a.employeeId]?.priorityRank) || 999;
                    const rb = Number(board.rolesById[b.employeeId]?.priorityRank) || 999;
                    return ra - rb || new Date(a._createdDate) - new Date(b._createdDate);
                });

            for (const sub of candidates) {
                if (shortage <= 0) break;
                await wixData.insert('ShiftAssignments', {
                    dateKey,
                    date: new Date(`${dateKey}T12:00:00Z`),
                    monthKey: dateKey.slice(0, 7),
                    workshopTypeId: t.typeId,
                    workshopName: t.name,
                    employeeId: sub.employeeId,
                    submissionId: sub._id,
                    status: ASSIGNMENT_STATUS.APPROVED,
                    source: 'AUTO',
                    workType: DEFAULT_WORK_TYPE,
                }, SA);
                if (sub.status !== SUBMISSION_STATUS.SCHEDULED) {
                    await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SCHEDULED }, SA);
                }
                t.assignedCount++;
                t.assignedEmployeeIds.push(sub.employeeId);
                if (t.activeCount > 0) t.activeCount--;
                shortage--;
                report.assigned++;

                const role = board.rolesById[sub.employeeId];
                if (role?.phone) {
                    await enqueueNotification({
                        actionKey: 'employee_shift_assigned',
                        recipientId: role._id,
                        recipientPhone: role.phone,
                        priority: PRIORITY.NORMAL,
                        entityKey: `shift:${dateKey}:${role._id}`,
                        digest: { line: `${formatDateHe(dateKey)} — ${t.name}`, kind: 'assigned' },
                        vars: { displayName: role.displayName || '', portalLink: PORTAL_URL },
                    });
                }
            }

            if (shortage > 0) {
                const created = await ensureShortageHandled(dateKey, t, board, { batchNotify });
                if (created?.kind === OFFER_KIND.WAITLIST_OFFER) report.offers++;
                if (created?.kind === OFFER_KIND.OPEN_CALL) report.openCalls++;
            }
        }
    }

    if (report.assigned || report.offers || report.openCalls) {
        await publishSchedulingUpdate('engine-run', report);
    }
    if (report.assigned && !batchNotify) {
        await flushOutbox({ force: true }).catch(err => console.error('[schedulingEngine] flushOutbox failed:', err?.message || err));
    }
    console.log(`[schedulingEngine] runScheduling ${fromKey}..${toKey}:`, JSON.stringify(report));
    return report;
}

export const MAX_MANUAL_RUN_EMPLOYEES = 3;
export const MAX_MANUAL_RUN_DAYS = 28; // 4 weeks

/**
 * Manager-triggered batch run: assigns a hand-picked set of employees
 * (≤ MAX_MANUAL_RUN_EMPLOYEES) into open capacity across a bounded date range
 * (≤ MAX_MANUAL_RUN_DAYS), using each employee's own submitted availability
 * and skills. Unlike runScheduling this is an explicit manual action, so it
 * runs regardless of the "אישור אוטומטי" setting, and returns a full,
 * per-employee report (assigned / already-scheduled / standby / no-capacity /
 * no matching availability) for the confirmation UI.
 */
export async function runSchedulingForEmployees(fromKey, toKey, employeeIds) {
    const ids = Array.from(new Set((employeeIds || []).filter(Boolean)));
    if (!ids.length) throw new Error('BAD_REQUEST: לא נבחרו עובדים.');
    if (ids.length > MAX_MANUAL_RUN_EMPLOYEES) {
        throw new Error(`BAD_REQUEST: ניתן לבחור עד ${MAX_MANUAL_RUN_EMPLOYEES} עובדים בכל פעם.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toKey || '') || toKey < fromKey) {
        throw new Error('BAD_REQUEST: טווח תאריכים לא תקין.');
    }
    const spanDays = Math.round((new Date(`${toKey}T00:00:00Z`) - new Date(`${fromKey}T00:00:00Z`)) / 86400000) + 1;
    if (spanDays > MAX_MANUAL_RUN_DAYS) {
        throw new Error(`BAD_REQUEST: טווח התאריכים לא יכול לעלות על ${MAX_MANUAL_RUN_DAYS} ימים (4 שבועות).`);
    }

    const board = await buildBoard(fromKey, toKey, { consistent: true, includeOffers: true });
    const submissions = await loadSubmissions(fromKey, toKey, true);
    const idSet = new Set(ids);

    const reportByEmployee = {};
    for (const id of ids) {
        reportByEmployee[id] = {
            employeeId: id,
            employeeName: board.rolesById[id]?.displayName || '(לא נמצא/ה)',
            shifts: [],
        };
    }

    const todayKey = toDateKey(new Date());
    for (const dateKey of Object.keys(board.days).sort()) {
        if (dateKey < fromKey || dateKey > toKey || dateKey <= todayKey) continue;
        const day = board.days[dateKey];
        for (const t of Object.values(day.types)) {
            const daySubs = submissions.filter(s => idSet.has(s.employeeId) && toDateKey(s.date) === dateKey);
            for (const sub of daySubs) {
                const rep = reportByEmployee[sub.employeeId];
                if (!rep) continue;
                const hasSkill = (board.skillsByRoleId[sub.employeeId] || []).includes(t.typeId);
                if (!hasSkill) continue;

                if (t.assignedEmployeeIds.includes(sub.employeeId)) {
                    if (!rep.shifts.some(x => x.dateKey === dateKey && x.workshopTypeId === t.typeId)) {
                        rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'ALREADY_ASSIGNED' });
                    }
                    continue;
                }
                if (sub.status === SUBMISSION_STATUS.STANDBY) {
                    rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'STANDBY' });
                    continue;
                }

                const shortage = t.required - t.assignedCount;
                if (shortage > 0) {
                    await wixData.insert('ShiftAssignments', {
                        dateKey,
                        date: new Date(`${dateKey}T12:00:00Z`),
                        monthKey: dateKey.slice(0, 7),
                        workshopTypeId: t.typeId,
                        workshopName: t.name,
                        employeeId: sub.employeeId,
                        submissionId: sub._id,
                        status: ASSIGNMENT_STATUS.APPROVED,
                        source: 'MANUAL_BATCH',
                        workType: DEFAULT_WORK_TYPE,
                    }, SA);
                    if (sub.status !== SUBMISSION_STATUS.SCHEDULED) {
                        await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SCHEDULED }, SA);
                        sub.status = SUBMISSION_STATUS.SCHEDULED;
                    }
                    t.assignedCount++;
                    t.assignedEmployeeIds.push(sub.employeeId);
                    rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'ASSIGNED' });

                    const role = board.rolesById[sub.employeeId];
                    if (role?.phone) {
                        await enqueueNotification({
                            actionKey: 'employee_shift_assigned',
                            recipientId: role._id,
                            recipientPhone: role.phone,
                            priority: PRIORITY.NORMAL,
                            entityKey: `shift:${dateKey}:${role._id}`,
                            digest: { line: `${formatDateHe(dateKey)} — ${t.name}`, kind: 'assigned' },
                            vars: { displayName: role.displayName || '', portalLink: PORTAL_URL },
                        });
                    }
                } else {
                    rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'FULL' });
                }
            }
        }
    }

    for (const id of ids) {
        if (!reportByEmployee[id].shifts.length) {
            reportByEmployee[id].shifts.push({ dateKey: null, workshopTypeId: null, workshopName: null, status: 'NO_MATCHING_AVAILABILITY' });
        }
    }

    const employees = ids.map(id => reportByEmployee[id]);
    const totalAssigned = employees.reduce((sum, e) => sum + e.shifts.filter(s => s.status === 'ASSIGNED').length, 0);
    if (totalAssigned) {
        await publishSchedulingUpdate('manual-batch-scheduling', { fromKey, toKey, employeeIds: ids });
        await flushOutbox({ force: true }).catch(err => console.error('[schedulingEngine] flushOutbox failed:', err?.message || err));
    }

    console.log(`[schedulingEngine] runSchedulingForEmployees ${fromKey}..${toKey} employees=${ids.join(',')}: assigned=${totalAssigned}`);
    return { ok: true, fromKey, toKey, employees };
}

/** Hourly: expire stale offers and escalate to the next in the FIFO queue. */
export async function processOfferEscalation(now = new Date(), { batchNotify = false } = {}) {
    const result = await wixData.query('ShiftOffers')
        .eq('status', OFFER_STATUS.PENDING)
        .lt('expiresAt', now)
        .limit(200).find(SAC).catch(() => ({ items: [] }));

    let escalated = 0;
    for (const offer of (result.items || [])) {
        await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.EXPIRED }, SA);
        const dateKey = offer.dateKey || toDateKey(offer.date);
        const board = await buildBoard(dateKey, dateKey, { consistent: true, includeOffers: true });
        const t = board.days[dateKey]?.types?.[offer.workshopTypeId];
        if (t && t.assignedCount < t.required) {
            await ensureShortageHandled(dateKey, t, board, { batchNotify });
            escalated++;
        }
    }
    if (escalated) await publishSchedulingUpdate('offer-escalation', { escalated });
    return { expired: result.items?.length || 0, escalated };
}

// ---------------------------------------------------------------------------
// Booking-paid trigger — dynamic assignment for pending employees
// ---------------------------------------------------------------------------

const CONFIRM_WINDOW_HOURS = 24;

/**
 * Fired the moment a WorkshopOrders row turns 'paid' (data.js afterUpdate
 * hook). If instructors are now needed for that day's workshop and pending
 * (SUBMITTED) employees with the right skill exist:
 * - more than 24h before the workshop → auto-assign (priorityRank, then FIFO);
 * - less than 24h before → a pending offer + WhatsApp requiring the
 *   employee's confirmation in the portal before the assignment is final.
 * No-op when autoApproveShifts is OFF (manual mode).
 */
export async function processBookingPaid(order) {
    if (!order?.workshopStart || !order?.serviceId) return { handled: false };

    const settings = await loadSettings();
    if (settings.autoApproveShifts === false) {
        return { handled: false, reason: 'manual-mode' };
    }

    const workshopStart = new Date(order.workshopStart);
    const dateKey = toDateKey(workshopStart);
    if (!dateKey || dateKey <= toDateKey(new Date())) return { handled: false, reason: 'past-or-today' };

    const [{ serviceIdToTypeId }, board] = await Promise.all([
        loadWorkshopTypeMap(),
        buildBoard(dateKey, dateKey, { consistent: true, includeOffers: true }),
    ]);
    const typeId = serviceIdToTypeId[order.serviceId];
    const t = board.days[dateKey]?.types?.[typeId];
    if (!typeId || !t) return { handled: false, reason: 'no-type' };

    let shortage = t.required - t.assignedCount;
    if (shortage <= 0) return { handled: false, reason: 'covered' };

    const submissions = await loadSubmissions(dateKey, dateKey, true);
    const candidates = submissions
        .filter(s => toDateKey(s.date) === dateKey
            && s.status === SUBMISSION_STATUS.SUBMITTED
            && (board.skillsByRoleId[s.employeeId] || []).includes(typeId)
            && !t.assignedEmployeeIds.includes(s.employeeId))
        .sort((a, b) => {
            const ra = Number(board.rolesById[a.employeeId]?.priorityRank) || 999;
            const rb = Number(board.rolesById[b.employeeId]?.priorityRank) || 999;
            return ra - rb || new Date(a._createdDate) - new Date(b._createdDate);
        });

    if (!candidates.length) {
        // No pending employees — fall back to standby offers / open call.
        await ensureShortageHandled(dateKey, t, board);
        await publishSchedulingUpdate('booking-paid', { dateKey });
        return { handled: true, mode: 'shortage-flow' };
    }

    const hoursUntil = (workshopStart.getTime() - Date.now()) / 3600000;
    const report = { handled: true, assigned: 0, confirmations: 0 };

    if (hoursUntil > CONFIRM_WINDOW_HOURS) {
        for (const sub of candidates) {
            if (shortage <= 0) break;
            await wixData.insert('ShiftAssignments', {
                dateKey,
                date: new Date(`${dateKey}T12:00:00Z`),
                monthKey: dateKey.slice(0, 7),
                workshopTypeId: typeId,
                workshopName: t.name,
                employeeId: sub.employeeId,
                submissionId: sub._id,
                status: ASSIGNMENT_STATUS.APPROVED,
                source: 'AUTO',
                workType: DEFAULT_WORK_TYPE,
            }, SA);
            if (sub.status !== SUBMISSION_STATUS.SCHEDULED) {
                await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SCHEDULED }, SA);
            }
            t.assignedCount++;
            t.assignedEmployeeIds.push(sub.employeeId);
            shortage--;
            report.assigned++;
            const role = board.rolesById[sub.employeeId];
            if (role?.phone) {
                await enqueueNotification({
                    actionKey: 'employee_auto_assigned_booking',
                    recipientId: role._id,
                    recipientPhone: role.phone,
                    priority: PRIORITY.NORMAL,
                    entityKey: `shift:${dateKey}:${role._id}`,
                    digest: { line: `${formatDateHe(dateKey)} — ${t.name}`, kind: 'assigned' },
                    vars: { displayName: role?.displayName || '', portalLink: PORTAL_URL },
                });
            } else {
                console.warn(`[schedulingEngine] role ${role?._id} has no phone — skipping WhatsApp`);
            }
        }
        if (report.assigned) {
            await flushOutbox({ force: true }).catch(err => console.error('[schedulingEngine] flushOutbox failed:', err?.message || err));
        }
    } else {
        // Inside the confirmation window: one pending offer at a time (FIFO);
        // the hourly escalation moves it along if unanswered.
        const existing = offersFor(board.offers, dateKey, typeId);
        if (!existing.some(o => o.status === OFFER_STATUS.PENDING || o.status === OFFER_STATUS.OPEN)) {
            const first = candidates[0];
            await wixData.insert('ShiftOffers', {
                dateKey,
                date: new Date(`${dateKey}T12:00:00Z`),
                monthKey: dateKey.slice(0, 7),
                workshopTypeId: typeId,
                workshopName: t.name,
                kind: OFFER_KIND.WAITLIST_OFFER,
                status: OFFER_STATUS.PENDING,
                employeeId: first.employeeId,
                submissionId: first._id,
                expiresAt: new Date(Date.now() + OFFER_TTL_MS),
                notifiedAt: new Date(),
            }, SA);
            const role = board.rolesById[first.employeeId];
            if (role?.phone) {
                // Short-notice confirmations stay urgent even with a backlog — always sent individually.
                await enqueueNotification({
                    actionKey: 'employee_confirm_request_shortnotice',
                    recipientId: role._id,
                    recipientPhone: role.phone,
                    priority: PRIORITY.URGENT,
                    entityKey: `offer:${dateKey}:${typeId}:${role._id}`,
                    vars: {
                        displayName: role?.displayName || '',
                        workshopName: t.name,
                        date: formatDateHe(dateKey),
                        hoursWindow: CONFIRM_WINDOW_HOURS,
                        portalLink: PORTAL_URL,
                    },
                });
            } else {
                console.warn(`[schedulingEngine] role ${role?._id} has no phone — skipping WhatsApp`);
            }
            report.confirmations++;
        }
    }

    await publishSchedulingUpdate('booking-paid', { dateKey });
    console.log(`[schedulingEngine] processBookingPaid ${dateKey}/${typeId}:`, JSON.stringify(report));
    return report;
}

// ---------------------------------------------------------------------------
// Atomic claims (first-write-wins via consistentRead re-check)
// ---------------------------------------------------------------------------

async function assignFromClaim(dateKey, t, role, submission) {
    await wixData.insert('ShiftAssignments', {
        dateKey,
        date: new Date(`${dateKey}T12:00:00Z`),
        monthKey: dateKey.slice(0, 7),
        workshopTypeId: t.typeId,
        workshopName: t.name,
        employeeId: role._id,
        submissionId: submission._id,
        status: ASSIGNMENT_STATUS.APPROVED,
        source: 'AUTO',
        workType: DEFAULT_WORK_TYPE,
    }, SA);
    if (submission.status !== SUBMISSION_STATUS.SCHEDULED) {
        await wixData.update('AvailabilitySubmissions', { ...submission, status: SUBMISSION_STATUS.SCHEDULED }, SA);
    }
}

/** Employee accepts/declines a waiting-list offer addressed to them. */
export async function respondToOffer(offerId, role, accept) {
    const offer = await wixData.get('ShiftOffers', offerId, SAC).catch(() => null);
    if (!offer || offer.kind !== OFFER_KIND.WAITLIST_OFFER || offer.employeeId !== role._id) {
        throw new Error('NOT_FOUND: ההצעה לא נמצאה.');
    }
    if (offer.status !== OFFER_STATUS.PENDING) {
        throw new Error('CONFLICT: ההצעה כבר אינה בתוקף.');
    }
    const dateKey = offer.dateKey || toDateKey(offer.date);

    if (!accept) {
        await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.DECLINED }, SA);
        const board = await buildBoard(dateKey, dateKey, { consistent: true, includeOffers: true });
        const t = board.days[dateKey]?.types?.[offer.workshopTypeId];
        if (t && t.assignedCount < t.required) await ensureShortageHandled(dateKey, t, board);
        await publishSchedulingUpdate('offer-declined', { dateKey });
        return { ok: true, accepted: false };
    }

    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const t = board.days[dateKey]?.types?.[offer.workshopTypeId];
    if (!t || t.assignedCount >= t.required) {
        await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.EXPIRED }, SA);
        throw new Error('CONFLICT: המשמרת כבר אוישה.');
    }
    const submission = await wixData.get('AvailabilitySubmissions', offer.submissionId, SAC).catch(() => null);
    if (!submission) throw new Error('NOT_FOUND: הגשת הזמינות המקורית לא נמצאה.');

    await assignFromClaim(dateKey, t, role, submission);
    await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.ACCEPTED, claimedBy: role._id }, SA);
    await publishSchedulingUpdate('offer-accepted', { dateKey });
    return { ok: true, accepted: true, dateKey };
}

/** Validates+resolves the employee-chosen shift hours for an urgent claim, falling back to the studio default. */
function resolveRequestedShiftTimes(dateKey, requested, settings) {
    const startTime = String(requested?.startTime || '').trim();
    const endTime = String(requested?.endTime || '').trim();
    if (!startTime || !endTime) {
        return { startTime: settings?.defaultShiftStart || '10:00', endTime: settings?.defaultShiftEnd || '16:00' };
    }
    if (computeShiftHours(startTime, endTime) === null) {
        throw new Error('BAD_REQUEST: שעות המשמרת שהוזנו אינן תקינות.');
    }
    if (startTime < SHIFT_MIN_TIME || endTime > SHIFT_MAX_TIME) {
        throw new Error(`BAD_REQUEST: שעות המשמרת חייבות להיות בין ${SHIFT_MIN_TIME} ל-${SHIFT_MAX_TIME}.`);
    }
    const shortDayErr = validateShiftWithinShortDay(dateKey, startTime, endTime, settings);
    if (shortDayErr) throw new Error(`BAD_REQUEST: ${shortDayErr}`);
    return { startTime, endTime };
}

/**
 * Employee claims an open call. `requestedHours` ({ startTime, endTime }) lets
 * the employee pick their own shift hours instead of the workshop's exact
 * session time — used by the urgent-shifts popup, which no longer exposes
 * session times to employees. The offer stays OPEN (not FILLED) as long as
 * the workshop still needs more instructors after this claim, so it keeps
 * showing up for other skill-matched employees.
 */
export async function claimOpenCall(callId, role, settings, requestedHours) {
    const call = await wixData.get('ShiftOffers', callId, SAC).catch(() => null);
    if (!call || call.kind !== OFFER_KIND.OPEN_CALL) throw new Error('NOT_FOUND: הקריאה לא נמצאה.');
    if (call.status !== OFFER_STATUS.OPEN) throw new Error('CONFLICT: המשמרת כבר נתפסה על ידי עובד/ת אחר/ת.');

    const skills = refIds(role.skills);
    if (!skills.includes(call.workshopTypeId)) throw new Error('FORBIDDEN: אין לך הכשרה לסדנה זו.');

    const dateKey = call.dateKey || toDateKey(call.date);
    const { startTime, endTime } = resolveRequestedShiftTimes(dateKey, requestedHours, settings);
    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const t = board.days[dateKey]?.types?.[call.workshopTypeId];
    if (!t || t.assignedCount >= t.required) {
        await wixData.update('ShiftOffers', { ...call, status: OFFER_STATUS.FILLED }, SA);
        throw new Error('CONFLICT: המשמרת כבר אוישה.');
    }
    if (t.assignedEmployeeIds.includes(role._id)) throw new Error('CONFLICT: כבר שובצת לסדנה זו.');

    const assignedTypes = Object.values(board.days[dateKey]?.types || {})
        .filter(other => other.assignedEmployeeIds.includes(role._id));
    if (assignedTypes.some(other => sessionRangesOverlap(t, other))) {
        throw new Error('CONFLICT: בקשת השיבוץ חופפת למשמרת שכבר שובצת אליה.');
    }

    // Reuse the employee's submission for that date, or create one with the requested hours.
    const existing = await wixData.query('AvailabilitySubmissions')
        .eq('employeeId', role._id)
        .between('date', new Date(`${dateKey}T00:00:00Z`), new Date(`${dateKey}T23:59:59Z`))
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    let submission = existing.items?.[0] || null;
    if (!submission) {
        submission = await wixData.insert('AvailabilitySubmissions', {
            employeeId: role._id,
            staffId: null,
            date: new Date(`${dateKey}T12:00:00Z`),
            startTime,
            endTime,
            status: SUBMISSION_STATUS.SCHEDULED,
            monthKey: dateKey.slice(0, 7),
            managerOverride: false,
            notes: 'שובץ דרך קריאה פתוחה',
        }, SA);
    }

    await assignFromClaim(dateKey, t, role, submission);
    // Headcount may still be short after this claim — keep the call OPEN so it
    // keeps appearing for other skill-matched employees until fully staffed.
    const stillShort = (t.assignedCount + 1) < t.required;
    await wixData.update('ShiftOffers', {
        ...call,
        status: stillShort ? OFFER_STATUS.OPEN : OFFER_STATUS.FILLED,
        claimedBy: role._id,
    }, SA);
    await publishSchedulingUpdate('open-call-claimed', { dateKey });
    return { ok: true, dateKey };
}

/**
 * Employee claims a batch of open calls at once (bulk selection UI).
 * Each call is re-verified against the live database immediately before being
 * claimed (consistent read inside claimOpenCall), so two employees racing to
 * grab the same shift can never both win it — the second one simply fails
 * with a CONFLICT for that specific item while the rest of the batch proceeds.
 */
export async function claimOpenCalls(callIds, role, settings) {
    const ids = Array.from(new Set((callIds || []).filter(Boolean)));
    const results = [];
    for (const callId of ids) {
        const call = await wixData.get('ShiftOffers', callId, SAC).catch(() => null);
        const dateKey = call ? (call.dateKey || toDateKey(call.date)) : null;
        try {
            const outcome = await claimOpenCall(callId, role, settings);
            results.push({ callId, ok: true, dateKey: outcome.dateKey || dateKey });
        } catch (err) {
            results.push({ callId, ok: false, dateKey, error: err?.message || String(err) });
        }
    }
    return { ok: true, results };
}

/**
 * Employee claims one or more urgent-shift days at once, each with the
 * hours they chose in the popup (day + dropdown, or custom hours) rather
 * than a specific call's exact session time. `requests` is an array of
 * { date, callIds, startTime, endTime } — every callId for that date is
 * attempted independently, so a partial failure (e.g. lost the race, or an
 * overlap with another assignment that day) doesn't block the rest.
 */
export async function claimOpenCallsWithHours(requests, role, settings) {
    const results = [];
    for (const req of (requests || [])) {
        const dateKey = req?.date || null;
        const shiftHours = { startTime: req?.startTime, endTime: req?.endTime };
        const ids = Array.from(new Set((req?.callIds || []).filter(Boolean)));
        for (const callId of ids) {
            try {
                const outcome = await claimOpenCall(callId, role, settings, shiftHours);
                results.push({ callId, ok: true, dateKey: outcome.dateKey || dateKey });
            } catch (err) {
                results.push({ callId, ok: false, dateKey, error: err?.message || String(err) });
            }
        }
    }
    return { ok: true, results };
}
