/**
 * Phase 4 engine (Module D) — internal module, no web methods.
 *
 * 1. Availability-deadline reminders: WhatsApp to employees who haven't met
 *    next month's quota, sent at 10:00 Israel time on configurable days
 *    before the submission deadline.
 * 2. Two-stage pre-workshop confirmation loop: stage 1 (default 72h before),
 *    stage 2 (24h before) via tokenized link to the shift-confirm page;
 *    escalation to managers when still unanswered close to the workshop.
 * 3. Token-based confirm/decline used by shiftConfirmService.web.js.
 *
 * All timings live on the AvailabilitySettings CMS row (client-editable).
 */
import wixData from 'wix-data';
import {
    SUBMISSION_STATUS,
    toDateKey,
    getPeriodForDate,
    evaluatePeriodQuota,
} from 'backend/availabilityRules.js';
import {
    ASSIGNMENT_STATUS,
    loadSettings,
    loadActiveRoles,
    loadWorkshopTypeMap,
    publishSchedulingUpdate,
    runScheduling,
} from 'backend/schedulingEngine.js';
import { getRolePermissionValue } from 'backend/staffRoles.js';
import { loadVacationsOverlappingRangeByEmployee } from 'backend/vacations.js';
import { enqueueNotification, enqueueManagerNotification, flushOutbox, PRIORITY } from 'backend/notificationOutbox.js';
import { maybeSuppressForPendingBacklog } from 'backend/pendingItemsQuery.js';
import { maybeSuppressManagerNotification } from 'backend/managerPendingQuery.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const ISRAEL_TZ = 'Asia/Jerusalem';
const PORTAL_URL = 'https://www.studiohappy.art/employee-portal';
const CONFIRM_URL = 'https://www.studiohappy.art/shift-confirm';

export const CONFIRMATION_STATE = {
    NONE: 'NONE', PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', DECLINED: 'DECLINED', ESCALATED: 'ESCALATED',
};

export const ALERT_DEFAULTS = {
    reminderDaysBeforeDeadline: [3, 1],
    confirmStage1HoursBefore: 72,
    confirmStage2HoursBefore: 24,
    escalateHoursBeforeWorkshop: 12,
    reminderSendHourIL: 10,
};

/** Phase-4 timing fields from the raw AvailabilitySettings row. */
export async function loadAlertSettings() {
    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA).catch(() => ({ items: [] }));
    const raw = result.items?.[0] || {};
    const num = (v, fb) => (Number(v) > 0 ? Number(v) : fb);
    let reminderDays = ALERT_DEFAULTS.reminderDaysBeforeDeadline;
    if (typeof raw.reminderDaysBeforeDeadline === 'string' && raw.reminderDaysBeforeDeadline.trim()) {
        try {
            const parsed = JSON.parse(raw.reminderDaysBeforeDeadline);
            if (Array.isArray(parsed)) reminderDays = parsed.map(Number).filter(n => n >= 0);
        } catch (_) { /* keep default */ }
    }
    return {
        reminderDaysBeforeDeadline: reminderDays,
        confirmStage1HoursBefore: num(raw.confirmStage1HoursBefore, ALERT_DEFAULTS.confirmStage1HoursBefore),
        confirmStage2HoursBefore: num(raw.confirmStage2HoursBefore, ALERT_DEFAULTS.confirmStage2HoursBefore),
        escalateHoursBeforeWorkshop: num(raw.escalateHoursBeforeWorkshop, ALERT_DEFAULTS.escalateHoursBeforeWorkshop),
        reminderSendHourIL: num(raw.reminderSendHourIL, ALERT_DEFAULTS.reminderSendHourIL),
    };
}

function israelHour(date = new Date()) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', hour12: false }).format(date));
}

function formatDateHe(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
    return `${dow}, ${d}.${m}.${y}`;
}

function formatTimeHe(date) {
    return new Intl.DateTimeFormat('he-IL', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

function randomToken() {
    let out = '';
    for (let i = 0; i < 40; i++) out += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)];
    return out;
}

// ---------------------------------------------------------------------------
// 1) Availability-deadline reminders
// ---------------------------------------------------------------------------

/**
 * Sends quota reminders for the upcoming 2-week submission window. The hourly
 * job calls this every run; it only fires during the configured Israel hour,
 * and the (deadline − N days) date match makes it once per reminder day —
 * with the default [5,3,1] offsets this lands on the 10th/12th/14th for the
 * mid-month (15th) deadline, and symmetric days before the month-end deadline.
 */
export async function processDeadlineReminders(now = new Date()) {
    const alerts = await loadAlertSettings();
    if (israelHour(now) !== alerts.reminderSendHourIL) return { sent: 0, skipped: 'not send hour' };

    const todayKey = toDateKey(now);
    // The window whose deadline is still ahead of today (the one employees
    // currently need to act on) — same window a still-open portal would show.
    const period = getPeriodForDate(todayKey).deadline.getTime() > now.getTime()
        ? getPeriodForDate(todayKey)
        : getPeriodForDate(`${toDateKey(new Date(now.getTime() + 16 * 86400000))}`);
    const deadlineKey = toDateKey(period.deadline);
    const daysUntilDeadline = Math.round((new Date(`${deadlineKey}T12:00:00Z`).getTime()
        - new Date(`${todayKey}T12:00:00Z`).getTime()) / 86400000);
    if (!alerts.reminderDaysBeforeDeadline.includes(daysUntilDeadline)) {
        return { sent: 0, skipped: `deadline in ${daysUntilDeadline}d — no reminder configured` };
    }

    const settings = await loadSettings();
    const roles = (await loadActiveRoles()).filter(r => getRolePermissionValue(r, 'submitAvailability'));
    const subsResult = await wixData.query('AvailabilitySubmissions')
        .ge('date', new Date(`${period.start}T00:00:00Z`))
        .le('date', new Date(`${period.end}T23:59:59Z`))
        .ne('status', SUBMISSION_STATUS.REJECTED)
        .limit(1000).find(SA).catch(() => ({ items: [] }));
    const subsByEmployee = {};
    for (const s of (subsResult.items || [])) {
        if (!subsByEmployee[s.employeeId]) subsByEmployee[s.employeeId] = [];
        subsByEmployee[s.employeeId].push({ status: s.status, dateKey: toDateKey(s.date) });
    }
    const vacationsByEmployee = await loadVacationsOverlappingRangeByEmployee(period.start, period.end);

    let sent = 0;
    for (const role of roles) {
        const quota = evaluatePeriodQuota(role, settings, period, subsByEmployee[role._id] || [], vacationsByEmployee[role._id]);
        if (quota.met || !role.phone) continue;
        await enqueueNotification({
            actionKey: 'employee_availability_deadline_reminder',
            recipientId: role._id,
            recipientPhone: role.phone,
            priority: PRIORITY.LOW,
            entityKey: `deadline-reminder:${period.start}:${daysUntilDeadline}:${role._id}`,
            vars: {
                displayName: role.displayName || '',
                daysUntilDeadline,
                periodStart: period.start,
                periodEnd: period.end,
                quotaSubmitted: quota.submitted,
                quotaRequired: quota.required,
                portalLink: PORTAL_URL,
            },
        }).catch(err => console.error('[shiftConfirmations] reminder failed:', err?.message || err));
        sent++;
    }
    await flushOutbox({ force: true }).catch(err => console.error('[shiftConfirmations] flushOutbox failed:', err?.message || err));
    console.log(`[shiftConfirmations] processDeadlineReminders: window=${period.start}..${period.end} sent=${sent}`);
    return { sent, window: { start: period.start, end: period.end }, daysUntilDeadline };
}

// ---------------------------------------------------------------------------
// 2) Pre-workshop confirmation loop
// ---------------------------------------------------------------------------

/** Earliest paid-order start per dateKey/workshopTypeId within a range. */
async function loadWorkshopStarts(fromKey, toKey) {
    const start = new Date(`${fromKey}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(`${toKey}T23:59:59Z`);
    end.setUTCDate(end.getUTCDate() + 1);

    const [{ serviceIdToTypeId }, ordersResult] = await Promise.all([
        loadWorkshopTypeMap(),
        wixData.query('WorkshopOrders')
            .eq('status', 'paid')
            .ge('workshopStart', start).le('workshopStart', end)
            .limit(1000).find(SA).catch(() => ({ items: [] })),
    ]);

    const starts = {}; // `${dateKey}|${typeId}` -> earliest Date
    for (const o of (ordersResult.items || [])) {
        if (o.cancelledAt) continue;
        const typeId = serviceIdToTypeId[o.serviceId];
        const dateKey = toDateKey(o.workshopStart);
        if (!typeId || !dateKey) continue;
        const key = `${dateKey}|${typeId}`;
        const ws = new Date(o.workshopStart);
        if (!starts[key] || ws < starts[key]) starts[key] = ws;
    }
    return starts;
}

async function sendConfirmationMessage(role, assignment, workshopStart, stage) {
    const dateKey = assignment.dateKey || toDateKey(assignment.date);
    const link = `${CONFIRM_URL}?token=${assignment.confirmToken}`;
    const prefix = stage === 2 ? '⏰ תזכורת אחרונה — ' : '';
    const timeSuffix = workshopStart ? ` בשעה ${formatTimeHe(workshopStart)}` : '';
    if (!role?.phone) {
        console.warn(`[shiftConfirmations] role ${role?._id} has no phone — confirmation not sent`);
        return false;
    }
    // Stage 2 (24h before) stays urgent and always individual regardless of backlog.
    const suppressed = stage === 1 && await maybeSuppressForPendingBacklog(role);
    if (!suppressed) {
        await enqueueNotification({
            actionKey: 'employee_preworkshop_confirm',
            recipientId: role._id,
            recipientPhone: role.phone,
            priority: stage === 2 ? PRIORITY.URGENT : PRIORITY.NORMAL,
            entityKey: `confirm:${assignment._id}:stage${stage}`,
            vars: {
                prefix,
                displayName: role?.displayName || '',
                workshopName: assignment.workshopName || 'סדנה',
                date: formatDateHe(dateKey),
                timeSuffix,
                confirmLink: link,
            },
        }).catch(err => console.error('[shiftConfirmations] confirmation send failed:', err?.message || err));
    }
    return true;
}

/**
 * Advances the confirmation loop for upcoming APPROVED assignments:
 * NONE→stage1, stage1→stage2, stage2→manager escalation.
 */
export async function processConfirmations(now = new Date()) {
    const alerts = await loadAlertSettings();
    const fromKey = toDateKey(now);
    const horizonDays = Math.ceil(alerts.confirmStage1HoursBefore / 24) + 1;
    const toKey = toDateKey(new Date(now.getTime() + horizonDays * 86400000));

    const result = await wixData.query('ShiftAssignments')
        .eq('status', ASSIGNMENT_STATUS.APPROVED)
        .ge('date', new Date(`${fromKey}T00:00:00Z`))
        .le('date', new Date(`${toKey}T23:59:59Z`))
        .limit(1000).find(SA).catch(() => ({ items: [] }));
    const assignments = result.items || [];
    if (!assignments.length) return { stage1: 0, stage2: 0, escalated: 0 };

    const [starts, roles] = await Promise.all([loadWorkshopStarts(fromKey, toKey), loadActiveRoles()]);
    const rolesById = {};
    for (const r of roles) rolesById[r._id] = r;

    const report = { stage1: 0, stage2: 0, escalated: 0 };

    for (const a of assignments) {
        const dateKey = a.dateKey || toDateKey(a.date);
        const workshopStart = starts[`${dateKey}|${a.workshopTypeId}`]
            || new Date(`${dateKey}T10:00:00+03:00`); // fallback: assume morning workshop
        const hoursUntil = (workshopStart.getTime() - now.getTime()) / 3600000;
        if (hoursUntil <= 0) continue;

        const state = a.confirmationState || CONFIRMATION_STATE.NONE;
        const stage = Number(a.confirmStage) || 0;
        const role = rolesById[a.employeeId];

        if (state === CONFIRMATION_STATE.NONE && hoursUntil <= alerts.confirmStage1HoursBefore) {
            const token = a.confirmToken || randomToken();
            const patch = {
                ...a,
                confirmToken: token,
                confirmationState: CONFIRMATION_STATE.PENDING,
                confirmStage: 1,
                confirmSentAt: now,
            };
            await sendConfirmationMessage(role, patch, workshopStart, 1);
            await wixData.update('ShiftAssignments', patch, SA);
            report.stage1++;
        } else if (state === CONFIRMATION_STATE.PENDING && stage === 1 && hoursUntil <= alerts.confirmStage2HoursBefore) {
            const patch = { ...a, confirmStage: 2, confirmSentAt: now };
            await sendConfirmationMessage(role, patch, workshopStart, 2);
            await wixData.update('ShiftAssignments', patch, SA);
            report.stage2++;
        } else if (state === CONFIRMATION_STATE.PENDING && stage >= 2 && hoursUntil <= alerts.escalateHoursBeforeWorkshop) {
            await wixData.update('ShiftAssignments', { ...a, confirmationState: CONFIRMATION_STATE.ESCALATED }, SA);
            await enqueueManagerNotification('manager_confirmation_escalation', {
                displayName: role?.displayName || 'עובד/ת',
                workshopName: a.workshopName || '',
                date: formatDateHe(dateKey),
                time: formatTimeHe(workshopStart),
            }, {
                priority: PRIORITY.URGENT, entityKey: `escalation:${a._id}`, rolesById,
                shouldSuppress: maybeSuppressManagerNotification,
            });
            report.escalated++;
        }
    }

    if (report.stage1 || report.stage2 || report.escalated) {
        await publishSchedulingUpdate('confirmations', report);
        await flushOutbox({ force: true }).catch(err => console.error('[shiftConfirmations] flushOutbox failed:', err?.message || err));
        console.log('[shiftConfirmations] processConfirmations:', JSON.stringify(report));
    }
    return report;
}

// ---------------------------------------------------------------------------
// 3) Token-based confirm / decline (used by shiftConfirmService.web.js)
// ---------------------------------------------------------------------------

async function findByToken(token) {
    if (!token || !/^[a-z0-9]{20,64}$/.test(String(token))) return null;
    const result = await wixData.query('ShiftAssignments')
        .eq('confirmToken', token)
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    return result.items?.[0] || null;
}

/** Employee-safe shift details for the confirmation page. */
export async function getShiftDetailsByToken(token) {
    const a = await findByToken(token);
    if (!a || a.status === ASSIGNMENT_STATUS.CANCELLED) return null;

    const roles = await loadActiveRoles();
    const role = roles.find(r => r._id === a.employeeId) || null;
    const dateKey = a.dateKey || toDateKey(a.date);
    const starts = await loadWorkshopStarts(dateKey, dateKey);
    const workshopStart = starts[`${dateKey}|${a.workshopTypeId}`] || null;

    return {
        employeeName: role?.displayName || 'עובד/ת',
        workshopName: a.workshopName || 'סדנה',
        date: dateKey,
        startTime: workshopStart ? workshopStart.toISOString() : null,
        confirmationState: a.confirmationState || CONFIRMATION_STATE.NONE,
        notes: a.confirmNotes || '',
    };
}

/**
 * Applies a confirm/decline decision to an already-loaded assignment row.
 * Decline cancels the assignment, frees the submission, reruns the engine
 * for that day and (optionally) alerts managers.
 */
async function applyConfirmationResponse(a, accept, notes, { notifyManagers = true } = {}) {
    if (!a || a.status === ASSIGNMENT_STATUS.CANCELLED) {
        throw new Error('NOT_FOUND: הקישור אינו תקף או שהמשמרת בוטלה.');
    }
    if (a.confirmationState === CONFIRMATION_STATE.CONFIRMED || a.confirmationState === CONFIRMATION_STATE.DECLINED) {
        return { ok: true, alreadyAnswered: true, state: a.confirmationState };
    }

    const cleanNotes = typeof notes === 'string' ? notes.slice(0, 500) : '';
    const dateKey = a.dateKey || toDateKey(a.date);
    const roles = await loadActiveRoles();
    const rolesById = {};
    for (const r of roles) rolesById[r._id] = r;
    const employeeName = rolesById[a.employeeId]?.displayName || 'עובד/ת';

    if (accept) {
        await wixData.update('ShiftAssignments', {
            ...a,
            confirmationState: CONFIRMATION_STATE.CONFIRMED,
            confirmNotes: cleanNotes,
        }, SA);
        await publishSchedulingUpdate('shift-confirmed', { dateKey });
        console.log(`[shiftConfirmations] confirmed: ${a._id} (${employeeName})`);
        return { ok: true, state: CONFIRMATION_STATE.CONFIRMED };
    }

    // Decline: cancel assignment + free the submission, then refill the day.
    await wixData.update('ShiftAssignments', {
        ...a,
        status: ASSIGNMENT_STATUS.CANCELLED,
        confirmationState: CONFIRMATION_STATE.DECLINED,
        confirmNotes: cleanNotes,
    }, SA);
    if (a.submissionId) {
        const sub = await wixData.get('AvailabilitySubmissions', a.submissionId, SA).catch(() => null);
        if (sub && sub.status === SUBMISSION_STATUS.SCHEDULED) {
            await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SUBMITTED }, SA);
        }
    }
    if (notifyManagers) {
        await enqueueManagerNotification('manager_employee_declined_confirmation', {
            employeeName,
            workshopName: a.workshopName || '',
            date: formatDateHe(dateKey),
            notesLine: cleanNotes ? `\nהערה: ${cleanNotes}` : '',
        }, { priority: PRIORITY.URGENT, entityKey: `decline:${a._id}`, rolesById });
        await flushOutbox({ force: true }).catch(err => console.error('[shiftConfirmations] flushOutbox failed:', err?.message || err));
    }
    await runScheduling(dateKey, dateKey);
    console.log(`[shiftConfirmations] declined: ${a._id} (${employeeName})`);
    return { ok: true, state: CONFIRMATION_STATE.DECLINED };
}

/** Employee's own response, resolved from their per-shift confirmation token. */
export async function respondByToken(token, accept, notes) {
    const a = await findByToken(token);
    return applyConfirmationResponse(a, accept, notes);
}

/**
 * Manager resolves an ESCALATED confirmation directly (from the manager
 * pending-items page) — same effect as the employee's own response, minus
 * the "employee declined" manager alert (the manager is the one acting).
 */
export async function resolveEscalationByManager(assignmentId, accept, notes) {
    const a = await wixData.get('ShiftAssignments', assignmentId, SA).catch(() => null);
    return applyConfirmationResponse(a, accept, notes, { notifyManagers: false });
}
