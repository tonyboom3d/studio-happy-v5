/**
 * Manager "pending items" web methods (Phase 3) — the token in the WhatsApp
 * link is the authentication (Permissions.Anyone, validated in
 * managerPending.js / managerPendingQuery.js), same accepted trade-off as the
 * existing shift-request-review flow. Used by the manager-pending Velo page.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { getManagerPendingItemsByToken, respondManagerPendingItems } from 'backend/managerPending.js';
import { getOrCreateManagerPendingLink } from 'backend/managerPendingQuery.js';
import { assertEmployeeAccess } from 'backend/staffRoles.js';

/** Loads every open manager item (swap approvals, change requests, escalations). */
export const getPendingManagerItems = webMethod(Permissions.Anyone, async (token) => {
    const details = await getManagerPendingItemsByToken(token);
    if (!details) throw new Error('NOT_FOUND: הקישור אינו תקף או שפג תוקפו.');
    return details;
});

/**
 * Applies a batch of manager decisions.
 * @param {Array<{itemType:string, itemId:string, action:'accept'|'decline', comment?:string}>} decisions
 */
export const respondToManagerPendingItems = webMethod(Permissions.Anyone, async (token, decisions) => {
    return respondManagerPendingItems(token, decisions);
});

/** Dashboard-side convenience: lets a logged-in manager fetch their own pending-items link on demand. */
export const getMyManagerPendingLink = webMethod(Permissions.Anyone, async () => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    return { link: await getOrCreateManagerPendingLink(role) };
});
