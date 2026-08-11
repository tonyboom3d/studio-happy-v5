/**
 * Wix Custom Element: pending-actions
 * ------------------------------------
 * עמוד פעולות ממתינות מרוכז (Phase 3) — נפתח מקישור WhatsApp יחיד עם token,
 * ומרכז את כל הפריטים הפתוחים של העובד/ת: אישורי הגעה למשמרות, הצעות
 * שיבוץ (רשימת המתנה), ובקשות החלפה נכנסות — עם אישור/דחייה בכל פריט
 * בנפרד, וכפתורי "אשר הכל" / "דחה הכל" לפעולה מרוכזת.
 *
 * התקנה בוויקס:
 * 1. עמוד חדש (לא בתפריט) בכתובת /pending-actions.
 * 2. Custom Element — Tag Name: pending-actions, Source: קובץ זה.
 * 3. קוד העמוד: src/pages/pending-actions.js.
 *
 * תקשורת:
 * - קלט:  attribute `items-data` — { displayName, items[] } או שגיאה.
 * - קלט:  attribute `respond-result` — { ok, results[] }.
 * - פלט:  CustomEvent `submit-decisions` עם detail = { decisions: [...] }.
 */

const PA_STYLE = `
pending-actions { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
pending-actions * { box-sizing: border-box; }
.pa-wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px 60px; }
.pa-head { text-align: center; margin-bottom: 18px; }
.pa-head h1 { margin: 0 0 4px; font-size: 19px; }
.pa-head .pa-sub { color: #6b7280; font-size: 13.5px; }
.pa-bulk { display: flex; gap: 8px; margin-bottom: 16px; }
.pa-bulk button { flex: 1; border-radius: 11px; padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; border: none; }
.pa-approve-all { background: #059669; color: #fff; }
.pa-approve-all:hover { background: #047857; }
.pa-decline-all { background: #fff; color: #b91c1c; border: 1px solid #fecaca !important; }
.pa-decline-all:hover { background: #fef2f2; }
.pa-decline-all.pa-confirming { background: #b91c1c; color: #fff; }
.pa-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
.pa-card-title { font-weight: 700; font-size: 14.5px; margin-bottom: 2px; }
.pa-card-sub { color: #4b5563; font-size: 13px; margin-bottom: 10px; }
.pa-card-btns { display: flex; gap: 8px; }
.pa-card-btns button { flex: 1; border-radius: 9px; padding: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
.pa-accept { background: #ecfdf5; color: #065f46; border-color: #6ee7b7 !important; }
.pa-accept.pa-selected { background: #059669; color: #fff; }
.pa-decline { background: #fef2f2; color: #991b1b; border-color: #fecaca !important; }
.pa-decline.pa-selected { background: #b91c1c; color: #fff; }
.pa-status { font-size: 12.5px; font-weight: 700; padding: 3px 0; }
.pa-status.ok { color: #059669; }
.pa-status.bad { color: #b91c1c; }
.pa-empty { text-align: center; color: #6b7280; font-size: 14.5px; padding: 40px 10px; }
.pa-submit { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: 15.5px; font-weight: 700; cursor: pointer; font-family: inherit; background: #4f46e5; color: #fff; margin-top: 8px; }
.pa-submit:disabled { opacity: .5; cursor: default; }
.pa-msg { border-radius: 12px; padding: 16px; font-size: 14.5px; font-weight: 600; text-align: center; }
.pa-msg.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.pa-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; margin: 30px auto; animation: pa-spin .8s linear infinite; }
@keyframes pa-spin { to { transform: rotate(360deg); } }
`;

function paEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class PendingActions extends HTMLElement {
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
        console.log('[pending-actions] CE connected');
        if (!document.getElementById('pa-style')) {
            const style = document.createElement('style');
            style.id = 'pa-style';
            style.textContent = PA_STYLE;
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
                        return { itemId, itemType: item?.itemType, action };
                    })
                    .filter(d => d.itemType);
                if (!decisions.length) return;
                this._sending = true;
                this.render();
                console.log('[pending-actions] submitting', decisions.length, 'decisions');
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
            console.error('[pending-actions] bad JSON attribute:', err);
            return;
        }
        console.log('[pending-actions]', name, 'received');
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
                ? `<div class="pa-status ok">✔ טופל בהצלחה</div>`
                : `<div class="pa-status bad">${paEsc(result.error || 'שגיאה בטיפול בפריט')}</div>`)
            : '';
        return `
            <div class="pa-card">
                <div class="pa-card-title">${paEsc(item.title)}</div>
                <div class="pa-card-sub">${paEsc(item.subtitle)}</div>
                ${statusLine}
                <div class="pa-card-btns">
                    <button class="pa-accept ${decision === 'accept' ? 'pa-selected' : ''}" data-item-id="${paEsc(item.itemId)}" data-decide="accept" ${this._sending ? 'disabled' : ''}>✔ מאשר/ת</button>
                    <button class="pa-decline ${decision === 'decline' ? 'pa-selected' : ''}" data-item-id="${paEsc(item.itemId)}" data-decide="decline" ${this._sending ? 'disabled' : ''}>✘ דוחה</button>
                </div>
            </div>`;
    }

    render() {
        if (!this._data) {
            this.innerHTML = `<div class="pa-wrap"><div class="pa-spinner"></div><div class="pa-head"><div class="pa-sub">טוען פריטים ממתינים…</div></div></div>`;
            return;
        }
        if (this._data.error) {
            this.innerHTML = `<div class="pa-wrap"><div class="pa-msg bad">${paEsc(this._data.message || 'הקישור אינו תקף.')}</div></div>`;
            return;
        }

        const items = this._data.items || [];
        const openItems = this._openItems();
        const decidedCount = Object.keys(this._decisions).filter(id => !this._results[id]?.ok).length;

        let body;
        if (!items.length) {
            body = `<div class="pa-empty">אין פריטים ממתינים לאישור כרגע 🎉</div>`;
        } else {
            body = `
                <div class="pa-bulk">
                    <button class="pa-approve-all" data-approve-all ${this._sending || !openItems.length ? 'disabled' : ''}>✔ אשר את הכל (${openItems.length})</button>
                    <button class="pa-decline-all ${this._declineAllArmed ? 'pa-confirming' : ''}" data-decline-all ${this._sending || !openItems.length ? 'disabled' : ''}>${this._declineAllArmed ? 'לחצ/י שוב לאישור דחייה' : 'דחה את הכל'}</button>
                </div>
                ${items.map(item => this._renderCard(item)).join('')}
                <button class="pa-submit" data-submit ${this._sending || !decidedCount ? 'disabled' : ''}>${this._sending ? 'שולח…' : `שליחת ${decidedCount || ''} החלטות`}</button>`;
        }

        this.innerHTML = `
            <div class="pa-wrap">
                <div class="pa-head">
                    <h1>הפעולות הממתינות שלך</h1>
                    <div class="pa-sub">${this._data.displayName ? `היי ${paEsc(this._data.displayName)}, ` : ''}סמנ/י אישור או דחייה לכל פריט ולחצ/י על שליחה.</div>
                </div>
                ${body}
            </div>`;
    }
}

if (!customElements.get('pending-actions')) {
    customElements.define('pending-actions', PendingActions);
}
