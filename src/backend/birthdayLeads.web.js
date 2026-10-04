// Public facade for the "ימי הולדת" landing page — workshop data + lead form.
// Submissions are sent to the site's Wix Form (My Form 1), appended to the
// "ימי הולדת" Google Sheet (via an Apps Script Web App), and announced to
// the studio over WhatsApp (free text, via the existing ManyChat subscriber).
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { submissions } from '@wix/forms';
import { auth } from '@wix/essentials';
import { sendBirthdayLeadNoticeManyChat } from 'backend/manychatService.jsw';
import { postSheetWebhook } from 'backend/sheetWebhook.js';

const SA = { suppressAuth: true };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIRTHDAY_FORM_ID = 'dfecbbfe-54a0-4003-9753-9aaaaf14fe5d';

// Apps Script Web App URL for the "ימי הולדת" leads sheet — see
// wix/apps-script/birthdayLeads.gs. Left blank until supplied; the sheet
// append is skipped (no-op) while empty.
const APPSCRIPT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxKJW63NHuDBDn-xGBtrZGVuyJ_Wp85WS3bhybV4MYTb-2bUGb64MRpJxklw4AroZYy/exec';

// Studio ManyChat subscriber that receives the "new lead" template.
const STUDIO_MANYCHAT_SUBSCRIBER_ID = '1613710579';

/** Wix Form field targets — must match the form schema storage keys. */
const FORM_FIELDS = {
    fullName: 'form_field',
    email: 'form_field_1',
    phone: 'form_field_2',
    preferredDate: 'form_field_3',
    workshopType: 'form_field_4',
    childrenCount: 'num_of_kids',
    adultsCount: 'melavim',
    notes: 'message',
    termsAccepted: 'subscribe',
};

const elevatedCreateSubmission = auth.elevate(submissions.createSubmission);

function sanitizeText(value, maxLength) {
    return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function validate(payload) {
    const fullName = sanitizeText(payload.fullName, 200);
    const email = sanitizeText(payload.email, 200);
    const phone = sanitizeText(payload.phone, 40);
    const phoneDigits = phone.replace(/\D/g, '');

    if (!fullName) return { error: 'נא למלא שם מלא.' };
    if (!EMAIL_RE.test(email)) return { error: 'נא להזין כתובת אימייל תקינה.' };
    if (phoneDigits.length < 9 || phoneDigits.length > 10) return { error: 'נא להזין מספר טלפון תקין.' };
    if (!payload.termsAccepted) return { error: 'יש לאשר את תנאי השימוש כדי להמשיך.' };

    return {
        row: {
            fullName,
            email,
            phone,
            workshopTypes: Array.isArray(payload.workshopTypes) ? payload.workshopTypes.map((t) => sanitizeText(t, 200)).filter(Boolean) : [],
            childrenCount: Math.max(0, Math.min(100, Number(payload.childrenCount) || 0)),
            adultsCount: Math.max(0, Math.min(100, Number(payload.adultsCount) || 0)),
            preferredDate: payload.preferredDate ? sanitizeText(payload.preferredDate, 10) : '',
            notes: sanitizeText(payload.notes, 4000),
            termsAccepted: true,
        },
    };
}

function formatDateForForm(value) {
    const raw = sanitizeText(value, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return '';
}

function buildWixFormSubmission(row) {
    const submissionValues = {
        [FORM_FIELDS.fullName]: row.fullName,
        [FORM_FIELDS.email]: row.email,
        [FORM_FIELDS.phone]: row.phone,
        [FORM_FIELDS.workshopType]: (row.workshopTypes || []).join(', '),
        [FORM_FIELDS.childrenCount]: row.childrenCount,
        [FORM_FIELDS.adultsCount]: row.adultsCount,
        [FORM_FIELDS.notes]: row.notes || '',
        [FORM_FIELDS.termsAccepted]: true,
    };

    const preferredDate = formatDateForForm(row.preferredDate);
    if (preferredDate) submissionValues[FORM_FIELDS.preferredDate] = preferredDate;

    return submissionValues;
}

async function submitToWixForm(row) {
    return elevatedCreateSubmission({
        formId: BIRTHDAY_FORM_ID,
        submissions: buildWixFormSubmission(row),
    });
}

/** Appends one row to the "ימי הולדת" Google Sheet via the Apps Script Web App. No-op until APPSCRIPT_ENDPOINT is set. */
async function appendBirthdayLeadToSheet(row) {
    if (!APPSCRIPT_ENDPOINT) {
        console.warn('[birthdayLeads.web] appendBirthdayLeadToSheet skipped — APPSCRIPT_ENDPOINT not configured yet.');
        return { ok: false, reason: 'not-configured' };
    }

    try {
        await postSheetWebhook(APPSCRIPT_ENDPOINT, {
            ...buildWixFormSubmission(row),
            inquiry_date: formatInquiryDate(),
        });
        return { ok: true };
    } catch (err) {
        console.error('[birthdayLeads.web] appendBirthdayLeadToSheet failed:', err?.message || err);
        return { ok: false, reason: 'error', error: err?.message || String(err) };
    }
}

/** Israel-local timestamp written to column I ("תאריך פנייה"). */
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

/** Sends the studio the approved WhatsApp template (notification_type = birthday_lead) — works outside the 24h window. */
async function notifyBirthdayLeadWhatsApp() {
    try {
        return await sendBirthdayLeadNoticeManyChat(STUDIO_MANYCHAT_SUBSCRIBER_ID);
    } catch (err) {
        console.error('[birthdayLeads.web] notifyBirthdayLeadWhatsApp failed:', err?.message || err);
        return { sent: false, reason: 'error', error: err?.message || String(err) };
    }
}

/**
 * CMS field `menuCardImage` (Image) — card thumbnail on /birthday menu.
 * Falls back to the first gallery image when empty.
 */
function resolveMenuCardImage(item) {
    const menuImage = item.menuCardImage || item.menuCardImageUrl || '';
    if (menuImage) return menuImage;
    const gallery = Array.isArray(item.gallery) ? item.gallery : [];
    return gallery[0] || '';
}

/** CMS field `workshopSlug` (Text) — English URL name, e.g. "Pottery Party". Falls back to _id. */
function resolveWorkshopSlug(item) {
    return String(item.workshopSlug || '').trim();
}

function mapWorkshopItem(item) {
    const workshopSlug = resolveWorkshopSlug(item);
    return {
        ...item,
        menuCardImage: resolveMenuCardImage(item),
        workshopSlug,
        urlRef: workshopSlug || item._id || '',
    };
}

/** Returns all birthday workshop items for the landing page Custom Element. */
export const getBirthdayWorkshops = webMethod(Permissions.Anyone, async () => {
    try {
        const result = await wixData.query('birthdayWorkshops').ascending('order').limit(50).find(SA);
        return { workshops: (result.items || []).map(mapWorkshopItem) };
    } catch (err) {
        console.error('[birthdayLeads.web] getBirthdayWorkshops failed:', err?.message || err);
        return { workshops: [] };
    }
});

/** Sends a lead from the birthday-landing Custom Element to the Wix Form. */
export const submitBirthdayLead = webMethod(Permissions.Anyone, async (payload) => {
    const { error, row } = validate(payload || {});
    if (error) return { ok: false, message: error };

    try {
        await submitToWixForm(row);
    } catch (err) {
        console.error('[birthdayLeads.web] Wix form submission failed:', err?.message || err, err?.details || '');
        return { ok: false, message: 'אירעה שגיאה בשליחת הפנייה. נסו שוב מאוחר יותר.' };
    }

    // Best-effort side effects — never block the customer-facing success
    // response if the sheet or WhatsApp notice fails.
    // Awaited: un-awaited promises can be cut off once the web method returns.
    const [sheetResult, waResult] = await Promise.allSettled([
        appendBirthdayLeadToSheet(row),
        notifyBirthdayLeadWhatsApp(),
    ]);
    console.log('[birthdayLeads.web] side effects:', JSON.stringify({
        sheet: sheetResult.status === 'fulfilled' ? sheetResult.value : String(sheetResult.reason),
        whatsapp: waResult.status === 'fulfilled' ? waResult.value : String(waResult.reason),
    }));

    return { ok: true, message: 'הפנייה נשלחה בהצלחה! נחזור אליכם טלפונית או בוואטסאפ עם פרטים נוספים בהקדם האפשרי.' };
});
