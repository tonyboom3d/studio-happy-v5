// Form submission → Quotes lead. Idempotent on sourceSubmissionId.
// Field keys: see birthdayLeads.web.js (FORM_FIELDS) and companyEventLeads.js (COLUMNS).
import wixData from 'wix-data';
import { auth } from '@wix/essentials';
import { contacts } from 'wix-crm-backend';
import { submissions } from '@wix/forms';
import { toManyChatPhone, getQuoteSettings, loadAddonsCatalog, matchExtrasFromText } from 'backend/quoteCore.js';
import { computeAmounts } from 'backend/quotePricing.js';
import { writeQuoteLog } from 'backend/quoteLog.js';

const SA = { suppressAuth: true, suppressHooks: true };

export const BIRTHDAY_FORM_ID = 'dfecbbfe-54a0-4003-9753-9aaaaf14fe5d';
export const EVENT_FORM_ID = 'dc59834f-f944-42e1-a576-9b304c87be92';
const FORMS_NAMESPACE = 'wix.form_app.form';

function cell(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'boolean') return value ? 'כן' : 'לא';
    if (Array.isArray(value)) return value.map(cell).filter(Boolean).join(', ');
    if (typeof value === 'object') {
        if (value.date || value.time) return [value.date, value.time].filter(Boolean).join(' ');
        if (value.formatted) return String(value.formatted);
        if (value.phone || value.number) return String(value.phone || value.number);
        return '';
    }
    return String(value).trim();
}

function toInt(value) {
    const n = parseInt(String(cell(value)).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
}

/** Accepts YYYY-MM-DD (also inside ISO strings) or DD/MM/YYYY. Returns Date at 12:00Z or null. */
function parseDate(value) {
    const s = cell(value);
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
    m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T12:00:00.000Z`);
    return null;
}

/** Form phone field: a string, or an object with e164Phone / formattedPhone / phone. */
function submissionPhone(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string' || typeof value === 'number') return toManyChatPhone(value);
    if (typeof value === 'object') {
        const raw = value.e164Phone || value.formattedPhone || value.phone || value.formatted || value.number || '';
        return toManyChatPhone(typeof raw === 'string' ? raw : cell(raw));
    }
    return '';
}

/** Most birthday submissions store the phone on the contact, not in submissions.phone. */
async function phoneFromContact(contactId) {
    if (!contactId) return '';
    try {
        const c = await contacts.getContact(contactId);
        const list = c?.info?.phones?.items || c?.info?.phones || [];
        const phones = Array.isArray(list) ? list : [];
        const primary = phones.find((p) => p.primary) || phones[0];
        return toManyChatPhone(primary?.e164Phone || primary?.phone || c?.primaryInfo?.phone || '');
    } catch (err) {
        console.error('[quoteLeadsSync] contact phone lookup failed:', contactId, err?.message || err);
        return '';
    }
}

function parseTime(value) {
    const m = cell(value).match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function mapSubmission(formId, v, catalog) {
    if (formId === BIRTHDAY_FORM_ID) {
        return {
            eventType: 'birthday',
            customerName: cell(v.form_field),
            customerEmail: cell(v.form_field_1),
            customerPhone: submissionPhone(v.phone),
            eventDate: parseDate(v.form_field_3),
            requestedWorkshop: cell(v.form_field_4),
            participants: toInt(v.num_of_kids),
            adults: toInt(v.melavim),
            customerNotes: cell(v.message),
            extras: matchExtrasFromText(cell(v.form_field_5), catalog),
        };
    }
    return {
        eventType: 'event',
        customerName: [cell(v.first_name_2b33), cell(v.form_field)].filter(Boolean).join(' '),
        customerEmail: cell(v.form_field_1),
        customerPhone: submissionPhone(v.form_field_2),
        companyName: cell(v.form_field_4),
        companyRole: cell(v.form_field_3),
        participants: toInt(v.form_field_10),
        requestedWorkshop: cell(v.form_field_5),
        eventDate: parseDate(v.form_field_11),
        eventStartTime: parseTime(v.form_field_12),
        eventLocation: cell(v.form_field_7),
        eventAddress: cell(v.form_field_8),
        customerNotes: cell(v.form_field_9),
        extras: [],
    };
}

async function upsertLead(submission, ctx) {
    const submissionId = submission?._id || submission?.id;
    const formId = submission?.formId;
    if (!submissionId || (formId !== BIRTHDAY_FORM_ID && formId !== EVENT_FORM_ID)) return { skipped: true };

    const existing = await wixData.query('Quotes').eq('sourceSubmissionId', submissionId).limit(1).find(SA);
    if (existing.items.length) return { skipped: true, duplicate: true };

    const mapped = mapSubmission(formId, submission.submissions || {}, ctx.catalog);
    if (!mapped.customerPhone) mapped.customerPhone = await phoneFromContact(submission.contactId);
    const s = ctx.settings || {};
    const amounts = computeAmounts({
        basePrice: 0,
        extras: mapped.extras,
        depositType: s.defaultDepositType || 'percent',
        depositValue: s.defaultDepositValue ?? 30,
    });

    const item = {
        ...mapped,
        sourceFormId: formId,
        sourceSubmissionId: submissionId,
        basePrice: 0,
        totalAmount: amounts.totalAmount,
        depositType: amounts.depositType,
        depositValue: amounts.depositValue,
        depositAmount: amounts.depositAmount,
        balanceAmount: amounts.balanceAmount,
        workshopClosed: false,
        requiredInstructors: 0,
        allowOnlinePayment: true,
        allowBankTransfer: false,
        signatureStatus: 'pending',
        paymentStatus: 'unpaid',
        paidAmount: 0,
        status: 'lead',
        conflicts: [],
    };

    try {
        const saved = await wixData.insert('Quotes', item, SA);
        await writeQuoteLog(saved._id, 'created', { source: formId === BIRTHDAY_FORM_ID ? 'birthday_form' : 'event_form' });
        return { created: true, id: saved._id };
    } catch (err) {
        // Unique index on sourceSubmissionId: a concurrent insert already won.
        if (/unique|duplicate/i.test(err?.message || '')) return { skipped: true, duplicate: true };
        throw err;
    }
}

async function buildContext() {
    const [settings, catalog] = await Promise.all([getQuoteSettings(), loadAddonsCatalog()]);
    return { settings, catalog };
}

/** Called from events.js onSubmissionCreated. Never throws to the caller's chain beyond rejection. */
export async function handleQuoteLeadSubmission(event) {
    const submission = event?.entity || event;
    if (submission?.formId !== BIRTHDAY_FORM_ID && submission?.formId !== EVENT_FORM_ID) return;
    return upsertLead(submission, await buildContext());
}

/** Imports missing submissions of both forms. Safe to re-run. */
export async function backfillQuoteLeads() {
    const ctx = await buildContext();
    const elevatedQuery = auth.elevate(submissions.querySubmissionsByNamespace);
    const summary = { scanned: 0, created: 0, skipped: 0, errors: 0 };

    for (const formId of [BIRTHDAY_FORM_ID, EVENT_FORM_ID]) {
        let page = await elevatedQuery()
            .eq('namespace', FORMS_NAMESPACE)
            .eq('formId', formId)
            .limit(100)
            .find();
        while (page) {
            for (const sub of page.items || []) {
                summary.scanned += 1;
                try {
                    const r = await upsertLead(sub, ctx);
                    if (r.created) summary.created += 1;
                    else summary.skipped += 1;
                } catch (err) {
                    summary.errors += 1;
                    console.error('[quoteLeadsSync] backfill item failed:', sub?._id, err?.message || err);
                }
            }
            page = page.hasNext && page.hasNext() ? await page.next() : null;
        }
    }
    return summary;
}
