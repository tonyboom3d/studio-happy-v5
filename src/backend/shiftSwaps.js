/**
 * Shift swap requests (Module A) — internal module, no web methods.
 *
 * Employee-to-employee coordination for SCHEDULED/STANDBY shifts, gated by a
 * skills check, an authenticated approval step by the replacement employee,
 * and a final manager approval — same tokenized-link pattern as
 * shiftChangeRequests.js, but the token here is only half the authentication:
 * the /shift-swap page also requires the *correct* logged-in member.
 *
 * Collection: ShiftSwapRequests — submissionId, requesterId, requesterName,
 * targetEmployeeId, targetEmployeeName, dateKey, startTime, endTime,
 * workshopTypeId, workshopName, status ('PENDING_EMPLOYEE'|'EMPLOYEE_DECLINED'|
 * 'PENDING_MANAGER'|'APPROVED'|'DECLINED'), token, managerComment,
 * employeeDecidedAt, managerDecidedAt, requesterAcked.
 */
import wixData from 'wix-data';
import { SUBMISSION_STATUS, toDateKey } from 'backend/availabilityRules.js';
import {
    getLoggedInMember,
    findDashboardRoleForMember,
    hasConnectedStaff,
    getRolePermissionValue,
    refId,
    refIds,
    roleHasWorkshopSkill,
} from 'backend/staffRoles.js';
import {
    buildBoard,
    loadActiveRoles,
    loadWorkshopTypeMap,
    notifyManagers,
    publishSchedulingUpdate,
} from 'backend/schedulingEngine.js';
import { sendGreenApiWhatsApp } from 'backend/whatsappService.jsw';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const SWAP_URL = 'https://www.studiohappy.art/shift-swap';

export const SWAP_STATUS = {
    PENDING_EMPLOYEE: 'PENDING_EMPLOYEE',
    EMPLOYEE_DECLINED: 'EMPLOYEE_DECLINED',
    PENDING_MANAGER: 'PENDING_MANAGER',
    APPROVED: 'APPROVED',
    DECLINED: 'DECLINED',
};

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
    const result = await wixData.query('ShiftSwapRequests')
        .eq('token', token)
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    return result.items?.[0] || null;
}

async function getRoleById(id) {
    if (!id) return null;
    try {
        const result = await wixData.query('Dashboard_Roles')
            .eq('_id', id)
            .include('skills')
            .limit(1)
            .find(SA);
        return result.items?.[0] || null;
    } catch (_) {
        return wixData.get('Dashboard_Roles', id, SA).catch(() => null);
    }
}

/**
 * Workshop type(s) this submission is tied to, from the employee's own
 * skills. SCHEDULED shifts resolve to the exact ShiftAssignments row;
 * STANDBY shifts (no assignment yet) infer it from that day's workshops
 * matching the requester's skills.
 */
async function resolveWorkshopTypeIds(submission, role) {
    const dateKey = toDateKey(submission.date);
    if (submission.status === SUBMISSION_STATUS.SCHEDULED) {
        const result = await wixData.query('ShiftAssignments')
            .eq('submissionId', submission._id)
            .ne('status', 'CANCELLED')
            .limit(1).find(SAC).catch(() => ({ items: [] }));
        const a = result.items?.[0];
        return a?.workshopTypeId ? [a.workshopTypeId] : [];
    }
    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const mySkills = refIds(role.skills);
    return Object.values(board.days[dateKey]?.types || {})
        .filter(t => mySkills.includes(t.typeId))
        .map(t => t.typeId);
}

function assertSwappable(submission, role) {
    if (!submission || submission.employeeId !== role._id) {
        throw new Error('NOT_FOUND: המשמרת לא נמצאה.');
    }
    if (submission.status !== SUBMISSION_STATUS.SCHEDULED && submission.status !== SUBMISSION_STATUS.STANDBY) {
        throw new Error('BAD_REQUEST: ניתן לבקש החלפה רק למשמרות משובצות או בהמתנה.');
    }
    const dateKey = toDateKey(submission.date);
    if (dateKey <= toDateKey(new Date())) {
        throw new Error('FORBIDDEN: לא ניתן לבקש החלפה לתאריך שעבר.');
    }
    return dateKey;
}

/** Active employees (excluding the requester) whose skills match this shift's workshop type. */
export async function listSwapCandidates(role, submissionId) {
    if (!submissionId) throw new Error('BAD_REQUEST: חסר מזהה משמרת.');
    const submission = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    const requester = await getRoleById(role._id) || role;
    assertSwappable(submission, requester);

    const workshopTypeIds = await resolveWorkshopTypeIds(submission, requester);
    if (!workshopTypeIds.length) {
        throw new Error('BAD_REQUEST: לא ניתן לזהות את סוג הסדנה עבור משמרת זו — לא ניתן להציע החלפה.');
    }

    const roles = await loadActiveRoles();
    const candidates = roles
        .filter(r => r._id !== requester._id)
        .filter(r => workshopTypeIds.some(id => roleHasWorkshopSkill(r, id)))
        .map(r => ({ id: r._id, name: r.displayName || 'עובד/ת' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he'));

    return { candidates };
}

function buildTargetMessage(swap) {
    return [
        `🔄 בקשת החלפת משמרת מ-${swap.requesterName}`,
        `סדנה: ${swap.workshopName}`,
        `תאריך ושעה: ${formatDateHe(swap.dateKey)} · ${swap.startTime}–${swap.endTime}`,
        `לאישור/דחייה יש להיכנס לחשבונך ולפתוח את הקישור:`,
        `${SWAP_URL}?token=${swap.token}`,
    ].join('\n');
}

/** Requester files a swap request; validates skills and notifies the target employee via WhatsApp. */
export async function createSwapRequest(role, submissionId, targetEmployeeId) {
    if (!targetEmployeeId) throw new Error('BAD_REQUEST: יש לבחור עובד/ת להחלפה.');
    const submission = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    const requester = await getRoleById(role._id) || role;
    const dateKey = assertSwappable(submission, requester);

    const existing = await wixData.query('ShiftSwapRequests')
        .eq('submissionId', submissionId)
        .hasSome('status', [SWAP_STATUS.PENDING_EMPLOYEE, SWAP_STATUS.PENDING_MANAGER])
        .limit(1).find(SA).catch(() => ({ items: [] }));
    if (existing.items?.length) {
        throw new Error('BAD_REQUEST: יש כבר בקשת החלפה בטיפול למשמרת הזו.');
    }

    const workshopTypeIds = await resolveWorkshopTypeIds(submission, requester);
    if (!workshopTypeIds.length) {
        throw new Error('BAD_REQUEST: לא ניתן לזהות את סוג הסדנה עבור משמרת זו.');
    }

    const target = await getRoleById(targetEmployeeId);
    if (!target || target._id === requester._id) throw new Error('NOT_FOUND: העובד/ת שנבחר/ה לא נמצא/ה.');
    if (target.active === false) throw new Error('BAD_REQUEST: העובד/ת שנבחר/ה אינו/ה פעיל/ה.');
    if (!workshopTypeIds.some(id => roleHasWorkshopSkill(target, id))) {
        throw new Error('BAD_REQUEST: לעובד/ת שנבחר/ה אין הכשרה מתאימה לסוג המשמרת הזו.');
    }

    const { typesById } = await loadWorkshopTypeMap();
    const workshopName = typesById[workshopTypeIds[0]]?.name || 'סדנה';
    const token = randomToken();

    const swap = {
        submissionId,
        requesterId: requester._id,
        requesterName: requester.displayName || 'עובד/ת',
        targetEmployeeId: target._id,
        targetEmployeeName: target.displayName || 'עובד/ת',
        dateKey,
        startTime: submission.startTime,
        endTime: submission.endTime,
        workshopTypeId: workshopTypeIds[0],
        workshopName,
        status: SWAP_STATUS.PENDING_EMPLOYEE,
        token,
        managerComment: '',
        employeeDecidedAt: null,
        managerDecidedAt: null,
        requesterAcked: false,
    };
    await wixData.insert('ShiftSwapRequests', swap, SA);

    if (target.phone) {
        await sendGreenApiWhatsApp(target.phone, buildTargetMessage(swap)).catch(err =>
            console.error('[shiftSwaps] target WhatsApp failed:', err?.message || err));
    } else {
        console.warn(`[shiftSwaps] target role ${target._id} has no phone — swap request created without WhatsApp`);
    }

    console.log(`[shiftSwaps] request created: submission=${submissionId} requester=${requester._id} target=${target._id}`);
    return { ok: true };
}

function publicSwapView(swap) {
    return {
        requesterName: swap.requesterName,
        targetEmployeeName: swap.targetEmployeeName,
        dateKey: swap.dateKey,
        startTime: swap.startTime,
        endTime: swap.endTime,
        workshopName: swap.workshopName,
        status: swap.status,
        managerComment: swap.managerComment || '',
    };
}

/**
 * Resolves who is viewing the swap page for this token, so the page can
 * block anyone but the intended replacement employee / a manager.
 * viewer: 'NOT_LOGGED_IN' | 'UNAUTHORIZED' | 'TARGET' | 'MANAGER'.
 */
export async function getSwapRequestForViewer(token) {
    const swap = await findByToken(token);
    if (!swap) return null;

    const member = await getLoggedInMember();
    if (!member) {
        return { viewer: 'NOT_LOGGED_IN', ...publicSwapView(swap) };
    }
    const role = await findDashboardRoleForMember(member);
    if (!role || !hasConnectedStaff(role)) {
        return { viewer: 'UNAUTHORIZED', ...publicSwapView(swap) };
    }

    let viewer = 'UNAUTHORIZED';
    if (role._id === swap.targetEmployeeId) viewer = 'TARGET';
    else if (getRolePermissionValue(role, 'manageScheduling')) viewer = 'MANAGER';

    return { viewer, ...publicSwapView(swap) };
}

async function notify(role, message) {
    if (!role?.phone) { console.warn(`[shiftSwaps] role ${role?._id} has no phone — skipping WhatsApp`); return; }
    await sendGreenApiWhatsApp(role.phone, message).catch(err =>
        console.error('[shiftSwaps] WhatsApp failed:', err?.message || err));
}

/**
 * The replacement employee's decision. `viewerRole` must already be verified
 * (by the caller / web method) as the logged-in member's Dashboard_Roles row.
 */
export async function respondToSwapAsTarget(viewerRole, token, accept) {
    const swap = await findByToken(token);
    if (!swap) throw new Error('NOT_FOUND: הבקשה לא נמצאה.');
    if (swap.targetEmployeeId !== viewerRole._id) {
        throw new Error('FORBIDDEN: בקשת ההחלפה הזו מיועדת לעובד/ת אחר/ת. יש להתחבר לחשבון הנכון.');
    }
    if (swap.status !== SWAP_STATUS.PENDING_EMPLOYEE) {
        return { ok: true, alreadyDecided: true, status: swap.status, managerComment: swap.managerComment || '' };
    }

    const now = new Date();
    const requester = await getRoleById(swap.requesterId);

    if (!accept) {
        await wixData.update('ShiftSwapRequests', { ...swap, status: SWAP_STATUS.EMPLOYEE_DECLINED, employeeDecidedAt: now }, SA);
        await notify(requester,
            `❌ ${swap.targetEmployeeName} לא אישר/ה את בקשת ההחלפה למשמרת בתאריך ${formatDateHe(swap.dateKey)} (${swap.workshopName}).`);
        return { ok: true, status: SWAP_STATUS.EMPLOYEE_DECLINED };
    }

    await wixData.update('ShiftSwapRequests', { ...swap, status: SWAP_STATUS.PENDING_MANAGER, employeeDecidedAt: now }, SA);
    await notify(requester,
        `✔ ${swap.targetEmployeeName} אישר/ה את בקשת ההחלפה למשמרת בתאריך ${formatDateHe(swap.dateKey)} (${swap.workshopName}) — הבקשה הועברה לאישור מנהל/ת.`);
    await notifyManagers(
        [
            `🔄 בקשת החלפת משמרת ממתינה לאישורכם`,
            `בין ${swap.requesterName} (מבקש/ת) ל-${swap.targetEmployeeName} (מחליף/ה)`,
            `סדנה: ${swap.workshopName}`,
            `תאריך ושעה: ${formatDateHe(swap.dateKey)} · ${swap.startTime}–${swap.endTime}`,
            `שני הצדדים אישרו — לאישור סופי: ${SWAP_URL}?token=${swap.token}`,
        ].join('\n'));

    console.log(`[shiftSwaps] target accepted: id=${swap._id}`);
    return { ok: true, status: SWAP_STATUS.PENDING_MANAGER };
}

/** Transfers the shift's AvailabilitySubmissions (+ ShiftAssignments, if SCHEDULED) row to the replacement employee. */
async function executeSwap(swap) {
    const submission = await wixData.get('AvailabilitySubmissions', swap.submissionId, SA).catch(() => null);
    if (!submission) throw new Error('NOT_FOUND: המשמרת המקורית לא נמצאה — ייתכן שכבר בוטלה.');
    const target = await getRoleById(swap.targetEmployeeId);
    if (!target) throw new Error('NOT_FOUND: העובד/ת המחליף/ה לא נמצא/ה.');

    await wixData.update('AvailabilitySubmissions', {
        ...submission,
        employeeId: target._id,
        staffId: refId(target.connectedStaff),
        notes: `${submission.notes ? submission.notes + ' | ' : ''}הוחלף/ה מ-${swap.requesterName} (אושר ע"י מנהל/ת)`,
    }, SA);

    if (submission.status === SUBMISSION_STATUS.SCHEDULED) {
        const result = await wixData.query('ShiftAssignments')
            .eq('submissionId', submission._id)
            .ne('status', 'CANCELLED')
            .limit(1).find(SAC).catch(() => ({ items: [] }));
        const a = result.items?.[0];
        if (a) {
            await wixData.update('ShiftAssignments', { ...a, employeeId: target._id, source: 'MANUAL' }, SA);
        }
    }

    await publishSchedulingUpdate('shift-swap', { dates: [swap.dateKey] }).catch(() => null);
}

/** Manager's final decision. `viewerRole` must already be verified as a manageScheduling role. */
export async function decideSwapAsManager(viewerRole, token, decision, comment) {
    if (!getRolePermissionValue(viewerRole, 'manageScheduling')) {
        throw new Error('FORBIDDEN: אין לך הרשאת ניהול שיבוץ לביצוע הפעולה הזו.');
    }
    const swap = await findByToken(token);
    if (!swap) throw new Error('NOT_FOUND: הבקשה לא נמצאה.');
    if (swap.status !== SWAP_STATUS.PENDING_MANAGER) {
        return { ok: true, alreadyDecided: true, status: swap.status, managerComment: swap.managerComment || '' };
    }

    const approve = decision === 'APPROVE';
    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 500) : '';
    const now = new Date();

    if (approve) {
        await executeSwap(swap);
    }

    const status = approve ? SWAP_STATUS.APPROVED : SWAP_STATUS.DECLINED;
    await wixData.update('ShiftSwapRequests', { ...swap, status, managerComment: cleanComment, managerDecidedAt: now }, SA);

    const [requester, target] = await Promise.all([getRoleById(swap.requesterId), getRoleById(swap.targetEmployeeId)]);
    const detail = `${formatDateHe(swap.dateKey)} · ${swap.startTime}–${swap.endTime} (${swap.workshopName})`;
    const finalMsg = approve
        ? `✅ ההחלפה אושרה סופית! המשמרת ${detail} עודכנה במערכת.`
        : `❌ בקשת ההחלפה למשמרת ${detail} נדחתה על ידי המנהל/ת.${cleanComment ? `\nהערה: ${cleanComment}` : ''}`;
    await notify(requester, finalMsg);
    await notify(target, finalMsg);

    console.log(`[shiftSwaps] manager decided: id=${swap._id} status=${status}`);
    return { ok: true, status };
}

/** Requester's own pending/recently-decided swaps (for the portal). */
export async function loadMySwapRequests(roleId) {
    const result = await wixData.query('ShiftSwapRequests')
        .eq('requesterId', roleId)
        .ne('requesterAcked', true)
        .descending('_createdDate')
        .limit(100).find(SA).catch(() => ({ items: [] }));
    return (result.items || []).map(r => ({
        id: r._id,
        submissionId: r.submissionId,
        targetEmployeeName: r.targetEmployeeName,
        dateKey: r.dateKey,
        startTime: r.startTime,
        endTime: r.endTime,
        workshopName: r.workshopName,
        status: r.status,
        managerComment: r.managerComment || '',
    }));
}

/** Requester dismisses a decided swap's banner in their portal. */
export async function acknowledgeSwapRequest(roleId, swapId) {
    if (!swapId) throw new Error('BAD_REQUEST: חסר מזהה בקשה.');
    const r = await wixData.get('ShiftSwapRequests', swapId, SA).catch(() => null);
    if (!r || r.requesterId !== roleId) throw new Error('NOT_FOUND: הבקשה לא נמצאה.');
    await wixData.update('ShiftSwapRequests', { ...r, requesterAcked: true }, SA);
    return { ok: true };
}
