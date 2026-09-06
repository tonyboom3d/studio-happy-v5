// "ימי הולדת" landing page — wires the birthday-landing Custom Element
// (#customElement2) to the birthdayWorkshops CMS collection and to the
// birthdayLeads.web.js backend module for lead submissions.
import wixData from 'wix-data';
import { submitBirthdayLead } from 'backend/birthdayLeads.web.js';

const ELEMENT_ID = '#customElement2';

$w.onReady(function () {
    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[birthday-landing][velo] ELEMENT_NOT_FOUND — ${ELEMENT_ID} missing on page`);
        return;
    }
    if (typeof el.on !== 'function') {
        console.error(
            `[birthday-landing][velo] ELEMENT_NOT_CUSTOM_ELEMENT — ${ELEMENT_ID} was found but has no ` +
            `".on" method. Verify it's a "Custom Element" component with Tag Name "birthday-landing".`
        );
        return;
    }

    el.on('submitLead', (event) => {
        handleSubmitLead(el, event.detail).catch((err) => {
            console.error('[birthday-landing][velo] submitLead error:', err?.message || err);
            pushLeadResult(el, event.detail?.requestId, {
                ok: false,
                message: 'אירעה שגיאה בשליחת הפנייה. נסו שוב מאוחר יותר.',
            });
        });
    });

    el.on('birthday-tab-change', (event) => {
        console.log('[birthday-landing][velo] active workshop changed:', event.detail);
    });

    loadWorkshops(el).catch((err) => {
        console.error('[birthday-landing][velo] initial load error:', err?.message || err);
    });
});

async function loadWorkshops(el) {
    const result = await wixData.query('birthdayWorkshops').ascending('order').limit(50).find();
    el.setAttribute('workshops-data', JSON.stringify({ workshops: result.items || [], __ts: Date.now() }));
}

async function handleSubmitLead(el, detail) {
    const { requestId, payload } = detail || {};
    if (!requestId) return;
    const result = await submitBirthdayLead(payload);
    pushLeadResult(el, requestId, result);
}

function pushLeadResult(el, requestId, result) {
    el.setAttribute('lead-result', JSON.stringify({ requestId, ...result, __ts: Date.now() }));
}
