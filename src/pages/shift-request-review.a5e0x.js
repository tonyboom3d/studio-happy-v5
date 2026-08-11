/**
 * Shift Change Request Review page (Module A) — page code.
 *
 * Editor setup required:
 *  - Create a page at /shift-request-review (hidden from menus; the token in
 *    the URL is the authentication, so the page itself can stay public).
 *  - Add the `shift-request-review` custom element (Tag Name:
 *    shift-request-review, source: src/public/custom-elements/shift-request-review.js).
 *  - This file assumes the element's ID is `#shiftRequestReview1`.
 *
 * Flow: reads ?token=... → getShiftRequestByToken → pushes `request-data`;
 * `review-action` events → decideShiftRequest → pushes `decide-result`.
 */
import wixLocation from 'wix-location';
import { getShiftRequestByToken, decideShiftRequest } from 'backend/shiftChangeRequests.web.js';

const ELEMENT_ID = '#shiftRequestReview1';
const FALLBACK_ELEMENT_IDS = ['#customElement1'];

function resolveReviewElement() {
    const ids = [ELEMENT_ID, ...FALLBACK_ELEMENT_IDS.filter((id) => id !== ELEMENT_ID)];
    for (const id of ids) {
        const candidate = $w(id);
        if (typeof candidate?.on === 'function' && typeof candidate?.setAttribute === 'function') {
            if (id !== ELEMENT_ID) {
                console.warn(`[shift-request-review] Using ${id} — set ELEMENT_ID to match your editor ID`);
            }
            return candidate;
        }
    }

    let fallback = null;
    $w('CustomElement').forEach((ce) => {
        if (!fallback && typeof ce.on === 'function' && typeof ce.setAttribute === 'function') {
            fallback = ce;
        }
    });
    return fallback;
}

$w.onReady(async function () {
    console.log('[shift-request-review] $w.onReady fired');

    const el = resolveReviewElement();
    if (!el) {
        console.error(`[shift-request-review] Custom Element not found or wrong widget type.`);
        console.error(`[shift-request-review] Add shift-request-review CE (tag: shift-request-review), ID ${ELEMENT_ID} or update ELEMENT_ID.`);
        return;
    }

    console.log('[shift-request-review] element ready', {
        hasOn: typeof el.on === 'function',
        hasSetAttribute: typeof el.setAttribute === 'function',
    });

    const token = wixLocation.query?.token || null;
    console.log('[shift-request-review] token present:', !!token);

    if (!token) {
        el.setAttribute('request-data', JSON.stringify({ error: true, message: 'חסר קישור תקין.', __ts: Date.now() }));
        return;
    }

    el.on('review-action', async (event) => {
        const { decision, comment } = event.detail || {};
        console.log('[shift-request-review] page ← review-action', decision);
        try {
            const result = await decideShiftRequest(token, decision, comment || '');
            console.log('[shift-request-review] decideShiftRequest result', result);
            el.setAttribute('decide-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[shift-request-review] decideShiftRequest failed:', message);
            const parts = message.split(':');
            const friendly = parts.length > 1 && /[\u0590-\u05FF]/.test(parts.slice(1).join(':'))
                ? parts.slice(1).join(':').trim()
                : 'אירעה שגיאה. נסו שוב.';
            el.setAttribute('decide-result', JSON.stringify({ error: true, message: friendly, __ts: Date.now() }));
        }
    });

    try {
        const details = await getShiftRequestByToken(token);
        console.log('[shift-request-review] request details loaded');
        el.setAttribute('request-data', JSON.stringify({ ...details, __ts: Date.now() }));
    } catch (err) {
        console.error('[shift-request-review] getShiftRequestByToken failed:', err?.message || err);
        el.setAttribute('request-data', JSON.stringify({ error: true, message: 'הקישור אינו תקף או שפג תוקפו.', __ts: Date.now() }));
    }
});
