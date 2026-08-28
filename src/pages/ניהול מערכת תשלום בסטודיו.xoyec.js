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
    if (typeof el.on !== 'function') {
        // Happens when the ID on the page isn't bound to a real Custom Element
        // (wrong element type, or the "Tag Name" / ID don't match what's
        // documented at the top of custom-elements/studio-upsell-admin.js).
        console.error(
            `[studio-upsell-admin][velo] ELEMENT_NOT_CUSTOM_ELEMENT — ${ELEMENT_ID} was found but has no ` +
            `".on" method. Verify it's a "Custom Element" component with Tag Name "studio-upsell-admin" and ID "studioUpsellAdmin1".`
        );
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
