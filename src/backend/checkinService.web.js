/**
 * checkinService.web.js — web methods for the self check-in flow (QR scan →
 * phone → SMS OTP → success). Anonymous/public by design (Permissions.Anyone)
 * since customers are never logged-in Wix members; the device-token session
 * (checkin/checkinSessions.js) is what prevents the link from being shared.
 *
 * Every method returns `{ ok: true, ... }` or `{ ok: false, code }` — never
 * throws to the client. See self-checkin.js for the Hebrew code→message map.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { normalizeIsraeliPhone } from 'backend/orderUtils.js';
import {
    startCheckinSession as createSession,
    requireValidSession,
    updateSession,
} from 'backend/checkin/checkinSessions.js';
import { sendCheckinOtp, checkCheckinOtpCode } from 'backend/checkin/checkinOtp.js';
import { isCheckinAllowedForPhone, getCheckinSettings } from 'backend/checkin/checkinConfig.js';
import { findCheckinEligibleOrder, getOrderById, buildOrderDto, markCheckedIn } from 'backend/checkin/checkinOrder.js';
import { findAssignedStaffForOrder } from 'backend/checkin/checkinStaff.js';
import { printCheckinReceipts } from 'backend/checkin/checkinReceipts.js';

function fail(code) {
    return { ok: false, code };
}

/** End-of-Israel-day timestamp for a given date — used as the session's real expiry once an order is matched. */
function endOfIsraelDay(dateInput) {
    const d = new Date(dateInput);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    // Approximate UTC end-of-day for the Israel calendar date (good enough for session TTL purposes).
    return new Date(`${get('year')}-${get('month')}-${get('day')}T23:59:59+03:00`);
}

async function buildSuccessPayload(order) {
    const dto = buildOrderDto(order);
    const staff = await findAssignedStaffForOrder(order).catch(() => null);
    return { order: dto, staff };
}

/** Step 1 — called once on page load. Creates/resumes the device-token session. */
export const startCheckinSession = webMethod(Permissions.Anyone, async (deviceToken) => {
    try {
        if (!deviceToken || typeof deviceToken !== 'string') return fail('NON_TRANSFERABLE');
        const session = await createSession(deviceToken);
        return { ok: true, sessionId: session._id, status: session.status };
    } catch (err) {
        console.error('[checkinService] startCheckinSession failed:', err?.message || err);
        return fail('SYSTEM_ERROR');
    }
});

/** Called on load/refresh to resume wherever this device's session left off. */
export const getCheckinState = webMethod(Permissions.Anyone, async (sessionId, deviceToken) => {
    try {
        const session = await requireValidSession(sessionId, deviceToken);

        if (session.status === 'checked_in' && session.orderId) {
            const order = await getOrderById(session.orderId);
            if (order) return { ok: true, step: 'success', ...(await buildSuccessPayload(order)) };
        }
        if (session.status === 'otp_sent' && session.phone) {
            return { ok: true, step: 'otp', phone: session.phone };
        }
        return { ok: true, step: 'phone' };
    } catch (err) {
        if (err?.code) return fail(err.code);
        console.error('[checkinService] getCheckinState failed:', err?.message || err);
        return fail('SYSTEM_ERROR');
    }
});

/** Step 2 — customer submits their phone. Finds today's eligible order and sends the OTP. */
export const requestCheckinOtp = webMethod(Permissions.Anyone, async (sessionId, deviceToken, rawPhone) => {
    try {
        const session = await requireValidSession(sessionId, deviceToken);

        const phone = normalizeIsraeliPhone(rawPhone);
        if (!phone) return fail('INVALID_PHONE');

        const allowed = await isCheckinAllowedForPhone(phone);
        if (!allowed) return fail('FEATURE_DISABLED');

        const { windowBeforeMin } = await getCheckinSettings();
        const { order, reason } = await findCheckinEligibleOrder(phone, windowBeforeMin);
        if (!order) return fail(reason || 'NO_ORDER_TODAY');

        const sendResult = await sendCheckinOtp(session, phone);
        if (!sendResult.ok) return fail(sendResult.code);

        await updateSession(sendResult.session, {
            orderId: order._id,
            expiresAt: endOfIsraelDay(order.workshopStart),
        });

        return { ok: true, step: 'otp', phone };
    } catch (err) {
        if (err?.code) return fail(err.code);
        console.error('[checkinService] requestCheckinOtp failed:', err?.message || err);
        return fail('SYSTEM_ERROR');
    }
});

/** Step 3 — verifies the OTP, marks the order checked-in, and fires the 2 receipts. */
export const verifyCheckinOtp = webMethod(Permissions.Anyone, async (sessionId, deviceToken, code) => {
    try {
        const session = await requireValidSession(sessionId, deviceToken);
        if (!session.orderId) return fail('NO_OTP');

        const check = checkCheckinOtpCode(session, code);
        if (!check.valid) {
            if (check.code !== 'OTP_EXPIRED' && check.code !== 'OTP_LOCKED') {
                await updateSession(session, { otpAttempts: check.attemptsAfter });
            }
            return fail(check.code);
        }

        const order = await getOrderById(session.orderId);
        if (!order) return fail('NO_ORDER_TODAY');

        const checkedInOrder = await markCheckedIn(order, { phone: session.phone, sessionId: session._id });
        await updateSession(session, { status: 'checked_in', checkedInAt: new Date() });

        const payload = await buildSuccessPayload(checkedInOrder);

        // Fire-and-forget — a printer failure must never block the success screen.
        printCheckinReceipts(checkedInOrder, payload.order).catch((err) => {
            console.error('[checkinService] printCheckinReceipts failed:', err?.message || err);
        });

        return { ok: true, step: 'success', ...payload };
    } catch (err) {
        if (err?.code) return fail(err.code);
        console.error('[checkinService] verifyCheckinOtp failed:', err?.message || err);
        return fail('SYSTEM_ERROR');
    }
});
