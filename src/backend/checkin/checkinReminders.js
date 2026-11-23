/**
 * checkin/checkinReminders.js — nudges customers who haven't self-checked-in
 * yet via a dedicated WhatsApp (ManyChat) template once they're within
 * ±10 minutes of their workshop start. Idempotent via
 * WorkshopOrders.checkinReminderSentAt — never sends twice per order.
 *
 * Called 3x/hour from jobs.js (see jobs.js / jobs.config for why there are 3
 * entries instead of 1 — Wix's native scheduler has a 1h-per-function
 * minimum, so 3 functions at :00/:20/:40 approximate the 20-minute window).
 */
import wixData from 'wix-data';
import { sendCheckinReminderManyChat } from 'backend/manychatService.jsw';
import { isCheckinAllowedForPhone } from './checkinConfig.js';

const SA = { suppressAuth: true };
const REMINDER_WINDOW_MIN = 10;

export async function processCheckinReminders(now = new Date()) {
    const windowMs = REMINDER_WINDOW_MIN * 60000;

    const result = await wixData.query('WorkshopOrders')
        .eq('status', 'paid')
        .isEmpty('checkedInAt')
        .isEmpty('checkinReminderSentAt')
        .gt('workshopStart', new Date(now.getTime() - windowMs))
        .le('workshopStart', new Date(now.getTime() + windowMs))
        .limit(200)
        .find(SA)
        .catch((err) => {
            console.error('[checkin/checkinReminders] query failed:', err?.message || err);
            return { items: [] };
        });

    const candidates = (result.items || []).filter((o) => !o.cancelledAt && !!o.organizerPhone);

    let sent = 0;
    let skipped = 0;

    for (const order of candidates) {
        const allowed = await isCheckinAllowedForPhone(order.organizerPhone).catch(() => false);
        if (!allowed) { skipped++; continue; }

        const sendResult = await sendCheckinReminderManyChat(order).catch((err) => {
            console.error('[checkin/checkinReminders] send failed. orderId:', order._id, err?.message || err);
            return { sent: false };
        });

        if (sendResult?.sent) {
            await wixData.update('WorkshopOrders', { ...order, checkinReminderSentAt: now }, SA).catch((err) => {
                console.error('[checkin/checkinReminders] failed to mark order reminded. orderId:', order._id, err?.message || err);
            });
            sent++;
        } else {
            skipped++;
        }
    }

    // if (sent || skipped) console.log(`[checkin/checkinReminders] processCheckinReminders: sent=${sent} skipped=${skipped} scanned=${candidates.length}`);
    return { sent, skipped, scanned: candidates.length };
}
