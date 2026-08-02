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
.epa-btn:hover { border-color: #60a5fa; }
.epa-btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 700; }
.epa-btn.primary:hover { background: #1d4ed8; }
.epa-btn.danger { color: #b91c1c; border-color: #fecaca; }
.epa-btn.active { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; font-weight: 700; }
.epa-grid7 { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.epa-day { border: 1px solid #e5e7eb; border-radius: 9px; min-height: 64px; padding: 5px; font-size: 11px; cursor: pointer; background: #fff; position: relative; }
.epa-day.other { visibility: hidden; }
.epa-day.sel { box-shadow: inset 0 0 0 2px #2563eb; }
.epa-day .num { font-weight: 700; font-size: 12px; }
.epa-day.cov-none { background: #fef2f2; }
.epa-day.cov-partial { background: #fffbeb; }
.epa-day.cov-full { background: #ecfdf5; }
.epa-day.no-ws { background: #f9fafb; color: #9ca3af; }
.epa-day.blocked { background: #e5e7eb; }
.epa-day .hol { display: block; font-size: 9px; color: #b45309; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.epa-day .cnt { display: block; font-size: 9.5px; color: #4b5563; }
.epa-flag { position: absolute; top: 3px; inset-inline-start: 4px; font-size: 10px; }
.epa-detail { border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 12px; padding: 12px; margin-top: 12px; font-size: 12.5px; }
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
.epa-badge.kind { background: #dbeafe; color: #1e40af; }
.epa-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 8px; }
.epa-form label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 2px; }
.epa-form input, .epa-form select { width: 100%; border: 1px solid #d1d5db; border-radius: 7px; padding: 5px 7px; font-size: 12px; font-family: inherit; }
.epa-skills { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; }
.epa-skills label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #1f2937; margin: 0; }
.epa-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.epa-inline select, .epa-inline input { border: 1px solid #d1d5db; border-radius: 7px; padding: 5px 7px; font-size: 12px; font-family: inherit; }
.epa-section { margin-top: 16px; }
.epa-rule-inputs input { width: 60px; border: 1px solid #d1d5db; border-radius: 7px; padding: 4px 6px; font-size: 12px; font-family: inherit; }
.epa-list-day { border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; margin-bottom: 8px; font-size: 12.5px; background: #fff; }
.epa-list-day.no-ws { background: #f9fafb; color: #9ca3af; }
.epa-list-head { display: flex; justify-content: space-between; font-weight: 700; }
.epa-shell { display: grid; grid-template-columns: minmax(0,1fr) 238px; gap: 16px; min-height: 640px; align-items: start; direction: ltr; transition: grid-template-columns .22s ease; }
.epa-shell.collapsed { grid-template-columns: minmax(0,1fr) 68px; }
.epa-sidebar { direction: rtl; position: sticky; top: 12px; padding: 12px; border: 1px solid #dbeafe; border-radius: 18px; background: linear-gradient(180deg,#fff 0%,#f8fbff 100%); box-shadow: 0 10px 30px rgba(30,64,175,.09); transition: width .22s ease; overflow: hidden; }
.epa-user-card { display: flex; align-items: center; gap: 9px; min-height: 48px; padding: 5px; border-bottom: 1px solid #e5e7eb; margin-bottom: 10px; }
.epa-user-avatar { width: 38px; height: 38px; flex: 0 0 38px; border-radius: 12px; display: grid; place-items: center; color: #fff; font-weight: 800; box-shadow: 0 5px 14px rgba(37,99,235,.22); }
.epa-user-meta { min-width: 0; white-space: nowrap; }
.epa-user-name { font-size: 12.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; }
.epa-user-role { font-size: 10.5px; color: #64748b; }
.epa-collapse { width: 100%; border: 0; background: #eff6ff; color: #1d4ed8; border-radius: 9px; padding: 7px; cursor: pointer; font-family: inherit; font-weight: 700; margin-bottom: 8px; transition: background .15s,transform .15s; }
.epa-collapse:hover { background: #dbeafe; transform: translateY(-1px); }
.epa-nav { display: flex; flex-direction: column; gap: 5px; }
.epa-nav-btn { width: 100%; border: 0; background: transparent; color: #475569; border-radius: 10px; padding: 9px 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; font-family: inherit; font-size: 12.5px; font-weight: 700; text-align: right; white-space: nowrap; transition: background .15s,color .15s,transform .15s,box-shadow .15s; }
.epa-nav-btn:hover { background: #eff6ff; color: #1d4ed8; transform: translateX(-2px); }
.epa-nav-btn.active { color: #fff; background: linear-gradient(135deg,#2563eb,#1d4ed8); box-shadow: 0 7px 18px rgba(37,99,235,.24); }
.epa-icon { width: 18px; height: 18px; flex: 0 0 18px; display: inline-grid; place-items: center; }
.epa-icon svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.epa-shell.collapsed .epa-user-meta,.epa-shell.collapsed .epa-nav-label { display: none; }
.epa-shell.collapsed .epa-user-card { justify-content: center; }
.epa-shell.collapsed .epa-nav-btn { justify-content: center; padding-inline: 0; }
.epa-content { direction: rtl; min-width: 0; animation: epa-page-in .22s ease both; }
.epa-page-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.epa-page-head h2 { margin: 0; font-size: 19px; color: #0f172a; }
.epa-page-head p { margin: 3px 0 0; font-size: 11.5px; color: #64748b; }
.epa-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 15px; box-shadow: 0 5px 18px rgba(15,23,42,.045); margin-bottom: 12px; }
.epa-panel-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
.epa-panel-title h3 { margin: 0; font-size: 14px; }
.epa-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 11px; }
.epa-table-wrap .epa-table th { background: #f8fafc; }
.epa-row-click { cursor: pointer; transition: background .14s; }
.epa-row-click:hover { background: #eff6ff; }
.epa-row-click.active { background: #eff6ff; box-shadow: inset 2px 0 0 #2563eb; }
.epa-dot-lg { width: 12px; height: 12px; display: inline-block; border-radius: 50%; margin-inline-end: 7px; box-shadow: 0 0 0 3px rgba(148,163,184,.14); vertical-align: middle; }
.epa-status-line { display: flex; align-items: center; gap: 7px; }
.epa-stat-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 9px; margin-bottom: 12px; }
.epa-stat { background: linear-gradient(145deg,#eff6ff,#fff); border: 1px solid #dbeafe; border-radius: 13px; padding: 12px; }
.epa-stat b { display: block; color: #1d4ed8; font-size: 20px; }
.epa-stat span { color: #64748b; font-size: 11px; }
.epa-settings-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 10px; }
.epa-field label { display: block; font-size: 11px; color: #64748b; margin-bottom: 4px; }
.epa-field input,.epa-field select,.epa-field textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 9px; padding: 8px 9px; font: inherit; font-size: 12px; background: #fff; transition: border-color .15s,box-shadow .15s; }
.epa-field textarea { min-height: 170px; resize: vertical; }
.epa-field input:focus,.epa-field select:focus,.epa-field textarea:focus { outline: 0; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.epa-toggle { display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: 12px; }
.epa-toggle input { accent-color: #2563eb; width: 17px; height: 17px; }
.epa-holiday-row { display: grid; grid-template-columns: 150px minmax(150px,1fr) 38px; gap: 7px; margin-bottom: 7px; }
.epa-holiday-row input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px; font: inherit; font-size: 12px; }
.epa-template-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(230px,1fr)); gap: 10px; }
.epa-template { border: 1px solid #dbeafe; background: linear-gradient(145deg,#fff,#f8fbff); border-radius: 14px; padding: 13px; cursor: pointer; min-height: 132px; transition: transform .16s,box-shadow .16s,border-color .16s; }
.epa-template:hover { transform: translateY(-2px); box-shadow: 0 9px 22px rgba(30,64,175,.1); border-color: #93c5fd; }
.epa-template h3 { margin: 0 0 7px; font-size: 13.5px; }
.epa-template p { margin: 0; color: #64748b; font-size: 11.5px; white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
.epa-modal-backdrop { position: fixed; inset: 0; z-index: 10001; background: rgba(15,23,42,.48); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: epa-fade-in .16s ease; }
.epa-modal { direction: rtl; width: min(700px,96vw); max-height: 90vh; overflow: auto; background: #fff; border-radius: 18px; box-shadow: 0 25px 70px rgba(15,23,42,.28); padding: 18px; animation: epa-modal-in .2s ease both; }
.epa-modal-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px; }
.epa-modal-head h2 { margin: 0; font-size: 17px; }
.epa-modal-close { border: 0; background: #f1f5f9; color: #334155; width: 31px; height: 31px; border-radius: 9px; cursor: pointer; font-size: 17px; }
.epa-detail-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.epa-detail-item { background: #f8fafc; border-radius: 9px; padding: 8px 10px; }
.epa-detail-item span { display: block; font-size: 10.5px; color: #64748b; }
.epa-detail-item b { font-size: 12.5px; }
@keyframes epa-page-in { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:none } }
@keyframes epa-fade-in { from { opacity:0 } to { opacity:1 } }
@keyframes epa-modal-in { from { opacity:0; transform:scale(.97) translateY(7px) } to { opacity:1; transform:none } }
@media (max-width:760px) {
    .epa-shell,.epa-shell.collapsed { grid-template-columns: 1fr; }
    .epa-sidebar { position: static; order: -1; }
    .epa-nav { flex-direction: row; overflow-x: auto; }
    .epa-nav-btn { width: auto; flex: 0 0 auto; }
    .epa-collapse { display: none; }
    .epa-shell.collapsed .epa-user-meta,.epa-shell.collapsed .epa-nav-label { display: block; }
    .epa-detail-grid { grid-template-columns: 1fr; }
}
`;

const HEBREW_DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// Placeholder — replace with the actual Wix dashboard URL for creating a new
// Bookings staff member on this site (Bookings > Staff > New staff member).
const WIX_NEW_STAFF_URL = 'https://manage.wix.com/dashboard/bookings/staff-members';

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
    const allowedPages = ['board', 'tracker', 'employees'];
    if (d.permissions.editTimeEntries) allowedPages.push('teamTime');
    if (d.permissions.manageEmployees) allowedPages.push('messages');
    if (d.permissions.manageRules) allowedPages.push('settings');
    if (d.permissions.manageTemplates) allowedPages.push('templates');
    if (!allowedPages.includes(ce._adminPage)) ce._adminPage = 'board';

    return `
        <div class="epa-shell ${ce._adminSidebarCollapsed ? 'collapsed' : ''}">
            <main class="epa-content">${renderAdminPage(ce, d)}</main>
            ${renderSidebar(ce, d)}
        </div>
        ${renderModal(ce, d)}
    `;
}

function icon(name) {
    const paths = {
        board: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/>',
        tracker: '<path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M8 8h8M8 12h8M8 16h5"/>',
        employees: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        teamTime: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
        messages: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15z"/>',
        templates: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    };
    return `<span class="epa-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg></span>`;
}

function renderSidebar(ce, d) {
    const u = ce._data?.user || {};
    const initials = (u.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
    const items = [
        { page: 'board', label: 'לוח שיבוץ', show: d.permissions.viewTeamSchedule !== false },
        { page: 'tracker', label: 'מעקב הגשות', show: d.permissions.viewTeamSchedule !== false },
        { page: 'employees', label: 'עובדים', show: d.permissions.viewTeamSchedule !== false },
        { page: 'teamTime', label: 'שעות צוות', show: d.permissions.editTimeEntries },
        { page: 'messages', label: 'הודעות', show: d.permissions.manageEmployees },
        { page: 'settings', label: 'הגדרות', show: d.permissions.manageRules },
        { page: 'templates', label: 'תבניות', show: d.permissions.manageTemplates },
    ].filter(x => x.show);
    return `<aside class="epa-sidebar">
        <div class="epa-user-card">
            <div class="epa-user-avatar" style="background:${esc(u.color || '#2563eb')}">${esc(initials)}</div>
            <div class="epa-user-meta"><div class="epa-user-name">${esc(u.name || '')}</div><div class="epa-user-role">${esc(u.roleLabel || '')}</div></div>
        </div>
        <button class="epa-collapse" data-action="admin-toggle-sidebar" title="${ce._adminSidebarCollapsed ? 'הרחבת תפריט' : 'צמצום תפריט'}">${ce._adminSidebarCollapsed ? '‹' : 'צמצום התפריט ›'}</button>
        <nav class="epa-nav" aria-label="ניווט ניהול">
            ${items.map(item => `<button class="epa-nav-btn ${ce._adminPage === item.page ? 'active' : ''}" data-action="admin-page" data-page="${item.page}" title="${item.label}">
                ${icon(item.page)}<span class="epa-nav-label">${item.label}</span>
            </button>`).join('')}
        </nav>
    </aside>`;
}

function renderAdminPage(ce, d) {
    switch (ce._adminPage) {
        case 'tracker': return renderTrackerPage(ce, d);
        case 'employees': return renderEmployeesPage(ce, d);
        case 'teamTime': return renderTeamTimePage(ce, d);
        case 'messages': return renderMessagesPage(ce, d);
        case 'settings': return renderSettingsPage(ce, d);
        case 'templates': return renderTemplatesPage(ce, d);
        default: return renderBoardPage(ce, d);
    }
}

function renderBoardPage(ce, d) {
    return `<div class="epa-page-head"><div><h2>לוח שיבוץ</h2><p>תמונת מצב חודשית, כיסוי ושיבוצים</p></div></div>
        <section class="epa-panel">
            ${renderToolbar(ce, d)}
            ${ce._adminView === 'list' ? renderListView(ce, d) : renderHeatmap(ce, d)}
            ${ce._adminSelectedDay ? renderDayDetail(ce, d) : ''}
        </section>
        ${d.openOffers?.length ? `<section class="epa-panel">${renderOpenOffers(d)}</section>` : ''}`;
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

function renderMonthControls(d) {
    return `<div class="epa-toolbar" style="margin:0">
        <div class="ep-cal-nav">
            <button data-action="admin-month-next" title="חודש הבא">&#8249;</button>
            <button data-action="admin-month-prev" title="חודש קודם">&#8250;</button>
        </div>
        <div class="epa-month">${monthTitle(d.monthKey)}</div>
    </div>`;
}

function renderTrackerPage(ce, d) {
    const trackerRows = (d.tracker || []).map(t => {
        const employee = (d.employees || []).find(e => e.id === t.employeeId);
        return `<tr>
            <td><span class="epa-dot-lg" style="background:${esc(employee?.color || '#2563eb')}"></span>${esc(t.name)}</td>
            <td>${t.submitted}/${t.required}</td>
            <td><span class="epa-badge ${t.met ? 'ok' : 'miss'}">${t.met ? 'הושלם' : 'חסר'}</span></td>
            <td>${!t.met && d.permissions.manageScheduling ? `<button class="epa-btn" data-action="admin-nudge" data-emp="${t.employeeId}">שליחת תזכורת</button>` : ''}</td>
        </tr>`;
    }).join('');
    const statusLabel = { SUBMITTED: 'הוגש', STANDBY: 'בהמתנה', SCHEDULED: 'משובץ' };
    const submissionRows = (d.submissions || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map(s => {
        const employee = (d.employees || []).find(e => e.id === s.employeeId);
        return `<tr class="epa-row-click" data-action="admin-open-submission" data-sub="${esc(s.id)}">
            <td><span class="epa-dot-lg" style="background:${esc(employee?.color || '#2563eb')}"></span>${esc(s.employeeName)}</td>
            <td>${fmtDate(s.date)}</td>
            <td>${esc(s.startTime)}–${esc(s.endTime)}</td>
            <td><span class="epa-badge kind">${statusLabel[s.status] || esc(s.status)}</span></td>
        </tr>`;
    }).join('');
    const complete = (d.tracker || []).filter(t => t.met).length;
    return `<div class="epa-page-head"><div><h2>מעקב הגשות</h2><p>כל ההגשות והמכסות לפי חודש</p></div>${renderMonthControls(d)}</div>
        <div class="epa-stat-grid">
            <div class="epa-stat"><b>${(d.submissions || []).length}</b><span>הגשות בחודש</span></div>
            <div class="epa-stat"><b>${complete}/${(d.tracker || []).length}</b><span>עובדים שהשלימו מכסה</span></div>
        </div>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>מצב מכסות</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>עובד/ת</th><th>הוגשו</th><th>סטטוס</th><th></th></tr></thead><tbody>${trackerRows}</tbody></table></div>
        </section>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>כל ההגשות — ${monthTitle(d.monthKey)}</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>עובד/ת</th><th>תאריך</th><th>שעות</th><th>סטטוס</th></tr></thead>
                <tbody>${submissionRows || '<tr><td colspan="4" class="ep-empty">אין הגשות בחודש זה</td></tr>'}</tbody>
            </table></div>
        </section>`;
}

function renderStaffPanel(ce, d) {
    if (!d.permissions.manageEmployees) return '';
    const staffData = ce._staffData;
    if (!staffData) {
        return `<section class="epa-panel">
            <div class="epa-panel-title"><h3>צוות ב-Wix Bookings</h3></div>
            <div class="ep-loading"><div class="ep-spinner"></div>טוען רשימת צוות…</div>
        </section>`;
    }
    const search = (ce._staffSearch || '').trim().toLowerCase();
    const filtered = search
        ? staffData.filter(s => (s.name || '').toLowerCase().includes(search) || (s.email || '').toLowerCase().includes(search) || (s.phone || '').includes(search))
        : staffData;
    const rows = filtered.map(s => `
        <tr>
            <td>${esc(s.name || '—')}</td>
            <td>${esc(s.email || '—')}</td>
            <td>${esc(s.phone || '—')}</td>
            <td>${s.linked
        ? `<span class="epa-badge ${s.active === false ? 'miss' : 'ok'}">${s.active === false ? 'מחובר/ת (לא פעיל/ה)' : 'מחובר/ת לפורטל'}</span>`
        : '<span class="epa-badge kind">לא מחובר/ת</span>'}</td>
            <td>${!s.linked || s.active === false
        ? `<button class="epa-btn primary" data-action="admin-connect-staff" data-staff="${esc(s.staffId)}">${s.linked ? 'חיבור מחדש' : 'חיבור לפורטל'}</button>`
        : ''}</td>
        </tr>`).join('');
    return `<section class="epa-panel">
        <div class="epa-panel-title">
            <h3>צוות ב-Wix Bookings (${filtered.length}/${staffData.length})</h3>
            <div class="epa-inline" style="margin:0">
                <input id="epaStaffSearch" placeholder="חיפוש לפי שם, אימייל או טלפון" value="${esc(ce._staffSearch || '')}">
                <button class="epa-btn" data-action="admin-staff-refresh">רענון</button>
                <button class="epa-btn primary" data-action="admin-new-staff">צור עובד חדש +</button>
            </div>
        </div>
        <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>שם</th><th>אימייל</th><th>טלפון</th><th>סטטוס</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" class="ep-empty">אין תוצאות</td></tr>'}</tbody>
        </table></div>
    </section>`;
}

function renderEmployeesPage(ce, d) {
    const rows = (d.employees || []).map(e => `
        <tr class="${d.permissions.manageEmployees ? 'epa-row-click' : ''}" style="${e.active ? '' : 'opacity:.55'}" ${d.permissions.manageEmployees ? `data-action="admin-edit-employee" data-emp="${e.id}"` : ''}>
            <td><span class="epa-dot-lg" style="background:${esc(e.color || '#2563eb')}"></span>${esc(e.displayName)}${e.isTrainee ? ' <span class="ep-tag">חניכה</span>' : ''}</td>
            <td>${esc(e.roleLabel)}</td>
            <td>${e.priorityRank ?? '—'}</td>
            <td>${e.minShiftsPerMonth ?? 'ברירת מחדל'}</td>
            <td>${(e.skillIds || []).map(id => esc((d.workshopTypes.find(w => w.id === id) || {}).name || '')).filter(Boolean).join(', ') || '—'}</td>
            <td><span class="epa-badge ${e.active ? 'ok' : 'miss'}">${e.active ? 'פעיל/ה' : 'לא פעיל/ה'}</span></td>
        </tr>`).join('');
    return `<div class="epa-page-head"><div><h2>עובדים</h2><p>פרופילים, הרשאות עבודה והכשרות</p></div></div>
        ${renderStaffPanel(ce, d)}
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>כל העובדים (${(d.employees || []).length})</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>שם</th><th>תפקיד</th><th>דירוג</th><th>מכסה</th><th>הכשרות</th><th>מצב</th></tr></thead><tbody>${rows}</tbody></table></div>
        </section>`;
}

function fmtDateTimeHe(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function renderTeamTimePage(ce, d) {
    const month = ce._teamTimeMonth;
    const t = ce._teamTimeData;
    const head = `<div class="epa-page-head"><div><h2>שעות צוות</h2><p>מעקב ועריכת שעות עבודה לפי עובד/ת</p></div></div>`;
    const monthControls = `<div class="epa-toolbar" style="margin:0">
        <div class="ep-cal-nav">
            <button data-action="admin-teamtime-month-next" title="חודש הבא">&#8249;</button>
            <button data-action="admin-teamtime-month-prev" title="חודש קודם">&#8250;</button>
        </div>
        <div class="epa-month">${monthTitle(month)}</div>
        ${t ? `<button class="epa-btn primary" data-action="admin-teamtime-add">רישום חדש +</button>
        <button class="epa-btn" data-action="admin-teamtime-export">ייצוא CSV</button>` : ''}
    </div>`;

    if (!t) {
        return `${head}<section class="epa-panel">${monthControls}<div class="ep-loading"><div class="ep-spinner"></div>טוען נתוני שעות…</div></section>`;
    }

    const employees = (t.employees || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'he'));
    const selectedId = ce._teamTimeEmployee && employees.some(e => e.employeeId === ce._teamTimeEmployee)
        ? ce._teamTimeEmployee
        : employees[0]?.employeeId || null;
    const selectedEmp = employees.find(e => e.employeeId === selectedId) || null;

    const summaryRows = employees.map(emp => `
        <tr class="epa-row-click ${emp.employeeId === selectedId ? 'active' : ''}" data-action="admin-teamtime-select" data-emp="${esc(emp.employeeId)}">
            <td>${esc(emp.name)}</td>
            <td>${emp.totals.total} ש׳</td>
            <td><span class="epa-badge ${emp.approved ? 'ok' : 'miss'}">${emp.approved ? 'אושר' : 'לא אושר'}</span></td>
        </tr>`).join('');

    const entryRows = (selectedEmp?.entries || []).slice().sort((a, b) => a.dateKey.localeCompare(b.dateKey)).map(e => `
        <tr>
            <td>${fmtDate(e.dateKey)}</td>
            <td>${esc(e.taskLabel)}</td>
            <td>${fmtDateTimeHe(e.startTime)}</td>
            <td>${e.endTime ? fmtDateTimeHe(e.endTime) : 'פתוח'}</td>
            <td>${e.hours ?? '—'}</td>
            <td>
                <button class="epa-btn" data-action="admin-teamtime-edit" data-entry="${esc(e.id)}">עריכה</button>
                <button class="epa-btn danger" data-action="admin-teamtime-delete" data-entry="${esc(e.id)}">מחיקה</button>
            </td>
        </tr>`).join('');

    return `${head}
        <section class="epa-panel">${monthControls}</section>
        <div style="display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1.5fr); gap:12px; align-items:start">
            <section class="epa-panel">
                <div class="epa-panel-title"><h3>עובדים (${employees.length})</h3></div>
                <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>שם</th><th>סה"כ שעות</th><th>אישור</th></tr></thead>
                    <tbody>${summaryRows || '<tr><td colspan="3" class="ep-empty">אין נתונים לחודש זה</td></tr>'}</tbody>
                </table></div>
            </section>
            <section class="epa-panel">
                <div class="epa-panel-title"><h3>${selectedEmp ? esc(selectedEmp.name) : 'בחרו עובד/ת'} — רישומי שעות</h3></div>
                <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>תאריך</th><th>משימה</th><th>התחלה</th><th>סיום</th><th>שעות</th><th></th></tr></thead>
                    <tbody>${entryRows || '<tr><td colspan="6" class="ep-empty">אין רישומים</td></tr>'}</tbody>
                </table></div>
            </section>
        </div>`;
}

function toLocalDateTimeInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderTimeEntryForm(ce, d, entry) {
    const t = ce._teamTimeData;
    const employees = (t?.employees || []).map(e => ({ id: e.employeeId, name: e.name }));
    const empOptions = (employees.length ? employees : (d.employees || []).map(e => ({ id: e.id, name: e.displayName })))
        .map(e => `<option value="${esc(e.id)}" ${entry?.employeeId === e.id || (!entry && e.id === ce._teamTimeEmployee) ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
    const taskOptions = (t?.taskTypes || []).map(tt => `<option value="${esc(tt.value)}" ${entry?.taskType === tt.value ? 'selected' : ''}>${esc(tt.label)}</option>`).join('');
    return `<div class="epa-form">
            <div><label>עובד/ת</label><select id="epaTE_employeeId" ${entry ? 'disabled' : ''}>${empOptions}</select></div>
            <div><label>סוג משימה</label><select id="epaTE_taskType">${taskOptions}</select></div>
            <div><label>התחלה</label><input id="epaTE_start" type="datetime-local" value="${toLocalDateTimeInput(entry?.startTime)}"></div>
            <div><label>סיום (השאירו ריק למשמרת פתוחה)</label><input id="epaTE_end" type="datetime-local" value="${toLocalDateTimeInput(entry?.endTime)}"></div>
        </div>
        <div class="epa-field" style="margin-top:8px"><label>הערות</label><input id="epaTE_notes" value="${esc(entry?.notes || '')}"></div>
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-teamtime-save" data-entry="${esc(entry?.id || '')}">שמירה</button>
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

function renderPermissionGroups(d, permissions) {
    return (d.permissionGroups || []).map(g => `
        <div style="margin-bottom:8px">
            <b style="font-size:11.5px;color:#475569">${esc(g.label)}</b>
            <div class="epa-skills" style="margin-top:4px">
                ${g.keys.map(k => `<label><input type="checkbox" class="epaPerm" data-perm="${k}" ${permissions?.[k] ? 'checked' : ''}> ${esc(d.permissionLabels?.[k] || k)}</label>`).join('')}
            </div>
        </div>`).join('');
}

function renderEmployeeForm(e, d) {
    if (!e) return '';
    const skillBoxes = (d.workshopTypes || []).map(w => `
        <label><input type="checkbox" class="epa-skill" value="${w.id}" ${(e.skillIds || []).includes(w.id) ? 'checked' : ''}> ${esc(w.name)}</label>`).join('');
    const rates = d.permissions.manageRates ? `
        <div><label>תעריף סטודיו</label><input id="epaF_rateStudio" type="number" value="${e.rateStudio ?? ''}"></div>
        <div><label>תעריף הדרכה</label><input id="epaF_rateInstruction" type="number" value="${e.rateInstruction ?? ''}"></div>
        <div><label>תעריף צמר</label><input id="epaF_rateWool" type="number" value="${e.rateWool ?? ''}"></div>` : '';
    const permissionsSection = d.permissions.manageRoles ? `
        <div class="epa-section">
            <div class="epa-panel-title"><h3>הרשאות מפורטות</h3></div>
            ${renderPermissionGroups(d, e.permissions)}
        </div>` : '';
    return `<div class="epa-form">
            <div><label>שם תצוגה</label><input id="epaF_displayName" value="${esc(e.displayName)}"></div>
            <div><label>תפקיד</label><select id="epaF_roleType">${(d.roleTypes || []).map(r => `<option value="${r.value}" ${e.roleType === r.value ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div><label>טלפון</label><input id="epaF_phone" value="${esc(e.phone)}"></div>
            <div><label>צבע</label><input id="epaF_color" type="color" value="${esc(e.color || '#2563eb')}"></div>
            <div><label>ותק</label><input id="epaF_seniority" value="${esc(e.seniority)}"></div>
            <div><label>דירוג עדיפות (נסתר)</label><input id="epaF_priorityRank" type="number" value="${e.priorityRank ?? ''}"></div>
            <div><label>מכסת משמרות חודשית</label><input id="epaF_minShiftsPerMonth" type="number" value="${e.minShiftsPerMonth ?? ''}"></div>
            <div><label>אורך משמרת מינימלי (שעות)</label><input id="epaF_minShiftHours" type="number" value="${e.minShiftHours ?? ''}"></div>
            <div><label>חניכה</label><select id="epaF_isTrainee"><option value="0" ${!e.isTrainee ? 'selected' : ''}>לא</option><option value="1" ${e.isTrainee ? 'selected' : ''}>כן</option></select></div>
            <div><label>פעיל/ה</label><select id="epaF_active"><option value="1" ${e.active ? 'selected' : ''}>כן</option><option value="0" ${!e.active ? 'selected' : ''}>לא</option></select></div>
            ${rates}
            <div class="epa-skills"><label style="width:100%;font-weight:700">הכשרות:</label>${skillBoxes}</div>
        </div>
        ${permissionsSection}
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-save-employee" data-emp="${e.id}">שמירה</button>
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

function renderConnectStaffForm(ce, d, staffId) {
    const staff = (ce._staffData || []).find(s => s.staffId === staffId);
    if (!staff) return '<div class="ep-empty">לא נמצאו פרטי עובד/ת.</div>';
    return `<div class="epa-detail-grid" style="margin-bottom:10px">
            <div class="epa-detail-item"><span>שם ב-Wix Bookings</span><b>${esc(staff.name || '—')}</b></div>
            <div class="epa-detail-item"><span>אימייל</span><b>${esc(staff.email || '—')}</b></div>
            <div class="epa-detail-item"><span>טלפון</span><b>${esc(staff.phone || '—')}</b></div>
        </div>
        <div class="epa-form">
            <div><label>שם תצוגה בפורטל</label><input id="epaCS_displayName" value="${esc(staff.name || '')}"></div>
            <div><label>תפקיד</label><select id="epaCS_roleType">${(d.roleTypes || []).map(r => `<option value="${r.value}" ${r.value === 'Employee' ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div><label>טלפון</label><input id="epaCS_phone" value="${esc(staff.phone || '')}"></div>
            <div><label>צבע</label><input id="epaCS_color" type="color" value="#2563eb"></div>
        </div>
        <div class="ep-empty" style="text-align:center;margin-top:8px">הרשאות ברירת המחדל יוחלו אוטומטית לפי סוג התפקיד שנבחר. ניתן לערוך הרשאות מפורטות בעריכת הפרופיל לאחר החיבור.</div>
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-save-connect-staff" data-staff="${esc(staff.staffId)}">חיבור עובד/ת</button>
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
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
    return `<div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>סדנה</th><th>משתתפים למדריך</th><th>הורה-ילד למדריך</th><th>מינימום מדריכים</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSettingsPage(_ce, d) {
    const s = d.settings || {};
    const holidays = (s.holidays || []).map((h, index) => `<div class="epa-holiday-row" data-holiday-row>
        <input type="date" class="epaH_date" value="${esc(h.date)}" aria-label="תאריך חג">
        <input class="epaH_name" value="${esc(h.name)}" placeholder="שם החג" aria-label="שם החג">
        <button class="epa-btn danger" data-action="admin-remove-holiday" title="הסרה" data-index="${index}">×</button>
    </div>`).join('');
    return `<div class="epa-page-head"><div><h2>הגדרות</h2><p>כל הגדרות המערכת, הזמינות והשיבוץ</p></div></div>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>הגדרות זמינות כלליות</h3></div>
            <div class="epa-settings-grid">
                <div class="epa-field"><label>ימים לפני סוף החודש לסגירת הגשות</label><input id="epaS_deadline" type="number" min="1" value="${s.deadlineDaysBeforeMonthEnd ?? 4}"></div>
                <div class="epa-field"><label>מספר חודשים קדימה</label><input id="epaS_monthsAhead" type="number" min="1" value="${s.monthsAheadAllowed ?? 1}"></div>
                <div class="epa-field"><label>מכסת משמרות חודשית</label><input id="epaS_minShifts" type="number" min="1" value="${s.defaultMinShiftsPerMonth ?? 3}"></div>
                <div class="epa-field"><label>אורך משמרת מינימלי</label><input id="epaS_minHours" type="number" min="0.5" step="0.5" value="${s.defaultMinShiftHours ?? 4}"></div>
                <div class="epa-field"><label>שעת התחלה ברירת מחדל</label><input id="epaS_start" type="time" value="${esc(s.defaultShiftStart || '10:00')}"></div>
                <div class="epa-field"><label>שעת סיום ברירת מחדל</label><input id="epaS_end" type="time" value="${esc(s.defaultShiftEnd || '16:00')}"></div>
                <label class="epa-toggle"><input id="epaS_bonus" type="checkbox" ${s.bonusUnlockEnabled !== false ? 'checked' : ''}> פתיחת משמרות נוספות לאחר השלמת מכסה</label>
            </div>
            <div class="epa-inline"><button class="epa-btn primary" data-action="admin-save-settings">שמירת הגדרות</button></div>
        </section>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>כללי שיבוץ לפי סוג סדנה</h3></div>
            ${renderRules(d)}
        </section>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>חגים ומועדים</h3><button class="epa-btn" data-action="admin-add-holiday">הוספת מועד</button></div>
            <div id="epaHolidayList">${holidays || '<div class="ep-empty" id="epaHolidayEmpty">לא הוגדרו מועדים</div>'}</div>
            <div class="epa-inline"><button class="epa-btn primary" data-action="admin-save-holidays">שמירת מועדים</button></div>
        </section>`;
}

function renderTemplatesPage(ce, _d) {
    if (!ce._templatesData) {
        return `<div class="epa-page-head"><div><h2>תבניות</h2><p>ניהול תבניות וואטסאפ</p></div></div>
            <section class="epa-panel"><div class="ep-loading"><div class="ep-spinner"></div>טוען תבניות…</div></section>`;
    }
    const cards = ce._templatesData.map(t => `<article class="epa-template" data-action="admin-edit-template" data-template="${esc(t.id)}">
        <div class="epa-panel-title"><h3>${esc(t.title)}</h3>${t.isSystem ? '<span class="epa-badge kind">מערכת</span>' : ''}</div>
        <p>${esc(t.body)}</p>
    </article>`).join('');
    return `<div class="epa-page-head"><div><h2>תבניות</h2><p>ניהול הודעות וואטסאפ שמורות</p></div>
        <button class="epa-btn primary" data-action="admin-new-template">תבנית חדשה</button></div>
        <section class="epa-panel"><div class="epa-template-grid">${cards || '<div class="ep-empty">אין תבניות שמורות</div>'}</div></section>`;
}

function renderTemplateForm(template) {
    return `<div class="epa-field"><label>שם התבנית</label><input id="epaT_title" value="${esc(template?.title || '')}" maxlength="120"></div>
        <div class="epa-field" style="margin-top:10px"><label>תוכן ההודעה</label><textarea id="epaT_body">${esc(template?.body || '')}</textarea></div>
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-save-template" data-template="${esc(template?.id || '')}">שמירה</button>
            ${template?.id && !template.isSystem ? `<button class="epa-btn danger" data-action="admin-delete-template" data-template="${esc(template.id)}">מחיקה</button>` : ''}
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

function renderMessagesPage(ce, _d) {
    const messages = ce._adminMessagesData;
    const head = `<div class="epa-page-head"><div><h2>הודעות</h2><p>הודעות אישיות והודעות מערכת לעובדים</p></div>
        ${messages ? `<button class="epa-btn primary" data-action="admin-new-message">הודעה חדשה +</button>` : ''}</div>`;
    if (!messages) {
        return `${head}<section class="epa-panel"><div class="ep-loading"><div class="ep-spinner"></div>טוען הודעות…</div></section>`;
    }
    const rows = messages.map(m => `
        <tr class="epa-row-click" data-action="admin-edit-message" data-message="${esc(m.id)}" style="${m.expired ? 'opacity:.55' : ''}">
            <td><span class="epa-badge kind">${m.scope === 'ALL' ? 'מערכת' : 'אישי'}</span></td>
            <td>${esc(m.title)}</td>
            <td>${m.scope === 'EMPLOYEE' ? esc(m.employeeName || '—') : 'כל העובדים'}</td>
            <td>${m.expiresAt ? fmtDate(String(m.expiresAt).slice(0, 10)) : '—'}</td>
            <td><span class="epa-badge ${m.expired ? 'miss' : 'ok'}">${m.expired ? 'פג תוקף' : 'פעיל'}</span></td>
            <td><button class="epa-btn danger" data-action="admin-delete-message" data-message="${esc(m.id)}">מחיקה</button></td>
        </tr>`).join('');
    return `${head}
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>כל ההודעות (${messages.length})</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>סוג</th><th>כותרת</th><th>יעד</th><th>תוקף עד</th><th>סטטוס</th><th></th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" class="ep-empty">אין הודעות</td></tr>'}</tbody>
            </table></div>
        </section>`;
}

function renderMessageForm(ce, d, message) {
    const employees = (d.employees || []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
    const empOptions = employees.map(e => `<option value="${esc(e.id)}" ${message?.employeeId === e.id ? 'selected' : ''}>${esc(e.displayName)}</option>`).join('');
    const scope = message?.scope || 'ALL';
    return `<div class="epa-form">
            <div style="grid-column:1/-1"><label>כותרת</label><input id="epaM_title" value="${esc(message?.title || '')}" maxlength="150"></div>
            <div><label>סוג הודעה</label><select id="epaM_scope">
                <option value="ALL" ${scope === 'ALL' ? 'selected' : ''}>הודעת מערכת (לכל העובדים)</option>
                <option value="EMPLOYEE" ${scope === 'EMPLOYEE' ? 'selected' : ''}>הודעה אישית</option>
            </select></div>
            <div id="epaM_empWrap" style="${scope === 'EMPLOYEE' ? '' : 'display:none'}"><label>עובד/ת</label><select id="epaM_employeeId">${empOptions}</select></div>
            <div><label>תוקף עד (אופציונלי)</label><input id="epaM_expiresAt" type="date" value="${message?.expiresAt ? esc(String(message.expiresAt).slice(0, 10)) : ''}"></div>
        </div>
        <div class="epa-field" style="margin-top:8px"><label>תוכן ההודעה</label><textarea id="epaM_body">${esc(message?.body || '')}</textarea></div>
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-save-message" data-message="${esc(message?.id || '')}">שמירה</button>
            ${message?.id ? `<button class="epa-btn danger" data-action="admin-delete-message" data-message="${esc(message.id)}">מחיקה</button>` : ''}
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

function renderModal(ce, d) {
    const modal = ce._adminModal;
    if (!modal) return '';
    let title = '', body = '';
    if (modal.type === 'employee') {
        const employee = (d.employees || []).find(e => e.id === modal.id);
        if (!employee) return '';
        title = `הגדרות — ${employee.displayName}`;
        body = renderEmployeeForm(employee, d);
    } else if (modal.type === 'submission') {
        const s = (d.submissions || []).find(x => x.id === modal.id);
        if (!s) return '';
        const statusLabel = { SUBMITTED: 'הוגש', STANDBY: 'בהמתנה', SCHEDULED: 'משובץ' };
        title = 'פרטי הגשה';
        body = `<div class="epa-detail-grid">
            <div class="epa-detail-item"><span>עובד/ת</span><b>${esc(s.employeeName)}</b></div>
            <div class="epa-detail-item"><span>תאריך</span><b>${fmtDate(s.date)}</b></div>
            <div class="epa-detail-item"><span>שעות</span><b>${esc(s.startTime)}–${esc(s.endTime)}</b></div>
            <div class="epa-detail-item"><span>סטטוס</span><b>${statusLabel[s.status] || esc(s.status)}</b></div>
            <div class="epa-detail-item"><span>סוג סדנה</span><b>${esc(s.workshopName || '—')}</b></div>
            <div class="epa-detail-item"><span>שיבוץ מנהל/ת</span><b>${s.managerOverride ? 'כן' : 'לא'}</b></div>
        </div>
        <div class="epa-inline">
            ${d.permissions.manageScheduling ? `<button class="epa-btn" data-action="admin-nudge" data-emp="${esc(s.employeeId)}">שליחת תזכורת</button>` : ''}
            ${s.status === 'SCHEDULED' && s.workshopTypeId && d.permissions.manageScheduling ? `<button class="epa-btn danger" data-action="admin-cancel-assign" data-date="${esc(s.date)}" data-type="${esc(s.workshopTypeId)}" data-emp="${esc(s.employeeId)}">ביטול שיבוץ</button>` : ''}
        </div>`;
    } else if (modal.type === 'template') {
        const template = modal.id ? (ce._templatesData || []).find(t => t.id === modal.id) : null;
        title = template ? `עריכת תבנית — ${template.title}` : 'תבנית חדשה';
        body = renderTemplateForm(template);
    } else if (modal.type === 'connectStaff') {
        const staff = (ce._staffData || []).find(s => s.staffId === modal.id);
        if (!staff) return '';
        title = `חיבור עובד/ת — ${staff.name || staff.email || staff.staffId}`;
        body = renderConnectStaffForm(ce, d, modal.id);
    } else if (modal.type === 'timeEntry') {
        const entry = modal.id
            ? (ce._teamTimeData?.employees || []).flatMap(e => e.entries).find(x => x.id === modal.id)
            : null;
        title = entry ? 'עריכת רישום שעות' : 'רישום שעות חדש';
        body = renderTimeEntryForm(ce, d, entry);
    } else if (modal.type === 'message') {
        const message = modal.id ? (ce._adminMessagesData || []).find(m => m.id === modal.id) : null;
        title = message ? 'עריכת הודעה' : 'הודעה חדשה';
        body = renderMessageForm(ce, d, message);
    }
    return `<div class="epa-modal-backdrop">
        <div class="epa-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
            <div class="epa-modal-head"><h2>${esc(title)}</h2><button class="epa-modal-close" data-action="admin-close-modal" aria-label="סגירה">×</button></div>
            ${body}
        </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Click handling — returns true when the action was handled here
// ---------------------------------------------------------------------------

export function handleAdminClick(ce, action, target) {
    const d = ce._adminData;
    switch (action) {
        case 'admin-toggle-sidebar':
            ce._adminSidebarCollapsed = !ce._adminSidebarCollapsed;
            ce.render();
            return true;
        case 'admin-page':
            ce._adminPage = target.dataset.page;
            ce._adminModal = null;
            if (ce._adminPage === 'templates' && !ce._templatesData) {
                ce._dispatch('adminTemplatesLoad');
            }
            if (ce._adminPage === 'employees' && !ce._staffData && d?.permissions?.manageEmployees) {
                ce._dispatch('adminStaffLoad');
            }
            if (ce._adminPage === 'teamTime' && !ce._teamTimeData && d?.permissions?.editTimeEntries) {
                ce._dispatch('adminTeamTimeLoad', { monthKey: ce._teamTimeMonth });
            }
            if (ce._adminPage === 'messages' && !ce._adminMessagesData && d?.permissions?.manageEmployees) {
                ce._dispatch('adminMessagesLoad');
            }
            ce.render();
            return true;
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
            ce._adminModal = null;
            ce._startBusy('מבטל שיבוץ…');
            ce._dispatch('adminCancelAssignment', {
                dateKey: target.dataset.date,
                workshopTypeId: target.dataset.type,
                employeeId: target.dataset.emp,
            });
            return true;
        case 'admin-edit-employee':
            if (!d?.permissions?.manageEmployees) return true;
            ce._adminModal = { type: 'employee', id: target.dataset.emp };
            ce.render();
            return true;
        case 'admin-open-submission':
            ce._adminModal = { type: 'submission', id: target.dataset.sub };
            ce.render();
            return true;
        case 'admin-close-modal':
            ce._adminModal = null;
            ce.render();
            return true;
        case 'admin-cancel-edit':
            ce._adminModal = null; ce.render(); return true;
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
            ce._adminModal = null;
            ce._dispatch('adminUpdateEmployee', { roleId: target.dataset.emp, patch });
            const permCheckboxes = [...ce.querySelectorAll('.epaPerm')];
            if (permCheckboxes.length) {
                const permissions = {};
                for (const cb of permCheckboxes) permissions[cb.dataset.perm] = cb.checked;
                ce._dispatch('adminUpdateEmployeePermissions', { roleId: target.dataset.emp, permissions });
            }
            return true;
        }
        case 'admin-staff-refresh':
            ce._staffData = null;
            ce.render();
            ce._dispatch('adminStaffLoad');
            return true;
        case 'admin-new-staff':
            window.open(WIX_NEW_STAFF_URL, '_blank', 'noopener');
            return true;
        case 'admin-connect-staff':
            ce._adminModal = { type: 'connectStaff', id: target.dataset.staff };
            ce.render();
            return true;
        case 'admin-save-connect-staff': {
            const val = (id) => ce.querySelector(`#${id}`)?.value;
            const patch = {
                displayName: val('epaCS_displayName') || undefined,
                roleType: val('epaCS_roleType') || undefined,
                phone: val('epaCS_phone') ?? undefined,
                color: val('epaCS_color') || undefined,
            };
            ce._adminModal = null;
            ce._startBusy('מחבר עובד/ת…');
            ce._dispatch('adminLinkStaff', { staffId: target.dataset.staff, patch });
            return true;
        }
        case 'admin-teamtime-month-prev':
            ce._teamTimeMonth = shiftMonth(ce._teamTimeMonth, -1);
            ce._teamTimeData = null;
            ce.render();
            ce._dispatch('adminTeamTimeLoad', { monthKey: ce._teamTimeMonth });
            return true;
        case 'admin-teamtime-month-next':
            ce._teamTimeMonth = shiftMonth(ce._teamTimeMonth, 1);
            ce._teamTimeData = null;
            ce.render();
            ce._dispatch('adminTeamTimeLoad', { monthKey: ce._teamTimeMonth });
            return true;
        case 'admin-teamtime-select':
            ce._teamTimeEmployee = target.dataset.emp;
            ce.render();
            return true;
        case 'admin-teamtime-add':
            ce._adminModal = { type: 'timeEntry', id: null };
            ce.render();
            return true;
        case 'admin-teamtime-edit':
            ce._adminModal = { type: 'timeEntry', id: target.dataset.entry };
            ce.render();
            return true;
        case 'admin-teamtime-delete':
            ce._startBusy('מוחק רישום…');
            ce._dispatch('adminTeamTimeDelete', { entryId: target.dataset.entry, monthKey: ce._teamTimeMonth });
            return true;
        case 'admin-teamtime-save': {
            const val = (id) => ce.querySelector(`#${id}`)?.value;
            const entry = {
                id: target.dataset.entry || undefined,
                employeeId: val('epaTE_employeeId') || undefined,
                taskType: val('epaTE_taskType'),
                startTime: val('epaTE_start') ? new Date(val('epaTE_start')).toISOString() : null,
                endTime: val('epaTE_end') ? new Date(val('epaTE_end')).toISOString() : null,
                notes: val('epaTE_notes') || '',
            };
            if (!entry.startTime) {
                ce._toast('יש להזין שעת התחלה.', 'error');
                return true;
            }
            ce._adminModal = null;
            ce._startBusy('שומר רישום…');
            ce._dispatch('adminTeamTimeUpsert', { entry, monthKey: ce._teamTimeMonth });
            return true;
        }
        case 'admin-teamtime-export':
            ce._startBusy('מייצא קובץ…');
            ce._dispatch('adminTeamTimeExport', { monthKey: ce._teamTimeMonth });
            return true;
        case 'admin-save-settings': {
            const value = id => ce.querySelector(`#${id}`)?.value;
            ce._startBusy('שומר הגדרות…');
            ce._dispatch('adminUpdateSettings', {
                patch: {
                    deadlineDaysBeforeMonthEnd: Number(value('epaS_deadline')),
                    monthsAheadAllowed: Number(value('epaS_monthsAhead')),
                    defaultMinShiftsPerMonth: Number(value('epaS_minShifts')),
                    defaultMinShiftHours: Number(value('epaS_minHours')),
                    defaultShiftStart: value('epaS_start'),
                    defaultShiftEnd: value('epaS_end'),
                    bonusUnlockEnabled: !!ce.querySelector('#epaS_bonus')?.checked,
                },
            });
            return true;
        }
        case 'admin-add-holiday': {
            const list = ce.querySelector('#epaHolidayList');
            if (!list) return true;
            ce.querySelector('#epaHolidayEmpty')?.remove();
            const row = document.createElement('div');
            row.className = 'epa-holiday-row';
            row.dataset.holidayRow = '';
            row.innerHTML = `<input type="date" class="epaH_date" aria-label="תאריך חג">
                <input class="epaH_name" placeholder="שם החג" aria-label="שם החג">
                <button class="epa-btn danger" data-action="admin-remove-holiday" title="הסרה">×</button>`;
            list.appendChild(row);
            row.querySelector('input')?.focus();
            return true;
        }
        case 'admin-remove-holiday':
            target.closest('[data-holiday-row]')?.remove();
            return true;
        case 'admin-save-holidays': {
            const holidays = [...ce.querySelectorAll('[data-holiday-row]')].map(row => ({
                date: row.querySelector('.epaH_date')?.value || '',
                name: row.querySelector('.epaH_name')?.value || '',
            })).filter(h => h.date && h.name.trim());
            ce._startBusy('שומר מועדים…');
            ce._dispatch('adminUpdateHolidays', { holidays });
            return true;
        }
        case 'admin-new-template':
            ce._adminModal = { type: 'template', id: null };
            ce.render();
            return true;
        case 'admin-edit-template':
            ce._adminModal = { type: 'template', id: target.dataset.template };
            ce.render();
            return true;
        case 'admin-save-template': {
            const title = ce.querySelector('#epaT_title')?.value || '';
            const body = ce.querySelector('#epaT_body')?.value || '';
            if (!title.trim() || !body.trim()) {
                ce._toast('יש להזין שם ותוכן לתבנית.', 'error');
                return true;
            }
            ce._adminModal = null;
            ce._startBusy('שומר תבנית…');
            ce._dispatch('adminTemplateSave', { template: { id: target.dataset.template || null, title, body } });
            return true;
        }
        case 'admin-delete-template':
            ce._adminModal = null;
            ce._startBusy('מוחק תבנית…');
            ce._dispatch('adminTemplateDelete', { templateId: target.dataset.template });
            return true;
        case 'admin-new-message':
            ce._adminModal = { type: 'message', id: null };
            ce.render();
            return true;
        case 'admin-edit-message':
            ce._adminModal = { type: 'message', id: target.dataset.message };
            ce.render();
            return true;
        case 'admin-save-message': {
            const val = (id) => ce.querySelector(`#${id}`)?.value;
            const scope = val('epaM_scope') === 'EMPLOYEE' ? 'EMPLOYEE' : 'ALL';
            const title = (val('epaM_title') || '').trim();
            const body = (val('epaM_body') || '').trim();
            if (!title || !body) {
                ce._toast('יש להזין כותרת ותוכן להודעה.', 'error');
                return true;
            }
            const employeeId = scope === 'EMPLOYEE' ? val('epaM_employeeId') : null;
            if (scope === 'EMPLOYEE' && !employeeId) {
                ce._toast('יש לבחור עובד/ת להודעה אישית.', 'error');
                return true;
            }
            ce._adminModal = null;
            ce._startBusy('שומר הודעה…');
            ce._dispatch('adminMessageSave', {
                message: {
                    id: target.dataset.message || undefined,
                    title, body, scope, employeeId,
                    expiresAt: val('epaM_expiresAt') || null,
                },
            });
            return true;
        }
        case 'admin-delete-message':
            ce._adminModal = null;
            ce._startBusy('מוחק הודעה…');
            ce._dispatch('adminMessageDelete', { messageId: target.dataset.message });
            return true;
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
