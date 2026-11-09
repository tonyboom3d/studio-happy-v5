/** Schedule-calendar views: toolbar, side panel, week/day time grid, month grid. */
import {
    HOUR_PX, DOW_LONG, DOW_SHORT, MONTHS, pad2, parseKey, rangeKeys, visibleRange, monthGrid,
    rangeTitle, hourBounds, layoutOverlaps, ilParts, todayKeyIL, dowOf,
} from './calendarLayout.js';
import { calState, buildEvents, empById, eventCapacity, coverageIssue, pendingCount, isRangeLoaded } from './calendarStore.js';
import { colorForType } from './calendarColors.js';

export function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
    return String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
}

export function dayFlags(cal, dateKey) {
    const st = cal.cache.settings;
    const holiday = st.holidays.find(h => h.date === dateKey) || null;
    return {
        blocked: st.blockedDates.includes(dateKey),
        promoted: st.promotedDates.includes(dateKey),
        holiday,
        closed: holiday?.mode === 'CLOSED',
        note: st.dayNotes[dateKey] || null,
        sketch: st.sketchSewingDays[dateKey] || null,
    };
}

function staffNames(ev, byId) {
    return ev.assignedIds.map(id => byId[id]?.displayName || '').filter(Boolean);
}

export function eventStaffState(cal, ev) {
    const assigned = ev.assignedIds.length;
    const missing = ev.required > 0 && assigned < ev.required;
    const hoursIssue = ev.assignedIds.some(id => coverageIssue(cal, ev.dateKey, id));
    return { assigned, missing, hoursIssue };
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function renderMultiSelect(cal, key, label, options) {
    const selected = cal.filters[key];
    const open = cal.msOpen === key;
    const count = selected.length;
    return `<div class="sc-ms">
        <button type="button" class="sc-btn sc-ms-btn ${count ? 'has' : ''}" data-action="cal-ms-toggle" data-key="${key}">${esc(label)}${count ? ` (${count})` : ''} <span style="font-size:10px">▾</span></button>
        ${open ? `<div class="sc-ms-pop">
            ${options.length ? options.map(o => `<label class="sc-ms-opt">
                <input type="checkbox" data-action="cal-filter-opt" data-key="${key}" value="${esc(o.value)}" ${selected.includes(o.value) ? 'checked' : ''}>
                ${o.color ? `<span class="sc-swatch" style="background:${o.color}"></span>` : ''}
                <span>${esc(o.label)}</span>
            </label>`).join('') : '<div class="sc-empty">אין אפשרויות</div>'}
            <div class="sc-ms-foot">
                <button type="button" class="sc-btn ghost sm" data-action="cal-filter-clear" data-key="${key}">ניקוי</button>
                <button type="button" class="sc-btn sm" data-action="cal-ms-toggle" data-key="${key}">סגירה</button>
            </div>
        </div>` : ''}
    </div>`;
}

function renderToolbar(ce, cal) {
    const c = cal.cache;
    const pending = pendingCount(cal);
    const wsOpts = c.workshopTypes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'))
        .map(t => ({ value: t.id, label: t.name, color: colorForType(t.id, c.workshopTypes).border }));
    const empOpts = c.employees.filter(e => e.active)
        .map(e => ({ value: e.id, label: e.displayName, color: e.color || null }));
    const perms = ce._adminData?.permissions || {};
    const views = [['day', 'יום'], ['week', 'שבוע'], ['month', 'חודש']];
    return `<div class="sc-toolbar">
        <button type="button" class="sc-btn" data-action="cal-today">היום</button>
        <button type="button" class="sc-icon-btn" data-action="cal-prev" title="הקודם" aria-label="הקודם">›</button>
        <button type="button" class="sc-icon-btn" data-action="cal-next" title="הבא" aria-label="הבא">‹</button>
        <h2 class="sc-title">${esc(rangeTitle(cal.view, cal.anchor))}</h2>
        <span class="sc-save-pill ${pending ? 'busy' : ''}">${pending ? '<span class="sc-mini-spin"></span>שומר…' : (c.ready ? '✓ כל השינויים נשמרו' : '')}</span>
        <span class="sc-spacer"></span>
        ${renderMultiSelect(cal, 'workshopIds', 'סדנאות', wsOpts)}
        ${renderMultiSelect(cal, 'employeeIds', 'עובדים', empOpts)}
        <select class="sc-select ${cal.filters.state ? 'has' : ''}" data-action="cal-filter-state" aria-label="סינון לפי איוש ומשתתפים">
            ${[['', 'כל הסדנאות'], ['noStaff', 'ללא אנשי צוות'], ['withStaff', 'עם אנשי צוות'], ['noParticipants', 'ללא משתתפים']]
                .map(([v, l]) => `<option value="${v}" ${cal.filters.state === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <div class="sc-seg" role="tablist">${views.map(([v, l]) => `<button type="button" class="${cal.view === v ? 'active' : ''}" data-action="cal-view" data-view="${v}">${l}</button>`).join('')}</div>
        <button type="button" class="sc-icon-btn" data-action="cal-refresh" title="רענון" aria-label="רענון" style="font-size:16px">⟳</button>
        ${perms.manageEmployees ? `<button type="button" class="sc-btn" data-action="admin-page" data-page="messages">✉ הודעות לעובדים</button>` : ''}
        <button type="button" class="sc-btn primary" data-action="admin-open-auto-assign">✨ שיבוץ אוטומטי</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Side panel: mini calendar + legend
// ---------------------------------------------------------------------------

function renderMiniCal(cal) {
    const monthKey = `${cal.miniMonth}-01`;
    const { y, m } = parseKey(monthKey);
    const { from, to } = monthGrid(monthKey);
    const vis = visibleRange(cal.view, cal.anchor);
    const today = todayKeyIL();
    const days = rangeKeys(from, to).map(k => {
        const p = parseKey(k);
        const cls = [
            'sc-mini-day',
            p.m !== m ? 'out' : '',
            k === today ? 'today' : '',
            k >= vis.from && k <= vis.to && cal.view !== 'month' ? 'inrange' : '',
            cal.cache.days[k]?.types?.length ? 'has' : '',
        ].join(' ');
        return `<button type="button" class="${cls}" data-action="cal-goto" data-date="${k}">${p.d}</button>`;
    }).join('');
    return `<div>
        <div class="sc-mini-head">
            <span>${MONTHS[m - 1]} ${y}</span>
            <span>
                <button type="button" class="sc-icon-btn" style="width:24px;height:24px;font-size:16px" data-action="cal-mini-prev" aria-label="חודש קודם">›</button>
                <button type="button" class="sc-icon-btn" style="width:24px;height:24px;font-size:16px" data-action="cal-mini-next" aria-label="חודש הבא">‹</button>
            </span>
        </div>
        <div class="sc-mini-grid">${DOW_SHORT.map(d => `<span class="sc-mini-dow">${d}</span>`).join('')}${days}</div>
    </div>`;
}

function renderSide(cal, events) {
    const c = cal.cache;
    const presentIds = new Set(events.map(e => e.typeId));
    const types = c.workshopTypes.filter(t => presentIds.has(t.id) || cal.filters.workshopIds.includes(t.id))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    const sel = cal.filters.workshopIds;
    const legend = types.length ? types.map(t => {
        const col = colorForType(t.id, c.workshopTypes);
        const off = sel.length && !sel.includes(t.id);
        return `<button type="button" class="sc-legend-item ${off ? 'off' : ''}" data-action="cal-legend-toggle" data-id="${esc(t.id)}" title="סינון לפי סדנה">
            <span class="sc-swatch" style="background:${col.border}"></span><span>${esc(t.name)}</span>
        </button>`;
    }).join('') : '<div class="sc-empty" style="padding:6px 0;text-align:start">אין סדנאות בטווח המוצג</div>';
    const total = events.length;
    const missing = events.filter(ev => ev.required > 0 && ev.assignedIds.length < ev.required).length;
    return `<aside class="sc-side">
        ${renderMiniCal(cal)}
        <div><p class="sc-side-title">סדנאות</p><div class="sc-legend">${legend}</div></div>
        <div class="sc-side-stats">
            <span><b>${total}</b> מפגשים בתצוגה</span>
            <span><b style="${missing ? 'color:#e62214' : ''}">${missing}</b> מפגשים חסרי צוות</span>
        </div>
    </aside>`;
}

// ---------------------------------------------------------------------------
// Week / day grid
// ---------------------------------------------------------------------------

function renderDayHeader(cal, k, view) {
    const p = parseKey(k);
    const f = dayFlags(cal, k);
    const today = k === todayKeyIL();
    const tags = [
        f.holiday?.name || f.holiday?.mode ? `<span class="sc-tag hol" title="${esc(f.holiday.name || '')}">${esc(f.holiday.name || (f.closed ? 'סגור' : 'מקוצר'))}${f.closed && f.holiday.name ? ' · סגור' : ''}</span>` : '',
        f.blocked ? '<span class="sc-tag blk">חסום</span>' : '',
        f.note ? `<span class="sc-tag note sc-tip" data-tip="${esc(f.note.message || '')}">✉ הודעה</span>` : '',
    ].join('');
    return `<button type="button" class="sc-dh ${today ? 'today' : ''}" data-action="cal-open-day" data-date="${k}" title="פרטי היום והגדרות">
        <span class="sc-dh-row"><span class="sc-dh-dow">${view === 'day' ? `יום ${DOW_LONG[dowOf(k)]}` : DOW_LONG[dowOf(k)]}</span><span class="sc-dh-num">${pad2(p.d)}</span></span>
        <span class="sc-dh-tags">${tags}</span>
    </button>`;
}

function noteBadge(cal, dateKey) {
    const msg = dayFlags(cal, dateKey).note?.message;
    if (!msg) return '';
    return `<span class="sc-note-badge" data-action="cal-tip" data-tip="${esc(msg)}">📝</span>`;
}

function renderEventBlock(cal, ev, startHour, byId) {
    const col = colorForType(ev.typeId, cal.cache.workshopTypes);
    const top = ((ev.startMin - startHour * 60) / 60) * HOUR_PX;
    const height = Math.max(22, ((ev.endMin - ev.startMin) / 60) * HOUR_PX - 2);
    const cols = ev.cols || 1;
    const cap = eventCapacity(ev);
    const names = staffNames(ev, byId);
    const st = eventStaffState(cal, ev);
    const d = cal.drawer;
    const sel = d?.kind === 'session' && d.dateKey === ev.dateKey && d.typeId === ev.typeId && (d.start || '') === (ev.start || '');
    const warnTip = [st.missing ? `חסר צוות (${st.assigned}/${ev.required})` : '', st.hoursIssue ? 'שעות משמרת לא מכסות את הסדנה' : ''].filter(Boolean).join(' · ');
    const time = `${ilParts(ev.start).hm}${ev.end ? `–${ilParts(ev.end).hm}` : ''}`;
    return `<button type="button" class="sc-ev ${sel ? 'sel' : ''}" data-action="cal-open-event" data-date="${ev.dateKey}" data-type="${esc(ev.typeId)}" data-start="${esc(ev.start || '')}"
        style="top:${top}px;height:${height}px;inset-inline-start:calc(${(ev.col || 0) * 100 / cols}% + 2px);width:calc(${100 / cols}% - 4px);background:${col.bg};border-inline-start:3px solid ${col.border};color:${col.text}"
        title="${esc(`${ev.name} · ${time}`)}">
        <span class="sc-ev-title">${noteBadge(cal, ev.dateKey)}${warnTip ? `<span class="sc-ev-warn" title="${esc(warnTip)}">!</span>` : ''}<span style="overflow:hidden;text-overflow:ellipsis">${esc(ev.name)}</span></span>
        <span class="sc-ev-line">${cap.total != null ? `${cap.booked}/${cap.total} משתתפים` : `${cap.booked} משתתפים`}</span>
        <span class="sc-ev-line">${names.length ? `עם ${esc(names.join(', '))}` : '<b>ללא צוות</b>'}${ev.required ? ` · ${st.assigned}/${ev.required}` : ''}</span>
        <span class="sc-ev-line" style="opacity:.75">${esc(time)}</span>
    </button>`;
}

function manualShiftChips(cal, k, byId) {
    return (cal.cache.subsByDate[k] || [])
        .filter(s => s.status === 'SCHEDULED' && !(s.assignedTypeIds || []).length)
        .filter(s => !cal.filters.employeeIds.length || cal.filters.employeeIds.includes(s.employeeId))
        .map(s => {
            const label = { OPENING: 'פתיחה', CLOSING: 'קיפול' }[s.workType] || 'משמרת';
            return `<button type="button" class="sc-chip" data-action="cal-open-day" data-date="${k}" title="${esc(`${label} · ${s.startTime}–${s.endTime}`)}">${esc(label)} · ${esc(byId[s.employeeId]?.displayName || '')}</button>`;
        });
}

function renderTimeGrid(cal, view) {
    const { from, to } = visibleRange(view, cal.anchor);
    const keys = rangeKeys(from, to);
    const events = buildEvents(cal, keys);
    const timed = events.filter(e => !e.allDay);
    const { start, end } = hourBounds(timed);
    const height = (end - start) * HOUR_PX;
    const byId = empById(cal);
    const today = todayKeyIL();
    const now = ilParts(new Date());

    const allDayCells = keys.map(k => [
        ...events.filter(e => e.allDay && e.dateKey === k).map(ev => {
            const col = colorForType(ev.typeId, cal.cache.workshopTypes);
            return `<button type="button" class="sc-chip" style="background:${col.bg};color:${col.text};border-inline-start:3px solid ${col.border}" data-action="cal-open-event" data-date="${k}" data-type="${esc(ev.typeId)}" data-start="">${esc(ev.name)}</button>`;
        }),
        ...manualShiftChips(cal, k, byId),
    ]);
    const hasAllDay = allDayCells.some(c => c.length);

    const hours = [];
    for (let h = start + 1; h < end; h++) {
        hours.push(`<span class="sc-hour-label" style="top:${(h - start) * HOUR_PX}px">${pad2(h)}:00</span>`);
    }
    const showNow = keys.includes(today) && now.minutes >= start * 60 && now.minutes <= end * 60;
    const nowTop = ((now.minutes - start * 60) / 60) * HOUR_PX;

    const cols = keys.map(k => {
        const f = dayFlags(cal, k);
        const dayEvents = layoutOverlaps(timed.filter(e => e.dateKey === k));
        return `<div class="sc-col ${k === today ? 'today' : ''} ${f.closed || f.blocked ? 'closed' : ''}" style="height:${height}px">
            ${dayEvents.map(ev => renderEventBlock(cal, ev, start, byId)).join('')}
            ${showNow && k === today ? `<div class="sc-now" style="top:${nowTop}px"></div>` : ''}
        </div>`;
    }).join('');

    return {
        events,
        html: `<div class="sc-scroll" data-sc-scroll="1">
            <div class="sc-wk ${view === 'day' ? 'day' : ''}" style="--sc-cols:${keys.length}">
                <div class="sc-wk-head"><span></span>${keys.map(k => renderDayHeader(cal, k, view)).join('')}</div>
                ${hasAllDay ? `<div class="sc-allday"><span class="sc-allday-label">ללא שעה</span>${allDayCells.map(c => `<div class="sc-allday-cell">${c.join('')}</div>`).join('')}</div>` : ''}
                <div class="sc-wk-body">
                    <div class="sc-gutter" style="height:${height}px">${hours.join('')}${showNow ? `<span class="sc-now-pill" style="top:${nowTop}px">${now.hm}</span>` : ''}</div>
                    ${cols}
                </div>
            </div>
        </div>`,
    };
}

// ---------------------------------------------------------------------------
// Month grid
// ---------------------------------------------------------------------------

const MONTH_CHIPS = 3;

function renderMonth(cal) {
    const { from, to } = monthGrid(cal.anchor);
    const keys = rangeKeys(from, to);
    const events = buildEvents(cal, keys);
    const month = parseKey(cal.anchor).m;
    const today = todayKeyIL();
    const cells = keys.map(k => {
        const p = parseKey(k);
        const f = dayFlags(cal, k);
        const dayEvents = events.filter(e => e.dateKey === k).sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1));
        const chips = dayEvents.slice(0, MONTH_CHIPS).map(ev => {
            const col = colorForType(ev.typeId, cal.cache.workshopTypes);
            const st = eventStaffState(cal, ev);
            return `<button type="button" class="sc-mchip" style="background:${col.bg};color:${col.text};border-inline-start:3px solid ${col.border}" data-action="cal-open-event" data-date="${k}" data-type="${esc(ev.typeId)}" data-start="${esc(ev.start || '')}" title="${esc(ev.name)}">
                ${noteBadge(cal, k)}${st.missing || st.hoursIssue ? '<span class="sc-ev-warn">!</span>' : ''}${ev.start ? `<span class="t">${ilParts(ev.start).hm}</span>` : ''}<span class="n">${esc(ev.name)}</span>
            </button>`;
        }).join('');
        const more = dayEvents.length > MONTH_CHIPS
            ? `<button type="button" class="sc-more" data-action="cal-goto-day" data-date="${k}">+${dayEvents.length - MONTH_CHIPS} נוספים</button>` : '';
        const tag = f.holiday?.name ? `<span class="sc-tag hol" title="${esc(f.holiday.name)}">${esc(f.holiday.name)}</span>`
            : (f.blocked ? '<span class="sc-tag blk">חסום</span>' : (f.note ? `<span class="sc-tag note sc-tip" data-tip="${esc(f.note.message || '')}">✉</span>` : ''));
        return `<div class="sc-mc ${p.m !== month ? 'out' : ''} ${k === today ? 'today' : ''} ${f.closed ? 'closed' : ''}">
            <div class="sc-mc-head"><button type="button" class="sc-mc-num" data-action="cal-goto-day" data-date="${k}" title="תצוגת יום">${p.d}</button>
                <span style="display:flex;gap:3px;align-items:center;min-width:0">${tag}<button type="button" class="sc-icon-btn" style="width:22px;height:22px;font-size:12px" data-action="cal-open-day" data-date="${k}" title="פרטי היום והגדרות">⚙</button></span>
            </div>
            ${chips}${more}
        </div>`;
    }).join('');
    return {
        events,
        html: `<div class="sc-month">${DOW_LONG.map(d => `<div class="sc-mdow">${d}</div>`).join('')}${cells}</div>`,
    };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function renderCalendarBody(ce) {
    const cal = calState(ce);
    const view = cal.view === 'month' ? renderMonth(cal) : renderTimeGrid(cal, cal.view);
    const vis = visibleRange(cal.view, cal.anchor);
    const loading = !isRangeLoaded(cal, vis.from, vis.to);
    return `${renderToolbar(ce, cal)}
        <div class="sc-body">
            ${renderSide(cal, view.events)}
            <section class="sc-main">
                ${loading ? '<div class="sc-loading"><span class="sc-mini-spin"></span>טוען סדנאות…</div>' : ''}
                ${view.html}
            </section>
        </div>`;
}
