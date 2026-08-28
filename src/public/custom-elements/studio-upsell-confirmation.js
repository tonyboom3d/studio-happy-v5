/**
 * Wix Custom Element: studio-upsell-confirmation
 * ------------------------------------------------
 * Dedicated Thank You / Confirmation page for the in-person add-on upsell
 * system. Displays the order summary and, if enabled per workshop, the staff
 * confirmation code that on-site employees must verify.
 *
 * הוראות התקנה בוויקס:
 * 1. בעורך וויקס בעמוד "דף תודה מערכת תשלומים עצמאית": הוסף רכיב "Custom Element".
 * 2. "Tag Name": studio-upsell-confirmation
 * 3. ID מומלץ: studioUpsellThanks1
 * 4. העלה קובץ זה תחת "Source: Upload a file".
 *
 * תקשורת עם Velo (backend/studioUpsellService.web.js):
 *  - CE -> Velo: dispatchEvent('studio-upsell-thanks-action', { detail: { type, requestId, payload } })
 *  - Velo -> CE: setAttribute('thanks-data', JSON.stringify({ type, requestId, result }))
 */

const TAG_NAME = 'studio-upsell-confirmation';

const STYLE = `
    :host, .st-root { all: initial; }
    .st-root {
        display: block; direction: rtl; font-family: 'Heebo', Arial, sans-serif;
        color: #1f2933; box-sizing: border-box; max-width: 480px; margin: 0 auto; padding: 32px 16px 60px;
    }
    .st-root *, .st-root *::before, .st-root *::after { box-sizing: border-box; }
    .st-card { background: #fff; border-radius: 18px; padding: 28px 22px; box-shadow: 0 6px 24px rgba(31,41,51,0.08); border: 1px solid #eef0f2; text-align: center; }
    .st-icon { width: 64px; height: 64px; border-radius: 50%; background: #ecfdf5; color: #059669; font-size: 32px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .st-title { font-size: 21px; font-weight: 800; margin: 0 0 6px; color: #111827; }
    .st-subtitle { font-size: 14px; color: #6b7280; margin: 0 0 20px; line-height: 1.5; }
    .st-code-box { background: #eef2ff; border: 2px dashed #6366f1; border-radius: 14px; padding: 16px; margin-bottom: 20px; }
    .st-code-label { font-size: 13px; font-weight: 700; color: #4338ca; margin-bottom: 6px; }
    .st-code { font-size: 34px; font-weight: 900; letter-spacing: 6px; color: #3730a3; }
    .st-summary { text-align: right; background: #f9fafb; border-radius: 14px; padding: 16px; margin-bottom: 6px; }
    .st-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f2f4; font-size: 14px; }
    .st-row:last-child { border-bottom: none; }
    .st-row-title { color: #374151; }
    .st-row-value { font-weight: 700; color: #111827; }
    .st-total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; padding-top: 12px; margin-top: 8px; border-top: 2px solid #e5e7eb; }
    .st-loading { text-align: center; padding: 50px 0; color: #6b7280; font-size: 14px; }
    .st-spinner { width: 32px; height: 32px; border-radius: 50%; margin: 0 auto 12px; border: 3px solid #e0e7ff; border-top-color: #4f46e5; animation: st-spin .8s linear infinite; }
    @keyframes st-spin { to { transform: rotate(360deg); } }
    .st-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 10px; padding: 12px; font-size: 14px; }
`;

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function formatIls(n) {
    return `₪${(Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

class StudioUpsellConfirmationElement extends HTMLElement {
    static get observedAttributes() {
        return ['thanks-data'];
    }

    constructor() {
        super();
        this._requestSeq = 0;
        this._pollTimer = null;
        this._pollAttempts = 0;
        this._state = { status: 'loading', order: null, error: null };
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        this.setAttribute('lang', 'he');
        this.innerHTML = `<style>${STYLE}</style><div class="st-root" id="stRoot"></div>`;
        this.render();
        this._dispatch('confirm', {});
    }

    disconnectedCallback() {
        if (this._pollTimer) clearTimeout(this._pollTimer);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name !== 'thanks-data' || !newValue || newValue === oldValue) return;
        try {
            const { type, result } = JSON.parse(newValue);
            if (type === 'confirm' || type === 'summary') this._handleOrder(result);
        } catch (err) {
            console.error('[studio-upsell-confirmation] failed to parse thanks-data:', err);
        }
    }

    _dispatch(type, payload) {
        const requestId = `${type}_${++this._requestSeq}`;
        this.dispatchEvent(new CustomEvent('studio-upsell-thanks-action', {
            detail: { type, requestId, payload },
            bubbles: true,
        }));
    }

    _handleOrder(order) {
        if (!order) {
            // Not paid yet (webhook may still be in flight) — poll a few times before giving up.
            this._pollAttempts++;
            if (this._pollAttempts <= 5) {
                this._pollTimer = setTimeout(() => this._dispatch('summary', {}), 1500);
                return;
            }
            this._state = { status: 'error', order: null, error: 'לא הצלחנו לאתר את פרטי ההזמנה. אם בוצע תשלום, פנו לצוות הסטודיו.' };
            this.render();
            return;
        }

        if (order.status !== 'paid') {
            this._pollAttempts++;
            if (this._pollAttempts <= 8) {
                this._pollTimer = setTimeout(() => this._dispatch('summary', {}), 1500);
                return;
            }
        }

        this._state = { status: order.status === 'paid' ? 'paid' : 'pending', order, error: null };
        this.render();
    }

    render() {
        const root = this.querySelector('#stRoot');
        if (!root) return;
        const { status, order, error } = this._state;

        if (status === 'loading' || status === 'pending') {
            root.innerHTML = `<div class="st-card st-loading"><div class="st-spinner"></div>מאמתים את התשלום...</div>`;
            return;
        }

        if (status === 'error') {
            root.innerHTML = `<div class="st-card"><div class="st-error">${escapeHtml(error)}</div></div>`;
            return;
        }

        const items = Array.isArray(order.items) ? order.items : [];
        const itemsHtml = items.map((i) => `
            <div class="st-row">
                <span class="st-row-title">${escapeHtml(i.title)} × ${escapeHtml(i.quantity)}</span>
                <span class="st-row-value">${formatIls((Number(i.price) || 0) * (Number(i.quantity) || 0))}</span>
            </div>
        `).join('');

        const openAmountHtml = Number(order.openAmount) > 0 ? `
            <div class="st-row">
                <span class="st-row-title">סכום פתוח</span>
                <span class="st-row-value">${formatIls(order.openAmount)}</span>
            </div>
        ` : '';

        const codeHtml = order.staffCode ? `
            <div class="st-code-box">
                <div class="st-code-label">קוד אימות לצוות</div>
                <div class="st-code">${escapeHtml(order.staffCode)}</div>
            </div>
        ` : '';

        root.innerHTML = `
            <div class="st-card">
                <div class="st-icon">✓</div>
                <h1 class="st-title">התשלום התקבל בהצלחה!</h1>
                <p class="st-subtitle">${escapeHtml(order.workshopTitle ? `תודה על הרכישה — ${order.workshopTitle}` : 'תודה על הרכישה')}</p>
                ${codeHtml}
                <div class="st-summary">
                    ${itemsHtml || (openAmountHtml ? '' : '<div class="st-row"><span class="st-row-title">אין פריטים</span></div>')}
                    ${openAmountHtml}
                    <div class="st-total-row"><span>סה"כ שולם</span><span>${formatIls(order.total)}</span></div>
                </div>
            </div>
        `;
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, StudioUpsellConfirmationElement);
}
