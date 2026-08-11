/**
 * Read-only queries for open manager-facing action items — pending shift-swap
 * approvals, shift change/deletion requests, and unconfirmed-attendance
 * escalations — plus the manager pending-items link/token lifecycle and
 * backlog-based alert suppression.
 *
 * Dependency-free of shiftSwaps.js / shiftChangeRequests.js / schedulingEngine.js
 * (which *apply* decisions and are consumed by managerPending.js) — this
 * module is imported *by* those files to trigger suppression, so it must not
 * import them back (would create an import cycle).
 *
 * These items are global (any manager can act on any of them), so the
 * backlog count is system-wide; the token/dedup cooldown is still per-manager.
 *
 * Manual CMS setup: add `managerPendingToken` (Text) and
 * `managerPendingTokenExpiresAt` (Date/Time) fields to Dashboard_Roles.
 */
import wixData from 'wix-data';
import { shouldSendPendingLinkAlert, recordPendingLinkAlertSent, enqueueNotification, PRIORITY } from 'backend/notificationOutbox.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const TOKEN_TTL_MS = 7 * 24 * 3600000;
const MANAGER_PENDING_URL = 'https://www.studiohappy.art/manager-pending';
export const MANAGER_ALERT_ACTION_KEY = 'manager_pending_items_alert';
export const SUPPRESS_INDIVIDUAL_AFTER = 2;

function randomToken() {
    let out = '';
    for (let i = 0; i < 40; i++) out += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)];
    return out;
}

function formatDateHe(dateKey) {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
    return `${dow}, ${d}.${m}.${y}`;
}

export async function getOrCreateManagerPendingLink(role) {
    const now = Date.now();
    const expiresAt = role.managerPendingTokenExpiresAt ? new Date(role.managerPendingTokenExpiresAt).getTime() : 0;
    if (role.managerPendingToken && expiresAt - now > 24 * 3600000) {
        return `${MANAGER_PENDING_URL}?token=${role.managerPendingToken}`;
    }
    const token = randomToken();
    await wixData.update('Dashboard_Roles', {
        ...role, managerPendingToken: token, managerPendingTokenExpiresAt: new Date(now + TOKEN_TTL_MS),
    }, SA);
    return `${MANAGER_PENDING_URL}?token=${token}`;
}

export async function findManagerByPendingToken(token) {
    if (!token) return null;
    const result = await wixData.query('Dashboard_Roles')
        .eq('managerPendingToken', token)
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    const role = result.items?.[0];
    if (!role) return null;
    if (role.managerPendingTokenExpiresAt && new Date(role.managerPendingTokenExpiresAt).getTime() < Date.now()) return null;
    return role;
}

async function loadPendingSwapApprovals() {
    const result = await wixData.query('ShiftSwapRequests')
        .eq('status', 'PENDING_MANAGER')
        .limit(50).find(SAC).catch(() => ({ items: [] }));
    return (result.items || []).map(s => ({
        itemType: 'swap-approval',
        itemId: s._id,
        title: 'בקשת החלפת משמרת — לאישור',
        subtitle: `${s.requesterName || 'עובד/ת'} ↔ ${s.targetEmployeeName || 'עובד/ת'} — ${formatDateHe(s.dateKey)} · ${s.startTime}–${s.endTime} (${s.workshopName || 'סדנה'})`,
    }));
}

async function loadPendingChangeRequests() {
    const result = await wixData.query('ShiftChangeRequests')
        .eq('status', 'PENDING')
        .limit(50).find(SAC).catch(() => ({ items: [] }));
    return (result.items || []).map(r => ({
        itemType: 'change-request',
        itemId: r._id,
        title: r.type === 'DELETE' ? 'בקשת מחיקת משמרת' : 'בקשת שינוי משמרת',
        subtitle: `${r.employeeName || 'עובד/ת'} — ${formatDateHe(r.originalDate)}${r.notes ? ` · ${r.notes}` : ''}`,
    }));
}

async function loadEscalatedConfirmations() {
    const result = await wixData.query('ShiftAssignments')
        .eq('status', 'APPROVED')
        .eq('confirmationState', 'ESCALATED')
        .limit(50).find(SAC).catch(() => ({ items: [] }));
    return (result.items || []).map(a => ({
        itemType: 'escalation',
        itemId: a._id,
        title: 'אין אישור הגעה למשמרת',
        subtitle: `${formatDateHe(a.dateKey)} — ${a.workshopName || 'סדנה'}`,
    }));
}

/** All currently-open manager items — system-wide, used by the token page and the suppression check. */
export async function loadManagerPendingItems() {
    const [swaps, changes, escalations] = await Promise.all([
        loadPendingSwapApprovals(),
        loadPendingChangeRequests(),
        loadEscalatedConfirmations(),
    ]);
    return [...swaps, ...changes, ...escalations];
}

export async function countManagerPendingItems() {
    return (await loadManagerPendingItems()).length;
}

/**
 * Called after a new manager-facing item is created. If the global backlog
 * already has SUPPRESS_INDIVIDUAL_AFTER+ open items, this (re)sends one
 * consolidated alert to `role` instead — deduped per manager — and returns
 * true so the caller can skip its own dedicated WhatsApp for the new item.
 */
export async function maybeSuppressManagerNotification(role) {
    if (!role?.phone) return false;
    const count = await countManagerPendingItems();
    if (count < SUPPRESS_INDIVIDUAL_AFTER) return false;

    if (await shouldSendPendingLinkAlert(role._id, MANAGER_ALERT_ACTION_KEY)) {
        const link = await getOrCreateManagerPendingLink(role);
        await enqueueNotification({
            actionKey: MANAGER_ALERT_ACTION_KEY,
            recipientId: role._id,
            recipientPhone: role.phone,
            priority: PRIORITY.URGENT,
            vars: { count, pendingLink: link },
        });
        await recordPendingLinkAlertSent(role._id, MANAGER_ALERT_ACTION_KEY);
    }
    return true;
}
