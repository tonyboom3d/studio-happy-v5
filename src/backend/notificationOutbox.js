/**
 * Notification outbox (throttling layer) — sits between every trigger that
 * wants to message an employee/manager and the actual WhatsApp send
 * (employeeTemplates.js → whatsappService.jsw). Solves mass-notification
 * floods (bulk assignments, manager requirements, arrival reminders) via:
 *   1. Dedup — same action+entity+recipient within 24h is not re-queued.
 *   2. Rate limiting — caps non-urgent messages per recipient per hour/day.
 *   3. Aggregation (digest) — multiple "digestable" rows for the same
 *      recipient collapse into one message; an assign+cancel pair for the
 *      same slot within the window nets out to a single "updated" line.
 *   4. Priority — URGENT sends immediately (still deduped); NORMAL/LOW wait
 *      for the aggregation window and are pushed past quiet hours (22:00–08:00 IL).
 *
 * Manual CMS setup required — collection `NotificationOutbox`, fields:
 *   recipientId (Text), recipientPhone (Text), audience (Text: EMPLOYEE|MANAGERS),
 *   actionKey (Text), entityKey (Text, optional), groupKey (Text, optional),
 *   dedupKey (Text), vars (Text — JSON), digestLine (Text, optional),
 *   digestKind (Text, optional: assigned|cancelled), priority (Text),
 *   status (Text: PENDING|SENT|MERGED|SKIPPED), scheduledFor (Date/Time),
 *   sentAt (Date/Time, optional).
 * Recommended indexes: status+scheduledFor, recipientId+status, dedupKey.
 */
import wixData from 'wix-data';
import { getRolePermissionValue } from 'backend/staffRoles.js';
import { sendEmployeeTemplateMessage } from 'backend/employeeTemplates.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const ISRAEL_TZ = 'Asia/Jerusalem';

export const PRIORITY = { URGENT: 'URGENT', NORMAL: 'NORMAL', LOW: 'LOW' };
export const OUTBOX_STATUS = { PENDING: 'PENDING', SENT: 'SENT', MERGED: 'MERGED', SKIPPED: 'SKIPPED' };
export const AUDIENCE = { EMPLOYEE: 'EMPLOYEE', MANAGERS: 'MANAGERS' };

const AGGREGATION_WINDOW_MS = 15 * 60 * 1000;
const QUIET_HOUR_START = 22; // 22:00 IL
const QUIET_HOUR_END = 8;    // 08:00 IL
const DEDUP_WINDOW_MS = 24 * 3600 * 1000;
const ALERT_DEDUP_WINDOW_MS = 2 * 3600 * 1000; // "you have pending items" cooldown
const RATE_LIMIT_PER_HOUR = 3;
const RATE_LIMIT_PER_DAY = 8;

const DIGEST_ACTION_KEY = 'employee_shifts_digest';
const MANAGER_DIGEST_ACTION_KEY = 'manager_notifications_digest';

function israelHour(date = new Date()) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', hour12: false }).format(date));
}

function isQuietHour(date) {
    const h = israelHour(date);
    return h >= QUIET_HOUR_START || h < QUIET_HOUR_END;
}

/** Nudges `date` forward hour-by-hour until it lands outside quiet hours (bounded, DST-safe). */
function pushPastQuietHours(date) {
    let d = new Date(date);
    let guard = 0;
    while (isQuietHour(d) && guard < 48) {
        d = new Date(d.getTime() + 3600000);
        guard++;
    }
    return d;
}

function computeScheduledFor(priority, now = new Date()) {
    if (priority === PRIORITY.URGENT) return now;
    const withDelay = new Date(now.getTime() + AGGREGATION_WINDOW_MS);
    return pushPastQuietHours(withDelay);
}

function buildDedupKey(actionKey, entityKey, recipientId) {
    return `${actionKey}|${entityKey || ''}|${recipientId || ''}`;
}

async function isDuplicate(dedupKey, windowMs) {
    if (!dedupKey) return false;
    const since = new Date(Date.now() - windowMs);
    const result = await wixData.query('NotificationOutbox')
        .eq('dedupKey', dedupKey)
        .ge('_createdDate', since)
        .hasSome('status', [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.SENT])
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    return (result.items?.length || 0) > 0;
}

/**
 * Queues (or immediately sends, if urgent) one notification for one
 * recipient. Returns { queued, reason? }.
 *
 * @param {object} opts
 * @param {string} opts.actionKey - matches EMPLOYEE_ACTION_KEYS in employeeTemplates.js.
 * @param {string} opts.recipientId - Dashboard_Roles _id (employee or manager).
 * @param {string} opts.recipientPhone
 * @param {object} [opts.vars]
 * @param {string} [opts.priority] - PRIORITY.URGENT|NORMAL|LOW (default NORMAL).
 * @param {string|null} [opts.entityKey] - stable id for the thing this message is about
 *   (e.g. `shift:${dateKey}:${employeeId}`); enables dedup + net-change collapsing.
 * @param {object|null} [opts.digest] - { line: string, kind: 'assigned'|'cancelled' } —
 *   when present, this row is eligible to be merged with other digest rows for
 *   the same recipient into one summary message.
 * @param {string} [opts.audience] - AUDIENCE.EMPLOYEE|MANAGERS (default EMPLOYEE).
 */
export async function enqueueNotification(opts) {
    const {
        actionKey, recipientId, recipientPhone, vars = {},
        priority = PRIORITY.NORMAL, entityKey = undefined, digest = undefined,
        audience = AUDIENCE.EMPLOYEE,
    } = opts || {};

    if (!recipientPhone) {
        console.warn(`[notificationOutbox] no phone for actionKey=${actionKey} recipient=${recipientId} — skipping`);
        return { queued: false, reason: 'no-phone' };
    }
    if (!actionKey) {
        console.warn('[notificationOutbox] missing actionKey — skipping');
        return { queued: false, reason: 'no-action-key' };
    }

    const dedupKey = buildDedupKey(actionKey, entityKey, recipientId);
    if (entityKey && await isDuplicate(dedupKey, DEDUP_WINDOW_MS)) {
        return { queued: false, reason: 'duplicate' };
    }

    const now = new Date();
    const row = {
        recipientId: recipientId || null,
        recipientPhone,
        audience,
        actionKey,
        entityKey,
        groupKey: entityKey || null,
        dedupKey,
        vars: JSON.stringify(vars || {}),
        digestLine: digest?.line || null,
        digestKind: digest?.kind || null,
        priority,
        status: OUTBOX_STATUS.PENDING,
        scheduledFor: computeScheduledFor(priority, now),
        sentAt: null,
    };
    await wixData.insert('NotificationOutbox', row, SA);

    if (priority === PRIORITY.URGENT) {
        await flushRecipient(recipientId, recipientPhone, audience, now);
    }
    return { queued: true };
}

/**
 * Resolves managers (manageScheduling + phone) and enqueues one row per
 * manager. `shouldSuppress`, if given, is awaited per-manager before
 * enqueueing — used by callers to redirect to a consolidated pending-items
 * alert once a manager already has a backlog (see managerPendingQuery.js).
 *
 * @param {string} actionKey
 * @param {object} [vars]
 * @param {object} [opts]
 * @param {string} [opts.priority]
 * @param {string|null} [opts.entityKey]
 * @param {object|null} [opts.rolesById]
 * @param {((role: object) => Promise<boolean>)|null} [opts.shouldSuppress]
 */
export async function enqueueManagerNotification(actionKey, vars = {}, { priority = PRIORITY.NORMAL, entityKey = undefined, rolesById = undefined, shouldSuppress = undefined } = {}) {
    const roles = rolesById
        ? Object.values(rolesById)
        : (await wixData.query('Dashboard_Roles').ne('active', false).limit(1000).find(SA).catch(() => ({ items: [] }))).items || [];
    const managers = roles.filter(r => getRolePermissionValue(r, 'manageScheduling') && r.phone);

    let queued = 0;
    for (const m of managers) {
        if (shouldSuppress && await shouldSuppress(m)) continue;
        const result = await enqueueNotification({
            actionKey, recipientId: m._id, recipientPhone: m.phone, vars, priority, entityKey,
            audience: AUDIENCE.MANAGERS,
        });
        if (result.queued) queued++;
    }
    return queued;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function countRecentSent(recipientId, audience, sinceMs) {
    if (!recipientId) return 0;
    const since = new Date(Date.now() - sinceMs);
    const result = await wixData.query('NotificationOutbox')
        .eq('recipientId', recipientId)
        .eq('audience', audience)
        .eq('status', OUTBOX_STATUS.SENT)
        .ne('priority', PRIORITY.URGENT)
        .ge('sentAt', since)
        .limit(200).find(SAC).catch(() => ({ items: [] }));
    return result.items?.length || 0;
}

async function isRateLimited(recipientId, audience) {
    if (!recipientId) return false;
    const [hourly, daily] = await Promise.all([
        countRecentSent(recipientId, audience, 3600000),
        countRecentSent(recipientId, audience, 24 * 3600000),
    ]);
    return hourly >= RATE_LIMIT_PER_HOUR || daily >= RATE_LIMIT_PER_DAY;
}

/** Pushes a batch of still-pending rows forward by 1h (rate limit) without touching sent/merged ones. */
async function deferRows(rows, byMs = 3600000) {
    for (const r of rows) {
        if (r.status !== OUTBOX_STATUS.PENDING) continue;
        await wixData.update('NotificationOutbox', {
            ...r, scheduledFor: new Date(Date.now() + byMs),
        }, SA).catch(() => null);
    }
}

// ---------------------------------------------------------------------------
// Digest rendering
// ---------------------------------------------------------------------------

/** Net-change collapsing: rows sharing a groupKey with both an "assigned" and "cancelled" digest kind become one "updated" line. */
function collapseDigestRows(rows) {
    const byGroup = new Map();
    const ungrouped = [];
    for (const r of rows) {
        if (!r.groupKey) { ungrouped.push(r); continue; }
        if (!byGroup.has(r.groupKey)) byGroup.set(r.groupKey, []);
        byGroup.get(r.groupKey).push(r);
    }

    const assignedLines = [];
    const cancelledLines = [];
    const updatedLines = [];
    const consumedIds = [];

    for (const [, groupRows] of byGroup) {
        const assigned = groupRows.filter(r => r.digestKind === 'assigned');
        const cancelled = groupRows.filter(r => r.digestKind === 'cancelled');
        consumedIds.push(...groupRows.map(r => r._id));
        if (assigned.length && cancelled.length) {
            updatedLines.push(`עודכן: ${assigned[assigned.length - 1].digestLine}`);
        } else if (assigned.length) {
            assignedLines.push(assigned[assigned.length - 1].digestLine);
        } else if (cancelled.length) {
            cancelledLines.push(cancelled[cancelled.length - 1].digestLine);
        }
    }
    for (const r of ungrouped) {
        consumedIds.push(r._id);
        if (r.digestKind === 'cancelled') cancelledLines.push(r.digestLine);
        else updatedLines.push(r.digestLine); // no groupKey → can't net, list as-is under "updated"
    }

    const parts = [];
    if (assignedLines.length) parts.push(`שובצת ל-${assignedLines.length} משמרות:\n${assignedLines.map(l => `• ${l}`).join('\n')}`);
    if (cancelledLines.length) parts.push(`בוטלו ${cancelledLines.length} משמרות:\n${cancelledLines.map(l => `• ${l}`).join('\n')}`);
    if (updatedLines.length) parts.push(updatedLines.map(l => `• ${l}`).join('\n'));

    return { text: parts.join('\n\n'), count: assignedLines.length + cancelledLines.length + updatedLines.length, consumedIds };
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

async function markRows(ids, status, sentAt = null) {
    for (const id of ids) {
        const row = await wixData.get('NotificationOutbox', id, SA).catch(() => null);
        if (!row) continue;
        await wixData.update('NotificationOutbox', { ...row, status, sentAt }, SA).catch(() => null);
    }
}

async function sendRow(row) {
    const vars = JSON.parse(row.vars || '{}');
    // Manager rows are already resolved to one specific manager by enqueueManagerNotification,
    // so we send directly rather than re-resolving the whole manager list.
    await sendEmployeeTemplateMessage(row.actionKey, row.recipientPhone, vars).catch(err =>
        console.error(`[notificationOutbox] send failed (${row.audience}):`, err?.message || err));
}

async function flushGroup(rows, now) {
    if (!rows.length) return { sent: 0, merged: 0, skipped: 0 };
    const { recipientId, recipientPhone, audience } = rows[0];

    const hasUrgent = rows.some(r => r.priority === PRIORITY.URGENT);

    if (!hasUrgent && isQuietHour(now)) {
        await deferRows(rows, 30 * 60000);
        return { sent: 0, merged: 0, skipped: rows.length };
    }

    if (!hasUrgent && await isRateLimited(recipientId, audience)) {
        await deferRows(rows);
        return { sent: 0, merged: 0, skipped: rows.length };
    }

    const digestRows = rows.filter(r => r.digestLine);
    const singleRows = rows.filter(r => !r.digestLine);

    let sent = 0, merged = 0;

    for (const r of singleRows) {
        await sendRow(r);
        await markRows([r._id], OUTBOX_STATUS.SENT, now);
        sent++;
    }

    if (digestRows.length === 1) {
        await sendRow(digestRows[0]);
        await markRows([digestRows[0]._id], OUTBOX_STATUS.SENT, now);
        sent++;
    } else if (digestRows.length > 1) {
        const { text, count, consumedIds } = collapseDigestRows(digestRows);
        if (count > 0 && text) {
            const actionKey = audience === AUDIENCE.MANAGERS ? MANAGER_DIGEST_ACTION_KEY : DIGEST_ACTION_KEY;
            const sample = digestRows[0];
            const vars = JSON.parse(sample.vars || '{}');
            const rendered = audience === AUDIENCE.MANAGERS
                ? { count, itemList: text }
                : { displayName: vars.displayName || '', count, shiftList: text, portalLink: vars.portalLink || '' };
            if (audience === AUDIENCE.MANAGERS) {
                await sendEmployeeTemplateMessage(actionKey, recipientPhone, rendered).catch(err =>
                    console.error('[notificationOutbox] manager digest send failed:', err?.message || err));
            } else {
                await sendEmployeeTemplateMessage(actionKey, recipientPhone, rendered).catch(err =>
                    console.error('[notificationOutbox] digest send failed:', err?.message || err));
            }
            sent++;
        }
        await markRows(consumedIds, OUTBOX_STATUS.MERGED, now);
        merged += consumedIds.length;
    }

    return { sent, merged, skipped: 0 };
}

/** Flushes only the given recipient's currently-due rows — used for immediate URGENT sends. */
async function flushRecipient(recipientId, recipientPhone, audience, now = new Date()) {
    if (!recipientId) return;
    const due = await wixData.query('NotificationOutbox')
        .eq('recipientId', recipientId)
        .eq('audience', audience)
        .eq('status', OUTBOX_STATUS.PENDING)
        .le('scheduledFor', now)
        .limit(100).find(SAC).catch(() => ({ items: [] }));
    if (!due.items?.length) return;
    await flushGroup(due.items, now);
}

/**
 * Processes pending rows across every recipient — called from the hourly job
 * (safety net, default: only rows whose scheduledFor is due) and inline at
 * the end of batch scheduling runs with `force: true` (immediate aggregation
 * — sends everything just enqueued by that batch regardless of the
 * 15-minute window, since the whole batch already completed synchronously).
 */
export async function flushOutbox({ now = new Date(), force = false } = {}) {
    let query = wixData.query('NotificationOutbox').eq('status', OUTBOX_STATUS.PENDING);
    if (!force) query = query.le('scheduledFor', now);
    const due = await query.limit(500).find(SAC).catch(() => ({ items: [] }));
    const rows = due.items || [];
    if (!rows.length) return { sent: 0, merged: 0, skipped: 0 };

    const groups = new Map();
    for (const r of rows) {
        const key = `${r.audience}|${r.recipientId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }

    let sent = 0, merged = 0, skipped = 0;
    for (const groupRows of groups.values()) {
        const result = await flushGroup(groupRows, now);
        sent += result.sent; merged += result.merged; skipped += result.skipped;
    }
    if (sent || merged) console.log(`[notificationOutbox] flushOutbox: sent=${sent} merged=${merged} skipped=${skipped}`);
    return { sent, merged, skipped };
}

/**
 * Suppresses a repeat "you have pending items" alert to the same recipient
 * within ALERT_DEDUP_WINDOW_MS — used by pendingActions.js / managerPending.js
 * before sending a fresh pending-link message when items were added to an
 * already-outstanding, unhandled batch.
 */
export async function shouldSendPendingLinkAlert(recipientId, alertKey) {
    if (!recipientId) return true;
    return !(await isDuplicate(buildDedupKey(alertKey, 'pending-link', recipientId), ALERT_DEDUP_WINDOW_MS));
}

export async function recordPendingLinkAlertSent(recipientId, alertKey) {
    if (!recipientId) return;
    await wixData.insert('NotificationOutbox', {
        recipientId,
        recipientPhone: '',
        audience: AUDIENCE.EMPLOYEE,
        actionKey: alertKey,
        entityKey: 'pending-link',
        groupKey: null,
        dedupKey: buildDedupKey(alertKey, 'pending-link', recipientId),
        vars: '{}',
        digestLine: null,
        digestKind: null,
        priority: PRIORITY.NORMAL,
        status: OUTBOX_STATUS.SENT,
        scheduledFor: new Date(),
        sentAt: new Date(),
    }, SA).catch(() => null);
}
