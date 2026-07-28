import wixData from 'wix-data';
import { sendOrderConfirmationWhatsApp } from 'backend/whatsappService.jsw';

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