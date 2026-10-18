// "ימי הולדת" landing page — wires the birthday-landing Custom Element to the
// backend (workshop data + lead validation) AND to the real Wix Form (#form1,
// formId dfecbbfe-54a0-4003-9753-9aaaaf14fe5d) on this page. Visibility of
// #form1 is set in the editor, not from this code.
//
// Why a hidden real form instead of creating the submission from the backend:
// submitting through the actual #form1 element client-side lets the Wix
// Forms app run its own visitor/mailing-list-consent handling. The backend
// (birthdayLeads.web.js) only validates the lead and maps it to the form's
// field keys — it never creates the Wix Form submission itself, so there's
// no double submission.
import { getBirthdayWorkshops, buildBirthdayFormValues, recordBirthdayLeadSideEffects } from 'backend/birthdayLeads.web.js';
import wixLocation from 'wix-location';

const ELEMENT_ID = '#customElement2';
const FORM_ID = '#form1';
const PHONE_FIELD = 'form_field_2';
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

    // Initial deep-link only — in-page URL updates use history API inside the CE (no reload).
    el.setAttribute('active-workshop-ref', getWorkshopRefFromQuery());

    el.on('submitLead', (event) => {
        handleSubmitLead(el, event.detail).catch((err) => {
            console.error('[birthday-landing][velo] submitLead error:', err?.message || err);
            pushLeadResult(el, event.detail?.requestId, {
                ok: false,
                message: 'אירעה שגיאה בשליחת הפנייה. נסו שוב מאוחר יותר.',
            });
        });
    });

    loadWorkshops(el).catch((err) => {
        console.error('[birthday-landing][velo] initial load error:', err?.message || err);
        el.setAttribute('workshops-data', JSON.stringify({ workshops: [], __ts: Date.now() }));
    });
});

function getWorkshopRefFromQuery() {
    return String(wixLocation.query?.[WORKSHOP_QUERY_KEY] || '').trim();
}

async function loadWorkshops(el) {
    const { workshops } = await getBirthdayWorkshops();
    el.setAttribute('workshops-data', JSON.stringify({ workshops: workshops || [], __ts: Date.now() }));
}

async function handleSubmitLead(el, detail) {
    const { requestId, payload } = detail || {};
    if (!requestId) return;

    const prep = await buildBirthdayFormValues(payload);
    if (!prep.ok) {
        pushLeadResult(el, requestId, prep);
        return;
    }

    try {
        $w(FORM_ID).setFieldValues(prep.submissionValues);
        await $w(FORM_ID).submit();
    } catch (err) {
        console.error('[birthday-landing][velo] real form submit error:', err?.message || err);
        const formRejected = /validation failed|doesn't satisfy form requirements/i.test(String(err?.message || err || ''));
        if (formRejected) clearFormPhone();
        pushLeadResult(el, requestId, {
            ok: false,
            message: formRejected
                ? 'נא לוודא שמספר הפלאפון תקין, מתחיל ב-05 ומכיל 10 ספרות.'
                : 'אירעה שגיאה בשליחת הפנייה. נסו שוב מאוחר יותר.',
        });
        return;
    }

    // Best-effort — only runs once the real Wix Form submission succeeded.
    recordBirthdayLeadSideEffects(payload).catch((err) => {
        console.error('[birthday-landing][velo] side effects error:', err?.message || err);
    });

    pushLeadResult(el, requestId, { ok: true, message: prep.message });
}

/** Drops an invalid phone from #form1. The next submit writes it again. */
function clearFormPhone() {
    try {
        $w(FORM_ID).setFieldValues({ [PHONE_FIELD]: '' });
    } catch (err) {
        console.error('[birthday-landing][velo] clear phone error:', err?.message || err);
    }
}

function pushLeadResult(el, requestId, result) {
    el.setAttribute('lead-result', JSON.stringify({ requestId, ...result, __ts: Date.now() }));
}
