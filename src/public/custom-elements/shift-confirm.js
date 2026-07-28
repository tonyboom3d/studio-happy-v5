/**
 * Wix Custom Element: shift-confirm
 * ---------------------------------
 * עמוד אישור הגעה למשמרת (Module D) — נפתח מקישור WhatsApp עם token.
 *
 * התקנה בוויקס:
 * 1. עמוד חדש (לא בתפריט) בכתובת /shift-confirm.
 * 2. Custom Element — Tag Name: shift-confirm, Source: קובץ זה.
 * 3. קוד העמוד: src/pages/shift-confirm.js.
 *
 * תקשורת:
 * - קלט:  attribute `shift-data` — פרטי המשמרת / שגיאה.
 * - קלט:  attribute `respond-result` — תוצאת אישור/ביטול.
 * - פלט:  CustomEvent `confirm-action` עם detail = { action: 'confirm'|'cancel', notes }.
 */

const SC_STYLE = `
shift-confirm { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
shift-confirm * { box-sizing: border-box; }
.sc-wrap { max-width: 460px; margin: 0 auto; padding: 40px 16px; }
.sc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 26px 22px; box-shadow: 0 2px 8px rgba(0,0,0,.06); text-align: center; }
.sc-card h1 { margin: 0 0 6px; font-size: 19px; }
.sc-sub { color: #6b7280; font-size: 13.5px; margin-bottom: 18px; }
.sc-detail { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 14px; font-size: 14.5px; margin-bottom: 18px; }
.sc-detail b { display: block; font-size: 16px; margin-bottom: 4px; }
.sc-notes { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 11px; font-size: 13px; font-family: inherit; min-height: 64px; resize: vertical; margin-bottom: 14px; }
.sc-btns { display: flex; flex-direction: column; gap: 9px; }
.sc-btn { border: none; border-radius: 11px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }
.sc-confirm { background: #059669; color: #fff; }
.sc-confirm:hover { background: #047857; }
.sc-cancel { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
.sc-cancel:hover { background: #fef2f2; }
.sc-btn:disabled { opacity: .55; cursor: default; }
.sc-msg { border-radius: 12px; padding: 16px; font-size: 14.5px; font-weight: 600; }
.sc-msg.ok { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; }
.sc-msg.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.sc-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #7c3aed; border-radius: 50%; margin: 20px auto; animation: sc-spin .8s linear infinite; }
@keyframes sc-spin { to { transform: rotate(360deg); } }
`;

function scEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function scFormatDate(dateKey) {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(y, m - 1, d));
    return `${dow}, ${d}.${m}.${y}`;
}
function scFormatTime(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

class ShiftConfirm extends HTMLElement {
    static get observedAttributes() { return ['shift-data', 'respond-result']; }

    constructor() {
        super();
        this._data = null;
        this._result = null;
        this._sending = false;
    }

    connectedCallback() {
        console.log('[shift-confirm] CE connected');
        if (!document.getElementById('sc-style')) {
            const style = document.createElement('style');
            style.id = 'sc-style';
            style.textContent = SC_STYLE;
            document.head.appendChild(style);
        }
        this.render();
        this.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn || this._sending) return;
            const notes = this.querySelector('#scNotes')?.value || '';
            this._sending = true;
            this.render();
            console.log('[shift-confirm] action →', btn.dataset.action);
            this.dispatchEvent(new CustomEvent('confirm-action', {
                detail: { action: btn.dataset.action, notes }, bubbles: true,
            }));
        });
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        try {
            if (name === 'shift-data') this._data = JSON.parse(newVal);
            if (name === 'respond-result') { this._result = JSON.parse(newVal); this._sending = false; }
        } catch (err) {
            console.error('[shift-confirm] bad JSON attribute:', err);
            return;
        }
        console.log('[shift-confirm]', name, 'received');
        this.render();
    }

    render() {
        let body;
        if (this._result) {
            body = this._result.error
                ? `<div class="sc-msg bad">${scEsc(this._result.message || 'אירעה שגיאה. נסו שוב.')}</div>`
                : (this._result.state === 'CONFIRMED'
                    ? `<div class="sc-msg ok">ההגעה אושרה — נתראה בסדנה! 🎨</div>`
                    : `<div class="sc-msg bad">המשמרת בוטלה. המערכת מחפשת מחליף/ה והמנהלים עודכנו.</div>`);
        } else if (!this._data) {
            body = `<div class="sc-spinner"></div><div class="sc-sub">טוען את פרטי המשמרת…</div>`;
        } else if (this._data.error) {
            body = `<div class="sc-msg bad">${scEsc(this._data.message || 'הקישור אינו תקף.')}</div>`;
        } else if (this._data.confirmationState === 'CONFIRMED' || this._data.confirmationState === 'DECLINED') {
            body = this._data.confirmationState === 'CONFIRMED'
                ? `<div class="sc-msg ok">ההגעה כבר אושרה. נתראה! 🎨</div>`
                : `<div class="sc-msg bad">המשמרת הזו כבר בוטלה.</div>`;
        } else {
            body = `
                <div class="sc-detail">
                    <b>${scEsc(this._data.workshopName)}</b>
                    ${scFormatDate(this._data.date)}${this._data.startTime ? ` · ${scFormatTime(this._data.startTime)}` : ''}
                </div>
                <textarea id="scNotes" class="sc-notes" placeholder="הערות (לא חובה)"></textarea>
                <div class="sc-btns">
                    <button class="sc-btn sc-confirm" data-action="confirm" ${this._sending ? 'disabled' : ''}>${this._sending ? 'שולח…' : '✔ מאשר/ת הגעה'}</button>
                    <button class="sc-btn sc-cancel" data-action="cancel" ${this._sending ? 'disabled' : ''}>לא אגיע — ביטול המשמרת</button>
                </div>`;
        }

        const greeting = this._data?.employeeName && !this._data.error
            ? `<div class="sc-sub">היי ${scEsc(this._data.employeeName)}, נא לאשר הגעה למשמרת:</div>` : '';

        this.innerHTML = `
            <div class="sc-wrap">
                <div class="sc-card">
                    <h1>אישור הגעה למשמרת</h1>
                    ${greeting}
                    ${body}
                </div>
            </div>`;
    }
}

if (!customElements.get('shift-confirm')) {
    customElements.define('shift-confirm', ShiftConfirm);
}
