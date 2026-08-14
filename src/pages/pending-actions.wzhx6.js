/**
 * Pending Actions page (Phase 3) — page code.
 *
 * Editor setup required:
 *  - Create a page at /pending-actions (hidden from menus; the token in the
 *    URL is the authentication, so the page itself can stay public).
 *  - Add the `pending-actions` custom element (Tag Name: pending-actions,
 *    source: src/public/custom-elements/pending-actions.js).
 *  - This file assumes the element's ID is `#pendingActions1`.
 *
 * Flow: reads ?token=... → getMyPendingItems → pushes `items-data`;
 * `submit-decisions` events → respondToPendingItems → pushes `respond-result`.
 */
import wixLocation from 'wix-location';
import { getMyPendingItems, respondToPendingItems } from 'backend/pendingActionsService.web.js';

const ELEMENT_ID = '#pendingActions1';

$w.onReady(async function () {
    console.log('[pending-actions] $w.onReady fired');

    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[pending-actions] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const token = wixLocation.query?.token || null;
    console.log('[pending-actions] token present:', !!token);

    if (!token) {
        el.setAttribute('items-data', JSON.stringify({ error: true, message: 'חסר קישור תקין.', __ts: Date.now() }));
        return;
    }

    el.on('submit-decisions', async (event) => {
        const { decisions } = event.detail || {};
        console.log('[pending-actions] page ← submit-decisions', decisions?.length);
        try {
            const result = await respondToPendingItems(token, decisions);
            console.log('[pending-actions] respondToPendingItems result', result);
            el.setAttribute('respond-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[pending-actions] respondToPendingItems failed:', message);
            el.setAttribute('respond-result', JSON.stringify({ ok: false, results: [], __ts: Date.now() }));
        }
    });

    async function loadItems() {
        try {
            const details = await getMyPendingItems(token);
            console.log('[pending-actions] items loaded:', details?.items?.length);
            el.setAttribute('items-data', JSON.stringify({ ...details, __ts: Date.now() }));
        } catch (err) {
            console.error('[pending-actions] getMyPendingItems failed:', err?.message || err);
            el.setAttribute('items-data', JSON.stringify({ error: true, message: 'הקישור אינו תקף או שפג תוקפו.', __ts: Date.now() }));
        }
    }

    await loadItems();
});
