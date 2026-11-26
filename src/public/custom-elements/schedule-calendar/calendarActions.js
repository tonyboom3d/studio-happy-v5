/**
 * Schedule calendar ("לוח שיבוץ") entry point. Isolated module: renders into #scRoot,
 * re-renders in place, talks to page code only through ce._dispatch('calendar*').
 */
import { CALENDAR_STYLE } from './calendarStyle.js';
import { fetchRange, shiftAnchor, todayKeyIL, addMonths, hmToMin, ilParts } from './calendarLayout.js';
import {
    calState, mergeRange, isRangeLoaded, invalidateRange, beginOp, settleOp, rollbackOp, findEvent, subFor,
} from './calendarStore.js';
import { renderCalendarBody, esc } from './calendarViews.js';
import { renderDrawer, groupsKey } from './calendarDrawer.js';
import { createInitialAddCustomerState, syncAddCustomerInputs, renderContactListInner } from './calendarAddCustomer.js';

function updateContactList(ce) {
    const st = ce._cal?.addCustomer;
    const el = ce.querySelector('#scAcList');
    if (!st || !el) return;
    el.innerHTML = renderContactListInner(st);
    if (st.contacts.open && !st.form.contactId) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
}

function searchContacts(ce, st, query) {
    const c = st.contacts;
    c.seq += 1;
    c.query = query;
    c.loading = true;
    updateContactList(ce);
    ce._dispatch('calendarSearchContacts', { query, seq: c.seq });
}

/** Live typing in the customer-name field: debounced contact search. */
export function handleCalendarInput(ce, input) {
    const st = ce._cal?.addCustomer;
    if (!st || input.dataset.action !== 'cal-ac-search') return false;
    st.form.organizerName = input.value;
    st.contacts.open = true;
    clearTimeout(st._searchTimer);
    st.contacts.loading = true;
    updateContactList(ce);
    st._searchTimer = setTimeout(() => searchContacts(ce, st, input.value.trim()), 250);
    return true;
}

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
    cal.drawerHtml = renderDrawer(ce);
    return `${renderCalendarBody(ce)}${cal.drawerHtml}${renderToast(cal)}`;
}

export function renderScheduleCalendar(ce) {
    queueMicrotask(() => { ensureLoaded(ce); bindTips(ce); bindDrawerDrag(ce); });
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
        hadDrawer: !!root.querySelector('.sc-drawer'),
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
    if (snap?.hadDrawer) root.querySelector('.sc-drawer')?.classList.add('sc-no-anim');
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

/** Rebuilds toolbar + grid in place; drawer, toast and lightbox nodes are kept (drawer is diffed). */
function rerender(ce) {
    const root = ce.querySelector('#scRoot');
    if (!root) { ce._scheduleRender(); return; }
    const snap = captureCalendarState(ce);
    for (const el of [...root.children]) {
        if (!el.matches('.sc-drawer, .sc-toast, .sc-lightbox')) el.remove();
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = renderCalendarBody(ce);
    root.prepend(tpl.content);
    paintDrawer(ce);
    restoreCalendarState(ce, snap);
    ensureLoaded(ce);
}

/** Replaces only the open drawer, and only when its markup changed. An already-open drawer does not slide in again. */
function paintDrawer(ce, { animate = false } = {}) {
    const root = ce.querySelector('#scRoot');
    if (!root) { rerender(ce); return; }
    const html = renderDrawer(ce);
    const prev = root.querySelector('.sc-drawer');
    const cal = calState(ce);
    if (!html) { prev?.remove(); cal.drawerHtml = ''; return; }
    if (prev && cal.drawerHtml === html && !cal.resetDrawerScroll) return;
    cal.drawerHtml = html;
    const top = prev?.querySelector('.sc-dr-body')?.scrollTop ?? 0;
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const next = tpl.content.firstElementChild;
    if (!animate || prev) next.classList.add('sc-no-anim');
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

/** Horizontal drag of the drawer by its grip/header, so it can be moved off the days it covers (mobile). */
function bindDrawerDrag(ce) {
    if (ce._scDragBound) return;
    ce._scDragBound = true;
    let drag = null;
    const clamp = (x, w) => Math.max(-(w - 60), Math.min(window.innerWidth - 60, x));
    ce.addEventListener('pointerdown', (e) => {
        const handle = e.target?.closest?.('[data-sc-grip], .sc-dr-head');
        if (!handle || e.target.closest('button, a, input, select, textarea')) return;
        const el = handle.closest('.sc-drawer');
        if (!el || !ce.contains(el)) return;
        drag = { el, id: e.pointerId, x0: e.clientX, base: calState(ce).drawerX || 0, w: el.offsetWidth };
        el.classList.add('sc-dragging');
        handle.setPointerCapture?.(e.pointerId);
    });
    ce.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const x = clamp(drag.base + e.clientX - drag.x0, drag.w);
        drag.el.style.transform = `translateX(${x}px)`;
        drag.x = x;
        e.preventDefault();
    });
    const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (drag.x != null) calState(ce).drawerX = drag.x;
        drag.el.classList.remove('sc-dragging');
        drag = null;
    };
    ce.addEventListener('pointerup', end);
    ce.addEventListener('pointercancel', end);
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
    if (result.type === 'calendarSearchContacts') {
        const st = cal.addCustomer;
        if (st && result.seq === st.contacts.seq) {
            st.contacts.loading = false;
            st.contacts.list = failed ? [] : (result.contacts || []);
            updateContactList(ce);
        }
        return true;
    }
    if (result.type === 'calendarManualPricing') {
        if (cal.addCustomer) {
            cal.addCustomer.loading = false;
            if (failed) cal.addCustomer.error = result.message || 'טעינת התמחור נכשלה.';
            else cal.addCustomer.pricingData = result.data || null;
            paintDrawer(ce);
        }
        return true;
    }
    if (result.type === 'calendarAddManualCustomer') {
        if (failed) {
            if (cal.addCustomer) {
                cal.addCustomer.submitting = false;
                cal.addCustomer.error = result.message || 'הוספת הלקוח נכשלה.';
            }
            toast(ce, result.message || 'הוספת הלקוח נכשלה.', 'error');
            paintDrawer(ce);
            return true;
        }
        cal.addCustomer = null;
        const d = cal.drawer;
        if (d?.kind === 'session') {
            const key = groupsKey(d.dateKey, d.typeId, d.start);
            if (ce._workshopOrderGroups) delete ce._workshopOrderGroups[key];
            ensureGroups(ce, d.dateKey, d.typeId, d.start);
        }
        const parts = [result.status === 'paid' ? 'הלקוח נוסף כהזמנה משולמת' : 'ההזמנה נפתחה וקישור תשלום נוצר'];
        if (result.whatsappSent) parts.push('נשלח בוואטסאפ');
        if (result.emailSent) parts.push('נשלח במייל');
        if (result.warnings?.length) parts.push(result.warnings.join(' · '));
        toast(ce, parts.join(' · '), result.warnings?.length ? 'error' : 'success');
        rerender(ce);
        return true;
    }
    if (result.type === 'calendarMarkManualPaid') {
        cal.markPaidConfirm = null;
        if (failed) {
            toast(ce, result.message || 'סימון התשלום נכשל.', 'error');
            paintDrawer(ce);
            return true;
        }
        const d = cal.drawer;
        if (d?.kind === 'session') {
            const key = groupsKey(d.dateKey, d.typeId, d.start);
            if (ce._workshopOrderGroups) delete ce._workshopOrderGroups[key];
            ensureGroups(ce, d.dateKey, d.typeId, d.start);
        }
        toast(ce, 'ההזמנה סומנה כשולמה והופעלה', 'success');
        rerender(ce);
        return true;
    }
    if (result.type === 'calendarCancelManualOrder') {
        cal.cancelOrderConfirm = null;
        if (failed) {
            toast(ce, result.message || 'ביטול ההזמנה נכשל.', 'error');
            paintDrawer(ce);
            return true;
        }
        const d = cal.drawer;
        if (d?.kind === 'session') {
            const key = groupsKey(d.dateKey, d.typeId, d.start);
            if (ce._workshopOrderGroups) delete ce._workshopOrderGroups[key];
            ensureGroups(ce, d.dateKey, d.typeId, d.start);
        }
        const msg = result.linkDeactivated ? 'ההזמנה וקישור התשלום בוטלו' : 'ההזמנה בוטלה';
        toast(ce, result.linkWarning ? `${msg} (${result.linkWarning})` : msg, 'success');
        rerender(ce);
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
    if (cal?.addCustomer?.contacts?.open && !e.target.closest('.sc-ac-pick')) {
        cal.addCustomer.contacts.open = false;
        updateContactList(ce);
    }
    if (!cal?.msOpen || e.target.closest('.sc-ms')) return false;
    cal.msOpen = null;
    if (target) return false;
    rerender(ce);
    return true;
}

/** Previous drawer (one level) when navigating from inside an open drawer; null when opened from the grid. */
function drawerOrigin(cal, target) {
    if (!cal.drawer || !target.closest('.sc-drawer')) return null;
    const { from, ...prev } = cal.drawer;
    return prev;
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
        case 'cal-toggle-flag': {
            const flag = ds.flag;
            if (flag === 'showUnattached' || flag === 'showVacations') {
                cal.filters[flag] = !cal.filters[flag];
                rerender(ce);
            }
            return true;
        }
        case 'cal-open-event':
            cal.drawer = { kind: 'session', dateKey: ds.date, typeId: ds.type, start: ds.start || null, from: drawerOrigin(cal, target) };
            cal.picker = null; cal.editHours = null; cal.removeConfirm = null;
            cal.addCustomer = null; cal.cancelOrderConfirm = null;
            cal.resetDrawerScroll = true;
            cal.resetInputs = true;
            ensureGroups(ce, ds.date, ds.type, ds.start || null);
            paintDrawer(ce, { animate: !ce.querySelector('#scRoot .sc-drawer') });
            markSelected(ce);
            return true;
        case 'cal-open-day':
            cal.drawer = { kind: 'day', dateKey: ds.date, from: drawerOrigin(cal, target) };
            cal.picker = null; cal.editHours = null; cal.removeConfirm = null;
            cal.addCustomer = null; cal.cancelOrderConfirm = null;
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
            cal.addCustomer = null; cal.cancelOrderConfirm = null;
            cal.resetScroll = true;
            cal.resetDrawerScroll = true;
            cal.resetInputs = true;
            rerender(ce);
            ce.querySelector('#scRoot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        case 'cal-drawer-back': {
            const from = cal.drawer?.from;
            if (!from) return true;
            cal.drawer = { ...from };
            cal.picker = null; cal.editHours = null; cal.removeConfirm = null;
            cal.addCustomer = null; cal.cancelOrderConfirm = null;
            cal.resetDrawerScroll = true;
            cal.resetInputs = true;
            if (from.kind === 'session') ensureGroups(ce, from.dateKey, from.typeId, from.start);
            paintDrawer(ce);
            markSelected(ce);
            return true;
        }
        case 'cal-close-drawer':
            cal.drawer = null;
            cal.drawerX = 0;
            cal.addCustomer = null;
            cal.cancelOrderConfirm = null;
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
        case 'cal-ac-open': {
            const ev = currentEvent(cal);
            if (!ev) return true;
            cal.addCustomer = createInitialAddCustomerState(ev);
            cal.cancelOrderConfirm = null;
            cal.resetInputs = true;
            paintDrawer(ce);
            ce._dispatch('calendarManualPricing', {
                dateKey: ev.dateKey,
                workshopTypeId: ev.typeId,
                sessionStart: ev.start ? ilParts(ev.start).hm : '',
                opId: `pricing-${Date.now()}`,
            });
            return true;
        }
        case 'cal-ac-search': {
            const st = cal.addCustomer;
            if (!st || st.form.contactId) return true;
            st.contacts.open = true;
            if (!st.contacts.list.length && !st.contacts.loading) searchContacts(ce, st, ds.q ?? String(target.value || ''));
            else updateContactList(ce);
            return true;
        }
        case 'cal-ac-pick': {
            const st = cal.addCustomer;
            const c = st?.contacts.list.find((x) => x.id === ds.id);
            if (!c) return true;
            syncAddCustomerInputs(ce, st);
            const f = st.form;
            f.contactId = c.id;
            f.organizerName = c.name;
            f.organizerPhone = c.phone || f.organizerPhone;
            f.organizerEmail = c.email || f.organizerEmail;
            f.locked = { phone: !!c.phone, email: !!c.email };
            st.contacts.open = false;
            paintDrawer(ce);
            return true;
        }
        case 'cal-ac-new': {
            const st = cal.addCustomer;
            if (!st) return true;
            st.contacts.open = false;
            updateContactList(ce);
            return true;
        }
        case 'cal-ac-clear': {
            const st = cal.addCustomer;
            if (!st) return true;
            syncAddCustomerInputs(ce, st);
            const f = st.form;
            if (f.locked?.phone) f.organizerPhone = '';
            if (f.locked?.email) f.organizerEmail = '';
            f.contactId = '';
            f.organizerName = '';
            f.locked = { phone: false, email: false };
            st.contacts.list = [];
            paintDrawer(ce);
            ce.querySelector('#scAcName')?.focus();
            return true;
        }
        case 'cal-ac-close':
            cal.addCustomer = null;
            paintDrawer(ce);
            return true;
        case 'cal-ac-qty': {
            const st = cal.addCustomer;
            if (!st) return true;
            syncAddCustomerInputs(ce, st);
            const field = ds.field === 'children' ? 'children' : 'adults';
            const delta = Number(ds.delta) || 0;
            const next = Math.max(0, (st.form[field] || 0) + delta);
            const other = field === 'adults' ? st.form.children : st.form.adults;
            if (next + other < 1) return true;
            st.form[field] = next;
            paintDrawer(ce);
            return true;
        }
        case 'cal-ac-next': {
            const st = cal.addCustomer;
            if (!st) return true;
            syncAddCustomerInputs(ce, st);
            if (!String(st.form.organizerName || '').trim()) {
                st.error = 'יש להזין שם לקוח.';
                paintDrawer(ce);
                return true;
            }
            if ((st.form.adults || 0) + (st.form.children || 0) < 1) {
                st.error = 'יש לבחור לפחות משתתף אחד.';
                paintDrawer(ce);
                return true;
            }
            st.error = '';
            const hasPhone = !!String(st.form.organizerPhone || '').trim();
            const hasEmail = !!String(st.form.organizerEmail || '').trim();
            st.form.sendWhatsApp = hasPhone;
            st.form.sendEmail = hasEmail && !hasPhone;
            st.step = 2;
            paintDrawer(ce);
            return true;
        }
        case 'cal-ac-back': {
            const st = cal.addCustomer;
            if (!st) return true;
            syncAddCustomerInputs(ce, st);
            st.step = 1;
            st.error = '';
            paintDrawer(ce);
            return true;
        }
        case 'cal-ac-mode': {
            const st = cal.addCustomer;
            if (!st) return true;
            syncAddCustomerInputs(ce, st);
            st.form.paymentMode = ds.mode === 'paid' ? 'paid' : 'link';
            st.error = '';
            paintDrawer(ce);
            return true;
        }
        case 'cal-ac-submit': {
            const st = cal.addCustomer;
            if (!st || st.submitting) return true;
            syncAddCustomerInputs(ce, st);
            const f = st.form;
            if (f.paymentMode === 'link') {
                if (f.sendEmail && !String(f.organizerEmail || '').trim()) {
                    st.error = 'לשליחה במייל יש להזין כתובת אימייל.';
                    paintDrawer(ce);
                    return true;
                }
                if (f.sendWhatsApp && !String(f.organizerPhone || '').trim()) {
                    st.error = 'לשליחה בוואטסאפ יש להזין מספר טלפון.';
                    paintDrawer(ce);
                    return true;
                }
            }
            st.submitting = true;
            st.error = '';
            paintDrawer(ce);
            ce._dispatch('calendarAddManualCustomer', {
                dateKey: st.dateKey,
                opId: `addcust-${Date.now()}`,
                order: {
                    dateKey: st.dateKey,
                    workshopTypeId: st.typeId,
                    sessionStart: st.start ? ilParts(st.start).hm : '',
                    organizerName: f.organizerName,
                    organizerPhone: f.organizerPhone,
                    organizerEmail: f.organizerEmail,
                    contactId: f.locked?.email ? f.contactId : '',
                    customTotal: String(f.customPrice ?? '').trim() === '' ? null : Number(f.customPrice),
                    adults: f.adults,
                    children: f.children,
                    internalNotes: f.internalNotes,
                    customerNotes: f.customerNotes,
                    paymentMode: f.paymentMode,
                    sendEmail: f.paymentMode === 'link' && !!f.sendEmail,
                    sendWhatsApp: f.paymentMode === 'link' && !!f.sendWhatsApp,
                },
            });
            return true;
        }
        case 'cal-markpaid-ask':
            cal.markPaidConfirm = ds.id;
            paintDrawer(ce);
            return true;
        case 'cal-markpaid-cancel':
            cal.markPaidConfirm = null;
            paintDrawer(ce);
            return true;
        case 'cal-markpaid-confirm':
            ce._dispatch('calendarMarkManualPaid', {
                dateKey: cal.drawer?.dateKey || '',
                orderId: ds.id,
                opId: `markpaid-${Date.now()}`,
            });
            return true;
        case 'cal-cancel-order-ask':
            cal.cancelOrderConfirm = ds.id;
            paintDrawer(ce);
            return true;
        case 'cal-cancel-order-cancel':
            cal.cancelOrderConfirm = null;
            paintDrawer(ce);
            return true;
        case 'cal-cancel-order-confirm':
            ce._dispatch('calendarCancelManualOrder', {
                dateKey: cal.drawer?.dateKey || '',
                orderId: ds.id,
                opId: `cancelord-${Date.now()}`,
            });
            return true;
        case 'cal-copy-paylink':
            if (ds.url && navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(ds.url).then(
                    () => toast(ce, 'קישור התשלום הועתק', 'success'),
                    () => toast(ce, 'לא ניתן להעתיק — פתחו את הקישור ישירות.', 'error'),
                );
            }
            return true;
        case 'cal-ac-chk':
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
        cal.filters[input.dataset.key] = input.value || '';
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
    if (action === 'cal-ac-chk') {
        syncAddCustomerInputs(ce, cal.addCustomer);
        return true;
    }
    return false;
}
