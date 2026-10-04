/**
 * pickupSchedulingService.web.js — "תיאום איסוף" page (customer self-service
 * pickup-appointment picker). The token in the URL is the authentication for
 * these Anyone-permission methods, same trade-off as rescheduleService.web.js.
 *
 * Flow: ManyChat calls http-functions.js get_startPickup, which (when the
 * order is eligible) issues a pickupToken and sends the customer a link to
 * the pickup page: ?orderId=...&token=...&sid=<subscriberId>. The page/CE
 * calls getPickupContext to render the calendar, then submitPickupAppointment
 * once a slot is chosen.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { assertPermission } from 'backend/dashboardService.web.js';
import {
    getPickupEligibility,
    loadPickupSlots,
    loadOrderByPickupToken,
    createPickupAppointment,
    findUpcomingAppointment,
    ensureAppointmentPass,
    generatePassQr,
    getPickupScan,
    confirmPickupHandover,
    PICKUP_WINDOW_DAYS,
    PICKUP_MAX_APPOINTMENTS,
} from 'backend/pickupScheduling.js';

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

function mapSlotForClient(slot) {
    return {
        slotKey: slot.slotKey,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        workshopName: slot.workshopName,
        ordersCount: slot.ordersCount,
    };
}

function mapAppointmentForClient(appointment) {
    if (!appointment) return null;
    return {
        slotKey: appointment.slotKey,
        start: appointment.start,
        end: appointment.end,
        workshopName: appointment.workshopName,
        status: appointment.status,
        staffRecipient: appointment.staffRecipient || null,
    };
}

const STATUS_MESSAGES = {
    no_items: 'לא נמצאו פריטים מוכנים לאיסוף להזמנה זו. אם מדובר בטעות, יש לפנות לשירות הלקוחות.',
    collected: 'כל הפריטים בהזמנה זו נאספו כבר. אין צורך בתיאום נוסף.',
    expired: `עברו ${PICKUP_WINDOW_DAYS} ימים מאז שהפריטים הוכרזו מוכנים לאיסוף. ניתן לפנות לשירות הלקוחות לבדיקת המשך.`,
    quota_exceeded: `נוצלו כל ${PICKUP_MAX_APPOINTMENTS} התיאומים האפשריים להזמנה זו. ניתן לפנות לשירות הלקוחות להמשך תיאום.`,
};

/** Page/CE load — validates the link and returns everything needed to render the calendar. */
export const getPickupContext = webMethod(Permissions.Anyone, async (orderId, token) => {
    let order;
    try {
        order = await loadOrderByPickupToken(orderId, token);
    } catch (err) {
        return toClientError(err);
    }

    const eligibility = getPickupEligibility(order);
    const upcoming = ['no_items', 'collected'].includes(eligibility.status) ? null : findUpcomingAppointment(order);

    // Open appointment → show it with its QR (even if the quota/window rules block booking another).
    let currentAppointment = null;
    let qrDataUrl = null;
    if (upcoming) {
        currentAppointment = await ensureAppointmentPass(order, upcoming);
        qrDataUrl = await generatePassQr(order._id, currentAppointment.passToken).catch(() => null);
    }

    if (eligibility.status !== 'ok' && !upcoming) {
        return {
            error: true,
            code: eligibility.status.toUpperCase(),
            message: STATUS_MESSAGES[eligibility.status] || 'לא ניתן לתאם איסוף כרגע.',
            deadline: eligibility.deadline ? eligibility.deadline.toISOString() : null,
        };
    }

    const canBook = eligibility.status === 'ok';
    const slots = canBook ? await loadPickupSlots(eligibility.deadline) : [];

    return {
        orderId: order._id,
        organizerName: order.organizerName || '',
        deadline: eligibility.deadline ? eligibility.deadline.toISOString() : null,
        used: eligibility.used ?? (order.pickupAppointments || []).length,
        remaining: eligibility.remaining ?? 0,
        readyCount: eligibility.readyCount ?? 0,
        canBook,
        currentAppointment: mapAppointmentForClient(currentAppointment),
        qrDataUrl,
        slots: slots.map(mapSlotForClient),
    };
});

/** Staff scan page (QR target) — members only, requires dashboard access. */
export const getPickupScanContext = webMethod(Permissions.SiteMember, async (orderId, pass) => {
    try {
        await assertPermission('viewDashboard');
        return await getPickupScan(orderId, pass);
    } catch (err) {
        return toClientError(err);
    }
});

/** Staff confirm handover with the verification code; identity comes from the logged-in member. */
export const confirmPickupHandoverScan = webMethod(Permissions.SiteMember, async (orderId, pass, code) => {
    try {
        await assertPermission('viewDashboard');
        return await confirmPickupHandover(orderId, pass, code);
    } catch (err) {
        return { ok: false, ...toClientError(err) };
    }
});

/** Confirms a chosen pickup slot — one WhatsApp-style flow step, no confirmation email/SMS needed. */
export const submitPickupAppointment = webMethod(Permissions.Anyone, async (orderId, token, slotKey) => {
    try {
        await loadOrderByPickupToken(orderId, token);
    } catch (err) {
        return { ok: false, ...toClientError(err) };
    }

    if (!slotKey) {
        return { ok: false, error: true, code: 'BAD_REQUEST', message: 'לא נבחר מועד.' };
    }

    try {
        const result = await createPickupAppointment(orderId, slotKey);
        return {
            ok: true,
            appointment: mapAppointmentForClient(result.appointment),
            qrDataUrl: result.qrDataUrl,
            messageSent: result.messageSent,
            used: result.used,
            remaining: result.remaining,
        };
    } catch (err) {
        return { ok: false, ...toClientError(err) };
    }
});
