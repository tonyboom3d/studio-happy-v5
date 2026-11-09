/** Schedule-calendar state: per-date cache, derived events, optimistic ops with rollback. */
import { ilParts, hmToMin, minToHm, rangeKeys, todayKeyIL } from './calendarLayout.js';

const EMPTY_SETTINGS = () => ({
    defaultShiftStart: '', defaultShiftEnd: '',
    blockedDates: [], promotedDates: [], holidays: [], dayNotes: {}, sketchSewingDays: {},
});

export function calState(ce) {
    if (!ce._cal) {
        const today = todayKeyIL();
        ce._cal = {
            view: 'week',
            anchor: today,
            miniMonth: today.slice(0, 7),
            filters: { workshopIds: [], employeeIds: [], state: '' },
            openGroups: {},
            msOpen: null,
            cache: { days: {}, subsByDate: {}, loaded: {}, employees: [], workshopTypes: [], vacations: [], settings: EMPTY_SETTINGS(), permissions: {}, ready: false },
            loadingKey: null,
            drawer: null,            // { kind: 'session', dateKey, typeId, start } | { kind: 'day', dateKey }
            drawerTab: 'participants',
            picker: null,            // { mode: 'add' } | { mode: 'swap', fromId }
            editHours: null,         // employeeId
            removeConfirm: null,     // employeeId
            notify: true,
            ops: {},
            toast: null,
            sketchConfirm: null,
        };
    }
    return ce._cal;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------------------
// Cache merge
// ---------------------------------------------------------------------------

export function mergeRange(cal, data) {
    const { fromKey, toKey } = data;
    if (!fromKey || !toKey) return;
    const c = cal.cache;
    const inR = (k) => k >= fromKey && k <= toKey;
    const now = Date.now();
    for (const k of rangeKeys(fromKey, toKey)) {
        c.days[k] = data.days?.[k] || { hasWorkshops: false, types: [] };
        c.subsByDate[k] = [];
        c.loaded[k] = now;
    }
    for (const s of (data.submissions || [])) {
        if (!c.subsByDate[s.date]) c.subsByDate[s.date] = [];
        c.subsByDate[s.date].push(s);
    }
    if (data.employees) c.employees = data.employees;
    if (data.workshopTypes) c.workshopTypes = data.workshopTypes;
    if (data.permissions) c.permissions = data.permissions;

    const s = data.settings || {};
    const st = c.settings;
    st.defaultShiftStart = s.defaultShiftStart || st.defaultShiftStart;
    st.defaultShiftEnd = s.defaultShiftEnd || st.defaultShiftEnd;
    st.blockedDates = st.blockedDates.filter(k => !inR(k)).concat(s.blockedDates || []);
    st.promotedDates = st.promotedDates.filter(k => !inR(k)).concat(s.promotedDates || []);
    st.holidays = st.holidays.filter(h => !inR(h.date)).concat(s.holidays || []);
    for (const k of Object.keys(st.dayNotes)) if (inR(k)) delete st.dayNotes[k];
    Object.assign(st.dayNotes, s.dayNotes || {});
    for (const k of Object.keys(st.sketchSewingDays)) if (inR(k)) delete st.sketchSewingDays[k];
    Object.assign(st.sketchSewingDays, s.sketchSewingDays || {});

    c.vacations = c.vacations
        .filter(v => !(v.startDate <= toKey && v.endDate >= fromKey))
        .concat(data.vacations || []);
    c.ready = true;

    for (const op of Object.values(cal.ops)) {
        if (inR(op.dateKey)) applyOp(cal, op);
    }
}

export function isRangeLoaded(cal, fromKey, toKey) {
    return rangeKeys(fromKey, toKey).every(k => cal.cache.loaded[k]);
}

export function invalidateRange(cal, fromKey, toKey) {
    for (const k of rangeKeys(fromKey, toKey)) delete cal.cache.loaded[k];
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

export function empById(cal) {
    return Object.fromEntries(cal.cache.employees.map(e => [e.id, e]));
}

export function subFor(cal, dateKey, employeeId) {
    return (cal.cache.subsByDate[dateKey] || []).find(s => s.employeeId === employeeId) || null;
}

export function onVacation(cal, employeeId, dateKey) {
    return cal.cache.vacations.some(v => v.employeeId === employeeId && v.startDate <= dateKey && dateKey <= v.endDate);
}

function slotRange(slot) {
    const s = slot.start ? ilParts(slot.start) : null;
    if (!s) return null;
    const e = slot.end ? ilParts(slot.end) : null;
    let endMin = e ? (e.dateKey !== s.dateKey ? 1440 : e.minutes) : s.minutes + 90;
    if (endMin <= s.minutes) endMin = s.minutes + 30;
    return { startMin: s.minutes, endMin };
}

/** Flat list of workshop sessions for the given dates, honoring filters. */
export function buildEvents(cal, keys, { applyFilters = true } = {}) {
    const { workshopIds, employeeIds, state } = cal.filters;
    const out = [];
    for (const k of keys) {
        const day = cal.cache.days[k];
        if (!day) continue;
        for (const t of (day.types || [])) {
            const assignedIds = t.assignedEmployeeIds || [];
            if (applyFilters && workshopIds.length && !workshopIds.includes(t.typeId)) continue;
            if (applyFilters && employeeIds.length && !assignedIds.some(id => employeeIds.includes(id))) continue;
            const slots = t.slots?.length ? t.slots : [{ start: null, end: null, required: t.required, adults: t.adults, children: t.children, capacity: null }];
            for (const slot of slots) {
                const r = slotRange(slot);
                if (applyFilters && state) {
                    if (state === 'noStaff' && assignedIds.length) continue;
                    if (state === 'withStaff' && !assignedIds.length) continue;
                    if (state === 'noParticipants' && eventCapacity({ capacity: slot.capacity || null, people: (slot.adults || 0) + (slot.children || 0) }).booked > 0) continue;
                }
                out.push({
                    id: `${k}|${t.typeId}|${slot.start || ''}`,
                    dateKey: k,
                    typeId: t.typeId,
                    name: t.name,
                    start: slot.start || null,
                    end: slot.end || null,
                    startMin: r ? r.startMin : null,
                    endMin: r ? r.endMin : null,
                    allDay: !r,
                    slot,
                    type: t,
                    assignedIds,
                    required: slot.required || 0,
                    capacity: slot.capacity || null,
                    people: (slot.adults || 0) + (slot.children || 0),
                });
            }
        }
    }
    return out;
}

export function findEvent(cal, dateKey, typeId, start) {
    return buildEvents(cal, [dateKey], { applyFilters: false })
        .find(ev => ev.typeId === typeId && (ev.start || '') === (start || '')) || null;
}

/** Booked/total/open for an event — Bookings capacity when known, else paid headcount. */
export function eventCapacity(ev) {
    const cap = ev.capacity;
    if (cap && Number.isFinite(cap.total)) {
        const open = Number.isFinite(cap.open) ? cap.open : Math.max(0, cap.total - ev.people);
        return { booked: Math.max(ev.people, cap.total - open), total: cap.total, open };
    }
    return { booked: ev.people, total: null, open: null };
}

/** Union span (minutes) of every session of every workshop the employee is assigned to that day. */
function assignedSpan(cal, dateKey, employeeId) {
    let start = null;
    let end = null;
    for (const t of (cal.cache.days[dateKey]?.types || [])) {
        if (!(t.assignedEmployeeIds || []).includes(employeeId)) continue;
        for (const slot of (t.slots || [])) {
            const r = slotRange(slot);
            if (!r) continue;
            start = start === null ? r.startMin : Math.min(start, r.startMin);
            end = end === null ? r.endMin : Math.max(end, r.endMin);
        }
    }
    return start === null ? null : { start, end };
}

/** Hebrew note when the employee's shift hours don't cover their workshops that day, else null. */
export function coverageIssue(cal, dateKey, employeeId) {
    const span = assignedSpan(cal, dateKey, employeeId);
    if (!span) return null;
    const sub = subFor(cal, dateKey, employeeId);
    const s = hmToMin(sub?.startTime);
    const e = hmToMin(sub?.endTime);
    if (s === null || e === null) return 'לא הוגדרו שעות משמרת';
    if (s <= span.start && e >= span.end) return null;
    return `המשמרת ${sub.startTime}–${sub.endTime} לא מכסה את ${minToHm(span.start)}–${minToHm(span.end)}`;
}

// ---------------------------------------------------------------------------
// Optimistic ops (idempotent — may be re-applied after a server patch)
// ---------------------------------------------------------------------------

function addUnique(list, v) { if (!list.includes(v)) list.push(v); }

function applyAssign(cal, dateKey, typeIds, employeeId, workType, opId) {
    const c = cal.cache;
    const day = c.days[dateKey];
    for (const typeId of typeIds) {
        const t = day?.types?.find(x => x.typeId === typeId);
        if (t) {
            t.assignedEmployeeIds = t.assignedEmployeeIds || [];
            addUnique(t.assignedEmployeeIds, employeeId);
        }
    }
    if (!c.subsByDate[dateKey]) c.subsByDate[dateKey] = [];
    let sub = subFor(cal, dateKey, employeeId);
    if (!sub) {
        sub = {
            id: `tmp-${opId}`, employeeId, date: dateKey,
            startTime: c.settings.defaultShiftStart || '', endTime: c.settings.defaultShiftEnd || '',
            status: 'SCHEDULED', workType: workType || 'WORKSHOP', assignedTypeIds: [], managerOverride: true,
        };
        c.subsByDate[dateKey].push(sub);
    }
    sub.status = 'SCHEDULED';
    if (workType) sub.workType = workType;
    sub.assignedTypeIds = sub.assignedTypeIds || [];
    for (const id of typeIds) addUnique(sub.assignedTypeIds, id);
}

function applyRemove(cal, dateKey, typeId, employeeId, disposition) {
    const c = cal.cache;
    const t = c.days[dateKey]?.types?.find(x => x.typeId === typeId);
    if (t) t.assignedEmployeeIds = (t.assignedEmployeeIds || []).filter(id => id !== employeeId);
    const sub = subFor(cal, dateKey, employeeId);
    if (!sub) return;
    sub.assignedTypeIds = (sub.assignedTypeIds || []).filter(id => id !== typeId);
    if (sub.assignedTypeIds.length) return;
    if (disposition === 'delete') {
        c.subsByDate[dateKey] = c.subsByDate[dateKey].filter(s => s !== sub);
    } else {
        sub.status = 'SUBMITTED';
    }
}

function toggleList(list, value, on) {
    const next = list.filter(v => v !== value);
    if (on) next.push(value);
    return next;
}

export function applyOp(cal, op) {
    const p = op.payload || {};
    const dk = op.dateKey;
    const st = cal.cache.settings;
    switch (op.kind) {
        case 'assign':
            applyAssign(cal, dk, p.workshopTypeIds || [], p.employeeId, p.workType, op.id);
            break;
        case 'remove':
            applyRemove(cal, dk, p.workshopTypeId, p.employeeId, p.disposition);
            break;
        case 'swap':
            applyRemove(cal, dk, p.workshopTypeId, p.fromEmployeeId, 'restore');
            applyAssign(cal, dk, [p.workshopTypeId], p.toEmployeeId, p.workType, op.id);
            break;
        case 'hours': {
            const sub = (cal.cache.subsByDate[dk] || []).find(s => s.id === p.submissionId);
            if (sub) { sub.startTime = p.startTime; sub.endTime = p.endTime; }
            break;
        }
        case 'flags':
            if (p.flags?.blocked !== undefined) st.blockedDates = toggleList(st.blockedDates, dk, !!p.flags.blocked);
            if (p.flags?.promoted !== undefined) st.promotedDates = toggleList(st.promotedDates, dk, !!p.flags.promoted);
            break;
        case 'note':
            if (p.message) st.dayNotes[dk] = { ...(st.dayNotes[dk] || {}), message: p.message };
            else delete st.dayNotes[dk];
            break;
        case 'holiday': {
            const h = st.holidays.find(x => x.date === dk);
            const patch = { mode: p.mode, shortStart: p.shortStart, shortEnd: p.shortEnd };
            if (h) Object.assign(h, patch);
            else st.holidays.push({ date: dk, name: '', ...patch });
            break;
        }
        case 'sketch':
            st.sketchSewingDays[dk] = { ...(st.sketchSewingDays[dk] || {}), startTime: p.startTime, endTime: p.endTime };
            break;
        case 'sketchDelete':
            delete st.sketchSewingDays[dk];
            break;
        default:
            break;
    }
}

export function beginOp(cal, kind, dateKey, payload) {
    const id = `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const c = cal.cache;
    const op = {
        id, kind, dateKey, payload,
        snapshot: { day: clone(c.days[dateKey]), subs: clone(c.subsByDate[dateKey]), settings: clone(c.settings) },
    };
    cal.ops[id] = op;
    applyOp(cal, op);
    return op;
}

export function settleOp(cal, opId) {
    const op = cal.ops[opId];
    delete cal.ops[opId];
    return op || null;
}

export function rollbackOp(cal, opId) {
    const op = cal.ops[opId];
    if (!op) return null;
    delete cal.ops[opId];
    const c = cal.cache;
    if (op.snapshot.day !== undefined) c.days[op.dateKey] = op.snapshot.day;
    if (op.snapshot.subs !== undefined) c.subsByDate[op.dateKey] = op.snapshot.subs;
    c.settings = op.snapshot.settings;
    for (const other of Object.values(cal.ops)) applyOp(cal, other);
    return op;
}

export function pendingCount(cal) {
    return Object.keys(cal.ops).length;
}
