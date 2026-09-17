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
import { marketingConsent } from 'wix-marketing.v2';
import { elevate } from 'wix-auth';

// NOTE: import moved to top of file per request. `wix-marketing.v2` is a
// preview/rollout-gated Wix API ("subject to change") and may not be
// available on every site yet — if the module/export is missing, this
// top-level import can throw and crash THIS WHOLE MODULE on load, which
// breaks every other file that transitively imports this one (e.g.
// bookingService.web.js). Kept the try/catch around `elevate(...)` below so
// a missing export still fails closed instead of crashing.
/** @type {Promise<Function> | null} */
let elevatedGetMarketingConsentByIdentifierPromise = null;
async function getElevatedGetMarketingConsentByIdentifier() {
    if (!elevatedGetMarketingConsentByIdentifierPromise) {
        elevatedGetMarketingConsentByIdentifierPromise = (async () => {
            if (!marketingConsent?.getMarketingConsentByIdentifier) {
                throw new Error('wix-marketing.v2 marketingConsent.getMarketingConsentByIdentifier is unavailable on this site');
            }
            return elevate(marketingConsent.getMarketingConsentByIdentifier);
        })();
    }
    return elevatedGetMarketingConsentByIdentifierPromise;
}

/**
 * True only if there is a CONFIRMED marketing consent granting communication
 * eligibility for this email address. Never throws.
 */
export async function hasEmailMarketingConsent(/** @type {string} */ email) {
    const trimmed = String(email || '').trim();
    if (!trimmed) return false;
    try {
        const fn = await getElevatedGetMarketingConsentByIdentifier();
        const result = await fn('EMAIL', { email: trimmed });
        const granted = !!result?.communicationEligibility?.granted;
        console.log(`[marketingConsentService] email consent check: ${trimmed} -> granted=${granted} state=${result?.marketingConsent?.state}`);
        return granted;
    } catch (err) {
        // A 404/"not found" here just means the visitor never opted in — not an error.
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[marketingConsentService] email consent check: ${trimmed} -> no consent record (${message})`);
        return false;
    }
}

/**
 * True only if there is a CONFIRMED marketing consent granting communication
 * eligibility for this phone number (used for WhatsApp/SMS). Never throws.
 */
export async function hasPhoneMarketingConsent(/** @type {string} */ phone) {
    const e164 = normalizeIsraeliPhone(phone);
    if (!e164) return false;
    try {
        const fn = await getElevatedGetMarketingConsentByIdentifier();
        const result = await fn('PHONE', { phone: e164 });
        const granted = !!result?.communicationEligibility?.granted;
        console.log(`[marketingConsentService] phone consent check: ${e164} -> granted=${granted} state=${result?.marketingConsent?.state}`);
        return granted;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[marketingConsentService] phone consent check: ${e164} -> no consent record (${message})`);
        return false;
    }
}
