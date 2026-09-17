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
import { emailSubscriptions } from '@wix/email-subscriptions';
import { marketingConsent } from '@wix/marketing';
import { auth } from '@wix/essentials';
import { normalizeIsraeliPhone } from 'backend/orderUtils.js';

/** @type {Function | null} */
let elevatedQueryEmailSubscriptions = null;
function getElevatedQueryEmailSubscriptions() {
    if (!elevatedQueryEmailSubscriptions) {
        elevatedQueryEmailSubscriptions = auth.elevate(emailSubscriptions.queryEmailSubscriptions);
    }
    return elevatedQueryEmailSubscriptions;
}

/** @type {Function | null} */
let elevatedQueryMarketingConsent = null;
function getElevatedQueryMarketingConsent() {
    if (!elevatedQueryMarketingConsent) {
        elevatedQueryMarketingConsent = auth.elevate(marketingConsent.queryMarketingConsent);
    }
    return elevatedQueryMarketingConsent;
}

/**
 * True only if the email has an active marketing subscription (SUBSCRIBED).
 * Never throws.
 */
export async function hasEmailMarketingConsent(/** @type {string} */ email) {
    const trimmed = String(email || '').trim();
    if (!trimmed) return false;
    try {
        const queryFn = getElevatedQueryEmailSubscriptions();
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
        const queryFn = getElevatedQueryMarketingConsent();
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
