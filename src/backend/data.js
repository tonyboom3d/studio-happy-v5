import wixData from 'wix-data';
import { sendOrderConfirmationWhatsApp } from 'backend/whatsappService.jsw';
import { processBookingPaid } from 'backend/schedulingEngine.js';

const SA = { suppressAuth: true, suppressHooks: true };

/**
 * WorkshopOrders afterUpdate hook — sends WhatsApp confirmation when:
 * 1. Status changes to 'paid' (new order confirmed)
 * 2. resendWhatsApp field is set to true (manual resend trigger)
 *
 * The hook fires server-side on every CMS update to WorkshopOrders,
 * so it works regardless of which code path triggered the update.
 *
 * Date fields (workshopStart) are stored as ISO UTC strings like
 * "2026-08-21T01:00:00.000Z" — the WhatsApp service uses Intl with
 * timeZone: 'Asia/Jerusalem' to display the correct local time
 * (handles both winter/summer DST automatically).
 */
export function WorkshopOrders_afterUpdate(item, context) {
    const previousItem = context.currentItem;

    const justPaid = item.status === 'paid' && previousItem.status !== 'paid';
    const resendRequested = item.resendWhatsApp === true && previousItem.resendWhatsApp !== true;

    if (!justPaid && !resendRequested) return item;

    // Dynamic staff assignment (Module B/C): the moment an order is paid,
    // check whether the day's workshop now needs instructors and assign a
    // pending employee (>24h out) or request their confirmation (<24h out).
    if (justPaid) {
        processBookingPaid(item)
            .then(report => {
                if (report?.handled) console.log('[data.js hook] processBookingPaid:', item._id, JSON.stringify(report));
            })
            .catch(err => {
                console.error('[data.js hook] processBookingPaid failed. orderId:', item._id, 'error:', err?.message || err);
            });
    }

    if (!item.organizerPhone) {
        console.warn('[data.js hook] Skipping WhatsApp — no organizerPhone. orderId:', item._id);
        return item;
    }

    const reason = justPaid ? 'status changed to paid' : 'resendWhatsApp triggered';
    console.log(`[data.js hook] Sending WhatsApp (${reason}). orderId:`, item._id, 'phone:', item.organizerPhone);

    sendOrderConfirmationWhatsApp(item)
        .then(() => {
            console.log('[data.js hook] WhatsApp sent successfully. orderId:', item._id);
            if (resendRequested) {
                return wixData.update('WorkshopOrders', {
                    ...item,
                    resendWhatsApp: false,
                }, SA);
            }
        })
        .catch(err => {
            console.error('[data.js hook] WhatsApp send failed. orderId:', item._id, 'error:', err?.message || err);
        });

    return item;
}