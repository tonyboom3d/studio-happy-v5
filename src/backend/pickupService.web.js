/**
 * pickupService.web.js — "מוכן לאיסוף" / "פריט נאסף" flow (order dashboard).
 *
 * Item-level pickup state for tufting rugs / ceramics pieces is stored on
 * WorkshopOrders.pickupItems (array of { key, label, state, readyAt,
 * collectedAt, notifiedAt }) — no CMS schema for the sketches/products
 * themselves is touched. The UI (order-manager-dashboard.js) computes the
 * item catalog (key + label) per order and passes only the checked items in.
 *
 * "מוכן לאיסוף" sends exactly one WhatsApp message per action (ManyChat
 * template) covering every item marked ready in that action — see
 * sendPickupReadyManyChat in manychatService.jsw.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { getItemWithRetry } from 'backend/wixDataRetry.js';
import { sendPickupReadyManyChat } from 'backend/manychatService.jsw';
import { assertPermission, logOrderAction } from 'backend/dashboardService.web.js';
import { mergePatchWorkshopOrder } from 'backend/workshopOrderPatch.js';

function normalizeItemsInput(items) {
    return (Array.isArray(items) ? items : [])
        .map((it) => ({ key: String(it?.key || '').trim(), label: String(it?.label || '').trim() }))
        .filter((it) => it.key);
}

function mergePickupItems(existing, updates) {
    const byKey = new Map((existing || []).map((it) => [it.key, it]));
    for (const update of updates) {
        byKey.set(update.key, { ...(byKey.get(update.key) || {}), ...update });
    }
    return [...byKey.values()];
}

/**
 * Marks one or more order items as "מוכן לאיסוף" and sends a single
 * consolidated WhatsApp message to the organizer. Only persists the new
 * state if the message was actually sent — a "ready for pickup" status
 * without notifying the customer would be misleading.
 */
export const markReadyForPickup = webMethod(Permissions.SiteMember, async (orderId, items, options) => {
    await assertPermission('sendWhatsApp');

    const requestedItems = normalizeItemsInput(items);
    if (!requestedItems.length) throw new Error('NO_ITEMS_SELECTED');

    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'markReadyForPickup' });
    if (!order) throw new Error('Order not found');
    if (order.cancelledAt) throw new Error('ORDER_CANCELLED');

    const workshopStart = order.workshopStart ? new Date(order.workshopStart) : null;
    if (!workshopStart || workshopStart.getTime() > Date.now()) {
        throw new Error('WORKSHOP_NOT_ENDED:לא ניתן לסמן פריט כמוכן לאיסוף לפני שהסדנה הסתיימה.');
    }

    const now = new Date().toISOString();
    const orderForMessage = {
        ...order,
        organizerPhone: options?.organizerPhone || order.organizerPhone,
        organizerName: options?.organizerName || order.organizerName,
    };

    const result = await sendPickupReadyManyChat(orderForMessage, requestedItems.map((it) => it.label));
    if (!result?.sent) {
        await logOrderAction(
            orderId,
            `❌ הודעת "מוכן לאיסוף" (${requestedItems.map((it) => it.label).join(', ')}) לא נשלחה ל-${orderForMessage.organizerPhone || ''} (${result?.reason || 'unknown'}${result?.error ? `: ${result.error}` : ''})`,
            options?.user,
        );
        throw new Error(`שליחת הודעת "מוכן לאיסוף" נכשלה (${result?.reason || 'unknown'})`);
    }

    const updates = requestedItems.map((it) => ({
        key: it.key,
        label: it.label,
        state: 'ready',
        readyAt: now,
        notifiedAt: now,
    }));
    const pickupItems = mergePickupItems(order.pickupItems, updates);
    // pickupReadyNotifiedAt anchors the 20-day "תיאום איסוף" booking window
    // (see pickupScheduling.js) — refreshed on every new ready-notice.
    await mergePatchWorkshopOrder(orderId, { pickupItems, pickupReadyNotifiedAt: now }, 'pickupService.markReadyForPickup');

    await logOrderAction(
        orderId,
        `מוכן לאיסוף: ${requestedItems.map((it) => it.label).join(', ')} — הודעת וואטסאפ נשלחה ל-${orderForMessage.organizerPhone || ''}`,
        options?.user,
    );

    return { success: true, pickupItems };
});

/**
 * Marks one or more order items as collected. If an item was never marked
 * "ready" first, requires options.confirmedNotReady === true (the dashboard
 * shows a warning popup and retries with that flag) so staff can't silently
 * skip the notification step.
 */
export const markItemsCollected = webMethod(Permissions.SiteMember, async (orderId, items, options) => {
    await assertPermission('sendWhatsApp');

    const requestedItems = normalizeItemsInput(items);
    if (!requestedItems.length) throw new Error('NO_ITEMS_SELECTED');

    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'markItemsCollected' });
    if (!order) throw new Error('Order not found');

    const existingByKey = new Map((order.pickupItems || []).map((it) => [it.key, it]));
    const notReadyBefore = requestedItems.filter((it) => existingByKey.get(it.key)?.state !== 'ready');

    if (notReadyBefore.length && !options?.confirmedNotReady) {
        throw new Error(`NOT_READY_CONFIRMATION_REQUIRED:${notReadyBefore.map((it) => it.label).join(', ')}`);
    }

    const now = new Date().toISOString();
    const updates = requestedItems.map((it) => ({
        key: it.key,
        label: it.label,
        state: 'collected',
        collectedAt: now,
        skippedReadyStatus: existingByKey.get(it.key)?.state !== 'ready',
    }));
    const pickupItems = mergePickupItems(order.pickupItems, updates);

    // If nothing is left in "ready" state, a pending pickup-scheduling staff
    // notification (see pickupScheduling.js processPickupStaffNotifications)
    // is now moot — cancel it so no one gets pinged for an already-closed order.
    const stillHasReadyItems = pickupItems.some((it) => it.state === 'ready');
    const patch = { pickupItems };
    const cancelNotify = !stillHasReadyItems && order.pickupStaffNotifyStatus === 'pending';
    if (cancelNotify) patch.pickupStaffNotifyStatus = 'none';

    await mergePatchWorkshopOrder(orderId, patch, 'pickupService.markItemsCollected');

    const labelsLine = requestedItems.map((it) => it.label).join(', ');
    const warnSuffix = notReadyBefore.length
        ? ` — שים לב: ${notReadyBefore.map((it) => it.label).join(', ')} לא היו בסטטוס "מוכן לאיסוף" לפני כן`
        : '';
    await logOrderAction(orderId, `פריט נאסף: ${labelsLine}${warnSuffix}`, options?.user);
    if (cancelNotify) {
        await logOrderAction(orderId, 'התראת צוות לאיסוף בוטלה — כל הפריטים נאספו', options?.user);
    }

    return { success: true, pickupItems };
});
