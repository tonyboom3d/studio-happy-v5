/**
 * Schedule calendar ("לוח שיבוץ") entry point. Isolated module: renders into #scRoot,
 * re-renders in place, talks to page code only through ce._dispatch('calendar*').
 */
import { CALENDAR_STYLE } from './calendarStyle.js';
import { fetchRange, shiftAnchor, todayKeyIL, addMonths, hmToMin } from './calendarLayout.js';
import {
    calState, mergeRange, isRangeLoaded, invalidateRange, beginOp, settleOp, rollbackOp, findEvent, subFor,
} from './calendarStore.js';
import { renderCalendarBody, esc } from './calendarViews.js';
import { renderDrawer, groupsKey } from './calendarDrawer.js';

export { CALENDAR_STYLE };

const TOAST_MS = 3800;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderToast(cal) {
    if (!cal.toast || cal.toast.until < Date.now()) return '';
    return `<div class="sc-toast ${cal.toast.kind === 'error' ? 'error' : ''}" role="status">${esc(cal.toast.message)}</div>`;
}

function renderInner(ce) {
    const cal = calState(ce);
    return `${renderCalendarBody(ce)}${renderDrawer(ce)}${renderToast(cal)}`;
}

export function renderScheduleCalendar(ce) {
    queueMicrotask(() => { ensureLoaded(ce); bindTips(ce); });
    return `<div id="scRoot" class="sc-root">${renderInner(ce)}</div>`;
}

/** Preserves scroll + in-progress form values across a re-render of #scRoot. */
export function captureCalendarState(ce) {
    const root = ce.querySelector('#scRoot');
    if (!root) return null;
    const scroll = root.querySelector('[data-sc-scroll]');
    const drawerBody = root.querySelector('.sc-dr-body');
    const inputs = {};
    root.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
        if (el.type !== 'checkbox') inputs[el.id] = el.value;
    });
    return {
        scrollTop: scroll?.scrollTop ?? null,
        scrollLeft: scroll?.scrollLeft ?? null,
        drawerTop: drawerBody?.scrollTop ?? null,
        inputs,
        focusId: root.contains(document.activeElement) ? document.activeElement.id : null,
    };
}

export function restoreCalendarState(ce, snap) {
    const root = ce.querySelector('#scRoot');
    if (!root) return;
    const cal = calState(ce);
    const scroll = root.querySelector('[data-sc-scroll]');
    if (scroll) {
        if (snap?.scrollTop != null && !cal.resetScroll) {
            scroll.scrollTop = snap.scrollTop;
            scroll.scrollLeft = snap.scrollLeft;
        } else {
            const first = scroll.querySelector('.sc-ev');
            scroll.scrollTop = first ? Math.max(0, first.offsetTop - 24) : 0;
        }
    }
    cal.resetScroll = false;
    if (!snap) return;
    const drawerBody = root.querySelector('.sc-dr-body');
    if (drawerBody && snap.drawerTop != null && !cal.resetDrawerScroll) drawerBody.scrollTop = snap.drawerTop;
    cal.resetDrawerScroll = false;
    for (const [id, value] of Object.entries(snap.inputs || {})) {
        const el = root.querySelector(`#${CSS.escape(id)}`);
        if (el && !cal.resetInputs) el.value = value;
    }
    cal.resetInputs = false;
    if (snap.focusId) root.querySelector(`#${CSS.escape(snap.focusId)}`)?.focus();
}

function rerender(ce) {
    const root = ce.querySelector('#scRoot');
    if (!root) { ce._scheduleRender(); return; }
    const hadDrawer = !!root.querySelector('.sc-drawer');
    const snap = captureCalendarState(ce);
    root.innerHTML = renderInner(ce);
    if (hadDrawer) root.querySelector('.sc-drawer')?.classList.add('sc-no-anim');
    restoreCalendarState(ce, snap);
    ensureLoaded(ce);
}

/** Replaces only the open drawer. The calendar grid stays as it is, and an already-open drawer does not slide in again. */
function paintDrawer(ce, { animate = false } = {}) {
    const root = ce.querySelector('#scRoot');
    if (!root) { rerender(ce); return; }
    const html = renderDrawer(ce);
    const prev = root.querySelector('.sc-drawer');
    const cal = calState(ce);
    if (!html) { prev?.remove(); return; }
    const top = prev?.querySelector('.sc-dr-body')?.scrollTop ?? 0;
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const next = tpl.content.firstElementChild;
    if (!animate) next.classList.add('sc-no-anim');
    if (prev) prev.replaceWith(next);
    else root.appendChild(next);
    const body = next.querySelector('.sc-dr-body');
    if (body && !animate && !cal.resetDrawerScroll) body.scrollTop = top;
    cal.resetDrawerScroll = false;
}

export function updateCalendarDrawer(ce) {
    if (!ce.querySelector('#scRoot .sc-drawer')) return;
    paintDrawer(ce);
}

function markSelected(ce) {
    const d = calState(ce).drawer;
    ce.querySelectorAll('#scRoot .sc-ev.sel').forEach(el => el.classList.remove('sel'));
    if (d?.kind !== 'session') return;
    ce.querySelectorAll('#scRoot .sc-ev').forEach(el => {
        if (el.dataset.date === d.dateKey && el.dataset.type === d.typeId && (el.dataset.start || '') === (d.start || '')) el.classList.add('sel');
    });
}

function paintLightbox(ce) {
    const root = ce.querySelector('#scRoot');
    if (!root) return;
    root.querySelector('.sc-lightbox')?.remove();
    const src = calState(ce).lightbox;
    if (!src) return;
    root.insertAdjacentHTML('beforeend', `<div class="sc-lightbox" data-action="cal-lightbox-close" role="dialog">
        <button type="button" class="sc-lightbox-x" data-action="cal-lightbox-close" aria-label="סגירה">×</button>
        <img src="${esc(src)}" alt="" data-action="cal-lightbox-hold">
    </div>`);
}

function bindTips(ce) {
    if (ce._scTipBound) return;
    ce._scTipBound = true;
    const place = (el) => {
        let tip = ce.querySelector(':scope > .sc-floattip');
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'sc-floattip';
            ce.appendChild(tip);
        }
        tip.textContent = el.dataset.tip || '';
        tip.hidden = false;
        const r = el.getBoundingClientRect();
        const width = Math.min(280, window.innerWidth - 16);
        let x = r.left;
        if (x + width > window.innerWidth - 8) x = window.innerWidth - width - 8;
        tip.style.maxWidth = `${width}px`;
        tip.style.left = `${Math.max(8, x)}px`;
        tip.style.top = `${r.bottom + 6}px`;
        const h = tip.offsetHeight;
        if (r.bottom + 6 + h > window.innerHeight - 8) tip.style.top = `${Math.max(8, r.top - h - 6)}px`;
    };
    ce.addEventListener('mouseover', (e) => {
        const el = e.target?.closest?.('[data-tip]');
        if (!el || !ce.contains(el)) return;
        place(el);
    });
    ce.addEventListener('mouseout', (e) => {
        const el = e.target?.closest?.('[data-tip]');
        if (!el || el.contains(e.relatedTarget)) return;
        const tip = ce.querySelector(':scope > .sc-floattip');
        if (tip) tip.hidden = true;
    });
}

function toast(ce, message, kind = 'success') {
    const cal = calState(ce);
    cal.toast = { message, kind, until: Date.now() + TOAST_MS };
    const root = ce.querySelector('#scRoot');
    root?.querySelector('.sc-toast')?.remove();
    if (root) root.insertAdjacentHTML('beforeend', renderToast(cal));
    clearTimeout(cal.toastTimer);
    cal.toastTimer = setTimeout(() => {
        cal.toast = null;
        ce.querySelector('#scRoot .sc-toast')?.remove();
    }, TOAST_MS);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function ensureLoaded(ce) {
    const cal = calState(ce);
    const { from, to } = fetchRange(cal.view, cal.anchor);
    if (isRangeLoaded(cal, from, to)) return;
    const key = `${from}|${to}`;
    if (cal.loadingKey === key) return;
    cal.loadingKey = key;
    ce._dispatch('calendarLoadRange', { fromKey: from, toKey: to });
}

function ensureGroups(ce, dateKey, typeId, start) {
    const key = groupsKey(dateKey, typeId, start);
    if (ce._workshopOrderGroups?.[key] !== undefined) return;
    ce._workshopOrderGroups = ce._workshopOrderGroups || {};
    ce._dispatch('adminLoadWorkshopOrders', { dateKey, workshopTypeId: typeId, sessionStart: start || undefined, key });
}

/** `calendar-data` attribute payload (range load or single-day patch after a mutation). */
export function handleCalendarData(ce, raw) {
    let data;
    try { data = JSON.parse(raw); } catch (_) { return; }
    const cal = calState(ce);
    if (data.error) {
        cal.loadingKey = null;
        toast(ce, data.message || 'טעינת הלוח נכשלה.', 'error');
        rerender(ce);
        return;
    }
    mergeRange(cal, data);
    if (cal.loadingKey === `${data.fromKey}|${data.toKey}`) cal.loadingKey = null;
    rerender(ce);
}

// ---------------------------------------------------------------------------
// Mutations (optimistic)
// ---------------------------------------------------------------------------

function runOp(ce, kind, dateKey, payload, actionType, okMessage) {
    const cal = calState(ce);
    const op = beginOp(cal, kind, dateKey, payload);
    op.okMessage = okMessage;
    cal.picker = null;
    cal.removeConfirm = null;
    cal.editHours = null;
    rerender(ce);
    ce._dispatch(actionType, { ...payload, dateKey, opId: op.id, notify: cal.notify });
}

/** action-result for calendar* types. Returns true when handled. */
export function handleCalendarResult(ce, result) {
    if (!result?.type?.startsWith('calendar')) return false;
    const cal = calState(ce);
    if (result.type === 'calendarLoadRange') {
        if (result.error) {
            cal.loadingKey = null;
            toast(ce, result.message || 'טעינת הלוח נכשלה.', 'error');
            rerender(ce);
        }
        return true;
    }
    const failed = result.error || result.ok === false;
    if (result.type === 'calendarOrderNote') {
        const op = cal.noteOps?.[result.opId];
        if (cal.noteOps) delete cal.noteOps[result.opId];
        if (failed) {
            const g = op && findGroup(ce, op.groupId);
            if (g) { g.internalNotes = op.prev; g.notes = g.customerNotes || op.prev; }
            toast(ce, result.message || 'שמירת ההערה נכשלה.', 'error');
        } else {
            toast(ce, 'ההערה נשמרה', 'success');
        }
        updateCalendarDrawer(ce);
        return true;
    }
    if (result.type === 'calendarSketchDuty' && result.needsConfirm) {
        rollbackOp(cal, result.opId);
        cal.sketchConfirm = { dateKey: result.dateKey, startTime: result.startTime, endTime: result.endTime };
        toast(ce, 'קיימת סדנת טאפטינג ביום זה — יש לאשר שוב לשמירה.', 'error');
    } else if (failed) {
        rollbackOp(cal, result.opId);
        toast(ce, result.message || result.reason || 'הפעולה נכשלה — השינוי בוטל.', 'error');
    } else {
        const op = settleOp(cal, result.opId);
        if (result.type === 'calendarSketchDuty' || result.type === 'calendarSketchDelete') cal.sketchConfirm = null;
        toast(ce, result.warning ? `${op?.okMessage || 'נשמר'} · ${result.warning}` : (op?.okMessage || 'נשמר'), 'success');
    }
    rerender(ce);
    return true;
}

function findGroup(ce, id) {
    for (const list of Object.values(ce._workshopOrderGroups || {})) {
        const g = Array.isArray(list) ? list.find(x => x.id === id) : null;
        if (g) return g;
    }
    return null;
}

function currentEvent(cal) {
    const d = cal.drawer;
    return d?.kind === 'session' ? findEvent(cal, d.dateKey, d.typeId, d.start) : null;
}

function readHours(ce) {
    const startTime = (ce.querySelector('#scHoursStart')?.value || '').trim();
    const endTime = (ce.querySelector('#scHoursEnd')?.value || '').trim();
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { error: 'יש להזין שעות בפורמט HH:MM.' };
    if (hmToMin(startTime) >= hmToMin(endTime)) return { error: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' };
    return { startTime, endTime };
}

function empName(cal, id) {
    return cal.cache.employees.find(e => e.id === id)?.displayName || 'העובד/ת';
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Closes open filter popovers on outside clicks. Returns true when it consumed the click. */
export function calendarOutsideClick(ce, e, target) {
    const cal = ce._cal;
    if (!cal?.msOpen || e.target.closest('.sc-ms')) return false;
    cal.msOpen = null;
    if (target) return false;
    rerender(ce);
    return true;
}

function navigate(ce, mutate) {
    const cal = calState(ce);
    mutate(cal);
    cal.miniMonth = cal.anchor.slice(0, 7);
    cal.resetScroll = true;
    rerender(ce);
}

export function handleCalendarClick(ce, action, target) {
    if (!action.startsWith('cal-')) return false;
    const cal = calState(ce);
    const ds = target.dataset;
    switch (action) {
        case 'cal-today': navigate(ce, c => { c.anchor = todayKeyIL(); }); return true;
        case 'cal-prev': navigate(ce, c => { c.anchor = shiftAnchor(c.view, c.anchor, -1); }); return true;
        case 'cal-next': navigate(ce, c => { c.anchor = shiftAnchor(c.view, c.anchor, 1); }); return true;
        case 'cal-view': navigate(ce, c => { c.view = ds.view; }); return true;
        case 'cal-goto': navigate(ce, c => { c.anchor = ds.date; }); return true;
        case 'cal-goto-day': navigate(ce, c => { c.view = 'day'; c.anchor = ds.date; }); return true;
        case 'cal-mini-prev':
        case 'cal-mini-next':
            cal.miniMonth = addMonths(`${cal.miniMonth}-01`, action === 'cal-mini-next' ? 1 : -1).slice(0, 7);
            rerender(ce);
            return true;
        case 'cal-refresh': {
            const { from, to } = fetchRange(cal.view, cal.anchor);
            invalidateRange(cal, from, to);
            cal.loadingKey = null;
            ce._workshopOrderGroups = {};
            rerender(ce);
            return true;
        }
        case 'cal-ms-toggle':
            cal.msOpen = cal.msOpen === ds.key ? null : ds.key;
            rerender(ce);
            return true;
        case 'cal-filter-clear':
            cal.filters[ds.key] = [];
            rerender(ce);
            return true;
        case 'cal-legend-toggle': {
            const list = cal.filters.workshopIds;
            cal.filters.workshopIds = list.includes(ds.id) ? list.filter(x => x !== ds.id) : [...list, ds.id];
            rerender(ce);
            return true;
        }
        case 'cal-open-event':
            cal.drawer = { kind: 'session', dateKey: ds.date, typeId: ds.type, start: ds.start || null };
            cal.picker = null; cal.editHours = null; cal.removeConfirm = null;
            cal.resetDrawerScroll = true;
            cal.resetInputs = true;
            ensureGroups(ce, ds.date, ds.type, ds.start || null);
            paintDrawer(ce, { animate: !ce.querySelector('#scRoot .sc-drawer') });
            markSelected(ce);
            return true;
        case 'cal-open-day':
            cal.drawer = { kind: 'day', dateKey: ds.date };
            cal.picker = null; cal.editHours = null; cal.removeConfirm = null;
            cal.resetDrawerScroll = true;
            cal.resetInputs = true;
            paintDrawer(ce, { animate: !ce.querySelector('#scRoot .sc-drawer') });
            markSelected(ce);
            return true;
        case 'cal-jump-day':
            cal.anchor = ds.date;
            cal.miniMonth = ds.date.slice(0, 7);
            cal.drawer = { kind: 'day', dateKey: ds.date };
            cal.picker = null; cal.editHours = null; cal.removeConfirm = null;
            cal.resetScroll = true;
            cal.resetDrawerScroll = true;
            cal.resetInputs = true;
            rerender(ce);
            ce.querySelector('#scRoot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        case 'cal-close-drawer':
            cal.drawer = null;
            ce.querySelector('#scRoot .sc-drawer')?.remove();
            markSelected(ce);
            return true;
        case 'cal-tab':
            cal.drawerTab = ds.tab;
            paintDrawer(ce);
            return true;
        case 'cal-picker-open':
            cal.picker = { mode: 'add' };
            cal.removeConfirm = null;
            paintDrawer(ce);
            return true;
        case 'cal-swap-open':
            cal.picker = { mode: 'swap', fromId: ds.emp };
            cal.removeConfirm = null;
            paintDrawer(ce);
            return true;
        case 'cal-picker-close':
            cal.picker = null;
            paintDrawer(ce);
            return true;
        case 'cal-pick': {
            const ev = currentEvent(cal);
            if (!ev || !cal.picker) return true;
            const toId = ds.emp;
            const existing = subFor(cal, ev.dateKey, toId);
            const workType = existing?.status === 'SCHEDULED' ? existing.workType : 'WORKSHOP';
            if (cal.picker.mode === 'swap') {
                const fromId = cal.picker.fromId;
                runOp(ce, 'swap', ev.dateKey, { workshopTypeId: ev.typeId, fromEmployeeId: fromId, toEmployeeId: toId, workType },
                    'calendarSwap', `${empName(cal, toId)} החליף/ה את ${empName(cal, fromId)}`);
            } else {
                runOp(ce, 'assign', ev.dateKey, { workshopTypeIds: [ev.typeId], employeeId: toId, workType },
                    'calendarAssign', `${empName(cal, toId)} שובץ/ה ל${ev.name}`);
            }
            return true;
        }
        case 'cal-remove-ask':
            cal.removeConfirm = ds.emp;
            cal.picker = null;
            paintDrawer(ce);
            return true;
        case 'cal-remove-cancel':
            cal.removeConfirm = null;
            paintDrawer(ce);
            return true;
        case 'cal-remove': {
            const ev = currentEvent(cal);
            if (!ev) return true;
            runOp(ce, 'remove', ev.dateKey, { workshopTypeId: ev.typeId, employeeId: ds.emp, disposition: ds.disposition === 'delete' ? 'delete' : 'restore' },
                'calendarRemove', `${empName(cal, ds.emp)} הוסר/ה מ${ev.name}`);
            return true;
        }
        case 'cal-edit-hours':
            cal.editHours = cal.editHours === ds.emp ? null : ds.emp;
            cal.resetInputs = true;
            paintDrawer(ce);
            return true;
        case 'cal-hours-cancel':
            cal.editHours = null;
            paintDrawer(ce);
            return true;
        case 'cal-save-hours': {
            const h = readHours(ce);
            if (h.error) { toast(ce, h.error, 'error'); return true; }
            runOp(ce, 'hours', ds.date, { submissionId: ds.sub, startTime: h.startTime, endTime: h.endTime },
                'calendarUpdateHours', 'שעות המשמרת עודכנו');
            return true;
        }
        case 'cal-day-assign': {
            const employeeId = ce.querySelector('#scDayAssignEmp')?.value;
            const workType = ce.querySelector('#scDayAssignWT')?.value || 'OPENING';
            if (!employeeId) { toast(ce, 'יש לבחור עובד/ת.', 'error'); return true; }
            runOp(ce, 'assign', ds.date, { workshopTypeIds: [], employeeId, workType }, 'calendarAssign', `${empName(cal, employeeId)} שובץ/ה ליום`);
            return true;
        }
        case 'cal-day-flag': {
            const on = ds.on === '1';
            const flags = { [ds.flag]: on };
            const msg = ds.flag === 'blocked' ? (on ? 'היום נחסם להגשות' : 'חסימת היום בוטלה') : (on ? 'היום קודם' : 'קידום היום בוטל');
            runOp(ce, 'flags', ds.date, { flags }, 'calendarDayFlags', msg);
            return true;
        }
        case 'cal-save-holiday': {
            const mode = ce.querySelector('#scHolMode')?.value || '';
            const shortStart = (ce.querySelector('#scHolStart')?.value || '').trim();
            const shortEnd = (ce.querySelector('#scHolEnd')?.value || '').trim();
            if (mode === 'SHORT' && (!TIME_RE.test(shortStart) || !TIME_RE.test(shortEnd))) {
                toast(ce, 'יש להזין שעת פתיחה וסגירה ליום מקוצר.', 'error');
                return true;
            }
            runOp(ce, 'holiday', ds.date, { mode, shortStart, shortEnd }, 'calendarHolidayMode', 'מצב היום נשמר');
            return true;
        }
        case 'cal-save-note':
        case 'cal-clear-note': {
            const message = action === 'cal-clear-note' ? '' : (ce.querySelector('#scDayNote')?.value || '').trim();
            cal.resetInputs = true;
            runOp(ce, 'note', ds.date, { message }, 'calendarDayNote', message ? 'ההודעה לעובדים נשמרה' : 'ההודעה נמחקה');
            return true;
        }
        case 'cal-save-sketch':
        case 'cal-confirm-sketch': {
            const confirm = action === 'cal-confirm-sketch';
            const pending = cal.sketchConfirm;
            const startTime = confirm ? pending?.startTime : (ce.querySelector('#scSketchStart')?.value || '').trim();
            const endTime = confirm ? pending?.endTime : (ce.querySelector('#scSketchEnd')?.value || '').trim();
            if (!TIME_RE.test(startTime || '') || !TIME_RE.test(endTime || '') || startTime >= endTime) {
                toast(ce, 'יש להזין שעת התחלה ושעת סיום תקינות.', 'error');
                return true;
            }
            cal.sketchConfirm = null;
            runOp(ce, 'sketch', ds.date, { startTime, endTime, confirmOverlap: confirm }, 'calendarSketchDuty', 'שעות תפירת הסקיצות נשמרו');
            return true;
        }
        case 'cal-delete-sketch':
            cal.sketchConfirm = null;
            runOp(ce, 'sketchDelete', ds.date, {}, 'calendarSketchDelete', 'תפירת הסקיצות נמחקה');
            return true;
        case 'cal-toggle-group':
            cal.openGroups[ds.id] = !cal.openGroups[ds.id];
            paintDrawer(ce);
            return true;
        case 'cal-note-edit':
            cal.noteEdit = cal.noteEdit === ds.id ? null : ds.id;
            cal.resetInputs = true;
            paintDrawer(ce);
            ce.querySelector('#scOrderNote')?.focus();
            return true;
        case 'cal-note-cancel':
            cal.noteEdit = null;
            paintDrawer(ce);
            return true;
        case 'cal-note-save': {
            const g = findGroup(ce, ds.id);
            if (!g) return true;
            const text = (ce.querySelector('#scOrderNote')?.value || '').trim();
            const opId = `note-${Date.now()}`;
            cal.noteOps = cal.noteOps || {};
            cal.noteOps[opId] = { groupId: g.id, prev: g.internalNotes || '' };
            g.internalNotes = text;
            g.notes = g.customerNotes || text;
            cal.noteEdit = null;
            paintDrawer(ce);
            ce._dispatch('calendarOrderNote', { orderId: g.orderId || g.id, text, opId });
            return true;
        }
        case 'cal-lightbox':
            cal.lightbox = ds.img || '';
            paintLightbox(ce);
            return true;
        case 'cal-lightbox-close':
            cal.lightbox = null;
            ce.querySelector('#scRoot .sc-lightbox')?.remove();
            return true;
        case 'cal-lightbox-hold':
        case 'cal-tip':
            return true;
        case 'cal-filter-opt':
        case 'cal-filter-state':
        case 'cal-notify':
        case 'cal-hol-mode':
            return true; // handled on change
        default:
            return false;
    }
}

export function handleCalendarChange(ce, input) {
    const action = input?.dataset?.action;
    if (!action?.startsWith('cal-')) return false;
    const cal = calState(ce);
    if (action === 'cal-filter-opt') {
        const key = input.dataset.key;
        const list = cal.filters[key] || [];
        cal.filters[key] = input.checked ? [...new Set([...list, input.value])] : list.filter(v => v !== input.value);
        rerender(ce);
        return true;
    }
    if (action === 'cal-filter-state') {
        cal.filters.state = input.value || '';
        rerender(ce);
        return true;
    }
    if (action === 'cal-notify') {
        cal.notify = !!input.checked;
        return true;
    }
    if (action === 'cal-hol-mode') {
        const short = input.value === 'SHORT';
        ce.querySelectorAll('#scHolStart, #scHolEnd').forEach(el => { el.disabled = !short; });
        return true;
    }
    return false;
}
