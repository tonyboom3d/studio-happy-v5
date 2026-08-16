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
.epa-day { border: 1px solid #e5e7eb; border-radius: 9px; min-height: 90px; padding: 5px; font-size: 13px; cursor: pointer; background: #fff; position: relative; }
.epa-day.other { visibility: hidden; }
.epa-day.sel { box-shadow: inset 0 0 0 2px #2563eb; }
.epa-day .num { font-weight: 700; font-size: 14px; }
.epa-day.cov-none { background: #fef2f2; }
.epa-day.cov-partial { background: #fffbeb; }
.epa-day.cov-full { background: #ecfdf5; }
.epa-day.no-ws { background: #f9fafb; color: #9ca3af; }
.epa-day.blocked { background: #e5e7eb; }
.epa-day .hol { display: block; font-size: 11px; color: #b45309; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.epa-day .cnt { display: block; font-size: 11.5px; color: #4b5563; line-height: 1.3; margin-top: 1px; }
.epa-flag { position: absolute; top: 3px; inset-inline-start: 4px; font-size: 10px; }
.epa-day-plus { position: absolute; top: 3px; inset-inline-end: 4px; width: 15px; height: 15px; line-height: 15px; text-align: center; font-size: 11px; font-weight: 700; border-radius: 50%; background: #dbeafe; color: #1d4ed8; cursor: help; }
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
.epa-warning { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 8px; padding: 6px 9px; font-size: 12px; margin: 4px 0; }
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
.epa-nav-btn { position: relative; }
.epa-nav-label { flex: 1; }
.epa-nav-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 10.5px; font-weight: 800; line-height: 1; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,.6); }
.epa-nav-btn.active .epa-nav-badge { background: #fff; color: #dc2626; box-shadow: none; }
.epa-shell.collapsed .epa-nav-btn .epa-nav-badge { position: absolute; top: 2px; inset-inline-end: 4px; }
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
.epa-table select { font-size: 12px; padding: 4px 6px; border-radius: 6px; border: 1px solid #e5e7eb; max-width: 120px; }
.epa-sub-actions { display: flex; gap: 4px; flex-wrap: wrap; }
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
.epa-time-input { border: 1px solid #cbd5e1; border-radius: 9px; padding: 7px 9px; font: inherit; font-size: 12px; background: #fff; width: 92px; text-align: center; letter-spacing: .5px; }
.epa-time-input:disabled { background: #f1f5f9; color: #94a3b8; }
.epa-time-input:focus { outline: 0; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.epa-field textarea { min-height: 170px; resize: vertical; }
.epa-field input:focus,.epa-field select:focus,.epa-field textarea:focus { outline: 0; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.epa-toggle { display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: 12px; }
.epa-toggle input { accent-color: #2563eb; width: 17px; height: 17px; }
.epa-switch-field { display: flex; flex-direction: column; }
.epa-switch-field label:first-child { display: block; font-size: 11px; color: #64748b; margin-bottom: 4px; }
.epa-switch-row { display: flex; align-items: center; gap: 9px; height: 36px; }
.epa-switch { position: relative; display: inline-block; width: 42px; height: 24px; flex-shrink: 0; }
.epa-switch input { opacity: 0; width: 0; height: 0; }
.epa-switch-slider { position: absolute; inset: 0; cursor: pointer; background: #cbd5e1; border-radius: 999px; transition: background .18s ease; }
.epa-switch-slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform .18s ease; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.epa-switch input:checked + .epa-switch-slider { background: #16a34a; }
.epa-switch input:checked + .epa-switch-slider::before { transform: translateX(18px); }
.epa-switch input:focus-visible + .epa-switch-slider { outline: 2px solid #2563eb; outline-offset: 2px; }
.epa-switch-status { font-size: 12px; font-weight: 700; }
.epa-switch-status.on { color: #16a34a; }
.epa-switch-status.off { color: #dc2626; }
.epa-deactivate-shifts { max-height: 260px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 10px; margin-top: 8px; }
.epa-deactivate-shift-row { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; font-size: 12.5px; border-bottom: 1px solid #f1f5f9; }
.epa-deactivate-shift-row:last-child { border-bottom: none; }
.epa-field-error { color: #dc2626; font-size: 11px; margin-top: 4px; display: none; }
.epa-field.has-error input,.epa-field.has-error select { border-color: #dc2626 !important; box-shadow: 0 0 0 3px rgba(220,38,38,.1) !important; }
.epa-field.has-error .epa-field-error { display: block; }
.epa-save-spin { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.5); border-top-color: #fff; border-radius: 50%; margin-inline-end: 6px; vertical-align: -1px; animation: ep-spin .8s linear infinite; }
@keyframes ep-spin { to { transform: rotate(360deg); } }
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
.epa-scope-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-inline-start: 8px; vertical-align: middle; }
.epa-scope-tag.one { background: #dbeafe; color: #1e40af; }
.epa-scope-tag.all { background: #fef3c7; color: #92400e; }
.epa-scope-personal { border: 1px solid #bfdbfe; background: #f5f9ff; }
.epa-scope-global { border: 1px solid #fde68a; background: #fffdf5; padding: 0 !important; overflow: hidden; }
.epa-accordion-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; border: 0; background: transparent; padding: 13px 15px; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 700; color: #92400e; }
.epa-accordion-toggle:hover { background: rgba(245,158,11,.08); }
.epa-accordion-arrow { font-size: 11px; }
.epa-accordion-body { padding: 2px 15px 15px; border-top: 1px solid #fde68a; }
.epa-accordion-body .epa-field-block { margin-top: 10px; }
.epa-accordion-body .epa-field-block b { font-size: 12px; color: #78350f; display: block; margin-bottom: 5px; }
.epa-assign-ws { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 4px 10px; border: 1px solid #bfdbfe; border-radius: 999px; cursor: pointer; margin: 3px 4px 0 0; background: #fff; }
.epa-assign-ws:hover { border-color: #60a5fa; }
.epa-pick-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 4px; border-bottom: 1px solid #f1f5f9; font-size: 12.5px; }
.epa-pick-row:last-child { border-bottom: none; }
.epa-pick-row input:disabled { opacity: .35; cursor: not-allowed; }
.epa-emp-acc .epa-accordion-toggle { color: #1d4ed8; }
.epa-emp-acc .epa-accordion-toggle:hover { background: rgba(37,99,235,.08); }
.epa-emp-acc .epa-accordion-body { border-top: 1px solid #dbeafe; }
.epa-board-acc { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.epa-board-acc .epa-accordion-toggle { color: #1f2937; }
.epa-board-acc .epa-accordion-toggle:hover { background: #f9fafb; }
.epa-board-acc .epa-accordion-body { border-top: 1px solid #e5e7eb; padding: 12px 15px 15px; }
.epa-filter-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; align-items: flex-end; }
.epa-filter-row label { display: block; font-size: 11px; color: #6b7280; margin-bottom: 3px; }
.epa-filter-row select { font-size: 12px; padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 7px; min-width: 140px; }
.epa-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 10px; font-size: 12px; }
.epa-pager-info { color: #6b7280; }
.epa-detail-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.epa-detail-item { background: #f8fafc; border-radius: 9px; padding: 8px 10px; }
.epa-detail-item span { display: block; font-size: 10.5px; color: #64748b; }
.epa-detail-item b { font-size: 12.5px; }
.epa-sort-handle { cursor: grab; color: #94a3b8; padding: 0 8px; user-select: none; font-size: 16px; line-height: 1; }
.epa-sort-handle:active { cursor: grabbing; }
.epa-emp-sort-row.dragging { opacity: 0.45; }
.epa-emp-sort-row.drag-over { box-shadow: inset 0 -2px 0 #3b82f6; }
.epa-sort-actions { display: inline-flex; flex-direction: column; gap: 2px; }
.epa-sort-actions button { border: 1px solid #dbeafe; background: #fff; border-radius: 6px; width: 24px; height: 20px; cursor: pointer; font-size: 11px; line-height: 1; padding: 0; color: #1d4ed8; }
.epa-sort-actions button:disabled { opacity: 0.35; cursor: not-allowed; }
.epa-btn-sm { padding: 3px 9px !important; font-size: 11px !important; border-radius: 7px !important; }
.epa-error-list { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.epa-error-item { font-size: 12px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 6px 10px; }
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

// Wix dashboard URL for creating a new Bookings staff member.
const WIX_NEW_STAFF_URL = 'https://manage.wix.com/dashboard/f0548b42-7f52-447c-9076-45112f85765b/bookings/staff?referralInfo=search';

const TEMPLATE_USE = {
    ORDERS: 'orders',
    EMPLOYEES: 'employees',
};
const TEMPLATE_USE_LABELS = {
    orders: 'מערכת ניהול הזמנות',
    employees: 'מערכת עובדים',
};

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return [];
    if (typeof value === 'object') return Object.values(value).filter(Boolean);
    return [value];
}
function employeesForPage(ce, d) {
    return sortEmployees(d?.permissions?.manageEmployees ? asArray(ce._allEmployees) : asArray(d?.employees));
}
function sortEmployees(list) {
    return asArray(list).slice().sort((a, b) =>
        (a.priorityRank ?? 999) - (b.priorityRank ?? 999)
        || a.displayName.localeCompare(b.displayName, 'he'));
}
function findEmployee(ce, d, id) {
    return employeesForPage(ce, d).find(e => e.id === id);
}

function readEmployeeFormValues(ce, d) {
    const val = (id) => ce.querySelector(`#${id}`)?.value;
    const num = (id) => { const v = Number(val(id)); return Number.isFinite(v) && val(id) !== '' ? v : null; };
    const activeEl = ce.querySelector('#epaF_active');
    const patch = {
        displayName: val('epaF_displayName') || undefined,
        roleType: val('epaF_roleType') || undefined,
        phone: val('epaF_phone') ?? undefined,
        color: val('epaF_color') || undefined,
        seniority: val('epaF_seniority') ?? undefined,
        priorityRank: num('epaF_priorityRank'),
        minShiftsPerWeek: num('epaF_minShiftsPerWeek'),
        minShiftHours: num('epaF_minShiftHours'),
        requiredFridaysPerMonth: num('epaF_reqFridays'),
        requiredSaturdaysPerMonth: num('epaF_reqSaturdays'),
        isTrainee: val('epaF_isTrainee') === '1',
        active: activeEl ? !!activeEl.checked : true,
    };
    const skillEls = [...ce.querySelectorAll('.epa-skill')];
    if (skillEls.length) patch.skillIds = skillEls.filter(x => x.checked).map(x => x.value);
    if (d?.permissions?.manageRates) {
        patch.rateStudio = num('epaF_rateStudio');
        patch.rateInstruction = num('epaF_rateInstruction');
        patch.rateWool = num('epaF_rateWool');
    }
    const permEls = [...ce.querySelectorAll('.epaPerm')];
    let permissions = null;
    if (permEls.length) {
        permissions = {};
        for (const cb of permEls) permissions[cb.dataset.perm] = cb.checked;
    }
    return { patch, permissions };
}

/** Persists in-progress employee form edits across accordion toggles / re-renders. */
export function captureEmployeeFormDraft(ce, d) {
    if (ce._adminModal?.type !== 'employee') return;
    if (!ce.querySelector('#epaF_displayName')) return;
    const roleId = ce._adminModal.id;
    const existing = ce._empFormDraft?.[roleId] || {};
    const { patch: domPatch, permissions: domPerms } = readEmployeeFormValues(ce, d);
    const patch = { ...(existing.patch || {}), ...domPatch };
    if (domPatch.skillIds) patch.skillIds = domPatch.skillIds;
    else if (existing.patch?.skillIds) patch.skillIds = existing.patch.skillIds;
    let permissions = { ...(existing.permissions || {}) };
    if (domPerms) Object.assign(permissions, domPerms);
    if (!ce._empFormDraft) ce._empFormDraft = {};
    ce._empFormDraft[roleId] = {
        patch,
        permissions: Object.keys(permissions).length ? permissions : null,
    };
}

function employeeForForm(ce, employee) {
    if (!employee) return null;
    const draft = ce._empFormDraft?.[employee.id];
    if (!draft) return employee;
    const merged = { ...employee, ...draft.patch };
    if (draft.patch?.skillIds) merged.skillIds = draft.patch.skillIds;
    if (draft.permissions) merged.permissions = { ...(employee.permissions || {}), ...draft.permissions };
    return merged;
}
function applyEmployeeOrder(ce, d, roleIds) {
    const list = employeesForPage(ce, d);
    const byId = Object.fromEntries(list.map(e => [e.id, e]));
    const reordered = roleIds.map((id, index) => {
        const emp = byId[id];
        return emp ? { ...emp, priorityRank: index + 1 } : null;
    }).filter(Boolean);
    for (const emp of list) {
        if (!roleIds.includes(emp.id)) reordered.push(emp);
    }
    if (d?.permissions?.manageEmployees) ce._allEmployees = reordered;
}
function requestEmployeeReorder(ce, d, roleIds) {
    applyEmployeeOrder(ce, d, roleIds);
    ce._startBusy('שומר סדר עובדים…');
    ce._dispatch('adminReorderEmployees', { roleIds });
}
/** Employees ordered by the in-progress (unsaved) sort-mode arrangement, if any. */
function sortModeEmployees(ce, d) {
    const employees = employeesForPage(ce, d);
    if (!ce._empSortMode || !Array.isArray(ce._empPendingOrder)) return employees;
    const byId = new Map(employees.map(e => [e.id, e]));
    const ordered = ce._empPendingOrder.map(id => byId.get(id)).filter(Boolean);
    for (const e of employees) {
        if (!ce._empPendingOrder.includes(e.id)) ordered.push(e);
    }
    return ordered;
}
function moveEmployeeInOrder(ce, d, roleId, direction) {
    const employees = sortModeEmployees(ce, d);
    const idx = employees.findIndex(e => e.id === roleId);
    if (idx < 0) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= employees.length) return;
    const next = employees.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    ce._empPendingOrder = next.map(e => e.id);
    ce._empOrderDirty = true;
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

const DEFAULT_WORK_TYPE = 'WORKSHOP';
const WORK_TYPE_LABELS = { WORKSHOP: 'סדנה', OPENING: 'פתיחה', CLOSING: 'קיפול' };

function workTypeOptions(selected) {
    const sel = selected || DEFAULT_WORK_TYPE;
    return ['WORKSHOP', 'OPENING', 'CLOSING'].map(v =>
        `<option value="${v}" ${sel === v ? 'selected' : ''}>${WORK_TYPE_LABELS[v]}</option>`).join('');
}

function workshopOptionsForSubmission(d, s) {
    const dayTypes = d.days?.[s.date]?.types || [];
    const opts = [];
    if (dayTypes.length) {
        for (const t of dayTypes) opts.push({ id: t.typeId, name: t.name });
    } else if (s.workshopTypeId) {
        opts.push({ id: s.workshopTypeId, name: s.workshopName || 'סדנה' });
    } else {
        for (const w of (d.workshopTypes || [])) opts.push({ id: w.id, name: w.name });
    }
    return opts;
}

function renderWorkshopCell(ce, d, s, canEdit) {
    if (s.status === 'SCHEDULED' && s.workshopName) return esc(s.workshopName);
    if (!canEdit || s.status === 'REJECTED') return s.workshopName ? esc(s.workshopName) : '—';
    const opts = workshopOptionsForSubmission(d, s);
    if (!opts.length) return '—';
    const selected = s.workshopTypeId || opts[0].id;
    return `<select class="epa-sub-ws" data-sub="${esc(s.id)}" data-action="admin-sub-ws">${opts.map(o =>
        `<option value="${esc(o.id)}" ${o.id === selected ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
}

function renderWorkTypeCell(ce, d, s, canEdit) {
    const wt = (ce._pendingWorkTypes && ce._pendingWorkTypes[s.id]) || s.workType || DEFAULT_WORK_TYPE;
    if (!canEdit || s.status === 'REJECTED') return esc(WORK_TYPE_LABELS[wt] || wt);
    return `<select class="epa-sub-worktype" data-sub="${esc(s.id)}" data-prev="${esc(wt)}" data-action="admin-sub-worktype">${workTypeOptions(wt)}</select>`;
}

function renderSubmissionActions(ce, d, s) {
    if (!d.permissions.manageScheduling || s.status === 'REJECTED') return '';
    if (s.status === 'SCHEDULED') {
        return `<button class="epa-btn danger" data-action="admin-reject-submission" data-sub="${esc(s.id)}">ביטול</button>`;
    }
    return `<div class="epa-sub-actions">
        <button class="epa-btn primary" data-action="admin-approve-submission" data-sub="${esc(s.id)}">אישור</button>
        <button class="epa-btn danger" data-action="admin-reject-submission" data-sub="${esc(s.id)}">דחייה</button>
    </div>`;
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
    if (d.permissions.manageEmployees) allowedPages.push('messages', 'vacations');
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
        vacations: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/><path d="M8 15h.01M12 15h.01M16 15h.01"/>',
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
        { page: 'vacations', label: 'חופשות', show: d.permissions.manageEmployees, badge: d.pendingVacationsCount || 0 },
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
            ${items.map(item => `<button class="epa-nav-btn ${ce._adminPage === item.page ? 'active' : ''}" data-action="admin-page" data-page="${item.page}" title="${item.label}${item.badge ? ` (${item.badge} ממתינות לאישור)` : ''}">
                ${icon(item.page)}<span class="epa-nav-label">${item.label}</span>${item.badge ? `<span class="epa-nav-badge">${item.badge > 99 ? '99+' : item.badge}</span>` : ''}
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
        case 'vacations': return renderVacationsPage(ce, d);
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
        ${d.openOffers?.length ? `<section class="epa-panel">${renderOpenOffers(ce, d)}</section>` : ''}
        <section class="epa-panel">${renderBoardSubmissions(ce, d)}</section>`;
}

const BOARD_PAGE_SIZE = 10;

function paginateSlice(items, page, pageSize = BOARD_PAGE_SIZE) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const start = safePage * pageSize;
    return { items: items.slice(start, start + pageSize), page: safePage, totalPages, total };
}

function renderPager(page, totalPages, total, prevAction, nextAction) {
    if (total <= BOARD_PAGE_SIZE) return '';
    return `<div class="epa-pager">
        <button type="button" class="epa-btn" data-action="${prevAction}" ${page <= 0 ? 'disabled' : ''}>הקודם</button>
        <span class="epa-pager-info">דף ${page + 1} מתוך ${totalPages} (${total} רשומות)</span>
        <button type="button" class="epa-btn" data-action="${nextAction}" ${page >= totalPages - 1 ? 'disabled' : ''}>הבא</button>
    </div>`;
}

/** Every request and assignment for the month — collapsed by default, paginated. */
function renderBoardSubmissions(ce, d) {
    const statusLabel = { SUBMITTED: 'הוגש', STANDBY: 'בהמתנה', SCHEDULED: 'משובץ' };
    const statusBadge = { SUBMITTED: 'kind', STANDBY: 'kind', SCHEDULED: 'ok' };
    const empFilter = ce._boardSubsEmpFilter || '';
    const open = !!ce._boardSubsOpen;
    let subs = (d.submissions || [])
        .filter(s => s.status !== 'REJECTED')
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || (a.employeeName || '').localeCompare(b.employeeName || ''));
    if (empFilter) subs = subs.filter(s => s.employeeId === empFilter);

    const assigned = subs.filter(s => s.status === 'SCHEDULED').length;
    const waiting = subs.length - assigned;
    const { items, page, totalPages, total } = paginateSlice(subs, ce._boardSubsPage || 0);

    const employees = (d.employees || []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
    const empOptions = `<option value="">כל העובדים</option>` + employees.map(e =>
        `<option value="${esc(e.id)}" ${empFilter === e.id ? 'selected' : ''}>${esc(e.displayName)}</option>`).join('');

    const rows = items.map(s => {
        const employee = (d.employees || []).find(e => e.id === s.employeeId);
        return `<tr class="epa-row-click" data-action="admin-select-day" data-date="${esc(s.date)}">
            <td>${fmtDate(s.date)}</td>
            <td><span class="epa-dot-lg" style="background:${esc(employee?.color || '#2563eb')}"></span>${esc(s.employeeName)}</td>
            <td>${esc(s.startTime)}–${esc(s.endTime)}</td>
            <td>${s.workshopName ? esc(s.workshopName) : '—'}</td>
            <td><span class="epa-badge ${statusBadge[s.status] || 'kind'}">${statusLabel[s.status] || esc(s.status)}${s.managerOverride ? ' · ידני' : ''}</span></td>
        </tr>`;
    }).join('');

    return `<div class="epa-board-acc">
        <button type="button" class="epa-accordion-toggle" data-action="admin-toggle-board-subs">
            <span>כל ההגשות והשיבוצים — ${monthTitle(d.monthKey)} (${(d.submissions || []).filter(s => s.status !== 'REJECTED').length})</span>
            <span class="epa-accordion-arrow">${open ? '▲' : '▼'}</span>
        </button>
        ${open ? `<div class="epa-accordion-body">
            <div style="font-size:12px;color:#6b7280;margin-bottom:8px">שובצו ${assigned} · ממתינים ${waiting} — לחיצה על שורה פותחת את פרטי היום בלוח</div>
            <div class="epa-filter-row">
                <div><label>עובד/ת</label><select data-action="admin-board-subs-emp-filter">${empOptions}</select></div>
            </div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>תאריך</th><th>עובד/ת</th><th>שעות</th><th>סדנה</th><th>סטטוס</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" class="ep-empty">אין הגשות התואמות את הסינון</td></tr>'}</tbody>
            </table></div>
            ${renderPager(page, totalPages, total, 'admin-board-subs-prev', 'admin-board-subs-next')}
        </div>` : ''}
    </div>`;
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
            ${d.permissions.manageScheduling ? `<button class="epa-btn primary" data-action="admin-open-auto-assign">✨ שיבוץ אוטומטי לעובדים נבחרים</button>` : ''}
        </div>`;
}

function submissionsByDate(d) {
    // REJECTED rows are only relevant on the tracker page, not the board views.
    const map = {};
    for (const s of (d.submissions || [])) {
        if (s.status === 'REJECTED') continue;
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

function getHolidayEntry(d, dateKey) {
    return (d.settings?.holidays || []).find(h => h.date === dateKey) || null;
}

function getDayNote(d, dateKey) {
    return (d.settings?.dayNotes || {})[dateKey] || null;
}

function getSketchDuty(d, dateKey) {
    return (d.settings?.sketchSewingDays || {})[dateKey] || null;
}

/** Short marker shown on calendar cells/list rows for a holiday's mode. */
function holidayModeMarker(entry) {
    if (!entry) return '';
    if (entry.mode === 'CLOSED') return ' 🚫 סגור';
    if (entry.mode === 'SHORT') return ` ⏱ מקוצר${entry.shortStart ? ` ${entry.shortStart}-${entry.shortEnd}` : ''}`;
    return '';
}

function fmtTimeHe(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "+" icon — hover (desktop) / tap (mobile) lists every workshop's start–end time for that day. */
function renderDayWorkshopsPlus(info) {
    const types = info?.types || [];
    const lines = types.flatMap(t => (t.timeRanges || []).map(r => {
        const start = fmtTimeHe(r.start);
        const end = fmtTimeHe(r.end);
        return `${t.name} — ${end ? `${start}–${end}` : start}`;
    }));
    if (!lines.length) return '';
    return `<span class="epa-day-plus ep-tip-trigger" tabindex="0" data-tip="${esc(lines.join('\n'))}" aria-label="פרטי סדנאות היום">+</span>`;
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
        const holidayEntry = getHolidayEntry(d, dateKey);
        const note = getDayNote(d, dateKey);
        const cls = ['epa-day', blocked || holidayEntry?.mode === 'CLOSED' ? 'blocked' : coverageClass(info), ce._adminSelectedDay === dateKey ? 'sel' : ''].join(' ');
        const flags = `${promoted ? '⭐' : ''}${blocked ? '🚫' : ''}${note ? ' ✉' : ''}`;
        // One line per workshop type so every workshop on the day is visible.
        const summary = info?.hasWorkshops
            ? (info.types || []).map(t => `<span class="cnt">${esc(t.name)} ${Math.min(t.filled, t.required)}/${t.required}</span>`).join('')
            : (subs.length ? `<span class="cnt">${subs.length} הגשות</span>` : '');
        cells += `<div class="${cls}" data-action="admin-select-day" data-date="${dateKey}" ${note ? `title="${esc(note.message)}"` : ''}>
            ${flags ? `<span class="epa-flag">${flags}</span>` : ''}
            ${renderDayWorkshopsPlus(info)}
            <span class="num">${day}</span>
            ${holidays[dateKey] ? `<span class="hol">${esc(holidays[dateKey])}${holidayModeMarker(holidayEntry)}</span>` : ''}
            ${summary}
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
        const holidayEntry = getHolidayEntry(d, dateKey);
        const note = getDayNote(d, dateKey);
        const holiday = holidays[dateKey] ? ` · 🕎 ${esc(holidays[dateKey])}${holidayModeMarker(holidayEntry)}` : '';
        const noteFlag = note ? ` · ✉` : '';

        if (!info?.hasWorkshops) {
            rows.push(`<div class="epa-list-day no-ws" data-action="admin-select-day" data-date="${dateKey}">
                <div class="epa-list-head"><span>${fmtDate(dateKey)}${holiday}${noteFlag}</span><span>אין סדנאות${subs.length ? ` · ${subs.length} הגשות` : ''}</span></div>
            </div>`);
            continue;
        }
        const typeRows = (info.types || []).map(t => {
            const assigned = subs.filter(s => t.assignedEmployeeIds.includes(s.employeeId)).map(s => esc(s.employeeName));
            const submitted = subs.filter(s => !t.assignedEmployeeIds.includes(s.employeeId) && s.status !== 'STANDBY').map(s => esc(s.employeeName));
            const times = (t.timeRanges || []).map(r => r.end ? `${fmtTimeHe(r.start)}–${fmtTimeHe(r.end)}` : fmtTimeHe(r.start)).filter(Boolean).join(', ');
            return `<div style="margin-top:5px">
                <b>${esc(t.name)}</b> — נדרשים ${t.required}, שובצו ${Math.min(t.filled, t.required)}${t.standbyCount ? `, בהמתנה ${t.standbyCount}` : ''}${times ? ` <span style="color:#6b7280">(${esc(times)})</span>` : ''}
                <div class="epa-chips">
                    ${assigned.map(n => `<span class="epa-chip assigned">${n}</span>`).join('')}
                    ${submitted.map(n => `<span class="epa-chip">${n}</span>`).join('')}
                </div>
            </div>`;
        }).join('');
        rows.push(`<div class="epa-list-day" data-action="admin-select-day" data-date="${dateKey}">
            <div class="epa-list-head"><span>${fmtDate(dateKey)}${holiday}${noteFlag}</span></div>
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

    const assignSection = d.permissions.manageScheduling
        ? renderManualAssignSection(d, dateKey, info, activeEmployees) : '';

    const canSeeGlobalScope = d.permissions.manageRules || d.permissions.manageScheduling;
    const globalOpen = !!ce._adminDayGlobalOpen;
    const globalSection = canSeeGlobalScope ? `
        <div class="epa-panel epa-scope-global" style="margin-top:12px">
            <button type="button" class="epa-accordion-toggle" data-action="admin-toggle-day-global">
                <span>⚙️ הגדרות ליום זה <span class="epa-scope-tag all">משפיע על כל העובדים</span></span>
                <span class="epa-accordion-arrow">${globalOpen ? '▲' : '▼'}</span>
            </button>
            ${globalOpen ? `<div class="epa-accordion-body">${renderDayGlobalSection(ce, d, dateKey, blocked, promoted, info)}</div>` : ''}
        </div>` : '';

    return `<div class="epa-detail">
        <h3>${fmtDate(dateKey)} <button class="epa-btn" data-action="admin-close-day" style="float:left">סגירה</button></h3>
        ${typeBlocks}
        ${assignSection}
        ${globalSection}
    </div>`;
}

/** Employee-specific actions for a day: manual assignment (any # of workshops incl. zero) + a shortcut to a personal note. */
function renderManualAssignSection(d, dateKey, info, activeEmployees) {
    const empOptions = activeEmployees.map(e => `<option value="${e.id}">${esc(e.displayName)}</option>`).join('');
    const workshopChecks = (info?.types || []).map(t =>
        `<label class="epa-assign-ws"><input type="checkbox" class="epaAssignWs" value="${esc(t.typeId)}"> ${esc(t.name)}</label>`).join('');
    const noWorkshopsHint = !info?.hasWorkshops
        ? '<div class="ep-empty" style="margin:6px 0 0">אין סדנאות מתוזמנות ביום זה — אפשר עדיין לשבץ עובד/ת (לדוגמה לפתיחה/קיפול) ולבחור סוג עבודה.</div>'
        : '';
    return `<div class="epa-panel epa-scope-personal" style="margin-top:12px">
        <div class="epa-panel-title"><h3>👤 שיבוץ עובד/ת ליום זה <span class="epa-scope-tag one">משפיע רק על העובד/ת שנבחר/ה</span></h3></div>
        <div class="epa-form">
            <div><label>עובד/ת</label><select id="epaAssignEmp">${empOptions}</select></div>
            <div><label>סוג עבודה (מתלה)</label><select id="epaAssignWorkType">${workTypeOptions()}</select></div>
        </div>
        ${workshopChecks ? `<div style="margin-top:8px"><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">סדנאות ביום זה (ניתן לבחור כמה)</label>${workshopChecks}</div>` : ''}
        ${noWorkshopsHint}
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-manual-assign" data-date="${dateKey}">שיבוץ</button>
            <button class="epa-btn" data-action="admin-quick-note" data-date="${dateKey}">✉ הערה אישית לעובד/ת שנבחר/ה</button>
        </div>
    </div>`;
}

/** Day-wide settings that affect every employee: blocking/promotion, holiday mode, and the shared day note. */
function renderDayGlobalSection(ce, d, dateKey, blocked, promoted, info) {
    const flags = d.permissions.manageRules ? `
        <div class="epa-field-block">
            <b>הגשות ליום זה</b>
            <div class="epa-inline" style="margin-top:0">
                <button class="epa-btn ${blocked ? 'danger' : ''}" data-action="admin-toggle-block" data-date="${dateKey}" data-on="${blocked ? '0' : '1'}">${blocked ? 'ביטול חסימת היום' : 'חסימת היום להגשות'}</button>
                <button class="epa-btn ${promoted ? 'active' : ''}" data-action="admin-toggle-promote" data-date="${dateKey}" data-on="${promoted ? '0' : '1'}">${promoted ? 'ביטול קידום היום' : 'קידום היום (דרושים ⭐)'}</button>
            </div>
        </div>` : '';

    const holidayEntry = getHolidayEntry(d, dateKey);
    const mode = holidayEntry?.mode || '';
    const holidaySection = d.permissions.manageRules ? `
        <div class="epa-field-block">
            <b>מועד/חג ${holidayEntry?.name ? `— ${esc(holidayEntry.name)}` : ''}</b>
            <div class="epa-inline" style="margin-top:0">
                <select id="epaHolMode" data-action="admin-holiday-mode-change">
                    <option value="" ${mode === '' ? 'selected' : ''}>רגיל</option>
                    <option value="CLOSED" ${mode === 'CLOSED' ? 'selected' : ''}>עסק סגור</option>
                    <option value="SHORT" ${mode === 'SHORT' ? 'selected' : ''}>יום מקוצר</option>
                </select>
                <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="epaHolStart" value="${esc(holidayEntry?.shortStart || '')}" placeholder="שעת פתיחה HH:MM" ${mode === 'SHORT' ? '' : 'disabled'}>
                <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="epaHolEnd" value="${esc(holidayEntry?.shortEnd || '')}" placeholder="שעת סגירה HH:MM" ${mode === 'SHORT' ? '' : 'disabled'}>
                <button class="epa-btn primary" data-action="admin-save-holiday-mode" data-date="${dateKey}">שמירה</button>
            </div>
        </div>` : '';

    const note = getDayNote(d, dateKey);
    const noteSection = d.permissions.manageScheduling ? `
        <div class="epa-field-block">
            <b>הודעה ליום ✉ (מוצגת לכל העובדים בלוח שלהם)</b>
            <textarea id="epaDayNote" rows="2" placeholder="הודעה שתוצג לעובדים על יום זה…">${esc(note?.message || '')}</textarea>
            <div class="epa-inline">
                <button class="epa-btn primary" data-action="admin-save-day-note" data-date="${dateKey}">שמירת הודעה</button>
                ${note ? `<button class="epa-btn danger" data-action="admin-clear-day-note" data-date="${dateKey}">מחיקת הודעה</button>` : ''}
            </div>
        </div>` : '';

    const sketchDutySection = d.permissions.manageRules ? renderSketchDutySection(ce, d, dateKey, info) : '';

    return `${flags}${holidaySection}${noteSection}${sketchDutySection}`;
}

/**
 * "תפירת סקיצות" duty window for a day — visible only to employees with the
 * sketchSewingSkill flag. If a tufting workshop appears on the board for
 * this date, saving requires an extra explicit confirm click.
 */
function renderSketchDutySection(ce, d, dateKey, info) {
    const duty = getSketchDuty(d, dateKey);
    const hasTufting = !!info?.hasTufting;
    const pending = ce._pendingSketchDutyConfirm?.dateKey === dateKey ? ce._pendingSketchDutyConfirm : null;
    const startVal = esc(pending?.startTime || duty?.startTime || '');
    const endVal = esc(pending?.endTime || duty?.endTime || '');

    const warning = hasTufting
        ? `<div class="epa-warning">⚠️ קיימת סדנת טאפטינג ביום זה בלוח — נא לוודא שאין התנגשות עם שעות התפירה.</div>`
        : '';

    const confirmButton = pending
        ? `<button class="epa-btn danger" data-action="admin-confirm-sketch-duty" data-date="${dateKey}">אישור ושמירה למרות ההתנגשות</button>`
        : '';

    return `<div class="epa-field-block">
        <b>🧵 תפירת סקיצות (סקאלה — מוצג רק לעובדים עם ההרשאה)</b>
        ${warning}
        <div class="epa-inline" style="margin-top:0">
            <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="epaSketchStart" value="${startVal}" placeholder="שעת התחלה HH:MM">
            <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="epaSketchEnd" value="${endVal}" placeholder="שעת סיום HH:MM">
            <button class="epa-btn primary" data-action="admin-save-sketch-duty" data-date="${dateKey}">שמירה</button>
            ${duty ? `<button class="epa-btn danger" data-action="admin-delete-sketch-duty" data-date="${dateKey}">מחיקה</button>` : ''}
            ${confirmButton}
        </div>
    </div>`;
}

function renderOpenOffers(ce, d) {
    const open = !!ce._openOffersOpen;
    const wsFilter = ce._openOffersWsFilter || '';
    const allOffers = d.openOffers || [];
    let offers = allOffers.slice();
    if (wsFilter) offers = offers.filter(o => o.workshopTypeId === wsFilter);
    const { items, page, totalPages, total } = paginateSlice(offers, ce._openOffersPage || 0);

    const typeOptions = [...new Map(allOffers.filter(o => o.workshopTypeId).map(o => [o.workshopTypeId, o.workshopName])).entries()]
        .sort((a, b) => (a[1] || '').localeCompare(b[1] || '', 'he'));
    const filterHtml = typeOptions.length > 1 ? `
        <div class="epa-filter-row">
            <div><label>סוג סדנה</label>
                <select data-action="admin-open-offers-ws-filter">
                    <option value="">כל הסדנאות</option>
                    ${typeOptions.map(([id, name]) => `<option value="${esc(id)}" ${wsFilter === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}
                </select>
            </div>
        </div>` : '';

    const rows = items.map(o => `
        <tr>
            <td><span class="epa-badge kind">${o.kind === 'OPEN_CALL' ? 'קריאה פתוחה' : 'הצעה ברשימת המתנה'}</span></td>
            <td>${fmtDate(o.date)}</td>
            <td>${esc(o.workshopName)}</td>
            <td>${o.employeeName ? esc(o.employeeName) : '—'}</td>
        </tr>`).join('');

    return `<div class="epa-board-acc">
        <button type="button" class="epa-accordion-toggle" data-action="admin-toggle-open-offers">
            <span>הצעות וקריאות פתוחות (${allOffers.length})</span>
            <span class="epa-accordion-arrow">${open ? '▲' : '▼'}</span>
        </button>
        ${open ? `<div class="epa-accordion-body">
            ${filterHtml}
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>סוג</th><th>תאריך</th><th>סדנה</th><th>עובד/ת</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" class="ep-empty">אין רשומות התואמות את הסינון</td></tr>'}</tbody>
            </table></div>
            ${renderPager(page, totalPages, total, 'admin-open-offers-prev', 'admin-open-offers-next')}
        </div>` : ''}
    </div>`;
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
        const unmetWeeks = (t.weeks || []).filter(w => !w.met);
        const weeksNote = unmetWeeks.length
            ? `<div style="font-size:10.5px;color:#991b1b;margin-top:2px">שבועות חסרים: ${unmetWeeks.map(w => `${fmtDate(w.weekStart)}–${fmtDate(w.weekEnd)}`).join(', ')}</div>`
            : '';
        const weekend = t.weekend || {};
        const weekendBadge = weekend.met
            ? `<span class="epa-badge ok">שישי ${weekend.fridays?.submitted ?? 0}/${weekend.fridays?.required ?? 0} · שבת ${weekend.saturdays?.submitted ?? 0}/${weekend.saturdays?.required ?? 0}</span>`
            : `<span class="epa-badge miss">שישי ${weekend.fridays?.submitted ?? 0}/${weekend.fridays?.required ?? 0} · שבת ${weekend.saturdays?.submitted ?? 0}/${weekend.saturdays?.required ?? 0}</span>`;
        return `<tr>
            <td><span class="epa-dot-lg" style="background:${esc(employee?.color || '#2563eb')}"></span>${esc(t.name)}</td>
            <td>${t.submitted}/${t.required}${weeksNote}</td>
            <td><span class="epa-badge ${t.met ? 'ok' : 'miss'}">${t.met ? 'הושלם' : 'חסר'}</span></td>
            <td>${weekendBadge}</td>
            <td>${(!t.met || !weekend.met) && d.permissions.manageScheduling ? `<button class="epa-btn" data-action="admin-nudge" data-emp="${t.employeeId}">שליחת תזכורת</button>` : ''}</td>
        </tr>`;
    }).join('');
    const statusLabel = { SUBMITTED: 'הוגש', STANDBY: 'בהמתנה', SCHEDULED: 'משובץ', REJECTED: 'נדחה' };
    const statusBadge = { SUBMITTED: 'kind', STANDBY: 'kind', SCHEDULED: 'ok', REJECTED: 'miss' };
    const allSubs = (d.submissions || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    // Status filter chips (with per-status counts).
    const statusFilter = ce._trackerStatusFilter || 'ALL';
    const countByStatus = {};
    for (const s of allSubs) countByStatus[s.status] = (countByStatus[s.status] || 0) + 1;
    const filterChips = [
        { key: 'ALL', label: `הכל (${allSubs.length})` },
        ...['SUBMITTED', 'STANDBY', 'SCHEDULED', 'REJECTED'].map(k => ({
            key: k, label: `${statusLabel[k]} (${countByStatus[k] || 0})`,
        })),
    ].map(f => `<button class="epa-btn ${statusFilter === f.key ? 'active' : ''}" data-action="admin-tracker-status" data-status="${f.key}">${f.label}</button>`).join('');

    const filtered = statusFilter === 'ALL' ? allSubs : allSubs.filter(s => s.status === statusFilter);
    const canSchedule = d.permissions.manageScheduling;
    const colCount = canSchedule ? 7 : 6;
    const submissionRows = filtered.map(s => {
        const employee = (d.employees || []).find(e => e.id === s.employeeId);
        return `<tr>
            <td><span class="epa-dot-lg" style="background:${esc(employee?.color || '#2563eb')}"></span>${esc(s.employeeName)}</td>
            <td>${fmtDate(s.date)}</td>
            <td>${esc(s.startTime)}–${esc(s.endTime)}</td>
            <td>${renderWorkshopCell(ce, d, s, canSchedule)}</td>
            <td>${renderWorkTypeCell(ce, d, s, canSchedule)}</td>
            <td><span class="epa-badge ${statusBadge[s.status] || 'kind'}">${statusLabel[s.status] || esc(s.status)}</span></td>
            ${canSchedule ? `<td>${renderSubmissionActions(ce, d, s)}</td>` : ''}
        </tr>`;
    }).join('');

    // Month dropdown: 6 months back through 6 months ahead (always includes the loaded month).
    const monthKeys = [];
    const [cy, cm] = d.monthKey.split('-').map(Number);
    for (let delta = -6; delta <= 6; delta++) {
        const t = cy * 12 + (cm - 1) + delta;
        monthKeys.push(`${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`);
    }
    const monthSelect = `<select id="epaTrackerMonth">${monthKeys.map(mk =>
        `<option value="${mk}" ${mk === d.monthKey ? 'selected' : ''}>${monthTitle(mk)}</option>`).join('')}</select>`;

    const complete = (d.tracker || []).filter(t => t.met).length;
    return `<div class="epa-page-head"><div><h2>מעקב הגשות</h2><p>כל ההגשות והמכסות לפי חודש</p></div>${renderMonthControls(d)}</div>
        <div class="epa-stat-grid">
            <div class="epa-stat"><b>${allSubs.length}</b><span>הגשות בחודש</span></div>
            <div class="epa-stat"><b>${complete}/${(d.tracker || []).length}</b><span>עובדים שהשלימו מכסה</span></div>
        </div>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>מצב מכסות שבועיות ושישי/שבת</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>עובד/ת</th><th>הוגשו (שבועי)</th><th>סטטוס</th><th>שישי/שבת בחודש</th><th></th></tr></thead><tbody>${trackerRows}</tbody></table></div>
        </section>
        <section class="epa-panel">
            <div class="epa-panel-title">
                <h3>כל ההגשות — ${monthTitle(d.monthKey)}</h3>
                <div class="epa-inline" style="margin:0">${monthSelect}</div>
            </div>
            <div class="epa-inline" style="margin-bottom:8px">${filterChips}</div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>עובד/ת</th><th>תאריך</th><th>שעות</th><th>סדנה</th><th>סוג עבודה</th><th>סטטוס</th>${canSchedule ? '<th>פעולות</th>' : ''}</tr></thead>
                <tbody>${submissionRows || `<tr><td colspan="${colCount}" class="ep-empty">אין הגשות תואמות בחודש זה</td></tr>`}</tbody>
            </table></div>
        </section>`;
}

function isBookingsLinked(employee, staffIds) {
    if (typeof employee?.bookingsLinked === 'boolean') return employee.bookingsLinked;
    const connectedId = String(employee?.connectedStaffId || employee?.staffId || '').trim().toLowerCase();
    if (!connectedId || !staffIds?.size) return false;
    for (const id of staffIds) {
        if (String(id).trim().toLowerCase() === connectedId) return true;
    }
    return false;
}

/** Loose phone validity check — requires 9–15 digits once formatting is stripped. */
function isValidEmployeePhone(phone) {
    if (!phone) return false;
    const digits = String(phone).replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
}

function renderSetupStaffForm(ce, d, roleId) {
    const employee = findEmployee(ce, d, roleId);
    if (!employee) return '<div class="ep-empty">לא נמצא/ה עובד/ת.</div>';
    const unlinked = asArray(ce._staffData).filter(s => !s.linked);
    const rows = unlinked.map(s => `
        <button type="button" class="epa-pick-row" data-action="admin-link-staff-to-employee" data-staff="${esc(s.staffId)}" data-emp="${esc(roleId)}">
            <span>${esc(s.name || s.email || s.staffId)}</span>
            <span style="color:#9ca3af">${esc(s.email || s.phone || '')}</span>
        </button>`).join('');
    return `<p style="margin:0 0 10px">בחרו עובד/ת מ-Wix Bookings לחיבור לפרופיל <b>${esc(employee.displayName)}</b>:</p>
        <div style="max-height:42vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;padding:2px 10px;margin-bottom:10px">
            ${rows || '<div class="ep-empty">אין עובדי Bookings פנויים לחיבור. צרו עובד/ת חדש/ה ב-Bookings.</div>'}
        </div>
        <div class="epa-inline">
            <button type="button" class="epa-btn primary" data-action="admin-new-staff">צור עובד חדש ב-Bookings +</button>
            <button type="button" class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

function renderEmployeesPage(ce, d) {
    const canManage = d.permissions.manageEmployees;
    const sortMode = !!ce._empSortMode && canManage;
    const saveOrderBtn = sortMode
        ? `<button type="button" class="epa-btn primary" data-action="admin-emp-save-order" ${ce._empOrderDirty ? '' : 'disabled'}>שמירת סדר</button>`
        : '';
    const headActions = canManage ? `<div class="epa-inline" style="margin:0">
            ${saveOrderBtn}
            <button type="button" class="epa-btn" data-action="admin-toggle-emp-sort">${sortMode ? 'ביטול סידור' : 'סידור רשימה'}</button>
            <button type="button" class="epa-btn" data-action="admin-staff-refresh">רענון Bookings</button>
            <button type="button" class="epa-btn primary" data-action="admin-new-staff">צור עובד חדש +</button>
        </div>` : '';
    const pageHead = `<div class="epa-page-head"><div><h2>עובדים</h2><p>${sortMode ? 'גררו שורות או השתמשו בחצים לשינוי הסדר, ואז לחצו "שמירת סדר" לשמירה' : 'פרופילים, הרשאות עבודה והכשרות'}</p></div>${headActions}</div>`;

    if (canManage && ce._staffData === null) {
        return `${pageHead}<section class="epa-panel"><div class="ep-loading"><div class="ep-spinner"></div>טוען עובדים…</div></section>`;
    }

    const staffIds = ce._staffIds;
    const employees = sortModeEmployees(ce, d);
    const workshopTypes = asArray(d.workshopTypes);
    const phoneErrors = [];
    const rows = employees.map((e, index) => {
        const bookingsLinked = isBookingsLinked(e, staffIds);
        const skillIds = asArray(e.skillIds);
        const bookingsCell = !canManage
            ? '—'
            : bookingsLinked
                ? '<span class="epa-badge ok">מוקם ב-Bookings</span>'
                : `<button type="button" class="epa-btn epa-btn-sm primary" data-action="admin-setup-staff" data-emp="${esc(e.id)}">קישור עובד</button>`;
        const phoneValid = isValidEmployeePhone(e.phone);
        if (!phoneValid) phoneErrors.push({ name: e.displayName, phone: e.phone });
        const phoneCell = e.phone
            ? `<span ${phoneValid ? '' : 'style="color:#b91c1c"'}>${esc(e.phone)}</span>`
            : '<span style="color:#b91c1c">—</span>';
        const sortCell = sortMode ? `
            <td class="epa-sort-cell">
                <span class="epa-sort-handle" draggable="true" data-action="admin-emp-drag" data-emp="${esc(e.id)}" title="גרירה לשינוי סדר">☰</span>
                <span class="epa-sort-actions">
                    <button type="button" data-action="admin-emp-move" data-dir="up" data-emp="${esc(e.id)}" ${index === 0 ? 'disabled' : ''} title="הזזה למעלה">▲</button>
                    <button type="button" data-action="admin-emp-move" data-dir="down" data-emp="${esc(e.id)}" ${index === employees.length - 1 ? 'disabled' : ''} title="הזזה למטה">▼</button>
                </span>
            </td>` : '';
        const rowClass = sortMode ? 'epa-emp-sort-row' : (canManage ? 'epa-row-click' : '');
        const rowAction = sortMode ? '' : (canManage ? `data-action="admin-edit-employee" data-emp="${e.id}"` : '');
        return `
        <tr class="${rowClass}" style="${e.active ? '' : 'opacity:.55'}" data-emp-row="${esc(e.id)}" ${rowAction}>
            ${sortCell}
            <td><span class="epa-dot-lg" style="background:${esc(e.color || '#2563eb')}"></span>${esc(e.displayName)}${e.isTrainee ? ' <span class="ep-tag">חניכה</span>' : ''}</td>
            <td>${esc(e.roleLabel)}</td>
            <td>${index + 1}</td>
            <td>${phoneCell}</td>
            <td>${e.minShiftsPerWeek ?? 'ברירת מחדל'}</td>
            <td>${skillIds.map(id => esc((workshopTypes.find(w => w.id === id) || {}).name || '')).filter(Boolean).join(', ') || '—'}</td>
            <td>${bookingsCell}</td>
            <td><span class="epa-badge ${e.active ? 'ok' : 'miss'}">${e.active ? 'פעיל/ה' : 'לא פעיל/ה'}</span></td>
        </tr>`;
    }).join('');
    const sortHeader = sortMode ? '<th style="width:72px">סדר</th>' : '';
    const colCount = (sortMode ? 1 : 0) + 8;
    const errorList = phoneErrors.length ? `
        <div class="epa-error-list">
            ${phoneErrors.map(e => `<div class="epa-error-item">⚠️ ${esc(e.name)} — מספר טלפון ${e.phone ? 'לא תקין' : 'חסר'}${e.phone ? `: ${esc(e.phone)}` : ''}</div>`).join('')}
        </div>` : '';
    return `${pageHead}
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>כל העובדים (${employees.length})</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr>${sortHeader}<th>שם</th><th>תפקיד</th><th>#</th><th>טלפון</th><th>מכסה</th><th>הכשרות</th><th>Bookings</th><th>מצב</th></tr></thead><tbody>${rows || `<tr><td colspan="${colCount}" class="ep-empty">אין עובדים</td></tr>`}</tbody></table></div>
            ${errorList}
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

function renderEmpAccordion(ce, accId, title, bodyHtml) {
    const open = !!(ce._empFormAcc && ce._empFormAcc[accId]);
    return `<div class="epa-emp-acc epa-scope-personal" style="margin-top:10px;border-radius:10px;overflow:hidden">
        <button type="button" class="epa-accordion-toggle" data-action="admin-toggle-emp-acc" data-acc="${esc(accId)}">
            <span>${title}</span>
            <span class="epa-accordion-arrow">${open ? '▲' : '▼'}</span>
        </button>
        ${open ? `<div class="epa-accordion-body">${bodyHtml}</div>` : ''}
    </div>`;
}

function renderPermissionGroups(ce, d, permissions) {
    return (d.permissionGroups || []).map(g => {
        const accId = `perm-${g.id}`;
        const enabled = g.keys.filter(k => permissions?.[k]).length;
        const body = `<div class="epa-skills" style="margin-top:4px">
            ${g.keys.map(k => `<label><input type="checkbox" class="epaPerm" data-perm="${k}" ${permissions?.[k] ? 'checked' : ''}> ${esc(d.permissionLabels?.[k] || k)}</label>`).join('')}
        </div>`;
        return renderEmpAccordion(ce, accId, `${esc(g.label)} <span style="font-weight:400;font-size:11px;color:#64748b">(${enabled}/${g.keys.length})</span>`, body);
    }).join('');
}

function renderEmployeeForm(ce, e, d) {
    if (!e) return '';
    const workshopTypes = d.workshopTypes || [];
    const skillBoxes = workshopTypes.map(w => `
        <label><input type="checkbox" class="epa-skill" value="${w.id}" ${(e.skillIds || []).includes(w.id) ? 'checked' : ''}> ${esc(w.name)}</label>`).join('');
    const skillCount = (e.skillIds || []).length;
    const skillsSection = renderEmpAccordion(
        ce,
        'skills',
        `הכשרות <span style="font-weight:400;font-size:11px;color:#64748b">(${skillCount}/${workshopTypes.length})</span>`,
        `<div class="epa-skills">${skillBoxes || '<div class="ep-empty">אין סוגי סדנאות מוגדרים</div>'}</div>`
    );
    const rates = d.permissions.manageRates ? `
        <div><label>תעריף סטודיו</label><input id="epaF_rateStudio" type="number" value="${e.rateStudio ?? ''}"></div>
        <div><label>תעריף הדרכה</label><input id="epaF_rateInstruction" type="number" value="${e.rateInstruction ?? ''}"></div>
        <div><label>תעריף צמר</label><input id="epaF_rateWool" type="number" value="${e.rateWool ?? ''}"></div>` : '';
    const permissionsSection = d.permissions.manageRoles ? `
        <div class="epa-section" style="margin-top:4px">
            <div class="epa-panel-title"><h3>הרשאות מפורטות</h3></div>
            ${renderPermissionGroups(ce, d, e.permissions)}
        </div>` : '';
    return `<div class="epa-form">
            <div><label>שם תצוגה</label><input id="epaF_displayName" value="${esc(e.displayName)}"></div>
            <div><label>תפקיד</label><select id="epaF_roleType">${(d.roleTypes || []).map(r => `<option value="${r.value}" ${e.roleType === r.value ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div><label>טלפון</label><input id="epaF_phone" value="${esc(e.phone)}"></div>
            <div><label>צבע</label><input id="epaF_color" type="color" value="${esc(e.color || '#2563eb')}"></div>
            <div><label>ותק</label><input id="epaF_seniority" value="${esc(e.seniority)}"></div>
            <div><label>דירוג עדיפות (נסתר)</label><input id="epaF_priorityRank" type="number" value="${e.priorityRank ?? ''}"></div>
            <div><label>מכסת משמרות שבועית (ריק = ברירת מחדל)</label><input id="epaF_minShiftsPerWeek" type="number" value="${e.minShiftsPerWeek ?? ''}"></div>
            <div><label>אורך משמרת מינימלי (שעות)</label><input id="epaF_minShiftHours" type="number" value="${e.minShiftHours ?? ''}"></div>
            <div title="מספר ימי שישי שהעובד/ת חייב/ת להגיש בחודש — ריק = לפי ברירת המחדל הכללית"><label>ימי שישי נדרשים בחודש (ריק = ברירת מחדל)</label><input id="epaF_reqFridays" type="number" min="0" value="${e.requiredFridaysPerMonth ?? ''}"></div>
            <div title="מספר ימי שבת שהעובד/ת חייב/ת להגיש בחודש — ריק = לפי ברירת המחדל הכללית"><label>ימי שבת נדרשים בחודש (ריק = ברירת מחדל)</label><input id="epaF_reqSaturdays" type="number" min="0" value="${e.requiredSaturdaysPerMonth ?? ''}"></div>
            <div><label>חניכה</label><select id="epaF_isTrainee"><option value="0" ${!e.isTrainee ? 'selected' : ''}>לא</option><option value="1" ${e.isTrainee ? 'selected' : ''}>כן</option></select></div>
            <div class="epa-switch-field">
                <label>פעיל/ה</label>
                <div class="epa-switch-row">
                    <label class="epa-switch">
                        <input type="checkbox" id="epaF_active" data-action="admin-toggle-active" data-emp="${e.id}" ${e.active ? 'checked' : ''}>
                        <span class="epa-switch-slider"></span>
                    </label>
                    <span class="epa-switch-status ${e.active ? 'on' : 'off'}" data-role="active-status">${e.active ? 'פעיל/ה' : 'לא פעיל/ה'}</span>
                </div>
            </div>
            ${rates}
            ${skillsSection}
        </div>
        ${permissionsSection}
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-save-employee" data-emp="${e.id}">שמירה</button>
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

// ---------------------------------------------------------------------------
// Manual batch auto-assign wizard (pick employees → pick date range → summary)
// ---------------------------------------------------------------------------

const AUTO_ASSIGN_MAX_EMPLOYEES = 3;
const AUTO_ASSIGN_MAX_DAYS = 28;

function renderAutoAssignEmployeesStep(ce, d) {
    const selected = ce._autoAssignSelected || [];
    const activeEmployees = (d.employees || []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
    const rows = activeEmployees.filter(e => e.active).map(e => {
        const checked = selected.includes(e.id);
        const disable = !checked && selected.length >= AUTO_ASSIGN_MAX_EMPLOYEES;
        return `<label class="epa-pick-row">
            <span><input type="checkbox" class="epaAutoEmp" data-action="admin-auto-emp-toggle" value="${esc(e.id)}" ${checked ? 'checked' : ''} ${disable ? 'disabled' : ''}> ${esc(e.displayName)}</span>
            <span style="color:#9ca3af">${esc(e.roleLabel)}</span>
        </label>`;
    }).join('');
    return `<div class="ep-empty" style="text-align:right;margin-bottom:8px">בחרו עד ${AUTO_ASSIGN_MAX_EMPLOYEES} עובדים לשיבוץ אוטומטי במכה (${selected.length}/${AUTO_ASSIGN_MAX_EMPLOYEES} נבחרו).</div>
        <div style="max-height:48vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;padding:2px 10px">${rows || '<div class="ep-empty">אין עובדים פעילים</div>'}</div>
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-auto-assign-next" ${selected.length ? '' : 'disabled'}>המשך ›</button>
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

function renderAutoAssignRangeStep(ce, d) {
    const selected = ce._autoAssignSelected || [];
    const names = selected.map(id => (d.employees || []).find(e => e.id === id)?.displayName || '—').join(', ');
    if (!ce._autoAssignFrom || !ce._autoAssignTo) {
        const from = new Date(); from.setDate(from.getDate() + 1);
        const to = new Date(from); to.setDate(to.getDate() + 6);
        ce._autoAssignFrom = ce._autoAssignFrom || from.toISOString().slice(0, 10);
        ce._autoAssignTo = ce._autoAssignTo || to.toISOString().slice(0, 10);
    }
    return `<div class="ep-empty" style="text-align:right;margin-bottom:8px">עובדים שנבחרו: <b>${esc(names)}</b></div>
        <div class="epa-form">
            <div><label>מתאריך</label><input type="date" id="epaAutoFrom" value="${esc(ce._autoAssignFrom)}"></div>
            <div><label>עד תאריך (עד ${AUTO_ASSIGN_MAX_DAYS / 7} שבועות מהתאריך ההתחלה)</label><input type="date" id="epaAutoTo" value="${esc(ce._autoAssignTo)}"></div>
        </div>
        <div class="ep-empty" style="margin-top:6px">המערכת תשבץ את העובדים שנבחרו לפי הזמינות וההכשרות שלהם ותציג סיכום מפורט בסיום.</div>
        <div class="epa-inline">
            <button class="epa-btn" data-action="admin-auto-assign-back">‹ חזרה</button>
            <button class="epa-btn primary" data-action="admin-auto-assign-run">הרצת שיבוץ</button>
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

const AUTO_ASSIGN_STATUS_META = {
    ASSIGNED: { label: '✅ שובץ עכשיו', cls: 'ok' },
    ALREADY_ASSIGNED: { label: 'כבר היה משובץ/ת', cls: 'kind' },
    STANDBY: { label: 'ברשימת המתנה', cls: 'kind' },
    FULL: { label: 'אין מקום פנוי בסדנה', cls: 'miss' },
    NO_MATCHING_AVAILABILITY: { label: 'אין הגשת זמינות תואמת בטווח שנבחר', cls: 'miss' },
};

function renderAutoAssignSummaryStep(ce) {
    const report = ce._autoAssignReport || [];
    const openRows = ce._autoAssignOpenRows || new Set();
    const rows = report.map(emp => {
        const open = openRows.has(emp.employeeId);
        const assignedCount = (emp.shifts || []).filter(s => s.status === 'ASSIGNED').length;
        const shiftsHtml = (emp.shifts || []).map(s => {
            const meta = AUTO_ASSIGN_STATUS_META[s.status] || { label: s.status, cls: 'kind' };
            return `<div class="ep-aa-item">
                <span>${s.dateKey ? fmtDate(s.dateKey) : '—'}${s.workshopName ? ` · ${esc(s.workshopName)}` : ''}</span>
                <span class="epa-badge ${meta.cls}">${meta.label}</span>
            </div>`;
        }).join('');
        return `<div class="epa-panel epa-emp-acc" style="margin-bottom:8px;padding:0;overflow:hidden">
            <button type="button" class="epa-accordion-toggle" data-action="admin-auto-assign-toggle-row" data-emp="${esc(emp.employeeId)}">
                <span>${esc(emp.employeeName)} <span class="epa-badge ${assignedCount ? 'ok' : 'miss'}" style="margin-inline-start:8px">${assignedCount} משמרות שובצו</span></span>
                <span class="epa-accordion-arrow">${open ? '▲' : '▼'}</span>
            </button>
            ${open ? `<div class="epa-accordion-body">${shiftsHtml || '<div class="ep-empty">אין נתונים</div>'}</div>` : ''}
        </div>`;
    }).join('');
    return `${rows || '<div class="ep-empty">אין תוצאות להצגה</div>'}
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-close-modal">סגירה</button>
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

const SETTINGS_FIELD_LABELS = {
    epaS_deadline: 'ימים לפני סוף החודש לסגירת הגשות',
    epaS_monthsAhead: 'מספר חודשים קדימה',
    epaS_minShifts: 'מכסת משמרות שבועית',
    epaS_minHours: 'אורך משמרת מינימלי',
    epaS_start: 'שעת התחלה ברירת מחדל',
    epaS_end: 'שעת סיום ברירת מחדל',
    epaS_reqFri: 'ימי שישי נדרשים בחודש',
    epaS_reqSat: 'ימי שבת נדרשים בחודש',
};

function settingsField(ce, id, label, inputHtml, title) {
    const error = ce._settingsFieldErrors?.[id];
    return `<div class="epa-field${error ? ' has-error' : ''}" ${title ? `title="${esc(title)}"` : ''}>
        <label>${esc(label)}</label>
        ${inputHtml}
        <div class="epa-field-error">${esc(error || '')}</div>
    </div>`;
}

function renderSettingsPage(ce, d) {
    const s = d.settings || {};
    const holidaysOpen = !!ce._adminHolidaysOpen;
    const holidays = (s.holidays || []).map((h, index) => `<div class="epa-holiday-row" data-holiday-row>
        <input type="date" class="epaH_date" value="${esc(h.date)}" aria-label="תאריך חג">
        <input class="epaH_name" value="${esc(h.name)}" placeholder="שם החג" aria-label="שם החג">
        <button class="epa-btn danger" data-action="admin-remove-holiday" title="הסרה" data-index="${index}">×</button>
    </div>`).join('');
    const savingSettings = ce._settingsSaving;
    const savingHolidays = ce._holidaysSaving;
    return `<div class="epa-page-head"><div><h2>הגדרות</h2><p>כל הגדרות המערכת, הזמינות והשיבוץ</p></div></div>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>הגדרות זמינות כלליות</h3></div>
            <div class="epa-settings-grid">
                ${settingsField(ce, 'epaS_deadline', SETTINGS_FIELD_LABELS.epaS_deadline, `<input id="epaS_deadline" type="number" min="1" value="${s.deadlineDaysBeforeMonthEnd ?? 4}">`)}
                ${settingsField(ce, 'epaS_monthsAhead', SETTINGS_FIELD_LABELS.epaS_monthsAhead, `<input id="epaS_monthsAhead" type="number" min="1" value="${s.monthsAheadAllowed ?? 1}">`)}
                ${settingsField(ce, 'epaS_minShifts', SETTINGS_FIELD_LABELS.epaS_minShifts, `<input id="epaS_minShifts" type="number" min="1" value="${s.defaultMinShiftsPerWeek ?? 1}">`)}
                ${settingsField(ce, 'epaS_minHours', SETTINGS_FIELD_LABELS.epaS_minHours, `<input id="epaS_minHours" type="number" min="0.5" step="0.5" value="${s.defaultMinShiftHours ?? 4}">`)}
                ${settingsField(ce, 'epaS_start', SETTINGS_FIELD_LABELS.epaS_start, `<input id="epaS_start" class="epa-time-input" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="${esc(s.defaultShiftStart || '10:00')}">`)}
                ${settingsField(ce, 'epaS_end', SETTINGS_FIELD_LABELS.epaS_end, `<input id="epaS_end" class="epa-time-input" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="${esc(s.defaultShiftEnd || '16:00')}">`)}
                ${settingsField(ce, 'epaS_reqFri', SETTINGS_FIELD_LABELS.epaS_reqFri, `<input id="epaS_reqFri" type="number" min="0" value="${s.requiredFridaysPerMonth ?? 2}">`, 'מספר ימי שישי שיש להגיש לחודש (חופשה מאושרת על יום שישי מקטינה את הדרישה)')}
                ${settingsField(ce, 'epaS_reqSat', SETTINGS_FIELD_LABELS.epaS_reqSat, `<input id="epaS_reqSat" type="number" min="0" value="${s.requiredSaturdaysPerMonth ?? 2}">`, 'מספר ימי שבת שיש להגיש לחודש (חופשה מאושרת על יום שבת מקטינה את הדרישה)')}
                <label class="epa-toggle"><input id="epaS_bonus" type="checkbox" ${s.bonusUnlockEnabled !== false ? 'checked' : ''}> פתיחת משמרות נוספות לאחר השלמת מכסה השבועית</label>
                <label class="epa-toggle" title="כשמופעל: הגשה ביום עם הזמנות פעילות משבצת אוטומטית עובדים עם ההכשרה המתאימה. כשכבוי: כל ההגשות ממתינות לאישור ידני של מנהל/ת."><input id="epaS_autoApprove" type="checkbox" ${s.autoApproveShifts !== false ? 'checked' : ''}> אישור אוטומטי של משמרות</label>
            </div>
            <div class="epa-inline">
                <button class="epa-btn primary" data-action="admin-save-settings" ${savingSettings ? 'disabled' : ''}>${savingSettings ? '<span class="epa-save-spin"></span>שומר הגדרות…' : 'שמירת הגדרות'}</button>
                <span id="epaSettingsSavedMark" style="color:#16a34a;font-size:12px;font-weight:600;${ce._settingsSavedAt && !savingSettings ? '' : 'display:none'}">✓ נשמר בהצלחה</span>
            </div>
        </section>
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>כללי שיבוץ לפי סוג סדנה</h3></div>
            ${renderRules(d)}
        </section>
        <section class="epa-panel" style="padding:0;overflow:hidden">
            <button type="button" class="epa-accordion-toggle" data-action="admin-toggle-holidays">
                <span>חגים ומועדים ${(s.holidays || []).length ? `(${(s.holidays || []).length})` : ''}</span>
                <span class="epa-accordion-arrow">${holidaysOpen ? '▲' : '▼'}</span>
            </button>
            ${holidaysOpen ? `<div class="epa-accordion-body">
                <div class="epa-inline" style="margin:0 0 10px">
                    <button class="epa-btn" data-action="admin-sync-holidays">סנכרון חגים מ-Hebcal</button>
                    <button class="epa-btn" data-action="admin-add-holiday">הוספת מועד</button>
                </div>
                <div id="epaHolidayList">${holidays || '<div class="ep-empty" id="epaHolidayEmpty">לא הוגדרו מועדים</div>'}</div>
                <div class="epa-inline" style="margin-top:10px">
                    <button class="epa-btn primary" data-action="admin-save-holidays" ${savingHolidays ? 'disabled' : ''}>${savingHolidays ? '<span class="epa-save-spin"></span>שומר מועדים…' : 'שמירת מועדים'}</button>
                </div>
            </div>` : ''}
        </section>`;
}

function renderTemplatesPage(ce, _d) {
    if (!ce._templatesData) {
        return `<div class="epa-page-head"><div><h2>תבניות</h2><p>ניהול תבניות וואטסאפ</p></div></div>
            <section class="epa-panel"><div class="ep-loading"><div class="ep-spinner"></div>טוען תבניות…</div></section>`;
    }
    const all = asArray(ce._templatesData);
    const orders = all.filter(t => (t.use || TEMPLATE_USE.ORDERS) === TEMPLATE_USE.ORDERS);
    const employees = all.filter(t => (t.use || TEMPLATE_USE.EMPLOYEES) === TEMPLATE_USE.EMPLOYEES);

    const renderCards = (list) => list.map(t => `<article class="epa-template" data-action="admin-edit-template" data-template="${esc(t.id)}">
        <div class="epa-panel-title"><h3>${esc(t.title)}</h3>${t.isSystem ? '<span class="epa-badge kind">מערכת</span>' : ''}</div>
        ${t.actionKeyLabel ? `<p style="margin:2px 0 6px;font-size:11px;color:#64748b">פעולה: ${esc(t.actionKeyLabel)}</p>` : ''}
        <p>${esc(t.body)}</p>
    </article>`).join('');

    const section = (title, list, useKey) => `
        <section class="epa-panel" style="margin-bottom:12px">
            <div class="epa-panel-title">
                <h3>${title} (${list.length})</h3>
                <button type="button" class="epa-btn primary" data-action="admin-new-template" data-use="${useKey}">תבנית חדשה +</button>
            </div>
            <div class="epa-template-grid">${renderCards(list) || '<div class="ep-empty">אין תבניות בקטגוריה זו</div>'}</div>
        </section>`;

    return `<div class="epa-page-head"><div><h2>תבניות</h2><p>כל התבניות נשמרות ב-CMS — WhatsApp_Templates</p></div></div>
        ${section('תבניות מערכת ניהול הזמנות', orders, TEMPLATE_USE.ORDERS)}
        ${section('תבניות למערכת עובדים', employees, TEMPLATE_USE.EMPLOYEES)}`;
}

function renderTemplateForm(template, defaultUse) {
    const use = template?.use || defaultUse || TEMPLATE_USE.EMPLOYEES;
    const useOptions = Object.entries(TEMPLATE_USE_LABELS).map(([k, label]) =>
        `<option value="${k}" ${use === k ? 'selected' : ''}>${label}</option>`).join('');
    return `<div class="epa-field"><label>מערכת (שדה use ב-CMS)</label>
            <select id="epaT_use" ${template?.id && template?.isSystem ? 'disabled' : ''}>${useOptions}</select></div>
        ${template?.actionKeyLabel ? `<p style="margin:6px 0 0;font-size:12px;color:#334155">תבנית מערכת קבועה לפעולה: <strong>${esc(template.actionKeyLabel)}</strong> — לא ניתן למחוק, ניתן לערוך את התוכן.</p>` : ''}
        <div class="epa-field" style="margin-top:10px"><label>שם התבנית</label><input id="epaT_title" value="${esc(template?.title || '')}" maxlength="120"></div>
        <div class="epa-field" style="margin-top:10px"><label>תוכן ההודעה</label><textarea id="epaT_body">${esc(template?.body || '')}</textarea></div>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b">תבניות הזמנות: {{Name}}, {{Date}}, {{Time}}, {{OrderUrl}}. תבניות עובדים: השתמשו בשמות המשתנים כפי שמוצגים בכותרת התבנית (למשל {{displayName}}, {{date}}, {{portalLink}}).</p>
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

function renderMessageForm(ce, d, message, prefill) {
    const pre = prefill || {};
    const employees = (d.employees || []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
    const empOptions = employees.map(e => `<option value="${esc(e.id)}" ${(message?.employeeId || pre.employeeId) === e.id ? 'selected' : ''}>${esc(e.displayName)}</option>`).join('');
    const scope = message?.scope || pre.scope || 'ALL';
    return `<div class="epa-form">
            <div style="grid-column:1/-1"><label>כותרת</label><input id="epaM_title" value="${esc(message?.title || pre.title || '')}" maxlength="150"></div>
            <div><label>סוג הודעה</label><select id="epaM_scope">
                <option value="ALL" ${scope === 'ALL' ? 'selected' : ''}>הודעת מערכת (לכל העובדים)</option>
                <option value="EMPLOYEE" ${scope === 'EMPLOYEE' ? 'selected' : ''}>הודעה אישית (רק העובד/ת יראה/תראה אותה)</option>
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

/** True when date ranges [aStart,aEnd] and [bStart,bEnd] (YYYY-MM-DD strings) overlap. */
function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
    if (bStart && aEnd < bStart) return false;
    if (bEnd && aStart > bEnd) return false;
    return true;
}

function renderVacationFilters(ce, d) {
    const f = ce._vacationFilter || { employeeId: '', month: '', from: '', to: '' };
    const employees = (d.employees || []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
    const empOptions = `<option value="">כל העובדים</option>` + employees.map(e =>
        `<option value="${esc(e.id)}" ${f.employeeId === e.id ? 'selected' : ''}>${esc(e.displayName)}</option>`).join('');
    const hasFilter = !!(f.employeeId || f.month || f.from || f.to);
    return `<div class="epa-panel">
        <div class="epa-form">
            <div><label>עובד/ת</label><select id="epaVFilterEmp" data-action="admin-vacation-filter">${empOptions}</select></div>
            <div><label>חודש</label><input type="month" id="epaVFilterMonth" data-action="admin-vacation-filter" value="${esc(f.month)}"></div>
            <div><label>מתאריך</label><input type="date" id="epaVFilterFrom" data-action="admin-vacation-filter" value="${esc(f.from)}"></div>
            <div><label>עד תאריך</label><input type="date" id="epaVFilterTo" data-action="admin-vacation-filter" value="${esc(f.to)}"></div>
        </div>
        ${hasFilter ? `<div class="epa-inline" style="margin-top:8px"><button type="button" class="epa-btn" data-action="admin-vacation-filter-clear">איפוס סינון</button></div>` : ''}
    </div>`;
}

function renderVacationsPage(ce, d) {
    const head = `<div class="epa-page-head"><div><h2>חופשות</h2><p>חופשות מאושרות ופטורות מדרישת הגשה — ובקשות חופש ממתינות לאישור מעובדים</p></div>
        ${ce._vacationsData ? `<button class="epa-btn primary" data-action="admin-new-vacation">חופשה חדשה +</button>` : ''}</div>`;
    if (!ce._vacationsData) {
        return `${head}<section class="epa-panel"><div class="ep-loading"><div class="ep-spinner"></div>טוען חופשות…</div></section>`;
    }
    const statusLabel = { APPROVED: 'מאושר', PENDING: 'ממתין', REJECTED: 'נדחה' };
    const filters = renderVacationFilters(ce, d);

    const f = ce._vacationFilter || { employeeId: '', month: '', from: '', to: '' };
    const monthStart = f.month ? `${f.month}-01` : '';
    const monthEnd = f.month ? `${f.month}-31` : '';
    const rangeFrom = [f.from, monthStart].filter(Boolean).sort().pop() || '';
    const rangeTo = [f.to, monthEnd].filter(Boolean).sort()[0] || '';
    const matchesFilter = (v) => {
        if (f.employeeId && v.employeeId !== f.employeeId) return false;
        if ((rangeFrom || rangeTo) && !dateRangesOverlap(v.startDate, v.endDate, rangeFrom, rangeTo)) return false;
        return true;
    };

    const pending = ce._vacationsData.filter(v => v.status === 'PENDING' && matchesFilter(v));
    const pendingSection = pending.length ? `
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>בקשות ממתינות (${pending.length})</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>עובד/ת</th><th>תאריך</th><th>הערות</th><th>סטטוס</th><th></th></tr></thead>
                <tbody>${pending.map(v => `
                    <tr>
                        <td>${esc(v.employeeName)}</td>
                        <td>${fmtDate(v.startDate)}${v.endDate !== v.startDate ? ` – ${fmtDate(v.endDate)}` : ''}</td>
                        <td>${esc(v.notes || '—')}</td>
                        <td><span class="epa-badge miss">${statusLabel.PENDING}</span></td>
                        <td class="epa-sub-actions">
                            <button class="epa-btn primary" data-action="admin-approve-vacation" data-vacation="${esc(v.id)}">אישור</button>
                            <button class="epa-btn danger" data-action="admin-reject-vacation" data-vacation="${esc(v.id)}">דחייה</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </section>` : '';
    const filtered = ce._vacationsData.filter(v => v.status !== 'PENDING' && matchesFilter(v));
    const rows = filtered.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).map(v => `
        <tr class="epa-row-click" data-action="admin-edit-vacation" data-vacation="${esc(v.id)}">
            <td>${esc(v.employeeName)}</td>
            <td>${fmtDate(v.startDate)} – ${fmtDate(v.endDate)}</td>
            <td>${esc(v.notes || '—')}</td>
            <td><span class="epa-badge ${v.status === 'APPROVED' ? 'ok' : 'miss'}">${statusLabel[v.status] || esc(v.status)}</span></td>
            <td><button class="epa-btn danger" data-action="admin-delete-vacation" data-vacation="${esc(v.id)}">מחיקה</button></td>
        </tr>`).join('');
    return `${head}${filters}${pendingSection}
        <section class="epa-panel">
            <div class="epa-panel-title"><h3>חופשות (${filtered.length})</h3></div>
            <div class="epa-table-wrap"><table class="epa-table"><thead><tr><th>עובד/ת</th><th>טווח תאריכים</th><th>הערות</th><th>סטטוס</th><th></th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" class="ep-empty">אין חופשות התואמות את הסינון</td></tr>'}</tbody>
            </table></div>
        </section>`;
}

function renderVacationForm(ce, d, vacation) {
    const employees = (d.employees || []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
    const empOptions = employees.map(e => `<option value="${esc(e.id)}" ${vacation?.employeeId === e.id ? 'selected' : ''}>${esc(e.displayName)}</option>`).join('');
    return `<div class="epa-form">
            <div><label>עובד/ת</label><select id="epaV_employeeId" ${vacation ? 'disabled' : ''}>${empOptions}</select></div>
            <div><label>מתאריך</label><input id="epaV_start" type="date" value="${esc(vacation?.startDate || '')}"></div>
            <div><label>עד תאריך</label><input id="epaV_end" type="date" value="${esc(vacation?.endDate || '')}"></div>
        </div>
        <div class="epa-field" style="margin-top:8px"><label>הערות</label><input id="epaV_notes" value="${esc(vacation?.notes || '')}"></div>
        <div class="epa-inline">
            <button class="epa-btn primary" data-action="admin-save-vacation" data-vacation="${esc(vacation?.id || '')}">שמירה</button>
            ${vacation?.id ? `<button class="epa-btn danger" data-action="admin-delete-vacation" data-vacation="${esc(vacation.id)}">מחיקה</button>` : ''}
            <button class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

function renderModal(ce, d) {
    const modal = ce._adminModal;
    if (!modal) return '';
    let title = '', body = '';
    if (modal.type === 'employee') {
        const employee = employeeForForm(ce, findEmployee(ce, d, modal.id));
        if (!employee) return '';
        title = `הגדרות — ${employee.displayName}`;
        body = renderEmployeeForm(ce, employee, d);
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
            <div class="epa-detail-item"><span>סוג עבודה</span><b>${esc(WORK_TYPE_LABELS[s.workType] || 'סדנה')}</b></div>
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
        body = renderTemplateForm(template, modal.use);
    } else if (modal.type === 'setupStaff') {
        const employee = findEmployee(ce, d, modal.id);
        if (!employee) return '';
        title = `הקמת Bookings — ${employee.displayName}`;
        body = renderSetupStaffForm(ce, d, modal.id);
    } else if (modal.type === 'timeEntry') {
        const entry = modal.id
            ? (ce._teamTimeData?.employees || []).flatMap(e => e.entries).find(x => x.id === modal.id)
            : null;
        title = entry ? 'עריכת רישום שעות' : 'רישום שעות חדש';
        body = renderTimeEntryForm(ce, d, entry);
    } else if (modal.type === 'workTypeConfirm') {
        const label = WORK_TYPE_LABELS[modal.workType] || modal.workType;
        title = 'אישור שינוי סוג עבודה';
        body = `<p style="margin:0 0 12px">האם לאשר שינוי סוג העבודה ל<strong>${esc(label)}</strong>?</p>
            <div class="epa-inline">
                <button class="epa-btn primary" data-action="admin-worktype-confirm">אישור</button>
                <button class="epa-btn" data-action="admin-worktype-cancel">ביטול</button>
            </div>`;
    } else if (modal.type === 'message') {
        const message = modal.id ? (ce._adminMessagesData || []).find(m => m.id === modal.id) : null;
        title = message ? 'עריכת הודעה' : (modal.prefill ? 'הערה אישית לעובד/ת' : 'הודעה חדשה');
        body = renderMessageForm(ce, d, message, modal.prefill);
    } else if (modal.type === 'vacation') {
        const vacation = modal.id ? (ce._vacationsData || []).find(v => v.id === modal.id) : null;
        title = vacation ? `עריכת חופשה — ${vacation.employeeName}` : 'חופשה חדשה';
        body = renderVacationForm(ce, d, vacation);
    } else if (modal.type === 'autoAssignEmployees') {
        title = '✨ שיבוץ אוטומטי — שלב 1: בחירת עובדים';
        body = renderAutoAssignEmployeesStep(ce, d);
    } else if (modal.type === 'autoAssignRange') {
        title = '✨ שיבוץ אוטומטי — שלב 2: טווח תאריכים';
        body = renderAutoAssignRangeStep(ce, d);
    } else if (modal.type === 'autoAssignSummary') {
        title = '📋 שיבוץ אוטומטי — סיכום תוצאות';
        body = renderAutoAssignSummaryStep(ce);
    } else if (modal.type === 'confirmDeactivate') {
        const employee = findEmployee(ce, d, modal.id);
        title = `השבתת עובד/ת — ${esc(employee?.displayName || '')}`;
        body = renderConfirmDeactivateForm(ce, modal.id);
    }
    return `<div class="epa-modal-backdrop">
        <div class="epa-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
            <div class="epa-modal-head"><h2>${esc(title)}</h2><button class="epa-modal-close" data-action="admin-close-modal" aria-label="סגירה">×</button></div>
            ${body}
        </div>
    </div>`;
}

function renderConfirmDeactivateForm(ce, roleId) {
    const shifts = ce._deactivateShifts;
    const statusLabel = { SUBMITTED: 'הוגש', STANDBY: 'בהמתנה', SCHEDULED: 'משובץ' };
    let shiftsBlock;
    if (shifts === null || shifts === undefined) {
        shiftsBlock = `<div class="ep-loading" style="padding:14px 0"><div class="ep-spinner"></div>בודק משמרות עתידיות…</div>`;
    } else if (!shifts.length) {
        shiftsBlock = `<div class="ep-empty">לעובד/ת זה/ו אין משמרות עתידיות רשומות.</div>`;
    } else {
        const rows = shifts.map(s => `<div class="epa-deactivate-shift-row">
            <span>${fmtDate(s.dateKey)}</span>
            <span>${esc(s.startTime)}–${esc(s.endTime)}</span>
            <span class="epa-badge kind">${esc(statusLabel[s.status] || s.status)}</span>
        </div>`).join('');
        shiftsBlock = `<div class="epa-deactivate-shifts">${rows}</div>`;
    }
    const removeDisabled = !shifts || !shifts.length;
    return `<p style="margin:0 0 10px">כיבוי הפרופיל ימנע מהעובד/ת להגיש זמינות ולהתחבר לפורטל. ניתן להפעיל אותו/ה בחזרה בכל עת.</p>
        ${shiftsBlock}
        <label class="epa-toggle" style="margin-top:10px">
            <input type="checkbox" id="epaDeactivateRemoveShifts" ${removeDisabled ? 'disabled' : 'checked'}>
            הסרת כל המשמרות העתידיות של העובד/ת (${shifts?.length ?? 0})
        </label>
        <div class="epa-inline" style="margin-top:12px">
            <button class="epa-btn danger" data-action="admin-confirm-deactivate" data-emp="${esc(roleId)}">כיבוי העובד/ת</button>
            <button class="epa-btn" data-action="admin-cancel-deactivate">ביטול</button>
        </div>`;
}

// ---------------------------------------------------------------------------
// Click handling — returns true when the action was handled here
// ---------------------------------------------------------------------------

export function handleAdminChange(ce, input) {
    if (input?.dataset?.action === 'admin-toggle-active') {
        const roleId = input.dataset.emp;
        if (!input.checked) {
            // Revert visually until the manager confirms — shifts must be reviewed first.
            input.checked = true;
            captureEmployeeFormDraft(ce, ce._adminData); // keep any other in-progress field edits
            ce._deactivateShifts = null;
            ce._adminModal = { type: 'confirmDeactivate', id: roleId, returnTo: 'employee' };
            ce.render();
            ce._dispatch('adminListEmployeeShifts', { roleId });
            return true;
        }
        ce._startBusy('מפעיל/ה עובד/ת…');
        ce._dispatch('adminUpdateEmployee', { roleId, patch: { active: true } });
        return true;
    }
    if (input?.dataset?.action === 'admin-open-offers-ws-filter') {
        ce._openOffersWsFilter = input.value;
        ce._openOffersPage = 0;
        ce.render();
        return true;
    }
    if (input?.dataset?.action === 'admin-board-subs-emp-filter') {
        ce._boardSubsEmpFilter = input.value;
        ce._boardSubsPage = 0;
        ce.render();
        return true;
    }
    if (input?.dataset?.action === 'admin-vacation-filter') {
        ce._vacationFilter = ce._vacationFilter || { employeeId: '', month: '', from: '', to: '' };
        if (input.id === 'epaVFilterEmp') ce._vacationFilter.employeeId = input.value;
        if (input.id === 'epaVFilterMonth') ce._vacationFilter.month = input.value;
        if (input.id === 'epaVFilterFrom') ce._vacationFilter.from = input.value;
        if (input.id === 'epaVFilterTo') ce._vacationFilter.to = input.value;
        ce.render();
        return true;
    }
    if (input?.classList?.contains('epaAutoEmp')) {
        ce._autoAssignSelected = ce._autoAssignSelected || [];
        if (input.checked) {
            if (ce._autoAssignSelected.length >= 3) { input.checked = false; return true; }
            ce._autoAssignSelected.push(input.value);
        } else {
            ce._autoAssignSelected = ce._autoAssignSelected.filter(id => id !== input.value);
        }
        ce.render();
        return true;
    }
    if (input?.dataset?.action === 'admin-holiday-mode-change') {
        const isShort = input.value === 'SHORT';
        const start = ce.querySelector('#epaHolStart');
        const end = ce.querySelector('#epaHolEnd');
        if (start) start.disabled = !isShort;
        if (end) end.disabled = !isShort;
        return true;
    }
    if (input?.dataset?.action !== 'admin-sub-worktype') return false;
    const newVal = input.value;
    const prev = input.dataset.prev || DEFAULT_WORK_TYPE;
    if (newVal === DEFAULT_WORK_TYPE || newVal === prev) {
        input.dataset.prev = newVal;
        if (ce._pendingWorkTypes) delete ce._pendingWorkTypes[input.dataset.sub];
        return true;
    }
    input.value = prev;
    ce._adminModal = {
        type: 'workTypeConfirm',
        submissionId: input.dataset.sub,
        workType: newVal,
        prevWorkType: prev,
    };
    ce.render();
    return true;
}

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
            if (ce._adminPage === 'employees' && ce._staffData === null && d?.permissions?.manageEmployees) {
                ce._dispatch('adminStaffLoad');
            }
            if (ce._adminPage === 'teamTime' && !ce._teamTimeData && d?.permissions?.editTimeEntries) {
                ce._dispatch('adminTeamTimeLoad', { monthKey: ce._teamTimeMonth });
            }
            if (ce._adminPage === 'messages' && !ce._adminMessagesData && d?.permissions?.manageEmployees) {
                ce._dispatch('adminMessagesLoad');
            }
            if (ce._adminPage === 'vacations' && !ce._vacationsData && d?.permissions?.manageEmployees) {
                ce._dispatch('adminVacationsLoad');
            }
            ce.render();
            return true;
        case 'admin-month-prev':
            ce._adminMonth = shiftMonth(ce._adminMonth, -1);
            ce._adminSelectedDay = null;
            ce._openOffersPage = 0;
            ce._boardSubsPage = 0;
            ce._requestAdminData();
            return true;
        case 'admin-month-next':
            ce._adminMonth = shiftMonth(ce._adminMonth, 1);
            ce._adminSelectedDay = null;
            ce._openOffersPage = 0;
            ce._boardSubsPage = 0;
            ce._requestAdminData();
            return true;
        case 'admin-tracker-status':
            ce._trackerStatusFilter = target.dataset.status || 'ALL';
            ce.render();
            return true;
        case 'admin-view-heat':
            ce._adminView = 'heat'; ce.render(); return true;
        case 'admin-view-list':
            ce._adminView = 'list'; ce.render(); return true;
        case 'admin-select-day':
            ce._adminSelectedDay = target.dataset.date;
            ce._adminDayGlobalOpen = false;
            ce.render();
            return true;
        case 'admin-close-day':
            ce._adminSelectedDay = null;
            ce._adminDayGlobalOpen = false;
            ce.render();
            return true;
        case 'admin-toggle-holidays':
            ce._adminHolidaysOpen = !ce._adminHolidaysOpen;
            ce.render();
            return true;
        case 'admin-toggle-day-global':
            ce._adminDayGlobalOpen = !ce._adminDayGlobalOpen;
            ce.render();
            return true;
        case 'admin-toggle-open-offers':
            ce._openOffersOpen = !ce._openOffersOpen;
            ce.render();
            return true;
        case 'admin-open-offers-prev':
            ce._openOffersPage = Math.max(0, (ce._openOffersPage || 0) - 1);
            ce.render();
            return true;
        case 'admin-open-offers-next': {
            const offers = (d.openOffers || []).filter(o => !ce._openOffersWsFilter || o.workshopTypeId === ce._openOffersWsFilter);
            const totalPages = Math.max(1, Math.ceil(offers.length / 10));
            ce._openOffersPage = Math.min(totalPages - 1, (ce._openOffersPage || 0) + 1);
            ce.render();
            return true;
        }
        case 'admin-toggle-board-subs':
            ce._boardSubsOpen = !ce._boardSubsOpen;
            ce.render();
            return true;
        case 'admin-board-subs-prev':
            ce._boardSubsPage = Math.max(0, (ce._boardSubsPage || 0) - 1);
            ce.render();
            return true;
        case 'admin-board-subs-next': {
            let subs = (d.submissions || []).filter(s => s.status !== 'REJECTED');
            if (ce._boardSubsEmpFilter) subs = subs.filter(s => s.employeeId === ce._boardSubsEmpFilter);
            const totalPages = Math.max(1, Math.ceil(subs.length / 10));
            ce._boardSubsPage = Math.min(totalPages - 1, (ce._boardSubsPage || 0) + 1);
            ce.render();
            return true;
        }
        case 'admin-open-auto-assign':
            ce._autoAssignSelected = [];
            ce._autoAssignFrom = null;
            ce._autoAssignTo = null;
            ce._autoAssignReport = null;
            ce._autoAssignOpenRows = new Set();
            ce._adminModal = { type: 'autoAssignEmployees' };
            ce.render();
            return true;
        case 'admin-auto-assign-next':
            if (!(ce._autoAssignSelected || []).length) { ce._toast('יש לבחור לפחות עובד/ת אחד/ת.', 'error'); ce.render(); return true; }
            ce._adminModal = { type: 'autoAssignRange' };
            ce.render();
            return true;
        case 'admin-auto-assign-back':
            ce._adminModal = { type: 'autoAssignEmployees' };
            ce.render();
            return true;
        case 'admin-auto-assign-run': {
            const from = ce.querySelector('#epaAutoFrom')?.value;
            const to = ce.querySelector('#epaAutoTo')?.value;
            if (!from || !to || to < from) { ce._toast('יש לבחור טווח תאריכים תקין.', 'error'); return true; }
            const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
            if (days > 28) { ce._toast('טווח התאריכים לא יכול לעלות על 4 שבועות.', 'error'); return true; }
            ce._autoAssignFrom = from;
            ce._autoAssignTo = to;
            ce._adminModal = null;
            ce._startBusy('מריץ שיבוץ אוטומטי לעובדים שנבחרו…');
            ce._dispatch('adminRunSchedulingForEmployees', { fromKey: from, toKey: to, employeeIds: ce._autoAssignSelected });
            return true;
        }
        case 'admin-auto-assign-toggle-row': {
            ce._autoAssignOpenRows = ce._autoAssignOpenRows || new Set();
            const id = target.dataset.emp;
            if (ce._autoAssignOpenRows.has(id)) ce._autoAssignOpenRows.delete(id); else ce._autoAssignOpenRows.add(id);
            ce.render();
            return true;
        }
        case 'admin-toggle-block':
            ce._startBusy('מעדכן…');
            ce._dispatch('adminDayFlags', { dateKey: target.dataset.date, flags: { blocked: target.dataset.on === '1' } });
            return true;
        case 'admin-save-holiday-mode': {
            const dateKey = target.dataset.date;
            const mode = ce.querySelector('#epaHolMode')?.value || '';
            const shortStart = ce.querySelector('#epaHolStart')?.value || '';
            const shortEnd = ce.querySelector('#epaHolEnd')?.value || '';
            if (mode === 'SHORT' && (!shortStart || !shortEnd)) {
                ce._toast?.('יש להזין שעת פתיחה וסגירה ליום מקוצר.', 'error');
                return true;
            }
            ce._startBusy?.('שומר…');
            ce._dispatch('adminSetHolidayMode', { dateKey, mode, shortStart, shortEnd });
            return true;
        }
        case 'admin-save-day-note': {
            const dateKey = target.dataset.date;
            const message = ce.querySelector('#epaDayNote')?.value || '';
            ce._startBusy?.('שומר…');
            ce._dispatch('adminSaveDayNote', { dateKey, message });
            return true;
        }
        case 'admin-clear-day-note': {
            ce._startBusy?.('מוחק…');
            ce._dispatch('adminSaveDayNote', { dateKey: target.dataset.date, message: '' });
            return true;
        }
        case 'admin-save-sketch-duty': {
            const dateKey = target.dataset.date;
            const startTime = ce.querySelector('#epaSketchStart')?.value || '';
            const endTime = ce.querySelector('#epaSketchEnd')?.value || '';
            if (!startTime || !endTime || startTime >= endTime) {
                ce._toast?.('יש להזין שעת התחלה ושעת סיום תקינות (התחלה לפני סיום).', 'error');
                return true;
            }
            ce._pendingSketchDutyConfirm = null;
            ce._startBusy?.('שומר…');
            ce._dispatch('adminSaveSketchDuty', { dateKey, startTime, endTime, confirmOverlap: false });
            return true;
        }
        case 'admin-confirm-sketch-duty': {
            const dateKey = target.dataset.date;
            const pending = ce._pendingSketchDutyConfirm;
            if (!pending || pending.dateKey !== dateKey) return true;
            ce._pendingSketchDutyConfirm = null;
            ce._startBusy?.('שומר…');
            ce._dispatch('adminSaveSketchDuty', { dateKey, startTime: pending.startTime, endTime: pending.endTime, confirmOverlap: true });
            return true;
        }
        case 'admin-delete-sketch-duty': {
            ce._pendingSketchDutyConfirm = null;
            ce._startBusy?.('מוחק…');
            ce._dispatch('adminDeleteSketchDuty', { dateKey: target.dataset.date });
            return true;
        }
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
            const workType = ce.querySelector('#epaAssignWorkType')?.value;
            const workshopTypeIds = [...ce.querySelectorAll('.epaAssignWs:checked')].map(x => x.value);
            if (!emp) {
                ce._toast('יש לבחור עובד/ת.', 'error');
                return true;
            }
            ce._startBusy('משבץ…');
            ce._dispatch('adminManualAssign', { dateKey: target.dataset.date, workshopTypeIds, employeeId: emp, workType });
            return true;
        }
        case 'admin-quick-note': {
            const dateKey = target.dataset.date;
            const employeeId = ce.querySelector('#epaAssignEmp')?.value;
            if (!employeeId) {
                ce._toast('יש לבחור עובד/ת.', 'error');
                return true;
            }
            const emp = (d?.employees || []).find(e => e.id === employeeId);
            ce._adminModal = {
                type: 'message',
                id: null,
                prefill: {
                    scope: 'EMPLOYEE',
                    employeeId,
                    title: `הערה — ${fmtDate(dateKey)}${emp ? ` (${emp.displayName})` : ''}`,
                },
            };
            ce.render();
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
        case 'admin-approve-submission': {
            if (!d?.permissions?.manageScheduling) return true;
            const subId = target.dataset.sub;
            const wsSelect = ce.querySelector(`.epa-sub-ws[data-sub="${subId}"]`);
            const workshopTypeId = wsSelect?.value;
            if (!workshopTypeId) {
                ce._toast('יש לבחור סוג סדנה.', 'error');
                return true;
            }
            const workType = (ce._pendingWorkTypes && ce._pendingWorkTypes[subId])
                || ce.querySelector(`.epa-sub-worktype[data-sub="${subId}"]`)?.value
                || DEFAULT_WORK_TYPE;
            ce._startBusy('מאשר משמרת…');
            ce._dispatch('adminApproveSubmission', { submissionId: subId, workshopTypeId, workType });
            return true;
        }
        case 'admin-reject-submission':
            ce._startBusy('דוחה משמרת…');
            ce._dispatch('adminRejectSubmission', { submissionId: target.dataset.sub });
            return true;
        case 'admin-worktype-confirm': {
            const pending = ce._adminModal;
            ce._adminModal = null;
            if (!pending?.submissionId) return true;
            const s = (d?.submissions || []).find(x => x.id === pending.submissionId);
            if (s?.status === 'SCHEDULED') {
                ce._startBusy('מעדכן סוג עבודה…');
                ce._dispatch('adminUpdateWorkType', { submissionId: pending.submissionId, workType: pending.workType });
            } else {
                ce._pendingWorkTypes = ce._pendingWorkTypes || {};
                ce._pendingWorkTypes[pending.submissionId] = pending.workType;
                ce.render();
            }
            return true;
        }
        case 'admin-confirm-deactivate': {
            const roleId = target.dataset.emp;
            const removeShifts = !!ce.querySelector('#epaDeactivateRemoveShifts')?.checked;
            const returnTo = ce._adminModal?.returnTo;
            // The draft's `active` was captured as `true` (the switch is reverted while confirming) —
            // drop it so the reopened form reflects the server's authoritative (now-inactive) state.
            if (ce._empFormDraft?.[roleId]?.patch) delete ce._empFormDraft[roleId].patch.active;
            ce._adminModal = returnTo === 'employee' ? { type: 'employee', id: roleId } : null;
            ce._deactivateShifts = null;
            ce._startBusy('משבית עובד/ת…');
            ce._dispatch('adminDeactivateEmployee', { roleId, removeShifts });
            return true;
        }
        case 'admin-cancel-deactivate': {
            const returnTo = ce._adminModal?.returnTo;
            const roleId = ce._adminModal?.id;
            ce._adminModal = returnTo === 'employee' ? { type: 'employee', id: roleId } : null;
            ce._deactivateShifts = null;
            ce.render();
            return true;
        }
        case 'admin-worktype-cancel':
            ce._adminModal = null;
            ce.render();
            return true;
        case 'admin-toggle-emp-acc': {
            captureEmployeeFormDraft(ce, d);
            if (!ce._empFormAcc) ce._empFormAcc = {};
            const acc = target.dataset.acc;
            ce._empFormAcc[acc] = !ce._empFormAcc[acc];
            ce.render();
            return true;
        }
        case 'admin-edit-employee':
            if (!d?.permissions?.manageEmployees) return true;
            ce._empFormAcc = {};
            if (!ce._empFormDraft) ce._empFormDraft = {};
            delete ce._empFormDraft[target.dataset.emp];
            ce._adminModal = { type: 'employee', id: target.dataset.emp };
            ce.render();
            return true;
        case 'admin-open-submission':
            ce._adminModal = { type: 'submission', id: target.dataset.sub };
            ce.render();
            return true;
        case 'admin-close-modal':
            if (ce._adminModal?.type === 'employee' && ce._adminModal.id && ce._empFormDraft) {
                delete ce._empFormDraft[ce._adminModal.id];
            }
            ce._adminModal = null;
            ce.render();
            return true;
        case 'admin-cancel-edit':
            if (ce._adminModal?.type === 'employee' && ce._adminModal.id && ce._empFormDraft) {
                delete ce._empFormDraft[ce._adminModal.id];
            }
            ce._adminModal = null;
            ce.render();
            return true;
        case 'admin-save-employee': {
            if (ce._empSaveFinishing) return true;
            captureEmployeeFormDraft(ce, d);
            const draft = ce._empFormDraft?.[target.dataset.emp];
            const { patch, permissions } = draft
                ? { patch: draft.patch, permissions: draft.permissions }
                : readEmployeeFormValues(ce, d);
            ce._lastEmployeeSave = { roleId: target.dataset.emp, patch, permissions };
            ce._empSaveFinishing = true;
            ce._startBusy('שומר פרטי עובד/ת…');
            ce._dispatch('adminSaveEmployee', { roleId: target.dataset.emp, patch, permissions });
            return true;
        }
        case 'admin-toggle-emp-sort':
            if (!d?.permissions?.manageEmployees) return true;
            if (!ce._empSortMode) {
                ce._empSortMode = true;
                ce._empPendingOrder = employeesForPage(ce, d).map(e => e.id);
                ce._empOrderDirty = false;
            } else {
                ce._empSortMode = false;
                ce._empPendingOrder = null;
                ce._empOrderDirty = false;
            }
            ce.render();
            return true;
        case 'admin-emp-move':
            if (!d?.permissions?.manageEmployees || !ce._empSortMode) return true;
            moveEmployeeInOrder(ce, d, target.dataset.emp, target.dataset.dir);
            ce.render();
            return true;
        case 'admin-emp-save-order': {
            if (!d?.permissions?.manageEmployees || !Array.isArray(ce._empPendingOrder)) return true;
            const roleIds = ce._empPendingOrder;
            ce._empPendingOrder = null;
            ce._empOrderDirty = false;
            ce._empSortMode = false;
            requestEmployeeReorder(ce, d, roleIds);
            ce.render();
            return true;
        }
        case 'admin-emp-drag':
            return true;
        case 'admin-staff-refresh':
            ce._staffData = null;
            ce._staffIds = null;
            ce._allEmployees = null;
            ce.render();
            ce._dispatch('adminStaffLoad');
            return true;
        case 'admin-new-staff':
            window.open(WIX_NEW_STAFF_URL, '_blank', 'noopener');
            return true;
        case 'admin-setup-staff':
            if (!d?.permissions?.manageEmployees) return true;
            ce._adminModal = { type: 'setupStaff', id: target.dataset.emp };
            ce.render();
            return true;
        case 'admin-link-staff-to-employee': {
            if (!d?.permissions?.manageEmployees) return true;
            const emp = findEmployee(ce, d, target.dataset.emp);
            ce._adminModal = null;
            ce._startBusy('מחבר ל-Bookings…');
            ce._dispatch('adminLinkStaff', {
                staffId: target.dataset.staff,
                patch: { roleId: target.dataset.emp, displayName: emp?.displayName, phone: emp?.phone },
            });
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
            const errors = {};
            const positiveNumber = (id, { allowZero = false } = {}) => {
                const raw = value(id);
                const num = Number(raw);
                if (raw === '' || raw === undefined || !Number.isFinite(num) || (allowZero ? num < 0 : num <= 0)) {
                    errors[id] = allowZero ? 'יש להזין מספר תקין (0 ומעלה).' : 'יש להזין מספר חיובי תקין.';
                    return null;
                }
                return num;
            };
            const timeValue = (id) => {
                const raw = value(id) || '';
                if (!/^\d{2}:\d{2}$/.test(raw)) {
                    errors[id] = 'יש להזין שעה תקינה (HH:MM).';
                    return null;
                }
                return raw;
            };
            const deadlineDaysBeforeMonthEnd = positiveNumber('epaS_deadline');
            const monthsAheadAllowed = positiveNumber('epaS_monthsAhead');
            const defaultMinShiftsPerWeek = positiveNumber('epaS_minShifts');
            const defaultMinShiftHours = positiveNumber('epaS_minHours');
            const defaultShiftStart = timeValue('epaS_start');
            const defaultShiftEnd = timeValue('epaS_end');
            const requiredFridaysPerMonth = positiveNumber('epaS_reqFri', { allowZero: true });
            const requiredSaturdaysPerMonth = positiveNumber('epaS_reqSat', { allowZero: true });
            if (!errors.epaS_start && !errors.epaS_end && defaultShiftStart >= defaultShiftEnd) {
                errors.epaS_end = 'שעת הסיום חייבת להיות לאחר שעת ההתחלה.';
            }
            ce._settingsFieldErrors = Object.keys(errors).length ? errors : null;
            if (ce._settingsFieldErrors) {
                ce._toast('יש לתקן את השדות המסומנים בהגדרות הזמינות הכלליות.', 'error');
                ce.render();
                return true;
            }
            ce._settingsSaving = true;
            ce._settingsSavedAt = null;
            // Patch just the save button + any stale error markup in place
            // instead of a full page re-render, which was visibly
            // flashing/resetting the whole tab on every save.
            ce.querySelectorAll('.epa-settings-grid .epa-field.has-error').forEach((el) => {
                el.classList.remove('has-error');
                const errEl = el.querySelector('.epa-field-error');
                if (errEl) errEl.textContent = '';
            });
            const settingsSaveBtn = ce.querySelector('[data-action="admin-save-settings"]');
            if (settingsSaveBtn) {
                settingsSaveBtn.disabled = true;
                settingsSaveBtn.innerHTML = '<span class="epa-save-spin"></span>שומר הגדרות…';
            }
            ce._dispatch('adminUpdateSettings', {
                patch: {
                    deadlineDaysBeforeMonthEnd,
                    monthsAheadAllowed,
                    defaultMinShiftsPerWeek,
                    defaultMinShiftHours,
                    defaultShiftStart,
                    defaultShiftEnd,
                    requiredFridaysPerMonth,
                    requiredSaturdaysPerMonth,
                    bonusUnlockEnabled: !!ce.querySelector('#epaS_bonus')?.checked,
                    autoApproveShifts: !!ce.querySelector('#epaS_autoApprove')?.checked,
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
            // Bulk name/date editor — mode/shortStart/shortEnd (set via the
            // day-detail panel) are preserved by carrying over the matching
            // existing entry for each date instead of overwriting it.
            const existingByDate = {};
            for (const h of (d.settings?.holidays || [])) if (h?.date) existingByDate[h.date] = h;
            const rows = [...ce.querySelectorAll('[data-holiday-row]')];
            const incomplete = rows.some(row => {
                const date = row.querySelector('.epaH_date')?.value || '';
                const name = row.querySelector('.epaH_name')?.value || '';
                return (date && !name.trim()) || (!date && name.trim());
            });
            if (incomplete) {
                ce._toast('כל שורת מועד חייבת לכלול תאריך ושם — שורות חסרות לא יישמרו.', 'error');
            }
            const holidays = rows.map(row => {
                const date = row.querySelector('.epaH_date')?.value || '';
                const name = row.querySelector('.epaH_name')?.value || '';
                return { ...(existingByDate[date] || {}), date, name };
            }).filter(h => h.date && h.name.trim());
            ce._holidaysSaving = true;
            ce.render();
            ce._startBusy('שומר מועדים…');
            ce._dispatch('adminUpdateHolidays', { holidays });
            return true;
        }
        case 'admin-sync-holidays':
            ce._startBusy('מסנכרן חגים…');
            ce._dispatch('adminSyncHolidays', {});
            return true;
        case 'admin-new-template':
            ce._adminModal = { type: 'template', id: null, use: target.dataset.use || TEMPLATE_USE.EMPLOYEES };
            ce.render();
            return true;
        case 'admin-edit-template':
            ce._adminModal = { type: 'template', id: target.dataset.template };
            ce.render();
            return true;
        case 'admin-save-template': {
            const title = ce.querySelector('#epaT_title')?.value || '';
            const body = ce.querySelector('#epaT_body')?.value || '';
            const use = ce.querySelector('#epaT_use')?.value || TEMPLATE_USE.EMPLOYEES;
            if (!title.trim() || !body.trim()) {
                ce._toast('יש להזין שם ותוכן לתבנית.', 'error');
                return true;
            }
            ce._adminModal = null;
            ce._startBusy('שומר תבנית…');
            ce._dispatch('adminTemplateSave', { template: { id: target.dataset.template || null, title, body, use } });
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
        case 'admin-new-vacation':
            ce._adminModal = { type: 'vacation', id: null };
            ce.render();
            return true;
        case 'admin-vacation-filter-clear':
            ce._vacationFilter = { employeeId: '', month: '', from: '', to: '' };
            ce.render();
            return true;
        case 'admin-edit-vacation':
            ce._adminModal = { type: 'vacation', id: target.dataset.vacation };
            ce.render();
            return true;
        case 'admin-save-vacation': {
            const val = (id) => ce.querySelector(`#${id}`)?.value;
            const employeeId = target.dataset.vacation
                ? (ce._vacationsData || []).find(v => v.id === target.dataset.vacation)?.employeeId
                : val('epaV_employeeId');
            const vacation = {
                id: target.dataset.vacation || undefined,
                employeeId,
                startDate: val('epaV_start'),
                endDate: val('epaV_end'),
                notes: val('epaV_notes') || '',
            };
            if (!vacation.employeeId || !vacation.startDate || !vacation.endDate) {
                ce._toast('יש לבחור עובד/ת ותאריכי התחלה וסיום.', 'error');
                return true;
            }
            ce._adminModal = null;
            ce._startBusy('שומר חופשה…');
            ce._dispatch('adminSaveVacation', { vacation });
            return true;
        }
        case 'admin-delete-vacation':
            ce._adminModal = null;
            ce._startBusy('מוחק חופשה…');
            ce._dispatch('adminDeleteVacation', { vacationId: target.dataset.vacation });
            return true;
        case 'admin-approve-vacation':
            ce._startBusy('מאשר בקשת חופש…');
            ce._dispatch('adminApproveVacation', { vacationId: target.dataset.vacation });
            return true;
        case 'admin-reject-vacation':
            ce._startBusy('דוחה בקשת חופש…');
            ce._dispatch('adminRejectVacation', { vacationId: target.dataset.vacation });
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

export function handleAdminDragStart(ce, e) {
    if (!ce._empSortMode) return false;
    const handle = e.target.closest('[data-action="admin-emp-drag"]');
    if (!handle) return false;
    ce._empDragId = handle.dataset.emp;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ce._empDragId);
    }
    handle.closest('tr')?.classList.add('dragging');
    return true;
}

export function handleAdminDragEnd(ce) {
    ce._empDragId = null;
    ce.querySelectorAll('.epa-emp-sort-row').forEach((row) => row.classList.remove('dragging', 'drag-over'));
    return true;
}

export function handleAdminDragOver(ce, e) {
    if (!ce._empSortMode || !ce._empDragId) return false;
    const row = e.target.closest('tr[data-emp-row]');
    if (!row) return false;
    ce.querySelectorAll('.epa-emp-sort-row.drag-over').forEach((el) => el.classList.remove('drag-over'));
    row.classList.add('drag-over');
    return true;
}

export function handleAdminDrop(ce, e, d) {
    if (!ce._empSortMode || !ce._empDragId || !d) return false;
    const row = e.target.closest('tr[data-emp-row]');
    if (!row) return false;
    const targetId = row.dataset.empRow;
    const dragId = ce._empDragId;
    ce._empDragId = null;
    ce.querySelectorAll('.epa-emp-sort-row').forEach((el) => el.classList.remove('dragging', 'drag-over'));
    if (!targetId || !dragId || targetId === dragId) return true;
    const employees = sortModeEmployees(ce, d);
    const from = employees.findIndex((emp) => emp.id === dragId);
    const to = employees.findIndex((emp) => emp.id === targetId);
    if (from < 0 || to < 0) return true;
    const next = employees.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    ce._empPendingOrder = next.map((emp) => emp.id);
    ce._empOrderDirty = true;
    ce.render();
    return true;
}
