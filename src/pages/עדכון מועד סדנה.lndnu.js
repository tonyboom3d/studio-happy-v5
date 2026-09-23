/**
 * "עדכון מועד סדנה" page — customer self-service workshop reschedule.
 *
 * Editor setup required:
 *  - Page stays public/hidden from menus; the token in the URL (?token=...)
 *    is the authentication, same trade-off as pending-actions.wzhx6.js.
 *  - Add the `reschedule-workshop` custom element (Tag Name:
 *    reschedule-workshop, source: src/public/custom-elements/reschedule-workshop.js).
 *  - This file assumes the element's ID is `#rescheduleWorkshop1`.
 *
 * Flow: reads ?orderId=...&token=...&sid=... → getRescheduleContext →
 * pushes `context-data`; `submit-request` event (chosen date) →
 * submitRescheduleRequest → pushes `submit-result`.
 */
import wixLocation from 'wix-location';
import { getRescheduleContext, submitRescheduleRequest } from 'backend/rescheduleService.web.js';

const ELEMENT_ID = '#rescheduleWorkshop1';

$w.onReady(async function () {
    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[reschedule-workshop] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const orderId = wixLocation.query?.orderId || null;
    const token = wixLocation.query?.token || null;
    const subscriberId = wixLocation.query?.sid || null;
    const datesWorkshopFromUrl = wixLocation.query?.datesWorkshop || null;

    if (!orderId || !token) {
        el.setAttribute('context-data', JSON.stringify({ error: true, code: 'NOT_FOUND', message: 'קישור לא תקין.', __ts: Date.now() }));
        return;
    }

    el.setAttribute('context-data', JSON.stringify({
        loading: true,
        message: 'מאמתים את הקישור וטוענים תאריכים פנויים…',
        __ts: Date.now(),
    }));

    el.on('submit-request', async (event) => {
        const { chosenDateIso } = event.detail || {};
        try {
            const result = await submitRescheduleRequest(orderId, token, chosenDateIso, subscriberId);
            el.setAttribute('submit-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[reschedule-workshop] submitRescheduleRequest failed:', message);
            el.setAttribute('submit-result', JSON.stringify({ ok: false, code: 'ERROR', message, __ts: Date.now() }));
        }
    });

    async function loadContext() {
        try {
            const context = await getRescheduleContext(orderId, token);
            if (context?.error) {
                el.setAttribute('context-data', JSON.stringify({ ...context, __ts: Date.now() }));
                return;
            }
            const workshopTypeForDates = context.workshopTypeForDates || datesWorkshopFromUrl || null;
            el.setAttribute('available-slots', JSON.stringify(context.slots || []));
            el.setAttribute('context-data', JSON.stringify({
                ...context,
                workshopTypeForDates,
                datesWorkshop: datesWorkshopFromUrl,
                subscriberId,
                __ts: Date.now(),
            }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[reschedule-workshop] getRescheduleContext failed:', message);
            el.setAttribute('context-data', JSON.stringify({
                error: true,
                code: 'ERROR',
                message: 'לא הצלחנו לטעון את העמוד. נסו לרענן, או בקשו קישור חדש דרך הבוט בוואטסאפ.',
                __ts: Date.now(),
            }));
        }
    }

    await loadContext();
});
