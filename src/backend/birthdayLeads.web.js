// Public facade for the "ימי הולדת" landing page — workshop data + lead form.
//
// The actual Wix Form submission (#form1, formId dfecbbfe-...) is now created
// CLIENT-SIDE by the page's Velo code via $w('#form1').setFieldValues(...) +
// $w('#form1').submit() — NOT from this backend module. This lets the Wix
// Forms app run its own visitor/mailing-list-consent handling correctly.
// This module only: (1) validates the lead and maps it to the Wix Form's
// field-target keys for the page to feed into the real form, and (2) runs
// the side effects (Google Sheet append + WhatsApp notice) once the page
// confirms the real Wix Form submission succeeded.
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { sendBirthdayLeadNoticeManyChat } from 'backend/manychatService.jsw';
import { postSheetWebhook } from 'backend/sheetWebhook.js';
import { resolveBirthdayAddons } from 'backend/birthdayAddons.js';

const SA = { suppressAuth: true };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Apps Script Web App URL for the "ימי הולדת" leads sheet — see
// wix/apps-script/birthdayLeads.gs. Left blank until supplied; the sheet
// append is skipped (no-op) while empty.
const APPSCRIPT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzt0sQ1UAJxCrnskKuUxEAVFyajx2vT8HvXvZ9HIwCpgixtVoqMSE_Mz_ZvBGZjBrFg/exec';

// Studio ManyChat subscriber that receives the "new lead" template.
const STUDIO_MANYCHAT_SUBSCRIBER_ID = '1613710579';

/**
 * Wix Form (#form1) field target keys — must match the form schema's default
 * field keys (open the field in the Forms editor > Advanced tab to see its key).
 */
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
    addons: 'form_field_5',
};

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

    const addons = resolveBirthdayAddons(payload.addons);

    return {
        row: {
            fullName,
            email,
            phone,
            workshopTypes: Array.isArray(payload.workshopTypes) ? payload.workshopTypes.map((t) => sanitizeText(t, 200)).filter(Boolean) : [],
            addons,
            addonsTotal: addons.reduce((sum, a) => sum + (Number(a.price) || 0), 0),
            childrenCount: Math.max(0, Math.min(100, Number(payload.childrenCount) || 0)),
            adultsCount: Math.max(0, Math.min(100, Number(payload.adultsCount) || 0)),
            preferredDate: payload.preferredDate ? sanitizeText(payload.preferredDate, 10) : '',
            notes: sanitizeText(payload.notes, 4000),
            termsAccepted: true,
        },
    };
}

/** Formats the resolved add-ons as "Title (₪price), Title (₪price)" for notes/sheet columns. */
function formatAddonsList(addons) {
    return (addons || []).map((a) => `${a.title} (${a.price}₪)`).join(', ');
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
        [FORM_FIELDS.addons]: formatAddonsList(row.addons),
    };

    const preferredDate = formatDateForForm(row.preferredDate);
    if (preferredDate) submissionValues[FORM_FIELDS.preferredDate] = preferredDate;

    return submissionValues;
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
            addons: formatAddonsList(row.addons),
            addons_total: row.addonsTotal || 0,
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

/**
 * Validates a lead from the birthday-landing Custom Element and maps it to
 * #form1's field-target keys. The PAGE then feeds these into the real,
 * hidden Wix Form via $w('#form1').setFieldValues(...) + .submit() — this
 * backend module never creates the submission itself (avoids duplicates).
 */
export const buildBirthdayFormValues = webMethod(Permissions.Anyone, async (payload) => {
    const { error, row } = validate(payload || {});
    if (error) return { ok: false, message: error };
    return {
        ok: true,
        submissionValues: buildWixFormSubmission(row),
        message: 'הפנייה נשלחה בהצלחה! נחזור אליכם טלפונית או בוואטסאפ עם פרטים נוספים בהקדם האפשרי.',
    };
});

/**
 * Runs best-effort side effects (Google Sheet append + WhatsApp notice) —
 * called by the page ONLY after the real Wix Form submission (#form1)
 * succeeds client-side. Re-validates the same payload to rebuild `row`.
 */
export const recordBirthdayLeadSideEffects = webMethod(Permissions.Anyone, async (payload) => {
    const { error, row } = validate(payload || {});
    if (error) return { ok: false, message: error };

    const [sheetResult, waResult] = await Promise.allSettled([
        appendBirthdayLeadToSheet(row),
        notifyBirthdayLeadWhatsApp(),
    ]);
    console.log('[birthdayLeads.web] side effects:', JSON.stringify({
        sheet: sheetResult.status === 'fulfilled' ? sheetResult.value : String(sheetResult.reason),
        whatsapp: waResult.status === 'fulfilled' ? waResult.value : String(waResult.reason),
    }));

    return { ok: true };
});
