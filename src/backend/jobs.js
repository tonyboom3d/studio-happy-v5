import wixData from 'wix-data';
import { toDateKey } from 'backend/availabilityRules.js';
import { runScheduling, processOfferEscalation } from 'backend/schedulingEngine.js';
import { processDeadlineReminders, processConfirmations } from 'backend/shiftConfirmations.js';
import { fetchEcomOrderByCheckoutId, reconcileEcomOrder } from 'backend/orderReconciliation.js';
import { ensureHolidaysSynced } from 'backend/holidayService.js';
import { flushOutbox } from 'backend/notificationOutbox.js';
import { retryPendingPrintJobs } from 'backend/studioUpsell/printDispatch.js';

const SA = { suppressAuth: true, suppressHooks: true };

const SCHEDULING_HORIZON_DAYS = 60;
const TIME_ENTRY_MAX_OPEN_HOURS = 12;
const STUCK_ORDER_MIN_AGE_MS = 20 * 60 * 1000; // 20 minutes
const STUCK_ORDER_ABANDONED_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Scheduled job (hourly, jobs.config): keeps the scheduling pipeline moving —
 * 1) expires 1h-old waiting-list offers and escalates FIFO to the next
 *    standby employee (open call + manager WhatsApp when queue is exhausted),
 * 2) re-runs the auto-scheduling engine over the coming horizon so new paid
 *    orders (higher required-instructor counts) trigger assignments/offers.
 */
export async function processSchedulingHourly() {
    const batchOpts = { batchNotify: true };
    const escalation = await processOfferEscalation(new Date(), batchOpts).catch(err => {
        console.error('[jobs] processOfferEscalation failed:', err?.message || err);
        return { expired: 0, escalated: 0 };
    });

    const now = new Date();
    const fromKey = toDateKey(now);
    const toKey = toDateKey(new Date(now.getTime() + SCHEDULING_HORIZON_DAYS * 86400000));
    const engine = await runScheduling(fromKey, toKey, batchOpts).catch(err => {
        console.error('[jobs] runScheduling failed:', err?.message || err);
        return { assigned: 0, offers: 0, openCalls: 0 };
    });

    const outbox = await flushOutbox({ force: true }).catch(err => {
        console.error('[jobs] flushOutbox failed:', err?.message || err);
        return { sent: 0, merged: 0, skipped: 0 };
    });

    console.log('[jobs] processSchedulingHourly:', JSON.stringify({ escalation, engine, outbox }));
    return { escalation, engine, outbox };
}

/**
 * Scheduled job (hourly, jobs.config) — Modules D+E:
 * 1) availability-deadline WhatsApp reminders (fires only at the configured
 *    Israel hour on the configured days before the deadline),
 * 2) 2-stage pre-workshop confirmation loop + escalation to managers,
 * 3) auto-close time entries whose clock-out was forgotten (>12h open),
 * 4) notification outbox flush — safety net for any queued messages that
 *    weren't force-flushed inline by the action that created them (e.g.
 *    rate-limited/deferred-past-quiet-hours rows from earlier in the hour).
 */
export async function processAlertsHourly() {
    const holidays = await ensureHolidaysSynced().catch(err => {
        console.error('[jobs] ensureHolidaysSynced failed:', err?.message || err);
        return { synced: [] };
    });

    const reminders = await processDeadlineReminders().catch(err => {
        console.error('[jobs] processDeadlineReminders failed:', err?.message || err);
        return { sent: 0 };
    });

    const confirmations = await processConfirmations().catch(err => {
        console.error('[jobs] processConfirmations failed:', err?.message || err);
        return { stage1: 0, stage2: 0, escalated: 0 };
    });

    const staleEntries = await autoCloseStaleTimeEntries().catch(err => {
        console.error('[jobs] autoCloseStaleTimeEntries failed:', err?.message || err);
        return { closed: 0 };
    });

    const outbox = await flushOutbox().catch(err => {
        console.error('[jobs] flushOutbox failed:', err?.message || err);
        return { sent: 0, merged: 0, skipped: 0 };
    });

    console.log('[jobs] processAlertsHourly:', JSON.stringify({ holidays, reminders, confirmations, staleEntries, outbox }));
    return { holidays, reminders, confirmations, staleEntries, outbox };
}

/** Closes TimeEntries left open longer than TIME_ENTRY_MAX_OPEN_HOURS. */
async function autoCloseStaleTimeEntries() {
    const cutoff = new Date(Date.now() - TIME_ENTRY_MAX_OPEN_HOURS * 3600000);
    const result = await wixData.query('TimeEntries')
        .isEmpty('endTime')
        .lt('startTime', cutoff)
        .limit(200).find(SA).catch(() => ({ items: [] }));

    let closed = 0;
    for (const entry of (result.items || [])) {
        const end = new Date(new Date(entry.startTime).getTime() + TIME_ENTRY_MAX_OPEN_HOURS * 3600000);
        const hours = Math.round(((end.getTime() - new Date(entry.startTime).getTime()) / 3600000) * 100) / 100;
        await wixData.update('TimeEntries', {
            ...entry,
            endTime: end,
            hours,
            notes: `${entry.notes ? entry.notes + ' | ' : ''}נסגר אוטומטית (שכחת יציאה)`,
        }, SA);
        closed++;
    }
    if (closed) console.log(`[jobs] autoCloseStaleTimeEntries: closed ${closed}`);
    return { closed };
}

function buildFailedUpgradeFields(sel) {
    return {
        upgradePaymentStatus: 'failed',
        requestedCanvasSize: null,
        upgradePaymentId: null,
        upgradePaymentRequestedAt: null,
        canvasSize: '60x60',
        previousCanvasSize: sel.previousCanvasSize || '60x60',
    };
}

/**
 * Scheduled job (configured in jobs.config to run hourly).
 *
 * Finds 90cm upgrade records still stuck in 'pending-payment-approval' more
 * than an hour after the charge attempt and marks them failed. canvasSize is
 * already stored as 60x60 until payment succeeds — this clears stale flags.
 *
 * This is the safety net in case the Wix Pay backend event (onPaymentUpdate)
 * never arrives (e.g. user abandoned the payment window).
 */
export async function expireStuckUpgradePayments() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await wixData.query('SketchSelections')
        .eq('upgradePaymentStatus', 'pending-payment-approval')
        .lt('upgradePaymentRequestedAt', oneHourAgo)
        .find(SA);

    let reverted = 0;
    for (const sel of result.items) {
        await wixData.update('SketchSelections', {
            ...sel,
            ...buildFailedUpgradeFields(sel),
        }, SA);
        reverted++;
    }

    if (reverted) {
        console.log(`[jobs] expireStuckUpgradePayments: reverted ${reverted} stuck upgrade(s) to 60x60`);
    }
    return { reverted };
}

/**
 * Scheduled job (hourly via jobs.config — Wix jobs minimum interval is 1h)
 * — safety net for the backend-first WorkshopOrders reconciliation
 * (see orderReconciliation.js).
 *
 * The wixEcom_onOrderPaymentStatusUpdated event (events.js) is the
 * authoritative, immediate trigger for writing paid status + buyer details
 * + cups onto WorkshopOrders. This job exists purely to catch the rare case
 * where that event was missed or failed (e.g. a transient error): it
 * re-checks orders stuck in 'pending_payment'/'checkout_created' for more
 * than STUCK_ORDER_MIN_AGE_MS, looks up the matching eCom order by
 * checkoutId, and reconciles it if paid — or marks it 'abandoned' after
 * STUCK_ORDER_ABANDONED_AGE_MS so genuinely dropped checkouts don't linger
 * forever as "pending" on the order-management dashboard.
 */
export async function reconcileStuckWorkshopOrders() {
    const cutoff = new Date(Date.now() - STUCK_ORDER_MIN_AGE_MS);
    const abandonedCutoff = new Date(Date.now() - STUCK_ORDER_ABANDONED_AGE_MS);

    const stuck = await wixData.query('WorkshopOrders')
        .hasSome('status', ['pending_payment', 'checkout_created'])
        .lt('_createdDate', cutoff)
        .limit(200)
        .find(SA)
        .catch((err) => {
            console.error('[jobs] reconcileStuckWorkshopOrders query failed:', err?.message || err);
            return { items: [] };
        });

    let reconciled = 0;
    let abandoned = 0;
    let stillPending = 0;

    for (const order of stuck.items || []) {
        if (!order.checkoutId) {
            stillPending++;
            continue;
        }

        const ecomOrder = await fetchEcomOrderByCheckoutId(order.checkoutId).catch((err) => {
            console.warn('[jobs] reconcileStuckWorkshopOrders: lookup failed for order', order._id, err?.message);
            return null;
        });

        if (ecomOrder) {
            const result = await reconcileEcomOrder(ecomOrder).catch((err) => {
                console.error('[jobs] reconcileStuckWorkshopOrders: reconcile failed for order', order._id, err?.message);
                return { reconciled: false };
            });
            if (result.reconciled) {
                reconciled++;
                continue;
            }
        }

        if (new Date(order._createdDate) < abandonedCutoff) {
            await wixData.update('WorkshopOrders', { ...order, status: 'abandoned' }, SA).catch((err) => {
                console.error('[jobs] reconcileStuckWorkshopOrders: failed to mark order abandoned', order._id, err?.message);
            });
            abandoned++;
        } else {
            stillPending++;
        }
    }

    if (reconciled || abandoned) {
        console.log(`[jobs] reconcileStuckWorkshopOrders: reconciled=${reconciled} abandoned=${abandoned} stillPending=${stillPending}`);
    }
    return { reconciled, abandoned, stillPending };
}

/**
 * Scheduled job (hourly via jobs.config — Wix jobs minimum interval is 1h)
 * — safety net for PrintQueue rows whose immediate dispatch (see
 * studioUpsell/printQueue.js enqueuePrintJob) didn't succeed, e.g. the
 * HSPOS broker or printer was temporarily unreachable. See
 * studioUpsell/printDispatch.js for the retry/backoff/give-up logic.
 */
export async function retryPrintQueueHourly() {
    return retryPendingPrintJobs();
}
