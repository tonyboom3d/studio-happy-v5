// Dedicated Thank You / Confirmation page for the in-person add-on upsell
// system (reached via overrideThankYouPageUrl from the QR landing page's
// checkout). Bridges the `studio-upsell-confirmation` custom element to
// backend/studioUpsellService.web.js.
import wixLocation from 'wix-location';
import { confirmAddOnOrder, getAddOnOrderSummary, approveAddOnOrder } from 'backend/studioUpsellService.web.js';

const ELEMENT_ID = '#studioUpsellThanks1';

$w.onReady(function () {
    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[studio-upsell-thanks][velo] ELEMENT_NOT_FOUND — ${ELEMENT_ID} missing on page`);
        return;
    }

    const token = wixLocation.query?.t || null;
    const orderId = wixLocation.query?.orderId || null;

    if (!token) {
        console.error('[studio-upsell-thanks][velo] Missing "t" (confirmation token) query param.');
    }

    el.on('studio-upsell-thanks-action', (event) => {
        handleAction(el, event.detail, token, orderId).catch((err) => {
            console.error(
                `[studio-upsell-thanks][velo] action error — type=${event.detail?.type}, token=${token}, orderId=${orderId}:`,
                err?.stack || err?.message || err,
            );
            pushError(el, event.detail?.type, event.detail?.requestId, err?.message || String(err));
        });
    });
});

function pushData(el, type, requestId, result) {
    el.setAttribute('thanks-data', JSON.stringify({ type, requestId, result, __ts: Date.now() }));
}

function pushError(el, type, requestId, message) {
    el.setAttribute('thanks-error', JSON.stringify({ type, requestId, message, __ts: Date.now() }));
}

async function handleAction(el, detail, token, orderId) {
    const { type, requestId } = detail || {};
    if (!token) {
        pushError(el, type, requestId, 'חסר מזהה הזמנה בכתובת הדף (t) — לא ניתן לאתר את פרטי ההזמנה.');
        return;
    }

    if (type === 'confirm') {
        // Best-effort acceleration — the authoritative write happens via the
        // eCom webhook in events.js. This just speeds up the UI when the
        // webhook has already landed by the time the customer sees this page.
        const result = await confirmAddOnOrder(token, orderId);
        pushData(el, type, requestId, result);
        return;
    }

    if (type === 'summary') {
        const result = await getAddOnOrderSummary(token);
        pushData(el, type, requestId, result);
        return;
    }

    if (type === 'approve') {
        // Employee looked at the customer's screen and typed the staff PIN.
        const result = await approveAddOnOrder(token, detail?.payload?.code);
        pushData(el, type, requestId, result);
        return;
    }
}
