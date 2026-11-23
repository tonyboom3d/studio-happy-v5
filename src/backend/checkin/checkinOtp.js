/**
 * checkin/checkinOtp.js — 5-digit SMS OTP for the self check-in flow, scoped
 * to a CheckinSessions row (not AdminOtpCodes — this flow is anonymous and
 * device-token-bound, so it gets its own small state machine). Only the
 * SHA-256 hash of the code is ever stored.
 */
import { createHash } from 'crypto';
import { sendCheckinOtpSms } from 'backend/sendMsgService.jsw';
import { updateSession } from './checkinSessions.js';

const OTP_CODE_LENGTH = 5;
const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_SESSION = 5;

function hashOtp(code) {
    return createHash('sha256').update(String(code || '')).digest('hex');
}

function generateOtpCode() {
    const min = 10 ** (OTP_CODE_LENGTH - 1);
    const max = (10 ** OTP_CODE_LENGTH) - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
}

/** Sends (or resends) the OTP for this session+phone. Never throws. */
export async function sendCheckinOtp(session, phone) {
    const sendCount = Number(session.otpSendCount) || 0;
    if (sendCount >= MAX_SENDS_PER_SESSION) {
        return { ok: false, code: 'OTP_SEND_LIMIT' };
    }
    if (session.lastOtpAt && Date.now() - new Date(session.lastOtpAt).getTime() < RESEND_COOLDOWN_MS) {
        return { ok: false, code: 'OTP_COOLDOWN' };
    }

    const code = generateOtpCode();
    const smsResult = await sendCheckinOtpSms(phone, code).catch((err) => {
        console.error('[checkin/checkinOtp] sendCheckinOtpSms threw:', err?.message || err);
        return { sent: false };
    });
    if (!smsResult?.sent) {
        return { ok: false, code: 'SMS_FAILED' };
    }

    const updated = await updateSession(session, {
        phone,
        otpHash: hashOtp(code),
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        otpAttempts: 0,
        otpSendCount: sendCount + 1,
        lastOtpAt: new Date(),
        status: 'otp_sent',
    });
    return { ok: true, session: updated };
}

/** Pure check — caller persists otpAttempts via updateSession based on the result. */
export function checkCheckinOtpCode(session, code) {
    if (!session.otpHash || !session.otpExpiresAt) return { valid: false, code: 'NO_OTP' };
    if (Date.now() > new Date(session.otpExpiresAt).getTime()) return { valid: false, code: 'OTP_EXPIRED' };

    const attempts = Number(session.otpAttempts) || 0;
    if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) return { valid: false, code: 'OTP_LOCKED' };

    const valid = session.otpHash === hashOtp(code);
    return { valid, code: valid ? null : 'OTP_WRONG', attemptsAfter: attempts + 1 };
}
