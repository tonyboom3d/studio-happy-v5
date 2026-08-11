/**
 * Manager-side "pending items" page logic (Phase 3) — internal module, no
 * web methods. Applies bulk approve/decline decisions from the manager
 * pending-items page by delegating to each item type's existing decision
 * handler (decideSwapAsManager, decideRequestByToken, resolveEscalationByManager).
 *
 * Read-side lives in managerPendingQuery.js to avoid an import cycle (this
 * file imports the action modules; they import managerPendingQuery.js back
 * for suppression checks).
 */
import wixData from 'wix-data';
import { decideSwapAsManager } from 'backend/shiftSwaps.js';
import { decideRequestByToken } from 'backend/shiftChangeRequests.js';
import { resolveEscalationByManager } from 'backend/shiftConfirmations.js';
import { findManagerByPendingToken, loadManagerPendingItems } from 'backend/managerPendingQuery.js';

const SA = { suppressAuth: true };

/** Token-page payload — resolves the acting manager from the link's token. */
export async function getManagerPendingItemsByToken(token) {
    const role = await findManagerByPendingToken(token);
    if (!role) return null;
    const items = await loadManagerPendingItems();
    return { displayName: role.displayName || 'מנהל/ת', items };
}

/**
 * Applies a batch of manager decisions in one call. Each decision:
 *   { itemType: 'swap-approval'|'change-request'|'escalation', itemId, action: 'accept'|'decline', comment? }
 * Per-item failures don't abort the batch.
 */
export async function respondManagerPendingItems(token, decisions) {
    const role = await findManagerByPendingToken(token);
    if (!role) throw new Error('NOT_FOUND: הקישור אינו תקף או שפג תוקפו.');
    if (!Array.isArray(decisions) || !decisions.length) throw new Error('BAD_REQUEST: לא נבחרו פריטים.');

    const results = [];
    for (const d of decisions) {
        const accept = d?.action === 'accept';
        const comment = typeof d?.comment === 'string' ? d.comment : '';
        try {
            if (d.itemType === 'swap-approval') {
                const s = await wixData.get('ShiftSwapRequests', d.itemId, SA).catch(() => null);
                if (!s) throw new Error('NOT_FOUND: הבקשה לא נמצאה.');
                const r = await decideSwapAsManager(role, s.token, accept ? 'APPROVE' : 'DECLINE', comment);
                results.push({ itemId: d.itemId, itemType: d.itemType, ok: true, ...r });
            } else if (d.itemType === 'change-request') {
                const req = await wixData.get('ShiftChangeRequests', d.itemId, SA).catch(() => null);
                if (!req) throw new Error('NOT_FOUND: הבקשה לא נמצאה.');
                const r = await decideRequestByToken(req.token, accept ? 'APPROVE' : 'DECLINE', comment);
                results.push({ itemId: d.itemId, itemType: d.itemType, ok: true, ...r });
            } else if (d.itemType === 'escalation') {
                const r = await resolveEscalationByManager(d.itemId, accept, comment);
                results.push({ itemId: d.itemId, itemType: d.itemType, ok: true, ...r });
            } else {
                results.push({ itemId: d.itemId, itemType: d.itemType, ok: false, error: 'סוג פריט לא מוכר.' });
            }
        } catch (err) {
            results.push({ itemId: d.itemId, itemType: d.itemType, ok: false, error: err?.message || String(err) });
        }
    }
    return { ok: true, results };
}
