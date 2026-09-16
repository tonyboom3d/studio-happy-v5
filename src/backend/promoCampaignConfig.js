/**
 * promoCampaignConfig.js — hardcoded settings for "טאפטינג + קרמיקה במתנה".
 *
 * Edit this file to toggle the promo, change copy, or update the preview link
 * token. No CMS collection is used for campaign settings.
 *
 * Preview URL (while enabled=false):
 *   https://www.studiohappy.art/?promo=<previewToken>
 */

/** @type {{ enabled: boolean, previewToken: string, title: string, subtitle: string, ctaText: string, ctaUrl: string, termsText: string }} */
export const PROMO_CAMPAIGN = {
    enabled: false,
    previewToken: 'studio-happy-tufting-promo',
    title: 'מבצע מיוחד 🎁 מזמינים סדנת טאפטינג – ומקבלים סדנת צביעת קרמיקה במתנה!',
    subtitle: 'עבור כל שטיח שמוזמן במסגרת סדנת הטאפטינג, מקבלים כלי קרמיקה אחד לצביעה במתנה.',
    ctaText: 'להזמנת סדנת טאפטינג',
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

/** Returns a shallow copy so callers can't mutate the shared config object. */
export function getPromoCampaign() {
    return { ...PROMO_CAMPAIGN };
}
