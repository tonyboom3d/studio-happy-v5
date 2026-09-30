/**
 * Manager approval/rejection for customer reschedule requests — picks up
 * where rescheduleService.web.js's confirmRescheduleRequest leaves off
 * (pendingRescheduleStatus: 'pending_staff_review').
 *
 * Approve: the manager has ALREADY moved the booking / issued a credit
 * manually in Wix Bookings (this module never touches Bookings) — the UI
 * gates the button on a confirmation checkbox, and manualActionConfirmed
 * is re-checked here as a backend safety net. We just record the decision
 * and notify the customer.
 * Reject: resets the free-reschedule usage (same reset as the existing
 * cancelRescheduleRequest) so the customer isn't permanently blocked.
 *
 * CMS updates go through mergePatchWorkshopOrder (read → merge → write) —
 * see workshopOrderPatch.js. Never write a bare partial payload.
 */
import wixData from 'wix-data';
import { getItemWithRetry } from 'backend/wixDataRetry.js';
import { mergePatchWorkshopOrder } from 'backend/workshopOrderPatch.js';
import { enqueueManagerNotification, PRIORITY } from 'backend/notificationOutbox.js';
import { sendRescheduleDecisionManyChat } from 'backend/manychatService.jsw';

const SAC = { suppressAuth: true, consistentRead: true };
const ISRAEL_TZ = 'Asia/Jerusalem';
const EMPLOYEE_PORTAL_URL = 'https://www.studiohappy.art/employee-portal';

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

/** "23/09/2026 בשעה 14:30" — used both in the manager alert and in actionLog entries. */
function formatDateTimeLabel(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return `${formatDateIL(d)} בשעה ${formatTimeIL(d)}`;
}

function toIsoOrNull(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Appends one structured entry to WorkshopOrders.actionLog. Extra keys
 * (kind/event/fromDate/toDate/reason) ride alongside the existing
 * { timestamp, user, action } shape used everywhere else — the dashboard's
 * log UI only reads `action`, so this stays backward compatible.
 */
async function appendOrderActionLog(orderId, { user, action, event, fromDate, toDate, reason } = {}) {
    try {
        const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'rescheduleDecision.appendOrderActionLog' });
        if (!order) return null;
        const entry = {
            timestamp: new Date().toISOString(),
            user: user || 'מנהל/ת',
            action,
            kind: 'reschedule',
            event: event || null,
            fromDate: toIsoOrNull(fromDate),
            toDate: toIsoOrNull(toDate),
            reason: reason || null,
        };
        const actionLog = [entry, ...(order.actionLog || [])].slice(0, 200);
        return mergePatchWorkshopOrder(orderId, { actionLog }, 'rescheduleDecision.appendOrderActionLog');
    } catch (err) {
        console.warn('[rescheduleDecision] appendOrderActionLog failed. orderId:', orderId, 'error:', err?.message || err);
        return null;
    }
}

/**
 * Alerts every manager (Dashboard_Roles.manageScheduling + phone) that a
 * customer just confirmed a new date and it needs manual review. Deduped
 * per order via entityKey. Never throws — called right after the customer's
 * WhatsApp confirmation and must not block that flow.
 */
export async function notifyManagersOfRescheduleRequest(order) {
    try {
        if (!order?._id) return;
        const vars = {
            organizerName: order.organizerName || 'לקוח/ה',
            organizerPhone: order.organizerPhone || '',
            workshopName: order.workshopType || 'סדנה',
            currentDate: formatDateTimeLabel(order.workshopStart),
            requestedDate: formatDateTimeLabel(order.pendingRescheduleDate),
            orderNumber: order.ecomOrderNumber || order._id,
            reviewLink: EMPLOYEE_PORTAL_URL,
        };
        await enqueueManagerNotification('manager_reschedule_request', vars, {
            priority: PRIORITY.URGENT,
            entityKey: `reschedule:${order._id}`,
        });
    } catch (err) {
        console.warn('[rescheduleDecision] notifyManagersOfRescheduleRequest failed. orderId:', order?._id, 'error:', err?.message || err);
    }
}

/** Open reschedule requests waiting for manager review — order dashboard banner + employee portal panel. */
export async function listPendingRescheduleRequests() {
    const result = await wixData.query('WorkshopOrders')
        .eq('pendingRescheduleStatus', 'pending_staff_review')
        .descending('pendingRescheduleRequestedAt')
        .limit(100)
        .find(SAC)
        .catch(() => ({ items: [] }));

    return (result.items || []).map((o) => ({
        orderId: o._id,
        organizerName: o.organizerName || '',
        organizerPhone: o.organizerPhone || '',
        workshopType: o.workshopType || '',
        currentDate: toIsoOrNull(o.workshopStart),
        currentDateLabel: formatDateTimeLabel(o.workshopStart),
        requestedDate: toIsoOrNull(o.pendingRescheduleDate),
        requestedDateLabel: formatDateTimeLabel(o.pendingRescheduleDate),
        requestedAt: toIsoOrNull(o.pendingRescheduleRequestedAt),
    }));
}

/**
 * Manager approves. Requires manualActionConfirmed=true — the UI's
 * confirmation popup ("I already moved the booking / issued the credit")
 * is the only place that flag is set; this is a backend safety net so a
 * scripted call can't skip it.
 */
export async function approveReschedule(orderId, { actorName, manualActionConfirmed } = {}) {
    if (!orderId) throw new Error('BAD_REQUEST: חסר מזהה הזמנה.');
    if (!manualActionConfirmed) {
        throw new Error('BAD_REQUEST: יש לאשר שהעדכון/הזיכוי בוצע ידנית לפני האישור.');
    }

    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'rescheduleDecision.approveReschedule' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');
    if (order.pendingRescheduleStatus !== 'pending_staff_review') {
        throw new Error('NOT_PENDING: אין בקשת שינוי מועד ממתינה להזמנה זו.');
    }

    const chosenDateLabel = formatDateTimeLabel(order.pendingRescheduleDate);
    const fromLabel = formatDateTimeLabel(order.workshopStart);

    await mergePatchWorkshopOrder(orderId, {
        pendingRescheduleStatus: 'approved',
    }, 'rescheduleDecision.approveReschedule');

    await appendOrderActionLog(orderId, {
        user: actorName || 'מנהל/ת',
        action: `בקשת שינוי מועד אושרה על ידי ${actorName || 'מנהל/ת'}: ${fromLabel} → ${chosenDateLabel}`,
        event: 'approved',
        fromDate: order.workshopStart,
        toDate: order.pendingRescheduleDate,
    });

    await sendRescheduleDecisionManyChat(order, 'approved').catch((err) => {
        console.warn('[rescheduleDecision] sendRescheduleDecisionManyChat(approved) failed. orderId:', orderId, 'error:', err?.message || err);
    });

    return { ok: true, chosenDateLabel };
}

/**
 * Manager rejects. Resets customerRescheduleCount so the customer's free
 * reschedule is restored and they can request a different date instead of
 * being permanently blocked.
 */
export async function rejectReschedule(orderId, { actorName, reason } = {}) {
    if (!orderId) throw new Error('BAD_REQUEST: חסר מזהה הזמנה.');

    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'rescheduleDecision.rejectReschedule' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');
    if (order.pendingRescheduleStatus !== 'pending_staff_review') {
        throw new Error('NOT_PENDING: אין בקשת שינוי מועד ממתינה להזמנה זו.');
    }

    const requestedLabel = formatDateTimeLabel(order.pendingRescheduleDate);

    await mergePatchWorkshopOrder(orderId, {
        customerRescheduleCount: 0,
        pendingRescheduleStatus: null,
        pendingRescheduleDate: null,
        rescheduleToken: null,
        rescheduleTokenExpiresAt: null,
    }, 'rescheduleDecision.rejectReschedule');

    await appendOrderActionLog(orderId, {
        user: actorName || 'מנהל/ת',
        action: `בקשת שינוי מועד ל-${requestedLabel} נדחתה על ידי ${actorName || 'מנהל/ת'}${reason ? ` — סיבה: ${reason}` : ''} — השימוש החינמי שוחזר.`,
        event: 'rejected',
        toDate: order.pendingRescheduleDate,
        reason: reason || null,
    });

    await sendRescheduleDecisionManyChat(order, 'rejected', { reason }).catch((err) => {
        console.warn('[rescheduleDecision] sendRescheduleDecisionManyChat(rejected) failed. orderId:', orderId, 'error:', err?.message || err);
    });

    return { ok: true };
}
