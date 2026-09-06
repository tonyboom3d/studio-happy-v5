// Public facade for the "ימי הולדת" landing page lead form.
// Validates and inserts submissions into the birthdayLeads collection
// (insert/read restricted to ADMIN — this module elevates via suppressAuth).
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const SA = { suppressAuth: true };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
            preferredDate: payload.preferredDate ? new Date(payload.preferredDate) : null,
            notes: sanitizeText(payload.notes, 4000),
            termsAccepted: true,
            status: 'new',
        },
    };
}

/** Inserts a lead from the birthday-landing Custom Element's contact form. */
export const submitBirthdayLead = webMethod(Permissions.Anyone, async (payload) => {
    const { error, row } = validate(payload || {});
    if (error) return { ok: false, message: error };

    try {
        await wixData.insert('birthdayLeads', row, SA);
        return { ok: true, message: 'תודה! הפנייה שלכם התקבלה ונחזור אליכם בהקדם.' };
    } catch (err) {
        console.error('[birthdayLeads.web] insert failed:', err?.message || err);
        return { ok: false, message: 'אירעה שגיאה בשליחת הפנייה. נסו שוב מאוחר יותר.' };
    }
});
