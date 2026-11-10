// Quote preparation: token, number, defaults, validation. Used by quotesAdmin.web.js.
import wixData from 'wix-data';
import crypto from 'crypto';
import { getQuoteSettings } from 'backend/quoteCore.js';
import { computeAmounts } from 'backend/quotePricing.js';

const SA = { suppressAuth: true, suppressHooks: true };
const DAY = 24 * 3600 * 1000;

export const newPublicToken = () => crypto.randomBytes(32).toString('base64url');

async function allocateQuoteNumber() {
    const s = await getQuoteSettings();
    if (!s) throw new Error('NOT_FOUND:שורת ההגדרות לא נמצאה.');
    const next = (Number(s.lastQuoteNumber) || 1000) + 1;
    await wixData.update('QuoteSettings', { ...s, lastQuoteNumber: next }, SA);
    return next;
}

/** Fills defaults, validates and returns the fields to persist. Throws VALIDATION:*. */
export async function buildPreparedFields(quote, templateId) {
    const s = await getQuoteSettings();
    const f = {};
    const eventDate = quote.eventDate ? new Date(quote.eventDate) : null;
    if (!eventDate) throw new Error('VALIDATION:חסר תאריך אירוע.');
    if (eventDate.getTime() < Date.now() - DAY) throw new Error('VALIDATION:תאריך האירוע עבר.');
    if (!quote.customerName) throw new Error('VALIDATION:חסר שם לקוח.');
    if (!quote.customerPhone && !quote.customerEmail) throw new Error('VALIDATION:חסר טלפון או מייל ללקוח.');
    if (!quote.eventStartTime || !quote.eventEndTime) throw new Error('VALIDATION:חסרות שעות לאירוע.');
    if (quote.eventStartTime >= quote.eventEndTime) throw new Error('VALIDATION:שעת הסיום חייבת להיות אחרי שעת ההתחלה.');
    if (!quote.allowOnlinePayment && !quote.allowBankTransfer) throw new Error('VALIDATION:יש לאפשר לפחות קבוצת תשלום אחת.');

    const amounts = computeAmounts(quote);
    if (amounts.error) throw new Error(`VALIDATION:${amounts.error}`);
    if (!(amounts.totalAmount > 0)) throw new Error('VALIDATION:הסכום הכולל חייב להיות גדול מ-0.');
    const { error, ...amountFields } = amounts;
    Object.assign(f, amountFields);

    f.expiresAt = quote.expiresAt ? new Date(quote.expiresAt)
        : new Date(Math.min(Date.now() + (Number(s?.defaultExpiryDays) || 7) * DAY, eventDate.getTime()));
    f.balanceDueDate = quote.balanceDueDate ? new Date(quote.balanceDueDate)
        : new Date(eventDate.getTime() - (Number(s?.defaultBalanceDaysBeforeEvent) || 0) * DAY);
    if (f.expiresAt > eventDate) throw new Error('VALIDATION:תוקף ההצעה חייב להיות לפני תאריך האירוע.');
    if (f.balanceDueDate > eventDate) throw new Error('VALIDATION:מועד תשלום היתרה חייב להיות עד תאריך האירוע.');

    if (!quote.publicToken) f.publicToken = newPublicToken();
    if (!quote.quoteNumber) f.quoteNumber = await allocateQuoteNumber();
    f.templateId = templateId;
    f.status = 'draft';
    return f;
}

export async function buildQuoteUrl(publicToken) {
    const s = await getQuoteSettings();
    const base = String(s?.quotePageUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('VALIDATION:לא הוגדר quotePageUrl בהגדרות.');
    return `${base}?id=${encodeURIComponent(publicToken)}`;
}

export async function resolveTemplate(templateId, eventType) {
    if (templateId) {
        const t = await wixData.get('QuoteTemplates', templateId, SA);
        if (t && t.active !== false) return t;
    }
    const byType = await wixData.query('QuoteTemplates').eq('active', true).eq('isDefault', true).eq('eventType', eventType).limit(1).find(SA);
    if (byType.items[0]) return byType.items[0];
    const any = await wixData.query('QuoteTemplates').eq('active', true).eq('isDefault', true).limit(1).find(SA);
    return any.items[0] || null;
}
