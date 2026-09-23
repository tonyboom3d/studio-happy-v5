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
import { getCourseSessions } from 'backend/bookingService.web.js';
import { WORKSHOP_SERVICE_IDS, resolveWorkshopType } from 'backend/workshopServiceIds.js';

const ELEMENT_ID = '#rescheduleWorkshop1';
const MAX_LOOKAHEAD_DAYS = 365;

async function getRescheduleSlots(context) {
    const workshopKey = resolveWorkshopType(context.workshopTypeForDates || context.workshopType);
    const serviceIds = WORKSHOP_SERVICE_IDS[workshopKey];
    if (!serviceIds) return [];

    const start = new Date();
    const end = new Date(start.getTime() + MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    try {
        return await getCourseSessions(start, end, serviceIds);
    } catch (err) {
        console.error('[reschedule-workshop] getCourseSessions failed:', err?.message || err);
        return [];
    }
}

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

    el.on('submit-request', async (event) => {
        const { chosenDateIso } = event.detail || {};
        try {
            const result = await submitRescheduleRequest(orderId, token, chosenDateIso);
            el.setAttribute('submit-result', JSON.stringify({ ok: true, ...result, __ts: Date.now() }));
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[reschedule-workshop] submitRescheduleRequest failed:', message);
            el.setAttribute('submit-result', JSON.stringify({ ok: false, message, __ts: Date.now() }));
        }
    });

    async function loadContext() {
        try {
            const context = await getRescheduleContext(orderId, token);
            const workshopTypeForDates = context.workshopTypeForDates || datesWorkshopFromUrl || null;
            const slots = await getRescheduleSlots({ ...context, workshopTypeForDates });
            el.setAttribute('available-slots', JSON.stringify(slots));
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
            const code = message.split(':')[0]?.trim() || 'ERROR';
            el.setAttribute('context-data', JSON.stringify({ error: true, code, message, __ts: Date.now() }));
        }
    }

    await loadContext();
});
