/**
 * promoEmailService.js — sends the "קופון קרמיקה במתנה" Triggered Email.
 *
 * Template created in Wix Editor -> Developer Tools -> Marketing ->
 * Triggered Emails. Email ID: VVOZq7E. Recipient type: Contact. Variables
 * (exact names, all strings): organizerName, giftPieces, couponCode,
 * workshopDate, redeemFrom, expiresAt.
 *   - The template must be Published — an unpublished template fails
 *     silently (logged here, but the order/coupon flow is never blocked).
 *
 * Never throws — a failed/missing email must never block the promo coupon
 * from being issued or sent via WhatsApp.
 */
import { contacts, triggeredEmails } from 'wix-crm-backend';
import { hasEmailMarketingConsent } from 'backend/marketingConsentService.js';

const TRIGGERED_EMAIL_ID = 'VVOZq7E';
const ISRAEL_TZ = 'Asia/Jerusalem';

function formatDateHe(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('he-IL', {
        timeZone: ISRAEL_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(d);
}

function splitName(fullName) {
    const trimmed = String(fullName || '').trim();
    if (!trimmed) return { firstName: '', lastName: '' };
    const parts = trimmed.split(/\s+/);
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') || '' };
}

async function upsertContact({ email, phone, name }) {
    const { firstName, lastName } = splitName(name);
    const info = {
        name: { first: firstName, last: lastName },
        emails: email ? [{ email }] : [],
        phones: phone ? [{ phone }] : [],
    };
    const result = await contacts.appendOrCreateContact(info);
    return result?.contactId || null;
}

/**
 * Sends the promo-coupon email for a just-issued PromoCoupons row. Never
 * throws — logs and returns { sent: false, reason } on any failure.
 */
export async function sendTuftingPromoCouponEmail(couponRow) {
    try {
        if (!couponRow?.organizerEmail) {
            console.warn('[promoEmailService] Skipping — no organizerEmail. couponId:', couponRow?._id);
            return { sent: false, reason: 'no-email' };
        }

        // This is a MARKETING email (unlike a plain order-confirmation
        // receipt) — Israel's anti-spam law (חוק הספאם) requires prior
        // opt-in. See marketingConsentService.js — gated on the site's
        // checkout "subscribe to marketing" checkbox.
        const consented = await hasEmailMarketingConsent(couponRow.organizerEmail);
        if (!consented) {
            console.log('[promoEmailService] Skipped — no marketing consent for email. couponId:', couponRow._id);
            return { sent: false, reason: 'no-marketing-consent' };
        }

        const contactId = await upsertContact({
            email: couponRow.organizerEmail,
            phone: couponRow.organizerPhone,
            name: couponRow.organizerName,
        });
        if (!contactId) {
            console.warn('[promoEmailService] appendOrCreateContact returned no contactId. couponId:', couponRow._id);
            return { sent: false, reason: 'no-contact-id' };
        }

        const variables = {
            organizerName: couponRow.organizerName || 'לקוח/ה יקר/ה',
            giftPieces: String(couponRow.giftPieces ?? ''),
            couponCode: couponRow.code,
            workshopDate: formatDateHe(couponRow.workshopStart),
            redeemFrom: formatDateHe(couponRow.redeemFrom),
            expiresAt: formatDateHe(couponRow.expiresAt),
        };

        await triggeredEmails.emailContact(TRIGGERED_EMAIL_ID, contactId, { variables });

        console.log(`[promoEmailService] ✅ VVOZq7E email sent. couponId=${couponRow._id} contactId=${contactId} code=${couponRow.code}`);
        return { sent: true, contactId };
    } catch (err) {
        console.error('[promoEmailService] sendTuftingPromoCouponEmail failed. couponId:', couponRow?._id, 'error:', err?.message || err);
        return { sent: false, reason: 'error', error: err?.message || String(err) };
    }
}
