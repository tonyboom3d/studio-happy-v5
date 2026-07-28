/**
 * Admin tab for the employee-portal custom element (Module B).
 * Imported by employee-portal.js — renders team schedule (heatmap/list),
 * submission tracker, employee management, scheduling rules and open calls.
 * All mutations dispatch portal-action events handled by the Velo page.
 */

export const ADMIN_STYLE = `
.epa-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.epa-toolbar .epa-month { font-weight: 700; font-size: 15px; min-width: 120px; text-align: center; }
.epa-btn { border: 1px solid #e5e7eb; background: #fff; border-radius: 9px; padding: 7px 13px; font-size: 12.5px; cursor: pointer; font-family: inherit; }
.epa-btn:hover { border-color: #a855f7; }
.epa-btn.primary { background: #7c3aed; border-color: #7c3aed; color: #fff; font-weight: 700; }
.epa-btn.primary:hover { background: #6d28d9; }
.epa-btn.danger { color: #b91c1c; border-color: #fecaca; }
.epa-btn.active { background: #f5f3ff; border-color: #7c3aed; color: #6d28d9; font-weight: 700; }
.epa-grid7 { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.epa-day { border: 1px solid #e5e7eb; border-radius: 9px; min-height: 64px; padding: 5px; font-size: 11px; cursor: pointer; background: #fff; position: relative; }
.epa-day.other { visibility: hidden; }
.epa-day.sel { box-shadow: inset 0 0 0 2px #7c3aed; }
.epa-day .num { font-weight: 700; font-size: 12px; }
.epa-day.cov-none { background: #fef2f2; }
.epa-day.cov-partial { background: #fffbeb; }
.epa-day.cov-full { background: #ecfdf5; }
.epa-day.no-ws { background: #f9fafb; color: #9ca3af; }
.epa-day.blocked { background: #e5e7eb; }
.epa-day .hol { display: block; font-size: 9px; color: #b45309; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.epa-day .cnt { display: block; font-size: 9.5px; color: #4b5563; }
.epa-flag { position: absolute; top: 3px; inset-inline-start: 4px; font-size: 10px; }
.epa-detail { border: 1px solid #ddd6fe; background: #faf5ff; border-radius: 12px; padding: 12px; margin-top: 12px; font-size: 12.5px; }
.epa-detail h3 { margin: 0 0 8px; font-size: 14px; }
.epa-type-row { background: #fff; border: 1px solid #e5e7eb; border-radius: 9px; padding: 8px 10px; margin-bottom: 6px; }
.epa-type-head { display: flex; justify-content: space-between; font-weight: 700; }
.epa-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px; }
.epa-chip { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; background: #eef2ff; color: #3730a3; display: inline-flex; align-items: center; gap: 4px; }
.epa-chip.assigned { background: #d1fae5; color: #065f46; }
.epa-chip.standby { background: #fef3c7; color: #92400e; }
.epa-chip button { border: none; background: none; cursor: pointer; color: inherit; font-size: 11px; padding: 0; }
.epa-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.epa-table th { text-align: right; color: #6b7280; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
.epa-table td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
.epa-badge { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.epa-badge.ok { background: #d1fae5; color: #065f46; }
.epa-badge.miss { background: #fee2e2; color: #991b1b; }
.epa-badge.kind { background: #ede9fe; color: #5b21b6; }
.epa-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 8px; }
.epa-form label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 2px; }
.epa-form input, .epa-form select { width: 100%; border: 1px solid #d1d5db; border-radius: 7px; padding: 5px 7px; font-size: 12px; font-family: inherit; }
.epa-skills { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; }
.epa-skills label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #1f2937; margin: 0; }
.epa-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.epa-inline select { border: 1px solid #d1d5db; border-radius: 7px; padding: 5px 7px; font-size: 12px; font-family: inherit; }
.epa-section { margin-top: 16px; }
.epa-rule-inputs input { width: 60px; border: 1px solid #d1d5db; border-radius: 7px; padding: 4px 6px; font-size: 12px; font-family: inherit; }
.epa-list-day { border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; margin-bottom: 8px; font-size: 12.5px; background: #fff; }
.epa-list-day.no-ws { background: #f9fafb; color: #9ca3af; }
.epa-list-head { display: flex; justify-content: space-between; font-weight: 700; }
`;

const HEBREW_DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pad2(n) { return String(n).padStart(2, '0'); }
function monthTitle(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return `${new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(new Date(y, m - 1, 1))} ${y}`;
}
function fmtDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(y, m - 1, d));
    return `${dow}, ${d}.${m}.${y}`;
}
function shiftMonth(monthKey, n) {
    const [y, m] = monthKey.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`;
}

function coverageClass(day) {
    const types = day?.types || [];
    if (!day?.hasWorkshops || !types.length) return 'no-ws';
    const required = types.reduce((s, t) => s + t.required, 0);
    const filled = types.reduce((s, t) => s + Math.min(t.filled, t.required), 0);
    if (filled >= required) return 'cov-full';
    return filled > 0 ? 'cov-partial' : 'cov-none';
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderAdminTab(ce) {
    const d = ce._adminData;
    if (!d) {
        return `<div class="ep-card"><div class="ep-loading"><div class="ep-spinner"></div>טוען נתוני ניהול…</div></div>`;
    }
    return `
        <div class="ep-card">
            ${renderToolbar(ce, d)}
            ${ce._adminView === 'list' ? renderListView(ce, d) : renderHeatmap(ce, d)}
            ${ce._adminSelectedDay ? renderDayDetail(ce, d) : ''}
        </div>
        ${d.openOffers?.length ? `<div class="ep-card epa-section">${renderOpenOffers(d)}</div>` : ''}
        <div class="ep-card epa-section">${renderTracker(d)}</div>
        <div class="ep-card epa-section">${renderEmployees(ce, d)}</div>
        ${d.permissions.manageRules ? `<div class="ep-card epa-section">${renderRules(d)}</div>` : ''}
    `;
}

function renderToolbar(ce, d) {
    return `
        <div class="epa-toolbar">
            <div class="ep-cal-nav">
                <button data-action="admin-month-next" title="חודש הבא">&#8249;</button>
                <button data-action="admin-month-prev" title="חודש קודם">&#8250;</button>
            </div>
            <div class="epa-month">${monthTitle(d.monthKey)}</div>
            <button class="epa-btn ${ce._adminView !== 'list' ? 'active' : ''}" data-action="admin-view-heat">לוח חודשי</button>
            <button class="epa-btn ${ce._adminView === 'list' ? 'active' : ''}" data-action="admin-view-list">רשימה</button>
            ${d.permissions.manageScheduling ? `<button class="epa-btn primary" data-action="admin-run-scheduling">הרצת שיבוץ אוטומטי</button>` : ''}
        </div>`;
}

function submissionsByDate(d) {
    const map = {};
    for (const s of (d.submissions || [])) {
        if (!map[s.date]) map[s.date] = [];
        map[s.date].push(s);
    }
    return map;
}

function holidayByDate(d) {
    const map = {};
    for (const h of (d.settings?.holidays || [])) map[h.date] = h.name || 'חג';
    return map;
}

function renderHeatmap(ce, d) {
    const [y, m] = d.monthKey.split('-').map(Number);
    const firstDow = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const subsByDate = submissionsByDate(d);
    const holidays = holidayByDate(d);

    let cells = HEBREW_DOW.map(x => `<div class="ep-dow">${x}</div>`).join('');
    for (let i = 0; i < firstDow; i++) cells += `<div class="epa-day other"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${d.monthKey}-${pad2(day)}`;
        const info = d.days?.[dateKey];
        const blocked = (d.settings?.blockedDates || []).includes(dateKey);
        const promoted = (d.settings?.promotedDates || []).includes(dateKey);
        const subs = subsByDate[dateKey] || [];
        const cls = ['epa-day', blocked ? 'blocked' : coverageClass(info), ce._adminSelectedDay === dateKey ? 'sel' : ''].join(' ');
        const flags = `${promoted ? '⭐' : ''}${blocked ? '🚫' : ''}`;
        const summary = info?.hasWorkshops
            ? (info.types || []).map(t => `${esc(t.name)} ${Math.min(t.filled, t.required)}/${t.required}`).join(' · ')
            : (subs.length ? `${subs.length} הגשות` : '');
        cells += `<div class="${cls}" data-action="admin-select-day" data-date="${dateKey}">
            ${flags ? `<span class="epa-flag">${flags}</span>` : ''}
            <span class="num">${day}</span>
            ${holidays[dateKey] ? `<span class="hol">${esc(holidays[dateKey])}</span>` : ''}
            ${summary ? `<span class="cnt">${summary}</span>` : ''}
        </div>`;
    }

    return `<div class="epa-grid7">${cells}</div>
        <div class="ep-legend">
            <span><span class="ep-dot" style="background:#ecfdf5"></span>מאויש</span>
            <span><span class="ep-dot" style="background:#fffbeb"></span>חלקי</span>
            <span><span class="ep-dot" style="background:#fef2f2"></span>אין הגשות</span>
            <span><span class="ep-dot" style="background:#f9fafb"></span>אין סדנאות</span>
            <span><span class="ep-dot" style="background:#e5e7eb"></span>חסום</span>
        </div>`;
}

function renderListView(ce, d) {
    const [y, m] = d.monthKey.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const subsByDate = submissionsByDate(d);
    const holidays = holidayByDate(d);
    const rows = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${d.monthKey}-${pad2(day)}`;
        const info = d.days?.[dateKey];
        const subs = subsByDate[dateKey] || [];
        const holiday = holidays[dateKey] ? ` · 🕎 ${esc(holidays[dateKey])}` : '';

        if (!info?.hasWorkshops) {
            rows.push(`<div class="epa-list-day no-ws" data-action="admin-select-day" data-date="${dateKey}">
                <div class="epa-list-head"><span>${fmtDate(dateKey)}${holiday}</span><span>אין סדנאות${subs.length ? ` · ${subs.length} הגשות` : ''}</span></div>
            </div>`);
            continue;
        }
        const typeRows = (info.types || []).map(t => {
            const assigned = subs.filter(s => t.assignedEmployeeIds.includes(s.employeeId)).map(s => esc(s.employeeName));
            const submitted = subs.filter(s => !t.assignedEmployeeIds.includes(s.employeeId) && s.status !== 'STANDBY').map(s => esc(s.employeeName));
            return `<div style="margin-top:5px">
                <b>${esc(t.name)}</b> — נדרשים ${t.required}, שובצו ${Math.min(t.filled, t.required)}${t.standbyCount ? `, בהמתנה ${t.standbyCount}` : ''}
                <div class="epa-chips">
                    ${assigned.map(n => `<span class="epa-chip assigned">${n}</span>`).join('')}
                    ${submitted.map(n => `<span class="epa-chip">${n}</span>`).join('')}
                </div>
            </div>`;
        }).join('');
        rows.push(`<div class="epa-list-day" data-action="admin-select-day" data-date="${dateKey}">
            <div class="epa-list-head"><span>${fmtDate(dateKey)}${holiday}</span></div>
            ${typeRows}
        </div>`);
    }
    return rows.join('');
}

function renderDayDetail(ce, d) {
    const dateKey = ce._adminSelectedDay;
    const info = d.days?.[dateKey];
    const subs = submissionsByDate(d)[dateKey] || [];
    const blocked = (d.settings?.blockedDates || []).includes(dateKey);
    const promoted = (d.settings?.promotedDates || []).includes(dateKey);
    const activeEmployees = (d.employees || []).filter(e => e.active);

    const typeBlocks = (info?.types || []).map(t => {
        const assignedChips = subs
            .filter(s => t.assignedEmployeeIds.includes(s.employeeId))
            .map(s => `<span class="epa-chip assigned">${esc(s.employeeName)}
                ${d.permissions.manageScheduling ? `<button data-action="admin-cancel-assign" data-date="${dateKey}" data-type="${t.typeId}" data-emp="${s.employeeId}" title="ביטול שיבוץ">✕</button>` : ''}
            </span>`).join('');
        const otherChips = subs
            .filter(s => !t.assignedEmployeeIds.includes(s.employeeId))
            .map(s => `<span class="epa-chip ${s.status === 'STANDBY' ? 'standby' : ''}">${esc(s.employeeName)}${s.status === 'STANDBY' ? ' (המתנה)' : ''}</span>`).join('');
        return `<div class="epa-type-row">
            <div class="epa-type-head"><span>${esc(t.name)}</span><span>${Math.min(t.filled, t.required)}/${t.required} (${t.adults} מבוגרים, ${t.children} ילדים)</span></div>
            <div class="epa-chips">${assignedChips}${otherChips}</div>
        </div>`;
    }).join('') || `<div class="ep-empty">אין סדנאות ביום זה${subs.length ? ` — ${subs.length} הגשות זמינות (יום סטודיו)` : ''}</div>`;

    const manualAssign = d.permissions.manageScheduling && info?.hasWorkshops ? `
        <div class="epa-inline">
            <select id="epaAssignEmp">${activeEmployees.map(e => `<option value="${e.id}">${esc(e.displayName)}</option>`).join('')}</select>
            <select id="epaAssignType">${(info.types || []).map(t => `<option value="${t.typeId}">${esc(t.name)}</option>`).join('')}</select>
            <button class="epa-btn primary" data-action="admin-manual-assign" data-date="${dateKey}">שיבוץ ידני</button>
        </div>` : '';

    const flags = d.permissions.manageRules ? `
        <div class="epa-inline">
            <button class="epa-btn ${blocked ? 'danger' : ''}" data-action="admin-toggle-block" data-date="${dateKey}" data-on="${blocked ? '0' : '1'}">${blocked ? 'ביטול חסימת היום' : 'חסימת היום להגשות'}</button>
            <button class="epa-btn ${promoted ? 'active' : ''}" data-action="admin-toggle-promote" data-date="${dateKey}" data-on="${promoted ? '0' : '1'}">${promoted ? 'ביטול קידום היום' : 'קידום היום (דרושים ⭐)'}</button>
        </div>` : '';

    return `<div class="epa-detail">
        <h3>${fmtDate(dateKey)} <button class="epa-btn" data-action="admin-close-day" style="float:left">סגירה</button></h3>
        ${typeBlocks}
        ${manualAssign}
        ${flags}
    </div>`;
}

function renderOpenOffers(d) {
    const rows = d.openOffers.map(o => `
        <tr>
            <td><span class="epa-badge kind">${o.kind === 'OPEN_CALL' ? 'קריאה פתוחה' : 'הצעה ברשימת המתנה'}</span></td>
            <td>${fmtDate(o.date)}</td>
            <td>${esc(o.workshopName)}</td>
            <td>${o.employeeName ? esc(o.employeeName) : '—'}</td>
        </tr>`).join('');
    return `<h2>הצעות וקריאות פתוחות (${d.openOffers.length})</h2>
        <table class="epa-table"><thead><tr><th>סוג</th><th>תאריך</th><th>סדנה</th><th>עובד/ת</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTracker(d) {
    const rows = (d.tracker || []).map(t => `
        <tr>
            <td>${esc(t.name)}</td>
            <td>${t.submitted}/${t.required}</td>
            <td><span class="epa-badge ${t.met ? 'ok' : 'miss'}">${t.met ? 'הושלם' : 'חסר'}</span></td>
            <td>${!t.met && d.permissions.manageScheduling ? `<button class="epa-btn" data-action="admin-nudge" data-emp="${t.employeeId}">📲 תזכורת</button>` : ''}</td>
        </tr>`).join('');
    return `<h2>מעקב הגשות זמינות — ${monthTitle(d.monthKey)}</h2>
        <table class="epa-table"><thead><tr><th>עובד/ת</th><th>הוגשו</th><th>סטטוס</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderEmployees(ce, d) {
    const rows = (d.employees || []).map(e => `
        <tr style="${e.active ? '' : 'opacity:.5'}">
            <td><span class="ep-dot" style="background:${esc(e.color || '#a855f7')};margin-inline-end:6px"></span>${esc(e.displayName)}${e.isTrainee ? ' <span class="ep-tag">חניכה</span>' : ''}</td>
            <td>${esc(e.roleLabel)}</td>
            <td>${e.priorityRank ?? '—'}</td>
            <td>${e.minShiftsPerMonth ?? '—'}</td>
            <td>${(e.skillIds || []).map(id => esc((d.workshopTypes.find(w => w.id === id) || {}).name || '')).filter(Boolean).join(', ') || '—'}</td>
            <td>${d.permissions.manageEmployees ? `<button class="epa-btn" data-action="admin-edit-employee" data-emp="${e.id}">עריכה</button>` : ''}</td>
        </tr>`).join('');
    return `<h2>עובדים (${(d.employees || []).length})</h2>
        <table class="epa-table"><thead><tr><th>שם</th><th>תפקיד</th><th>דירוג</th><th>מכסה</th><th>הכשרות</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        ${ce._adminEditEmployeeId ? renderEmployeeForm(ce, d) : ''}`;
}

function renderEmployeeForm(ce, d) {
    const e = (d.employees || []).find(x => x.id === ce._adminEditEmployeeId);
    if (!e) return '';
    const skillBoxes = (d.workshopTypes || []).map(w => `
        <label><input type="checkbox" class="epa-skill" value="${w.id}" ${(e.skillIds || []).includes(w.id) ? 'checked' : ''}> ${esc(w.name)}</label>`).join('');
    const rates = d.permissions.manageRates ? `
        <div><label>תעריף סטודיו</label><input id="epaF_rateStudio" type="number" value="${e.rateStudio ?? ''}"></div>
        <div><label>תעריף הדרכה</label><input id="epaF_rateInstruction" type="number" value="${e.rateInstruction ?? ''}"></div>
        <div><label>תעריף צמר</label><input id="epaF_rateWool" type="number" value="${e.rateWool ?? ''}"></div>` : '';
    return `<div class="epa-detail">
        <h3>עריכת ${esc(e.displayName)}</h3>
        <div class="epa-form">
            <div><label>שם תצוגה</label><input id="epaF_displayName" value="${esc(e.displayName)}"></div>
            <div><label>תפקיד</label><select id="epaF_roleType">${(d.roleTypes || []).map(r => `<option value="${r.value}" ${e.roleType === r.value ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div><label>טלפון</label><input id="epaF_phone" value="${esc(e.phone)}"></div>
            <div><label>צבע</label><input id="epaF_color" type="color" value="${esc(e.color || '#7c3aed')}"></div>
            <div><label>ותק</label><input id="epaF_seniority" value="${esc(e.seniority)}"></div>
            <div><label>דירוג עדיפות (נסתר)</label><input id="epaF_priorityRank" type="number" value="${e.priorityRank ?? ''}"></div>
            <div><label>מכסת משמרות חודשית</label><input id="epaF_minShiftsPerMonth" type="number" value="${e.minShiftsPerMonth ?? ''}"></div>
            <div><label>אורך משמרת מינימלי (שעות)</label><input id="epaF_minShiftHours" type="number" value="${e.minShiftHours ?? ''}"></div>
            <div><label>חניכה</label><select id="epaF_isTrainee"><option value="0" ${!e.isTrainee ? 'selected' : ''}>לא</option><option value="1" ${e.isTrainee ? 'selected' : ''}>כן</option></select></div>
            <div><label>פעיל/ה</label><select id="epaF_active"><option value="1" ${e.active ? 'selected' : ''}>כן</option><option value="0" ${!e.active ? 'selected' : ''}>לא</option></select></div>
            ${rates}
            <div class="epa-skills"><label style="width:100%;font-weight:700">הכשרות:</label>${skillBoxes}</div>
        </div>
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-save-employee" data-emp="${e.id}">שמירה</button>
            <button class="epa-btn" data-action="admin-cancel-edit">ביטול</button>
        </div>
    </div>`;
}

function renderRules(d) {
    const rows = (d.rules || []).map(r => `
        <tr class="epa-rule-inputs" data-type="${r.workshopTypeId}">
            <td>${esc(r.workshopName)}</td>
            <td><input type="number" class="epaR_ppi" value="${r.participantsPerInstructor}"></td>
            <td><input type="number" class="epaR_pcpi" value="${r.parentChildParticipantsPerInstructor}"></td>
            <td><input type="number" class="epaR_min" value="${r.minInstructors}"></td>
            <td><button class="epa-btn" data-action="admin-save-rule" data-type="${r.workshopTypeId}">שמירה</button></td>
        </tr>`).join('');
    return `<h2>כללי שיבוץ (יחס משתתפים למדריך)</h2>
        <table class="epa-table"><thead><tr><th>סדנה</th><th>משתתפים למדריך</th><th>הורה-ילד למדריך</th><th>מינימום מדריכים</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Click handling — returns true when the action was handled here
// ---------------------------------------------------------------------------

export function handleAdminClick(ce, action, target) {
    const d = ce._adminData;
    switch (action) {
        case 'admin-month-prev':
            ce._adminMonth = shiftMonth(ce._adminMonth, -1);
            ce._adminSelectedDay = null;
            ce._requestAdminData();
            return true;
        case 'admin-month-next':
            ce._adminMonth = shiftMonth(ce._adminMonth, 1);
            ce._adminSelectedDay = null;
            ce._requestAdminData();
            return true;
        case 'admin-view-heat':
            ce._adminView = 'heat'; ce.render(); return true;
        case 'admin-view-list':
            ce._adminView = 'list'; ce.render(); return true;
        case 'admin-select-day':
            ce._adminSelectedDay = target.dataset.date; ce.render(); return true;
        case 'admin-close-day':
            ce._adminSelectedDay = null; ce.render(); return true;
        case 'admin-run-scheduling':
            ce._startBusy('מריץ שיבוץ אוטומטי…');
            ce._dispatch('adminRunScheduling', { scope: ce._adminMonth });
            return true;
        case 'admin-toggle-block':
            ce._startBusy('מעדכן…');
            ce._dispatch('adminDayFlags', { dateKey: target.dataset.date, flags: { blocked: target.dataset.on === '1' } });
            return true;
        case 'admin-toggle-promote':
            ce._startBusy('מעדכן…');
            ce._dispatch('adminDayFlags', { dateKey: target.dataset.date, flags: { promoted: target.dataset.on === '1' } });
            return true;
        case 'admin-nudge':
            ce._startBusy('שולח תזכורת…');
            ce._dispatch('adminNudge', { roleIds: [target.dataset.emp], monthKey: ce._adminMonth });
            return true;
        case 'admin-manual-assign': {
            const emp = ce.querySelector('#epaAssignEmp')?.value;
            const type = ce.querySelector('#epaAssignType')?.value;
            if (!emp || !type) return true;
            ce._startBusy('משבץ…');
            ce._dispatch('adminManualAssign', { dateKey: target.dataset.date, workshopTypeId: type, employeeId: emp });
            return true;
        }
        case 'admin-cancel-assign':
            ce._startBusy('מבטל שיבוץ…');
            ce._dispatch('adminCancelAssignment', {
                dateKey: target.dataset.date,
                workshopTypeId: target.dataset.type,
                employeeId: target.dataset.emp,
            });
            return true;
        case 'admin-edit-employee':
            ce._adminEditEmployeeId = target.dataset.emp; ce.render(); return true;
        case 'admin-cancel-edit':
            ce._adminEditEmployeeId = null; ce.render(); return true;
        case 'admin-save-employee': {
            const val = (id) => ce.querySelector(`#${id}`)?.value;
            const num = (id) => { const v = Number(val(id)); return Number.isFinite(v) && val(id) !== '' ? v : null; };
            const patch = {
                displayName: val('epaF_displayName') || undefined,
                roleType: val('epaF_roleType') || undefined,
                phone: val('epaF_phone') ?? undefined,
                color: val('epaF_color') || undefined,
                seniority: val('epaF_seniority') ?? undefined,
                priorityRank: num('epaF_priorityRank'),
                minShiftsPerMonth: num('epaF_minShiftsPerMonth'),
                minShiftHours: num('epaF_minShiftHours'),
                isTrainee: val('epaF_isTrainee') === '1',
                active: val('epaF_active') === '1',
                skillIds: [...ce.querySelectorAll('.epa-skill:checked')].map(x => x.value),
            };
            if (d?.permissions?.manageRates) {
                patch.rateStudio = num('epaF_rateStudio');
                patch.rateInstruction = num('epaF_rateInstruction');
                patch.rateWool = num('epaF_rateWool');
            }
            ce._startBusy('שומר…');
            ce._adminEditEmployeeId = null;
            ce._dispatch('adminUpdateEmployee', { roleId: target.dataset.emp, patch });
            return true;
        }
        case 'admin-save-rule': {
            const row = target.closest('tr');
            ce._startBusy('שומר כלל…');
            ce._dispatch('adminUpdateRule', {
                workshopTypeId: target.dataset.type,
                patch: {
                    participantsPerInstructor: Number(row?.querySelector('.epaR_ppi')?.value),
                    parentChildParticipantsPerInstructor: Number(row?.querySelector('.epaR_pcpi')?.value),
                    minInstructors: Number(row?.querySelector('.epaR_min')?.value),
                },
            });
            return true;
        }
        default:
            return false;
    }
}
