/**
 * "אישור לאיסוף פריטים" page — staff-only pickup handover (QR target).
 *
 * Editor setup required:
 *  - Page URL: /pickup-confirm, set to "Members only" (staff log in).
 *  - Add the `pickup-confirm` custom element (Tag Name: pickup-confirm,
 *    source: src/public/custom-elements/pickup-confirm.js), element ID
 *    `#pickupConfirm1`.
 *
 * Flow: reads ?orderId=...&pass=... → getPickupScanContext (members only,
 * needs viewDashboard) → pushes `context-data`; `confirm-handover` event
 * ({ code }) → confirmPickupHandoverScan → pushes `handover-result`.
 */
import wixLocation from 'wix-location';
import { authentication } from 'wix-members-frontend';
import { getPickupScanContext, confirmPickupHandoverScan } from 'backend/pickupSchedulingService.web.js';

const ELEMENT_ID = '#pickupConfirm1';

$w.onReady(async function () {
    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[pickup-confirm] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const orderId = wixLocation.query?.orderId || null;
    const pass = wixLocation.query?.pass || null;

    const setContext = (payload) => el.setAttribute('context-data', JSON.stringify({ ...payload, __ts: Date.now() }));

    if (!orderId || !pass) {
        setContext({ error: true, code: 'NOT_FOUND', message: 'קוד לא תקין.' });
        return;
    }

    async function loadScan() {
        setContext({ loading: true, message: 'טוענים את פרטי ההזמנה…' });
        try {
            setContext(await getPickupScanContext(orderId, pass));
        } catch (err) {
            console.error('[pickup-confirm] getPickupScanContext failed:', err?.message || err);
            setContext({ error: true, code: 'ERROR', message: 'לא הצלחנו לטעון את העמוד. נסו לרענן.' });
        }
    }

    el.on('login-request', async () => {
        try {
            await authentication.promptLogin({ mode: 'login', modal: true });
            await loadScan();
        } catch (err) {
            console.warn('[pickup-confirm] promptLogin cancelled/failed:', err?.message || err);
        }
    });

    el.on('confirm-handover', async (event) => {
        const { code } = event.detail || {};
        try {
            const result = await confirmPickupHandoverScan(orderId, pass, code);
            el.setAttribute('handover-result', JSON.stringify({ ...result, __ts: Date.now() }));
        } catch (err) {
            console.error('[pickup-confirm] confirmPickupHandoverScan failed:', err?.message || err);
            el.setAttribute('handover-result', JSON.stringify({ ok: false, code: 'ERROR', message: 'האישור נכשל. נסו שוב.', __ts: Date.now() }));
        }
    });

    // Show a login screen first, then open the login window. A camera/QR
    // browser often never draws the modal if we wait on it before any UI.
    if (!authentication.loggedIn()) {
        setContext({ error: true, code: 'ACCESS_DENIED', message: 'נדרשת התחברות של עובד כדי לאשר את האיסוף.' });
        try {
            await authentication.promptLogin({ mode: 'login', modal: true });
        } catch (err) {
            console.warn('[pickup-confirm] promptLogin cancelled/failed:', err?.message || err);
            return;
        }
        if (!authentication.loggedIn()) return;
    }

    await loadScan();
});
