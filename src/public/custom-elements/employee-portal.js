/**
 * Wix Custom Element: employee-portal
 * -----------------------------------
 * פורטל עובדים — הגשת זמינות חודשית + לוח אישי (Module A).
 *
 * הוראות התקנה בוויקס:
 * 1. בעורך: הוסף רכיב "Custom Element" (Embed > Custom Element).
 * 2. Tag Name: employee-portal (בדיוק).
 * 3. Source: קובץ זה (src/public/custom-elements/employee-portal.js).
 * 4. קוד העמוד: src/pages/employee-portal.js (מזין נתונים ומטפל בפעולות).
 *
 * תקשורת (כמו workshops-dashboard):
 * - קלט:  attribute בשם `portal-data` — JSON מ-getMyPortalData().
 * - קלט:  attribute בשם `action-result` — תוצאת פעולה (הצלחה/שגיאות ולידציה).
 * - פלט:  CustomEvent בשם `portal-action` עם detail = { type, payload }:
 *         refresh | submitAvailability { shifts } | withdrawAvailability { id }
 *
 * Light DOM (ללא Shadow DOM), מופע יחיד בעמוד. כל ה-CSS פנימי (ללא CDN).
 *
 * טאב ניהול (Module B): נטען מ-employee-portal-admin.js ומוצג רק לבעלי
 * הרשאת viewTeamSchedule. קלט נוסף: attribute בשם `admin-data`.
 */
import { ADMIN_STYLE, renderAdminTab, handleAdminClick, handleAdminChange } from './employee-portal-admin.js';

const EP_STYLE = `
employee-portal { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: linear-gradient(145deg,#f8fafc,#eff6ff); color: #1f2937; min-height: 100%; }
employee-portal * { box-sizing: border-box; }
.ep-wrap { width: 100%; max-width: none; margin: 0; padding: 18px 24px; }
.ep-header { background: rgba(255,255,255,.96); border: 1px solid #dbeafe; border-radius: 18px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; box-shadow: 0 8px 28px rgba(30,64,175,.07); }
.ep-user { display: flex; align-items: center; gap: 10px; }
.ep-avatar { width: 42px; height: 42px; border-radius: 13px; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; background: linear-gradient(135deg,#2563eb,#60a5fa); flex-shrink: 0; box-shadow: 0 5px 16px rgba(37,99,235,.22); }
.ep-user-name { font-weight: 700; font-size: 15px; }
.ep-user-role { font-size: 12px; color: #6b7280; }
.ep-tag { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #92400e; margin-inline-start: 6px; }
.ep-quota { display: flex; gap: 10px; flex-wrap: wrap; }
.ep-quota-chip { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 6px 12px; font-size: 12px; text-align: center; min-width: 110px; }
.ep-quota-chip b { display: block; font-size: 15px; }
.ep-quota-chip.met b { color: #059669; }
.ep-quota-chip.pending b { color: #d97706; }
.ep-banner { margin-top: 12px; border-radius: 12px; padding: 10px 14px; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.ep-banner.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.ep-banner.warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.ep-banner.closed { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.ep-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; margin-top: 16px; align-items: start; }
@media (max-width: 860px) { .ep-grid { grid-template-columns: 1fr; } }
.ep-card { background: rgba(255,255,255,.98); border: 1px solid #e2e8f0; border-radius: 17px; padding: 16px; box-shadow: 0 6px 22px rgba(15,23,42,.045); transition: box-shadow .18s ease,border-color .18s ease; }
.ep-card:hover { border-color: #dbeafe; box-shadow: 0 9px 26px rgba(30,64,175,.065); }
.ep-card h2 { margin: 0 0 10px; font-size: 15px; font-weight: 700; }
.ep-cal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.ep-cal-title { font-weight: 700; font-size: 15px; }
.ep-cal-nav { display: flex; gap: 6px; }
.ep-cal-nav button { border: 1px solid #dbeafe; background: #fff; color: #1d4ed8; border-radius: 9px; width: 30px; height: 30px; cursor: pointer; font-size: 14px; line-height: 1; transition: transform .14s,background .14s; }
.ep-cal-nav button:hover:not(:disabled) { transform: translateY(-1px); background: #eff6ff; }
.ep-cal-nav button:disabled { opacity: .35; cursor: default; }
.ep-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.ep-dow { text-align: center; font-size: 11px; color: #9ca3af; font-weight: 600; padding: 4px 0; }
.ep-day { position: relative; border: 1px solid #e5e7eb; border-radius: 10px; min-height: 84px; padding: 5px; font-size: 12px; cursor: pointer; background: #fff; text-align: right; transition: border-color .15s,background .15s,transform .15s,box-shadow .15s; }
.ep-day:hover:not(.disabled):not(.submitted) { border-color: #60a5fa; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(37,99,235,.09); }
.ep-day.other { visibility: hidden; }
.ep-day.disabled { background: #f9fafb; color: #c4c7cc; cursor: default; }
.ep-day.blocked { background: #fef2f2; color: #b91c1c; cursor: default; }
.ep-day.full { background: #f3f4f6; color: #6b7280; }
.ep-day.full.locked { cursor: default; }
.ep-day.promoted { border-color: #f59e0b; background: #fffbeb; }
.ep-day.selected { border-color: #2563eb; background: #eff6ff; box-shadow: inset 0 0 0 1px #2563eb; }
.ep-day.submitted { border-color: #d1d5db; background: #eef2ff; cursor: default; }
.ep-day.scheduled { border-color: #6ee7b7; background: #ecfdf5; cursor: default; }
.ep-day-num { font-weight: 700; }
.ep-day-ws { margin-top: 3px; display: flex; flex-direction: column; gap: 2px; }
.ep-day-ws span { display: block; font-size: 8.5px; line-height: 1.25; color: #1d4ed8; background: #eff6ff; border-radius: 4px; padding: 1px 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ep-day.ep-day-filtered { opacity: .28; filter: grayscale(.4); }
.ep-ws-filter { position: relative; margin-bottom: 10px; }
.ep-ws-filter-btn { border: 1px solid #dbeafe; background: #fff; color: #1d4ed8; border-radius: 9px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
.ep-ws-filter-btn.active { background: #eff6ff; border-color: #93c5fd; }
.ep-ws-filter-menu { position: absolute; z-index: 5; top: calc(100% + 4px); inset-inline-start: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 26px rgba(15,23,42,.12); padding: 8px; min-width: 220px; max-height: 260px; overflow-y: auto; }
.ep-ws-filter-opt { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 5px 6px; border-radius: 7px; cursor: pointer; }
.ep-ws-filter-opt:hover { background: #f8fafc; }
.ep-ws-filter-clear { width: 100%; margin-top: 6px; border: none; background: #fef2f2; color: #b91c1c; border-radius: 7px; padding: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.ep-day-badge { position: absolute; bottom: 4px; inset-inline-start: 5px; font-size: 9.5px; font-weight: 600; padding: 1px 5px; border-radius: 999px; }
.ep-badge-standby { background: #e0e7ff; color: #3730a3; }
.ep-badge-scheduled { background: #d1fae5; color: #065f46; }
.ep-badge-promoted { background: #fef3c7; color: #92400e; }
.ep-badge-full { background: #e5e7eb; color: #4b5563; }
.ep-badge-blocked { background: #fee2e2; color: #991b1b; }
.ep-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 11px; color: #6b7280; }
.ep-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ep-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.ep-sel-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ep-sel-head h2 { margin: 0; }
.ep-submit-btn.small { width: auto; margin-top: 0; padding: 8px 16px; font-size: 12.5px; border-radius: 9px; }
.ep-sel-list { display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow-y: auto; }
.ep-sel-row { display: flex; align-items: center; gap: 6px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 7px 9px; font-size: 12.5px; flex-wrap: nowrap; }
.ep-sel-date { font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ep-sel-row input[type="time"] { border: 1px solid #d1d5db; border-radius: 7px; padding: 3px 5px; font-size: 12px; font-family: inherit; width: 78px; }
.ep-sel-remove { border: none; background: none; color: #ef4444; cursor: pointer; font-size: 15px; padding: 2px 4px; }
.ep-sel-hours { font-size: 11px; color: #6b7280; min-width: 54px; text-align: center; }
.ep-sel-hours.bad { color: #dc2626; font-weight: 700; }
.ep-submit-btn { width: 100%; margin-top: 12px; background: linear-gradient(135deg,#2563eb,#1d4ed8); color: #fff; border: none; border-radius: 11px; padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 7px 17px rgba(37,99,235,.2); transition: transform .15s,box-shadow .15s,filter .15s; }
.ep-submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(37,99,235,.25); filter: brightness(.98); }
.ep-submit-btn:active:not(:disabled) { transform: translateY(0); }
.ep-submit-btn:disabled { background: #93c5fd; box-shadow: none; cursor: default; }
.ep-empty { color: #9ca3af; font-size: 12.5px; text-align: center; padding: 14px 0; }
.ep-board-item { border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; margin-bottom: 8px; font-size: 12.5px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ep-board-item .ep-b-date { font-weight: 700; }
.ep-board-item .ep-b-time { color: #6b7280; }
.ep-status { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
.ep-status.SUBMITTED { background: #e0e7ff; color: #3730a3; }
.ep-status.STANDBY { background: #fef3c7; color: #92400e; }
.ep-status.SCHEDULED { background: #d1fae5; color: #065f46; }
.ep-status.REJECTED { background: #fee2e2; color: #991b1b; }
.ep-status.PENDING { background: #f3f4f6; color: #6b7280; }
.ep-worktype { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; color: #4b5563; white-space: nowrap; }
.ep-status-guide { font-size: 11.5px; color: #6b7280; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; line-height: 1.55; }
.ep-status-guide b { color: #374151; font-weight: 700; }
.ep-edit-window-banner { margin-bottom: 12px; border-radius: 12px; padding: 10px 14px; font-size: 13px; background: #eff6ff; border: 1px solid #93c5fd; color: #1e3a8a; text-align: center; }
.ep-edit-window-banner b { font-variant-numeric: tabular-nums; color: #1d4ed8; font-size: 14.5px; }
.ep-board-item.auto-approved { border-color: #f59e0b; background: #fffbeb; box-shadow: 0 0 0 1px #f59e0b inset; }
.ep-lock-badge { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #92400e; white-space: nowrap; }
.ep-aa-item { border: 1px solid #fde68a; background: #fffbeb; border-radius: 10px; padding: 9px 11px; margin-bottom: 8px; font-size: 13px; display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.ep-aa-note { font-size: 12.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 10px 12px; margin-bottom: 4px; }
.ep-msg-card-title { margin: 0 0 10px; font-size: 15px; font-weight: 700; }
.ep-withdraw { border: 1px solid #fecaca; background: #fff; color: #b91c1c; border-radius: 8px; font-size: 11px; padding: 3px 9px; cursor: pointer; font-family: inherit; }
.ep-withdraw:hover { background: #fef2f2; }
.ep-swap-btn { border: 1px solid #c4b5fd; background: #f5f3ff; color: #5b21b6; border-radius: 8px; font-size: 11px; padding: 3px 9px; cursor: pointer; font-family: inherit; }
.ep-swap-btn:hover { background: #ede9fe; }
.ep-swap-pending { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #ede9fe; color: #5b21b6; white-space: nowrap; }
.ep-ws-card { border: 1px solid #d1fae5; background: #f0fdf9; border-radius: 12px; padding: 11px 13px; margin-bottom: 10px; font-size: 12.5px; }
.ep-ws-head { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 4px; }
.ep-ws-meta { color: #374151; margin-bottom: 4px; }
.ep-ws-notes { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 9px; margin-top: 6px; color: #92400e; }
.ep-ws-participants { margin: 6px 0 0; padding: 0 18px 0 0; color: #374151; }
.ep-toast { position: fixed; bottom: 22px; right: 50%; transform: translateX(50%); background: #111827; color: #fff; border-radius: 12px; padding: 11px 20px; font-size: 13.5px; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,.25); opacity: 0; pointer-events: none; transition: opacity .2s; max-width: 92vw; }
.ep-toast.show { opacity: 1; }
.ep-toast.error { background: #b91c1c; }
.ep-toast.success { background: #047857; }
.ep-loading, .ep-denied { text-align: center; padding: 60px 20px; color: #6b7280; font-size: 15px; }
.ep-denied { color: #b91c1c; }
.ep-spinner { width: 34px; height: 34px; border: 3px solid #dbeafe; border-top-color: #2563eb; border-radius: 50%; margin: 0 auto 14px; animation: ep-spin .8s linear infinite; }
@keyframes ep-spin { to { transform: rotate(360deg); } }
.ep-tabs { display: inline-flex; gap: 5px; margin-top: 14px; padding: 4px; border: 1px solid #dbeafe; border-radius: 13px; background: rgba(255,255,255,.85); }
.ep-tabbtn { border: 0; background: transparent; border-radius: 9px; padding: 8px 18px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; color: #64748b; transition: color .15s,background .15s,transform .15s,box-shadow .15s; }
.ep-tabbtn:hover { color: #1d4ed8; background: #eff6ff; }
.ep-tabbtn.active { background: linear-gradient(135deg,#2563eb,#1d4ed8); color: #fff; box-shadow: 0 5px 14px rgba(37,99,235,.2); }
.ep-busy { position: fixed; inset: 0; background: rgba(255,255,255,.65); z-index: 9998; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-size: 14px; color: #374151; font-weight: 600; backdrop-filter: blur(1px); }
.ep-day.waitlist { border-color: #fbbf24; background: #fffbeb; }
.ep-day.noskill { background: #f9fafb; color: #c4c7cc; cursor: default; }
.ep-day-hol { display: block; font-size: 8.5px; color: #b45309; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ep-badge-waitlist { background: #fef3c7; color: #92400e; }
.ep-badge-noskill { background: #f3f4f6; color: #9ca3af; }
.ep-offer { margin-top: 12px; border-radius: 12px; padding: 12px 14px; font-size: 13px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; border: 1px solid #fbbf24; background: #fffbeb; color: #92400e; }
.ep-offer.call { border-color: #93c5fd; background: #eff6ff; color: #1e40af; }
.ep-offer b { font-size: 13.5px; }
.ep-offer-btns { display: flex; gap: 6px; margin-inline-start: auto; }
.ep-offer-btns button { border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
.ep-offer-accept { background: #059669; color: #fff; }
.ep-offer-decline { background: #fff; color: #b91c1c; border-color: #fecaca !important; }
.ep-msg-card { border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
.ep-msg-card.system { border-color: #bfdbfe; background: #f5f9ff; }
.ep-msg-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-weight: 700; margin-bottom: 5px; }
.ep-msg-date { font-size: 11px; color: #9ca3af; font-weight: 400; white-space: nowrap; }
.ep-msg-body { font-size: 12.5px; color: #374151; white-space: pre-wrap; }
.ep-msg-exp { font-size: 10.5px; color: #b45309; margin-top: 7px; }
.ep-msg-car { touch-action: pan-y; }
.ep-msg-car-slide { animation: ep-msg-fade .35s ease; }
@keyframes ep-msg-fade { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
.ep-msg-car-nav { display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 4px; }
.ep-msg-car-arrow { border: 1px solid #dbeafe; background: #fff; color: #1d4ed8; border-radius: 8px; width: 26px; height: 26px; cursor: pointer; font-size: 14px; line-height: 1; transition: background .14s; }
.ep-msg-car-arrow:hover { background: #eff6ff; }
.ep-msg-car-dots { display: inline-flex; gap: 5px; }
.ep-msg-car-dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: #d1d5db; cursor: pointer; padding: 0; transition: background .15s, transform .15s; }
.ep-msg-car-dot.active { background: #2563eb; transform: scale(1.25); }
@media (max-width:700px) { .ep-wrap { padding: 12px; } .ep-tabs { display:flex; overflow-x:auto; } .ep-tabbtn { flex:1; white-space:nowrap; padding-inline:11px; } }
${ADMIN_STYLE}
`;

const HEBREW_DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
// Business hours for shift start/end pickers (mirrors backend/availabilityRules.js).
const SHIFT_MIN_TIME = '08:00';
const SHIFT_MAX_TIME = '23:59';
const STATUS_LABELS = {
    SUBMITTED: 'הוגש',
    STANDBY: 'בהמתנה',
    SCHEDULED: 'משובץ',
    REJECTED: 'נדחה',
    PENDING: 'טרם הוגש',
};
const STATUS_HINTS = {
    SUBMITTED: 'הגשת זמינות — ממתין לאישור מנהל/ת או לשיבוץ אוטומטי',
    STANDBY: 'היום מאויש — נמצא/ת ברשימת המתנה; ייתכן שיבוץ אם ייפנה מקום',
    SCHEDULED: 'המשמרת אושרה ואת/ה משובץ/ת ליום זה',
    REJECTED: 'המשמרת לא אושרה על ידי מנהל/ת',
    PENDING: 'ימים שבחרת בלוח — טרם נשלחו להגשה',
};

function pad2(n) { return String(n).padStart(2, '0'); }
function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
function monthTitle(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const name = new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(new Date(y, m - 1, 1));
    return `${name} ${y}`;
}
function formatDateHe(dateKey) {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(y, m - 1, d));
    return `${dow}, ${d}.${m}.${y}`;
}
function formatTimeHe(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function hoursBetween(start, end) {
    const p = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const s = p(start), e = p(end);
    if (s === null || e === null || e <= s) return null;
    return Math.round(((e - s) / 60) * 100) / 100;
}
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class EmployeePortal extends HTMLElement {
    static get observedAttributes() { return ['portal-data', 'action-result', 'admin-data', 'hours-data', 'templates-data', 'staff-data', 'team-time-data', 'messages-data', 'messages-admin-data', 'vacations-data']; }

    constructor() {
        super();
        this._data = null;
        this._viewMonth = null;                 // 'YYYY-MM' currently displayed
        this._selected = new Map();             // dateKey -> { startTime, endTime }
        this._submitting = false;
        this._lastResultTs = null;
        // Admin tab state (employee-portal-admin.js)
        this._tab = 'portal';
        this._adminData = null;
        this._adminMonth = todayKey().slice(0, 7);
        this._adminView = 'heat';
        this._adminSelectedDay = null;
        this._adminEditEmployeeId = null;
        this._adminPage = 'board';
        this._adminSidebarCollapsed = false;
        this._adminModal = null;
        this._templatesData = null;
        this._staffData = null;                 // Wix Bookings staff list (employees page)
        this._staffSearch = '';
        this._teamTimeData = null;              // Team time admin page
        this._teamTimeMonth = todayKey().slice(0, 7);
        this._teamTimeEmployee = null;
        this._messagesData = null;              // { personal: [...], system: [...] }
        this._messagesRequested = false;
        this._msgCarIdx = { personal: 0, system: 0 };  // carousel position per scope
        this._msgCarTimer = null;               // auto-rotate interval
        this._msgCarTouchX = null;              // swipe start X
        this._adminMessagesData = null;         // admin messages management list
        this._vacationsData = null;             // admin vacations management list
        this._workshopFilter = new Set();       // selected workshop-type ids for calendar filtering
        this._workshopFilterOpen = false;
        this._shiftSubTab = 'myShifts';         // 'myShifts' | 'mySubmissions' — internal sub-tab
        this._shiftModal = null;                // { type: 'edit'|'requestEdit'|'requestDelete'|'swap', submissionId }
        this._busy = null;                      // busy-overlay message while a mutation is in flight
        this._editWindowTimer = null;           // 1s ticker for the 30-min free-edit countdown
        this._autoApprovedPopup = null;         // shifts array shown right after an instant auto-approve
        this._swapCandidates = null;            // { submissionId, candidates: [{id,name}] } for the swap modal
        // Hours tab state (Module E)
        this._hoursData = null;
        this._hoursMonth = todayKey().slice(0, 7);
    }

    connectedCallback() {
        console.log('[employee-portal] CE connected (tag: employee-portal)');
        if (!document.getElementById('ep-style')) {
            const style = document.createElement('style');
            style.id = 'ep-style';
            style.textContent = EP_STYLE;
            document.head.appendChild(style);
        }
        this.renderLoading();
        // Event delegation for all dynamic content.
        this.addEventListener('click', (e) => this._onClick(e));
        this.addEventListener('change', (e) => this._onChange(e));
        // Swipe support for the messages carousel.
        this.addEventListener('touchstart', (e) => {
            if (e.target.closest('.ep-msg-car')) this._msgCarTouchX = e.touches[0]?.clientX ?? null;
        }, { passive: true });
        this.addEventListener('touchend', (e) => {
            const car = e.target.closest('.ep-msg-car');
            if (!car || this._msgCarTouchX === null) return;
            const dx = (e.changedTouches[0]?.clientX ?? this._msgCarTouchX) - this._msgCarTouchX;
            this._msgCarTouchX = null;
            if (Math.abs(dx) < 40) return;
            const scope = car.dataset.scope;
            const list = this._msgListFor(scope);
            if (list.length < 2) return;
            // RTL: swipe right = next, swipe left = previous.
            this._msgCarIdx[scope] = (this._msgCarIdx[scope] + (dx > 0 ? 1 : -1) + list.length) % list.length;
            this._updateMsgCar(scope);
        }, { passive: true });
    }

    disconnectedCallback() {
        clearInterval(this._msgCarTimer);
        clearInterval(this._editWindowTimer);
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        if (name === 'portal-data') {
            try {
                this._data = JSON.parse(newVal);
            } catch (err) {
                console.error('[employee-portal] bad portal-data JSON:', err);
                return;
            }
            this._submitting = false;
            this._busy = null;
            if (this._data?.error === 'ACCESS_DENIED') {
                console.warn('[employee-portal] access denied');
                this.renderDenied(); return;
            }
            if (this._data?.error === 'LOAD_FAILED') {
                console.error('[employee-portal] load failed:', this._data.message);
                this.renderLoadError(this._data.message);
                return;
            }
            console.log('[employee-portal] portal-data received', {
                user: this._data.user?.name,
                submissions: this._data.submissions?.length ?? 0,
                offers: this._data.myOffers?.length ?? 0,
                openCalls: this._data.openCalls?.length ?? 0,
                canAdmin: !!this._data.user?.permissions?.viewTeamSchedule,
            });
            if (!this._viewMonth && this._data?.months?.length) {
                // Default view: first future month if open, else current month.
                const future = this._data.months.find(m => !m.isCurrentMonth);
                this._viewMonth = (future || this._data.months[0]).monthKey;
            }
            if (!this._messagesRequested) {
                this._messagesRequested = true;
                this._dispatch('loadMyMessages');
            }
            this.render();
        }
        if (name === 'admin-data') {
            try {
                this._adminData = JSON.parse(newVal);
            } catch (err) {
                console.error('[employee-portal] bad admin-data JSON:', err);
                return;
            }
            this._busy = null;
            this._pendingWorkTypes = null;
            if (this._adminData?.monthKey) this._adminMonth = this._adminData.monthKey;
            console.log('[employee-portal] admin-data received', {
                month: this._adminData.monthKey,
                employees: this._adminData.employees?.length ?? 0,
                days: Object.keys(this._adminData.days || {}).length,
            });
            this.render();
        }
        if (name === 'hours-data') {
            try {
                this._hoursData = JSON.parse(newVal);
            } catch (err) {
                console.error('[employee-portal] bad hours-data JSON:', err);
                return;
            }
            this._busy = null;
            if (this._hoursData?.monthKey) this._hoursMonth = this._hoursData.monthKey;
            console.log('[employee-portal] hours-data received', {
                month: this._hoursData.monthKey,
                entries: this._hoursData.entries?.length ?? 0,
            });
            this.render();
        }
        if (name === 'templates-data') {
            try {
                this._templatesData = JSON.parse(newVal);
            } catch (err) {
                console.error('[employee-portal] bad templates-data JSON:', err);
                return;
            }
            this._busy = null;
            this.render();
        }
        if (name === 'staff-data') {
            try {
                const parsed = JSON.parse(newVal);
                this._staffData = parsed.staff || [];
            } catch (err) {
                console.error('[employee-portal] bad staff-data JSON:', err);
                return;
            }
            this._busy = null;
            this.render();
        }
        if (name === 'team-time-data') {
            try {
                this._teamTimeData = JSON.parse(newVal);
            } catch (err) {
                console.error('[employee-portal] bad team-time-data JSON:', err);
                return;
            }
            this._busy = null;
            if (this._teamTimeData?.monthKey) this._teamTimeMonth = this._teamTimeData.monthKey;
            this.render();
        }
        if (name === 'messages-data') {
            try {
                this._messagesData = JSON.parse(newVal);
            } catch (err) {
                console.error('[employee-portal] bad messages-data JSON:', err);
                return;
            }
            this._busy = null;
            this.render();
        }
        if (name === 'messages-admin-data') {
            try {
                const parsed = JSON.parse(newVal);
                this._adminMessagesData = parsed.messages || [];
            } catch (err) {
                console.error('[employee-portal] bad messages-admin-data JSON:', err);
                return;
            }
            this._busy = null;
            this.render();
        }
        if (name === 'vacations-data') {
            try {
                this._vacationsData = JSON.parse(newVal);
            } catch (err) {
                console.error('[employee-portal] bad vacations-data JSON:', err);
                return;
            }
            this._busy = null;
            this.render();
        }
        if (name === 'action-result') {
            try {
                const result = JSON.parse(newVal);
                if (result.__ts === this._lastResultTs) return;
                this._lastResultTs = result.__ts;
                this._handleActionResult(result);
            } catch (_) { /* ignore */ }
        }
    }

    _requestHoursData() {
        this._hoursData = null;
        this._dispatch('loadMyHours', { monthKey: this._hoursMonth });
        this.render();
    }

    _dispatch(type, payload) {
        console.log('[employee-portal] action →', type, payload ?? '');
        this.dispatchEvent(new CustomEvent('portal-action', { detail: { type, payload }, bubbles: true }));
    }

    _requestAdminData() {
        this._adminData = null;
        this._dispatch('adminLoad', { monthKey: this._adminMonth });
        this.render();
    }

    _startBusy(message) {
        this._busy = message || 'מעדכן…';
        this.render();
    }

    _handleActionResult(result) {
        this._submitting = false;
        this._busy = null;
        console.log('[employee-portal] action-result ←', result.type, result.error ? result.message : result);
        if (result.error) {
            if (result.type === 'adminTemplatesLoad') this._templatesData = [];
            if (result.type === 'adminStaffLoad') this._staffData = [];
            if (result.type === 'adminTeamTimeLoad') this._teamTimeData = { employees: [], monthKey: this._teamTimeMonth };
            if (result.type === 'loadMyMessages') this._messagesData = { personal: [], system: [] };
            if (result.type === 'adminMessagesLoad') this._adminMessagesData = [];
            if (result.type === 'adminVacationsLoad') this._vacationsData = [];
            if (result.type === 'loadSwapCandidates') { this._shiftModal = null; this._swapCandidates = null; }
            this._toast(result.message || 'אירעה שגיאה. נסו שוב.', 'error');
            this.render();
            return;
        }
        if (result.type === 'loadSwapCandidates') {
            if (this._shiftModal?.type === 'swap') {
                this._swapCandidates = result.candidates || [];
                this.render();
            }
            return;
        }
        if (result.type === 'adminTeamTimeExport' && result.csv) {
            try {
                const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename || `hours-${this._teamTimeMonth}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (_) { /* ignore */ }
        }
        if (result.type === 'submitAvailability') {
            if (result.ok) {
                this._selected.clear();
                const standbyNote = result.standby
                    ? ` ${result.standby} מהן נכנסו לרשימת המתנה (הימים מאוישים).`
                    : '';
                const autoNote = result.autoApproved?.length
                    ? ` ${result.autoApproved.length} מהן אושרו אוטומטית מול הזמנת לקוח קיימת! 🎉`
                    : '';
                this._toast(`הזמינות הוגשה בהצלחה (${result.inserted} משמרות).${standbyNote}${autoNote}`, 'success');
                if (result.autoApproved?.length) {
                    this._autoApprovedPopup = result.autoApproved;
                }
            } else {
                const msgs = (result.errors || []).map(e => e.message).filter(Boolean);
                this._toast(msgs[0] || 'ההגשה נדחתה — בדקו את הכללים.', 'error');
                this.render();
            }
        }
        if (result.type === 'withdrawAvailability' && result.ok) {
            this._toast('הזמינות בוטלה.', 'success');
        }
        if (result.type === 'updateSubmission' && result.ok) {
            this._toast('המשמרת עודכנה בהצלחה.', 'success');
        }
        if (result.type === 'requestShiftChange' && result.ok) {
            this._toast('הבקשה נשלחה למנהל/ת ותטופל בקרוב.', 'success');
        }
        if (result.type === 'acknowledgeShiftRequest' && result.ok) {
            this._toast('הבנתי.', 'success');
        }
        if (result.type === 'createSwapRequest' && result.ok) {
            this._shiftModal = null;
            this._swapCandidates = null;
            this._toast('בקשת ההחלפה נשלחה — ממתינים לאישור העובד/ת שנבחר/ה.', 'success');
        }
        if (result.type === 'acknowledgeShiftSwap' && result.ok) {
            this._toast('הבנתי.', 'success');
        }
        if (result.type === 'respondToOffer' && result.ok) {
            this._toast(result.accepted ? 'המשמרת שובצה לך! 🎉' : 'ההצעה נדחתה.', 'success');
        }
        if (result.type === 'claimOpenCall' && result.ok) {
            this._toast('המשמרת נתפסה ושובצה לך! 🎉', 'success');
        }
        if (result.type === 'approveMyMonth' && result.ok) {
            this._toast('השעות אושרו בהצלחה. תודה!', 'success');
        }
        if (result.type === 'adminSaveEmployee' && result.ok) {
            this._adminModal = null;
            this._toast('פרטי העובד/ת נשמרו בהצלחה.', 'success');
            this.render();
            return;
        }
        if (result.type?.startsWith('admin') && result.ok) {
            this._toast('הפעולה בוצעה בהצלחה.', 'success');
        }
        this.render();
    }

    // -----------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------

    renderLoading() {
        this.innerHTML = `<div class="ep-wrap"><div class="ep-loading"><div class="ep-spinner"></div>טוען את הפורטל האישי…</div></div>`;
    }

    renderDenied() {
        this.innerHTML = `<div class="ep-wrap"><div class="ep-denied">אין לך הרשאה לפורטל העובדים.<br>יש לפנות למנהל/ת הסטודיו.</div></div>`;
    }

    renderLoadError(message) {
        this.innerHTML = `<div class="ep-wrap"><div class="ep-denied">
            שגיאה בטעינת הפורטל.<br>
            <span style="font-size:12px;font-weight:400;color:#6b7280;margin-top:8px;display:block">${escapeHtml(message || 'לא ידוע')}</span>
            <span style="font-size:11px;color:#9ca3af;margin-top:6px;display:block">פתח את הקונסול (F12) וחפש [employee-portal]</span>
        </div></div>`;
    }

    render() {
        const d = this._data;
        if (!d?.user) { this.renderLoading(); return; }

        const isAdmin = !!d.user.permissions?.viewTeamSchedule;
        const tabs = `
            <div class="ep-tabs">
                <button class="ep-tabbtn ${this._tab === 'portal' ? 'active' : ''}" data-action="tab-portal">הפורטל שלי</button>
                <button class="ep-tabbtn ${this._tab === 'hours' ? 'active' : ''}" data-action="tab-hours">השעות שלי</button>
                ${isAdmin ? `<button class="ep-tabbtn ${this._tab === 'admin' ? 'active' : ''}" data-action="tab-admin">ניהול צוות</button>` : ''}
            </div>`;

        const portalTab = `
            ${this._renderOffers()}
            <div class="ep-grid">
                <div>
                    <div class="ep-card">${this._renderCalendar()}</div>
                    <div class="ep-card" style="margin-top:16px">${this._renderShiftsCard()}</div>
                    <div class="ep-card" style="margin-top:16px">${this._renderSelectionPanel()}</div>
                </div>
                <div>
                    <div class="ep-card">${this._renderMessageCard('personal', 'הודעות אישיות')}</div>
                    <div class="ep-card" style="margin-top:16px">${this._renderMessageCard('system', 'הודעות מערכת')}</div>
                    <div class="ep-card" style="margin-top:16px">${this._renderScheduledWorkshops()}</div>
                </div>
            </div>`;

        let tabContent;
        if (this._tab === 'admin' && isAdmin) {
            tabContent = `<div style="margin-top:12px">${renderAdminTab(this)}</div>`;
        } else if (this._tab === 'hours') {
            tabContent = `<div style="margin-top:12px">${this._renderHoursTab()}</div>`;
        } else {
            tabContent = portalTab;
        }

        this.innerHTML = `
            <div class="ep-wrap">
                ${this._renderHeader()}
                ${tabs}
                ${tabContent}
            </div>
            ${this._busy ? `<div class="ep-busy"><div class="ep-spinner"></div>${escapeHtml(this._busy)}</div>` : ''}
            ${this._shiftModal ? this._renderShiftModal() : ''}
            ${this._autoApprovedPopup ? this._renderAutoApprovedPopup() : ''}
            <div class="ep-toast" id="epToast"></div>
        `;
        this._restoreToast();
        this._setupMsgCarousel();
        this._setupEditWindowTimer();
    }

    /** "השעות שלי" — monthly time-clock history + approval (Module E). */
    _renderHoursTab() {
        const h = this._hoursData;
        if (!h) {
            return `<div class="ep-card"><div class="ep-loading"><div class="ep-spinner"></div>טוען את השעות…</div></div>`;
        }

        const totals = h.totals || {};
        const chips = [
            { label: 'סה"כ', value: totals.total },
            { label: 'סטודיו', value: totals.STUDIO },
            { label: 'הדרכה', value: totals.INSTRUCTION },
            { label: 'צמר', value: totals.WOOL },
        ].map(c => `<div class="ep-quota-chip"><b>${c.value || 0}</b>${c.label}</div>`).join('');

        const rows = (h.entries || []).map(e => `
            <div class="ep-board-item">
                <div>
                    <div class="ep-b-date">${formatDateHe(e.dateKey)}</div>
                    <div class="ep-b-time">${escapeHtml(e.taskLabel)} · ${formatTimeHe(e.startTime)}–${e.endTime ? formatTimeHe(e.endTime) : 'פתוח'}</div>
                </div>
                <span class="ep-status ${e.open ? 'SUBMITTED' : 'SCHEDULED'}">${e.open ? 'פתוח' : `${e.hours} ש׳`}</span>
            </div>`).join('');

        let approval = '';
        if (h.approved) {
            approval = `<div class="ep-banner info">✔ השעות לחודש זה אושרו${h.approvedAt ? ` (${formatDateHe(String(h.approvedAt).slice(0, 10))})` : ''}.</div>`;
        } else if (h.approvalWindowOpen) {
            approval = `
                <div class="ep-banner warn">חלון אישור השעות החודשי פתוח — נא לעבור על הרישומים ולאשר.</div>
                <button class="ep-submit-btn" data-action="hours-approve" data-month="${escapeHtml(h.monthKey)}">אישור השעות לחודש ${monthTitle(h.monthKey)}</button>`;
        }

        return `
            <div class="ep-card">
                <div class="ep-cal-head">
                    <div class="ep-cal-title">שעות עבודה — ${monthTitle(h.monthKey)}</div>
                    <div class="ep-cal-nav">
                        <button data-action="hours-month-next" title="חודש הבא">&#8249;</button>
                        <button data-action="hours-month-prev" title="חודש קודם">&#8250;</button>
                    </div>
                </div>
                <div class="ep-quota" style="margin-bottom:12px">${chips}</div>
                ${rows || '<div class="ep-empty">אין רישומי שעות לחודש זה</div>'}
                ${approval}
            </div>`;
    }

    /** Separate card per message scope (personal / system). */
    _renderMessageCard(scope, title) {
        return `<h2 class="ep-msg-card-title">${escapeHtml(title)}</h2>${this._renderMessagesTab(scope)}`;
    }

    _renderStatusGuide() {
        const items = [
            { key: 'SUBMITTED', show: true },
            { key: 'STANDBY', show: true },
            { key: 'SCHEDULED', show: true },
            { key: 'PENDING', show: true },
        ];
        return `<div class="ep-status-guide">${items.map(({ key }) =>
            `<div><b>${STATUS_LABELS[key]}:</b> ${STATUS_HINTS[key]}</div>`).join('')}</div>`;
    }

    _renderMessagesTab(scope) {
        const list = this._msgListFor(scope);
        if (!this._messagesData && !list.length) {
            return `<div class="ep-loading"><div class="ep-spinner"></div>טוען הודעות…</div>`;
        }
        if (!list.length) {
            return `<div class="ep-empty">אין הודעות כרגע</div>`;
        }
        if (list.length === 1) {
            return this._renderMsgCard(list[0], scope);
        }
        return `<div class="ep-msg-car" id="epMsgCar-${scope}" data-scope="${scope}">${this._msgCarInner(scope, list)}</div>`;
    }

    /** Portal-generated notices merged into the personal/system message cards. */
    _buildDynamicMessages() {
        const rules = this._data?.rules || {};
        const personal = [];
        const system = [];
        const viewInfo = this._monthInfo(this._viewMonth);

        if (viewInfo && !viewInfo.isCurrentMonth && viewInfo.deadline) {
            const dl = new Date(viewInfo.deadline);
            const daysLeft = Math.ceil((dl.getTime() - Date.now()) / 86400000);
            if (viewInfo.open) {
                system.push({
                    id: `dyn-deadline-${viewInfo.monthKey}`,
                    title: 'מועד אחרון להגשת זמינות',
                    body: `⏰ המועד האחרון להגשת זמינות ל${monthTitle(viewInfo.monthKey)}: ${formatDateHe(viewInfo.deadline.slice(0, 10))}${daysLeft >= 0 ? ` (עוד ${daysLeft} ימים)` : ''}`,
                });
            } else {
                system.push({
                    id: `dyn-deadline-closed-${viewInfo.monthKey}`,
                    title: 'מועד ההגשה עבר',
                    body: `🔒 חלף המועד האחרון להגשת זמינות ל${monthTitle(viewInfo.monthKey)}. לחריגים יש לפנות למנהל/ת.`,
                });
            }
        }

        system.push({
            id: 'dyn-rules',
            title: 'כללי הגשת זמינות',
            body: `📋 מינימום ${rules.requiredShiftsPerWeek} משמרות בשבוע, אורך משמרת מינימלי ${rules.minShiftHours} שעות. שעות פעילות: ${rules.shiftMinTime}–${rules.shiftMaxTime}.`,
        });

        if (viewInfo?.isCurrentMonth) {
            personal.push({
                id: `dyn-bonus-${viewInfo.monthKey}`,
                title: 'משמרות נוספות לחודש הנוכחי',
                body: viewInfo.quota.bonusUnlocked
                    ? '🎉 השלמת את המכסה השבועית — ניתן להגיש משמרות נוספות לחודש הנוכחי.'
                    : 'הגשת משמרות נוספות לחודש הנוכחי נפתחת לאחר השלמת המכסה השבועית של אותו שבוע.',
            });
        }

        if (viewInfo && !viewInfo.quota.met) {
            const unmetWeeks = (viewInfo.quota.weeks || []).filter(w => !w.met);
            if (unmetWeeks.length) {
                const list = unmetWeeks.map(w => `${formatDateHe(w.weekStart)}–${formatDateHe(w.weekEnd)} (${w.submitted}/${w.required})`).join(', ');
                personal.push({
                    id: `dyn-quota-${viewInfo.monthKey}`,
                    title: 'מכסה שבועית',
                    body: `⚠️ לא עמדת במכסה השבועית עבור: ${list}.`,
                });
            }
        }

        if (viewInfo?.weekend && !viewInfo.weekend.met) {
            const parts = [];
            if (!viewInfo.weekend.fridays.met) parts.push(`ימי שישי: ${viewInfo.weekend.fridays.submitted}/${viewInfo.weekend.fridays.required}`);
            if (!viewInfo.weekend.saturdays.met) parts.push(`ימי שבת: ${viewInfo.weekend.saturdays.submitted}/${viewInfo.weekend.saturdays.required}`);
            personal.push({
                id: `dyn-weekend-${viewInfo.monthKey}`,
                title: 'דרישת סופ"ש',
                body: `⚠️ טרם מולאה דרישת סופ"ש ל${monthTitle(viewInfo.monthKey)} — ${parts.join(', ')}.`,
            });
        }

        return { personal, system };
    }

    _renderMsgCard(msg, scope) {
        return `
            <div class="ep-msg-card ${scope === 'system' ? 'system' : ''}">
                <div class="ep-msg-head">
                    <span>${escapeHtml(msg.title)}</span>
                    <span class="ep-msg-date">${msg.createdAt ? formatDateHe(String(msg.createdAt).slice(0, 10)) : ''}</span>
                </div>
                <div class="ep-msg-body">${escapeHtml(msg.body)}</div>
                ${msg.expiresAt ? `<div class="ep-msg-exp">בתוקף עד ${formatDateHe(String(msg.expiresAt).slice(0, 10))}</div>` : ''}
            </div>`;
    }

    _msgCarInner(scope, list) {
        const idx = ((this._msgCarIdx[scope] || 0) % list.length + list.length) % list.length;
        this._msgCarIdx[scope] = idx;
        const dots = list.map((_, i) =>
            `<button class="ep-msg-car-dot ${i === idx ? 'active' : ''}" data-action="msg-car-dot" data-scope="${scope}" data-idx="${i}" aria-label="הודעה ${i + 1}"></button>`).join('');
        return `
            <div class="ep-msg-car-slide">${this._renderMsgCard(list[idx], scope)}</div>
            <div class="ep-msg-car-nav">
                <button class="ep-msg-car-arrow" data-action="msg-car-next" data-scope="${scope}" title="ההודעה הבאה">&#8249;</button>
                <span class="ep-msg-car-dots">${dots}</span>
                <button class="ep-msg-car-arrow" data-action="msg-car-prev" data-scope="${scope}" title="ההודעה הקודמת">&#8250;</button>
            </div>`;
    }

    _msgListFor(scope) {
        const dyn = this._buildDynamicMessages();
        const dynamic = scope === 'personal' ? dyn.personal : dyn.system;
        const m = this._messagesData;
        const cms = m ? (scope === 'personal' ? (m.personal || []) : (m.system || [])) : [];
        return [...dynamic, ...cms];
    }

    /** Targeted DOM update — avoids a full re-render (which would wipe open inputs). */
    _updateMsgCar(scope) {
        const el = this.querySelector(`#epMsgCar-${scope}`);
        if (!el) return;
        const list = this._msgListFor(scope);
        if (list.length < 2) return;
        el.innerHTML = this._msgCarInner(scope, list);
    }

    _setupMsgCarousel() {
        clearInterval(this._msgCarTimer);
        const hasCarousel = this.querySelector('.ep-msg-car');
        if (!hasCarousel) return;
        this._msgCarTimer = setInterval(() => {
            for (const scope of ['personal', 'system']) {
                const el = this.querySelector(`#epMsgCar-${scope}`);
                if (!el) continue;
                const list = this._msgListFor(scope);
                if (list.length < 2) continue;
                this._msgCarIdx[scope] = (this._msgCarIdx[scope] + 1) % list.length;
                this._updateMsgCar(scope);
            }
        }, 6000);
    }

    /** Waiting-list offers addressed to me + open calls matching my skills. */
    _renderOffers() {
        const offers = this._data.myOffers || [];
        const calls = this._data.openCalls || [];
        let html = '';
        for (const o of offers) {
            html += `<div class="ep-offer">
                <span>⏳ <b>הצעת משמרת מרשימת ההמתנה:</b> סדנת ${escapeHtml(o.workshopName)} · ${formatDateHe(o.date)}${o.expiresAt ? ` (בתוקף עד ${formatTimeHe(o.expiresAt)})` : ''}</span>
                <span class="ep-offer-btns">
                    <button class="ep-offer-accept" data-action="offer-accept" data-id="${escapeHtml(o.id)}">אישור המשמרת</button>
                    <button class="ep-offer-decline" data-action="offer-decline" data-id="${escapeHtml(o.id)}">לא מתאים לי</button>
                </span>
            </div>`;
        }
        for (const c of calls) {
            html += `<div class="ep-offer call">
                <span>📣 <b>דרושה עובד/ת:</b> סדנת ${escapeHtml(c.workshopName)} · ${formatDateHe(c.date)} — כל הקודם/ת זוכה!</span>
                <span class="ep-offer-btns">
                    <button class="ep-offer-accept" data-action="call-claim" data-id="${escapeHtml(c.id)}">אני זמין/ה — שבצו אותי</button>
                </span>
            </div>`;
        }
        return html;
    }

    /** Re-shows an active toast after a full re-render (data refresh) wipes the DOM. */
    _restoreToast() {
        if (!this._pendingToast || Date.now() > this._pendingToast.expiry) return;
        const toast = this.querySelector('#epToast');
        if (!toast) return;
        toast.textContent = this._pendingToast.message;
        toast.className = `ep-toast show ${this._pendingToast.kind || ''}`;
    }

    _renderHeader() {
        const u = this._data.user;
        const initials = (u.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
        const avatarStyle = u.color ? `style="background:${escapeHtml(u.color)}"` : '';
        const chips = (this._data.months || []).map(m => {
            const weeksTitle = (m.quota.weeks || [])
                .map((w, i) => `שבוע ${i + 1}: ${w.submitted}/${w.required}${w.met ? ' ✓' : ''}`)
                .join(' · ');
            return `
            <div class="ep-quota-chip ${m.quota.met ? 'met' : 'pending'}" title="${escapeHtml(weeksTitle)}">
                ${monthTitle(m.monthKey)}
                <b>${m.quota.submitted}/${m.quota.required}</b>
                ${m.quota.met ? 'המכסה השבועית הושלמה ✓' : 'משמרות שהוגשו (שבועי)'}
            </div>`;
        }).join('');
        return `
            <div class="ep-header">
                <div class="ep-user">
                    <div class="ep-avatar" ${avatarStyle}>${escapeHtml(initials)}</div>
                    <div>
                        <div class="ep-user-name">${escapeHtml(u.name || '')}${u.isTrainee ? '<span class="ep-tag">חניכה</span>' : ''}</div>
                        <div class="ep-user-role">${escapeHtml(u.roleLabel || '')}</div>
                    </div>
                </div>
                <div class="ep-quota">${chips}</div>
            </div>`;
    }

    _monthInfo(monthKey) {
        return (this._data.months || []).find(m => m.monthKey === monthKey) || null;
    }

    _submissionByDate() {
        const map = {};
        for (const s of (this._data.submissions || [])) map[s.date] = s;
        return map;
    }

    _renderWorkshopFilter() {
        const types = this._data.allWorkshopTypes || [];
        if (!types.length) return '';
        const filter = this._workshopFilter || new Set();
        const activeCount = filter.size;
        const label = activeCount ? `סינון סדנאות (${activeCount})` : 'סינון סדנאות';
        const options = types.map(t => `
            <label class="ep-ws-filter-opt">
                <input type="checkbox" data-action="toggle-ws-filter" data-ws-id="${escapeHtml(t.id)}" ${filter.has(t.id) ? 'checked' : ''}>
                <span>${escapeHtml(t.name)}</span>
            </label>`).join('');
        return `
            <div class="ep-ws-filter">
                <button type="button" class="ep-ws-filter-btn ${activeCount ? 'active' : ''}" data-action="toggle-ws-filter-menu">
                    ${label} ${this._workshopFilterOpen ? '▲' : '▼'}
                </button>
                ${this._workshopFilterOpen ? `
                    <div class="ep-ws-filter-menu">
                        ${options}
                        ${activeCount ? `<button type="button" class="ep-ws-filter-clear" data-action="clear-ws-filter">נקה סינון</button>` : ''}
                    </div>` : ''}
            </div>`;
    }

    _renderCalendar() {
        const months = (this._data.months || []).map(m => m.monthKey);
        const idx = months.indexOf(this._viewMonth);
        const rules = this._data.rules || {};
        const subByDate = this._submissionByDate();
        const viewInfo = this._monthInfo(this._viewMonth);
        const tKey = todayKey();

        const [y, m] = this._viewMonth.split('-').map(Number);
        const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sunday, matches RTL Hebrew week
        const daysInMonth = new Date(y, m, 0).getDate();

        let cells = HEBREW_DOW.map(d => `<div class="ep-dow">${d}</div>`).join('');
        for (let i = 0; i < firstDow; i++) cells += `<div class="ep-day other"></div>`;

        const holidayByDate = {};
        for (const h of (this._data.holidays || [])) holidayByDate[h.date] = h.name || 'חג';

        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${this._viewMonth}-${pad2(day)}`;
            const sub = subByDate[dateKey];
            const isPast = dateKey <= tKey;
            const blocked = (rules.blockedDates || []).includes(dateKey);
            const full = (rules.fullDates || []).includes(dateKey);
            const promoted = (rules.promotedDates || []).includes(dateKey);
            const quotaMet = !!viewInfo?.quota?.bonusUnlocked;
            const monthOpen = !!viewInfo?.open;
            const fullLocked = full && !quotaMet;
            const selected = this._selected.has(dateKey);
            // Personalized per-skill state from the scheduling engine.
            const skillState = this._data.dayStates?.[dateKey]?.state || null;

            let cls = 'ep-day', badge = '', clickable = false;
            if (isPast) cls += ' disabled';
            else if (sub) {
                cls += sub.status === 'SCHEDULED' ? ' scheduled' : ' submitted';
                if (sub.status === 'SCHEDULED') {
                    badge = `<span class="ep-day-badge ep-badge-scheduled">משובץ</span>`;
                } else if (sub.status === 'STANDBY') {
                    badge = `<span class="ep-day-badge ep-badge-waitlist">בהמתנה</span>`;
                } else {
                    badge = `<span class="ep-day-badge ep-badge-standby">הוגש</span>`;
                }
            } else if (blocked) {
                cls += ' blocked';
                badge = `<span class="ep-day-badge ep-badge-blocked">חסום</span>`;
            } else if (!monthOpen) {
                cls += ' disabled';
            } else if (skillState === 'NO_SKILL') {
                cls += ' noskill';
                badge = `<span class="ep-day-badge ep-badge-noskill">לא בהכשרה</span>`;
            } else if (fullLocked) {
                cls += ' full locked';
                badge = `<span class="ep-day-badge ep-badge-full">מאויש</span>`;
            } else if (skillState === 'WAITLIST') {
                clickable = true;
                cls += ' waitlist';
                badge = `<span class="ep-day-badge ep-badge-waitlist">רשימת המתנה</span>`;
                if (selected) cls += ' selected';
            } else {
                clickable = true;
                if (full) { cls += ' full'; badge = `<span class="ep-day-badge ep-badge-full">מאויש</span>`; }
                if (promoted) { cls += ' promoted'; badge = `<span class="ep-day-badge ep-badge-promoted">דרושים ⭐</span>`; }
                if (selected) cls += ' selected';
            }

            const dayWorkshops = this._data.dayStates?.[dateKey]?.workshops || [];
            const wsList = dayWorkshops.length
                ? `<div class="ep-day-ws">${dayWorkshops.map(w => {
                    const times = (w.times || []).map(t => formatTimeHe(t)).filter(Boolean);
                    const countLabel = times.length > 1 ? ` ×${times.length}` : '';
                    const timesLabel = times.length ? ` — ${times.join(', ')}` : '';
                    return `<span>${escapeHtml(w.name)}${countLabel}${timesLabel}</span>`;
                }).join('')}</div>`
                : '';
            const filterActive = this._workshopFilter && this._workshopFilter.size > 0;
            if (filterActive && !dayWorkshops.some(w => this._workshopFilter.has(w.id))) cls += ' ep-day-filtered';

            cells += `<div class="${cls}" ${clickable ? `data-action="toggle-day" data-date="${dateKey}"` : ''}>
                <span class="ep-day-num">${day}</span>
                ${holidayByDate[dateKey] ? `<span class="ep-day-hol">${escapeHtml(holidayByDate[dateKey])}</span>` : ''}
                ${wsList}
                ${badge}
            </div>`;
        }

        return `
            <div class="ep-cal-head">
                <div class="ep-cal-title">${monthTitle(this._viewMonth)}</div>
                <div class="ep-cal-nav">
                    <button data-action="month-next" ${idx >= months.length - 1 ? 'disabled' : ''} title="חודש הבא">&#8249;</button>
                    <button data-action="month-prev" ${idx <= 0 ? 'disabled' : ''} title="חודש קודם">&#8250;</button>
                </div>
            </div>
            ${this._renderWorkshopFilter()}
            <div class="ep-cal-grid">${cells}</div>
            <div class="ep-legend">
                <span><span class="ep-dot" style="background:#eff6ff;border:1px solid #2563eb"></span>נבחר</span>
                <span><span class="ep-dot" style="background:#eef2ff"></span>המתנה</span>
                <span><span class="ep-dot" style="background:#ecfdf5;border:1px solid #6ee7b7"></span>משובץ</span>
                <span><span class="ep-dot" style="background:#fffbeb;border:1px solid #f59e0b"></span>דרושים עובדים</span>
                <span><span class="ep-dot" style="background:#fffbeb;border:1px solid #fbbf24"></span>רשימת המתנה</span>
                <span><span class="ep-dot" style="background:#f9fafb;border:1px solid #e5e7eb"></span>לא בהכשרה</span>
                <span><span class="ep-dot" style="background:#fef2f2"></span>חסום</span>
            </div>`;
    }

    _renderSelectionPanel() {
        const rules = this._data.rules || {};
        const entries = [...this._selected.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        let rows;
        if (!entries.length) {
            rows = `<div class="ep-empty">בחרו ימים בלוח השנה להגשת זמינות</div>`;
        } else {
            rows = `<div class="ep-sel-list">` + entries.map(([dateKey, times]) => {
                const hrs = hoursBetween(times.startTime, times.endTime);
                const tooShort = hrs !== null && hrs < rules.minShiftHours;
                const hoursLabel = hrs === null ? '—' : `${hrs} ש׳`;
                return `<div class="ep-sel-row">
                    <span class="ep-sel-date">${formatDateHe(dateKey)}</span>
                    <input type="time" min="${SHIFT_MIN_TIME}" max="${SHIFT_MAX_TIME}" data-role="start" data-date="${dateKey}" value="${escapeHtml(times.startTime)}">
                    <span>-</span>
                    <input type="time" min="${SHIFT_MIN_TIME}" max="${SHIFT_MAX_TIME}" data-role="end" data-date="${dateKey}" value="${escapeHtml(times.endTime)}">
                    <span class="ep-sel-hours ${tooShort || hrs === null ? 'bad' : ''}">${hoursLabel}</span>
                    <span class="ep-status PENDING" title="${escapeHtml(STATUS_HINTS.PENDING)}">${STATUS_LABELS.PENDING}</span>
                    <button class="ep-sel-remove" data-action="remove-day" data-date="${dateKey}" title="הסרה">✕</button>
                </div>`;
            }).join('') + `</div>`;
        }
        const invalid = entries.some(([, t]) => {
            const hrs = hoursBetween(t.startTime, t.endTime);
            return hrs === null || hrs < rules.minShiftHours;
        });
        return `
            <div class="ep-sel-head">
                <h2>הגשת זמינות (${entries.length})</h2>
                <button class="ep-submit-btn small" data-action="submit" ${(!entries.length || invalid || this._submitting) ? 'disabled' : ''}>
                    ${this._submitting ? 'שולח…' : 'הגשת זמינות'}
                </button>
            </div>
            ${rows}
            ${invalid ? `<div class="ep-banner warn" style="margin-top:8px">יש משמרות קצרות מהמינימום (${rules.minShiftHours} שעות) או עם שעות שגויות.</div>` : ''}`;
    }

    /** "המשמרות שלי" (SCHEDULED+STANDBY) / "ההגשות שלי" (SUBMITTED) — internal tabs. */
    _renderShiftsCard() {
        const subTab = this._shiftSubTab === 'mySubmissions' ? 'mySubmissions' : 'myShifts';
        const subs = (this._data.submissions || []).filter(s => s.status !== 'REJECTED');
        const myShifts = subs.filter(s => s.status === 'SCHEDULED' || s.status === 'STANDBY');
        const mySubmissions = subs.filter(s => s.status === 'SUBMITTED');
        const list = subTab === 'mySubmissions' ? mySubmissions : myShifts;

        const pendingBySubmission = {};
        for (const r of (this._data.changeRequests || [])) {
            if (r.status === 'PENDING') pendingBySubmission[r.submissionId] = r;
        }
        const decided = (this._data.changeRequests || []).filter(r => r.status !== 'PENDING');

        const pendingSwapBySubmission = {};
        const decidedSwaps = [];
        for (const sw of (this._data.mySwapRequests || [])) {
            if (sw.status === 'PENDING_EMPLOYEE' || sw.status === 'PENDING_MANAGER') {
                pendingSwapBySubmission[sw.submissionId] = sw;
            } else {
                decidedSwaps.push(sw);
            }
        }

        const rows = list.length
            ? list.map(s => this._renderShiftRow(s, pendingBySubmission[s.id], pendingSwapBySubmission[s.id])).join('')
            : `<div class="ep-empty">${subTab === 'mySubmissions' ? 'אין הגשות בהמתנה לאישור' : 'אין משמרות משובצות'}</div>`;

        const decidedBanners = decided.map(r => `
            <div class="ep-banner ${r.status === 'APPROVED' ? 'info' : 'closed'}" style="align-items:flex-start">
                <div style="flex:1">
                    בקשתך ל${r.type === 'DELETE' ? 'מחיקת' : 'שינוי'} המשמרת בתאריך ${formatDateHe(r.originalDate)} ${r.status === 'APPROVED' ? 'אושרה ✔' : 'נדחתה ✕'}.
                    ${r.managerComment ? `<div style="margin-top:4px;font-weight:600">הערת מנהל/ת: ${escapeHtml(r.managerComment)}</div>` : ''}
                </div>
                <button class="ep-withdraw" data-action="ack-request" data-id="${escapeHtml(r.id)}">הבנתי</button>
            </div>`).join('')
            + decidedSwaps.map(sw => `
            <div class="ep-banner ${sw.status === 'APPROVED' ? 'info' : 'closed'}" style="align-items:flex-start">
                <div style="flex:1">
                    בקשת ההחלפה שלך עם ${escapeHtml(sw.targetEmployeeName || 'עובד/ת')} למשמרת בתאריך ${formatDateHe(sw.dateKey)}
                    ${sw.status === 'APPROVED' ? 'אושרה ובוצעה ✔' : sw.status === 'EMPLOYEE_DECLINED' ? `נדחתה על ידי ${escapeHtml(sw.targetEmployeeName || 'העובד/ת')} ✕` : 'נדחתה ✕'}.
                    ${sw.managerComment ? `<div style="margin-top:4px;font-weight:600">הערת מנהל/ת: ${escapeHtml(sw.managerComment)}</div>` : ''}
                </div>
                <button class="ep-withdraw" data-action="ack-swap" data-id="${escapeHtml(sw.id)}">הבנתי</button>
            </div>`).join('');

        return `
            <div class="ep-tabs" style="margin-top:0">
                <button class="ep-tabbtn ${subTab === 'myShifts' ? 'active' : ''}" data-action="subtab-myshifts">המשמרות שלי (${myShifts.length})</button>
                <button class="ep-tabbtn ${subTab === 'mySubmissions' ? 'active' : ''}" data-action="subtab-mysubmissions">ההגשות שלי (${mySubmissions.length})</button>
            </div>
            ${this._renderEditWindowBanner()}
            ${this._renderStatusGuide()}
            <div style="margin-top:12px">
                ${decidedBanners}
                ${rows}
            </div>`;
    }

    /** Live 30-minute countdown for freshly-submitted (SUBMITTED) shifts still in their free-edit window. */
    _renderEditWindowBanner() {
        const now = Date.now();
        const editable = (this._data.submissions || [])
            .filter(s => s.status === 'SUBMITTED' && s.editableUntil && new Date(s.editableUntil).getTime() > now)
            .sort((a, b) => new Date(a.editableUntil) - new Date(b.editableUntil));
        if (!editable.length) return '';

        const soonest = new Date(editable[0].editableUntil).getTime();
        const clock = this._formatCountdown(soonest - now);
        const countNote = editable.length > 1 ? ` (${editable.length} הגשות חדשות)` : '';
        return `
            <div class="ep-edit-window-banner" id="epEditWindowBanner" data-until="${soonest}">
                ⏱️ ניתן לערוך או למחוק בחינם את ההגשה החדשה${countNote} — נותרו <b id="epEditWindowClock">${clock}</b> דקות לעריכה חופשית. לאחר מכן כל שינוי יצריך אישור מנהל/ת.
            </div>`;
    }

    _formatCountdown(remainMs) {
        const clamped = Math.max(0, remainMs);
        const mm = Math.floor(clamped / 60000);
        const ss = Math.floor((clamped % 60000) / 1000);
        return `${pad2(mm)}:${pad2(ss)}`;
    }

    /** 1s ticker that updates the countdown text in place; re-renders once the window actually expires. */
    _setupEditWindowTimer() {
        clearInterval(this._editWindowTimer);
        if (!this.querySelector('#epEditWindowBanner')) return;
        this._editWindowTimer = setInterval(() => {
            const banner = this.querySelector('#epEditWindowBanner');
            if (!banner) { clearInterval(this._editWindowTimer); return; }
            const until = Number(banner.dataset.until);
            const remainMs = until - Date.now();
            if (remainMs <= 0) {
                clearInterval(this._editWindowTimer);
                this.render(); // recompute banner + row actions now that the window closed
                return;
            }
            const clockEl = this.querySelector('#epEditWindowClock');
            if (clockEl) clockEl.textContent = this._formatCountdown(remainMs);
        }, 1000);
    }

    /** Popup shown right after submitAvailability when one or more shifts instantly auto-approved. */
    _renderAutoApprovedPopup() {
        const list = this._autoApprovedPopup || [];
        const items = list.map(a => `
            <div class="ep-aa-item">
                <span>${formatDateHe(a.date)} · ${escapeHtml(a.workshopName)}</span>
                <span class="ep-lock-badge">🔒 אושר אוטומטית</span>
            </div>`).join('');
        return `<div class="epa-modal-backdrop">
            <div class="epa-modal" role="dialog" aria-modal="true" aria-label="שיבוץ אוטומטי">
                <div class="epa-modal-head"><h2>🎉 שיבוץ אוטומטי!</h2><button class="epa-modal-close" data-action="dismiss-auto-approved" aria-label="סגירה">×</button></div>
                <div class="ep-empty" style="text-align:right;margin-bottom:8px">המשמרות הבאות תואמות באופן מיידי הזמנת לקוח פעילה ואושרו אוטומטית:</div>
                ${items}
                <div class="ep-aa-note">⚠️ משמרות אלו משובצות ונעולות — לא ניתן לערוך או למחוק אותן ישירות (גם בתוך 30 הדקות), ויש לשלוח בקשת שינוי/מחיקה לאישור מנהל/ת.</div>
                <div class="epa-inline">
                    <button class="epa-btn primary" data-action="dismiss-auto-approved">הבנתי</button>
                </div>
            </div>
        </div>`;
    }

    /** One shift row: free edit/delete (SUBMITTED, within 30-min window) or request-change/delete otherwise. */
    _renderShiftRow(s, pendingReq, pendingSwap) {
        const tKey = todayKey();
        const withinEditWindow = s.status === 'SUBMITTED' && s.editableUntil && new Date(s.editableUntil).getTime() > Date.now();
        let actions = '';
        if (pendingReq) {
            actions = `<span class="ep-status PENDING">🕐 בקשת ${pendingReq.type === 'DELETE' ? 'מחיקה' : 'שינוי'} בטיפול</span>`;
        } else if (pendingSwap) {
            actions = `<span class="ep-swap-pending">🔄 החלפה עם ${escapeHtml(pendingSwap.targetEmployeeName || 'עובד/ת')} בטיפול</span>`;
        } else if (s.date > tKey) {
            if (s.status === 'SUBMITTED' && withinEditWindow) {
                actions = `
                    <button class="ep-withdraw" data-action="shift-edit" data-id="${escapeHtml(s.id)}">ערוך</button>
                    <button class="ep-withdraw" data-action="shift-delete" data-id="${escapeHtml(s.id)}">מחיקה</button>`;
            } else if (s.status === 'SUBMITTED' && !withinEditWindow) {
                actions = `
                    <button class="ep-withdraw" data-action="shift-request-edit" data-id="${escapeHtml(s.id)}">בקשת שינוי</button>
                    <button class="ep-withdraw" data-action="shift-request-delete" data-id="${escapeHtml(s.id)}">בקשת מחיקה</button>`;
            } else if (s.status === 'SCHEDULED' || s.status === 'STANDBY') {
                actions = `
                    <button class="ep-withdraw" data-action="shift-request-edit" data-id="${escapeHtml(s.id)}">בקשת שינוי</button>
                    <button class="ep-withdraw" data-action="shift-request-delete" data-id="${escapeHtml(s.id)}">בקשת מחיקה</button>
                    <button class="ep-swap-btn" data-action="shift-swap-open" data-id="${escapeHtml(s.id)}">בקשת החלפה</button>`;
            }
        }
        const workTypeLabel = (s.status === 'SCHEDULED' || s.status === 'STANDBY')
            ? (s.workTypeLabel || 'סדנה')
            : null;
        const workTypeChip = workTypeLabel
            ? `<span class="ep-worktype" title="סוג העבודה שהוגדר לך">${escapeHtml(workTypeLabel)}</span>`
            : '';
        const lockBadge = s.autoApproved
            ? `<span class="ep-lock-badge" title="אושר אוטומטית מול הזמנת לקוח — נעול לשינוי ישיר">🔒 אושר אוטומטית</span>`
            : '';
        return `
            <div class="ep-board-item ${s.autoApproved ? 'auto-approved' : ''}">
                <div>
                    <div class="ep-b-date">${formatDateHe(s.date)}</div>
                    <div class="ep-b-time">${escapeHtml(s.startTime)}–${escapeHtml(s.endTime)}${s.hours ? ` · ${s.hours} ש׳` : ''}</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                    ${workTypeChip}
                    ${lockBadge}
                    <span class="ep-status ${escapeHtml(s.status)}" title="${escapeHtml(STATUS_HINTS[s.status] || '')}">${STATUS_LABELS[s.status] || s.status}</span>
                    ${actions}
                </div>
            </div>`;
    }

    /** Modal for free edit (SUBMITTED) or filing a change/deletion request (SCHEDULED/STANDBY). */
    _renderShiftModal() {
        const modal = this._shiftModal;
        if (!modal) return '';
        const s = (this._data.submissions || []).find(x => x.id === modal.submissionId);
        if (!s) return '';

        let title, body;
        const timeInputs = `
            <div class="epa-form">
                <div><label>התחלה</label><input id="epShiftStart" type="time" min="${SHIFT_MIN_TIME}" max="${SHIFT_MAX_TIME}" value="${escapeHtml(s.startTime)}"></div>
                <div><label>סיום</label><input id="epShiftEnd" type="time" min="${SHIFT_MIN_TIME}" max="${SHIFT_MAX_TIME}" value="${escapeHtml(s.endTime)}"></div>
            </div>`;

        if (modal.type === 'confirmDelete') {
            title = 'מחיקת הגשה';
            body = `
                <div style="font-size:14px;margin-bottom:14px">
                    האם את/ה בטוח/ה שברצונך למחוק את ההגשה לתאריך
                    <b>${formatDateHe(s.date)}</b> (${escapeHtml(s.startTime)}–${escapeHtml(s.endTime)})?
                </div>
                <div class="epa-inline">
                    <button class="epa-btn danger" data-action="shift-modal-confirm-delete" data-id="${escapeHtml(s.id)}">כן, למחוק</button>
                    <button class="epa-btn" data-action="shift-modal-cancel">ביטול</button>
                </div>`;
        } else if (modal.type === 'edit') {
            title = 'עריכת משמרת';
            body = `${timeInputs}
                <div class="epa-inline">
                    <button class="epa-btn primary" data-action="shift-modal-save-edit" data-id="${escapeHtml(s.id)}">שמירה</button>
                    <button class="epa-btn" data-action="shift-modal-cancel">ביטול</button>
                </div>`;
        } else if (modal.type === 'requestEdit') {
            title = 'בקשת שינוי שעות משמרת';
            body = `
                <div class="ep-empty" style="text-align:right;margin-bottom:8px">המשמרת הזו כבר משובצת/בהמתנה — הבקשה תישלח למנהל/ת לאישור.</div>
                ${timeInputs}
                <div class="epa-field" style="margin-top:8px"><label>הערה למנהל/ת (לא חובה)</label><input id="epShiftNotes" value=""></div>
                <div class="epa-inline">
                    <button class="epa-btn primary" data-action="shift-modal-save-request-edit" data-id="${escapeHtml(s.id)}">שליחת בקשה</button>
                    <button class="epa-btn" data-action="shift-modal-cancel">ביטול</button>
                </div>`;
        } else if (modal.type === 'requestDelete') {
            title = 'בקשת מחיקת משמרת';
            body = `
                <div class="ep-empty" style="text-align:right;margin-bottom:8px">המשמרת הזו כבר משובצת/בהמתנה — הבקשה תישלח למנהל/ת לאישור.</div>
                <div class="epa-field"><label>הערה למנהל/ת (לא חובה)</label><input id="epShiftNotes" value=""></div>
                <div class="epa-inline">
                    <button class="epa-btn danger" data-action="shift-modal-save-request-delete" data-id="${escapeHtml(s.id)}">שליחת בקשת מחיקה</button>
                    <button class="epa-btn" data-action="shift-modal-cancel">ביטול</button>
                </div>`;
        } else {
            title = 'בקשת החלפת משמרת';
            const candidates = this._swapCandidates;
            if (candidates === null) {
                body = `<div class="ep-loading"><div class="ep-spinner"></div>טוען עובדים עם הכשרה מתאימה…</div>`;
            } else if (!candidates.length) {
                body = `
                    <div class="ep-empty">לא נמצאו עובדים עם הכשרה מתאימה למשמרת זו.</div>
                    <div class="epa-inline"><button class="epa-btn" data-action="shift-modal-cancel">סגירה</button></div>`;
            } else {
                const options = candidates.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
                body = `
                    <div class="ep-empty" style="text-align:right;margin-bottom:8px">בחרו עובד/ת בעל/ת הכשרה מתאימה — תישלח אליו/ה הודעת וואטסאפ עם קישור לאישור/דחייה. לאחר אישורו/ה תישלח הבקשה לאישור מנהל/ת.</div>
                    <div class="epa-field"><label>עובד/ת להחלפה</label><select id="epSwapTarget">${options}</select></div>
                    <div class="epa-inline">
                        <button class="epa-btn primary" data-action="shift-modal-confirm-swap" data-id="${escapeHtml(s.id)}">שליחת בקשת החלפה</button>
                        <button class="epa-btn" data-action="shift-modal-cancel">ביטול</button>
                    </div>`;
            }
        }

        return `<div class="epa-modal-backdrop">
            <div class="epa-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <div class="epa-modal-head"><h2>${escapeHtml(title)}</h2><button class="epa-modal-close" data-action="shift-modal-cancel" aria-label="סגירה">×</button></div>
                ${body}
            </div>
        </div>`;
    }

    _renderScheduledWorkshops() {
        const list = this._data.scheduledWorkshops || [];
        let html = `<h2>פרטי הסדנאות שלי</h2>`;
        if (!list.length) return html + `<div class="ep-empty">אין סדנאות משובצות עם הזמנות פעילות</div>`;

        html += list.map(w => {
            const participants = (w.participants || []).map(p =>
                `<li>${escapeHtml(p.name)}${p.childrenCount ? ` (+${p.childrenCount} ילדים)` : ''}</li>`).join('');
            return `<div class="ep-ws-card">
                <div class="ep-ws-head">
                    <span>${escapeHtml(w.workshopType)}</span>
                    <span>${formatDateHe(w.date)} · ${formatTimeHe(w.workshopStart)}</span>
                </div>
                <div class="ep-ws-meta">מזמין/ה: ${escapeHtml(w.organizerName || '—')} · ${w.quantity} משתתפים (${w.adults} מבוגרים, ${w.children} ילדים)</div>
                ${participants ? `<ul class="ep-ws-participants">${participants}</ul>` : ''}
                ${w.customerNotes ? `<div class="ep-ws-notes">📝 הערת לקוח: ${escapeHtml(w.customerNotes)}</div>` : ''}
            </div>`;
        }).join('');
        return html;
    }

    // -----------------------------------------------------------------
    // Interaction
    // -----------------------------------------------------------------

    _onClick(e) {
        // Clicking anywhere on a time field (not just its native icon) opens the picker.
        if (e.target instanceof HTMLInputElement && e.target.type === 'time' && typeof e.target.showPicker === 'function') {
            try { e.target.showPicker(); } catch (_) { /* unsupported/blocked — native click behavior still works */ }
        }
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        const months = (this._data?.months || []).map(m => m.monthKey);
        const idx = months.indexOf(this._viewMonth);
        const rules = this._data?.rules || {};

        if (action.startsWith('admin-')) {
            if (handleAdminClick(this, action, target)) return;
        }

        switch (action) {
            case 'tab-portal':
                console.log('[employee-portal] tab → portal');
                this._tab = 'portal';
                this.render();
                return;
            case 'tab-admin':
                console.log('[employee-portal] tab → admin');
                this._tab = 'admin';
                if (!this._adminData) this._requestAdminData();
                else this.render();
                return;
            case 'tab-hours':
                console.log('[employee-portal] tab → hours');
                this._tab = 'hours';
                if (!this._hoursData) this._requestHoursData();
                else this.render();
                return;
            case 'subtab-myshifts':
            case 'subtab-mysubmissions':
                this._shiftSubTab = action === 'subtab-mysubmissions' ? 'mySubmissions' : 'myShifts';
                this.render();
                return;
            case 'msg-car-prev':
            case 'msg-car-next': {
                const scope = target.dataset.scope;
                const list = this._msgListFor(scope);
                if (list.length < 2) return;
                const delta = action === 'msg-car-next' ? 1 : -1;
                this._msgCarIdx[scope] = (this._msgCarIdx[scope] + delta + list.length) % list.length;
                this._updateMsgCar(scope);
                return;
            }
            case 'msg-car-dot': {
                const scope = target.dataset.scope;
                this._msgCarIdx[scope] = Number(target.dataset.idx) || 0;
                this._updateMsgCar(scope);
                return;
            }
            case 'shift-edit':
                this._shiftModal = { type: 'edit', submissionId: target.dataset.id };
                this.render();
                return;
            case 'shift-delete':
                this._shiftModal = { type: 'confirmDelete', submissionId: target.dataset.id };
                this.render();
                return;
            case 'shift-modal-confirm-delete':
                this._shiftModal = null;
                this._startBusy('מוחק את ההגשה…');
                this._dispatch('withdrawAvailability', { id: target.dataset.id });
                return;
            case 'shift-request-edit':
                this._shiftModal = { type: 'requestEdit', submissionId: target.dataset.id };
                this.render();
                return;
            case 'shift-request-delete':
                this._shiftModal = { type: 'requestDelete', submissionId: target.dataset.id };
                this.render();
                return;
            case 'shift-swap-open':
                this._shiftModal = { type: 'swap', submissionId: target.dataset.id };
                this._swapCandidates = null;
                this.render();
                this._dispatch('loadSwapCandidates', { submissionId: target.dataset.id });
                return;
            case 'shift-modal-confirm-swap': {
                const targetEmployeeId = this.querySelector('#epSwapTarget')?.value;
                if (!targetEmployeeId) return;
                this._shiftModal = null;
                this._swapCandidates = null;
                this._startBusy('שולח בקשת החלפה…');
                this._dispatch('createSwapRequest', { submissionId: target.dataset.id, targetEmployeeId });
                return;
            }
            case 'ack-swap':
                this._dispatch('acknowledgeShiftSwap', { swapId: target.dataset.id });
                return;
            case 'shift-modal-cancel':
                this._shiftModal = null;
                this.render();
                return;
            case 'shift-modal-save-edit': {
                const startTime = this.querySelector('#epShiftStart')?.value;
                const endTime = this.querySelector('#epShiftEnd')?.value;
                this._shiftModal = null;
                this._startBusy('שומר שינויים…');
                this._dispatch('updateSubmission', { id: target.dataset.id, patch: { startTime, endTime } });
                return;
            }
            case 'shift-modal-save-request-edit': {
                const requestedStartTime = this.querySelector('#epShiftStart')?.value;
                const requestedEndTime = this.querySelector('#epShiftEnd')?.value;
                const notes = this.querySelector('#epShiftNotes')?.value || '';
                this._shiftModal = null;
                this._startBusy('שולח בקשה למנהל/ת…');
                this._dispatch('requestShiftChange', {
                    submissionId: target.dataset.id,
                    payload: { type: 'EDIT', requestedStartTime, requestedEndTime, notes },
                });
                return;
            }
            case 'shift-modal-save-request-delete': {
                const notes = this.querySelector('#epShiftNotes')?.value || '';
                this._shiftModal = null;
                this._startBusy('שולח בקשה למנהל/ת…');
                this._dispatch('requestShiftChange', {
                    submissionId: target.dataset.id,
                    payload: { type: 'DELETE', notes },
                });
                return;
            }
            case 'ack-request':
                this._dispatch('acknowledgeShiftRequest', { requestId: target.dataset.id });
                return;
            case 'dismiss-auto-approved':
                this._autoApprovedPopup = null;
                this.render();
                return;
            case 'hours-month-prev':
            case 'hours-month-next': {
                const [hy, hm] = this._hoursMonth.split('-').map(Number);
                const delta = action === 'hours-month-next' ? 1 : -1;
                const t = hy * 12 + (hm - 1) + delta;
                this._hoursMonth = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
                this._requestHoursData();
                return;
            }
            case 'hours-approve':
                this._startBusy('מאשר את השעות…');
                this._dispatch('approveMyMonth', { monthKey: target.dataset.month });
                return;
            case 'offer-accept':
                this._startBusy('מאשר את המשמרת…');
                this._dispatch('respondToOffer', { offerId: target.dataset.id, accept: true });
                return;
            case 'offer-decline':
                this._startBusy('מעדכן…');
                this._dispatch('respondToOffer', { offerId: target.dataset.id, accept: false });
                return;
            case 'call-claim':
                this._startBusy('תופס את המשמרת…');
                this._dispatch('claimOpenCall', { callId: target.dataset.id });
                return;
        }

        switch (action) {
            case 'month-prev':
                if (idx > 0) { this._viewMonth = months[idx - 1]; this.render(); }
                break;
            case 'month-next':
                if (idx >= 0 && idx < months.length - 1) { this._viewMonth = months[idx + 1]; this.render(); }
                break;
            case 'toggle-ws-filter-menu':
                this._workshopFilterOpen = !this._workshopFilterOpen;
                this.render();
                break;
            case 'clear-ws-filter':
                this._workshopFilter.clear();
                this.render();
                break;
            case 'toggle-day': {
                const dateKey = target.dataset.date;
                if (this._selected.has(dateKey)) this._selected.delete(dateKey);
                else this._selected.set(dateKey, {
                    startTime: rules.defaultShiftStart || '10:00',
                    endTime: rules.defaultShiftEnd || '16:00',
                });
                this.render();
                break;
            }
            case 'remove-day':
                this._selected.delete(target.dataset.date);
                this.render();
                break;
            case 'submit': {
                if (this._submitting || !this._selected.size) return;
                for (const [date, t] of this._selected.entries()) {
                    if (!t.startTime || !t.endTime) {
                        this._toast(`יש להזין שעת התחלה וסיום עבור ${formatDateHe(date)}.`, 'error');
                        return;
                    }
                    if (t.startTime < SHIFT_MIN_TIME || t.endTime > SHIFT_MAX_TIME) {
                        this._toast(`שעות המשמרת חייבות להיות בטווח שעות הפעילות (${SHIFT_MIN_TIME}–${SHIFT_MAX_TIME}).`, 'error');
                        return;
                    }
                    if (t.startTime >= t.endTime) {
                        this._toast(`שעת ההתחלה חייבת להיות לפני שעת הסיום (${formatDateHe(date)}).`, 'error');
                        return;
                    }
                }
                this._submitting = true;
                this._busy = 'שולח את ההגשה ובודק זמינות מול המערכת…';
                const shifts = [...this._selected.entries()].map(([date, t]) => ({
                    date, startTime: t.startTime, endTime: t.endTime,
                }));
                this._dispatch('submitAvailability', { shifts });
                this.render();
                break;
            }
            case 'withdraw':
                this._dispatch('withdrawAvailability', { id: target.dataset.id });
                break;
        }
    }

    _onChange(e) {
        const input = e.target;
        if (input?.dataset?.action?.startsWith('admin-') && handleAdminChange(this, input)) return;
        if (input?.dataset?.action === 'toggle-ws-filter') {
            const wsId = input.dataset.wsId;
            if (input.checked) this._workshopFilter.add(wsId);
            else this._workshopFilter.delete(wsId);
            this.render();
            return;
        }
        if (input.id === 'epaStaffSearch') {
            this._staffSearch = input.value;
            this.render();
            return;
        }
        if (input.id === 'epaTrackerMonth') {
            this._adminMonth = input.value;
            this._adminSelectedDay = null;
            this._requestAdminData();
            return;
        }
        if (input.id === 'epaM_scope') {
            const wrap = this.querySelector('#epaM_empWrap');
            if (wrap) wrap.style.display = input.value === 'EMPLOYEE' ? '' : 'none';
            return;
        }
        if (input.tagName !== 'INPUT' || input.type !== 'time') return;
        const dateKey = input.dataset.date;
        const entry = this._selected.get(dateKey);
        if (!entry) return;
        let value = input.value;
        if (value && (value < SHIFT_MIN_TIME || value > SHIFT_MAX_TIME)) {
            value = value < SHIFT_MIN_TIME ? SHIFT_MIN_TIME : SHIFT_MAX_TIME;
            input.value = value;
        }
        if (input.dataset.role === 'start') entry.startTime = value;
        if (input.dataset.role === 'end') entry.endTime = value;
        this.render();
    }

    _toast(message, kind) {
        this._pendingToast = { message, kind, expiry: Date.now() + 4200 };
        this.render();
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this._pendingToast = null;
            const toast = this.querySelector('#epToast');
            if (toast) toast.className = 'ep-toast';
        }, 4200);
    }
}

if (!customElements.get('employee-portal')) {
    customElements.define('employee-portal', EmployeePortal);
}
