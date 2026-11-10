// Shared quote helpers: settings, phone format, extras catalog, status rules.
import wixData from 'wix-data';
import { normalizeIsraeliPhone } from 'backend/orderUtils.js';

const SA = { suppressAuth: true, suppressHooks: true };

export const SETTINGS_KEY = 'default';

/** ManyChat canonical phone: digits only, 972XXXXXXXXX. */
export function toManyChatPhone(phone) {
    const e164 = normalizeIsraeliPhone(phone);
    return e164 ? e164.replace(/^\+/, '') : '';
}

export async function getQuoteSettings() {
    const res = await wixData.query('QuoteSettings').eq('settingKey', SETTINGS_KEY).limit(1).find(SA);
    return res.items[0] || null;
}

/** Event extras = addons_events CMS (name, price as text, arrivalOffsetMinutes). */
export async function loadAddonsCatalog() {
    const res = await wixData.query('addons_events').limit(100).find(SA);
    return res.items.map((a) => ({
        id: a._id,
        title: a.name || '',
        price: Number(String(a.price || '').replace(/[^\d.]/g, '')) || 0,
        arrivalOffsetMinutes: Number(a.arrivalOffsetMinutes) || 0,
    }));
}

/** Match free-text extras (e.g. "עמדת קרפ צרפתי (1000₪), ברד (200₪)") back to the catalog by name. */
export function matchExtrasFromText(text, catalog) {
    const raw = String(text || '');
    if (!raw) return [];
    return catalog
        .filter((a) => a.title && raw.includes(a.title))
        .map((a) => ({ id: a.id, title: a.title, price: a.price, source: 'catalog' }));
}

export const LOCKED_STATUSES = ['signed', 'expired', 'cancelled'];
export const SIGNED_EDITABLE_FIELDS = ['notes', 'assignedStaffIds'];
