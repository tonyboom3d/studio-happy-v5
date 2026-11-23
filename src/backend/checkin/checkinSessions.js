/**
 * checkin/checkinSessions.js — the "anti-sharing" device-token session
 * behind the self check-in QR flow. The QR code points at /checkin with no
 * identifying query param; the first load generates a random device token,
 * stores only its SHA-256 hash server-side (never the raw token), and the
 * client persists the raw token in localStorage + the returned sessionId in
 * the URL (?cs=) so a refresh/re-open resumes. Opening the same ?cs= link
 * from a *different* browser/device (missing or mismatched local token)
 * fails closed with NON_TRANSFERABLE — the link cannot be shared/forwarded.
 *
 * CheckinSessions CMS fields — see wix/src/backend/checkin/README.md.
 */
import wixData from 'wix-data';
import { createHash, randomBytes } from 'crypto';

const SA = { suppressAuth: true };

// Fallback session lifetime until a workshop order is matched and
// requireValidSession's real `expiresAt` (end of that workshop's day) takes
// over — see checkinOrder.js / checkinService.web.js.
const UNMATCHED_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

export function generateDeviceToken() {
    return randomBytes(24).toString('hex');
}

export function hashDeviceToken(token) {
    return createHash('sha256').update(String(token || '')).digest('hex');
}

function nonTransferableError() {
    return Object.assign(new Error('NON_TRANSFERABLE'), { code: 'NON_TRANSFERABLE' });
}

function sessionExpiredError() {
    return Object.assign(new Error('SESSION_EXPIRED'), { code: 'SESSION_EXPIRED' });
}

/** Creates (or returns the existing) session row for this device token — idempotent per token. */
export async function startCheckinSession(deviceToken) {
    const deviceTokenHash = hashDeviceToken(deviceToken);
    if (!deviceTokenHash) throw nonTransferableError();

    const existing = await wixData.query('CheckinSessions').eq('deviceTokenHash', deviceTokenHash).find(SA);
    if (existing.items?.length) return existing.items[0];

    return wixData.insert('CheckinSessions', {
        deviceTokenHash,
        status: 'new',
        phone: null,
        orderId: null,
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        otpSendCount: 0,
        lastOtpAt: null,
        checkedInAt: null,
        expiresAt: new Date(Date.now() + UNMATCHED_SESSION_TTL_MS),
    }, SA);
}

export async function getSessionById(sessionId) {
    if (!sessionId) return null;
    return wixData.get('CheckinSessions', sessionId, SA).catch(() => null);
}

/**
 * The core anti-sharing check: the session row (looked up by the `?cs=`
 * sessionId in the URL) must belong to the device presenting `deviceToken`.
 * Missing session, hash mismatch, or an expired session all fail closed.
 */
export async function requireValidSession(sessionId, deviceToken) {
    const session = await getSessionById(sessionId);
    if (!session) throw nonTransferableError();

    const deviceTokenHash = hashDeviceToken(deviceToken);
    if (!deviceTokenHash || session.deviceTokenHash !== deviceTokenHash) throw nonTransferableError();

    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
        throw sessionExpiredError();
    }

    return session;
}

export async function updateSession(session, patch) {
    return wixData.update('CheckinSessions', { ...session, ...patch }, SA);
}
