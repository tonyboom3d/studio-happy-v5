/**
 * orderLookupOtpService.js — Process 2: identify order via alternate phone + SMS OTP.
 * Used when the ManyChat WhatsApp number differs from the order's organizerPhone.
 */
import wixData from 'wix-data';
import { normalizeIsraeliPhone } from 'backend/orderUtils.js';
import { sendOrderLookupOtpSms } from 'backend/sendMsgService.jsw';
import {
    findOrdersByPhone,
    filterActiveOrders,
    selectActiveOrder,
    formatOrderMessage,
    NO_ACTIVE_ORDER_MESSAGE,
    ORDER_NOT_FOUND_MESSAGE,
} from 'backend/orderLookupService.js';

const SA = { suppressAuth: true };
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_CODE_LENGTH = 5;
const OTP_MAX_ATTEMPTS = 3;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function generateOtpCode() {
    const min = 10 ** (OTP_CODE_LENGTH - 1);
    const max = (10 ** OTP_CODE_LENGTH) - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function maskPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 4) return '****';
    return '****' + digits.slice(-4);
}

export function isOrderLookupVerificationValid(verifiedAtRaw, nowMs = Date.now()) {
    if (!verifiedAtRaw) return false;
    const ts = new Date(verifiedAtRaw).getTime();
    if (!Number.isFinite(ts)) return false;
    return nowMs - ts < VERIFICATION_TTL_MS;
}

async function clearOtpRows(orderId, phoneNorm) {
    const existing = await wixData.query('AdminOtpCodes')
        .eq('orderId', orderId)
        .eq('phone', phoneNorm)
        .find(SA);
    await Promise.all(existing.items.map((row) => wixData.remove('AdminOtpCodes', row._id, SA)));
}

async function resolveActivePrimaryOrder(phone) {
    const allOrders = await findOrdersByPhone(phone);
    const activeOrders = filterActiveOrders(allOrders);
    const hadUnavailableOnly = allOrders.length > 0 && activeOrders.length === 0;
    const selection = selectActiveOrder(activeOrders, '');
    return { allOrders, activeOrders, hadUnavailableOnly, ...selection };
}

/**
 * Sends a 5-digit OTP SMS to the organizer phone after confirming an active order exists.
 */
export async function sendOrderLookupOtp(phone) {
    const phoneNorm = normalizeIsraeliPhone(phone);
    if (!phoneNorm) {
        return {
            success: false,
            reason: 'invalid_phone',
            incrementAttempts: false,
            ai_reply: 'מספר הטלפון שהוזן אינו תקין. נא להזין מספר ישראלי בפורמט 05XXXXXXXX.',
        };
    }

    const { primary, hadUnavailableOnly, activeOrders } = await resolveActivePrimaryOrder(phone);
    if (hadUnavailableOnly) {
        return {
            success: false,
            reason: 'no_active_order',
            incrementAttempts: true,
            order_lookup_unavailable: true,
            ai_reply: NO_ACTIVE_ORDER_MESSAGE,
        };
    }
    if (!primary) {
        return {
            success: false,
            reason: 'order_not_found',
            incrementAttempts: true,
            ai_reply: ORDER_NOT_FOUND_MESSAGE,
        };
    }

    const code = generateOtpCode();
    await clearOtpRows(primary.id, phoneNorm);
    await wixData.insert('AdminOtpCodes', {
        orderId: primary.id,
        phone: phoneNorm,
        code,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        attempts: 0,
    }, SA);

    const smsResult = await sendOrderLookupOtpSms(phone, code);
    if (!smsResult?.sent) {
        await clearOtpRows(primary.id, phoneNorm);
        return {
            success: false,
            reason: 'sms_failed',
            sms_error: smsResult?.reason || 'error',
            incrementAttempts: true,
            ai_reply: 'לא הצלחנו לשלוח קוד אימות. נסו שוב בעוד כמה דקות.',
        };
    }

    return {
        success: true,
        reason: 'otp_sent',
        masked_phone: maskPhone(phone),
        order_id: primary.id,
        order_source: primary.source,
        incrementAttempts: false,
        ai_reply: `שלחנו קוד אימות ב-SMS למספר ${maskPhone(phone)} 📱`,
        has_more: activeOrders.length > 1,
    };
}

/**
 * Verifies the OTP and returns the matched order payload for display.
 */
export async function verifyOrderLookupOtp(phone, code) {
    const phoneNorm = normalizeIsraeliPhone(phone);
    const codeStr = String(code || '').trim();
    if (!phoneNorm || !codeStr) {
        return { valid: false, reason: 'missing_phone_or_code', incrementAttempts: false };
    }

    const { primary: orderForOtp } = await resolveActivePrimaryOrder(phone);
    if (!orderForOtp) {
        return { valid: false, reason: 'order_not_found', incrementAttempts: true };
    }

    const result = await wixData.query('AdminOtpCodes')
        .eq('orderId', orderForOtp.id)
        .eq('phone', phoneNorm)
        .find(SA);
    const entry = result.items[0];

    if (!entry) {
        return {
            valid: false,
            reason: 'no_otp_requested',
            incrementAttempts: false,
            ai_reply: 'לא נשלח קוד אימות למספר הזה. בקשו קוד חדש.',
        };
    }
    if (Date.now() > new Date(entry.expiresAt).getTime()) {
        await wixData.remove('AdminOtpCodes', entry._id, SA);
        return {
            valid: false,
            reason: 'expired',
            incrementAttempts: false,
            ai_reply: 'פג תוקף הקוד. לחצו "שלחו לי קוד שוב" לקבלת קוד חדש.',
        };
    }

    const attempts = (entry.attempts || 0) + 1;

    if (entry.code !== codeStr) {
        if (attempts >= OTP_MAX_ATTEMPTS) {
            await wixData.remove('AdminOtpCodes', entry._id, SA);
            return {
                valid: false,
                reason: 'too_many_attempts',
                incrementAttempts: true,
                ai_reply: 'חרגתם ממספר ניסיונות האימות. נסו שוב מאוחר יותר או פנו לנציג.',
            };
        }
        await wixData.update('AdminOtpCodes', { ...entry, attempts }, SA);
        const remaining = OTP_MAX_ATTEMPTS - attempts;
        return {
            valid: false,
            reason: 'wrong_code',
            incrementAttempts: false,
            attempts_remaining: remaining,
            ai_reply: `הקוד שגוי. נותרו ${remaining} ניסיונות.`,
        };
    }

    await wixData.remove('AdminOtpCodes', entry._id, SA);

    const { activeOrders, hadUnavailableOnly } = await resolveActivePrimaryOrder(phone);
    const order = activeOrders.find((o) => o.id === entry.orderId);
    if (!order) {
        return {
            valid: false,
            reason: hadUnavailableOnly ? 'no_active_order' : 'order_not_found',
            incrementAttempts: true,
            order_lookup_unavailable: !!hadUnavailableOnly,
            ai_reply: hadUnavailableOnly ? NO_ACTIVE_ORDER_MESSAGE : ORDER_NOT_FOUND_MESSAGE,
        };
    }

    const verifiedAt = new Date().toISOString();
    return {
        valid: true,
        reason: 'verified',
        verified_at: verifiedAt,
        verification_valid: true,
        found: true,
        has_more: activeOrders.length > 1,
        order_id: order.id,
        order_source: order.source,
        order_url: order.orderUrl || '',
        order_lookup_unavailable: false,
        ai_reply: formatOrderMessage(order),
        incrementAttempts: false,
    };
}

export function buildVerificationCheckResponse(verifiedAtRaw) {
    const verificationValid = isOrderLookupVerificationValid(verifiedAtRaw);
    return {
        verification_valid: verificationValid,
        skip_otp: verificationValid,
        verified_at: verifiedAtRaw || null,
    };
}
