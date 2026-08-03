/**
 * Shift change/deletion requests (Module A) — internal module, no web methods.
 *
 * SCHEDULED/STANDBY shifts can't be edited or deleted directly; the employee
 * files a request here, a WhatsApp goes out to managers with a tokenized
 * link, and the manager's decision (via shiftChangeRequests.web.js /
 * shift-request-review page) is the only thing that applies the change.
 *
 * Collection: ShiftChangeRequests — submissionId, employeeId, employeeName,
 * type ('EDIT'|'DELETE'), originalDate/StartTime/EndTime, requestedStartTime/
 * EndTime (EDIT only), notes, status ('PENDING'|'APPROVED'|'DECLINED'),
 * managerComment, decidedAt, employeeAcked, token.
 */
import wixData from 'wix-data';
import {
    SUBMISSION_STATUS,
    toDateKey,
    shiftHours,
    getMinShiftHours,
} from 'backend/availabilityRules.js';
import { notifyManagers, publishSchedulingUpdate, loadSettings } from 'backend/schedulingEngine.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const REVIEW_URL = 'https://www.studiohappy.art/shift-request-review';
const REQUEST_TYPE = { EDIT: 'EDIT', DELETE: 'DELETE' };
const REQUEST_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', DECLINED: 'DECLINED' };
// Business hours enforced across the portal's shift time pickers.
const SHIFT_MIN_TIME = '07:00';
const SHIFT_MAX_TIME = '23:59';

function randomToken() {
    let out = '';
    for (let i = 0; i < 40; i++) out += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)];
    return out;
}

function formatDateHe(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
    return `${dow}, ${d}.${m}.${y}`;
}

async function findByToken(token) {
    if (!token) return null;
    const result = await wixData.query('ShiftChangeRequests')
        .eq('token', token)
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    return result.items?.[0] || null;
}

function buildRequestMessage(employeeName, submission, type, requested, notes, token) {
    const dateHe = formatDateHe(submission.dateKey);
    const lines = [
        `📋 בקשת ${type === REQUEST_TYPE.DELETE ? 'מחיקת' : 'שינוי'} משמרת מ-${employeeName}`,
        `משמרת קיימת: ${dateHe} · ${submission.startTime}–${submission.endTime}`,
    ];
    if (type === REQUEST_TYPE.EDIT) {
        lines.push(`שעות מבוקשות: ${requested.startTime}–${requested.endTime}`);
    } else {
        lines.push(`הבקשה: מחיקת המשמרת`);
    }
    if (notes) lines.push(`הערת העובד/ת: ${notes}`);
    lines.push(`לאישור/דחייה: ${REVIEW_URL}?token=${token}`);
    return lines.join('\n');
}

/**
 * Creates a pending change/deletion request for a SCHEDULED/STANDBY
 * submission owned by the caller, and notifies managers via WhatsApp.
 */
export async function createShiftChangeRequest(role, submissionId, payload) {
    if (!submissionId) throw new Error('BAD_REQUEST: חסר מזהה משמרת.');
    const submission = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    if (!submission || submission.employeeId !== role._id) {
        throw new Error('NOT_FOUND: המשמרת לא נמצאה.');
    }
    if (submission.status !== SUBMISSION_STATUS.SCHEDULED && submission.status !== SUBMISSION_STATUS.STANDBY) {
        throw new Error('BAD_REQUEST: ניתן לבקש שינוי רק למשמרות משובצות או בהמתנה — משמרות שטרם אושרו ניתן לערוך ישירות.');
    }

    const existing = await wixData.query('ShiftChangeRequests')
        .eq('submissionId', submissionId)
        .eq('status', REQUEST_STATUS.PENDING)
        .limit(1).find(SA).catch(() => ({ items: [] }));
    if (existing.items?.length) {
        throw new Error('BAD_REQUEST: יש כבר בקשה בטיפול למשמרת הזו.');
    }

    const type = payload?.type === REQUEST_TYPE.DELETE ? REQUEST_TYPE.DELETE : REQUEST_TYPE.EDIT;
    const dateKey = toDateKey(submission.date);
    let requestedStartTime = null, requestedEndTime = null;

    if (type === REQUEST_TYPE.EDIT) {
        const settings = await loadSettings();
        requestedStartTime = String(payload?.requestedStartTime || '').trim();
        requestedEndTime = String(payload?.requestedEndTime || '').trim();
        if (requestedStartTime < SHIFT_MIN_TIME || requestedStartTime > SHIFT_MAX_TIME
            || requestedEndTime < SHIFT_MIN_TIME || requestedEndTime > SHIFT_MAX_TIME) {
            throw new Error(`BAD_REQUEST: שעות המשמרת חייבות להיות בין ${SHIFT_MIN_TIME} ל-${SHIFT_MAX_TIME}.`);
        }
        const hrs = shiftHours(requestedStartTime, requestedEndTime);
        const minHrs = getMinShiftHours(role, settings);
        if (hrs === null || hrs < minHrs) {
            throw new Error(`BAD_REQUEST: אורך המשמרת המבוקשת קצר מהמינימום (${minHrs} שעות) או שהשעות שגויות.`);
        }
    }

    const notes = typeof payload?.notes === 'string' ? payload.notes.trim().slice(0, 500) : '';
    const token = randomToken();
    const employeeName = role.displayName || 'עובד/ת';

    await wixData.insert('ShiftChangeRequests', {
        submissionId,
        employeeId: role._id,
        employeeName,
        type,
        originalDate: dateKey,
        originalStartTime: submission.startTime,
        originalEndTime: submission.endTime,
        requestedStartTime,
        requestedEndTime,
        notes,
        status: REQUEST_STATUS.PENDING,
        managerComment: '',
        decidedAt: null,
        employeeAcked: false,
        token,
    }, SA);

    const message = buildRequestMessage(
        employeeName,
        { dateKey, startTime: submission.startTime, endTime: submission.endTime },
        type,
        { startTime: requestedStartTime, endTime: requestedEndTime },
        notes,
        token,
    );
    const sentCount = await notifyManagers(message).catch(err => {
        console.error('[shiftChangeRequests] notifyManagers failed:', err?.message || err);
        return 0;
    });

    console.log(`[shiftChangeRequests] request created: submission=${submissionId} type=${type} notified=${sentCount}`);
    return { ok: true };
}

/** Manager-safe detail payload for the review page. */
export async function getRequestByToken(token) {
    const r = await findByToken(token);
    if (!r) return null;
    return {
        employeeName: r.employeeName || 'עובד/ת',
        type: r.type,
        originalDate: r.originalDate,
        originalStartTime: r.originalStartTime,
        originalEndTime: r.originalEndTime,
        requestedStartTime: r.requestedStartTime,
        requestedEndTime: r.requestedEndTime,
        notes: r.notes || '',
        status: r.status,
        managerComment: r.managerComment || '',
        decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : null,
    };
}

/**
 * Applies the manager's decision. Idempotent: replaying an already-decided
 * token just returns the stored decision.
 */
export async function decideRequestByToken(token, decision, comment) {
    const r = await findByToken(token);
    if (!r) throw new Error('NOT_FOUND: הקישור אינו תקף.');

    if (r.status !== REQUEST_STATUS.PENDING) {
        return {
            ok: true,
            alreadyDecided: true,
            status: r.status,
            managerComment: r.managerComment || '',
        };
    }

    const approve = decision === 'APPROVE';
    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 500) : '';
    const now = new Date();

    if (approve) {
        const submission = await wixData.get('AvailabilitySubmissions', r.submissionId, SA).catch(() => null);
        if (submission) {
            if (r.type === REQUEST_TYPE.DELETE) {
                await wixData.remove('AvailabilitySubmissions', r.submissionId, SA).catch(() => null);
            } else {
                await wixData.update('AvailabilitySubmissions', {
                    ...submission,
                    startTime: r.requestedStartTime,
                    endTime: r.requestedEndTime,
                    hours: shiftHours(r.requestedStartTime, r.requestedEndTime),
                }, SA).catch(() => null);
            }
            await publishSchedulingUpdate('shift-change-request', { dates: [r.originalDate] }).catch(() => null);
        }
    }

    const status = approve ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.DECLINED;
    await wixData.update('ShiftChangeRequests', {
        ...r,
        status,
        managerComment: cleanComment,
        decidedAt: now,
        employeeAcked: false,
    }, SA);

    console.log(`[shiftChangeRequests] decided: id=${r._id} status=${status}`);
    return { ok: true, status, managerComment: cleanComment };
}

/** Caller's own pending or not-yet-acknowledged requests (for the portal). */
export async function loadMyChangeRequests(roleId) {
    const result = await wixData.query('ShiftChangeRequests')
        .eq('employeeId', roleId)
        .ne('employeeAcked', true)
        .descending('_createdDate')
        .limit(100).find(SA).catch(() => ({ items: [] }));
    return (result.items || []).map(r => ({
        id: r._id,
        submissionId: r.submissionId,
        type: r.type,
        originalDate: r.originalDate,
        originalStartTime: r.originalStartTime,
        originalEndTime: r.originalEndTime,
        requestedStartTime: r.requestedStartTime,
        requestedEndTime: r.requestedEndTime,
        notes: r.notes || '',
        status: r.status,
        managerComment: r.managerComment || '',
        decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : null,
    }));
}

/** Marks the caller's own request as acknowledged (dismiss the banner). */
export async function acknowledgeRequest(roleId, requestId) {
    if (!requestId) throw new Error('BAD_REQUEST: חסר מזהה בקשה.');
    const r = await wixData.get('ShiftChangeRequests', requestId, SA).catch(() => null);
    if (!r || r.employeeId !== roleId) throw new Error('NOT_FOUND: הבקשה לא נמצאה.');
    await wixData.update('ShiftChangeRequests', { ...r, employeeAcked: true }, SA);
    return { ok: true };
}
