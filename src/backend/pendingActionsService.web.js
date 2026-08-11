/**
 * Employee "pending items" web methods (Phase 3) — the token in the
 * WhatsApp link is the authentication (Permissions.Anyone, validated in
 * pendingItemsQuery/pendingActions), same accepted trade-off as the existing
 * shift-confirm / shift-swap flows. Used by the pending-actions Velo page.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { getPendingItemsByToken, respondPendingItems } from 'backend/pendingActions.js';
import { getOrCreatePendingLink } from 'backend/pendingItemsQuery.js';
import { assertEmployeeAccess } from 'backend/staffRoles.js';

/** Loads every open item (confirmations, offers, swaps) for the token's owner. */
export const getMyPendingItems = webMethod(Permissions.Anyone, async (token) => {
    const details = await getPendingItemsByToken(token);
    if (!details) throw new Error('NOT_FOUND: הקישור אינו תקף או שפג תוקפו.');
    return details;
});

/**
 * Applies a batch of decisions.
 * @param {Array<{itemType:string, itemId:string, action:'accept'|'decline', notes?:string}>} decisions
 */
export const respondToPendingItems = webMethod(Permissions.Anyone, async (token, decisions) => {
    return respondPendingItems(token, decisions);
});

/** Portal-side convenience: lets a logged-in employee fetch their own pending-items link on demand. */
export const getMyPendingLink = webMethod(Permissions.Anyone, async () => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    return { link: await getOrCreatePendingLink(role) };
});
