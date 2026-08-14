/**
 * Manager Pending Actions page (Phase 3) — page code.
 *
 * Editor setup required:
 *  - Create a page at /manager-pending (hidden from menus; the token in the
 *    URL is the authentication, so the page itself can stay public).
 *  - Add the `manager-pending` custom element (Tag Name: manager-pending,
 *    source: src/public/custom-elements/manager-pending.js).
 *  - This file assumes the element's ID is `#managerPending1`.
 *
 * Flow: reads ?token=... → getPendingManagerItems → pushes `items-data`;
 * `submit-decisions` events → respondToManagerPendingItems → pushes `respond-result`.
 */
import wixLocation from 'wix-location';
import { getPendingManagerItems, respondToManagerPendingItems } from 'backend/managerPendingService.web.js';

const ELEMENT_ID = '#managerPending1';

$w.onReady(async function () {
    console.log('[manager-pending] $w.onReady fired');

    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[manager-pending] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const token = wixLocation.query?.token || null;
    console.log('[manager-pending] token present:', !!token);

    if (!token) {
        el.setAttribute('items-data', JSON.stringify({ error: true, message: 'חסר קישור תקין.', __ts: Date.now() }));
        return;
    }

    el.on('submit-decisions', async (event) => {
        const { decisions } = event.detail || {};
        console.log('[manager-pending] page ← submit-decisions', decisions?.length);
        try {
            const result = await respondToManagerPendingItems(token, decisions);
            console.log('[manager-pending] respondToManagerPendingItems result', result);
            el.setAttribute('respond-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[manager-pending] respondToManagerPendingItems failed:', message);
            el.setAttribute('respond-result', JSON.stringify({ ok: false, results: [], __ts: Date.now() }));
        }
    });

    try {
        const details = await getPendingManagerItems(token);
        console.log('[manager-pending] items loaded:', details?.items?.length);
        el.setAttribute('items-data', JSON.stringify({ ...details, __ts: Date.now() }));
    } catch (err) {
        console.error('[manager-pending] getPendingManagerItems failed:', err?.message || err);
        el.setAttribute('items-data', JSON.stringify({ error: true, message: 'הקישור אינו תקף או שפג תוקפו.', __ts: Date.now() }));
    }
});
