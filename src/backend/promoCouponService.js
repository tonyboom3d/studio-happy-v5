/**
 * promoCouponService.js — "טאפטינג + קרמיקה במתנה" promo.
 *
 * Flow:
 *  1) Tufting order gets marked 'paid' (see data.js hook) -> if the promo
 *     campaign is enabled, issuePromoCouponForOrder() creates a one-time,
 *     100%-off Wix coupon scoped to the weekday-only ceramics service, and
 *     records it in the `PromoCoupons` CMS collection.
 *  2) manychatService.jsw / promoEmailService.js send the code to the
 *     customer (WhatsApp + email).
 *  3) The customer redeems the code in Wix's built-in checkout when booking
 *     the ceramics workshop — no custom redemption UI needed.
 *  4) orderReconciliation.js calls markPromoCouponRedeemedIfApplicable() when
 *     a ceramics order pays with a matching coupon code.
 *  5) events.js calls cancelPromoCouponsForOrder() / reschedulePromoCouponsForOrder()
 *     when the originating tufting booking is cancelled/rescheduled.
 *
 * CMS collections used (create manually in the Wix Editor's Content Manager —
 * this is a classic Velo/Git-Integration site, collections aren't defined in code):
 *
 *   PromoCampaign (single row, key `settingKey` = 'default'):
 *     - settingKey (Text)       — always 'default', used to look up the row
 *     - enabled (Boolean)       — master on/off switch. OFF by default.
 *     - previewToken (Text)     — secret token for the `?promo=<token>` test link
 *     - title (Text)
 *     - subtitle (Text)
 *     - ctaText (Text)
 *     - ctaUrl (Text)           — e.g. https://www.studiohappy.art/booking-flow-tufting
 *     - termsText (Text, multiline) — shown in the popup's accordion
 *
 *   PromoCoupons (one row per issued coupon):
 *     - code (Text)             — human-readable code, e.g. SH-A1B2C3
 *     - wixCouponId (Text)      — Wix Marketing coupon _id
 *     - orderId (Text)          — originating WorkshopOrders _id (tufting)
 *     - organizerName (Text)
 *     - organizerPhone (Text)
 *     - organizerEmail (Text)
 *     - giftPieces (Number)     — number of ceramics pieces gifted (= rugCount)
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

const SA = { suppressAuth: true };
const ISRAEL_TZ = 'Asia/Jerusalem';

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

// --- Weekday-only ceramics service scope --------------------------------
// The promo must only apply to ceramics sessions that run Sun–Thu (including
// Chol HaMoed Sukkot) — this is enforced by scoping the Wix coupon to a
// DEDICATED weekday-only ceramics Bookings service, not by custom day-of-week
// filtering in this codebase.
//
// ⚠️ MANUAL SETUP REQUIRED: today `workshopServiceIds.js` only has ONE
// consolidated ceramics service (used for every day of the week, including
// Fri/Sat). Until the studio splits out a weekday-only ceramics service in
// Wix Bookings and this constant is updated with its real serviceId, coupons
// will be scoped to the existing consolidated service — which also runs on
// Fri/Sat, so the "weekdays only" restriction will NOT actually be enforced
// by Wix at checkout. A loud warning is logged on every issuance until this
// is fixed.
const WEEKDAY_CERAMICS_SERVICE_ID = 'ad89914a-1845-48c6-804d-544cd17f179b'; // TODO: replace with the weekday-only ceramics serviceId
const WEEKDAY_CERAMICS_SERVICE_ID_IS_PLACEHOLDER = true; // flip to false once the real weekday-only serviceId is set above

const COUPON_VALIDITY_MONTHS = 6;
const COUPON_CODE_PREFIX = 'SH-';

function loadCampaignRow() {
    return wixData.query('PromoCampaign').eq('settingKey', 'default').limit(1).find(SA)
        .then((r) => r.items?.[0] || null);
}

/** Public shape used by the popup (backend/promoCampaignService.web.js) and by issuance gating. */
export async function getPromoCampaign() {
    const row = await loadCampaignRow();
    if (!row) return null;
    return {
        enabled: !!row.enabled,
        previewToken: row.previewToken || '',
        title: row.title || '',
        subtitle: row.subtitle || '',
        ctaText: row.ctaText || '',
        ctaUrl: row.ctaUrl || '',
        termsText: row.termsText || '',
    };
}

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

/**
 * Issues a personal, one-time promo coupon for a just-paid tufting order.
 * No-ops (returns { issued: false, reason }) when the campaign is off, the
 * order isn't tufting, or a coupon was already issued for this order.
 * Never throws — a promo failure must never affect the underlying order.
 */
export async function issuePromoCouponForOrder(order, { force = false } = {}) {
    try {
        if (!order?._id) return { issued: false, reason: 'no-order' };
        if (order.workshopType !== 'tufting') return { issued: false, reason: 'not-tufting' };

        if (!force) {
            const campaign = await getPromoCampaign();
            if (!campaign?.enabled) {
                console.log('[promoCouponService] Campaign disabled — skipping issuance. orderId:', order._id);
                return { issued: false, reason: 'campaign-disabled' };
            }
        }

        const existing = await wixData.query('PromoCoupons').eq('orderId', order._id).limit(1).find(SA);
        if (existing.items.length) {
            console.log('[promoCouponService] Coupon already issued for order — skipping. orderId:', order._id);
            return { issued: false, reason: 'already-issued', coupon: existing.items[0] };
        }

        if (WEEKDAY_CERAMICS_SERVICE_ID_IS_PLACEHOLDER) {
            console.warn(
                '[promoCouponService] ⚠️ WEEKDAY_CERAMICS_SERVICE_ID is still the placeholder (consolidated ceramics ' +
                'service, includes Fri/Sat) — the "weekdays only" restriction is NOT enforced by Wix yet. ' +
                'Split out a weekday-only ceramics Bookings service and update the constant. orderId:', order._id,
            );
        }

        const giftPieces = Number(order.rugCount) || 0;
        if (giftPieces <= 0) {
            console.warn('[promoCouponService] Order has no rugCount — skipping issuance. orderId:', order._id);
            return { issued: false, reason: 'no-rug-count' };
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
                group: { name: 'service', entityId: WEEKDAY_CERAMICS_SERVICE_ID },
            },
            percentOffRate: 100,
        };

        const { createCoupon: elevatedCreateCoupon } = await getElevatedCoupons();
        const created = await elevatedCreateCoupon(specification);
        const wixCouponId = created?._id || created?.id;
        if (!wixCouponId) throw new Error('createCoupon returned no id');

        const couponRow = await wixData.insert('PromoCoupons', {
            code,
            wixCouponId,
            orderId: order._id,
            organizerName: order.organizerName || '',
            organizerPhone: order.organizerPhone || '',
            organizerEmail: order.organizerEmail || '',
            giftPieces,
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
            `[promoCouponService] ✅ Coupon issued. orderId=${order._id} code=${code} wixCouponId=${wixCouponId} ` +
            `giftPieces=${giftPieces} redeemFrom=${redeemFrom.toISOString()} expiresAt=${expiresAt.toISOString()}`,
        );

        return { issued: true, coupon: couponRow };
    } catch (err) {
        console.error('[promoCouponService] issuePromoCouponForOrder failed. orderId:', order?._id, 'error:', err?.message || err);
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
