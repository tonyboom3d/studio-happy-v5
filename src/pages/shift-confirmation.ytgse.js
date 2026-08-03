/**
 * Shift Confirmation page (Module D) — page code.
 *
 * Editor setup required:
 *  - Create a page at /shift-confirm (hidden from menus; the token in the URL
 *    is the authentication, so the page itself can stay public).
 *  - Add the `shift-confirm` custom element (Tag Name: shift-confirm,
 *    source: src/public/custom-elements/shift-confirm.js).
 *  - This file assumes the element's ID is `#shiftConfirm1`.
 *  - Copy this file's contents into the Wix-generated page code file.
 *
 * Flow: reads ?token=... → getShiftByToken → pushes `shift-data`;
 * `confirm-action` events → respondToShift → pushes `respond-result`.
 */
import wixLocation from 'wix-location';
import { getShiftByToken, respondToShift } from 'backend/shiftConfirmService.web.js';

const ELEMENT_ID = '#shiftConfirm1';

$w.onReady(async function () {
    console.log('[shift-confirm] $w.onReady fired');

    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[shift-confirm] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const token = wixLocation.query?.token || null;
    console.log('[shift-confirm] token present:', !!token);

    if (!token) {
        el.setAttribute('shift-data', JSON.stringify({ error: true, message: 'חסר קישור תקין.', __ts: Date.now() }));
        return;
    }

    el.on('confirm-action', async (event) => {
        const { action, notes } = event.detail || {};
        console.log('[shift-confirm] page ← confirm-action', action);
        try {
            const result = await respondToShift(token, action, notes || '');
            console.log('[shift-confirm] respondToShift result', result);
            el.setAttribute('respond-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[shift-confirm] respondToShift failed:', message);
            const parts = message.split(':');
            const friendly = parts.length > 1 && /[\u0590-\u05FF]/.test(parts.slice(1).join(':'))
                ? parts.slice(1).join(':').trim()
                : 'אירעה שגיאה. נסו שוב.';
            el.setAttribute('respond-result', JSON.stringify({ error: true, message: friendly, __ts: Date.now() }));
        }
    });

    try {
        const details = await getShiftByToken(token);
        console.log('[shift-confirm] shift details loaded');
        el.setAttribute('shift-data', JSON.stringify({ ...details, __ts: Date.now() }));
    } catch (err) {
        console.error('[shift-confirm] getShiftByToken failed:', err?.message || err);
        el.setAttribute('shift-data', JSON.stringify({ error: true, message: 'הקישור אינו תקף או שפג תוקפו.', __ts: Date.now() }));
    }
});
