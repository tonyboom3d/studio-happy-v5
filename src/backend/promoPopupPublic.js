/**
 * Public popup schedule for Custom Code.
 * GET /_functions/promoPopup
 *
 * CMS collection PromoPopup is a single-item collection.
 * Item id: SINGLE_ITEM_ID (Wix single-item collection)
 * Fields: enabled (Boolean), startsAt (Date & Time), endsAt (Date & Time)
 * Copy stays hardcoded in the Custom Code snippet.
 */
import wixData from 'wix-data';

const COLLECTION = 'PromoPopup';
const ITEM_ID = 'SINGLE_ITEM_ID';
const SA = { suppressAuth: true };

function toMs(value) {
    if (!value) return NaN;
    const date = value instanceof Date ? value : new Date(value);
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : NaN;
}

function iso(value) {
    const ms = toMs(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function inWindow(item, now) {
    const start = toMs(item.startsAt);
    const end = toMs(item.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
    return now >= start && now < end;
}

export async function buildPromoPopupPayload() {
    let item = null;
    try {
        item = await wixData.get(COLLECTION, ITEM_ID, SA);
    } catch (_) {
        item = null;
    }
    if (!item || item.enabled !== true || !inWindow(item, Date.now())) return { show: false };
    return {
        show: true,
        active: true,
        startsAt: iso(item.startsAt),
        endsAt: iso(item.endsAt),
    };
}
