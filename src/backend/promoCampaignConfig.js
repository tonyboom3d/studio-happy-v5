/**
 * promoCampaignConfig.js — hardcoded settings for "טאפטינג + קרמיקה במתנה".
 *
 * Edit this file to toggle the promo, change copy, or update the preview link
 * token. No CMS collection is used for campaign settings.
 *
 * Preview URL (while enabled=false):
 *   https://www.studiohappy.art/?promo=<previewToken>
 *
 * Share URL (popup + terms open):
 *   https://www.studiohappy.art/?promo=<previewToken>&terms=1
 *
 * Popup UI: wix/custom-code/promo-popup-standalone.html (Wix Custom Code — keep
 * CONFIG in sync when you edit copy/enabled/previewToken here).
 */

/** @type {{ enabled: boolean, endsAt: string, previewToken: string, discountPerRugNis: number, title: string, subtitle: string, ctaText: string, ctaUrl: string, termsText: string }} */
export const PROMO_CAMPAIGN = {
    enabled: true,
    /** Fixed NIS discount per tufting rug — total coupon = rugCount × discountPerRugNis. */
    discountPerRugNis: 170,
    /** Israel time — promo stops at Nov 1 00:00 (end of Oct 31). */
    endsAt: '2026-11-01T00:00:00+03:00',
    previewToken: 'studio-happy-tufting-promo',
    title: '🔥 מבצע חד פעמי - לזמן מוגבל!',
    subtitle: 'על כל שטיח שקונים בסדנת הטאפטינג — מקבלים סדנת צביעת קרמיקה בחינם! המבצע מסתיים בסוף אוקטובר ומספר המקומות מוגבל.',
    ctaText: '← להזמנה עכשיו לפני שייגמר!',
    ctaUrl: 'https://www.studiohappy.art/booking-flow-tufting',
    termsText: [
        '• סדנת צביעת הקרמיקה במתנה הינה באורך של עד שעה.',
        '• עבור כל שטיח שמוזמן במסגרת סדנת הטאפטינג, מקבלים כלי קרמיקה אחד לצביעה במתנה.',
        '• המבצע תקף למימוש בימים א׳–ה׳ בלבד, כולל ימי חול המועד סוכות.',
        '• לאחר הזמנת סדנת הטאפטינג יישלח ללקוח קוד קופון אישי במייל וב-WhatsApp.',
        '• הקופון הינו אישי, חד-פעמי ואינו ניתן להעברה.',
        '• ניתן לממש את הקופון עד 6 חודשים ממועד הזמנת סדנת הטאפטינג.',
        '• הקופון ניתן למימוש רק לאחר ההשתתפות בפועל בסדנת הטאפטינג.',
        '• במקרה של ביטול סדנת הטאפטינג או אי-הגעה, הקופון יבוטל.',
        '• במקרה של שינוי מועד סדנת הטאפטינג, מועד המימוש יתעדכן לתאריך הסדנה החדש.',
        '• מימוש ההטבה כפוף לזמינות המקומות בסדנאות ולביצוע הזמנה מראש.',
        '• הקופון אינו ניתן להמרה לכסף או לזיכוי.',
    ].join('\n'),
};

function isPromoExpired(endsAt) {
    if (!endsAt) return false;
    return Date.now() >= new Date(endsAt).getTime();
}

/** Returns a shallow copy; `enabled` is false after `endsAt`. */
export function getPromoCampaign() {
    const expired = isPromoExpired(PROMO_CAMPAIGN.endsAt);
    return {
        ...PROMO_CAMPAIGN,
        enabled: PROMO_CAMPAIGN.enabled && !expired,
        expired,
    };
}
