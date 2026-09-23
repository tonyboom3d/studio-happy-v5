/**
 * rescheduleService.web.js — "עדכון מועד סדנה" page (customer self-service
 * workshop reschedule). The token in the URL is the authentication for the
 * two Anyone-permission methods (getRescheduleContext / submitRescheduleRequest)
 * — same accepted trade-off as pending-actions / manager-pending. The staff
 * cancel action requires a logged-in dashboard user (SiteMember).
 *
 * Flow: ManyChat calls http-functions.js get_startReschedule, which writes
 * rescheduleToken/rescheduleTokenExpiresAt on the WorkshopOrders row and sends
 * the customer a link to this page: ?orderId=...&token=...&sid=<subscriberId>.
 * The page/CE call getRescheduleContext to render the calendar, then
 * submitRescheduleRequest once a date is chosen — which pushes the customer
 * back into the ManyChat summary flow via sendRescheduleSummary().
 *
 * ------------------------------------------------------------------
 * WorkshopOrders CMS fields required (create manually in the Wix Editor —
 * Content Manager, no schema-as-code available for CMS collections):
 *   customerRescheduleCount   Number  (default 0)
 *   pendingRescheduleDate     Date
 *   pendingRescheduleStatus   Text    ('requested' | 'pending_staff_review' | empty)
 *   pendingRescheduleRequestedAt  Date
 *   rescheduleToken           Text
 *   rescheduleTokenExpiresAt  Date
 * ------------------------------------------------------------------
 */
import { randomBytes } from 'crypto';
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import {
    isRescheduleBlockedWithin48h,
    hasCustomerRescheduleUsed,
    hasOpenRescheduleRequest,
} from 'backend/orderLookupService.js';
import { resolveWorkshopType, serviceIdToWorkshopType } from 'backend/workshopServiceIds.js';
import { sendRescheduleSummary, findSubscriberIdByPhone } from 'backend/manychatService.jsw';

const SA = { suppressAuth: true };
const ISRAEL_TZ = 'Asia/Jerusalem';

export const RESCHEDULE_TOKEN_TTL_MS = 10 * 60 * 1000;

function formatDateIL(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: ISRAEL_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get('day')}/${get('month')}/${get('year')}`;
}

function formatTimeIL(date) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
}

async function appendOrderActionLog(order, action) {
    try {
        const actionLog = [{ timestamp: new Date().toISOString(), user: 'מערכת (עדכון מועד)', action }, ...(order.actionLog || [])].slice(0, 200);
        return await wixData.update('WorkshopOrders', { ...order, actionLog }, SA);
    } catch (err) {
        console.warn('[rescheduleService] appendOrderActionLog failed. orderId:', order?._id, 'error:', err?.message || err);
        return order;
    }
}

/** Loads the order and runs every eligibility check, throwing a labeled error on the first failure. */
async function loadEligibleOrder(orderId, token) {
    if (!orderId || !token) throw new Error('NOT_FOUND: קישור לא תקין.');

    const order = await wixData.get('WorkshopOrders', orderId, SA).catch(() => null);
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');

    if (!order.rescheduleToken || order.rescheduleToken !== token) {
        throw new Error('NOT_FOUND: קישור לא תקין.');
    }
    const expiresAt = order.rescheduleTokenExpiresAt ? new Date(order.rescheduleTokenExpiresAt) : null;
    if (!expiresAt || isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        throw new Error('EXPIRED: הקישור פג תוקף.');
    }
    if (hasOpenRescheduleRequest(order)) {
        throw new Error('ALREADY_PENDING: יש כבר בקשת דחייה ממתינה לאישור צוות.');
    }
    if (hasCustomerRescheduleUsed(order)) {
        throw new Error('ALREADY_USED: כבר נעשה שינוי מועד פעם אחת להזמנה הזו.');
    }
    if (isRescheduleBlockedWithin48h(order)) {
        throw new Error('BLOCKED_48H: הסדנה מתקיימת תוך פחות מ-48 שעות.');
    }

    return order;
}

/** Page/CE load — validates the link and returns everything needed to render the calendar. */
export const getRescheduleContext = webMethod(Permissions.Anyone, async (orderId, token) => {
    const order = await loadEligibleOrder(orderId, token);
    const workshopType = serviceIdToWorkshopType(order.serviceId) || resolveWorkshopType(order.workshopType) || null;
    return {
        orderId: order._id,
        workshopType,
        currentWorkshopStart: order.workshopStart ? new Date(order.workshopStart).toISOString() : null,
        expiresAt: new Date(order.rescheduleTokenExpiresAt).toISOString(),
    };
});

/**
 * Called once the customer picks a new date+time on the calendar. Never
 * applies the change to Wix Bookings itself — only records the request and
 * hands the customer back to ManyChat for final confirmation.
 */
export const submitRescheduleRequest = webMethod(Permissions.Anyone, async (orderId, token, chosenDateIso) => {
    const order = await loadEligibleOrder(orderId, token);

    const chosenDate = new Date(chosenDateIso);
    if (isNaN(chosenDate.getTime())) throw new Error('BAD_REQUEST: תאריך לא תקין.');

    const updated = await wixData.update('WorkshopOrders', {
        ...order,
        pendingRescheduleDate: chosenDate,
        pendingRescheduleStatus: 'requested',
        pendingRescheduleRequestedAt: new Date(),
    }, SA);

    const chosenDateLabel = `${formatDateIL(chosenDate)} בשעה ${formatTimeIL(chosenDate)}`;
    await appendOrderActionLog(updated, `בקשת שינוי מועד נשלחה על ידי הלקוח: ${chosenDateLabel}`);

    const subscriberId = await findSubscriberIdByPhone(order.organizerPhone).catch(() => null);
    if (subscriberId) {
        await sendRescheduleSummary(subscriberId, chosenDateLabel).catch((err) => {
            console.warn('[rescheduleService] sendRescheduleSummary failed. orderId:', orderId, 'error:', err?.message || err);
        });
    } else {
        console.warn('[rescheduleService] submitRescheduleRequest: no ManyChat subscriber found for phone. orderId:', orderId);
    }

    return { ok: true, chosenDateLabel };
});

/**
 * Staff dashboard action — the only way to release the one-time reschedule
 * back to the customer once a "pending_staff_review" request is cleared
 * (handled or discarded outside the system, e.g. Wix Bookings itself).
 */
export const cancelRescheduleRequest = webMethod(Permissions.SiteMember, async (orderId) => {
    if (!orderId) throw new Error('BAD_REQUEST: חסר מזהה הזמנה.');
    const order = await wixData.get('WorkshopOrders', orderId, SA).catch(() => null);
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');

    const updated = await wixData.update('WorkshopOrders', {
        ...order,
        customerRescheduleCount: 0,
        pendingRescheduleStatus: null,
        pendingRescheduleDate: null,
    }, SA);

    await appendOrderActionLog(updated, 'בקשת שינוי מועד בוטלה על ידי הצוות — השימוש החינמי שוחזר.');
    return { ok: true };
});

/** Called by http-functions.js get_startReschedule to (re)issue the one-time link. */
export async function issueRescheduleToken(orderId) {
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + RESCHEDULE_TOKEN_TTL_MS);
    await wixData.update('WorkshopOrders', {
        _id: orderId,
        rescheduleToken: token,
        rescheduleTokenExpiresAt: expiresAt,
    }, SA);
    return { token, expiresAt };
}

/**
 * Called by http-functions.js get_confirmReschedule once the customer taps
 * the final "אישור סופי" button in the ManyChat summary flow. This is what
 * actually consumes the one free reschedule and hands the request to staff.
 */
export async function confirmRescheduleRequest(orderId) {
    const order = await wixData.get('WorkshopOrders', orderId, SA).catch(() => null);
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');

    const chosenDateLabel = order.pendingRescheduleDate
        ? `${formatDateIL(new Date(order.pendingRescheduleDate))} בשעה ${formatTimeIL(new Date(order.pendingRescheduleDate))}`
        : '';

    const updated = await wixData.update('WorkshopOrders', {
        ...order,
        customerRescheduleCount: 1,
        pendingRescheduleStatus: 'pending_staff_review',
        rescheduleToken: null,
        rescheduleTokenExpiresAt: null,
    }, SA);

    await appendOrderActionLog(updated, `הלקוח אישר סופית שינוי מועד ל: ${chosenDateLabel || '(תאריך לא ידוע)'}`);
    return { ok: true, chosenDateLabel };
}
