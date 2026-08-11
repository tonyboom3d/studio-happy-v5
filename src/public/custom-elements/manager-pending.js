/**
 * Wix Custom Element: manager-pending
 * -------------------------------------
 * עמוד פעולות ממתינות מרוכז למנהלים (Phase 3) — נפתח מקישור WhatsApp יחיד
 * עם token, ומרכז את כל הבקשות הפתוחות: אישורי החלפת משמרת, בקשות
 * שינוי/מחיקת משמרת, והתראות "אין אישור הגעה" — עם אישור/דחייה בכל פריט
 * בנפרד, וכפתורי "אשר הכל" / "דחה הכל" לפעולה מרוכזת.
 *
 * התקנה בוויקס:
 * 1. עמוד חדש (לא בתפריט) בכתובת /manager-pending.
 * 2. Custom Element — Tag Name: manager-pending, Source: קובץ זה.
 * 3. קוד העמוד: src/pages/manager-pending.js.
 *
 * תקשורת:
 * - קלט:  attribute `items-data` — { displayName, items[] } או שגיאה.
 * - קלט:  attribute `respond-result` — { ok, results[] }.
 * - פלט:  CustomEvent `submit-decisions` עם detail = { decisions: [...] }.
 */

const MP_STYLE = `
manager-pending { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
manager-pending * { box-sizing: border-box; }
.mp-wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px 60px; }
.mp-head { text-align: center; margin-bottom: 18px; }
.mp-head h1 { margin: 0 0 4px; font-size: 19px; }
.mp-head .mp-sub { color: #6b7280; font-size: 13.5px; }
.mp-bulk { display: flex; gap: 8px; margin-bottom: 16px; }
.mp-bulk button { flex: 1; border-radius: 11px; padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; border: none; }
.mp-approve-all { background: #059669; color: #fff; }
.mp-approve-all:hover { background: #047857; }
.mp-decline-all { background: #fff; color: #b91c1c; border: 1px solid #fecaca !important; }
.mp-decline-all:hover { background: #fef2f2; }
.mp-decline-all.mp-confirming { background: #b91c1c; color: #fff; }
.mp-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
.mp-card-title { font-weight: 700; font-size: 14.5px; margin-bottom: 2px; }
.mp-card-sub { color: #4b5563; font-size: 13px; margin-bottom: 10px; }
.mp-comment { width: 100%; border: 1px solid #d1d5db; border-radius: 9px; padding: 7px 9px; font-size: 12.5px; font-family: inherit; margin-bottom: 8px; }
.mp-card-btns { display: flex; gap: 8px; }
.mp-card-btns button { flex: 1; border-radius: 9px; padding: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
.mp-accept { background: #ecfdf5; color: #065f46; border-color: #6ee7b7 !important; }
.mp-accept.mp-selected { background: #059669; color: #fff; }
.mp-decline { background: #fef2f2; color: #991b1b; border-color: #fecaca !important; }
.mp-decline.mp-selected { background: #b91c1c; color: #fff; }
.mp-status { font-size: 12.5px; font-weight: 700; padding: 3px 0; }
.mp-status.ok { color: #059669; }
.mp-status.bad { color: #b91c1c; }
.mp-empty { text-align: center; color: #6b7280; font-size: 14.5px; padding: 40px 10px; }
.mp-submit { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: 15.5px; font-weight: 700; cursor: pointer; font-family: inherit; background: #4f46e5; color: #fff; margin-top: 8px; }
.mp-submit:disabled { opacity: .5; cursor: default; }
.mp-msg { border-radius: 12px; padding: 16px; font-size: 14.5px; font-weight: 600; text-align: center; }
.mp-msg.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.mp-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; margin: 30px auto; animation: mp-spin .8s linear infinite; }
@keyframes mp-spin { to { transform: rotate(360deg); } }
`;

function mpEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class ManagerPending extends HTMLElement {
    static get observedAttributes() { return ['items-data', 'respond-result']; }

    constructor() {
        super();
        this._data = null;
        this._decisions = {}; // itemId -> 'accept'|'decline'
        this._results = {};   // itemId -> { ok, error }
        this._sending = false;
        this._declineAllArmed = false;
    }

    connectedCallback() {
        console.log('[manager-pending] CE connected');
        if (!document.getElementById('mp-style')) {
            const style = document.createElement('style');
            style.id = 'mp-style';
            style.textContent = MP_STYLE;
            document.head.appendChild(style);
        }
        this.render();

        this.addEventListener('click', (e) => {
            const decideBtn = e.target.closest('[data-decide]');
            if (decideBtn && !this._sending) {
                const { itemId, decide } = decideBtn.dataset;
                this._decisions[itemId] = decide;
                this._declineAllArmed = false;
                this.render();
                return;
            }

            const approveAllBtn = e.target.closest('[data-approve-all]');
            if (approveAllBtn && !this._sending) {
                for (const item of this._openItems()) this._decisions[item.itemId] = 'accept';
                this._declineAllArmed = false;
                this.render();
                return;
            }

            const declineAllBtn = e.target.closest('[data-decline-all]');
            if (declineAllBtn && !this._sending) {
                if (!this._declineAllArmed) {
                    this._declineAllArmed = true;
                    this.render();
                    return;
                }
                for (const item of this._openItems()) this._decisions[item.itemId] = 'decline';
                this._declineAllArmed = false;
                this.render();
                return;
            }

            const submitBtn = e.target.closest('[data-submit]');
            if (submitBtn && !this._sending) {
                const decisions = Object.entries(this._decisions)
                    .filter(([itemId]) => !this._results[itemId]?.ok)
                    .map(([itemId, action]) => {
                        const item = (this._data?.items || []).find(i => i.itemId === itemId);
                        const comment = this.querySelector(`[data-comment-for="${itemId}"]`)?.value || '';
                        return { itemId, itemType: item?.itemType, action, comment };
                    })
                    .filter(d => d.itemType);
                if (!decisions.length) return;
                this._sending = true;
                this.render();
                console.log('[manager-pending] submitting', decisions.length, 'decisions');
                this.dispatchEvent(new CustomEvent('submit-decisions', { detail: { decisions }, bubbles: true }));
            }
        });
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        try {
            if (name === 'items-data') {
                this._data = JSON.parse(newVal);
                this._decisions = {};
                this._results = {};
            }
            if (name === 'respond-result') {
                const result = JSON.parse(newVal);
                this._sending = false;
                if (result?.results) {
                    for (const r of result.results) this._results[r.itemId] = r;
                }
            }
        } catch (err) {
            console.error('[manager-pending] bad JSON attribute:', err);
            return;
        }
        console.log('[manager-pending]', name, 'received');
        this.render();
    }

    _openItems() {
        return (this._data?.items || []).filter(i => !this._results[i.itemId]?.ok);
    }

    _renderCard(item) {
        const decision = this._decisions[item.itemId];
        const result = this._results[item.itemId];
        const statusLine = result
            ? (result.ok
                ? `<div class="mp-status ok">✔ טופל בהצלחה</div>`
                : `<div class="mp-status bad">${mpEsc(result.error || 'שגיאה בטיפול בפריט')}</div>`)
            : '';
        return `
            <div class="mp-card">
                <div class="mp-card-title">${mpEsc(item.title)}</div>
                <div class="mp-card-sub">${mpEsc(item.subtitle)}</div>
                ${statusLine}
                <input class="mp-comment" data-comment-for="${mpEsc(item.itemId)}" placeholder="הערה (לא חובה)" ${this._sending ? 'disabled' : ''} />
                <div class="mp-card-btns">
                    <button class="mp-accept ${decision === 'accept' ? 'mp-selected' : ''}" data-item-id="${mpEsc(item.itemId)}" data-decide="accept" ${this._sending ? 'disabled' : ''}>✔ אשר</button>
                    <button class="mp-decline ${decision === 'decline' ? 'mp-selected' : ''}" data-item-id="${mpEsc(item.itemId)}" data-decide="decline" ${this._sending ? 'disabled' : ''}>✘ דחה</button>
                </div>
            </div>`;
    }

    render() {
        if (!this._data) {
            this.innerHTML = `<div class="mp-wrap"><div class="mp-spinner"></div><div class="mp-head"><div class="mp-sub">טוען פריטים ממתינים…</div></div></div>`;
            return;
        }
        if (this._data.error) {
            this.innerHTML = `<div class="mp-wrap"><div class="mp-msg bad">${mpEsc(this._data.message || 'הקישור אינו תקף.')}</div></div>`;
            return;
        }

        const items = this._data.items || [];
        const openItems = this._openItems();
        const decidedCount = Object.keys(this._decisions).filter(id => !this._results[id]?.ok).length;

        let body;
        if (!items.length) {
            body = `<div class="mp-empty">אין פריטים הממתינים לאישור מנהל/ת כרגע 🎉</div>`;
        } else {
            body = `
                <div class="mp-bulk">
                    <button class="mp-approve-all" data-approve-all ${this._sending || !openItems.length ? 'disabled' : ''}>✔ אשר את הכל (${openItems.length})</button>
                    <button class="mp-decline-all ${this._declineAllArmed ? 'mp-confirming' : ''}" data-decline-all ${this._sending || !openItems.length ? 'disabled' : ''}>${this._declineAllArmed ? 'לחצ/י שוב לאישור דחייה' : 'דחה את הכל'}</button>
                </div>
                ${items.map(item => this._renderCard(item)).join('')}
                <button class="mp-submit" data-submit ${this._sending || !decidedCount ? 'disabled' : ''}>${this._sending ? 'שולח…' : `שליחת ${decidedCount || ''} החלטות`}</button>`;
        }

        this.innerHTML = `
            <div class="mp-wrap">
                <div class="mp-head">
                    <h1>בקשות ממתינות לאישור</h1>
                    <div class="mp-sub">${this._data.displayName ? `היי ${mpEsc(this._data.displayName)}, ` : ''}סמנ/י אישור או דחייה לכל פריט ולחצ/י על שליחה.</div>
                </div>
                ${body}
            </div>`;
    }
}

if (!customElements.get('manager-pending')) {
    customElements.define('manager-pending', ManagerPending);
}
