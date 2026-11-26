const PALETTE = [
    { bg: '#e0edff', border: '#3b82f6', text: '#1e3a8a' },
    { bg: '#fde4ef', border: '#ec4899', text: '#831843' },
    { bg: '#ece8ff', border: '#8b5cf6', text: '#4c1d95' },
    { bg: '#dcf7e6', border: '#22c55e', text: '#14532d' },
    { bg: '#fff1d1', border: '#f59e0b', text: '#78350f' },
    { bg: '#d6f6fb', border: '#06b6d4', text: '#164e63' },
    { bg: '#ffe2e2', border: '#ef4444', text: '#7f1d1d' },
    { bg: '#e3e7ff', border: '#6366f1', text: '#312e81' },
    { bg: '#ffe7d4', border: '#f97316', text: '#7c2d12' },
    { bg: '#eef1f5', border: '#64748b', text: '#1e293b' },
];

let cacheKey = '';
let cacheMap = {};

/** Stable color per workshop type: index in the id-sorted type list (collision-free up to palette size). */
export function colorForType(typeId, workshopTypes) {
    const ids = (workshopTypes || []).map(t => t.id).filter(Boolean).sort();
    const key = ids.join('|');
    if (key !== cacheKey) {
        cacheKey = key;
        cacheMap = Object.fromEntries(ids.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
    }
    if (cacheMap[typeId]) return cacheMap[typeId];
    let h = 0;
    for (const ch of String(typeId || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
}

const EMPTY_COLOR = { bg: '#f3f4f6', border: '#b6bec9', text: '#6b7280' };

/** Type color, or gray when the session has no paid participants yet. */
export function colorForEvent(ev, workshopTypes) {
    return ev.people > 0 ? colorForType(ev.typeId, workshopTypes) : EMPTY_COLOR;
}

/** Card style: neutral body with a colored top stripe. */
export function eventStripeStyle(col, empty) {
    return `background:${empty ? col.bg : '#fff'};border-top:4px solid ${col.border};color:${empty ? col.text : '#20303c'}`;
}
