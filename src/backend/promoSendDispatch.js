/**
 * promoSendDispatch.js — send + retry promo-coupon WhatsApp/email notifications.
 */
import wixData from 'wix-data';
import { sendTuftingPromoCouponManyChat } from 'backend/manychatService.jsw';
import { sendTuftingPromoCouponEmail } from 'backend/promoEmailService.js';
import { markPromoCouponSent } from 'backend/promoCouponService.js';

const SA = { suppressAuth: true };
const TAG = '🎟️[PROMO]';
const RETRY_MIN_AGE_MS = 3 * 60 * 1000;
const RETRY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Sends promo coupon via WhatsApp + email. When waitForConsent=true, polls
 * until Wix indexes checkout marketing opt-in (~30s max).
 */
export async function sendPromoCouponNotifications(couponRow, { waitForConsent = false } = {}) {
    const opts = { waitForConsent };
    const [waResult, emailResult] = await Promise.all([
        sendTuftingPromoCouponManyChat(couponRow, opts).catch((err) => {
            console.error(`${TAG} ❌ sendTuftingPromoCouponManyChat failed. couponId:`, couponRow?._id, 'error:', err?.message || err);
            return { sent: false, reason: 'error' };
        }),
        sendTuftingPromoCouponEmail(couponRow, opts).catch((err) => {
            console.error(`${TAG} ❌ sendTuftingPromoCouponEmail failed. couponId:`, couponRow?._id, 'error:', err?.message || err);
            return { sent: false, reason: 'error' };
        }),
    ]);
    const ok = !!waResult?.sent || !!emailResult?.sent;
    if (ok) await markPromoCouponSent(couponRow._id);
    return { ok, waResult, emailResult };
}

/** Hourly safety net for issued coupons that never got sent (consent race, etc.). */
export async function retryUnsentPromoCoupons() {
    const minIssuedAt = new Date(Date.now() - RETRY_MAX_AGE_MS);
    const maxIssuedAt = new Date(Date.now() - RETRY_MIN_AGE_MS);
    const result = await wixData.query('PromoCoupons')
        .eq('status', 'issued')
        .isEmpty('lastSentAt')
        .gt('issuedAt', minIssuedAt)
        .lt('issuedAt', maxIssuedAt)
        .limit(20)
        .find(SA)
        .catch((err) => {
            console.error(`${TAG} retryUnsentPromoCoupons query failed:`, err?.message || err);
            return { items: [] };
        });

    let retried = 0;
    let sent = 0;
    for (const coupon of result.items || []) {
        console.log(`${TAG} retryUnsentPromoCoupons: retrying couponId=${coupon._id} code=${coupon.code} orderId=${coupon.orderId}`);
        const outcome = await sendPromoCouponNotifications(coupon, { waitForConsent: false });
        retried++;
        if (outcome.ok) sent++;
    }
    if (retried) console.log(`${TAG} retryUnsentPromoCoupons: retried=${retried} sent=${sent}`);
    return { retried, sent };
}
