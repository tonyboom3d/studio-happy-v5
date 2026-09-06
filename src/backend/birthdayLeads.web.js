// Public facade for the "ימי הולדת" landing page — workshop data + lead form.
// Submissions are sent to the site's Wix Form (My Form 1).
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { submissions } from '@wix/forms';
import { auth } from '@wix/essentials';

const SA = { suppressAuth: true };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIRTHDAY_FORM_ID = 'dfecbbfe-54a0-4003-9753-9aaaaf14fe5d';

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

/** Returns all birthday workshop items for the landing page Custom Element. */
export const getBirthdayWorkshops = webMethod(Permissions.Anyone, async () => {
    try {
        const result = await wixData.query('birthdayWorkshops').ascending('order').limit(50).find(SA);
        return { workshops: result.items || [] };
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
        return { ok: true, message: 'תודה! הפנייה שלכם התקבלה ונחזור אליכם בהקדם.' };
    } catch (err) {
        console.error('[birthdayLeads.web] Wix form submission failed:', err?.message || err, err?.details || '');
        return { ok: false, message: 'אירעה שגיאה בשליחת הפנייה. נסו שוב מאוחר יותר.' };
    }
});
