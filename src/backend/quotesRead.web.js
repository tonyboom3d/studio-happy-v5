// Read-only dashboard calls. Kept out of quotesAdmin.web.js so opening the list does not load ManyChat, email or the form sync.
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { loadAddonsCatalog } from 'backend/quoteCore.js';
import { listQuoteLog } from 'backend/quoteLog.js';
import { loadSkillsForRoleId } from 'backend/staffRoles.js';

const SA = { suppressAuth: true, suppressHooks: true };

const LIST_FIELDS = [
    '_id', '_createdDate', 'quoteNumber', 'eventType', 'customerName', 'customerEmail', 'customerPhone',
    'companyName', 'participants', 'adults', 'eventDate', 'eventStartTime', 'eventEndTime', 'workshopClosed',
    'requiredInstructors', 'extras', 'totalAmount', 'depositAmount', 'balanceAmount', 'expiresAt',
    'balanceDueDate', 'selectedPaymentMethod', 'selectedPaymentPlan', 'signatureStatus', 'paymentStatus',
    'status', 'conflicts', 'assignedStaffIds', 'notes', 'paidAmount', 'requestedWorkshop',
];

const SORTABLE = ['_createdDate', 'eventDate', 'expiresAt', 'totalAmount', 'customerName', 'quoteNumber'];

function pick(obj, keys) {
    const out = {};
    keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
    return out;
}

function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function applyFilters(q, f = {}) {
    if (f.eventType) q = q.eq('eventType', f.eventType);
    if (f.status) q = q.eq('status', f.status);
    if (f.signatureStatus) q = q.eq('signatureStatus', f.signatureStatus);
    if (f.paymentStatus) q = q.eq('paymentStatus', f.paymentStatus);
    if (typeof f.workshopClosed === 'boolean') q = q.eq('workshopClosed', f.workshopClosed);
    const from = toDate(f.dateFrom);
    const toRaw = toDate(f.dateTo);
    const to = toRaw ? new Date(toRaw.getTime() + 24 * 3600 * 1000 - 1) : null;
    if (from) q = q.ge('eventDate', from);
    if (to) q = q.le('eventDate', to);
    return q;
}

async function queryQuotes(opts = {}) {
    const { filters, sort, paging } = opts;
    const search = String(opts.search || '').trim().slice(0, 80);
    const limit = Math.min(Math.max(parseInt(paging?.limit, 10) || 25, 1), 100);
    const skip = Math.max(parseInt(paging?.skip, 10) || 0, 0);

    let q = wixData.query('Quotes');
    if (search) {
        const digits = search.replace(/\D/g, '');
        let sq = wixData.query('Quotes').contains('customerName', search)
            .or(wixData.query('Quotes').contains('customerEmail', search))
            .or(wixData.query('Quotes').contains('companyName', search));
        if (digits.length >= 4) sq = sq.or(wixData.query('Quotes').contains('customerPhone', digits.replace(/^0/, '972')));
        q = sq;
    }
    q = applyFilters(q, filters);
    const field = SORTABLE.includes(sort?.field) ? sort.field : '_createdDate';
    q = sort?.dir === 'asc' ? q.ascending(field) : q.descending(field);

    const res = await q.fields(...LIST_FIELDS).skip(skip).limit(limit).find(SA);
    return {
        items: res.items.map((i) => pick(i, LIST_FIELDS)),
        total: res.totalCount,
        skip,
        limit,
    };
}

/** workshops._id -> workshopName, for showing staff skills (Dashboard_Roles.skills -> workshops). */
async function loadWorkshopNames() {
    const res = await wixData.query('workshops').fields('workshopName').limit(200).find(SA).catch(() => ({ items: [] }));
    const map = {};
    res.items.forEach((w) => { map[w._id] = w.workshopName || ''; });
    return map;
}

async function queryActors() {
    const [rolesRes, workshopNames] = await Promise.all([
        wixData.query('Dashboard_Roles').eq('active', true).limit(200).find(SA),
        loadWorkshopNames(),
    ]);
    const actors = await Promise.all(rolesRes.items.filter((r) => r.displayName).map(async (r) => {
        const skillIds = await loadSkillsForRoleId(r._id, r.skills).catch(() => []);
        const skills = skillIds.map((id) => workshopNames[id]).filter(Boolean);
        return { id: r._id, name: r.displayName, skills };
    }));
    return actors.sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

// Warm-instance cache for rarely-changing reference data (10 min).
let refCache = null;
async function getRefData() {
    if (refCache && Date.now() - refCache.at < 10 * 60 * 1000) return refCache.data;
    const [actors, addons] = await Promise.all([queryActors(), loadAddonsCatalog()]);
    refCache = { at: Date.now(), data: { actors, addons } };
    return refCache.data;
}

export const listQuotes = webMethod(Permissions.Admin, queryQuotes);

/** Other active quotes on the same calendar day -> staffId -> [{workshop, start, end}], for the busy tag + tooltip. */
async function queryBusyStaff(quoteId, eventDate) {
    const d = toDate(eventDate);
    if (!d) return {};
    const from = new Date(d); from.setHours(0, 0, 0, 0);
    const to = new Date(d); to.setHours(23, 59, 59, 999);
    const res = await wixData.query('Quotes')
        .ne('_id', quoteId).ne('status', 'cancelled')
        .ge('eventDate', from).le('eventDate', to)
        .fields('assignedStaffIds', 'eventStartTime', 'eventEndTime', 'requestedWorkshop').limit(200).find(SA);
    const map = {};
    res.items.forEach((q) => {
        (q.assignedStaffIds || []).forEach((id) => {
            (map[id] = map[id] || []).push({ workshop: q.requestedWorkshop || '', start: q.eventStartTime || '', end: q.eventEndTime || '' });
        });
    });
    return map;
}

export const getQuote = webMethod(Permissions.Admin, async (quoteId) => {
    const quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');
    const [log, payments, busyStaff] = await Promise.all([
        listQuoteLog(quoteId),
        wixData.query('QuotePayments').eq('quoteId', quoteId).descending('_createdDate').limit(50).find(SA),
        queryBusyStaff(quoteId, quote.eventDate),
    ]);
    return { quote, log, payments: payments.items, busyStaff };
});

export const listActors = webMethod(Permissions.Admin, async () => ({ actors: await queryActors() }));

/** First paint: the first page, the actor picker and the extras catalog, in one backend call. */
export const loadQuotesDashboard = webMethod(Permissions.Admin, async (opts = {}) => {
    const [list, ref] = await Promise.all([queryQuotes(opts), getRefData()]);
    return { ...list, ...ref };
});
