/**
 * Safe WorkshopOrders CMS updates.
 *
 * CRITICAL: wixData.update() FULLY REPLACES the row — per Wix's own SDK docs,
 * "If the existing item had properties with values and those properties were
 * not included in the specified item, the values in those properties are
 * lost." Sending `{ _id, ...fields }` with just a couple of fields WIPES
 * every other column (organizerName, organizerPhone, workshopType, status,
 * paidTotal, bookingIds, ...) down to just `_id` + those fields.
 *
 * Every write in this file therefore does a full read → merge → write, never
 * a bare partial payload.
 */
import wixData from 'wix-data';
import { getItemWithRetry } from 'backend/wixDataRetry.js';

const SA = { suppressAuth: true, consistentRead: true };

const GUARDED_FIELDS = [
    'organizerPhone',
    'organizerName',
    'bookingIds',
    'serviceId',
    'workshopType',
    'workshopStart',
    'status',
];

/**
 * Back-compat wrapper — same signature as before, but now safely merges onto
 * the full current row instead of sending a bare partial payload to
 * wixData.update() (which would wipe every other field on the row).
 */
export async function patchWorkshopOrderFields(orderId, fields, callerLabel = 'patchWorkshopOrderFields') {
    return mergePatchWorkshopOrder(orderId, fields, callerLabel);
}

/**
 * Merges `patch` onto the latest full CMS row (consistent read). Refuses the
 * write if a guarded field would be cleared compared to the stored row.
 */
export async function mergePatchWorkshopOrder(orderId, patch, callerLabel = 'mergePatchWorkshopOrder') {
    if (!orderId) throw new Error('BAD_REQUEST: missing orderId');

    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel });
    if (!order) throw new Error('NOT_FOUND: WorkshopOrders row missing');

    const merged = { ...order, ...patch, _id: order._id };

    for (const field of GUARDED_FIELDS) {
        const before = order[field];
        const after = merged[field];
        const hadValue = before != null && before !== '' && !(Array.isArray(before) && before.length === 0);
        const lostValue = after == null || after === '' || (Array.isArray(after) && after.length === 0);
        if (hadValue && lostValue) {
            console.error(`[workshopOrderPatch][${callerLabel}] blocked — would clear "${field}" on order ${orderId}`);
            throw new Error(`CMS_PATCH_UNSAFE: would clear ${field}`);
        }
    }

    return wixData.update('WorkshopOrders', merged, SA);
}
