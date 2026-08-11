/**
 * Employee-side "pending items" page logic (Phase 3) — internal module, no
 * web methods. Applies bulk accept/decline decisions from the token-based
 * pending-actions page by delegating to each item type's existing
 * single-item handler (respondByToken, respondToOffer, respondToSwapAsTarget)
 * — same authorization/side-effects as the original per-item token flows,
 * just reachable from one consolidated link.
 *
 * Read-side (listing items, issuing the token) lives in pendingItemsQuery.js
 * to avoid an import cycle (this file needs to import the action modules;
 * they in turn import pendingItemsQuery.js for suppression checks).
 */
import wixData from 'wix-data';
import { respondByToken } from 'backend/shiftConfirmations.js';
import { respondToOffer } from 'backend/schedulingEngine.js';
import { respondToSwapAsTarget } from 'backend/shiftSwaps.js';
import { findRoleByPendingToken, loadPendingItems } from 'backend/pendingItemsQuery.js';

const SA = { suppressAuth: true };

/** Token-page payload — resolves the owning role from the link's token. */
export async function getPendingItemsByToken(token) {
    const role = await findRoleByPendingToken(token);
    if (!role) return null;
    const items = await loadPendingItems(role._id);
    return { displayName: role.displayName || 'עובד/ת', items };
}

/**
 * Applies a batch of decisions in one call. Each decision:
 *   { itemType: 'confirmation'|'offer'|'swap', itemId, action: 'accept'|'decline', notes? }
 * Per-item failures don't abort the batch — each result is reported individually.
 */
export async function respondPendingItems(token, decisions) {
    const role = await findRoleByPendingToken(token);
    if (!role) throw new Error('NOT_FOUND: הקישור אינו תקף או שפג תוקפו.');
    if (!Array.isArray(decisions) || !decisions.length) throw new Error('BAD_REQUEST: לא נבחרו פריטים.');

    const results = [];
    for (const d of decisions) {
        const accept = d?.action === 'accept';
        try {
            if (d.itemType === 'confirmation') {
                const a = await wixData.get('ShiftAssignments', d.itemId, SA).catch(() => null);
                if (!a || a.employeeId !== role._id) throw new Error('NOT_FOUND: הפריט לא נמצא.');
                const r = await respondByToken(a.confirmToken, accept, d.notes || '');
                results.push({ itemId: d.itemId, itemType: d.itemType, ok: true, ...r });
            } else if (d.itemType === 'offer') {
                const o = await wixData.get('ShiftOffers', d.itemId, SA).catch(() => null);
                if (!o || o.employeeId !== role._id) throw new Error('NOT_FOUND: הפריט לא נמצא.');
                const r = await respondToOffer(d.itemId, role, accept);
                results.push({ itemId: d.itemId, itemType: d.itemType, ok: true, ...r });
            } else if (d.itemType === 'swap') {
                const s = await wixData.get('ShiftSwapRequests', d.itemId, SA).catch(() => null);
                if (!s || s.targetEmployeeId !== role._id) throw new Error('NOT_FOUND: הפריט לא נמצא.');
                const r = await respondToSwapAsTarget(role, s.token, accept);
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
