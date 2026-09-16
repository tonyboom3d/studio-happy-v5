import wixLocation from 'wix-location';
import { getActivePromoCampaign } from 'backend/promoCampaignService.web.js';

// "טאפטינג + קרמיקה במתנה" promo popup (src/public/custom-elements/promo-popup.js).
// Must be added to masterPage as a Custom Element with this exact ID — see
// the install instructions at the top of promo-popup.js.
const PROMO_POPUP_ELEMENT_ID = '#promoPopup1';

// Test/preview link (only usable while enabled=false in promoCampaignConfig.js):
//   https://www.studiohappy.art/?promo=<previewToken>
const PROMO_QUERY_PARAM = 'promo';

$w.onReady(function () {
    const popupEl = $w(PROMO_POPUP_ELEMENT_ID);
    if (!popupEl) {
        // Not every page needs to log this loudly — the element only exists
        // once it's added to masterPage per the install instructions.
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
