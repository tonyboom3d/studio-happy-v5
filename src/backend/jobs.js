import wixData from 'wix-data';
import { toDateKey } from 'backend/availabilityRules.js';
import { runScheduling, processOfferEscalation } from 'backend/schedulingEngine.js';

const SA = { suppressAuth: true, suppressHooks: true };

const SCHEDULING_HORIZON_DAYS = 60;

/**
 * Scheduled job (hourly, jobs.config): keeps the scheduling pipeline moving —
 * 1) expires 1h-old waiting-list offers and escalates FIFO to the next
 *    standby employee (open call + manager WhatsApp when queue is exhausted),
 * 2) re-runs the auto-scheduling engine over the coming horizon so new paid
 *    orders (higher required-instructor counts) trigger assignments/offers.
 */
export async function processSchedulingHourly() {
    const escalation = await processOfferEscalation().catch(err => {
        console.error('[jobs] processOfferEscalation failed:', err?.message || err);
        return { expired: 0, escalated: 0 };
    });

    const now = new Date();
    const fromKey = toDateKey(now);
    const toKey = toDateKey(new Date(now.getTime() + SCHEDULING_HORIZON_DAYS * 86400000));
    const engine = await runScheduling(fromKey, toKey).catch(err => {
        console.error('[jobs] runScheduling failed:', err?.message || err);
        return { assigned: 0, offers: 0, openCalls: 0 };
    });

    console.log('[jobs] processSchedulingHourly:', JSON.stringify({ escalation, engine }));
    return { escalation, engine };
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
