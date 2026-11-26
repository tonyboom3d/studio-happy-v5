/**
 * Submission tracker ("מעקב הגשות"): per-employee monthly progress, and an inline month
 * calendar per employee (submissions, time off, workshops + staff) with multi-select assign.
 */
import { colorForType } from '../../schedule-calendar/calendarColors.js';

const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const SUB_CLASS = { SUBMITTED: 'sub', STANDBY: 'stby', SCHEDULED: 'sch', REJECTED: 'rej' };
const SUB_LABEL = { SUBMITTED: 'הוגש', STANDBY: 'בהמתנה', SCHEDULED: 'משובץ/ת', REJECTED: 'נדחה' };

const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });

export function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function trkState(ce) {
    if (!ce._trk) ce._trk = { empId: null, sel: new Set(), confirm: false, notify: true, tableOpen: false };
    return ce._trk;
}

function todayKey() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function hm(iso) {
    if (!iso) return '';
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? '' : hmFmt.format(dt);
}

function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
}

function monthKeys(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return { lead, keys: Array.from({ length: days }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`) };
}

function pctOf(t) {
    if (!t.required) return 100;
    return Math.min(100, Math.round((t.submitted / t.required) * 100));
}

function level(pct) {
    if (pct >= 100) return 'done';
    return pct < 50 ? 'low' : '';
}

/** Workshops of one day with paid headcount, time range and assigned staff. */
export function dayWorkshops(d, dateKey) {
    return (d.days?.[dateKey]?.types || []).map(t => {
        const slots = t.slots || [];
        const people = slots.reduce((s, x) => s + (x.adults || 0) + (x.children || 0), 0);
        const times = slots.map(s => hm(s.start)).filter(Boolean);
        return { typeId: t.typeId, name: t.name, people, times, assignedIds: t.assignedEmployeeIds || [] };
    }).sort((a, b) => (a.times[0] || '99').localeCompare(b.times[0] || '99'));
}

function vacationOn(vacs, dateKey) {
    return vacs.find(v => v.startDate <= dateKey && dateKey <= v.endDate) || null;
}

function renderWorkshop(ce, d, emp, dateKey, ws, { locked }) {
    const st = trkState(ce);
    const key = `${dateKey}|${ws.typeId}`;
    const mine = ws.assignedIds.includes(emp.id);
    const selected = st.sel.has(key);
    const skilled = (emp.skillIds || []).includes(ws.typeId);
    const byId = Object.fromEntries((d.employees || []).map(e => [e.id, e]));
    const staff = ws.assignedIds.map(id => firstName(byId[id]?.displayName)).filter(Boolean);
    const col = colorForType(ws.typeId, d.workshopTypes).border;
    const cls = ['trk-ws', ws.people ? '' : 'empty', mine ? 'mine' : '', selected ? 'sel' : '', locked && !mine ? 'off' : ''].join(' ');
    const control = mine
        ? '<span class="trk-ok" title="משובץ/ת לסדנה זו">✓</span>'
        : `<input type="checkbox" data-action="admin-trk-ws" data-key="${esc(key)}" ${selected ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="בחירת ${esc(ws.name)}">`;
    const title = [ws.name, ws.times.join(', '), `${ws.people} נרשמו`, staff.length ? `צוות: ${staff.join(', ')}` : 'ללא צוות', skilled ? '' : 'ללא הכשרה לסדנה זו'].filter(Boolean).join('\n');
    return `<label class="${cls}" style="--c:${col}" title="${esc(title)}">
        <span class="trk-ws-top">${control}<span class="nm">${skilled ? '' : '⚠ '}${esc(ws.name)}</span><span class="pp">👥${ws.people}</span></span>
        <span class="trk-ws-staff ${staff.length ? '' : 'none'}">${ws.times[0] ? `${esc(ws.times[0])} · ` : ''}${staff.length ? esc(staff.join(', ')) : 'ללא צוות'}</span>
    </label>`;
}

function renderDay(ce, d, emp, dateKey, ctx) {
    const sub = ctx.subs.find(s => s.date === dateKey);
    const vac = vacationOn(ctx.vacs, dateKey);
    const hol = (d.settings?.holidays || []).find(h => h.date === dateKey);
    const closed = hol?.mode === 'CLOSED';
    const past = dateKey < ctx.today;
    const vacApproved = vac?.status === 'APPROVED';
    const workshops = dayWorkshops(d, dateKey);
    const locked = past || closed || vacApproved;
    const tags = [
        vac ? `<span class="trk-tag vac ${vacApproved ? '' : 'pend'}" title="${esc(vac.notes || '')}">${vacApproved ? 'חופש' : 'בקשת חופש'}</span>` : '',
        hol?.mode === 'SHORT' ? `<span class="trk-tag short">מקוצר ${esc(hol.shortStart || '')}–${esc(hol.shortEnd || '')}</span>` : '',
        closed ? '<span class="trk-tag">סגור</span>' : '',
        hol?.name && hol.mode !== 'SHORT' && !closed ? `<span class="trk-tag">${esc(hol.name)}</span>` : '',
    ].join('');
    const idle = !sub && !vac && !workshops.length && !hol;
    const dow = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
    const cls = ['trk-day', past ? 'past' : '', dateKey === ctx.today ? 'today' : '', sub && sub.status !== 'REJECTED' ? `has-sub ${SUB_CLASS[sub.status] || ''}` : '', vacApproved ? 'vac' : '', closed ? 'closed' : '', idle ? 'idle' : ''].join(' ');
    return `<div class="${cls}">
        <div class="trk-dh"><span class="n">${Number(dateKey.slice(8))}</span><span class="w">יום ${DOW[dow]}</span>${tags}</div>
        ${sub ? `<div class="trk-sub ${SUB_CLASS[sub.status] || ''}" title="${esc(SUB_LABEL[sub.status] || sub.status)}">${esc(sub.startTime)}–${esc(sub.endTime)}</div>` : ''}
        ${workshops.map(ws => renderWorkshop(ce, d, emp, dateKey, ws, { locked })).join('')}
    </div>`;
}

export function renderAssignBar(ce, d) {
    const st = trkState(ce);
    const emp = (d.employees || []).find(e => e.id === st.empId);
    const n = st.sel.size;
    if (!emp || !n) return '<div class="trk-bar" id="trkBar" hidden></div>';
    const name = esc(emp.displayName);
    if (st.confirm) {
        const items = [...st.sel].sort().map(k => {
            const [dateKey, typeId] = k.split('|');
            const ws = dayWorkshops(d, dateKey).find(w => w.typeId === typeId);
            return `<li>${dateKey.slice(8)}/${dateKey.slice(5, 7)} · ${esc(ws?.name || '')}${ws?.times[0] ? ` · ${esc(ws.times[0])}` : ''}</li>`;
        }).join('');
        return `<div class="trk-bar" id="trkBar">
            <span>לאשר צירוף של <b>${name}</b> ל-${n} סדנאות?</span><span class="sp"></span>
            <label><input type="checkbox" data-action="admin-trk-notify" ${st.notify ? 'checked' : ''}> שליחת וואטסאפ</label>
            <button type="button" class="epa-btn primary" data-action="admin-trk-assign-confirm">אישור</button>
            <button type="button" class="epa-btn" data-action="admin-trk-assign-cancel">חזרה</button>
            <ul>${items}</ul>
        </div>`;
    }
    return `<div class="trk-bar" id="trkBar">
        <span>נבחרו <b>${n}</b> סדנאות לצירוף של ${name}</span><span class="sp"></span>
        <button type="button" class="epa-btn primary" data-action="admin-trk-assign">צירוף לסדנאות</button>
        <button type="button" class="epa-btn" data-action="admin-trk-clear">ניקוי</button>
    </div>`;
}

function renderPanel(ce, d, t, emp) {
    const { lead, keys } = monthKeys(d.monthKey);
    const ctx = {
        today: todayKey(),
        subs: (d.submissions || []).filter(s => s.employeeId === emp.id),
        vacs: (d.monthVacations || []).filter(v => v.employeeId === emp.id && v.status !== 'REJECTED'),
    };
    const pct = pctOf(t);
    const canAssign = !!d.permissions?.manageScheduling;
    const blanks = Array.from({ length: lead }, () => '<div class="trk-day blank"></div>').join('');
    return `<div class="trk-panel">
        <div class="trk-panel-head">
            <h4>${esc(emp.displayName)} · ${t.submitted}/${t.required} משמרות (${pct}%)</h4>
            ${!t.met && canAssign ? `<button type="button" class="epa-btn" data-action="admin-nudge" data-emp="${esc(emp.id)}">שליחת תזכורת</button>` : ''}
            <div class="trk-legend">
                <span><i style="background:#3b82f6"></i>הגשה</span>
                <span><i style="background:#22c55e"></i>משובץ/ת</span>
                <span><i style="background:#ede9fe"></i>חופש</span>
                <span><i style="background:#f8fafc;border:1px solid #cbd5e1"></i>ללא נרשמים</span>
                ${canAssign ? '<span>☑ סמנו סדנאות לצירוף</span>' : ''}
            </div>
        </div>
        <div class="trk-cal">
            ${DOW.map(n => `<div class="trk-dow">${n}</div>`).join('')}
            ${blanks}${keys.map(k => renderDay(ce, d, emp, k, ctx)).join('')}
        </div>
        ${canAssign ? renderAssignBar(ce, d) : ''}
    </div>`;
}

function renderRow(ce, d, t, emp, open) {
    const pct = pctOf(t);
    const wk = t.weekend || {};
    const personal = emp?.minShiftsPerWeek != null;
    const goal = personal ? `יעד אישי · ${emp.minShiftsPerWeek} בשבוע` : `ברירת מחדל · ${d.settings?.defaultMinShiftsPerWeek ?? '—'} בשבוע`;
    return `<button type="button" class="trk-row ${open ? 'open' : ''}" data-action="admin-trk-emp" data-emp="${esc(t.employeeId)}" aria-expanded="${open}">
        <span class="trk-name"><span class="trk-dot" style="background:${esc(emp?.color || '#94a3b8')}"></span><span>${esc(t.name)}<small>${esc(goal)}</small></span></span>
        <span class="trk-meter"><span class="trk-fill ${level(pct)}" style="width:${pct}%"></span></span>
        <span class="trk-num"><b>${pct}%</b> · ${t.submitted}/${t.required}</span>
        <span class="trk-wk ${wk.met === false ? 'miss' : ''}">שישי ${wk.fridays?.submitted ?? 0}/${wk.fridays?.required ?? 0} · שבת ${wk.saturdays?.submitted ?? 0}/${wk.saturdays?.required ?? 0}</span>
        <span class="trk-chev">${open ? '▴' : '▾'}</span>
    </button>`;
}

/** `parts.monthControls` / `parts.submissionsTable` come from the admin module (shared widgets). */
export function renderTracker(ce, d, parts) {
    const st = trkState(ce);
    for (const k of st.sel) if (!k.startsWith(d.monthKey)) st.sel.delete(k);
    const tracker = d.tracker || [];
    const byId = Object.fromEntries((d.employees || []).map(e => [e.id, e]));
    const met = tracker.filter(t => t.met).length;
    const avg = tracker.length ? Math.round(tracker.reduce((s, t) => s + pctOf(t), 0) / tracker.length) : 0;
    const subsCount = (d.submissions || []).filter(s => s.status !== 'REJECTED').length;
    const rows = tracker.map(t => {
        const emp = byId[t.employeeId];
        const open = st.empId === t.employeeId && !!emp;
        return `${renderRow(ce, d, t, emp, open)}${open ? renderPanel(ce, d, t, emp) : ''}`;
    }).join('');
    return `<div class="epa-page-head"><div><h2>מעקב הגשות</h2><p>אחוז ההגשה של כל עובד/ת מול היעד החודשי · לחיצה על עובד/ת פותחת את הלוח שלו/ה</p></div>${parts.monthControls}</div>
        <div class="trk">
            <div class="trk-stats">
                <div class="trk-stat"><b>${met}/${tracker.length}</b><span>עובדים שעמדו ביעד</span></div>
                <div class="trk-stat"><b>${avg}%</b><span>ממוצע הגשה</span></div>
                <div class="trk-stat"><b>${subsCount}</b><span>הגשות בחודש</span></div>
            </div>
            <div class="trk-list">${rows || '<div class="ep-empty">אין עובדים פעילים</div>'}</div>
            <div class="trk-more">
                <button type="button" class="epa-accordion-toggle" data-action="admin-trk-table">
                    <span>כל ההגשות בחודש (טבלה ופעולות אישור)</span><span class="epa-accordion-arrow">${st.tableOpen ? '▲' : '▼'}</span>
                </button>
                ${st.tableOpen ? `<div class="trk-more-body">${parts.submissionsTable()}</div>` : ''}
            </div>
        </div>`;
}
