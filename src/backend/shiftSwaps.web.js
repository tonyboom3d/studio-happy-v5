/**
 * Shift swap web methods (Module A). Employee-facing methods use the normal
 * portal auth gate; the two token-driven review methods additionally verify
 * the logged-in member is the correct party (target employee / a manager) —
 * the /shift-swap page blocks anyone else and prompts them to log in.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess, getLoggedInMember, findDashboardRoleForMember, hasConnectedStaff } from 'backend/staffRoles.js';
import {
    listSwapCandidates,
    createSwapRequest,
    getSwapRequestForViewer,
    respondToSwapAsTarget,
    decideSwapAsManager,
    acknowledgeSwapRequest,
} from 'backend/shiftSwaps.js';

/** Loads employees eligible to receive a swap for the given shift (skill-matched). */
export const loadSwapCandidates = webMethod(Permissions.Anyone, async (submissionId) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    return listSwapCandidates(role, submissionId);
});

/** Requester files a swap request; a WhatsApp with a token link goes to the chosen replacement. */
export const requestShiftSwap = webMethod(Permissions.Anyone, async (submissionId, targetEmployeeId) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    return createSwapRequest(role, submissionId, targetEmployeeId);
});

/** Requester dismisses a decided swap's banner in their portal. */
export const acknowledgeShiftSwap = webMethod(Permissions.Anyone, async (swapId) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    return acknowledgeSwapRequest(role._id, swapId);
});

/** Resolves the current logged-in member against the token so the /shift-swap page can gate access. */
async function resolveViewerRole() {
    const member = await getLoggedInMember();
    if (!member) return null;
    const role = await findDashboardRoleForMember(member);
    return role && hasConnectedStaff(role) ? role : null;
}

/** /shift-swap page: load swap details + viewer classification (NOT_LOGGED_IN | UNAUTHORIZED | TARGET | MANAGER). */
export const getShiftSwapByToken = webMethod(Permissions.Anyone, async (token) => {
    const details = await getSwapRequestForViewer(token);
    if (!details) throw new Error('NOT_FOUND: הקישור אינו תקף.');
    return details;
});

/** @param {string} decision 'APPROVE' | 'DECLINE' */
export const decideShiftSwapAsTarget = webMethod(Permissions.Anyone, async (token, decision) => {
    const role = await resolveViewerRole();
    if (!role) throw new Error('ACCESS_DENIED: יש להתחבר לחשבון העובד/ת הנכון כדי להמשיך.');
    if (decision !== 'APPROVE' && decision !== 'DECLINE') throw new Error('BAD_REQUEST: פעולה לא מוכרת.');
    return respondToSwapAsTarget(role, token, decision === 'APPROVE');
});

/** @param {string} decision 'APPROVE' | 'DECLINE' */
export const decideShiftSwapAsManager = webMethod(Permissions.Anyone, async (token, decision, comment) => {
    const role = await resolveViewerRole();
    if (!role) throw new Error('ACCESS_DENIED: יש להתחבר לחשבון מנהל/ת כדי להמשיך.');
    if (decision !== 'APPROVE' && decision !== 'DECLINE') throw new Error('BAD_REQUEST: פעולה לא מוכרת.');
    return decideSwapAsManager(role, token, decision, comment);
});
