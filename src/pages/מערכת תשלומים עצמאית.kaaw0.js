// QR Customer Landing Page — in-person add-on upsell system.
// Bridges the `studio-upsell` custom element (src/public/custom-elements/studio-upsell.js)
// to backend/studioUpsellService.web.js, and hands off to the Wix-hosted
// checkout page with a redirect to the dedicated Thank You page on completion.
import wixEcomFrontend from 'wix-ecom-frontend';
import {
    getStaffOptions,
    staffLogin,
    lookupByPhone,
    getAddOnCatalogForWorkshop,
    verifyOpenAmountCode,
    createAddOnCheckoutRequest,
} from 'backend/studioUpsellService.web.js';

const ELEMENT_ID = '#studioUpsell1';

// TODO: confirm these live URLs against the actual published page paths once
// the pages are published (Wix page URLs don't always match the file name).
const THANK_YOU_PAGE_URL = 'https://www.studiohappy.art/דף-תודה-מערכת-תשלומים-עצמאית';
const QR_LANDING_URL = 'https://www.studiohappy.art/self-payments';

$w.onReady(function () {
    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[studio-upsell][velo] ELEMENT_NOT_FOUND — ${ELEMENT_ID} missing on page`);
        return;
    }

    el.on('studio-upsell-action', (event) => {
        handleAction(el, event.detail).catch((err) => {
            console.error('[studio-upsell][velo] action error:', err?.message || err);
            pushError(el, event.detail?.type, event.detail?.requestId, err?.message || String(err));
        });
    });
});

function pushData(el, type, requestId, result) {
    el.setAttribute('upsell-data', JSON.stringify({ type, requestId, result, __ts: Date.now() }));
}

function pushError(el, type, requestId, message) {
    el.setAttribute('upsell-error', JSON.stringify({ type, requestId, message, __ts: Date.now() }));
}

async function handleAction(el, detail) {
    const { type, requestId, payload } = detail || {};
    if (!type) return;

    switch (type) {
        case 'getStaffOptions': {
            const result = await getStaffOptions();
            pushData(el, type, requestId, result);
            return;
        }
        case 'staffLogin': {
            const result = await staffLogin(payload?.pin, payload?.staffId);
            pushData(el, type, requestId, result);
            return;
        }
        case 'lookupByPhone': {
            const result = await lookupByPhone(payload?.phone);
            pushData(el, type, requestId, result);
            return;
        }
        case 'getAddOnCatalogForWorkshop': {
            const result = await getAddOnCatalogForWorkshop(payload?.workshopTypeId, payload?.customerPhone, payload?.scope);
            pushData(el, type, requestId, result);
            return;
        }
        case 'verifyOpenAmountCode': {
            const result = await verifyOpenAmountCode(payload?.workshopTypeId, payload?.code, payload?.staffId);
            pushData(el, type, requestId, result);
            return;
        }
        case 'checkout': {
            const result = await createAddOnCheckoutRequest(payload);
            if (!result?.success) {
                pushData(el, type, requestId, result);
                return;
            }

            // overrideThankYouPageUrl is the correct mechanism for the post-payment
            // redirect (NOT overrideCheckoutUrl, which only affects abandoned-checkout
            // recovery links). {orderId} is replaced by Wix with the resulting eCom order id.
            const thankYouUrl = `${THANK_YOU_PAGE_URL}?t=${encodeURIComponent(result.confirmationToken)}&orderId={orderId}`;

            try {
                await wixEcomFrontend.navigateToCheckoutPage(result.checkoutId, {
                    skipDeliveryStep: true,
                    hideContinueBrowsingButton: false,
                    overrideContinueBrowsingUrl: QR_LANDING_URL,
                    overrideThankYouPageUrl: thankYouUrl,
                });
            } catch (err) {
                console.error('[studio-upsell][velo] navigateToCheckoutPage failed:', err?.message || err);
                pushData(el, type, requestId, { success: false, error: 'לא ניתן היה לעבור למסך התשלום.' });
            }
            return;
        }
        default:
            console.warn('[studio-upsell][velo] Unknown studio-upsell-action type:', type);
    }
}
