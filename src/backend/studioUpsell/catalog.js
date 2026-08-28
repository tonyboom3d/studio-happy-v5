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

const SA = { suppressAuth: true };

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

export async function getAddOnCatalog(workshopTypeId) {
    if (!workshopTypeId) return { addOns: [], settings: { ...DEFAULT_SETTINGS } };

    const [addOnsResult, settingsResult] = await Promise.all([
        wixData.query('StudioAddOns')
            .eq('workshopType', workshopTypeId)
            .eq('active', true)
            .ascending('sortOrder')
            .find(SA),
        wixData.query('StudioUpsellSettings')
            .eq('workshopType', workshopTypeId)
            .find(SA),
    ]);

    const addOns = (addOnsResult.items || []).map((item) => ({
        id: item._id,
        title: item.title || '',
        description: item.description || '',
        price: Number(item.price) || 0,
        image: item.image || null,
        maxQuantity: Number(item.maxQuantity) || 10,
    }));

    return { addOns, settings: mapSettingsRow(settingsResult.items?.[0]) };
}

export async function getSettingsForWorkshopType(workshopTypeId) {
    if (!workshopTypeId) return { ...DEFAULT_SETTINGS };
    const result = await wixData.query('StudioUpsellSettings').eq('workshopType', workshopTypeId).find(SA);
    return mapSettingsRow(result.items?.[0]);
}
