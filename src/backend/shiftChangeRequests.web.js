/**
 * Shift change/deletion request web methods (Module A). The token in the
 * WhatsApp link is the authentication for the manager-facing methods
 * (Permissions.Anyone, validated in shiftChangeRequests.js) — same accepted
 * trade-off as the existing shift-confirm flow.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess } from 'backend/staffRoles.js';
import {
    createShiftChangeRequest,
    getRequestByToken,
    decideRequestByToken,
    acknowledgeRequest,
} from 'backend/shiftChangeRequests.js';

/** Employee files a change/deletion request for a SCHEDULED/STANDBY shift. */
export const requestShiftChange = webMethod(Permissions.Anyone, async (submissionId, payload) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    return createShiftChangeRequest(role, submissionId, payload);
});

/** Employee dismisses a decided request's banner in their portal. */
export const acknowledgeShiftRequest = webMethod(Permissions.Anyone, async (requestId) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    return acknowledgeRequest(role._id, requestId);
});

/** Manager review page: load request details by token. */
export const getShiftRequestByToken = webMethod(Permissions.Anyone, async (token) => {
    const details = await getRequestByToken(token);
    if (!details) throw new Error('NOT_FOUND: הקישור אינו תקף.');
    return details;
});

/** @param {string} decision 'APPROVE' | 'DECLINE' */
export const decideShiftRequest = webMethod(Permissions.Anyone, async (token, decision, comment) => {
    if (decision !== 'APPROVE' && decision !== 'DECLINE') {
        throw new Error('BAD_REQUEST: פעולה לא מוכרת.');
    }
    return decideRequestByToken(token, decision, comment);
});
