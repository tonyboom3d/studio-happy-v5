/**
 * marketingConsentService.js — gate for sending MARKETING content (not
 * transactional/order messages) by email/WhatsApp.
 *
 * Checkout "subscribe to marketing" records consent asynchronously — the paid
 * hook can fire before Wix indexes email-subscriptions / marketing-consent.
 * waitFor*() polls with backoff; has*() is a single check (dashboard resend).
 */
import { contacts } from 'wix-crm-backend';
import { emailSubscriptions } from '@wix/email-subscriptions';
import { marketingConsent } from '@wix/marketing';
import { auth } from '@wix/essentials';
import { normalizeIsraeliPhone, getPhoneLookupVariants, phonesMatch } from 'backend/orderUtils.js';

/** Delays between consent poll attempts after checkout (ms). First try is immediate. */
const CHECKOUT_CONSENT_POLL_DELAYS_MS = [3000, 5000, 10000, 15000];

const elevatedQueryEmailSubscriptions = auth.elevate(emailSubscriptions.queryEmailSubscriptions);
const elevatedQueryMarketingConsent = auth.elevate(marketingConsent.queryMarketingConsent);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSubscribedStatus(statusField) {
    if (!statusField) return false;
    const status = typeof statusField === 'string' ? statusField : statusField?.status;
    return status === 'SUBSCRIBED';
}

function normalizeEmailForQuery(email) {
    return String(email || '').trim().toLowerCase();
}

function logEmailSubscriptionDebug(email, response, err) {
    try {
        if (err) {
            console.log(`🎟️[PROMO] email-subscriptions query error email=${email}:`, err instanceof Error ? err.message : String(err));
            return;
        }
        const subs = response?.subscriptions || [];
        console.log(
            `🎟️[PROMO] email-subscriptions query debug email=${email} count=${subs.length} metadata=${JSON.stringify(response?.metadata || null)} subscriptions=${JSON.stringify(subs)}`,
        );
    } catch (logErr) {
        console.log(`🎟️[PROMO] email-subscriptions query debug log failed email=${email}`);
    }
}

async function checkEmailViaSubscriptions(email) {
    const queryEmail = normalizeEmailForQuery(email);
    const response = await elevatedQueryEmailSubscriptions(
        { email: { $in: [queryEmail] } },
        { paging: { limit: 5, offset: 0 } },
    );
    logEmailSubscriptionDebug(queryEmail, response, null);

    const subs = response?.subscriptions || [];
    const sub = subs.find((s) => normalizeEmailForQuery(s?.email) === queryEmail) || subs[0];
    const subscribed = isSubscribedStatus(sub?.subscriptionStatus);
    const statusLabel = typeof sub?.subscriptionStatus === 'string'
        ? sub.subscriptionStatus
        : (sub?.subscriptionStatus?.status || 'none');
    return { subscribed, detail: statusLabel, source: 'email-subscriptions', sub };
}

async function checkEmailViaContacts(email) {
    const lowered = normalizeEmailForQuery(email);
    const queries = [
        () => contacts.queryContacts().eq('primaryInfo.email', email).limit(1).find(),
        () => contacts.queryContacts().eq('info.emails.email', email).limit(1).find(),
    ];
    for (const run of queries) {
        const result = await run();
        const contact = result?.items?.[0];
        if (!contact) continue;
        const emails = contact.info?.emails || [];
        const match = emails.find((e) => normalizeEmailForQuery(e?.email) === lowered);
        if (match && isSubscribedStatus(match.subscriptionStatus)) {
            return { subscribed: true, detail: 'SUBSCRIBED', source: 'contacts.emails' };
        }
        if (isSubscribedStatus(contact.primaryInfo?.subscriptionStatus)) {
            return { subscribed: true, detail: 'SUBSCRIBED', source: 'contacts.primaryInfo' };
        }
    }
    return { subscribed: false, detail: 'none', source: 'contacts' };
}

async function checkPhoneViaMarketingConsent(e164) {
    const response = await elevatedQueryMarketingConsent({
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
        const viaApi = await checkEmailViaSubscriptions(trimmed).catch((err) => {
            logEmailSubscriptionDebug(trimmed, null, err);
            return {
                subscribed: false,
                detail: err instanceof Error ? err.message : String(err),
                source: 'email-subscriptions-error',
            };
        });
        if (viaApi.subscribed) {
            console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=true source=${viaApi.source} status=${viaApi.detail}`);
            return true;
        }
        const viaContacts = await checkEmailViaContacts(trimmed).catch(() => ({
            subscribed: false,
            detail: 'error',
            source: 'contacts-error',
        }));
        if (viaContacts.subscribed) {
            console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=true source=${viaContacts.source} (CRM fallback)`);
            return true;
        }
        console.log(`🎟️[PROMO] email consent check: ${trimmed} -> subscribed=false api=${viaApi.detail} contacts=${viaContacts.detail}`);
        return false;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`🎟️[PROMO] email consent check: ${trimmed} -> no consent record (${message})`);
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
            console.log(`🎟️[PROMO] email consent poll: waiting ${delay}ms (attempt ${i + 1}/${attempts}) email=${trimmed}`);
            await sleep(delay);
        }
        if (await hasEmailMarketingConsent(trimmed)) {
            if (i > 0) console.log(`🎟️[PROMO] email consent poll: confirmed on attempt ${i + 1}/${attempts} email=${trimmed}`);
            return true;
        }
    }
    console.log(`🎟️[PROMO] email consent poll: no consent after ${attempts} attempts email=${trimmed}`);
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
            console.log(`🎟️[PROMO] phone consent check: ${e164} -> granted=true source=${viaApi.source} state=${viaApi.detail}`);
            return true;
        }
        const viaContacts = await checkPhoneViaContacts(e164).catch(() => ({
            granted: false,
            detail: 'error',
            source: 'contacts-error',
        }));
        if (viaContacts.granted) {
            console.log(`🎟️[PROMO] phone consent check: ${e164} -> granted=true source=${viaContacts.source} (CRM fallback)`);
            return true;
        }
        console.log(`🎟️[PROMO] phone consent check: ${e164} -> granted=false api=${viaApi.detail} contacts=${viaContacts.detail}`);
        return false;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`🎟️[PROMO] phone consent check: ${e164} -> no consent record (${message})`);
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
            console.log(`🎟️[PROMO] phone consent poll: waiting ${delay}ms (attempt ${i + 1}/${attempts}) phone=${e164}`);
            await sleep(delay);
        }
        if (await hasPhoneMarketingConsent(e164)) {
            if (i > 0) console.log(`🎟️[PROMO] phone consent poll: confirmed on attempt ${i + 1}/${attempts} phone=${e164}`);
            return true;
        }
    }
    console.log(`🎟️[PROMO] phone consent poll: no consent after ${attempts} attempts phone=${e164}`);
    return false;
}
