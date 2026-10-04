/**
 * "איסוף פריט" page — customer self-service pickup scheduling.
 *
 * Editor setup required:
 *  - Page stays public/hidden from menus; the token in the URL (?token=...)
 *    is the authentication, same trade-off as עדכון מועד סדנה.lndnu.js.
 *  - Add the `pickup-scheduler` custom element (Tag Name: pickup-scheduler,
 *    source: src/public/custom-elements/pickup-scheduler.js).
 *  - This file assumes the element's ID is `#pickupScheduler1`.
 *  - Page URL must be https://www.studiohappy.art/pickup-schedule
 *    (PICKUP_PAGE_URL in http-functions.js get_startPickup).
 *
 * Flow: reads ?orderId=...&token=...&sid=... → getPickupContext →
 * pushes `context-data`; `submit-request` event ({ slotKey }) →
 * submitPickupAppointment → pushes `submit-result`.
 */
import wixLocation from 'wix-location';
import { getPickupContext, submitPickupAppointment } from 'backend/pickupSchedulingService.web.js';

const ELEMENT_ID = '#pickupScheduler1';

$w.onReady(async function () {
    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[pickup-scheduler] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const orderId = wixLocation.query?.orderId || null;
    const token = wixLocation.query?.token || null;

    if (!orderId || !token) {
        el.setAttribute('context-data', JSON.stringify({ error: true, code: 'NOT_FOUND', message: 'קישור לא תקין.', __ts: Date.now() }));
        return;
    }

    el.setAttribute('context-data', JSON.stringify({
        loading: true,
        message: 'מאמתים את הקישור וטוענים מועדי איסוף…',
        __ts: Date.now(),
    }));

    el.on('submit-request', async (event) => {
        const { slotKey } = event.detail || {};
        try {
            const result = await submitPickupAppointment(orderId, token, slotKey);
            el.setAttribute('submit-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[pickup-scheduler] submitPickupAppointment failed:', message);
            el.setAttribute('submit-result', JSON.stringify({ ok: false, code: 'ERROR', message, __ts: Date.now() }));
        }
    });

    try {
        const context = await getPickupContext(orderId, token);
        el.setAttribute('context-data', JSON.stringify({ ...context, __ts: Date.now() }));
    } catch (err) {
        const message = err?.message || String(err);
        console.error('[pickup-scheduler] getPickupContext failed:', message);
        el.setAttribute('context-data', JSON.stringify({
            error: true,
            code: 'ERROR',
            message: 'לא הצלחנו לטעון את העמוד. נסו לרענן, או בקשו קישור חדש דרך הבוט בוואטסאפ.',
            __ts: Date.now(),
        }));
    }
});
