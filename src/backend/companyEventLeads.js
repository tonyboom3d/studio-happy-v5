// Company-event form (dc59834f) → sheet "אירועי חברה" on the shared leads
// spreadsheet, then the same studio WhatsApp template used for birthday leads.
import { fetch } from 'wix-fetch';
import { sendBirthdayLeadNoticeManyChat } from 'backend/manychatService.jsw';

const COMPANY_FORM_ID = 'dc59834f-f944-42e1-a576-9b304c87be92';
const SHEET_NAME = 'אירועי חברה';
const APPSCRIPT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxKJW63NHuDBDn-xGBtrZGVuyJ_Wp85WS3bhybV4MYTb-2bUGb64MRpJxklw4AroZYy/exec';
const STUDIO_MANYCHAT_SUBSCRIBER_ID = '1613710579';

/** Column order matches the form summary, plus the inquiry timestamp. */
const COLUMNS = [
    { target: 'first_name_2b33', header: 'שם' },
    { target: 'form_field', header: 'שם משפחה' },
    { target: 'form_field_1', header: 'דוא"ל' },
    { target: 'form_field_2', header: 'טלפון' },
    { target: 'form_field_4', header: 'שם חברה' },
    { target: 'form_field_3', header: 'תפקיד בחברה' },
    { target: 'form_field_10', header: 'כמה משתתפים ?' },
    { target: 'form_field_5', header: 'סוג סדנה רצוייה' },
    { target: 'form_field_11', header: 'תאריך האירוע' },
    { target: 'form_field_12', header: 'שעה' },
    { target: 'form_field_7', header: 'איפה תרצו לעשות את הסדנה ?' },
    { target: 'form_field_8', header: 'כתובת המשרדים' },
    { target: 'form_field_9', header: 'הערות נוספות ?' },
    { target: 'form_field_62d5', header: 'הסכמה לתנאי השימוש' },
];

function formatInquiryDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

function formatCell(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'boolean') return value ? 'כן' : 'לא';
    if (Array.isArray(value)) return value.map(formatCell).filter(Boolean).join(', ');
    if (typeof value === 'object') {
        if (value.date || value.time) return [value.date, value.time].filter(Boolean).join(' ');
        if (value.formatted) return String(value.formatted);
        if (value.phone || value.number) return String(value.phone || value.number);
        return JSON.stringify(value);
    }
    return String(value);
}

function buildRow(fieldValues) {
    const values = COLUMNS.map((column) => formatCell(fieldValues?.[column.target]));
    values.push(formatInquiryDate());
    return values;
}

async function appendCompanyEventLead(fieldValues) {
    const payload = {
        sheet: SHEET_NAME,
        headers: [...COLUMNS.map((column) => column.header), 'תאריך פנייה'],
        values: buildRow(fieldValues),
    };
    // Query string: Apps Script turns an external POST into a GET and drops the body.
    const response = await fetch(`${APPSCRIPT_ENDPOINT}?payload=${encodeURIComponent(JSON.stringify(payload))}`, {
        method: 'get',
    });
    const text = await response.text();
    const json = (() => { try { return JSON.parse(text); } catch (_) { return null; } })();
    console.log('[companyEventLeads] sheet response:', text.slice(0, 500));
    if (!response.ok || !json?.ok) {
        throw new Error(`Apps Script responded ${response.status}: ${text.slice(0, 500)}`);
    }
    return json;
}

/** Sheet first, then the existing studio WhatsApp template. */
export async function handleCompanyEventSubmission(event) {
    const submission = event?.entity || event;
    console.log('[companyEventLeads] onSubmissionCreated fired. formId:', submission?.formId, 'expected:', COMPANY_FORM_ID);
    if (submission?.formId !== COMPANY_FORM_ID) return;

    console.log('[companyEventLeads] matched company form. submissions:', JSON.stringify(submission.submissions || {}));

    try {
        await appendCompanyEventLead(submission.submissions || {});
    } catch (err) {
        console.error('[companyEventLeads] sheet append failed:', err?.message || err);
        return;
    }

    const wa = await sendBirthdayLeadNoticeManyChat(STUDIO_MANYCHAT_SUBSCRIBER_ID);
    if (!wa?.sent) console.error('[companyEventLeads] WhatsApp notice failed:', JSON.stringify(wa));
}
