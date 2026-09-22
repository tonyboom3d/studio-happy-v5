/**
 * promoCouponService.js — "טאפטינג + קרמיקה במתנה" promo.
 *
 * Flow:
 *  1) Tufting order gets marked 'paid' (see data.js hook) -> if the promo
 *     campaign is enabled, issuePromoCouponForOrder() creates a one-time
 *     fixed-NIS Wix coupon (rugCount × discountPerRugNis) scoped to the
 *     ceramics Bookings service, and records it in `PromoCoupons` CMS.
 *  2) manychatService.jsw / promoEmailService.js send the code to the
 *     customer (WhatsApp + email).
 *  3) The customer redeems the code in Wix's built-in checkout when booking
 *     the ceramics workshop — no custom redemption UI needed.
 *  4) orderReconciliation.js calls markPromoCouponRedeemedIfApplicable() when
 *     a ceramics order pays with a matching coupon code.
 *  5) events.js calls cancelPromoCouponsForOrder() / reschedulePromoCouponsForOrder()
 *     when the originating tufting booking is cancelled/rescheduled.
 *
 * Campaign settings (enabled, copy, preview token) live in
 * backend/promoCampaignConfig.js — not in CMS.
 *
 * CMS collection used (create manually in the Wix Editor's Content Manager):
 *
 *   PromoCoupons (one row per issued coupon):
 *     - code (Text)             — human-readable code, e.g. SH-A1B2C3
 *     - wixCouponId (Text)      — Wix Marketing coupon _id
 *     - orderId (Text)          — originating WorkshopOrders _id (tufting)
 *     - organizerName (Text)
 *     - organizerPhone (Text)
 *     - organizerEmail (Text)
 *     - giftPieces (Number)     — tufting rug count (= discount units)
 *     - discountAmountNis (Number) — total fixed discount (giftPieces × 170)
 *     - workshopStart (Date and Time) — tufting workshop date
 *     - redeemFrom (Date and Time)    — earliest the coupon can be used (after the tufting workshop)
 *     - expiresAt (Date and Time)     — 6 months from the tufting order date
 *     - status (Text)           — 'issued' | 'redeemed' | 'cancelled'
 *     - issuedAt (Date and Time)
 *     - redeemedAt (Date and Time)
 *     - redeemedOrderId (Text) — WorkshopOrders _id of the ceramics order that redeemed it
 *     - lastSentAt (Date and Time) — last time WhatsApp/email were (re)sent
 */
import wixData from 'wix-data';
import { getPromoCampaign } from 'backend/promoCampaignConfig.js';
import { CERAMICS_SERVICE_ID } from 'backend/workshopServiceIds.js';

export { getPromoCampaign } from 'backend/promoCampaignConfig.js';

const SA = { suppressAuth: true };
const ISRAEL_TZ = 'Asia/Jerusalem';

// Fixed marker prefix for every log line in the promo-coupon flow — filter
// Site Monitoring / logs by "🎟️[PROMO]" to see the whole journey in order.
const TAG = '🎟️[PROMO]';

// Resolved lazily (never at module top-level) so that if this API is ever
// unavailable/renamed, the failure is isolated to promo-coupon calls instead
// of crashing this whole module on import — which previously broke
// bookingService.web.js for every workshop type, not just tufting (see
// orderReconciliation.js -> markPromoCouponRedeemedIfApplicable).
let elevatedCouponsPromise = null;
async function getElevatedCoupons() {
    if (!elevatedCouponsPromise) {
        elevatedCouponsPromise = (async () => {
            const { coupons } = await import('wix-marketing.v2');
            const { elevate } = await import('wix-auth');
            if (!coupons?.createCoupon || !coupons?.updateCoupon) {
                throw new Error('wix-marketing.v2 coupons API is unavailable on this site');
            }
            return {
                createCoupon: elevate(coupons.createCoupon),
                updateCoupon: elevate(coupons.updateCoupon),
            };
        })();
    }
    return elevatedCouponsPromise;
}

const COUPON_VALIDITY_MONTHS = 6;
const COUPON_CODE_PREFIX = 'SH-';

function randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
    let out = '';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return `${COUPON_CODE_PREFIX}${out}`;
}

async function generateUniqueCode() {
    for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const existing = await wixData.query('PromoCoupons').eq('code', code).limit(1).find(SA);
        if (!existing.items.length) return code;
    }
    throw new Error('[promoCouponService] Could not generate a unique coupon code after 8 attempts');
}

/** End of the given day (23:59:59.999) in Israel local time, as a UTC Date. */
function endOfIsraelDay(dateInput) {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ISRAEL_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    // Israel is UTC+2/UTC+3 — using UTC 21:59:59.999 covers both DST offsets
    // safely as "end of day local time or later", which is all we need here
    // (redemption is gated to "on/after this instant", not to the exact minute).
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 21, 59, 59, 999));
}

function addMonths(dateInput, months) {
    const d = new Date(dateInput);
    d.setMonth(d.getMonth() + months);
    return d;
}

function getIsraelWeekdayEnum(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, weekday: 'long' }).format(d);
    return weekday.toUpperCase();
}

/** Promo ceramics coupons must not be redeemed on Fri/Sat sessions (checkout locks coupon field too). */
export function isPromoCeramicsCouponBlockedDay(dateInput) {
    const day = getIsraelWeekdayEnum(dateInput);
    return day === 'FRIDAY' || day === 'SATURDAY';
}

/**
 * Issues a personal, one-time promo coupon for a just-paid tufting order.
 * No-ops (returns { issued: false, reason }) when the campaign is off, the
 * order isn't tufting, or a coupon was already issued for this order.
 * Never throws — a promo failure must never affect the underlying order.
 */
export async function issuePromoCouponForOrder(order, { force = false } = {}) {
    console.log(`${TAG} issuePromoCouponForOrder called. orderId=${order?._id} workshopType=${order?.workshopType} force=${force}`);
    try {
        if (!order?._id) return { issued: false, reason: 'no-order' };
        if (order.workshopType !== 'tufting') {
            console.log(`${TAG} Skipping — not a tufting order. orderId=${order._id} workshopType=${order.workshopType}`);
            return { issued: false, reason: 'not-tufting' };
        }

        const campaign = await getPromoCampaign();
        if (!force && !campaign?.enabled) {
            console.log(`${TAG} Campaign disabled — skipping issuance. orderId=${order._id} expired=${campaign?.expired}`);
            return { issued: false, reason: 'campaign-disabled' };
        }

        const existing = await wixData.query('PromoCoupons').eq('orderId', order._id).limit(1).find(SA);
        if (existing.items.length) {
            console.log(`${TAG} Coupon already issued for order — skipping. orderId=${order._id} code=${existing.items[0]?.code}`);
            return { issued: false, reason: 'already-issued', coupon: existing.items[0] };
        }

        const giftPieces = Number(order.rugCount) || 0;
        if (giftPieces <= 0) {
            console.warn(`${TAG} Order has no rugCount — skipping issuance. orderId=${order._id}`);
            return { issued: false, reason: 'no-rug-count' };
        }
        const perRug = Number(campaign.discountPerRugNis) || 170;
        const discountAmountNis = giftPieces * perRug;
        if (discountAmountNis <= 0) {
            return { issued: false, reason: 'no-discount-amount' };
        }

        const code = await generateUniqueCode();
        const orderCreatedAt = order._createdDate ? new Date(order._createdDate) : new Date();
        const workshopStart = order.workshopStart ? new Date(order.workshopStart) : new Date();
        const redeemFrom = endOfIsraelDay(workshopStart);
        const expiresAt = addMonths(orderCreatedAt, COUPON_VALIDITY_MONTHS);

        const specification = {
            name: code,
            code,
            startTime: redeemFrom.getTime().toString(),
            expirationTime: expiresAt.getTime().toString(),
            usageLimit: 1,
            limitedToOneItem: false,
            limitPerCustomer: 1,
            active: true,
            scope: {
                namespace: 'bookings',
                group: { name: 'service', entityId: CERAMICS_SERVICE_ID },
            },
            moneyOffAmount: discountAmountNis,
        };

        console.log(`${TAG} Creating Wix coupon via wix-marketing.v2. orderId=${order._id} code=${code} moneyOff=${discountAmountNis} scope=bookings/service/${CERAMICS_SERVICE_ID}`);
        const { createCoupon: elevatedCreateCoupon } = await getElevatedCoupons();
        const created = await elevatedCreateCoupon(specification);
        const wixCouponId = created?._id || created?.id;
        if (!wixCouponId) throw new Error('createCoupon returned no id');
        console.log(`${TAG} Wix coupon created. orderId=${order._id} code=${code} wixCouponId=${wixCouponId}`);

        const couponRow = await wixData.insert('PromoCoupons', {
            code,
            wixCouponId,
            orderId: order._id,
            organizerName: order.organizerName || '',
            organizerPhone: order.organizerPhone || '',
            organizerEmail: order.organizerEmail || '',
            giftPieces,
            discountAmountNis,
            workshopStart,
            redeemFrom,
            expiresAt,
            status: 'issued',
            issuedAt: new Date(),
            redeemedAt: null,
            redeemedOrderId: null,
            lastSentAt: null,
        }, SA);

        console.log(
            `${TAG} ✅ Coupon issued + saved to PromoCoupons CMS. orderId=${order._id} code=${code} wixCouponId=${wixCouponId} ` +
            `couponRowId=${couponRow?._id} giftPieces=${giftPieces} discountAmountNis=${discountAmountNis} redeemFrom=${redeemFrom.toISOString()} expiresAt=${expiresAt.toISOString()}`,
        );

        return { issued: true, coupon: couponRow };
    } catch (err) {
        console.error(`${TAG} ❌ issuePromoCouponForOrder failed. orderId:`, order?._id, 'error:', err?.message || err);
        return { issued: false, reason: 'error', error: err?.message || String(err) };
    }
}

/** Manual/test issuance — bypasses the campaign.enabled gate. Used by the dashboard/sandbox. */
export async function issueTestPromoCoupon(orderId) {
    const order = await wixData.get('WorkshopOrders', orderId, SA);
    if (!order) throw new Error('Order not found');
    return issuePromoCouponForOrder(order, { force: true });
}

async function findCouponsForOrder(orderId, { onlyIssued = true } = {}) {
    let query = wixData.query('PromoCoupons').eq('orderId', orderId);
    const result = await query.find(SA);
    return onlyIssued ? result.items.filter((c) => c.status === 'issued') : result.items;
}

/**
 * Cancels every still-active promo coupon issued for a tufting order —
 * called when that tufting booking is cancelled (Wix Bookings sync) or
 * marked as a no-show from the dashboard. Never throws.
 */
export async function cancelPromoCouponsForOrder(orderId, reason = 'cancelled') {
    try {
        const rows = await findCouponsForOrder(orderId, { onlyIssued: true });
        if (!rows.length) return { cancelled: 0 };

        for (const row of rows) {
            try {
                if (row.wixCouponId) {
                    const { updateCoupon: elevatedUpdateCoupon } = await getElevatedCoupons();
                    await elevatedUpdateCoupon(row.wixCouponId, { active: false }, ['active']);
                }
            } catch (err) {
                console.warn('[promoCouponService] updateCoupon(active:false) failed — continuing to mark CMS cancelled. couponId:', row.wixCouponId, err?.message || err);
            }
            await wixData.update('PromoCoupons', { ...row, status: 'cancelled' }, SA);
        }

        console.log(`[promoCouponService] Cancelled ${rows.length} coupon(s) for orderId=${orderId} (reason: ${reason}).`);
        return { cancelled: rows.length };
    } catch (err) {
        console.error('[promoCouponService] cancelPromoCouponsForOrder failed. orderId:', orderId, 'error:', err?.message || err);
        return { cancelled: 0, error: err?.message || String(err) };
    }
}

/**
 * Updates redeemFrom/expiresAt (and the underlying Wix coupon's startTime)
 * when the originating tufting booking is rescheduled to a new date.
 * expiresAt is intentionally left untouched — it's anchored to the original
 * order date, not the (possibly changed) workshop date.
 */
export async function reschedulePromoCouponsForOrder(orderId, newWorkshopStart) {
    try {
        const rows = await findCouponsForOrder(orderId, { onlyIssued: true });
        if (!rows.length) return { updated: 0 };

        const newRedeemFrom = endOfIsraelDay(newWorkshopStart);

        for (const row of rows) {
            try {
                if (row.wixCouponId) {
                    const { updateCoupon: elevatedUpdateCoupon } = await getElevatedCoupons();
                    await elevatedUpdateCoupon(row.wixCouponId, { startTime: newRedeemFrom.getTime().toString() }, ['startTime']);
                }
            } catch (err) {
                console.warn('[promoCouponService] updateCoupon(startTime) failed — continuing to update CMS. couponId:', row.wixCouponId, err?.message || err);
            }
            await wixData.update('PromoCoupons', {
                ...row,
                workshopStart: new Date(newWorkshopStart),
                redeemFrom: newRedeemFrom,
            }, SA);
        }

        console.log(`[promoCouponService] Rescheduled ${rows.length} coupon(s) for orderId=${orderId} -> redeemFrom=${newRedeemFrom.toISOString()}.`);
        return { updated: rows.length };
    } catch (err) {
        console.error('[promoCouponService] reschedulePromoCouponsForOrder failed. orderId:', orderId, 'error:', err?.message || err);
        return { updated: 0, error: err?.message || String(err) };
    }
}

/**
 * Called from orderReconciliation.js when a ceramics order pays with an
 * applied coupon code — marks the matching PromoCoupons row 'redeemed' if
 * the code matches an issued (not cancelled/already-redeemed) coupon.
 * Never throws.
 */
export async function markPromoCouponRedeemedIfApplicable(couponCode, ceramicsOrderId) {
    try {
        if (!couponCode || !ceramicsOrderId) return { redeemed: false };
        const result = await wixData.query('PromoCoupons').eq('code', couponCode).limit(1).find(SA);
        const row = result.items[0];
        if (!row) return { redeemed: false, reason: 'not-a-promo-coupon' };
        if (row.status !== 'issued') return { redeemed: false, reason: `already-${row.status}` };

        const ceramicsOrder = await wixData.get('WorkshopOrders', ceramicsOrderId, SA).catch(() => null);
        if (ceramicsOrder?.workshopStart && isPromoCeramicsCouponBlockedDay(ceramicsOrder.workshopStart)) {
            console.warn(`${TAG} Redemption blocked — ceramics session is Fri/Sat. code=${couponCode} ceramicsOrderId=${ceramicsOrderId}`);
            return { redeemed: false, reason: 'weekend-ceramics-session' };
        }

        await wixData.update('PromoCoupons', {
            ...row,
            status: 'redeemed',
            redeemedAt: new Date(),
            redeemedOrderId: ceramicsOrderId,
        }, SA);

        console.log(`[promoCouponService] ✅ Coupon redeemed. code=${couponCode} ceramicsOrderId=${ceramicsOrderId} originalOrderId=${row.orderId}`);
        return { redeemed: true, coupon: row };
    } catch (err) {
        console.error('[promoCouponService] markPromoCouponRedeemedIfApplicable failed. code:', couponCode, 'error:', err?.message || err);
        return { redeemed: false, reason: 'error', error: err?.message || String(err) };
    }
}

/** Stamps lastSentAt after a (re)send of the WhatsApp/email notifications. Never throws. */
export async function markPromoCouponSent(couponId) {
    try {
        if (!couponId) return;
        const row = await wixData.get('PromoCoupons', couponId, SA);
        if (!row) return;
        await wixData.update('PromoCoupons', { ...row, lastSentAt: new Date() }, SA);
    } catch (err) {
        console.warn('[promoCouponService] markPromoCouponSent failed. couponId:', couponId, err?.message || err);
    }
}

/** Single coupon lookup by originating tufting orderId — used by the dashboard. */
export async function getPromoCouponForOrder(orderId) {
    if (!orderId) return null;
    const result = await wixData.query('PromoCoupons').eq('orderId', orderId).descending('_createdDate').limit(1).find(SA);
    return result.items[0] || null;
}

/** Batch lookup for the dashboard's order list — { [orderId]: couponRow }. */
export async function getPromoCouponsByOrderIds(orderIds) {
    const byOrderId = {};
    if (!orderIds || !orderIds.length) return byOrderId;
    const result = await wixData.query('PromoCoupons').hasSome('orderId', orderIds).find(SA);
    for (const row of (result.items || [])) {
        // last one wins if somehow duplicated — shouldn't happen (issuance checks for existing).
        byOrderId[row.orderId] = row;
    }
    return byOrderId;
}
