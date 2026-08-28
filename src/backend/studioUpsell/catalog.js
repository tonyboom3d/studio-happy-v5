/**
 * studioUpsell/catalog.js — reads the per-workshop-type add-on catalog and
 * upsell settings (open amount, staff code, print toggle) from CMS.
 *
 * Collections (create manually in the Wix editor — see plan doc):
 *   StudioAddOns:        title, description, price, image, workshopType (ref -> workshops),
 *                         active, sortOrder, maxQuantity, generalCategoryId (general add-ons only)
 *   StudioUpsellSettings: workshopType (ref -> workshops), active, allowOpenAmount,
 *                         openAmountLabel, openAmountMin, openAmountMax,
 *                         openAmountPasswordEnabled, openAmountPassword,
 *                         showStaffCode, printOnPayment, generalCategories (JSON, __general__ row only)
 */
import wixData from 'wix-data';
import { wixMediaToPublicUrl } from './mediaUpload.js';
import { getPurchasedQuantityForCustomer } from './inventory.js';

const SA = { suppressAuth: true };

/** Sentinel `workshopType` value for add-ons shown alongside every workshop's catalog. */
export const GENERAL_WORKSHOP_TYPE = '__general__';

/** Default staff code for unlocking the "open amount" payment option. */
export const DEFAULT_OPEN_AMOUNT_PASSWORD = '1326';

const DEFAULT_SETTINGS = {
    active: true,
    allowOpenAmount: false,
    openAmountLabel: 'סכום פתוח',
    openAmountMin: 0,
    openAmountMax: null,
    openAmountRequiresPassword: false,
    showStaffCode: false,
    printOnPayment: true,
};

function getEffectiveOpenAmountPassword(row) {
    const stored = row?.openAmountPassword ? String(row.openAmountPassword).trim() : '';
    return stored || DEFAULT_OPEN_AMOUNT_PASSWORD;
}

// Customer/staff-facing mapping — NEVER includes the raw openAmountPassword value,
// only whether staff approval is required for this workshop's "open amount" (a
// dedicated toggle, independent of allowOpenAmount itself).
function mapSettingsRow(row) {
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
        active: row.active !== false,
        allowOpenAmount: !!row.allowOpenAmount,
        openAmountLabel: row.openAmountLabel || DEFAULT_SETTINGS.openAmountLabel,
        openAmountMin: Number(row.openAmountMin) || 0,
        openAmountMax: row.openAmountMax != null && row.openAmountMax !== '' ? Number(row.openAmountMax) : null,
        openAmountRequiresPassword: !!row.openAmountPasswordEnabled,
        showStaffCode: !!row.showStaffCode,
        printOnPayment: row.printOnPayment !== false,
    };
}

/**
 * Verifies the staff-entered code for unlocking the "open amount" payment
 * option. Uses StudioUpsellSettings.openAmountPassword when set, otherwise
 * DEFAULT_OPEN_AMOUNT_PASSWORD ('1326'). Only ever meaningful when
 * openAmountPasswordEnabled is on for this workshop type.
 */
export async function verifyOpenAmountPassword(workshopTypeId, code) {
    if (!workshopTypeId) return false;
    const result = await wixData.query('StudioUpsellSettings').eq('workshopType', workshopTypeId).find(SA);
    const row = result.items?.[0];
    if (!row?.openAmountPasswordEnabled) return true;
    return String(code || '').trim() === getEffectiveOpenAmountPassword(row);
}

function mapAddOnRow(item, { isGeneral = false } = {}) {
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
        generalCategoryId: item.generalCategoryId ? String(item.generalCategoryId) : null,
        isGeneral,
    };
}

/** Parses the `generalCategories` JSON field from StudioUpsellSettings (__general__ row). */
export function parseGeneralCategories(raw) {
    if (!raw) return [];
    let list = raw;
    if (typeof raw === 'string') {
        try { list = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(list)) return [];
    return list
        .map((c) => ({
            id: String(c?.id || '').trim(),
            title: String(c?.title || '').trim(),
            sortOrder: Number(c?.sortOrder) || 0,
        }))
        .filter((c) => c.id && c.title);
}

export function serializeGeneralCategories(categories) {
    return JSON.stringify(parseGeneralCategories(categories));
}

/** Groups general add-ons under their category headings for the customer catalog. */
export function buildGeneralSections(categories, generalAddOns) {
    const sorted = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const catIds = new Set(sorted.map((c) => c.id));
    const sections = sorted
        .map((cat) => ({
            id: cat.id,
            title: cat.title,
            addOns: generalAddOns.filter((a) => a.generalCategoryId === cat.id),
        }))
        .filter((sec) => sec.addOns.length > 0);

    const uncategorized = generalAddOns.filter((a) => !a.generalCategoryId || !catIds.has(a.generalCategoryId));
    if (uncategorized.length) {
        sections.push({ id: '__other__', title: 'אחר', addOns: uncategorized });
    }
    return sections;
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
    if (!workshopTypeId) {
        return { workshopAddOns: [], generalSections: [], addOns: [], settings: { ...DEFAULT_SETTINGS } };
    }

    const [specificResult, generalResult, settingsResult, generalSettingsResult] = await Promise.all([
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
        wixData.query('StudioUpsellSettings')
            .eq('workshopType', GENERAL_WORKSHOP_TYPE)
            .find(SA),
    ]);

    const workshopAddOns = (specificResult.items || []).map((item) => mapAddOnRow(item, { isGeneral: false }));
    const generalAddOns = (generalResult.items || []).map((item) => mapAddOnRow(item, { isGeneral: true }));
    const addOns = [...workshopAddOns, ...generalAddOns];

    await applyAvailabilityCaps(addOns, customerPhone, scope || { workshopTypeId });

    const generalCategories = parseGeneralCategories(generalSettingsResult.items?.[0]?.generalCategories);
    const generalSections = buildGeneralSections(generalCategories, generalAddOns);

    return {
        workshopAddOns,
        generalSections,
        addOns,
        settings: mapSettingsRow(settingsResult.items?.[0]),
    };
}

export async function getSettingsForWorkshopType(workshopTypeId) {
    if (!workshopTypeId) return { ...DEFAULT_SETTINGS };
    const result = await wixData.query('StudioUpsellSettings').eq('workshopType', workshopTypeId).find(SA);
    return mapSettingsRow(result.items?.[0]);
}
