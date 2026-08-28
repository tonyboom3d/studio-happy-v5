// Admin Management Page for the in-person QR add-on upsell system.
// Bridges the `studio-upsell-admin` custom element to
// backend/studioUpsellService.web.js (all calls gated by the
// manageAddOnsSystem permission — see backend/staffRoles.js).
import {
    getUpsellAdminData,
    saveAddOn,
    deleteAddOn,
    saveUpsellSettings,
    listAddOnTransactions,
    listPrintQueue,
    markPrintJobStatus,
} from 'backend/studioUpsellService.web.js';

const ELEMENT_ID = '#studioUpsellAdmin1';

$w.onReady(function () {
    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[studio-upsell-admin][velo] ELEMENT_NOT_FOUND — ${ELEMENT_ID} missing on page`);
        return;
    }

    el.on('studio-upsell-admin-action', (event) => {
        handleAction(el, event.detail).catch((err) => {
            console.error('[studio-upsell-admin][velo] action error:', err?.message || err);
            const message = err?.message || String(err);
            if (message.startsWith('ACCESS_DENIED') || message.startsWith('PERMISSION_DENIED')) {
                pushData(el, event.detail?.type, event.detail?.requestId, { error: 'ACCESS_DENIED' });
            }
        });
    });
});

function pushData(el, type, requestId, result) {
    el.setAttribute('admin-data', JSON.stringify({ type, requestId, result, __ts: Date.now() }));
}

async function handleAction(el, detail) {
    const { type, requestId, payload } = detail || {};
    if (!type) return;

    switch (type) {
        case 'load': {
            const result = await getUpsellAdminData();
            pushData(el, type, requestId, result);
            return;
        }
        case 'saveAddOn': {
            await saveAddOn(payload);
            pushData(el, type, requestId, { success: true });
            return;
        }
        case 'deleteAddOn': {
            await deleteAddOn(payload?.addOnId);
            pushData(el, type, requestId, { success: true });
            return;
        }
        case 'saveSettings': {
            await saveUpsellSettings(payload);
            pushData(el, type, requestId, { success: true });
            return;
        }
        case 'loadTransactions': {
            const result = await listAddOnTransactions(payload || {});
            pushData(el, type, requestId, result);
            return;
        }
        case 'loadPrintQueue': {
            const result = await listPrintQueue();
            pushData(el, type, requestId, result);
            return;
        }
        case 'markPrintJobStatus': {
            await markPrintJobStatus(payload?.printQueueId, payload?.status);
            pushData(el, type, requestId, { success: true });
            return;
        }
        default:
            console.warn('[studio-upsell-admin][velo] Unknown studio-upsell-admin-action type:', type);
    }
}
