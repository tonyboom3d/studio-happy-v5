/**
 * promoCampaignService.web.js — public web module for the site-wide promo
 * popup (see src/public/custom-elements/promo-popup.js + masterPage.js).
 *
 * The real `previewToken` never reaches the client: the browser sends back
 * whatever it read from the `?promo=` URL query param, and this method only
 * ever returns a boolean `show` + the campaign content — never the token
 * itself — so it can't be guessed by inspecting network responses.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { getPromoCampaign } from 'backend/promoCampaignConfig.js';

export const getActivePromoCampaign = webMethod(Permissions.Anyone, async (previewTokenFromUrl) => {
    const campaign = getPromoCampaign();

    const content = {
        title: campaign.title,
        subtitle: campaign.subtitle,
        ctaText: campaign.ctaText,
        ctaUrl: campaign.ctaUrl,
        termsText: campaign.termsText,
    };

    if (campaign.expired) {
        return { show: false };
    }

    if (campaign.enabled) {
        return { show: true, ...content };
    }

    const token = String(previewTokenFromUrl || '').trim();
    const matches = !!token && !!campaign.previewToken && token === campaign.previewToken;
    if (matches) {
        return { show: true, preview: true, ...content };
    }

    return { show: false };
});
