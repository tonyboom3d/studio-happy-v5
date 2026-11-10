// Read-only dashboard calls. Kept out of quotesAdmin.web.js so opening the list does not load ManyChat, email or the form sync.
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { loadAddonsCatalog } from 'backend/quoteCore.js';
import { listQuoteLog } from 'backend/quoteLog.js';
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

/** Staff = Dashboard_Roles (displayName); trainings = connectedTrainings -> addons_events. */
async function queryActors() {
    const res = await wixData.query('Dashboard_Roles').ne('active', false).limit(200).find(SA);
    const rows = res.items.filter((r) => r.displayName);
    const actors = await Promise.all(rows.map(async (r) => {
        let trainings = [];
        try {
            const t = await wixData.queryReferenced('Dashboard_Roles', r._id, 'connectedTrainings', { suppressAuth: true, limit: 100 });
            trainings = (t.items || []).map((a) => ({
                id: a._id,
                title: typeof a.name === 'string' ? a.name : a.name?.he || a.title || '',
            })).filter((x) => x.title);
        } catch (_) { /* trainings optional */ }
        return { id: r._id, name: r.displayName, trainings };
    }));
    return actors.sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

const dayKey = (v) => {
    const d = toDate(v);
    return d ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '';
};

// Warm-instance cache for rarely-changing reference data (10 min).
let refCache = null;
async function getRefData() {
    if (refCache && Date.now() - refCache.at < 10 * 60 * 1000) return refCache.data;
    const [actors, addons] = await Promise.all([queryActors(), loadAddonsCatalog()]);
    refCache = { at: Date.now(), data: { actors, addons } };
    return refCache.data;
}

export const listQuotes = webMethod(Permissions.Admin, queryQuotes);

/** employeeId -> [{kind, label, start, end}] for the quote's day: ShiftAssignments, AvailabilitySubmissions, other quotes. */
async function queryBusyStaff(quoteId, eventDate) {
    const key = dayKey(eventDate);
    if (!key) return {};
    const day = new Date(`${key}T12:00:00Z`);
    const from = new Date(day.getTime() - 36 * 3600 * 1000);
    const to = new Date(day.getTime() + 36 * 3600 * 1000);
    const [shifts, avail, quotes] = await Promise.all([
        wixData.query('ShiftAssignments').eq('dateKey', key).ne('status', 'CANCELLED').limit(500).find(SA).catch(() => ({ items: [] })),
        wixData.query('AvailabilitySubmissions').ge('date', from).le('date', to).limit(1000).find(SA).catch(() => ({ items: [] })),
        wixData.query('Quotes').ne('_id', quoteId).ne('status', 'cancelled').ge('eventDate', from).le('eventDate', to)
            .fields('assignedStaffIds', 'eventDate', 'eventStartTime', 'eventEndTime', 'requestedWorkshop').limit(200).find(SA).catch(() => ({ items: [] })),
    ]);
    const map = {};
    const add = (id, row) => { if (id) (map[id] = map[id] || []).push(row); };
    shifts.items.forEach((s) => add(s.employeeId, { kind: 'shift', label: s.workshopName || 'משמרת', start: '', end: '' }));
    avail.items.filter((a) => dayKey(a.date) === key && !/CANCEL|REJECT/i.test(a.status || ''))
        .forEach((a) => add(a.employeeId, { kind: a.status === 'SCHEDULED' ? 'shift' : 'availability', label: a.status === 'SCHEDULED' ? 'משובץ/ת' : 'הגיש/ה זמינות', start: a.startTime || '', end: a.endTime || '' }));
    quotes.items.filter((q) => dayKey(q.eventDate) === key)
        .forEach((q) => (q.assignedStaffIds || []).forEach((id) => add(id, { kind: 'quote', label: q.requestedWorkshop || 'אירוע (הצעת מחיר)', start: q.eventStartTime || '', end: q.eventEndTime || '' })));
    return map;
}

export const getQuote = webMethod(Permissions.Admin, async (quoteId) => {
    const quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');
    const [log, payments, busyStaff, ref] = await Promise.all([
        listQuoteLog(quoteId),
        wixData.query('QuotePayments').eq('quoteId', quoteId).descending('_createdDate').limit(50).find(SA),
        queryBusyStaff(quoteId, quote.eventDate).catch(() => ({})),
        getRefData().catch(() => ({ actors: [] })),
    ]);
    return { quote, log, payments: payments.items, busyStaff, actors: ref.actors };
});

export const listActors = webMethod(Permissions.Admin, async () => ({ actors: await queryActors() }));

/** First paint: the first page, the actor picker and the extras catalog, in one backend call. */
export const loadQuotesDashboard = webMethod(Permissions.Admin, async (opts = {}) => {
    const [list, ref] = await Promise.all([queryQuotes(opts), getRefData()]);
    return { ...list, ...ref };
});
