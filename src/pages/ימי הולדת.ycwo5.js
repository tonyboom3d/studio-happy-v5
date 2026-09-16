// "ימי הולדת" landing page — wires the birthday-landing Custom Element
// birthdayLeads.web.js backend module for data fetch and lead submissions.
import { getBirthdayWorkshops, submitBirthdayLead } from 'backend/birthdayLeads.web.js';
import wixLocation from 'wix-location';
import wixLocationFrontend from 'wix-location-frontend';

const ELEMENT_ID = '#customElement2';
const WORKSHOP_QUERY_KEY = 'workshop';

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

    syncWorkshopQueryToElement(el, getWorkshopIdFromQuery());

    el.on('submitLead', (event) => {
        handleSubmitLead(el, event.detail).catch((err) => {
            console.error('[birthday-landing][velo] submitLead error:', err?.message || err);
            pushLeadResult(el, event.detail?.requestId, {
                ok: false,
                message: 'אירעה שגיאה בשליחת הפנייה. נסו שוב מאוחר יותר.',
            });
        });
    });

    el.on('birthday-workshop-select', (event) => {
        const workshopId = event.detail?.workshopId || '';
        updateWorkshopQuery(el, workshopId);
    });

    el.on('birthday-workshop-clear', () => {
        updateWorkshopQuery(el, '');
    });

    el.on('birthday-tab-change', (event) => {
        const workshopId = event.detail?.workshopId || '';
        if (workshopId) updateWorkshopQuery(el, workshopId, { replace: true });
    });

    loadWorkshops(el).catch((err) => {
        console.error('[birthday-landing][velo] initial load error:', err?.message || err);
        el.setAttribute('workshops-data', JSON.stringify({ workshops: [], __ts: Date.now() }));
    });
});

function getWorkshopIdFromQuery() {
    return String(wixLocation.query?.[WORKSHOP_QUERY_KEY] || '').trim();
}

function syncWorkshopQueryToElement(el, workshopId) {
    el.setAttribute('active-workshop-id', workshopId || '');
}

function updateWorkshopQuery(el, workshopId, options = {}) {
    const baseUrl = wixLocation.url.split('?')[0];
    const nextUrl = workshopId
        ? `${baseUrl}?${WORKSHOP_QUERY_KEY}=${encodeURIComponent(workshopId)}`
        : baseUrl;
    const historyMode = options.replace ? 'replace' : 'push';
    wixLocationFrontend.to(nextUrl, { history: historyMode });
    syncWorkshopQueryToElement(el, workshopId);
}

async function loadWorkshops(el) {
    const { workshops } = await getBirthdayWorkshops();
    el.setAttribute('workshops-data', JSON.stringify({ workshops: workshops || [], __ts: Date.now() }));
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
