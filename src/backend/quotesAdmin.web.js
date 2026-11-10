// Admin (dashboard page) web methods for the quotes system. All Permissions.Admin.
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { auth } from '@wix/essentials';
import { computeAmounts } from 'backend/quotePricing.js';
import { toManyChatPhone, getQuoteSettings, LOCKED_STATUSES, SIGNED_EDITABLE_FIELDS } from 'backend/quoteCore.js';
import { writeQuoteLog } from 'backend/quoteLog.js';
import { diffQuote } from 'backend/quoteDiff.js';
import { backfillQuoteLeads } from 'backend/quoteLeadsSync.js';
import { buildPreparedFields, buildQuoteUrl, resolveTemplate } from 'backend/quoteBuilder.js';
import { recomputePaymentState } from 'backend/quotePayments.js';
import { sendQuoteEmail } from 'backend/quoteNotify.js';
import { sendQuoteLinkManyChat } from 'backend/manychatService.jsw';
import {
    renderTemplate, sanitizeHtml, PLACEHOLDERS, FIELD_OPTIONS, DEFAULT_TEMPLATE_FIELDS, buildTemplateHtml, parseTemplateConfig,
} from 'backend/quoteTemplates.js';

const SA = { suppressAuth: true, suppressHooks: true };

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
        if (!next.allowOnlinePayment && !next.allowBankTransfer) {
            throw new Error('VALIDATION:חייב להישאר אמצעי תשלום אחד פעיל.');
        }
        const amounts = computeAmounts(next);
        if (amounts.error) throw new Error(`VALIDATION:${amounts.error}`);
        const { error, ...fields } = amounts;
        Object.assign(next, fields);
    }

    const saved = await wixData.update('Quotes', next, SA);
    const actor = await getActor(actorName);
    const diff = await diffQuote(quote, saved, Object.keys(changes)).catch(() => []);
    if (diff.length) await writeQuoteLog(quoteId, 'quote_updated', { changes: diff }, actor);
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

export const saveSettings = webMethod(Permissions.Admin, async (patch = {}) => {
    const current = await getQuoteSettings();
    if (!current) throw new Error('NOT_FOUND:שורת ההגדרות לא נמצאה.');
    const saved = await wixData.update('QuoteSettings', { ...current, ...pick(patch, SETTINGS_FIELDS) }, SA);
    return { settings: saved };
});

// ---- Templates ----
export const listTemplates = webMethod(Permissions.Admin, async () => {
    const res = await wixData.query('QuoteTemplates').eq('active', true).ascending('name').limit(100).find(SA);
    const templates = res.items.map((t) => ({ ...t, config: parseTemplateConfig(t.bodyHtml) }));
    return { templates, placeholders: PLACEHOLDERS, fieldOptions: FIELD_OPTIONS, defaultFields: DEFAULT_TEMPLATE_FIELDS };
});

export const saveTemplate = webMethod(Permissions.Admin, async (tpl = {}, actorName) => {
    const name = String(tpl.name || '').trim().slice(0, 120);
    const bodyHtml = tpl.config ? buildTemplateHtml(tpl.config) : sanitizeHtml(tpl.bodyHtml);
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
    const tpl = await resolveTemplate(templateId || quote.templateId, quote.eventType).catch((e) => { throw new Error(e?.message || 'VALIDATION:שגיאה בטעינת תבנית.'); });
    if (!tpl) throw new Error('VALIDATION:לא נמצאה תבנית. צרו תבנית וסמנו אותה כברירת מחדל.');
    const amounts = computeAmounts(quote);
    const view = amounts.error ? quote : { ...quote, ...amounts };
    const out = renderTemplate(tpl.bodyHtml, view);
    if (out.error) throw new Error(`VALIDATION:${out.error}`);
    return { html: out.html, templateId: tpl._id };
});

/** lead|draft -> draft: validates, assigns token + number, defaults dates. */
export const prepareQuote = webMethod(Permissions.Admin, async (quoteId, templateId, actorName) => {
    const rethrow = (err, fallback) => { throw new Error(/^(VALIDATION|NOT_FOUND|ACCESS_DENIED):/.test(err?.message || '') ? err.message : (fallback || `VALIDATION:${err?.message || 'שגיאה לא ידועה'}`)); };
    const quote = await wixData.get('Quotes', quoteId, SA).catch((e) => rethrow(e, 'NOT_FOUND:ההצעה לא נמצאה.'));
    if (!quote) throw new Error('NOT_FOUND:ההצעה לא נמצאה.');
    if (!['lead', 'draft'].includes(quote.status)) throw new Error('VALIDATION:ההצעה כבר נשלחה או נעולה.');
    const tpl = await resolveTemplate(templateId || quote.templateId, quote.eventType).catch((e) => rethrow(e));
    if (!tpl) throw new Error('VALIDATION:לא נמצאה תבנית. צרו תבנית וסמנו אותה כברירת מחדל.');
    const rendered = renderTemplate(tpl.bodyHtml, quote);
    if (rendered.error) throw new Error(`VALIDATION:${rendered.error}`);

    const fields = await buildPreparedFields(quote, tpl._id).catch((e) => rethrow(e));
    const saved = await wixData.update('Quotes', { ...quote, ...fields }, SA).catch((e) => rethrow(e, 'VALIDATION:שגיאה בשמירת ההצעה.'));
    const url = await buildQuoteUrl(saved.publicToken).catch((e) => rethrow(e));
    await writeQuoteLog(quoteId, quote.status === 'lead' ? 'quote_prepared' : 'quote_reprepared', { templateId: tpl._id }, await getActor(actorName).catch(() => ({ type: 'admin', name: actorName || '' })));
    return { quote: saved, url };
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
