/** Pure date/time/layout helpers for the schedule calendar (Asia/Jerusalem wall time). */

export const HOUR_PX = 52;
export const DOW_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DOW_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function pad2(n) { return String(n).padStart(2, '0'); }

export function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return { y, m, d };
}

export function addDays(key, n) {
    const { y, m, d } = parseKey(key);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function dowOf(key) {
    const { y, m, d } = parseKey(key);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekStart(key) { return addDays(key, -dowOf(key)); }

export function rangeKeys(fromKey, toKey) {
    const out = [];
    for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push(k);
    return out;
}

export function monthGrid(key) {
    const { y, m } = parseKey(key);
    const first = `${y}-${pad2(m)}-01`;
    const from = weekStart(first);
    return { from, to: addDays(from, 41) };
}

export function addMonths(key, n) {
    const { y, m } = parseKey(key);
    const dt = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-01`;
}

/** Visible dates for a view. */
export function visibleRange(view, anchor) {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'month') return monthGrid(anchor);
    const from = weekStart(anchor);
    return { from, to: addDays(from, 6) };
}

/** Fetch window: week/day views prefetch the neighbouring weeks (21 days); month = 42-day grid. */
export function fetchRange(view, anchor) {
    if (view === 'month') return monthGrid(anchor);
    const from = addDays(weekStart(anchor), -7);
    return { from, to: addDays(from, 20) };
}

export function shiftAnchor(view, anchor, dir) {
    if (view === 'day') return addDays(anchor, dir);
    if (view === 'month') return addMonths(anchor, dir);
    return addDays(anchor, dir * 7);
}

const IL_FMT = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** ISO → { dateKey, minutes, hm } in Israel wall time. */
export function ilParts(iso) {
    const dt = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    const p = Object.fromEntries(IL_FMT.formatToParts(dt).map(x => [x.type, x.value]));
    const hour = Number(p.hour) % 24;
    const minute = Number(p.minute);
    return { dateKey: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + minute, hm: `${pad2(hour)}:${pad2(minute)}` };
}

export function todayKeyIL() { return ilParts(new Date()).dateKey; }

export function hmToMin(hm) {
    if (!/^\d{1,2}:\d{2}$/.test(hm || '')) return null;
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
}

export function minToHm(min) {
    const v = Math.max(0, Math.min(24 * 60, Math.round(min)));
    return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

export function fmtDayLong(key) {
    const { y, m, d } = parseKey(key);
    return `יום ${DOW_LONG[dowOf(key)]}, ${d} ב${MONTHS[m - 1]} ${y}`;
}

export function fmtDayShort(key) {
    const { m, d } = parseKey(key);
    return `${DOW_SHORT[dowOf(key)]} ${d}.${m}`;
}

export function rangeTitle(view, anchor) {
    const { y, m, d } = parseKey(anchor);
    if (view === 'month') return `${MONTHS[m - 1]} ${y}`;
    if (view === 'day') return `${d} ב${MONTHS[m - 1]} ${y}`;
    const { from, to } = visibleRange('week', anchor);
    const a = parseKey(from);
    const b = parseKey(to);
    if (a.m === b.m) return `${a.d}–${b.d} ב${MONTHS[a.m - 1]} ${a.y}`;
    if (a.y === b.y) return `${a.d} ב${MONTHS[a.m - 1]} – ${b.d} ב${MONTHS[b.m - 1]} ${b.y}`;
    return `${a.d} ב${MONTHS[a.m - 1]} ${a.y} – ${b.d} ב${MONTHS[b.m - 1]} ${b.y}`;
}

/** Hour window for the time grid: default 08–21, widened to fit events. */
export function hourBounds(events) {
    let start = 8;
    let end = 21;
    for (const ev of events) {
        start = Math.min(start, Math.floor(ev.startMin / 60));
        end = Math.max(end, Math.ceil(ev.endMin / 60));
    }
    return { start: Math.max(0, start), end: Math.min(24, Math.max(end, start + 1)) };
}

/** Assigns side-by-side columns to overlapping events in one day (Google/Wix style). Mutates `col`/`cols`. */
export function layoutOverlaps(events) {
    const sorted = events.slice().sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
        const colEnds = [];
        for (const ev of cluster) {
            let c = colEnds.findIndex(end => end <= ev.startMin);
            if (c < 0) { c = colEnds.length; colEnds.push(0); }
            colEnds[c] = ev.endMin;
            ev.col = c;
        }
        for (const ev of cluster) ev.cols = colEnds.length;
        cluster = [];
    };
    for (const ev of sorted) {
        if (cluster.length && ev.startMin >= clusterEnd) flush();
        cluster.push(ev);
        clusterEnd = Math.max(clusterEnd, ev.endMin);
        if (cluster.length === 1) clusterEnd = ev.endMin;
    }
    if (cluster.length) flush();
    return sorted;
}
