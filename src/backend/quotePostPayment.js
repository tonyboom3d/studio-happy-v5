// After a quote payment is marked paid: calendar block + overlap alert (first payment), staff, customer email + WhatsApp. Never throws.
import wixData from 'wix-data';
import { writeQuoteLog } from 'backend/quoteLog.js';
import { blockQuoteCalendar, findWorkshopOverlaps, quoteWindow } from 'backend/quoteCalendar.js';
import { notifyManagers, quoteVars, sendQuotePaidEmail, sendQuotePaidManyChat } from 'backend/quoteNotify.js';
import { syncStaffNotifications } from 'backend/quoteStaffNotify.js';

const SA = { suppressAuth: true, suppressHooks: true };
const SYSTEM = { type: 'system', name: 'מערכת', userId: '' };
const STAGE_LABELS = { deposit: 'מקדמה', full: 'תשלום מלא', balance: 'יתרה' };

async function blockAndCheck(quote) {
    const v = quoteVars(quote);
    const managerVars = { eventTime: v.eventTime, workshopName: v.workshopName, eventMode: v.eventMode, participants: v.participants };
    const res = await blockQuoteCalendar(quote);
    if (res.eventId) {
        quote = await wixData.update('Quotes', { ...quote, calendarEventId: res.eventId, calendarBlockedAt: new Date() }, SA);
        await writeQuoteLog(quote._id, 'calendar_blocked', { eventId: res.eventId, window: quoteWindow(quote) }, SYSTEM);
    } else {
        await writeQuoteLog(quote._id, 'calendar_block_failed', { error: res.error || '' }, SYSTEM);
        await notifyManagers('manager_quote_conflict', quote, { ...managerVars, overlapCount: '0', detail: 'חסימת היומן נכשלה – יש לחסום ידנית ביומן.' });
    }

    const overlaps = await findWorkshopOverlaps(quote);
    if (!overlaps.length) return quote;
    quote = await wixData.update('Quotes', { ...quote, conflicts: overlaps.map((o) => ({ key: o.key, summary: o.summary, title: o.title, start: o.start, end: o.end, booked: o.booked, remaining: o.remaining })) }, SA);
    await writeQuoteLog(quote._id, 'conflict_detected', { overlaps: overlaps.map((o) => o.summary) }, SYSTEM);
    const sent = await notifyManagers('manager_quote_conflict', quote, {
        ...managerVars,
        overlapCount: String(overlaps.length),
        detail: overlaps.map((o) => o.summary).join('\n'),
    });
    await writeQuoteLog(quote._id, 'conflict_alert_sent', { managers: sent }, SYSTEM);
    return quote;
}

/** row = the QuotePayments row that just became paid. Call after recomputePaymentState. */
export async function onQuotePaid(quoteId, row = {}) {
    try {
        let quote = await wixData.get('Quotes', quoteId, SA);
        if (!quote || quote.status === 'cancelled') return;
        if (!quote.calendarEventId) quote = await blockAndCheck(quote);
        quote = await syncStaffNotifications(quote);

        const payment = { amount: row.amount, stageLabel: STAGE_LABELS[row.stage] || row.stage || '' };
        const email = await sendQuotePaidEmail(quote, payment);
        if (email.sent) await writeQuoteLog(quoteId, 'paid_email_sent', { stage: row.stage, amount: row.amount }, SYSTEM);
        else if (email.reason !== 'no-email') console.warn('[quotePostPayment] paid email not sent:', email.reason, email.error || '');
        const wa = await sendQuotePaidManyChat(quote, payment);
        if (wa.sent) await writeQuoteLog(quoteId, 'paid_whatsapp_sent', { stage: row.stage, amount: row.amount }, SYSTEM);
    } catch (err) {
        console.error('[quotePostPayment] failed:', quoteId, err?.message || err);
    }
}
