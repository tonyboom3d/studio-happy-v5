import wixData from 'wix-data';

const RETRY_DELAY_MS = 4000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe wixData.get() with precise error logging + one retry.
 *
 * wixData.get() rejects with a generic "Item [<id>] does not exist in
 * collection [<name>]" error when the item is missing, instead of resolving
 * with null. That error carries no context about which backend function
 * triggered it, making it near-impossible to trace from the site logs alone.
 *
 * This wrapper:
 * 1. Tags every log line with `callerLabel` (the calling function/flow) plus
 *    the collection + itemId, so the exact source is obvious in the logs.
 * 2. On failure, waits RETRY_DELAY_MS (4s) and retries ONCE more — both
 *    attempts use consistentRead: true, to ride out eventual-consistency lag
 *    right after a write (e.g. reading an order milliseconds after it was
 *    inserted/updated on a different node).
 * Resolves to null (never throws) once the item is confirmed missing after
 * both attempts — callers keep using their existing `if (!item) ...` checks.
 */
export async function getItemWithRetry(collectionId, itemId, options = {}) {
    const { callerLabel = 'unknown', suppressAuth = true } = options;
    if (!itemId) return null;

    const getOptions = { suppressAuth, consistentRead: true };

    try {
        return await wixData.get(collectionId, itemId, getOptions);
    } catch (firstErr) {
        console.warn(
            `[wixDataRetry][${callerLabel}] attempt 1/2 failed — collection="${collectionId}" itemId="${itemId}": ${firstErr?.message || firstErr}. Retrying in ${RETRY_DELAY_MS}ms (consistentRead=true)...`
        );

        await sleep(RETRY_DELAY_MS);

        try {
            return await wixData.get(collectionId, itemId, getOptions);
        } catch (secondErr) {
            console.error(
                `[wixDataRetry][${callerLabel}] attempt 2/2 FAILED — item does not exist (or is unreachable) after retry. collection="${collectionId}" itemId="${itemId}": ${secondErr?.message || secondErr}`
            );
            return null;
        }
    }
}
