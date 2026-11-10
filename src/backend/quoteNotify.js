// Outbound quote notifications: customer email (Triggered Email) + manager alerts. Never throws.
import { contacts, triggeredEmails } from 'wix-crm-backend';
import { sendEmployeeTemplateToManagers } from 'backend/employeeTemplates.js';
import { buildQuoteUrl } from 'backend/quoteBuilder.js';

const QUOTE_EMAIL_TEMPLATE_ID = 'VaYNbMG'; // must be Published
const ISRAEL_TZ = 'Asia/Jerusalem';

export const fmtDateHe = (d) => (d ? new Date(d).toLocaleDateString('he-IL', { timeZone: ISRAEL_TZ }) : '');

/** Variables: customerFullName, customerPhone, customerEmail, offerUrl. */
export async function sendQuoteEmail(quote) {
    try {
        if (!quote?.customerEmail) return { sent: false, reason: 'no-email' };
        const parts = String(quote.customerName || '').trim().split(/\s+/);
        const res = await contacts.appendOrCreateContact({
            name: { first: parts[0] || '', last: parts.slice(1).join(' ') },
            emails: [{ email: quote.customerEmail }],
            phones: quote.customerPhone ? [{ phone: `+${String(quote.customerPhone).replace(/\D/g, '')}` }] : [],
        });
        if (!res?.contactId) return { sent: false, reason: 'no-contact-id' };
        await triggeredEmails.emailContact(QUOTE_EMAIL_TEMPLATE_ID, res.contactId, {
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

/** keys: manager_quote_conflict | manager_quote_signed | manager_quote_transfer_proof | manager_quote_paid */
export async function notifyManagers(actionKey, quote, extra = {}) {
    try {
        const vars = {
            customerName: quote.customerName || '',
            eventDate: fmtDateHe(quote.eventDate),
            quoteNumber: String(quote.quoteNumber ?? ''),
            totalAmount: String(quote.totalAmount ?? ''),
            ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v ?? '')])),
        };
        return await sendEmployeeTemplateToManagers(actionKey, vars);
    } catch (err) {
        console.error('[quoteNotify] manager alert failed:', actionKey, err?.message || err);
        return 0;
    }
}
