/**
 * studioUpsellService.web.js — public facade for the QR in-person add-on
 * upsell system. Thin webMethod wrappers over backend/studioUpsell/* helpers,
 * following the same Permissions.Anyone (kiosk) + Permissions.SiteMember
 * (admin dashboard, gated by manageAddOnsSystem) split used by
 * bookingService.web.js / dashboardService.web.js.
 */
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { assertEmployeeAccess } from 'backend/staffRoles.js';
import { getTodaySessions } from 'backend/studioUpsell/sessions.js';
import { findTodayWorkshopsByPhone } from 'backend/studioUpsell/identify.js';
import { getAddOnCatalog, verifyOpenAmountPassword } from 'backend/studioUpsell/catalog.js';
import { createAddOnCheckout } from 'backend/studioUpsell/checkout.js';
import { confirmAddOnOrderByToken, getAddOnOrderByToken, approveStaffOnAddOnOrder } from 'backend/studioUpsell/reconcile.js';
import { uploadBase64ImageToWixMedia, wixMediaToPublicUrl } from 'backend/studioUpsell/mediaUpload.js';
import { hasPrintJob } from 'backend/studioUpsell/printQueue.js';
import { dispatchPrintJob } from 'backend/studioUpsell/printDispatch.js';

const SA = { suppressAuth: true };

// Hardcoded per product decision — staff open the kiosk with this PIN plus
// their own name (pulled from Dashboard_Roles), matching the existing
// MASTER_OTP pattern in bookingService.web.js.
const STAFF_PIN = '1326';

// ---------------------------------------------------------------------------
// Customer / staff QR kiosk — Permissions.Anyone (no site-member login there)
// ---------------------------------------------------------------------------

/** Active staff names for the PIN-login staff picker — first name only, per product decision. */
export const getStaffOptions = webMethod(Permissions.Anyone, async () => {
    const result = await wixData.query('Dashboard_Roles').eq('active', true).find(SA);
    return (result.items || [])
        .filter((r) => r.displayName)
        .map((r) => ({ id: r._id, firstName: String(r.displayName).trim().split(/\s+/)[0] }))
        .sort((a, b) => a.firstName.localeCompare(b.firstName, 'he'));
});

/** Staff bypass: PIN + selected staff name -> today's active workshops, skipping phone identification. */
export const staffLogin = webMethod(Permissions.Anyone, async (pin, staffId) => {
    if (String(pin || '').trim() !== STAFF_PIN) {
        return { valid: false, reason: 'wrong_pin' };
    }

    let staffName = null;
    if (staffId) {
        const role = await wixData.get('Dashboard_Roles', staffId, SA).catch(() => null);
        staffName = role?.displayName ? String(role.displayName).trim().split(/\s+/)[0] : null;
    }

    const sessions = await getTodaySessions();
    return { valid: true, staffName, sessions };
});

/** Customer identification: phone -> matching same-day workshop(s). */
export const lookupByPhone = webMethod(Permissions.Anyone, async (phone) => {
    const matches = await findTodayWorkshopsByPhone(phone);
    return { matches };
});

/**
 * Add-on catalog + upsell settings (open amount, staff code, print toggle) for a
 * workshop type. `scope` identifies the workshop session, so a 'perCustomer'
 * add-on already bought for that session comes back flagged as unavailable.
 */
export const getAddOnCatalogForWorkshop = webMethod(Permissions.Anyone, async (workshopTypeId, customerPhone, scope) => {
    return getAddOnCatalog(workshopTypeId, customerPhone, scope);
});

/** Staff-entered code + staff picker to unlock the "open amount" payment option. */
export const verifyOpenAmountCode = webMethod(Permissions.Anyone, async (workshopTypeId, code, staffId) => {
    const pinOk = await verifyOpenAmountPassword(workshopTypeId, code);
    if (!pinOk) return { valid: false, reason: 'wrong_pin' };

    // When password gate is off, verifyOpenAmountPassword returns true without a code —
    // no staff picker needed in that case (the modal never opens).
    const settingsRow = await wixData.query('StudioUpsellSettings').eq('workshopType', workshopTypeId).find(SA);
    if (!settingsRow.items?.[0]?.openAmountPasswordEnabled) {
        return { valid: true, staffName: null };
    }

    if (!staffId) return { valid: false, reason: 'missing_staff' };
    const role = await wixData.get('Dashboard_Roles', staffId, SA).catch(() => null);
    if (!role?.active || !role?.displayName) return { valid: false, reason: 'invalid_staff' };
    const staffName = String(role.displayName).trim().split(/\s+/)[0];
    return { valid: true, staffName };
});

/** Creates the @wix/ecom checkout (digital-only line items) and logs the StudioAddOnOrders row. */
export const createAddOnCheckoutRequest = webMethod(Permissions.Anyone, async (payload) => {
    try {
        return { success: true, ...(await createAddOnCheckout(payload || {})) };
    } catch (err) {
        console.error('[studioUpsellService] createAddOnCheckoutRequest failed:', err?.message || err);
        return { success: false, error: err?.message || String(err) };
    }
});

/** Adds client-only derived fields — never persisted, just for display. */
async function enrichOrderForClient(order) {
    if (!order) return order;
    return { ...order, receiptQueued: await hasPrintJob(order._id) };
}

/**
 * Thank You page: best-effort acceleration of the paid status (authoritative
 * path is the eCom webhook — see events.js). Errors are logged with full
 * detail here AND rethrown (rather than swallowed to `null`) so the Velo
 * page / CE can tell a genuine failure apart from "not paid yet" and show
 * the customer an actual error instead of spinning forever.
 */
export const confirmAddOnOrder = webMethod(Permissions.Anyone, async (token, ecomOrderIdHint) => {
    try {
        return await enrichOrderForClient(await confirmAddOnOrderByToken(token, ecomOrderIdHint));
    } catch (err) {
        console.error(`[studioUpsellService] confirmAddOnOrder failed — token=${token}, ecomOrderIdHint=${ecomOrderIdHint}:`, err?.stack || err?.message || err);
        throw new Error(err?.message || 'confirmAddOnOrder failed');
    }
});

/** Thank You page: read the current state of an add-on order (for polling while the webhook catches up). */
export const getAddOnOrderSummary = webMethod(Permissions.Anyone, async (token) => {
    try {
        return await enrichOrderForClient(await getAddOnOrderByToken(token));
    } catch (err) {
        console.error(`[studioUpsellService] getAddOnOrderSummary failed — token=${token}:`, err?.stack || err?.message || err);
        throw new Error(err?.message || 'getAddOnOrderSummary failed');
    }
});

/**
 * Thank You page: an employee looks at the customer's screen, types the staff
 * PIN and picks their name — this enqueues the print job for workshop types
 * with "showStaffCode" (staff-approval) turned on.
 */
export const approveAddOnOrder = webMethod(Permissions.Anyone, async (token, code, staffId) => {
    if (String(code || '').trim() !== STAFF_PIN) {
        return { success: false, reason: 'wrong_pin' };
    }
    if (!staffId) {
        return { success: false, reason: 'missing_staff' };
    }
    try {
        const addOnOrder = await getAddOnOrderByToken(token);
        if (!addOnOrder) return { success: false, reason: 'not_found' };
        if (addOnOrder.status !== 'paid') return { success: false, reason: 'not_paid' };

        const role = await wixData.get('Dashboard_Roles', staffId, SA).catch(() => null);
        if (!role?.active || !role?.displayName) {
            return { success: false, reason: 'invalid_staff' };
        }
        const staffName = String(role.displayName).trim().split(/\s+/)[0];

        const updated = await approveStaffOnAddOnOrder(addOnOrder, { staffId, staffName });
        return { success: true, order: await enrichOrderForClient(updated) };
    } catch (err) {
        console.error(`[studioUpsellService] approveAddOnOrder failed — token=${token}:`, err?.stack || err?.message || err);
        throw new Error(err?.message || 'approveAddOnOrder failed');
    }
});

// ---------------------------------------------------------------------------
// Admin management page — Permissions.SiteMember, gated by manageAddOnsSystem
// ---------------------------------------------------------------------------

export const getUpsellAdminData = webMethod(Permissions.SiteMember, async () => {
    await assertEmployeeAccess('manageAddOnsSystem');

    const [workshopsResult, addOnsResult, settingsResult] = await Promise.all([
        wixData.query('workshops').find(SA),
        wixData.query('StudioAddOns').ascending('sortOrder').find(SA),
        wixData.query('StudioUpsellSettings').find(SA),
    ]);

    return {
        workshopTypes: (workshopsResult.items || []).map((w) => ({ id: w._id, title: w.workshopName || 'סדנה' })),
        // `image` stays the canonical wix:// value (round-trips correctly on save);
        // `imagePreviewUrl` is a derived https URL for <img> thumbnails only.
        addOns: (addOnsResult.items || []).map((a) => ({ ...a, imagePreviewUrl: wixMediaToPublicUrl(a.image) || a.image || null })),
        settings: settingsResult.items || [],
    };
});

export const saveAddOn = webMethod(Permissions.SiteMember, async (addOn) => {
    await assertEmployeeAccess('manageAddOnsSystem');

    if (addOn?._id) {
        const existing = await wixData.get('StudioAddOns', addOn._id, SA);
        if (!existing) throw new Error('Add-on not found');
        const merged = { ...existing, ...addOn };
        if (addOn.maxQuantity !== undefined) merged.maxQuantity = Number(addOn.maxQuantity) || 10;
        if (addOn.maxQuantityMode !== undefined) merged.maxQuantityMode = addOn.maxQuantityMode === 'perCustomer' ? 'perCustomer' : 'perOrder';
        if (addOn.stockQuantity !== undefined) {
            merged.stockQuantity = Math.max(0, Number(addOn.stockQuantity) || 0);
            // Manager restocked above 0 -> allow a fresh out-of-stock alert next time it runs out.
            if (merged.stockQuantity > 0) merged.outOfStockNotifiedAt = null;
        }
        if (addOn.generalCategoryId !== undefined) {
            merged.generalCategoryId = addOn.generalCategoryId ? String(addOn.generalCategoryId) : null;
        }
        return wixData.update('StudioAddOns', merged, SA);
    }

    return wixData.insert('StudioAddOns', {
        title: addOn?.title || '',
        description: addOn?.description || '',
        price: Number(addOn?.price) || 0,
        image: addOn?.image || null,
        workshopType: addOn?.workshopType,
        active: addOn?.active !== false,
        sortOrder: Number(addOn?.sortOrder) || 0,
        maxQuantity: Number(addOn?.maxQuantity) || 10,
        maxQuantityMode: addOn?.maxQuantityMode === 'perCustomer' ? 'perCustomer' : 'perOrder',
        inventoryManaged: !!addOn?.inventoryManaged,
        stockQuantity: addOn?.inventoryManaged ? Math.max(0, Number(addOn?.stockQuantity) || 0) : null,
        notifyOutOfStock: !!addOn?.notifyOutOfStock,
        outOfStockNotifiedAt: null,
        generalCategoryId: addOn?.generalCategoryId ? String(addOn.generalCategoryId) : null,
    }, SA);
});

export const deleteAddOn = webMethod(Permissions.SiteMember, async (addOnId) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    return wixData.remove('StudioAddOns', addOnId, SA);
});

/** Uploads an add-on image to the Wix Media Manager — returns the canonical wix:// fileUrl + a public preview URL. */
export const uploadAddOnImage = webMethod(Permissions.SiteMember, async (base64, filename) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    return uploadBase64ImageToWixMedia(base64, filename);
});

export const saveUpsellSettings = webMethod(Permissions.SiteMember, async (settings) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    if (!settings?.workshopType) throw new Error('workshopType is required');

    const openAmountPassword = settings.openAmountPassword != null ? String(settings.openAmountPassword).trim() : '';
    const generalCategories = settings.generalCategories != null
        ? (typeof settings.generalCategories === 'string'
            ? settings.generalCategories
            : JSON.stringify(Array.isArray(settings.generalCategories) ? settings.generalCategories : []))
        : undefined;

    const existing = await wixData.query('StudioUpsellSettings').eq('workshopType', settings.workshopType).find(SA);
    if (existing.items?.[0]) {
        const patch = { ...existing.items[0], ...settings, openAmountPassword };
        if (generalCategories !== undefined) patch.generalCategories = generalCategories;
        return wixData.update('StudioUpsellSettings', patch, SA);
    }

    return wixData.insert('StudioUpsellSettings', {
        workshopType: settings.workshopType,
        active: settings.active !== false,
        allowOpenAmount: !!settings.allowOpenAmount,
        openAmountLabel: settings.openAmountLabel || 'סכום פתוח',
        openAmountMin: Number(settings.openAmountMin) || 0,
        openAmountMax: settings.openAmountMax != null && settings.openAmountMax !== '' ? Number(settings.openAmountMax) : null,
        openAmountPasswordEnabled: !!settings.openAmountPasswordEnabled,
        openAmountPassword,
        showStaffCode: !!settings.showStaffCode,
        printOnPayment: settings.printOnPayment !== false,
        generalCategories: generalCategories || '[]',
        catalogDefaultVisibleCount: Number(settings.catalogDefaultVisibleCount) || 0,
        catalogCollapsedByDefault: !!settings.catalogCollapsedByDefault,
    }, SA);
});

/** filters: { status, workshopTypeId, dateFrom, dateTo, addOnId } — addOnId matches inside the `items` array, applied in-memory (wix-data can't filter nested array fields). */
export const listAddOnTransactions = webMethod(Permissions.SiteMember, async (filters) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    let query = wixData.query('StudioAddOnOrders').descending('_createdDate').limit(200);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.workshopTypeId) query = query.eq('workshopTypeId', filters.workshopTypeId);
    if (filters?.dateFrom) query = query.ge('_createdDate', new Date(filters.dateFrom));
    if (filters?.dateTo) query = query.le('_createdDate', new Date(filters.dateTo));

    const result = await query.find(SA);
    let items = result.items || [];
    if (filters?.addOnId) {
        items = items.filter((t) => Array.isArray(t.items) && t.items.some((i) => i.id === filters.addOnId));
    }
    return items;
});

export const listPrintQueue = webMethod(Permissions.SiteMember, async () => {
    await assertEmployeeAccess('manageAddOnsSystem');
    const result = await wixData.query('PrintQueue').descending('_createdDate').limit(100).find(SA);
    return result.items || [];
});

/**
 * Admin fallback for orders that were paid but the customer never showed the
 * Thank You page to an employee (so the code was never entered there). No
 * code needed here — the caller is already an authenticated, permission-gated
 * manager. Also enqueues the print job, same as the Thank You page path.
 */
export const approveAddOnOrderAdmin = webMethod(Permissions.SiteMember, async (addOnOrderId) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    const addOnOrder = await wixData.get('StudioAddOnOrders', addOnOrderId, SA);
    if (!addOnOrder) throw new Error('Order not found');
    return approveStaffOnAddOnOrder(addOnOrder);
});

export const markPrintJobStatus = webMethod(Permissions.SiteMember, async (printQueueId, status) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    const existing = await wixData.get('PrintQueue', printQueueId, SA);
    if (!existing) return null;
    return wixData.update('PrintQueue', {
        ...existing,
        status,
        printedAt: status === 'printed' ? new Date() : existing.printedAt,
    }, SA);
});

/** Admin "הדפס מחדש" — fresh ticketId so the printer accepts another physical copy (HSPOS ignores duplicate ticket IDs). */
export const reprintPrintJob = webMethod(Permissions.SiteMember, async (printQueueId) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    const existing = await wixData.get('PrintQueue', printQueueId, SA);
    if (!existing) throw new Error('Print job not found');

    const reset = await wixData.update('PrintQueue', {
        ...existing,
        attempts: 0,
        errorMessage: null,
    }, SA);

    const result = await dispatchPrintJob(reset, { forceNewTicket: true });
    return { success: result?.status !== 'failed', printQueue: result };
});

/** Admin detail modal — lets staff set the payment method by hand since Wix's eCom Orders API doesn't reliably expose it for these in-person/custom-line-item checkouts. */
export const setPrintJobPaymentMethod = webMethod(Permissions.SiteMember, async (printQueueId, paymentMethod) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    const existing = await wixData.get('PrintQueue', printQueueId, SA);
    if (!existing) throw new Error('Print job not found');
    return wixData.update('PrintQueue', {
        ...existing,
        payload: { ...(existing.payload || {}), paymentMethod: paymentMethod || null },
    }, SA);
});
