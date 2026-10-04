/**
 * Wix Custom Element: pickup-confirm
 * ------------------------------------
 * דף "אישור לאיסוף פריטים" — לעובדי הסטודיו בלבד. העובד סורק את ה-QR מהמסך של
 * הלקוח, רואה את פרטי ההזמנה ותמונות כל הפריטים (עם סימון של אלה שמוכנים
 * לאיסוף), מזין קוד אימות ומאשר מסירה.
 *
 * התקנה בוויקס:
 * 1. עמוד "אישור לאיסוף פריטים" (Members only), כתובת: /pickup-confirm.
 * 2. Custom Element — Tag Name: pickup-confirm, Source: קובץ זה.
 * 3. Element ID בעמוד: #pickupConfirm1.
 *
 * תקשורת:
 * - קלט:  attribute `context-data` — תוצאת getPickupScanContext (או {loading}/{error}).
 * - קלט:  attribute `handover-result` — תוצאת confirmPickupHandoverScan.
 * - פלט:  CustomEvent `confirm-handover` עם detail = { code }.
 * - פלט:  CustomEvent `login-request` (כשנדרשת התחברות).
 */

const PC_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap');
pickup-confirm { display: block; direction: rtl; font-family: 'Rubik', 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
pickup-confirm * { box-sizing: border-box; font-family: inherit; }
.pc-wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px 60px; }
.pc-head { text-align: center; margin-bottom: 14px; }
.pc-head h1 { margin: 0 0 4px; font-size: 20px; color: #581E83; }
.pc-sub { color: #6b7280; font-size: 13.5px; }
.pc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 14px; font-size: 14px; line-height: 1.7; }
.pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.pc-item { position: relative; background: #fff; border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.pc-item.pc-ready { border-color: #f59e0b; box-shadow: 0 0 0 3px #fef3c7; }
.pc-item.pc-collected { border-color: #10b981; opacity: .8; }
.pc-item.pc-pending { opacity: .7; }
.pc-item-img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; background: #f3f4f6; display: block; }
.pc-item-noimg { width: 100%; aspect-ratio: 1 / 1; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }
.pc-item-body { padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 13px; font-weight: 600; }
.pc-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.pc-badge-ready { background: #f59e0b; color: #fff; }
.pc-badge-done { background: #d1fae5; color: #065f46; }
.pc-badge-pending { background: #e5e7eb; color: #4b5563; }
.pc-field { display: block; width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 12px; font-size: 16px; margin-top: 8px; text-align: center; letter-spacing: 4px; }
.pc-inline-error { color: #b91c1c; font-size: 13px; margin-top: 8px; font-weight: 600; text-align: center; }
.pc-submit { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: 15.5px; font-weight: 700; cursor: pointer; background: #5E2F88; color: #fff; margin-top: 12px; }
.pc-submit:hover:not(:disabled) { background: #7B3DB0; }
.pc-submit:disabled { opacity: .5; cursor: default; }
.pc-msg { border-radius: 12px; padding: 20px 16px; font-size: 14.5px; font-weight: 600; text-align: center; margin-bottom: 14px; }
.pc-msg.pc-bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.pc-msg.pc-good { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
.pc-link-btn { display: inline-block; margin-top: 10px; border: none; border-radius: 10px; padding: 10px 18px; background: #5E2F88; color: #fff; font-weight: 700; cursor: pointer; }
.pc-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #5E2F88; border-radius: 50%; margin: 30px auto; animation: pc-spin .8s linear infinite; }
@keyframes pc-spin { to { transform: rotate(360deg); } }
`;

const ERROR_MESSAGES = {
    NOT_FOUND: 'הקוד אינו תקין.',
    PASS_EXPIRED: 'הקוד פג תוקף. ניתן לתאם איסוף מחדש דרך הבוט בוואטסאפ.',
    REPLACED: 'תיאום האיסוף הזה הוחלף במועד אחר, ולכן הקוד אינו פעיל.',
    ALREADY_COLLECTED: 'הפריטים כבר נאספו והקוד אינו פעיל עוד.',
    ACCESS_DENIED: 'אין לך הרשאה לאשר איסוף. יש להתחבר עם משתמש צוות.',
    PERMISSION_DENIED: 'אין לך הרשאה לאשר איסוף. יש להתחבר עם משתמש צוות.',
    BAD_CODE: 'קוד האימות שגוי.',
    LOCKED: 'בוצעו יותר מדי ניסיונות שגויים. נסו שוב בעוד מספר דקות.',
    NO_ITEMS: 'אין פריטים הממתינים לאיסוף בהזמנה זו.',
};

function pcEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const IL_TZ = 'Asia/Jerusalem';

class PickupConfirm extends HTMLElement {
    static get observedAttributes() { return ['context-data', 'handover-result']; }

    constructor() {
        super();
        this._context = null;
        this._contextError = null;
        this._bootstrapMessage = 'טוענים את פרטי ההזמנה…';
        this._code = '';
        this._sending = false;
        this._inlineError = null;
        this._bound = false;
    }

    _ensureStyles() {
        if (document.getElementById('pc-style')) return;
        const style = document.createElement('style');
        style.id = 'pc-style';
        style.textContent = PC_STYLE;
        document.head.appendChild(style);
    }

    connectedCallback() {
        this._ensureStyles();
        this.render();
        if (this._bound) return;
        this._bound = true;

        this.addEventListener('input', (e) => {
            if (e.target?.dataset?.field === 'code') this._code = e.target.value;
        });

        this.addEventListener('click', (e) => {
            if (e.target.closest('[data-login]')) {
                this.dispatchEvent(new CustomEvent('login-request', { bubbles: true }));
                return;
            }
            const btn = e.target.closest('[data-confirm]');
            if (!btn || this._sending || this._context?.state !== 'ready') return;
            if (!this._code.trim()) {
                this._inlineError = 'יש להזין קוד אימות.';
                this.render();
                return;
            }
            this._inlineError = null;
            this._sending = true;
            this.render();
            this.dispatchEvent(new CustomEvent('confirm-handover', { detail: { code: this._code.trim() }, bubbles: true }));
        });
    }

    attributeChangedCallback(name, _old, newVal) {
        if (!newVal) return;
        try {
            const data = JSON.parse(newVal);
            if (name === 'context-data') {
                if (data.loading) {
                    this._context = null;
                    this._contextError = null;
                    this._bootstrapMessage = data.message || 'טוענים…';
                } else if (data.error) {
                    this._contextError = data;
                    this._context = null;
                } else {
                    this._context = data;
                    this._contextError = null;
                }
            }
            if (name === 'handover-result') {
                this._sending = false;
                if (data.ok) {
                    this._context = { ...this._context, state: 'collected', collectedBy: data.collectedBy, collectedAt: data.collectedAt };
                    this._code = '';
                } else if (['PASS_EXPIRED', 'REPLACED', 'ALREADY_COLLECTED', 'ACCESS_DENIED', 'PERMISSION_DENIED', 'NOT_FOUND'].includes(data.code)) {
                    this._contextError = data;
                } else {
                    this._inlineError = ERROR_MESSAGES[data.code] || data.message || 'האישור נכשל. נסו שוב.';
                }
            }
        } catch (err) {
            console.error('[pickup-confirm] bad JSON attribute:', err);
            return;
        }
        if (this.isConnected) this.render();
    }

    _renderItem(item) {
        const cls = item.state === 'ready' ? 'pc-ready' : item.state === 'collected' ? 'pc-collected' : 'pc-pending';
        const badge = item.state === 'ready'
            ? '<span class="pc-badge pc-badge-ready">מוכן לאיסוף</span>'
            : item.state === 'collected'
                ? '<span class="pc-badge pc-badge-done">נאסף</span>'
                : '<span class="pc-badge pc-badge-pending">לא סומן</span>';
        const img = item.img
            ? `<img class="pc-item-img" src="${pcEsc(item.img)}" alt="${pcEsc(item.label)}">`
            : '<div class="pc-item-noimg">אין תמונה</div>';
        return `<div class="pc-item ${cls}">${img}<div class="pc-item-body"><span>${pcEsc(item.label)}</span>${badge}</div></div>`;
    }

    render() {
        if (this._contextError) {
            const code = this._contextError.code;
            const message = ERROR_MESSAGES[code] || this._contextError.message || 'אירעה שגיאה.';
            const needsLogin = code === 'ACCESS_DENIED' || code === 'PERMISSION_DENIED';
            this.innerHTML = `<div class="pc-wrap"><div class="pc-msg pc-bad">${pcEsc(message)}${needsLogin ? '<br/><button type="button" class="pc-link-btn" data-login>התחברות</button>' : ''}</div></div>`;
            return;
        }

        if (!this._context) {
            this.innerHTML = `<div class="pc-wrap"><div class="pc-head"><h1>אישור לאיסוף פריטים</h1></div><div class="pc-spinner"></div><div class="pc-sub" style="text-align:center">${pcEsc(this._bootstrapMessage)}</div></div>`;
            return;
        }

        const c = this._context;
        const items = c.items || [];
        const readyCount = items.filter((i) => i.state === 'ready').length;
        const details = `
            <div class="pc-card">
                <div><strong>${pcEsc(c.organizerName)}</strong>${c.organizerPhone ? ` · <span dir="ltr">${pcEsc(c.organizerPhone)}</span>` : ''}</div>
                <div>מועד איסוף: ${pcEsc(c.slotLabel)} (${pcEsc(c.workshopName)})</div>
                <div>מוכנים למסירה: <strong>${readyCount}</strong> מתוך ${items.length}</div>
                ${c.staffName ? `<div class="pc-sub">מחובר/ת כ: ${pcEsc(c.staffName)}</div>` : ''}
            </div>
            <div class="pc-grid">${items.map((i) => this._renderItem(i)).join('')}</div>`;

        if (c.state === 'collected') {
            const when = c.collectedAt
                ? new Intl.DateTimeFormat('he-IL', { timeZone: IL_TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(c.collectedAt))
                : '';
            this.innerHTML = `
                <div class="pc-wrap">
                    <div class="pc-head"><h1>אישור לאיסוף פריטים</h1></div>
                    <div class="pc-msg pc-good">✅ הפריטים נאספו${c.collectedBy ? ` — אושר ע"י ${pcEsc(c.collectedBy)}` : ''}${when ? ` (${pcEsc(when)})` : ''}.<br/>הקוד אינו פעיל עוד.</div>
                    ${details}
                </div>`;
            return;
        }

        this.innerHTML = `
            <div class="pc-wrap">
                <div class="pc-head"><h1>אישור לאיסוף פריטים</h1><div class="pc-sub">בדקו שהפריטים המסומנים תואמים למה שנמסר ללקוח</div></div>
                ${details}
                <div class="pc-card">
                    <label>קוד אימות</label>
                    <input class="pc-field" data-field="code" type="password" inputmode="numeric" autocomplete="off" placeholder="••••" value="${pcEsc(this._code)}" ${this._sending ? 'disabled' : ''}>
                    ${this._inlineError ? `<div class="pc-inline-error">${pcEsc(this._inlineError)}</div>` : ''}
                    <button type="button" class="pc-submit" data-confirm ${this._sending || !readyCount ? 'disabled' : ''}>${this._sending ? 'מאשר…' : 'אישור מסירה'}</button>
                </div>
            </div>`;
    }
}

if (!customElements.get('pickup-confirm')) {
    customElements.define('pickup-confirm', PickupConfirm);
}
