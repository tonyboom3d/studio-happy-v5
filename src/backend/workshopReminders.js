/**
 * workshopReminders.js — customer-facing pre-workshop reminder (~48h before
 * the workshop start), for the new WorkshopOrders flow (tufting / candles /
 * ceramics). Replaces the Wix Bookings built-in SMS reminder (disabled in
 * createAndCheckout — see bookingService.web.js) with a WhatsApp Utility
 * template sent via ManyChat (see manychatService.jsw sendWorkshopReminderManyChat).
 *
 * Called hourly from jobs.js processAlertsHourly.
 *
 * WorkshopOrders CMS fields: reminderSentAt, reminderSentForStart (DATETIME).
 */
import wixData from 'wix-data';
import { sendWorkshopReminderManyChat } from 'backend/manychatService.jsw';

const SA = { suppressAuth: true };

// Reminder fires once the workshop is within this many hours of starting.
const REMINDER_WINDOW_HOURS = 48;

/**
 * Scans paid, non-cancelled WorkshopOrders whose workshopStart falls within
 * the next REMINDER_WINDOW_HOURS and sends the reminder once per order per
 * workshopStart. Idempotent via reminderSentForStart — if the order is later
 * rescheduled to a different workshopStart, the reminder is sent again once
 * the new date enters the window.
 */
export async function processCustomerWorkshopReminders(now = new Date()) {
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3600000);

    const result = await wixData.query('WorkshopOrders')
        .eq('status', 'paid')
        .gt('workshopStart', now)
        .le('workshopStart', windowEnd)
        .limit(500)
        .find(SA)
        .catch((err) => {
            console.error('[workshopReminders] query failed:', err?.message || err);
            return { items: [] };
        });

    const candidates = (result.items || []).filter((o) => !o.cancelledAt && !!o.organizerPhone);

    let sent = 0;
    let skipped = 0;

    for (const order of candidates) {
        const start = new Date(order.workshopStart);
        const alreadySentForThisStart = order.reminderSentForStart
            && new Date(order.reminderSentForStart).getTime() === start.getTime();
        if (alreadySentForThisStart) continue;

        const sendResult = await sendWorkshopReminderManyChat(order).catch((err) => {
            console.error('[workshopReminders] send failed. orderId:', order._id, err?.message || err);
            return { sent: false, reason: 'error' };
        });

        if (sendResult?.sent) {
            await wixData.update('WorkshopOrders', {
                ...order,
                reminderSentAt: now,
                reminderSentForStart: start,
            }, SA).catch((err) => {
                console.error('[workshopReminders] failed to mark order as reminded. orderId:', order._id, err?.message || err);
            });
            sent++;
        } else {
            skipped++;
        }
    }

    // if (sent || skipped) console.log(`[workshopReminders] processCustomerWorkshopReminders: sent=${sent} skipped=${skipped} scanned=${candidates.length}`);
    return { sent, skipped, scanned: candidates.length };
}
