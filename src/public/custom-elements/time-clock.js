/**
 * Wix Custom Element: time-clock
 * ------------------------------
 * שעון נוכחות (Module E) — נפתח מסריקת QR/NFC בכתובת /time-clock?station=KEY.
 *
 * התקנה בוויקס:
 * 1. עמוד members-only בכתובת /time-clock.
 * 2. Custom Element — Tag Name: time-clock, Source: קובץ זה.
 * 3. קוד העמוד: src/pages/time-clock.js.
 *
 * תקשורת:
 * - קלט:  attribute `clock-data` — מצב נוכחי (getClockStatus).
 * - קלט:  attribute `clock-result` — תוצאת פעולה.
 * - פלט:  CustomEvent `clock-action` עם detail = { taskType | null }.
 *
 * לחיצה על "הדרכה" מציגה חלון אישור לפני התחלה (דרישת המוצר).
 */

const TC_STYLE = `
time-clock { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
time-clock * { box-sizing: border-box; }
.tc-wrap { max-width: 440px; margin: 0 auto; padding: 28px 16px; }
.tc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 22px; box-shadow: 0 2px 8px rgba(0,0,0,.06); text-align: center; }
.tc-card h1 { margin: 0 0 2px; font-size: 19px; }
.tc-sub { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
.tc-status { border-radius: 14px; padding: 18px 14px; margin-bottom: 16px; font-size: 15px; font-weight: 700; }
.tc-status.on { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; }
.tc-status.off { background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280; }
.tc-status .tc-since { display: block; font-size: 12px; font-weight: 400; margin-top: 4px; color: #6b7280; }
.tc-tasks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.tc-task { border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 14px 6px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.tc-task:hover { border-color: #a855f7; }
.tc-task.active { background: #f5f3ff; border-color: #7c3aed; color: #6d28d9; }
.tc-task .tc-ico { display: block; font-size: 21px; margin-bottom: 4px; }
.tc-out { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; background: #b91c1c; color: #fff; }
.tc-out:hover { background: #991b1b; }
.tc-btn:disabled, .tc-task:disabled, .tc-out:disabled { opacity: .55; cursor: default; }
.tc-today { margin-top: 18px; text-align: right; }
.tc-today h2 { font-size: 13.5px; margin: 0 0 8px; }
.tc-row { display: flex; justify-content: space-between; font-size: 12.5px; padding: 6px 2px; border-bottom: 1px solid #f3f4f6; }
.tc-row .t { color: #6b7280; }
.tc-total { font-weight: 700; padding-top: 8px; font-size: 13px; }
.tc-msg { border-radius: 10px; padding: 10px; font-size: 13px; margin-top: 12px; }
.tc-msg.ok { background: #ecfdf5; color: #065f46; }
.tc-msg.bad { background: #fef2f2; color: #991b1b; }
.tc-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #7c3aed; border-radius: 50%; margin: 26px auto; animation: tc-spin .8s linear infinite; }
@keyframes tc-spin { to { transform: rotate(360deg); } }
.tc-confirm-overlay { position: fixed; inset: 0; background: rgba(17,24,39,.55); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 16px; }
.tc-confirm-box { background: #fff; border-radius: 16px; padding: 22px; max-width: 340px; text-align: center; font-size: 14.5px; }
.tc-confirm-box b { display: block; font-size: 16px; margin-bottom: 8px; }
.tc-confirm-btns { display: flex; gap: 8px; margin-top: 16px; }
.tc-confirm-btns button { flex: 1; border-radius: 10px; padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
.tc-yes { background: #059669; color: #fff; }
.tc-no { background: #fff; border-color: #d1d5db !important; color: #374151; }
`;

const TASK_ICONS = { STUDIO: '🏠', INSTRUCTION: '🎨', WOOL: '🧶' };

function tcEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tcTime(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

class TimeClock extends HTMLElement {
    static get observedAttributes() { return ['clock-data', 'clock-result']; }

    constructor() {
        super();
        this._data = null;
        this._busy = false;
        this._pendingInstruction = false;
        this._message = null;
    }

    connectedCallback() {
        console.log('[time-clock] CE connected');
        if (!document.getElementById('tc-style')) {
            const style = document.createElement('style');
            style.id = 'tc-style';
            style.textContent = TC_STYLE;
            document.head.appendChild(style);
        }
        this.render();
        this.addEventListener('click', (e) => this._onClick(e));
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        try {
            if (name === 'clock-data') {
                this._data = JSON.parse(newVal);
                this._busy = false;
                console.log('[time-clock] clock-data received', {
                    open: !!this._data.openEntry, station: this._data.station?.key || null,
                });
            }
            if (name === 'clock-result') {
                const r = JSON.parse(newVal);
                this._busy = false;
                console.log('[time-clock] clock-result received', r.action || r.message);
                if (r.error) this._message = { kind: 'bad', text: r.message || 'אירעה שגיאה. נסו שוב.' };
                else this._message = {
                    kind: 'ok',
                    text: r.action === 'in' ? 'נרשמה כניסה 🎉' : r.action === 'out' ? 'נרשמה יציאה 👋' : 'המשימה הוחלפה ✔',
                };
            }
        } catch (err) {
            console.error('[time-clock] bad JSON attribute:', err);
            return;
        }
        this.render();
    }

    _dispatch(taskType) {
        this._busy = true;
        this._message = null;
        console.log('[time-clock] action →', taskType || '(clock out)');
        this.dispatchEvent(new CustomEvent('clock-action', { detail: { taskType: taskType || null }, bubbles: true }));
        this.render();
    }

    _onClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn || this._busy) return;
        const action = btn.dataset.action;

        if (action === 'task') {
            const task = btn.dataset.task;
            // Instruction-start confirmation prompt (product requirement).
            if (task === 'INSTRUCTION' && this._data?.openEntry?.taskType !== 'INSTRUCTION') {
                this._pendingInstruction = true;
                this.render();
                return;
            }
            this._dispatch(task);
        }
        if (action === 'out') this._dispatch(null);
        if (action === 'confirm-instruction') { this._pendingInstruction = false; this._dispatch('INSTRUCTION'); }
        if (action === 'cancel-instruction') { this._pendingInstruction = false; this.render(); }
    }

    render() {
        const d = this._data;
        if (!d) {
            this.innerHTML = `<div class="tc-wrap"><div class="tc-card"><h1>שעון נוכחות</h1><div class="tc-spinner"></div><div class="tc-sub">מזהה אותך…</div></div></div>`;
            return;
        }
        if (d.error) {
            this.innerHTML = `<div class="tc-wrap"><div class="tc-card"><h1>שעון נוכחות</h1><div class="tc-msg bad">${tcEsc(d.message || 'אין הרשאה. יש להתחבר עם חשבון עובד/ת.')}</div></div></div>`;
            return;
        }

        const open = d.openEntry;
        const status = open
            ? `<div class="tc-status on">⏱ במשמרת: ${tcEsc(open.taskLabel)}<span class="tc-since">מאז ${tcTime(open.startTime)}</span></div>`
            : `<div class="tc-status off">לא במשמרת</div>`;

        const tasks = (d.taskTypes || []).map(t => `
            <button class="tc-task ${open?.taskType === t.value ? 'active' : ''}" data-action="task" data-task="${t.value}" ${this._busy ? 'disabled' : ''}>
                <span class="tc-ico">${TASK_ICONS[t.value] || '💼'}</span>${tcEsc(t.label)}
            </button>`).join('');

        const rows = (d.todayEntries || []).map(e => `
            <div class="tc-row">
                <span>${tcEsc(e.taskLabel)}</span>
                <span class="t">${tcTime(e.startTime)}–${e.endTime ? tcTime(e.endTime) : 'פתוח'}${e.hours ? ` · ${e.hours} ש׳` : ''}</span>
            </div>`).join('');

        const stationNote = d.station
            ? `<div class="tc-sub">עמדה: ${tcEsc(d.station.name || d.station.key)} (${tcEsc((d.taskTypes.find(t => t.value === d.station.taskType) || {}).label || d.station.taskType)})</div>` : '';

        this.innerHTML = `
            <div class="tc-wrap">
                <div class="tc-card">
                    <h1>שעון נוכחות</h1>
                    <div class="tc-sub">שלום, ${tcEsc(d.user?.name || '')} 👋</div>
                    ${stationNote}
                    ${status}
                    <div class="tc-tasks">${tasks}</div>
                    ${open ? `<button class="tc-out" data-action="out" ${this._busy ? 'disabled' : ''}>${this._busy ? 'מעדכן…' : 'סיום משמרת (יציאה)'}</button>` : ''}
                    ${this._message ? `<div class="tc-msg ${this._message.kind}">${tcEsc(this._message.text)}</div>` : ''}
                    <div class="tc-today">
                        <h2>היום</h2>
                        ${rows || '<div class="tc-sub">אין רישומים היום</div>'}
                        ${d.todayTotals?.total ? `<div class="tc-total">סה"כ היום: ${d.todayTotals.total} שעות</div>` : ''}
                    </div>
                </div>
            </div>
            ${this._pendingInstruction ? `
                <div class="tc-confirm-overlay">
                    <div class="tc-confirm-box">
                        <b>התחלת הדרכה 🎨</b>
                        האם את/ה מתחיל/ה כעת הדרכת סדנה?
                        <div class="tc-confirm-btns">
                            <button class="tc-yes" data-action="confirm-instruction">כן, מתחיל/ה</button>
                            <button class="tc-no" data-action="cancel-instruction">ביטול</button>
                        </div>
                    </div>
                </div>` : ''}`;
    }
}

if (!customElements.get('time-clock')) {
    customElements.define('time-clock', TimeClock);
}
