/**
 * studioUpsell/inventory.js — optional per-add-on stock tracking + the
 * "maxQuantity per customer" cap.
 *
 * Add-ons default to unmanaged (unlimited) stock. An admin can switch one to
 * managed stock (see the admin "מלאי" tab) — every paid purchase then
 * decrements stockQuantity, and an out-of-stock WhatsApp alert can be sent
 * to managers (ManyChat) once it hits 0.
 *
 * The 'perCustomer' quantity cap is scoped to ONE workshop session, not to
 * the customer's lifetime: a customer who used up their allowance at today's
 * workshop is capped there, but starts fresh at their next workshop.
 */
import wixData from 'wix-data';
import { getPhoneLookupVariants } from 'backend/orderUtils.js';
import { sendEmployeeTemplateToManagers } from 'backend/employeeTemplates.js';

const SA = { suppressAuth: true };
const SESSION_START_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * True when a past add-on order belongs to the same workshop session as
 * `scope`. Matched by sessionId or workshopOrderId when available, else by
 * workshop type + (near-)identical start time — mirroring identify.js.
 */
function matchesWorkshopScope(order, scope) {
    if (!scope) return true;
    const { sessionId, workshopOrderId, workshopTypeId, workshopStart } = scope;

    if (sessionId && order.sessionId && order.sessionId === sessionId) return true;
    if (workshopOrderId && order.workshopOrderId && order.workshopOrderId === workshopOrderId) return true;

    if (workshopTypeId && workshopStart && order.workshopTypeId === workshopTypeId && order.workshopStart) {
        const diff = Math.abs(new Date(order.workshopStart).getTime() - new Date(workshopStart).getTime());
        if (Number.isFinite(diff) && diff < SESSION_START_TOLERANCE_MS) return true;
    }

    return false;
}

/**
 * Sums paid quantities of one add-on already bought by this customer for the
 * given workshop session — used for maxQuantityMode 'perCustomer'.
 *
 * @param {string} addOnId
 * @param {string} customerPhone
 * @param {{sessionId?:string, workshopOrderId?:string, workshopTypeId?:string, workshopStart?:string|Date}} [scope]
 *   Omit to count across every session (unscoped).
 */
export async function getPurchasedQuantityForCustomer(addOnId, customerPhone, scope) {
    if (!addOnId || !customerPhone) return 0;
    const variants = getPhoneLookupVariants(customerPhone);
    if (!variants.length) return 0;

    let total = 0;
    const seenOrderIds = new Set();
    for (const variant of variants) {
        const result = await wixData.query('StudioAddOnOrders')
            .eq('customerPhone', variant)
            .eq('status', 'paid')
            .limit(200)
            .find(SA);
        for (const order of (result.items || [])) {
            if (seenOrderIds.has(order._id)) continue;
            seenOrderIds.add(order._id);
            if (!matchesWorkshopScope(order, scope)) continue;
            for (const item of (order.items || [])) {
                if (item.id === addOnId) total += Number(item.quantity) || 0;
            }
        }
    }
    return total;
}

/**
 * Decrements stock for every managed add-on in a just-paid order and sends
 * a one-time out-of-stock WhatsApp alert to managers when stock hits 0 (if
 * the add-on opted in). Never throws — a failure here must never block order
 * confirmation.
 */
export async function applyInventoryForPaidOrder(addOnOrder) {
    const items = addOnOrder?.items || [];
    for (const item of items) {
        if (!item?.id || !(Number(item.quantity) > 0)) continue;
        try {
            const addOn = await wixData.get('StudioAddOns', item.id, SA);
            if (!addOn || !addOn.inventoryManaged) continue;

            const nextStock = Math.max(0, (Number(addOn.stockQuantity) || 0) - Number(item.quantity));
            const justRanOut = nextStock <= 0 && !addOn.outOfStockNotifiedAt;

            await wixData.update('StudioAddOns', {
                ...addOn,
                stockQuantity: nextStock,
                outOfStockNotifiedAt: justRanOut ? new Date() : addOn.outOfStockNotifiedAt,
            }, SA);

            if (justRanOut && addOn.notifyOutOfStock) {
                await sendEmployeeTemplateToManagers('addon_out_of_stock', {
                    addOnTitle: addOn.title || 'תוסף',
                    workshopTitle: addOnOrder.workshopTitle || '',
                    remainingStock: nextStock,
                });
            }
        } catch (err) {
            console.error('[studioUpsell/inventory] applyInventoryForPaidOrder failed for item', item?.id, err?.message || err);
        }
    }
}
