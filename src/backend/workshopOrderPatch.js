/**
 * Safe WorkshopOrders CMS updates — reschedule + actionLog paths must never
 * replace a full row with a partial object (wixData.update return values are
 * not guaranteed to include every field).
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
 * Updates only the listed top-level fields on an existing row (_id required).
 * Use for rescheduleToken / expiresAt — never load-spread-write the whole item.
 */
export async function patchWorkshopOrderFields(orderId, fields, callerLabel = 'patchWorkshopOrderFields') {
    if (!orderId) throw new Error('BAD_REQUEST: missing orderId');
    const payload = { _id: orderId, ...fields };
    return wixData.update('WorkshopOrders', payload, SA);
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
