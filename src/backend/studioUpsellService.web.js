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
import { getAddOnCatalog } from 'backend/studioUpsell/catalog.js';
import { createAddOnCheckout } from 'backend/studioUpsell/checkout.js';
import { confirmAddOnOrderByToken, getAddOnOrderByToken } from 'backend/studioUpsell/reconcile.js';
import { uploadBase64ImageToWixMedia, wixMediaToPublicUrl } from 'backend/studioUpsell/mediaUpload.js';

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

/** Add-on catalog + upsell settings (open amount, staff code, print toggle) for a workshop type. */
export const getAddOnCatalogForWorkshop = webMethod(Permissions.Anyone, async (workshopTypeId) => {
    return getAddOnCatalog(workshopTypeId);
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

/** Thank You page: best-effort acceleration of the paid status (authoritative path is the eCom webhook — see events.js). */
export const confirmAddOnOrder = webMethod(Permissions.Anyone, async (token, ecomOrderIdHint) => {
    try {
        return await confirmAddOnOrderByToken(token, ecomOrderIdHint);
    } catch (err) {
        console.error('[studioUpsellService] confirmAddOnOrder failed:', err?.message || err);
        return null;
    }
});

/** Thank You page: read the current state of an add-on order (for polling while the webhook catches up). */
export const getAddOnOrderSummary = webMethod(Permissions.Anyone, async (token) => {
    return getAddOnOrderByToken(token);
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
        return wixData.update('StudioAddOns', { ...existing, ...addOn }, SA);
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

    const existing = await wixData.query('StudioUpsellSettings').eq('workshopType', settings.workshopType).find(SA);
    if (existing.items?.[0]) {
        return wixData.update('StudioUpsellSettings', { ...existing.items[0], ...settings }, SA);
    }

    return wixData.insert('StudioUpsellSettings', {
        workshopType: settings.workshopType,
        active: settings.active !== false,
        allowOpenAmount: !!settings.allowOpenAmount,
        openAmountLabel: settings.openAmountLabel || 'סכום פתוח',
        openAmountMin: Number(settings.openAmountMin) || 0,
        openAmountMax: settings.openAmountMax != null && settings.openAmountMax !== '' ? Number(settings.openAmountMax) : null,
        showStaffCode: !!settings.showStaffCode,
        printOnPayment: settings.printOnPayment !== false,
    }, SA);
});

export const listAddOnTransactions = webMethod(Permissions.SiteMember, async (filters) => {
    await assertEmployeeAccess('manageAddOnsSystem');
    let query = wixData.query('StudioAddOnOrders').descending('_createdDate').limit(100);
    if (filters?.status) query = query.eq('status', filters.status);
    const result = await query.find(SA);
    return result.items || [];
});

export const listPrintQueue = webMethod(Permissions.SiteMember, async () => {
    await assertEmployeeAccess('manageAddOnsSystem');
    const result = await wixData.query('PrintQueue').descending('_createdDate').limit(100).find(SA);
    return result.items || [];
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
