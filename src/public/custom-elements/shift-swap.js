/**
 * Wix Custom Element: shift-swap
 * ------------------------------
 * עמוד אישור/דחיית בקשת החלפת משמרת בין עובדים (Module A) — נפתח מקישור
 * WhatsApp שנשלח לעובד/ת המחליף/ה (שלב 1), ולאחר אישורו/ה — למנהלים (שלב 2).
 *
 * התקנה בוויקס:
 * 1. עמוד חדש (לא בתפריט, ציבורי) בכתובת /shift-swap.
 * 2. Custom Element — Tag Name: shift-swap, Source: קובץ זה.
 * 3. קוד העמוד: src/pages/shift-swap.js.
 *
 * תקשורת:
 * - קלט:  attribute `swap-data` — פרטי הבקשה + סיווג הצופה (viewer) / שגיאה.
 * - קלט:  attribute `decide-result` — תוצאת הפעולה.
 * - פלט:  CustomEvent `swap-action` עם detail = { action, decision?, comment? }.
 *   action: 'login' | 'switch-account' | 'decide-target' | 'decide-manager'
 *   decision (for decide-*): 'APPROVE' | 'DECLINE'
 *
 * viewer מה-שרת: 'NOT_LOGGED_IN' | 'UNAUTHORIZED' | 'TARGET' | 'MANAGER'.
 * העמוד חוסם כל צפייה/פעולה שאינה מהחשבון הנכון — האימות נעשה בשרת בכל בקשה.
 */

const SSW_STYLE = `
shift-swap { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
shift-swap * { box-sizing: border-box; }
.ssw-wrap { max-width: 480px; margin: 0 auto; padding: 40px 16px; }
.ssw-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 26px 22px; box-shadow: 0 2px 8px rgba(0,0,0,.06); text-align: center; }
.ssw-card h1 { margin: 0 0 6px; font-size: 19px; }
.ssw-sub { color: #6b7280; font-size: 13.5px; margin-bottom: 18px; }
.ssw-detail { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 14px; font-size: 14.5px; margin-bottom: 14px; text-align: right; }
.ssw-detail b { display: block; font-size: 16px; margin-bottom: 6px; text-align: center; }
.ssw-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.ssw-row span:first-child { color: #6b7280; }
.ssw-comment { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 11px; font-size: 13px; font-family: inherit; min-height: 64px; resize: vertical; margin-bottom: 14px; }
.ssw-btns { display: flex; flex-direction: column; gap: 9px; }
.ssw-btn { border: none; border-radius: 11px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }
.ssw-approve { background: #059669; color: #fff; }
.ssw-approve:hover { background: #047857; }
.ssw-decline { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
.ssw-decline:hover { background: #fef2f2; }
.ssw-login { background: #5b21b6; color: #fff; }
.ssw-login:hover { background: #4c1d95; }
.ssw-btn:disabled { opacity: .55; cursor: default; }
.ssw-note { border-radius: 12px; padding: 12px 14px; font-size: 13.5px; margin-bottom: 14px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.ssw-note.bad { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.ssw-msg { border-radius: 12px; padding: 16px; font-size: 14.5px; font-weight: 600; }
.ssw-msg.ok { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; }
.ssw-msg.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.ssw-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #5b21b6; border-radius: 50%; margin: 20px auto; animation: ssw-spin .8s linear infinite; }
@keyframes ssw-spin { to { transform: rotate(360deg); } }
`;

function sswEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sswFormatDate(dateKey) {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(y, m - 1, d));
    return `${dow}, ${d}.${m}.${y}`;
}

const STATUS_TEXT = {
    EMPLOYEE_DECLINED: { text: 'המחליף/ה לא אישר/ה את הבקשה — התהליך הופסק.', kind: 'bad' },
    APPROVED: { text: 'ההחלפה אושרה סופית ובוצעה במערכת. ✔', kind: 'ok' },
    DECLINED: { text: 'ההחלפה נדחתה על ידי המנהל/ת.', kind: 'bad' },
    PENDING_MANAGER: { text: 'שני הצדדים אישרו — ממתין לאישור סופי של מנהל/ת.', kind: 'info' },
    PENDING_EMPLOYEE: { text: 'ממתין לאישור העובד/ת המחליף/ה.', kind: 'info' },
};

class ShiftSwap extends HTMLElement {
    static get observedAttributes() { return ['swap-data', 'decide-result']; }

    constructor() {
        super();
        this._data = null;
        this._result = null;
        this._sending = false;
    }

    connectedCallback() {
        console.log('[shift-swap] CE connected');
        if (!document.getElementById('ssw-style')) {
            const style = document.createElement('style');
            style.id = 'ssw-style';
            style.textContent = SSW_STYLE;
            document.head.appendChild(style);
        }
        this.render();
        this.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn || this._sending) return;
            const action = btn.dataset.action;
            if (action === 'login' || action === 'switch-account') {
                this.dispatchEvent(new CustomEvent('swap-action', { detail: { action }, bubbles: true }));
                return;
            }
            const comment = this.querySelector('#sswComment')?.value || '';
            this._sending = true;
            this.render();
            console.log('[shift-swap] action →', action, btn.dataset.decision);
            this.dispatchEvent(new CustomEvent('swap-action', {
                detail: { action, decision: btn.dataset.decision, comment }, bubbles: true,
            }));
        });
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        try {
            if (name === 'swap-data') { this._data = JSON.parse(newVal); this._sending = false; }
            if (name === 'decide-result') { this._result = JSON.parse(newVal); this._sending = false; }
        } catch (err) {
            console.error('[shift-swap] bad JSON attribute:', err);
            return;
        }
        console.log('[shift-swap]', name, 'received');
        this.render();
    }

    _renderDetail(d) {
        return `
            <div class="ssw-detail">
                <b>🔄 בקשת החלפת משמרת</b>
                <div class="ssw-row"><span>מבקש/ת</span><span>${sswEsc(d.requesterName)}</span></div>
                <div class="ssw-row"><span>מחליף/ה</span><span>${sswEsc(d.targetEmployeeName)}</span></div>
                <div class="ssw-row"><span>סדנה</span><span>${sswEsc(d.workshopName)}</span></div>
                <div class="ssw-row"><span>תאריך ושעה</span><span>${sswFormatDate(d.dateKey)} · ${sswEsc(d.startTime)}–${sswEsc(d.endTime)}</span></div>
            </div>`;
    }

    _renderStatusBanner(d) {
        const info = STATUS_TEXT[d.status];
        if (!info) return '';
        const kindClass = info.kind === 'ok' ? 'ok' : info.kind === 'bad' ? 'bad' : '';
        return `<div class="ssw-msg ${kindClass || 'bad'}" style="${info.kind === 'info' ? 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af' : ''}">${info.text}${d.managerComment ? `<div style="margin-top:6px;font-weight:400;font-size:13px">הערת מנהל/ת: ${sswEsc(d.managerComment)}</div>` : ''}</div>`;
    }

    render() {
        let body;
        const d = this._data;

        if (this._result) {
            if (this._result.error) {
                body = `<div class="ssw-msg bad">${sswEsc(this._result.message || 'אירעה שגיאה. נסו שוב.')}</div>`;
            } else {
                const info = STATUS_TEXT[this._result.status] || { text: 'הפעולה בוצעה.', kind: 'ok' };
                body = `<div class="ssw-msg ${info.kind === 'bad' ? 'bad' : 'ok'}">${info.text}</div>`;
            }
        } else if (!d) {
            body = `<div class="ssw-spinner"></div><div class="ssw-sub">טוען את פרטי הבקשה…</div>`;
        } else if (d.error) {
            body = `<div class="ssw-msg bad">${sswEsc(d.message || 'הקישור אינו תקף.')}</div>`;
        } else if (d.viewer === 'NOT_LOGGED_IN') {
            body = `
                ${this._renderDetail(d)}
                <div class="ssw-note">יש להתחבר לחשבון העובד/ת שלך כדי לצפות בבקשה ולהגיב לה.</div>
                <button class="ssw-btn ssw-login" data-action="login">התחברות</button>`;
        } else if (d.viewer === 'UNAUTHORIZED') {
            body = `
                ${this._renderDetail(d)}
                <div class="ssw-note bad">בקשת ההחלפה הזו מיועדת לחשבון אחר (${sswEsc(d.targetEmployeeName)}). יש להתחבר לחשבון הנכון כדי להמשיך.</div>
                <button class="ssw-btn ssw-login" data-action="switch-account">התחברות לחשבון אחר</button>`;
        } else if (d.viewer === 'TARGET' && d.status === 'PENDING_EMPLOYEE') {
            body = `
                ${this._renderDetail(d)}
                <div class="ssw-sub">האם את/ה מסכים/ה להחליף עם ${sswEsc(d.requesterName)} במשמרת זו?</div>
                <div class="ssw-btns">
                    <button class="ssw-btn ssw-approve" data-action="decide-target" data-decision="APPROVE" ${this._sending ? 'disabled' : ''}>${this._sending ? 'שולח…' : '✔ מאשר/ת את ההחלפה'}</button>
                    <button class="ssw-btn ssw-decline" data-action="decide-target" data-decision="DECLINE" ${this._sending ? 'disabled' : ''}>✕ לא מתאים לי</button>
                </div>`;
        } else if (d.viewer === 'MANAGER' && d.status === 'PENDING_MANAGER') {
            body = `
                ${this._renderDetail(d)}
                <div class="ssw-note">שני העובדים אישרו את ההחלפה — נדרש אישור סופי.</div>
                <textarea id="sswComment" class="ssw-comment" placeholder="הערה (לא חובה)"></textarea>
                <div class="ssw-btns">
                    <button class="ssw-btn ssw-approve" data-action="decide-manager" data-decision="APPROVE" ${this._sending ? 'disabled' : ''}>${this._sending ? 'שולח…' : '✔ אישור ההחלפה'}</button>
                    <button class="ssw-btn ssw-decline" data-action="decide-manager" data-decision="DECLINE" ${this._sending ? 'disabled' : ''}>✕ דחיית ההחלפה</button>
                </div>`;
        } else {
            // TARGET/MANAGER viewing after a decision was already made (by anyone).
            body = `${this._renderDetail(d)}${this._renderStatusBanner(d)}`;
        }

        this.innerHTML = `
            <div class="ssw-wrap">
                <div class="ssw-card">
                    <h1>החלפת משמרת</h1>
                    ${body}
                </div>
            </div>`;
    }
}

if (!customElements.get('shift-swap')) {
    customElements.define('shift-swap', ShiftSwap);
}
