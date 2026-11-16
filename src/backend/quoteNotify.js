// Outbound quote notifications: customer email (Triggered Email) + manager alerts. Never throws.
import { contacts, triggeredEmails } from 'wix-crm-backend';
import { sendEmployeeTemplateMessage, sendEmployeeTemplateToManagers } from 'backend/employeeTemplates.js';
import { buildQuoteUrl } from 'backend/quoteBuilder.js';

const QUOTE_EMAIL_TEMPLATE_ID = 'VaYNbMG'; // must be Published
const QUOTE_PAID_EMAIL_TEMPLATE_ID = ''; // payment confirmation email; must be Published
const ISRAEL_TZ = 'Asia/Jerusalem';

export const fmtDateHe = (d) => (d ? new Date(d).toLocaleDateString('he-IL', { timeZone: ISRAEL_TZ }) : '');
const fmtMoney = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('he-IL');

/** Shared event/payment vars for customer + staff messages. */
export function quoteVars(quote) {
    const total = Number(quote.totalAmount) || 0;
    const paid = Number(quote.paidAmount) || 0;
    const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
    return {
        customerName: quote.customerName || '',
        quoteNumber: String(quote.quoteNumber ?? ''),
        eventDate: fmtDateHe(quote.eventDate),
        eventTime: [quote.eventStartTime, quote.eventEndTime].filter(Boolean).join('–'),
        workshopName: quote.requestedWorkshop || '',
        eventMode: quote.workshopClosed ? 'סדנה סגורה' : 'סדנה פתוחה',
        participants: String(quote.participants ?? ''),
        eventAddress: [quote.eventLocation, quote.eventAddress].filter(Boolean).join(', '),
        totalAmount: fmtMoney(total),
        paidAmount: fmtMoney(paid),
        balanceAmount: fmtMoney(balance),
        balanceDueDate: fmtDateHe(quote.balanceDueDate),
        isFullyPaid: balance <= 0 ? 'כן' : 'לא',
        paymentSummary: balance <= 0
            ? 'ההזמנה שולמה במלואה.'
            : `נותרה יתרה של ${fmtMoney(balance)} ₪ לתשלום${quote.balanceDueDate ? ` עד ${fmtDateHe(quote.balanceDueDate)}` : ''}.`,
    };
}

async function quoteContactId(quote) {
    const parts = String(quote.customerName || '').trim().split(/\s+/);
    const res = await contacts.appendOrCreateContact({
        name: { first: parts[0] || '', last: parts.slice(1).join(' ') },
        emails: [{ email: quote.customerEmail }],
        phones: quote.customerPhone ? [{ phone: `+${String(quote.customerPhone).replace(/\D/g, '')}` }] : [],
    });
    return res?.contactId || '';
}

/**
 * Payment confirmation email. Variables: customerName, quoteNumber, amountPaid, paymentStage, paidAmount,
 * totalAmount, balanceAmount, balanceDueDate, paymentSummary, eventDate, eventTime, workshopName, participants, downloadUrl.
 */
export async function sendQuotePaidEmail(quote, payment = {}) {
    try {
        if (!QUOTE_PAID_EMAIL_TEMPLATE_ID) return { sent: false, reason: 'no-template-id' };
        if (!quote?.customerEmail) return { sent: false, reason: 'no-email' };
        const contactId = await quoteContactId(quote);
        if (!contactId) return { sent: false, reason: 'no-contact-id' };
        const v = quoteVars(quote);
        await triggeredEmails.emailContact(QUOTE_PAID_EMAIL_TEMPLATE_ID, contactId, {
            variables: {
                customerName: v.customerName || 'לקוח/ה יקר/ה',
                quoteNumber: v.quoteNumber,
                amountPaid: fmtMoney(payment.amount),
                paymentStage: payment.stageLabel || '',
                paidAmount: v.paidAmount,
                totalAmount: v.totalAmount,
                balanceAmount: v.balanceAmount,
                balanceDueDate: v.balanceDueDate,
                paymentSummary: v.paymentSummary,
                eventDate: v.eventDate,
                eventTime: v.eventTime,
                workshopName: v.workshopName,
                participants: v.participants,
                downloadUrl: await buildQuoteUrl(quote.publicToken),
            },
        });
        return { sent: true };
    } catch (err) {
        console.error('[quoteNotify] paid email failed:', err?.message || err);
        return { sent: false, reason: 'error', error: err?.message || String(err) };
    }
}

/** Variables: customerFullName, customerPhone, customerEmail, offerUrl. */
export async function sendQuoteEmail(quote) {
    try {
        if (!quote?.customerEmail) return { sent: false, reason: 'no-email' };
        const contactId = await quoteContactId(quote);
        if (!contactId) return { sent: false, reason: 'no-contact-id' };
        await triggeredEmails.emailContact(QUOTE_EMAIL_TEMPLATE_ID, contactId, {
            variables: {
                customerFullName: quote.customerName || 'לקוח/ה יקר/ה',
                customerPhone: String(quote.customerPhone || '').replace(/^972/, '0'),
                customerEmail: quote.customerEmail,
                offerUrl: await buildQuoteUrl(quote.publicToken),
            },
        });
        return { sent: true };
    } catch (err) {
        console.error('[quoteNotify] email failed:', err?.message || err);
        return { sent: false, reason: 'error', error: err?.message || String(err) };
    }
}

/** ManyChat skips empty values (stale field would remain), so blanks become '—'. */
export const manyChatVars = (vars) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v ?? '').trim() || '—']));

/** action_key customer_quote_paid on the staff flow (audience 'customer'). */
export async function sendQuotePaidManyChat(quote, payment = {}) {
    try {
        const vars = manyChatVars({
            ...quoteVars(quote),
            amount: fmtMoney(payment.amount),
            stage: payment.stageLabel || '',
            quoteLink: await buildQuoteUrl(quote.publicToken),
        });
        const sent = await sendEmployeeTemplateMessage('customer_quote_paid', quote.customerPhone, vars, 'customer');
        return { sent };
    } catch (err) {
        console.error('[quoteNotify] paid ManyChat failed:', err?.message || err);
        return { sent: false, reason: 'error', error: err?.message || String(err) };
    }
}

/** keys: manager_quote_conflict | manager_quote_signed | manager_quote_transfer_proof | manager_quote_paid */
export async function notifyManagers(actionKey, quote, extra = {}) {
    try {
        const vars = manyChatVars({
            customerName: quote.customerName || '',
            eventDate: fmtDateHe(quote.eventDate),
            eventTime: [quote.eventStartTime, quote.eventEndTime].filter(Boolean).join('–'),
            quoteNumber: String(quote.quoteNumber ?? ''),
            totalAmount: String(quote.totalAmount ?? ''),
            ...extra,
        });
        return await sendEmployeeTemplateToManagers(actionKey, vars);
    } catch (err) {
        console.error('[quoteNotify] manager alert failed:', actionKey, err?.message || err);
        return 0;
    }
}
