/**
 * studioUpsell/catalog.js — reads the per-workshop-type add-on catalog and
 * upsell settings (open amount, staff code, print toggle) from CMS.
 *
 * Collections (create manually in the Wix editor — see plan doc):
 *   StudioAddOns:        title, description, price, image, workshopType (ref -> workshops),
 *                         active, sortOrder, maxQuantity
 *   StudioUpsellSettings: workshopType (ref -> workshops), active, allowOpenAmount,
 *                         openAmountLabel, openAmountMin, openAmountMax, showStaffCode, printOnPayment
 */
import wixData from 'wix-data';
import { wixMediaToPublicUrl } from './mediaUpload.js';
import { getPurchasedQuantityForCustomer } from './inventory.js';

const SA = { suppressAuth: true };

/** Sentinel `workshopType` value for add-ons shown alongside every workshop's catalog. */
export const GENERAL_WORKSHOP_TYPE = '__general__';

const DEFAULT_SETTINGS = {
    active: true,
    allowOpenAmount: false,
    openAmountLabel: 'סכום פתוח',
    openAmountMin: 0,
    openAmountMax: null,
    showStaffCode: false,
    printOnPayment: true,
};

function mapSettingsRow(row) {
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
        active: row.active !== false,
        allowOpenAmount: !!row.allowOpenAmount,
        openAmountLabel: row.openAmountLabel || DEFAULT_SETTINGS.openAmountLabel,
        openAmountMin: Number(row.openAmountMin) || 0,
        openAmountMax: row.openAmountMax != null && row.openAmountMax !== '' ? Number(row.openAmountMax) : null,
        showStaffCode: !!row.showStaffCode,
        printOnPayment: row.printOnPayment !== false,
    };
}

function mapAddOnRow(item) {
    return {
        id: item._id,
        title: item.title || '',
        description: item.description || '',
        price: Number(item.price) || 0,
        image: wixMediaToPublicUrl(item.image) || item.image || null,
        maxQuantity: Number(item.maxQuantity) || 10,
        maxQuantityMode: item.maxQuantityMode === 'perCustomer' ? 'perCustomer' : 'perOrder',
        inventoryManaged: !!item.inventoryManaged,
        stockQuantity: item.inventoryManaged ? (Number(item.stockQuantity) || 0) : null,
    };
}

/**
 * Caps each add-on's `maxQuantity` per the current customer/inventory state
 * and flags `soldOut` (+ `soldOutReason`) — so the kiosk stepper never lets a
 * customer request more than what's actually still purchasable. Unavailable
 * add-ons stay in the catalog: they're rendered, just not selectable.
 */
async function applyAvailabilityCaps(addOns, customerPhone, scope) {
    for (const addOn of addOns) {
        let cap = addOn.maxQuantity;
        let reason = null;

        if (addOn.maxQuantityMode === 'perCustomer' && customerPhone) {
            const purchased = await getPurchasedQuantityForCustomer(addOn.id, customerPhone, scope);
            cap = Math.max(0, addOn.maxQuantity - purchased);
            addOn.alreadyPurchased = purchased;
            if (cap <= 0) reason = 'perCustomer';
        }

        if (addOn.inventoryManaged) {
            cap = Math.max(0, Math.min(cap, addOn.stockQuantity));
            if (cap <= 0 && !reason) reason = 'stock';
        }

        addOn.maxQuantity = cap;
        addOn.soldOut = cap <= 0;
        addOn.soldOutReason = addOn.soldOut ? reason : null;
    }
    return addOns;
}

/**
 * @param {string} workshopTypeId
 * @param {string} [customerPhone] - enables the 'perCustomer' cap for this customer
 * @param {{sessionId?:string, workshopOrderId?:string, workshopTypeId?:string, workshopStart?:string|Date}} [scope]
 *   The workshop session the 'perCustomer' cap is counted within.
 */
export async function getAddOnCatalog(workshopTypeId, customerPhone, scope) {
    if (!workshopTypeId) return { addOns: [], settings: { ...DEFAULT_SETTINGS } };

    const [specificResult, generalResult, settingsResult] = await Promise.all([
        wixData.query('StudioAddOns')
            .eq('workshopType', workshopTypeId)
            .eq('active', true)
            .ascending('sortOrder')
            .find(SA),
        wixData.query('StudioAddOns')
            .eq('workshopType', GENERAL_WORKSHOP_TYPE)
            .eq('active', true)
            .ascending('sortOrder')
            .find(SA),
        wixData.query('StudioUpsellSettings')
            .eq('workshopType', workshopTypeId)
            .find(SA),
    ]);

    const addOns = [
        ...(specificResult.items || []).map(mapAddOnRow),
        ...(generalResult.items || []).map(mapAddOnRow),
    ];

    await applyAvailabilityCaps(addOns, customerPhone, scope || { workshopTypeId });

    return { addOns, settings: mapSettingsRow(settingsResult.items?.[0]) };
}

export async function getSettingsForWorkshopType(workshopTypeId) {
    if (!workshopTypeId) return { ...DEFAULT_SETTINGS };
    const result = await wixData.query('StudioUpsellSettings').eq('workshopType', workshopTypeId).find(SA);
    return mapSettingsRow(result.items?.[0]);
}
