// Fixed catalog for the "ימי הולדת" landing page add-ons (pool/candy/popcorn/etc).
// Mirrors BIRTHDAY_ADDONS in src/public/custom-elements/birthday-landing.js — keep titles/prices in sync.
// Prices and titles are resolved here (server-side) so the client payload only needs to send ids.

export const BIRTHDAY_ADDONS_CATALOG = [
    { id: 'balloons', title: 'קישוטי בלוני הליום', price: 250 },
    { id: 'candy-table', title: 'שולחן מתוקים וחטיפים', price: 800 },
    { id: 'crepe-station', title: 'עמדת קרפ צרפתי', price: 1000 },
    { id: 'hotdog-station', title: 'עמדת נקניקיות חמות', price: 1000 },
    { id: 'popcorn-machine', title: 'מכונת פופקורן', price: 300 },
    { id: 'slush', title: 'ברד', price: 200 },
];

const BY_ID = BIRTHDAY_ADDONS_CATALOG.reduce((map, a) => {
    map[a.id] = a;
    return map;
}, {});

/** Maps raw addon ids from the client to known catalog entries, dropping unknown/forged ids. */
export function resolveBirthdayAddons(ids) {
    if (!Array.isArray(ids)) return [];
    const seen = new Set();
    const resolved = [];
    ids.forEach((rawId) => {
        const id = String(rawId || '').trim();
        if (!id || seen.has(id) || !BY_ID[id]) return;
        seen.add(id);
        resolved.push(BY_ID[id]);
    });
    return resolved;
}
