/**
 * Wix Custom Element: shift-request-review
 * ------------------------------------------
 * עמוד אישור/דחיית בקשת שינוי או מחיקת משמרת (Module A) — נפתח מקישור
 * WhatsApp שנשלח למנהלים עם token.
 *
 * התקנה בוויקס:
 * 1. עמוד חדש (לא בתפריט) בכתובת /shift-request-review.
 * 2. Custom Element — Tag Name: shift-request-review, Source: קובץ זה.
 * 3. קוד העמוד: src/pages/shift-request-review.js.
 *
 * תקשורת:
 * - קלט:  attribute `request-data` — פרטי הבקשה / שגיאה.
 * - קלט:  attribute `decide-result` — תוצאת האישור/דחייה.
 * - פלט:  CustomEvent `review-action` עם detail = { decision: 'APPROVE'|'DECLINE', comment }.
 */

const SRR_STYLE = `
shift-request-review { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
shift-request-review * { box-sizing: border-box; }
.srr-wrap { max-width: 480px; margin: 0 auto; padding: 40px 16px; }
.srr-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 26px 22px; box-shadow: 0 2px 8px rgba(0,0,0,.06); text-align: center; }
.srr-card h1 { margin: 0 0 6px; font-size: 19px; }
.srr-sub { color: #6b7280; font-size: 13.5px; margin-bottom: 18px; }
.srr-detail { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px; font-size: 14.5px; margin-bottom: 14px; text-align: right; }
.srr-detail b { display: block; font-size: 16px; margin-bottom: 6px; text-align: center; }
.srr-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.srr-row span:first-child { color: #6b7280; }
.srr-notes { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px 10px; margin-top: 8px; color: #92400e; font-size: 13px; text-align: right; }
.srr-comment { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 11px; font-size: 13px; font-family: inherit; min-height: 64px; resize: vertical; margin-bottom: 14px; }
.srr-btns { display: flex; flex-direction: column; gap: 9px; }
.srr-btn { border: none; border-radius: 11px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }
.srr-approve { background: #059669; color: #fff; }
.srr-approve:hover { background: #047857; }
.srr-decline { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
.srr-decline:hover { background: #fef2f2; }
.srr-btn:disabled { opacity: .55; cursor: default; }
.srr-msg { border-radius: 12px; padding: 16px; font-size: 14.5px; font-weight: 600; }
.srr-msg.ok { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; }
.srr-msg.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.srr-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #2563eb; border-radius: 50%; margin: 20px auto; animation: srr-spin .8s linear infinite; }
@keyframes srr-spin { to { transform: rotate(360deg); } }
`;

function srrEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function srrFormatDate(dateKey) {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(y, m - 1, d));
    return `${dow}, ${d}.${m}.${y}`;
}

class ShiftRequestReview extends HTMLElement {
    static get observedAttributes() { return ['request-data', 'decide-result']; }

    constructor() {
        super();
        this._data = null;
        this._result = null;
        this._sending = false;
    }

    connectedCallback() {
        console.log('[shift-request-review] CE connected');
        if (!document.getElementById('srr-style')) {
            const style = document.createElement('style');
            style.id = 'srr-style';
            style.textContent = SRR_STYLE;
            document.head.appendChild(style);
        }
        this.render();
        this.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn || this._sending) return;
            const comment = this.querySelector('#srrComment')?.value || '';
            this._sending = true;
            this.render();
            console.log('[shift-request-review] action →', btn.dataset.action);
            this.dispatchEvent(new CustomEvent('review-action', {
                detail: { decision: btn.dataset.action, comment }, bubbles: true,
            }));
        });
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        try {
            if (name === 'request-data') this._data = JSON.parse(newVal);
            if (name === 'decide-result') { this._result = JSON.parse(newVal); this._sending = false; }
        } catch (err) {
            console.error('[shift-request-review] bad JSON attribute:', err);
            return;
        }
        console.log('[shift-request-review]', name, 'received');
        this.render();
    }

    _renderDetail(d) {
        const isDelete = d.type === 'DELETE';
        return `
            <div class="srr-detail">
                <b>${srrEsc(d.employeeName)}</b>
                <div class="srr-row"><span>סוג בקשה</span><span>${isDelete ? 'מחיקת משמרת' : 'שינוי שעות משמרת'}</span></div>
                <div class="srr-row"><span>משמרת קיימת</span><span>${srrFormatDate(d.originalDate)} · ${srrEsc(d.originalStartTime)}–${srrEsc(d.originalEndTime)}</span></div>
                ${!isDelete ? `<div class="srr-row"><span>שעות מבוקשות</span><span><b style="display:inline;color:#1d4ed8">${srrEsc(d.requestedStartTime)}–${srrEsc(d.requestedEndTime)}</b></span></div>` : ''}
                ${d.notes ? `<div class="srr-notes">📝 הערת העובד/ת: ${srrEsc(d.notes)}</div>` : ''}
            </div>`;
    }

    render() {
        let body;
        if (this._result) {
            if (this._result.error) {
                body = `<div class="srr-msg bad">${srrEsc(this._result.message || 'אירעה שגיאה. נסו שוב.')}</div>`;
            } else {
                const approved = this._result.status === 'APPROVED';
                body = `<div class="srr-msg ${approved ? 'ok' : 'bad'}">${approved ? 'הבקשה אושרה — העדכון בוצע במערכת. ✔' : 'הבקשה נדחתה. העובד/ת יעודכן/תעודכן.'}</div>`;
            }
        } else if (!this._data) {
            body = `<div class="srr-spinner"></div><div class="srr-sub">טוען את פרטי הבקשה…</div>`;
        } else if (this._data.error) {
            body = `<div class="srr-msg bad">${srrEsc(this._data.message || 'הקישור אינו תקף.')}</div>`;
        } else if (this._data.status && this._data.status !== 'PENDING') {
            const approved = this._data.status === 'APPROVED';
            body = `
                ${this._renderDetail(this._data)}
                <div class="srr-msg ${approved ? 'ok' : 'bad'}">הבקשה הזו כבר ${approved ? 'אושרה' : 'נדחתה'}${this._data.managerComment ? ` — הערה: ${srrEsc(this._data.managerComment)}` : ''}.</div>`;
        } else {
            body = `
                ${this._renderDetail(this._data)}
                <textarea id="srrComment" class="srr-comment" placeholder="הערה למנהל/ת (לא חובה)"></textarea>
                <div class="srr-btns">
                    <button class="srr-btn srr-approve" data-action="APPROVE" ${this._sending ? 'disabled' : ''}>${this._sending ? 'שולח…' : '✔ אישור הבקשה'}</button>
                    <button class="srr-btn srr-decline" data-action="DECLINE" ${this._sending ? 'disabled' : ''}>✕ דחיית הבקשה</button>
                </div>`;
        }

        this.innerHTML = `
            <div class="srr-wrap">
                <div class="srr-card">
                    <h1>בקשת עובד/ת</h1>
                    <div class="srr-sub">נא לעבור על פרטי הבקשה ולהחליט:</div>
                    ${body}
                </div>
            </div>`;
    }
}

if (!customElements.get('shift-request-review')) {
    customElements.define('shift-request-review', ShiftRequestReview);
}
