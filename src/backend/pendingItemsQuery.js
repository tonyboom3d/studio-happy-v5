/**
 * Read-only queries for an employee's open ("pending") action items —
 * pre-workshop attendance confirmations, standby/short-notice shift offers,
 * incoming shift-swap requests — plus the pending-items link/token lifecycle
 * and backlog-based alert suppression.
 *
 * Deliberately dependency-free of schedulingEngine.js / shiftConfirmations.js /
 * shiftSwaps.js (which each *apply* decisions and are consumed by
 * pendingActions.js) — this module is imported *by* those files to trigger
 * suppression, so it must not import them back (would create an import cycle).
 *
 * Manual CMS setup: add `pendingToken` (Text) and `pendingTokenExpiresAt`
 * (Date/Time) fields to Dashboard_Roles.
 */
import wixData from 'wix-data';
import { toDateKey } from 'backend/availabilityRules.js';
import { shouldSendPendingLinkAlert, recordPendingLinkAlertSent, enqueueNotification, PRIORITY } from 'backend/notificationOutbox.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const PENDING_TOKEN_TTL_MS = 7 * 24 * 3600000;
const PENDING_URL = 'https://www.studiohappy.art/pending-actions';
export const ALERT_ACTION_KEY = 'employee_pending_items_alert';
// If an employee already has this many unresolved items, a new event skips
// its own dedicated WhatsApp and just triggers/refreshes the batch alert.
export const SUPPRESS_INDIVIDUAL_AFTER = 2;

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

/** Issues (or reuses, if still valid for >1 day) the employee's pending-items link. */
export async function getOrCreatePendingLink(role) {
    const now = Date.now();
    const expiresAt = role.pendingTokenExpiresAt ? new Date(role.pendingTokenExpiresAt).getTime() : 0;
    if (role.pendingToken && expiresAt - now > 24 * 3600000) {
        return `${PENDING_URL}?token=${role.pendingToken}`;
    }
    const token = randomToken();
    await wixData.update('Dashboard_Roles', {
        ...role, pendingToken: token, pendingTokenExpiresAt: new Date(now + PENDING_TOKEN_TTL_MS),
    }, SA);
    return `${PENDING_URL}?token=${token}`;
}

export async function findRoleByPendingToken(token) {
    if (!token) return null;
    const result = await wixData.query('Dashboard_Roles')
        .eq('pendingToken', token)
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    const role = result.items?.[0];
    if (!role) return null;
    if (role.pendingTokenExpiresAt && new Date(role.pendingTokenExpiresAt).getTime() < Date.now()) return null;
    return role;
}

async function loadPendingConfirmations(roleId) {
    const result = await wixData.query('ShiftAssignments')
        .eq('employeeId', roleId)
        .eq('status', 'APPROVED')
        .eq('confirmationState', 'PENDING')
        .ge('date', new Date())
        .limit(50).find(SAC).catch(() => ({ items: [] }));
    return (result.items || []).map(a => ({
        itemType: 'confirmation',
        itemId: a._id,
        title: 'אישור הגעה למשמרת',
        subtitle: `${formatDateHe(a.dateKey || toDateKey(a.date))} — ${a.workshopName || 'סדנה'}`,
        stage: a.confirmStage || 1,
    }));
}

async function loadPendingOffers(roleId) {
    const result = await wixData.query('ShiftOffers')
        .eq('employeeId', roleId)
        .eq('kind', 'WAITLIST_OFFER')
        .eq('status', 'PENDING')
        .limit(50).find(SAC).catch(() => ({ items: [] }));
    return (result.items || []).map(o => ({
        itemType: 'offer',
        itemId: o._id,
        title: 'הצעת שיבוץ למשמרת',
        subtitle: `${formatDateHe(o.dateKey || toDateKey(o.date))} — ${o.workshopName || 'סדנה'}`,
        expiresAt: o.expiresAt ? new Date(o.expiresAt).toISOString() : null,
    }));
}

async function loadPendingSwaps(roleId) {
    const result = await wixData.query('ShiftSwapRequests')
        .eq('targetEmployeeId', roleId)
        .eq('status', 'PENDING_EMPLOYEE')
        .limit(50).find(SAC).catch(() => ({ items: [] }));
    return (result.items || []).map(s => ({
        itemType: 'swap',
        itemId: s._id,
        swapToken: s.token,
        title: 'בקשת החלפת משמרת',
        subtitle: `${s.requesterName || 'עובד/ת'} מבקש/ת החלפה — ${formatDateHe(s.dateKey)} · ${s.startTime}–${s.endTime} (${s.workshopName || 'סדנה'})`,
    }));
}

/** All currently-open items for one employee — used both by the token page and the suppression check. */
export async function loadPendingItems(roleId) {
    const [confirmations, offers, swaps] = await Promise.all([
        loadPendingConfirmations(roleId),
        loadPendingOffers(roleId),
        loadPendingSwaps(roleId),
    ]);
    return [...confirmations, ...offers, ...swaps];
}

export async function countPendingItems(roleId) {
    if (!roleId) return 0;
    const items = await loadPendingItems(roleId);
    return items.length;
}

/**
 * Called after a new confirmation/offer/swap item is created for an employee.
 * If they already had SUPPRESS_INDIVIDUAL_AFTER+ open items, this (re)sends
 * one consolidated "you have N pending items" alert instead — deduped so
 * it's sent at most once per cooldown window even as more items pile up —
 * and returns true so the caller can skip its own dedicated WhatsApp for the
 * new item.
 */
export async function maybeSuppressForPendingBacklog(role) {
    if (!role?.phone) return false;
    const count = await countPendingItems(role._id);
    if (count < SUPPRESS_INDIVIDUAL_AFTER) return false;

    if (await shouldSendPendingLinkAlert(role._id, ALERT_ACTION_KEY)) {
        const link = await getOrCreatePendingLink(role);
        await enqueueNotification({
            actionKey: ALERT_ACTION_KEY,
            recipientId: role._id,
            recipientPhone: role.phone,
            priority: PRIORITY.URGENT,
            vars: { displayName: role.displayName || '', count, pendingLink: link },
        });
        await recordPendingLinkAlertSent(role._id, ALERT_ACTION_KEY);
    }
    return true;
}
