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
 * CMS updates MUST go through workshopOrderPatch.js — never spread a partial
 * wixData.update() return value back into another update.
 *
 * ------------------------------------------------------------------
 * WorkshopOrders CMS fields required (create manually in the Wix Editor):
 *   customerRescheduleCount, pendingRescheduleDate, pendingRescheduleStatus,
 *   pendingRescheduleRequestedAt, rescheduleToken, rescheduleTokenExpiresAt,
 *   rescheduleDatesWorkshopQuery (optional Text)
 * ------------------------------------------------------------------
 */
import { randomBytes } from 'crypto';
import { Permissions, webMethod } from 'wix-web-module';
import {
    isRescheduleBlockedWithin48h,
    hasCustomerRescheduleUsed,
    hasPendingRescheduleChoice,
    resolveCmsOrderWorkshopTypeKey,
} from 'backend/orderLookupService.js';
import {
    WORKSHOP_TYPE_LABELS_HE,
    WORKSHOP_SERVICE_IDS,
    resolveWorkshopType,
    expandCandlesServiceIds,
} from 'backend/workshopServiceIds.js';
import { fetchCourseSessionsInternal } from 'backend/bookingService.web.js';
import { sendRescheduleSummary, findSubscriberIdByPhone } from 'backend/manychatService.jsw';
import { getItemWithRetry } from 'backend/wixDataRetry.js';
import {
    mergePatchWorkshopOrder,
    patchWorkshopOrderFields,
} from 'backend/workshopOrderPatch.js';

const ISRAEL_TZ = 'Asia/Jerusalem';
const RESCHEDULE_SLOTS_LOOKAHEAD_DAYS = 365;

export const RESCHEDULE_TOKEN_TTL_MS = 10 * 60 * 1000;

async function fetchRescheduleSlots(workshopTypeKey, workshopTypeForDates) {
    const key = workshopTypeKey || resolveWorkshopType(workshopTypeForDates);
    if (!key) return [];
    let serviceIds = WORKSHOP_SERVICE_IDS[key];
    if (!serviceIds?.length) return [];
    const start = new Date();
    if (key === 'candles') {
        serviceIds = expandCandlesServiceIds(serviceIds, start);
    }
    const end = new Date(start.getTime() + RESCHEDULE_SLOTS_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    try {
        return await fetchCourseSessionsInternal(start, end, serviceIds);
    } catch (err) {
        console.warn('[rescheduleService] fetchRescheduleSlots failed:', err?.message || err);
        return [];
    }
}

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

async function appendOrderActionLog(orderId, action) {
    try {
        const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'reschedule.appendOrderActionLog' });
        if (!order) return null;
        const actionLog = [{ timestamp: new Date().toISOString(), user: 'מערכת (עדכון מועד)', action }, ...(order.actionLog || [])].slice(0, 200);
        return mergePatchWorkshopOrder(orderId, { actionLog }, 'reschedule.appendOrderActionLog');
    } catch (err) {
        console.warn('[rescheduleService] appendOrderActionLog failed. orderId:', orderId, 'error:', err?.message || err);
        return null;
    }
}

async function loadOrderByRescheduleToken(orderId, token) {
    if (!orderId || !token) throw new Error('NOT_FOUND: קישור לא תקין.');

    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'reschedule.loadOrderByRescheduleToken' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');

    if (!order.rescheduleToken || order.rescheduleToken !== token) {
        throw new Error('NOT_FOUND: קישור לא תקין.');
    }
    const expiresAt = order.rescheduleTokenExpiresAt ? new Date(order.rescheduleTokenExpiresAt) : null;
    if (!expiresAt || isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        throw new Error('EXPIRED: הקישור פג תוקף.');
    }
    return order;
}

function pendingRescheduleDateLabel(order) {
    if (!order?.pendingRescheduleDate) return '';
    const d = new Date(order.pendingRescheduleDate);
    if (isNaN(d.getTime())) return '';
    return `${formatDateIL(d)} בשעה ${formatTimeIL(d)}`;
}

function buildAwaitingRescheduleContext(order) {
    const chosenDateLabel = pendingRescheduleDateLabel(order);
    const status = order.pendingRescheduleStatus;
    return {
        phase: 'awaiting',
        awaitingReschedule: true,
        orderId: order._id,
        pendingRescheduleStatus: status,
        chosenDateLabel,
        expiresAt: order.rescheduleTokenExpiresAt
            ? new Date(order.rescheduleTokenExpiresAt).toISOString()
            : null,
    };
}

/** Calendar pick — only when no pending choice yet. */
function assertCanStartReschedulePick(order) {
    if (hasPendingRescheduleChoice(order)) {
        throw new Error('ALREADY_SUBMITTED: כבר נבחר מועד חדש להזמנה.');
    }
    if (hasCustomerRescheduleUsed(order)) {
        throw new Error('ALREADY_USED: כבר נעשה שינוי מועד פעם אחת להזמנה הזו.');
    }
    if (isRescheduleBlockedWithin48h(order)) {
        throw new Error('BLOCKED_48H: הסדנה מתקיימת תוך פחות מ-48 שעות.');
    }
}

/** webMethod must not throw for expected failures — Wix shows a generic error to the page. */
function toClientError(err) {
    const raw = err?.message || String(err);
    const sep = raw.indexOf(':');
    if (sep > 0) {
        return {
            error: true,
            code: raw.slice(0, sep).trim(),
            message: raw.slice(sep + 1).trim() || raw,
        };
    }
    return { error: true, code: 'ERROR', message: raw };
}

/** Page/CE load — validates the link and returns everything needed to render the calendar. */
export const getRescheduleContext = webMethod(Permissions.Anyone, async (orderId, token) => {
    let order;
    try {
        order = await loadOrderByRescheduleToken(orderId, token);
    } catch (err) {
        return toClientError(err);
    }
    if (hasPendingRescheduleChoice(order)) {
        return buildAwaitingRescheduleContext(order);
    }
    try {
        assertCanStartReschedulePick(order);
    } catch (err) {
        return toClientError(err);
    }
    const workshopType = await resolveCmsOrderWorkshopTypeKey(order);
    let workshopTypeForDates = workshopType ? (WORKSHOP_TYPE_LABELS_HE[workshopType] || workshopType) : null;
    if (!workshopTypeForDates && order.rescheduleDatesWorkshopQuery) {
        workshopTypeForDates = String(order.rescheduleDatesWorkshopQuery).trim() || null;
    }
    if (!workshopTypeForDates) {
        console.warn('[rescheduleService] getRescheduleContext: unresolved workshop type', {
            orderId: order._id,
            workshopType: order.workshopType,
            serviceId: order.serviceId,
            bookingIds: order.bookingIds,
        });
    }
    const slots = await fetchRescheduleSlots(workshopType, workshopTypeForDates);
    return {
        orderId: order._id,
        workshopType,
        workshopTypeForDates,
        currentWorkshopStart: order.workshopStart ? new Date(order.workshopStart).toISOString() : null,
        expiresAt: new Date(order.rescheduleTokenExpiresAt).toISOString(),
        slots,
    };
});

export const submitRescheduleRequest = webMethod(Permissions.Anyone, async (orderId, token, chosenDateIso, subscriberIdHint) => {
    let order;
    try {
        order = await loadOrderByRescheduleToken(orderId, token);
    } catch (err) {
        return { ok: false, ...toClientError(err) };
    }
    if (hasPendingRescheduleChoice(order)) {
        return {
            ok: false,
            error: true,
            code: 'ALREADY_SUBMITTED',
            message: 'כבר נבחר מועד חדש להזמנה.',
            chosenDateLabel: pendingRescheduleDateLabel(order),
        };
    }
    try {
        assertCanStartReschedulePick(order);
    } catch (err) {
        return { ok: false, ...toClientError(err) };
    }

    const chosenDate = new Date(chosenDateIso);
    if (isNaN(chosenDate.getTime())) {
        return { ok: false, error: true, code: 'BAD_REQUEST', message: 'תאריך לא תקין.' };
    }

    if (order.workshopStart) {
        const currentStart = new Date(order.workshopStart);
        if (!isNaN(currentStart.getTime())
            && formatDateIL(currentStart) === formatDateIL(chosenDate)
            && formatTimeIL(currentStart) === formatTimeIL(chosenDate)) {
            return {
                ok: false,
                error: true,
                code: 'SAME_SLOT',
                message: 'לא ניתן לבחור שוב את אותו מועד שבו הסדנה מתקיימת כיום.',
            };
        }
    }

    await mergePatchWorkshopOrder(orderId, {
        pendingRescheduleDate: chosenDate,
        pendingRescheduleStatus: 'requested',
        pendingRescheduleRequestedAt: new Date(),
        rescheduleToken: null,
        rescheduleTokenExpiresAt: null,
    }, 'reschedule.submitRescheduleRequest');

    const chosenDateLabel = `${formatDateIL(chosenDate)} בשעה ${formatTimeIL(chosenDate)}`;
    await appendOrderActionLog(orderId, `בקשת שינוי מועד נשלחה על ידי הלקוח: ${chosenDateLabel}`);

    let subscriberId = String(subscriberIdHint || '').trim() || null;
    if (!subscriberId) {
        subscriberId = await findSubscriberIdByPhone(order.organizerPhone).catch(() => null);
    }
    if (subscriberId) {
        await sendRescheduleSummary(subscriberId, chosenDateLabel).catch((err) => {
            console.warn('[rescheduleService] sendRescheduleSummary failed. orderId:', orderId, 'error:', err?.message || err);
        });
    } else {
        console.warn('[rescheduleService] submitRescheduleRequest: no ManyChat subscriber found for phone. orderId:', orderId);
    }

    return { ok: true, chosenDateLabel };
});

export const cancelRescheduleRequest = webMethod(Permissions.SiteMember, async (orderId) => {
    if (!orderId) throw new Error('BAD_REQUEST: חסר מזהה הזמנה.');

    await mergePatchWorkshopOrder(orderId, {
        customerRescheduleCount: 0,
        pendingRescheduleStatus: null,
        pendingRescheduleDate: null,
    }, 'reschedule.cancelRescheduleRequest');

    await appendOrderActionLog(orderId, 'בקשת שינוי מועד בוטלה על ידי הצוות — השימוש החינמי שוחזר.');
    return { ok: true };
});

/**
 * Token fields only — never send a partial full row (see workshopOrderPatch.js).
 */
export async function issueRescheduleToken(orderId, { datesWorkshopQuery } = {}) {
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'reschedule.issueRescheduleToken' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + RESCHEDULE_TOKEN_TTL_MS);
    const fields = {
        rescheduleToken: token,
        rescheduleTokenExpiresAt: expiresAt,
    };
    if (datesWorkshopQuery) {
        fields.rescheduleDatesWorkshopQuery = datesWorkshopQuery;
    }
    await patchWorkshopOrderFields(orderId, fields, 'reschedule.issueRescheduleToken');
    return { token, expiresAt };
}

function formatPendingRescheduleLabel(order) {
    if (!order?.pendingRescheduleDate) return '';
    const d = new Date(order.pendingRescheduleDate);
    if (isNaN(d.getTime())) return '';
    return `${formatDateIL(d)} בשעה ${formatTimeIL(d)}`;
}

/** ManyChat confirmReschedule — returns confirmed boolean (no throw on business failure). */
export async function confirmRescheduleRequest(orderId) {
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'reschedule.confirmRescheduleRequest' });
    if (!order) return { confirmed: false };

    const chosenDateLabel = formatPendingRescheduleLabel(order);

    if (order.pendingRescheduleStatus === 'pending_staff_review') {
        return { confirmed: true, chosenDateLabel };
    }

    if (order.pendingRescheduleStatus !== 'requested' || !order.pendingRescheduleDate) {
        return { confirmed: false };
    }

    await mergePatchWorkshopOrder(orderId, {
        customerRescheduleCount: 1,
        pendingRescheduleStatus: 'pending_staff_review',
        rescheduleToken: null,
        rescheduleTokenExpiresAt: null,
    }, 'reschedule.confirmRescheduleRequest');

    await appendOrderActionLog(orderId, `הלקוח אישר סופית שינוי מועד ל: ${chosenDateLabel || '(תאריך לא ידוע)'}`);
    return { confirmed: true, chosenDateLabel };
}
