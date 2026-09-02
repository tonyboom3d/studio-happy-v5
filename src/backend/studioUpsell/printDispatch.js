/**
 * studioUpsell/printDispatch.js — sends PrintQueue rows to the mqtt-bridge
 * Cloudflare Worker's /print-receipt endpoint, tracking status/attempts/
 * errorMessage on the row. Called two ways:
 *   1) immediately from printQueue.js enqueuePrintJob (fast path)
 *   2) hourly from jobs.js retryPrintQueueHourly -> retryPendingPrintJobs
 *      (safety net — Wix scheduled jobs have a 1h minimum interval, see
 *      jobs.config, so this is a coarse backstop, not a fast retry loop)
 *
 * Idempotency: automatic retries reuse ticketId `PQ_{rowId}` so a false
 * negative (timeout / unconfirmed) never causes a double physical print —
 * the HSPOS printer ignores duplicate ticket IDs. Manual "הדפס מחדש" from
 * the admin dashboard passes forceNewTicket to append a unique suffix instead.
 *
 * Status model — 4 outcomes, not 2:
 *   - 'printed'      the Worker got a `PrintSucces` ack from the printer
 *                     itself (see mqtt-bridge/src/mqttClient.js) — the only
 *                     status that actually confirms paper came out.
 *   - 'unconfirmed'   the Worker's MQTT PUBLISH was accepted by the broker
 *                     (QoS 2 handshake completed) but no printer ack arrived
 *                     in time. This does NOT mean it failed — the broker
 *                     accepting a publish only proves broker delivery, never
 *                     physical output — it means "we genuinely don't know".
 *                     Retried automatically (safe: same ticketId every time).
 *   - 'failed'        a real error: render/network/broker/auth failure, or
 *                     'unconfirmed' that exhausted MAX_ATTEMPTS.
 *   - 'printing'      transient — set synchronously before the network call.
 */
import wixData from 'wix-data';
import wixSecretsBackend from 'wix-secrets-backend';

const SA = { suppressAuth: true };

// Create this secret in the Wix Secrets Manager (Business Manager -> Settings
// -> Secrets Manager) with the same value as mqtt-bridge/.bridge-secret.txt
// (the Cloudflare Worker's BRIDGE_SECRET, set via `wrangler secret put`).
const BRIDGE_SECRET_NAME = 'mqttBridgeSecret';
const WORKER_URL = 'https://hspos-mqtt-bridge.tonyboom3d.workers.dev/print-receipt';
const FETCH_TIMEOUT_MS = 25000; // raster render + MQTT round trip observed up to ~10-15s, occasionally longer with broker retries
export const MAX_ATTEMPTS = 5;
const STUCK_PRINTING_MS = 10 * 60 * 1000; // a row left 'printing' this long means the previous attempt's process died mid-flight

/**
 * Per-workshop-type/business printer override hook. Single studio, single
 * printer today (Worker falls back to its own DEFAULT_PRINTER), but the
 * Worker already accepts a per-request `printer: {host,port,username,
 * password,topic,logoUrl,businessName}` override — wire a lookup here
 * (e.g. by payload.workshopTitle or a future PrinterConfig collection) if a
 * second business/printer is ever added, without touching the rest of this
 * module.
 */
function resolvePrinterConfig(_row) {
    return undefined;
}

function buildReceiptBody(row, { forceNewTicket = false } = {}) {
    const p = row.payload || {};
    const ticketId = forceNewTicket
        ? `PQ_${row._id}_R${Date.now()}`
        : `PQ_${row._id}`;
    return {
        buyerName: p.buyerName || '',
        payerName: p.payerName || undefined,
        orderNumber: p.orderNumber || '(ללא מספר)',
        dateTime: p.paidAt ? new Date(p.paidAt).toLocaleString('he-IL') : undefined,
        workshopName: p.workshopTitle || '',
        staffName: p.staffApprovedByName || undefined,
        items: (p.items || []).map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
        total: p.total,
        amountPaid: p.amountPaid ?? p.total,
        paymentMethod: p.paymentMethod || undefined,
        qrUrl: p.qrUrl || undefined,
        ticketId,
        printer: resolvePrinterConfig(row),
    };
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function markFailed(row, message) {
    const attempts = (Number(row.attempts) || 0) + 1;
    console.error(`[studioUpsell/printDispatch] print job ${row._id} failed (attempt ${attempts}/${MAX_ATTEMPTS}):`, message);
    if (attempts >= MAX_ATTEMPTS) {
        console.error(`[studioUpsell/printDispatch] print job ${row._id} reached MAX_ATTEMPTS — giving up; staff must reprint manually from the admin dashboard.`);
    }
    return wixData.update('PrintQueue', {
        ...row,
        status: 'failed',
        attempts,
        confirmed: false,
        errorMessage: String(message).slice(0, 500),
        lastAttemptAt: new Date(),
    }, SA).catch((err) => {
        console.error('[studioUpsell/printDispatch] failed to persist failure state:', err?.message || err);
        return null;
    });
}

/** Broker accepted the publish, but no printer ack — see status model above. */
async function markUnconfirmed(row) {
    const attempts = (Number(row.attempts) || 0) + 1;
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'unconfirmed';
    console.warn(`[studioUpsell/printDispatch] print job ${row._id}: sent but no printer ack (attempt ${attempts}/${MAX_ATTEMPTS}) -> ${status}`);
    return wixData.update('PrintQueue', {
        ...row,
        status,
        attempts,
        confirmed: false,
        errorMessage: status === 'failed'
            ? 'לא התקבל אישור הדפסה מהמדפסת - יתכן שהודפס בפועל, יש לבדוק מול הדפסה פיזית'
            : null,
        lastAttemptAt: new Date(),
    }, SA).catch((err) => {
        console.error('[studioUpsell/printDispatch] failed to persist unconfirmed state:', err?.message || err);
        return null;
    });
}

/**
 * Dispatches a single PrintQueue row to the Worker. Marks the row 'printing'
 * synchronously before the network call — a concurrency guard so the hourly
 * retry job and an admin's manual "reprint" can't race on the same row.
 */
export async function dispatchPrintJob(row, { forceNewTicket = false } = {}) {
    if (!row?._id) return { success: false, error: 'missing_row' };

    await wixData.update('PrintQueue', { ...row, status: 'printing', lastAttemptAt: new Date() }, SA).catch((err) => {
        console.error('[studioUpsell/printDispatch] failed to mark row printing:', err?.message || err);
    });

    let secret;
    try {
        secret = await wixSecretsBackend.getSecret(BRIDGE_SECRET_NAME);
    } catch (err) {
        return markFailed(row, `Secrets Manager error: ${err?.message || err}`);
    }
    if (!secret) {
        return markFailed(row, `Secret "${BRIDGE_SECRET_NAME}" not configured in Wix Secrets Manager`);
    }

    try {
        const res = await fetchWithTimeout(`${WORKER_URL}?token=${encodeURIComponent(secret)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildReceiptBody(row, { forceNewTicket })),
        }, FETCH_TIMEOUT_MS);

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
            return markFailed(row, data?.error || `HTTP ${res.status}`);
        }

        if (data.confirmed === false) {
            return markUnconfirmed(row);
        }

        return await wixData.update('PrintQueue', {
            ...row,
            status: 'printed',
            confirmed: true,
            printedAt: new Date(),
            errorMessage: null,
        }, SA);
    } catch (err) {
        return markFailed(row, err?.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : (err?.message || String(err)));
    }
}

/**
 * Hourly safety net (see jobs.js retryPrintQueueHourly / jobs.config) for
 * anything the immediate dispatch didn't get through — the printer/broker
 * blipping is common (observed repeatedly during manual testing). Retries
 * 'pending'/'failed' rows under MAX_ATTEMPTS, plus any 'printing' row stuck
 * long enough to mean its original request died mid-flight. Rows that hit
 * MAX_ATTEMPTS stay 'failed' permanently — visible in Wix logs and the admin
 * dashboard's failed badge; staff reprint manually from there.
 */
export async function retryPendingPrintJobs() {
    const result = await wixData.query('PrintQueue')
        .hasSome('status', ['pending', 'printing', 'failed', 'unconfirmed'])
        .lt('attempts', MAX_ATTEMPTS)
        .limit(100)
        .find(SA)
        .catch((err) => {
            console.error('[studioUpsell/printDispatch] retryPendingPrintJobs query failed:', err?.message || err);
            return { items: [] };
        });

    let retried = 0;
    let gaveUp = 0;
    for (const row of result.items || []) {
        if (row.status === 'printing') {
            const stuckForMs = row.lastAttemptAt ? Date.now() - new Date(row.lastAttemptAt).getTime() : Infinity;
            if (stuckForMs < STUCK_PRINTING_MS) continue; // likely still in-flight from a very recent immediate dispatch
        }

        await dispatchPrintJob(row);
        retried++;
        if ((Number(row.attempts) || 0) + 1 >= MAX_ATTEMPTS) gaveUp++;
    }

    if (retried) console.log(`[jobs] retryPendingPrintJobs: retried=${retried} nearingLimit=${gaveUp}`);
    return { retried, gaveUp };
}
