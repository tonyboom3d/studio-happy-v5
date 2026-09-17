import wixLocation from 'wix-location';
import { getActivePromoCampaign } from 'backend/promoCampaignService.web.js';

// "טאפטינג + קרמיקה במתנה" promo popup (src/public/custom-elements/promo-popup.js).
// Must be added to masterPage as a Custom Element with this exact ID — see
// the install instructions at the top of promo-popup.js.
const PROMO_POPUP_ELEMENT_ID = '#promoPopup1';

// Test/preview link (only usable while enabled=false in promoCampaignConfig.js):
//   https://www.studiohappy.art/?promo=<previewToken>
const PROMO_QUERY_PARAM = 'promo';

/** Custom Elements expose setAttribute(); other Wix types (Box, HtmlComponent, etc.) do not. */
function resolvePromoPopupElement() {
    const candidate = $w(PROMO_POPUP_ELEMENT_ID);
    if (typeof candidate?.setAttribute === 'function') {
        return candidate;
    }
    return null;
}

$w.onReady(function () {
    const popupEl = resolvePromoPopupElement();
    if (!popupEl) {
        console.warn(
            '[masterPage] promo-popup: element',
            PROMO_POPUP_ELEMENT_ID,
            'is missing or is not a Custom Element (setAttribute unavailable).',
            'Add a Custom Element with tag "promo-popup", ID promoPopup1, source promo-popup.js — see promo-popup.js install notes.',
        );
        return;
    }

    const previewToken = wixLocation.query?.[PROMO_QUERY_PARAM] || '';

    getActivePromoCampaign(previewToken)
        .then((campaign) => {
            popupEl.setAttribute('campaign-data', JSON.stringify(campaign || { show: false }));
        })
        .catch((err) => {
            console.error('[masterPage] getActivePromoCampaign failed:', err?.message || err);
        });
});
