/** Resolves candle-cup labels for the scheduling calendar paid participant list. */
import wixData from 'wix-data';

const SA = { suppressAuth: true };

function firstTag(raw) {
    if (raw == null || raw === '') return '';
    if (Array.isArray(raw)) return String(raw[0] ?? '').trim();
    const s = String(raw).trim();
    if (s.startsWith('[')) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return String(arr[0] ?? '').trim();
        } catch (_) { /* plain text */ }
    }
    return s.replace(/^"|"$/g, '');
}

function parseSelected(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }
    return [];
}

/** orderId -> cup rows aligned 1:1 with order.selectedProducts: [{ label }]. */
export async function loadCupLabels(orders) {
    const out = {};
    const ids = new Set();
    for (const o of orders || []) {
        for (const s of parseSelected(o.selectedProducts)) if (s?.productId) ids.add(s.productId);
    }
    if (!ids.size) return out;
    const res = await wixData.query('bookingProducts').hasSome('_id', [...ids]).limit(100).find(SA).catch(() => ({ items: [] }));
    const label = {};
    for (const p of res.items || []) label[p._id] = firstTag(p.difficulty);
    for (const o of orders) {
        out[o._id] = parseSelected(o.selectedProducts).map(s => ({ label: label[s?.productId] || '' }));
    }
    return out;
}
