/**
 * Shift Swap page (Module A) — page code.
 *
 * Editor setup required:
 *  - Create a public page at /shift-swap (hidden from menus). The page itself
 *    is public; every action re-validates the *logged-in member* against the
 *    swap's target-employee / manager role server-side (shiftSwaps.web.js) —
 *    the token alone is never sufficient to approve anything here.
 *  - Add the `shift-swap` custom element (Tag Name: shift-swap, source:
 *    src/public/custom-elements/shift-swap.js).
 *  - This file assumes the element's ID is `#shiftSwap1`.
 *
 * Flow: reads ?token=... → getShiftSwapByToken → pushes `swap-data` (incl.
 * `viewer` classification); `swap-action` events → login prompt / account
 * switch / decideShiftSwapAsTarget / decideShiftSwapAsManager.
 */
import wixLocation from 'wix-location';
import { authentication } from 'wix-members-frontend';
import {
    getShiftSwapByToken,
    decideShiftSwapAsTarget,
    decideShiftSwapAsManager,
} from 'backend/shiftSwaps.web.js';

const ELEMENT_ID = '#shiftSwap1';

$w.onReady(async function () {
    console.log('[shift-swap] $w.onReady fired');

    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[shift-swap] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const token = wixLocation.query?.token || null;
    console.log('[shift-swap] token present:', !!token);

    if (!token) {
        el.setAttribute('swap-data', JSON.stringify({ error: true, message: 'חסר קישור תקין.', __ts: Date.now() }));
        return;
    }

    async function loadData() {
        try {
            const details = await getShiftSwapByToken(token);
            console.log('[shift-swap] swap details loaded, viewer:', details.viewer);
            el.setAttribute('swap-data', JSON.stringify({ ...details, __ts: Date.now() }));
        } catch (err) {
            console.error('[shift-swap] getShiftSwapByToken failed:', err?.message || err);
            el.setAttribute('swap-data', JSON.stringify({ error: true, message: 'הקישור אינו תקף או שפג תוקפו.', __ts: Date.now() }));
        }
    }

    function friendlyError(err) {
        const message = err?.message || String(err);
        const parts = message.split(':');
        return parts.length > 1 && /[\u0590-\u05FF]/.test(parts.slice(1).join(':'))
            ? parts.slice(1).join(':').trim()
            : 'אירעה שגיאה. נסו שוב.';
    }

    el.on('swap-action', async (event) => {
        const { action, decision, comment } = event.detail || {};
        console.log('[shift-swap] page ← swap-action', action, decision || '');

        if (action === 'login') {
            try {
                await authentication.promptLogin({ mode: 'login' });
            } catch (err) {
                console.warn('[shift-swap] promptLogin cancelled/failed:', err?.message || err);
            }
            await loadData();
            return;
        }

        if (action === 'switch-account') {
            try { await authentication.logout(); } catch (_) { /* ignore */ }
            try {
                await authentication.promptLogin({ mode: 'login' });
            } catch (err) {
                console.warn('[shift-swap] promptLogin (switch) cancelled/failed:', err?.message || err);
            }
            await loadData();
            return;
        }

        try {
            let result;
            if (action === 'decide-target') {
                result = await decideShiftSwapAsTarget(token, decision);
            } else if (action === 'decide-manager') {
                result = await decideShiftSwapAsManager(token, decision, comment || '');
            } else {
                console.warn('[shift-swap] unknown action:', action);
                return;
            }
            console.log('[shift-swap] decision result', result);
            el.setAttribute('decide-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            console.error('[shift-swap] decision failed:', err?.message || err);
            el.setAttribute('decide-result', JSON.stringify({ error: true, message: friendlyError(err), __ts: Date.now() }));
        }
    });

    await loadData();
});
