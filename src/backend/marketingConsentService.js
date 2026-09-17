/**
 * marketingConsentService.js — gate for sending MARKETING content (not
 * transactional/order messages) by email/WhatsApp.
 *
 * Context: the "טאפטינג + קרמיקה במתנה" promo-coupon message (WhatsApp +
 * email) is a marketing communication — unlike the plain "אישור הזמנה"
 * confirmation, which is transactional and doesn't require opt-in consent
 * under Israel's Communications Law (Amendment 40 / "חוק הספאם", section 30א).
 *
 * ⚠️ MANUAL SETUP REQUIRED (Wix Dashboard -> eCommerce -> Settings -> Checkout
 * -> Checkout Fields): turn ON the "Subscribe to marketing" checkbox
 * (`checkoutFields.subscriptionCheckbox.visible = true`). This is a SITE-WIDE
 * checkout setting (applies to every Wix checkout on the site — tufting,
 * ceramics, candles, add-ons), not something this codebase can restrict to a
 * single workshop type. When a buyer checks it, Wix automatically records a
 * confirmed Marketing Consent for their email/phone (no code needed for that
 * part) — this module only READS that consent before sending the coupon.
 *
 * This module never throws and always "fails closed": if consent can't be
 * confirmed (no record, error, ambiguous state), the answer is `false` (do
 * NOT send) — that's the safe default for a consent gate.
 */
import { normalizeIsraeliPhone } from 'backend/orderUtils.js';

// ⚠️ Loaded/elevated LAZILY on purpose (never as a top-level `import` of
// '@wix/email-subscriptions' / '@wix/marketing' / '@wix/essentials'): on
// Wix Cloud (YarnPNP) these packages have failed to resolve at require-time
// even though they're listed in package.json ("Cannot find module ... isn't
// declared in your dependencies"). A top-level import that throws crashes
// THIS WHOLE MODULE on load — which crashes every file that transitively
// requires it (manychatService.jsw -> bookingService.web.js), which breaks
// checkout for EVERY booking, not just consent checks. Dynamic import +
// try/catch keeps a missing/broken package isolated to "fail closed" (no
// consent -> don't send marketing) instead of taking down bookings.
/** @type {Promise<Function> | null} */
let elevatedQueryEmailSubscriptionsPromise = null;
async function getElevatedQueryEmailSubscriptions() {
    if (!elevatedQueryEmailSubscriptionsPromise) {
        elevatedQueryEmailSubscriptionsPromise = (async () => {
            const { emailSubscriptions } = await import('@wix/email-subscriptions');
            const { auth } = await import('@wix/essentials');
            if (!emailSubscriptions?.queryEmailSubscriptions) {
                throw new Error('@wix/email-subscriptions queryEmailSubscriptions is unavailable on this site');
            }
            return auth.elevate(emailSubscriptions.queryEmailSubscriptions);
        })();
    }
    return elevatedQueryEmailSubscriptionsPromise;
}

/** @type {Promise<Function> | null} */
let elevatedQueryMarketingConsentPromise = null;
async function getElevatedQueryMarketingConsent() {
    if (!elevatedQueryMarketingConsentPromise) {
        elevatedQueryMarketingConsentPromise = (async () => {
            const { marketingConsent } = await import('@wix/marketing');
            const { auth } = await import('@wix/essentials');
            if (!marketingConsent?.queryMarketingConsent) {
                throw new Error('@wix/marketing queryMarketingConsent is unavailable on this site');
            }
            return auth.elevate(marketingConsent.queryMarketingConsent);
        })();
    }
    return elevatedQueryMarketingConsentPromise;
}

/**
 * True only if the email has an active marketing subscription (SUBSCRIBED).
 * Never throws.
 */
export async function hasEmailMarketingConsent(/** @type {string} */ email) {
    const trimmed = String(email || '').trim();
    if (!trimmed) return false;
    try {
        const queryFn = await getElevatedQueryEmailSubscriptions();
        const response = await queryFn(
            { email: { $in: [trimmed] } },
            { paging: { limit: 1, offset: 0 } },
        );
        const sub = response?.subscriptions?.[0];
        const subscribed = sub?.subscriptionStatus === 'SUBSCRIBED';
        console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=${subscribed} status=${sub?.subscriptionStatus || 'none'}`);
        return subscribed;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`🎟️[PROMO] email consent check: ${trimmed} -> no consent record (${message})`);
        return false;
    }
}

/**
 * True only if there is a CONFIRMED phone marketing consent (WhatsApp/SMS).
 * Never throws.
 */
export async function hasPhoneMarketingConsent(/** @type {string} */ phone) {
    const e164 = normalizeIsraeliPhone(phone);
    if (!e164) return false;
    try {
        const queryFn = await getElevatedQueryMarketingConsent();
        const response = await queryFn({
            filter: {
                'details.phone': { $eq: e164 },
                state: { $eq: 'CONFIRMED' },
            },
            cursorPaging: { limit: 1 },
        });
        const consent = response?.marketingConsent?.[0];
        const granted = consent?.state === 'CONFIRMED';
        console.log(`🎟️[PROMO] phone consent check: ${e164} -> granted=${granted} state=${consent?.state || 'none'}`);
        return granted;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`🎟️[PROMO] phone consent check: ${e164} -> no consent record (${message})`);
        return false;
    }
}
