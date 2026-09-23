/**
 * marketingConsentService.web.js — gate for sending MARKETING content (not
 * transactional/order messages) by email/WhatsApp.
 *
 * Checkout "subscribe to marketing" records consent asynchronously — the paid
 * hook can fire before Wix indexes email-subscriptions / marketing-consent.
 * waitFor*() polls with backoff; has*() is a single check (dashboard resend).
 *
 * Email consent order: CRM extendedFields → marketing-consent (email) →
 * email-subscriptions API → CRM info.emails / primaryInfo.
 */
import { contacts } from 'wix-crm-backend';
import { normalizeIsraeliPhone, getPhoneLookupVariants, phonesMatch } from 'backend/orderUtils.js';

/** Delays between consent poll attempts after checkout (ms). First try is immediate. */
const CHECKOUT_CONSENT_POLL_DELAYS_MS = [3000, 5000, 10000, 15000];

const EXT_EMAIL_SUB_STATUS = 'emailSubscriptions.subscriptionStatus';

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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEmailForQuery(email) {
    return String(email || '').trim().toLowerCase();
}

function isSubscribedStatus(statusField) {
    if (!statusField) return false;
    const status = typeof statusField === 'string' ? statusField : statusField?.status;
    return status === 'SUBSCRIBED';
}

function formatStatusDetail(statusField) {
    if (statusField == null || statusField === '') return 'none';
    return typeof statusField === 'string' ? statusField : (statusField?.status || String(statusField));
}

function readContactExtendedEmailSubscriptionStatus(contact) {
    const ext = contact?.info?.extendedFields?.[EXT_EMAIL_SUB_STATUS];
    return formatStatusDetail(ext);
}

/** CRM system field — checkout often updates this before email-subscriptions API. */
async function checkEmailViaContactExtendedFields(email) {
    const queryEmail = normalizeEmailForQuery(email);
    const chained = await contacts.queryContacts()
        .eq('primaryInfo.email', queryEmail)
        .eq(`info.extendedFields.${EXT_EMAIL_SUB_STATUS}`, 'SUBSCRIBED')
        .limit(1)
        .find()
        .catch(() => ({ items: [] }));

    if (chained.items?.[0]) {
        const status = readContactExtendedEmailSubscriptionStatus(chained.items[0]);
        // console.log(`🎟️[PROMO] email consent step contacts-extendedFields: ${queryEmail} -> subscribed=true status=${status} (chained query)`);
        return { subscribed: true, detail: status, source: 'contacts.extendedFields' };
    }

    const lookups = [
        () => contacts.queryContacts().eq('primaryInfo.email', queryEmail).limit(1).find(),
        () => contacts.queryContacts().eq('info.emails.email', queryEmail).limit(1).find(),
    ];
    for (const run of lookups) {
        const result = await run().catch(() => ({ items: [] }));
        const contact = result?.items?.[0];
        if (!contact) continue;
        const status = readContactExtendedEmailSubscriptionStatus(contact);
        if (isSubscribedStatus(contact.info?.extendedFields?.[EXT_EMAIL_SUB_STATUS])) {
            // console.log(`🎟️[PROMO] email consent step contacts-extendedFields: ${queryEmail} -> subscribed=true status=${status}`);
            return { subscribed: true, detail: status, source: 'contacts.extendedFields' };
        }
        // console.log(`🎟️[PROMO] email consent step contacts-extendedFields: ${queryEmail} -> subscribed=false status=${status}`);
        return { subscribed: false, detail: status, source: 'contacts.extendedFields' };
    }

    // console.log(`🎟️[PROMO] email consent step contacts-extendedFields: ${queryEmail} -> no contact`);
    return { subscribed: false, detail: 'no-contact', source: 'contacts.extendedFields' };
}

/** Checkout marketing opt-in — same API as phone, filtered by email. */
async function checkEmailViaMarketingConsent(email) {
    const queryEmail = normalizeEmailForQuery(email);
    const queryFn = await getElevatedQueryMarketingConsent();
    const response = await queryFn({
        filter: {
            'details.email': { $eq: queryEmail },
            state: { $eq: 'CONFIRMED' },
        },
        cursorPaging: { limit: 1 },
    });
    const consent = response?.marketingConsent?.[0];
    const granted = consent?.state === 'CONFIRMED';
    const detail = consent?.state || 'none';
    // console.log(`🎟️[PROMO] email consent step marketing-consent: ${queryEmail} -> granted=${granted} state=${detail}`);
    return { subscribed: granted, detail, source: 'marketing-consent' };
}

async function checkEmailViaSubscriptions(email) {
    const queryEmail = normalizeEmailForQuery(email);
    const queryFn = await getElevatedQueryEmailSubscriptions();
    const response = await queryFn(
        { email: { $in: [queryEmail] } },
        { paging: { limit: 1, offset: 0 } },
    );
    const sub = response?.subscriptions?.[0];
    const subscribed = isSubscribedStatus(sub?.subscriptionStatus);
    const detail = formatStatusDetail(sub?.subscriptionStatus);
    // console.log(`🎟️[PROMO] email consent step email-subscriptions: ${queryEmail} -> subscribed=${subscribed} status=${detail}`);
    return { subscribed, detail, source: 'email-subscriptions' };
}

async function checkEmailViaContacts(email) {
    const lowered = normalizeEmailForQuery(email);
    const queries = [
        () => contacts.queryContacts().eq('primaryInfo.email', lowered).limit(1).find(),
        () => contacts.queryContacts().eq('info.emails.email', lowered).limit(1).find(),
    ];
    for (const run of queries) {
        const result = await run();
        const contact = result?.items?.[0];
        if (!contact) continue;
        const emails = contact.info?.emails || [];
        const match = emails.find((e) => normalizeEmailForQuery(e?.email) === lowered);
        if (match && isSubscribedStatus(match.subscriptionStatus)) {
            // console.log(`🎟️[PROMO] email consent step contacts.emails: ${lowered} -> subscribed=true`);
            return { subscribed: true, detail: 'SUBSCRIBED', source: 'contacts.emails' };
        }
        if (isSubscribedStatus(contact.primaryInfo?.subscriptionStatus)) {
            // console.log(`🎟️[PROMO] email consent step contacts.primaryInfo: ${lowered} -> subscribed=true`);
            return { subscribed: true, detail: 'SUBSCRIBED', source: 'contacts.primaryInfo' };
        }
    }
    // console.log(`🎟️[PROMO] email consent step contacts fallback: ${lowered} -> subscribed=false`);
    return { subscribed: false, detail: 'none', source: 'contacts' };
}

async function checkPhoneViaMarketingConsent(e164) {
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
    return { granted, detail: consent?.state || 'none', source: 'marketing-consent' };
}

async function checkPhoneViaContacts(e164) {
    for (const variant of getPhoneLookupVariants(e164)) {
        const result = await contacts.queryContacts()
            .eq('info.phones.phone', variant)
            .limit(1)
            .find();
        const contact = result?.items?.[0];
        if (!contact) continue;
        const phones = contact.info?.phones || [];
        const match = phones.find((p) => phonesMatch(p?.phone, e164));
        if (match && isSubscribedStatus(match.subscriptionStatus)) {
            return { granted: true, detail: 'SUBSCRIBED', source: 'contacts.phones' };
        }
    }
    return { granted: false, detail: 'none', source: 'contacts' };
}

/**
 * Single-shot email consent check (SDK + CRM fallback). Never throws.
 */
export async function hasEmailMarketingConsent(/** @type {string} */ email) {
    const trimmed = normalizeEmailForQuery(email);
    if (!trimmed) return false;
    try {
        const viaExt = await checkEmailViaContactExtendedFields(trimmed).catch((err) => ({
            subscribed: false,
            detail: err instanceof Error ? err.message : String(err),
            source: 'contacts-extendedFields-error',
        }));
        if (viaExt.subscribed) {
            // console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=true source=${viaExt.source} status=${viaExt.detail}`);
            return true;
        }

        const viaMarketing = await checkEmailViaMarketingConsent(trimmed).catch((err) => ({
            subscribed: false,
            detail: err instanceof Error ? err.message : String(err),
            source: 'marketing-consent-error',
        }));
        if (viaMarketing.subscribed) {
            // console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=true source=${viaMarketing.source} status=${viaMarketing.detail}`);
            return true;
        }

        const viaApi = await checkEmailViaSubscriptions(trimmed).catch((err) => ({
            subscribed: false,
            detail: err instanceof Error ? err.message : String(err),
            source: 'email-subscriptions-error',
        }));
        if (viaApi.subscribed) {
            // console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=true source=${viaApi.source} status=${viaApi.detail}`);
            return true;
        }

        const viaContacts = await checkEmailViaContacts(trimmed).catch(() => ({
            subscribed: false,
            detail: 'error',
            source: 'contacts-error',
        }));
        if (viaContacts.subscribed) {
            // console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=true source=${viaContacts.source} (CRM fallback) status=${viaContacts.detail}`);
            return true;
        }

        // console.log(
            // `🎟️[PROMO] email consent check: ${trimmed} -> subscribed=false contactsExt=${viaExt.detail} marketing=${viaMarketing.detail} api=${viaApi.detail} contacts=${viaContacts.detail}`,
        // );
        return false;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // console.log(`🎟️[PROMO] email consent check: ${trimmed} -> no consent record (${message})`);
        return false;
    }
}

/**
 * Polls email consent after checkout — Wix may need a few seconds to index
 * the subscription. Never throws.
 */
export async function waitForEmailMarketingConsent(/** @type {string} */ email) {
    const trimmed = normalizeEmailForQuery(email);
    if (!trimmed) return false;
    const attempts = CHECKOUT_CONSENT_POLL_DELAYS_MS.length + 1;
    for (let i = 0; i < attempts; i++) {
        if (i > 0) {
            const delay = CHECKOUT_CONSENT_POLL_DELAYS_MS[i - 1];
            // console.log(`🎟️[PROMO] email consent poll: waiting ${delay}ms (attempt ${i + 1}/${attempts}) email=${trimmed}`);
            await sleep(delay);
        }
        if (await hasEmailMarketingConsent(trimmed)) {
            // if (i > 0) console.log(`🎟️[PROMO] email consent poll: confirmed on attempt ${i + 1}/${attempts} email=${trimmed}`);
            return true;
        }
    }
    // console.log(`🎟️[PROMO] email consent poll: no consent after ${attempts} attempts email=${trimmed}`);
    return false;
}

/**
 * Single-shot phone consent check (marketing API + CRM fallback). Never throws.
 */
export async function hasPhoneMarketingConsent(/** @type {string} */ phone) {
    const e164 = normalizeIsraeliPhone(phone);
    if (!e164) return false;
    try {
        const viaApi = await checkPhoneViaMarketingConsent(e164).catch((err) => ({
            granted: false,
            detail: err instanceof Error ? err.message : String(err),
            source: 'marketing-consent-error',
        }));
        if (viaApi.granted) {
            // console.log(`🎟️[PROMO] phone consent check: ${e164} -> granted=true source=${viaApi.source} state=${viaApi.detail}`);
            return true;
        }

        const viaContacts = await checkPhoneViaContacts(e164).catch(() => ({
            granted: false,
            detail: 'error',
            source: 'contacts-error',
        }));
        if (viaContacts.granted) {
            // console.log(`🎟️[PROMO] phone consent check: ${e164} -> granted=true source=${viaContacts.source} (CRM fallback)`);
            return true;
        }

        // console.log(`🎟️[PROMO] phone consent check: ${e164} -> granted=false api=${viaApi.detail} contacts=${viaContacts.detail}`);
        return false;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // console.log(`🎟️[PROMO] phone consent check: ${e164} -> no consent record (${message})`);
        return false;
    }
}

/**
 * Polls phone consent after checkout. Never throws.
 */
export async function waitForPhoneMarketingConsent(/** @type {string} */ phone) {
    const e164 = normalizeIsraeliPhone(phone);
    if (!e164) return false;
    const attempts = CHECKOUT_CONSENT_POLL_DELAYS_MS.length + 1;
    for (let i = 0; i < attempts; i++) {
        if (i > 0) {
            const delay = CHECKOUT_CONSENT_POLL_DELAYS_MS[i - 1];
            // console.log(`🎟️[PROMO] phone consent poll: waiting ${delay}ms (attempt ${i + 1}/${attempts}) phone=${e164}`);
            await sleep(delay);
        }
        if (await hasPhoneMarketingConsent(e164)) {
            // if (i > 0) console.log(`🎟️[PROMO] phone consent poll: confirmed on attempt ${i + 1}/${attempts} phone=${e164}`);
            return true;
        }
    }
    // console.log(`🎟️[PROMO] phone consent poll: no consent after ${attempts} attempts phone=${e164}`);
    return false;
}
