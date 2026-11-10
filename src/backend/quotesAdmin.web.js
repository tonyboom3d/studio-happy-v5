// Admin (dashboard page) web methods for the quotes system. All Permissions.Admin.
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { auth } from '@wix/essentials';
import { computeAmounts } from 'backend/quotePricing.js';
import { toManyChatPhone, getQuoteSettings, loadAddonsCatalog, LOCKED_STATUSES, SIGNED_EDITABLE_FIELDS } from 'backend/quoteCore.js';
import { writeQuoteLog, listQuoteLog } from 'backend/quoteLog.js';
import { backfillQuoteLeads } from 'backend/quoteLeadsSync.js';
import { buildPreparedFields, buildQuoteUrl, resolveTemplate } from 'backend/quoteBuilder.js';
import { recomputePaymentState } from 'backend/quotePayments.js';
import { sendQuoteEmail } from 'backend/quoteNotify.js';
import { sendQuoteLinkManyChat } from 'backend/manychatService.jsw';
import { renderTemplate, sanitizeHtml, PLACEHOLDERS } from 'backend/quoteTemplates.js';

const SA = { suppressAuth: true, suppressHooks: true };

const LIST_FIELDS = [
    '_id', '_createdDate', 'quoteNumber', 'eventType', 'customerName', 'customerEmail', 'customerPhone',
    'companyName', 'participants', 'adults', 'eventDate', 'eventStartTime', 'eventEndTime', 'workshopClosed',
    'requiredInstructors', 'extras', 'totalAmount', 'depositAmount', 'balanceAmount', 'expiresAt',
    'balanceDueDate', 'selectedPaymentMethod', 'selectedPaymentPlan', 'signatureStatus', 'paymentStatus',
    'status', 'conflicts', 'assignedStaffIds', 'notes', 'paidAmount', 'requestedWorkshop',
];

const EDITABLE_FIELDS = [
    'customerName', 'customerEmail', 'customerPhone', 'companyName', 'companyRole', 'eventLocation', 'eventAddress',
    'participants', 'adults', 'eventDate', 'eventStartTime', 'eventEndTime', 'workshopId', 'workshopClosed',
    'requiredInstructors', 'extras', 'basePrice', 'priceOverride', 'depositType', 'depositValue',
    'balanceDueDate', 'expiresAt', 'allowOnlinePayment', 'allowBankTransfer', 'notes', 'assignedStaffIds',
];

const SETTINGS_FIELDS = [
    'bankDetailsText', 'brandColor', 'defaultDepositType', 'defaultDepositValue', 'defaultExpiryDays',
    'defaultBalanceDaysBeforeEvent', 'balanceReminderDaysBefore', 'quotePageUrl', 'thankYouPageUrl',
    'managerSubscriberIds', 'manychatQuoteFlowNs', 'calendarScheduleId',
];

const DATE_FIELDS = ['eventDate', 'balanceDueDate', 'expiresAt'];
const SORTABLE = ['_createdDate', 'eventDate', 'expiresAt', 'totalAmount', 'customerName', 'quoteNumber'];

async function getActor(actorName) {
    let userId = '';
    try {
        const info = await auth.getTokenInfo();
        if (info?.subjectType === 'USER') userId = info.subjectId || '';
    } catch (_) { /* identity unavailable */ }
    // actorName is self-declared by the dashboard CE; userId is the trusted part.
    return { type: 'admin', name: String(actorName || '').slice(0, 80), userId };
}

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
    const to = toRaw ? new Date(toRaw.getTime() + 24 * 3600 * 1000 - 1) : null; // inclusive end of day
    if (from) q = q.ge('eventDate', from);
    if (to) q = q.le('eventDate', to);
    return q;
}

export const listQuotes = webMethod(Permissions.Admin, async (opts = {}) => {
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

    const res = await q.skip(skip).limit(limit).find(SA);
    return {
        items: res.items.map((i) => pick(i, LIST_FIELDS)),
        total: res.totalCount,
        skip,
        limit,
    };
});

export const getQuote = webMethod(Permissions.Admin, async (quoteId) => {
    const quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');
    const [log, payments] = await Promise.all([
        listQuoteLog(quoteId),
        wixData.query('QuotePayments').eq('quoteId', quoteId).descending('_createdDate').find(SA),
    ]);
    return { quote, log, payments: payments.items };
});

export const updateQuote = webMethod(Permissions.Admin, async (quoteId, patch = {}, actorName) => {
    const quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');

    const locked = LOCKED_STATUSES.includes(quote.status);
    let allowedKeys = locked ? SIGNED_EDITABLE_FIELDS : EDITABLE_FIELDS;
    if (quote.status === 'cancelled') allowedKeys = ['notes'];
    const changes = pick(patch, allowedKeys);
    if (!Object.keys(changes).length) return { quote, changed: [] };

    DATE_FIELDS.forEach((k) => { if (k in changes) changes[k] = toDate(changes[k]); });
    if ('customerPhone' in changes) changes.customerPhone = toManyChatPhone(changes.customerPhone);
    if ('requiredInstructors' in changes) changes.requiredInstructors = Math.max(0, parseInt(changes.requiredInstructors, 10) || 0);

    const next = { ...quote, ...changes };

    if (!locked) {
        if (next.eventStartTime && next.eventEndTime && next.eventStartTime >= next.eventEndTime) {
            throw new Error('VALIDATION:שעת הסיום חייבת להיות אחרי שעת ההתחלה.');
        }
        if (next.expiresAt && next.eventDate && next.expiresAt > next.eventDate) {
            throw new Error('VALIDATION:תוקף ההצעה חייב להיות לפני תאריך האירוע.');
        }
        if (next.balanceDueDate && next.eventDate && next.balanceDueDate > next.eventDate) {
            throw new Error('VALIDATION:מועד תשלום היתרה חייב להיות עד תאריך האירוע.');
        }
        const amounts = computeAmounts(next);
        if (amounts.error) throw new Error(`VALIDATION:${amounts.error}`);
        const { error, ...fields } = amounts;
        Object.assign(next, fields);
    }

    const saved = await wixData.update('Quotes', next, SA);
    const actor = await getActor(actorName);
    const priceTouched = ['basePrice', 'priceOverride', 'extras', 'depositType', 'depositValue'].some((k) => k in changes);
    await writeQuoteLog(quoteId, priceTouched ? 'price_changed' : 'edited', { fields: Object.keys(changes) }, actor);
    return { quote: saved, changed: Object.keys(changes) };
});

export const cancelQuote = webMethod(Permissions.Admin, async (quoteId, actorName) => {
    const quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');
    if (quote.status === 'cancelled') return { quote };
    const saved = await wixData.update('Quotes', { ...quote, status: 'cancelled' }, SA);
    await writeQuoteLog(quoteId, 'cancelled', { previousStatus: quote.status }, await getActor(actorName));
    // Calendar release is added in the calendar phase.
    return { quote: saved };
});

/** Active employees for the dashboard's "who is working now" picker (self-declared actor name). */
export const listActors = webMethod(Permissions.Admin, async () => {
    const res = await wixData.query('Dashboard_Roles').eq('active', true).limit(200).find(SA);
    return {
        actors: res.items
            .filter((r) => r.displayName)
            .map((r) => ({ id: r._id, name: r.displayName }))
            .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    };
});

export const getSettings = webMethod(Permissions.Admin, async () => ({
    settings: await getQuoteSettings(),
    addons: await loadAddonsCatalog(),
}));

export const saveSettings = webMethod(Permissions.Admin, async (patch = {}) => {
    const current = await getQuoteSettings();
    if (!current) throw new Error('NOT_FOUND:שורת ההגדרות לא נמצאה.');
    const saved = await wixData.update('QuoteSettings', { ...current, ...pick(patch, SETTINGS_FIELDS) }, SA);
    return { settings: saved };
});

// ---- Templates ----
export const listTemplates = webMethod(Permissions.Admin, async () => {
    const res = await wixData.query('QuoteTemplates').eq('active', true).ascending('name').limit(100).find(SA);
    return { templates: res.items, placeholders: PLACEHOLDERS };
});

export const saveTemplate = webMethod(Permissions.Admin, async (tpl = {}, actorName) => {
    const name = String(tpl.name || '').trim().slice(0, 120);
    const bodyHtml = sanitizeHtml(tpl.bodyHtml);
    if (!name) throw new Error('VALIDATION:חסר שם לתבנית.');
    if (!bodyHtml.trim()) throw new Error('VALIDATION:תוכן התבנית ריק.');
    const probe = renderTemplate(bodyHtml, {});
    if (probe.error) throw new Error(`VALIDATION:${probe.error}`);
    const eventType = ['birthday', 'event'].includes(tpl.eventType) ? tpl.eventType : 'event';
    const doc = { name, bodyHtml, eventType, isDefault: !!tpl.isDefault, active: true };

    if (doc.isDefault) { // one default per event type
        const prev = await wixData.query('QuoteTemplates').eq('eventType', eventType).eq('isDefault', true).find(SA);
        await Promise.all(prev.items.filter((t) => t._id !== tpl._id).map((t) => wixData.update('QuoteTemplates', { ...t, isDefault: false }, SA)));
    }
    let saved;
    if (tpl._id) {
        const cur = await wixData.get('QuoteTemplates', tpl._id, SA);
        if (!cur) throw new Error('NOT_FOUND:התבנית לא נמצאה.');
        saved = await wixData.update('QuoteTemplates', { ...cur, ...doc }, SA);
    } else {
        saved = await wixData.insert('QuoteTemplates', doc, SA);
    }
    console.log('[quotesAdmin] template saved', saved._id, (await getActor(actorName)).name);
    return { template: saved };
});

export const deleteTemplate = webMethod(Permissions.Admin, async (templateId) => {
    const cur = await wixData.get('QuoteTemplates', templateId, SA);
    if (!cur) throw new Error('NOT_FOUND:התבנית לא נמצאה.');
    await wixData.update('QuoteTemplates', { ...cur, active: false, isDefault: false }, SA);
    return { ok: true };
});

// ---- Builder ----
export const previewQuote = webMethod(Permissions.Admin, async (quoteId, templateId) => {
    const quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');
    const tpl = await resolveTemplate(templateId || quote.templateId, quote.eventType);
    if (!tpl) throw new Error('VALIDATION:לא נמצאה תבנית. צרו תבנית וסמנו אותה כברירת מחדל.');
    const amounts = computeAmounts(quote);
    const view = amounts.error ? quote : { ...quote, ...amounts };
    const out = renderTemplate(tpl.bodyHtml, view);
    if (out.error) throw new Error(`VALIDATION:${out.error}`);
    return { html: out.html, templateId: tpl._id };
});

/** lead|draft -> draft: validates, assigns token + number, defaults dates. */
export const prepareQuote = webMethod(Permissions.Admin, async (quoteId, templateId, actorName) => {
    const quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');
    if (!['lead', 'draft'].includes(quote.status)) throw new Error('VALIDATION:ההצעה כבר נשלחה או נעולה.');
    const tpl = await resolveTemplate(templateId || quote.templateId, quote.eventType);
    if (!tpl) throw new Error('VALIDATION:לא נמצאה תבנית. צרו תבנית וסמנו אותה כברירת מחדל.');
    const rendered = renderTemplate(tpl.bodyHtml, quote);
    if (rendered.error) throw new Error(`VALIDATION:${rendered.error}`);

    const fields = await buildPreparedFields(quote, tpl._id);
    const saved = await wixData.update('Quotes', { ...quote, ...fields }, SA);
    await writeQuoteLog(quoteId, quote.status === 'lead' ? 'quote_prepared' : 'quote_reprepared', { templateId: tpl._id }, await getActor(actorName));
    return { quote: saved, url: await buildQuoteUrl(saved.publicToken) };
});

export const getQuoteLink = webMethod(Permissions.Admin, async (quoteId, actorName) => {
    let quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote?.publicToken) throw new Error('VALIDATION:ההצעה עדיין לא הוכנה לשליחה.');
    if (quote.status === 'draft') { // link handed out manually = sent
        quote = await wixData.update('Quotes', { ...quote, status: 'sent' }, SA);
        await writeQuoteLog(quoteId, 'link_copied', {}, await getActor(actorName));
    }
    return { url: await buildQuoteUrl(quote.publicToken) };
});

// ---- Sending ----
/** channels: ['email','whatsapp']. Marks draft as sent when at least one channel succeeds. */
export const sendQuote = webMethod(Permissions.Admin, async (quoteId, channels = [], actorName) => {
    let quote = await wixData.get('Quotes', quoteId, SA);
    if (!quote?.publicToken || !['draft', 'sent', 'viewed'].includes(quote.status)) throw new Error('VALIDATION:ההצעה אינה ניתנת לשליחה (יש להכין אותה קודם).');
    const actor = await getActor(actorName);
    const results = {};
    if (channels.includes('email')) {
        results.email = await sendQuoteEmail(quote);
        if (results.email.sent) await writeQuoteLog(quoteId, 'email_sent', {}, actor);
    }
    if (channels.includes('whatsapp')) {
        results.whatsapp = await sendQuoteLinkManyChat(quoteId);
        if (results.whatsapp.sent) await writeQuoteLog(quoteId, 'sent_whatsapp', {}, actor);
    }
    if (Object.values(results).some((r) => r.sent) && quote.status === 'draft') {
        quote = await wixData.update('Quotes', { ...(await wixData.get('Quotes', quoteId, SA)), status: 'sent' }, SA);
    }
    return { results, status: quote.status };
});

// ---- Bank transfer review ----
async function pendingBankRow(quoteId) {
    const res = await wixData.query('QuotePayments').eq('quoteId', quoteId).eq('method', 'bank_transfer').eq('status', 'pending').descending('_createdDate').limit(1).find(SA);
    if (!res.items[0]) throw new Error('NOT_FOUND:אין העברה בנקאית הממתינה לאישור.');
    return res.items[0];
}

export const approveBankTransfer = webMethod(Permissions.Admin, async (quoteId, actorName) => {
    const row = await pendingBankRow(quoteId);
    const actor = await getActor(actorName);
    await wixData.update('QuotePayments', { ...row, status: 'paid', paidAt: new Date(), approvedBy: actor.name || actor.userId }, SA);
    const quote = await recomputePaymentState(quoteId);
    await writeQuoteLog(quoteId, 'transfer_approved', { stage: row.stage, amount: row.amount }, actor);
    return { quote };
});

export const rejectBankTransfer = webMethod(Permissions.Admin, async (quoteId, actorName) => {
    const row = await pendingBankRow(quoteId);
    const actor = await getActor(actorName);
    await wixData.update('QuotePayments', { ...row, status: 'rejected', approvedBy: actor.name || actor.userId }, SA);
    const quote = await recomputePaymentState(quoteId);
    await writeQuoteLog(quoteId, 'transfer_rejected', { stage: row.stage, amount: row.amount }, actor);
    return { quote };
});

export const syncQuoteLeads = webMethod(Permissions.Admin, async (actorName) => {
    const summary = await backfillQuoteLeads();
    return { summary, by: (await getActor(actorName)).name };
});
