/**
 * Wix Custom Element: promo-popup
 * --------------------------------
 * Site-wide promo popup for the "טאפטינג + קרמיקה במתנה" campaign.
 * Only ever shown/hidden based on the `campaign-data` attribute set by Velo
 * (src/pages/masterPage.js) — this element never calls the backend itself.
 *
 * הוראות התקנה בוויקס (masterPage — כל האתר):
 * 1. בעורך וויקס: הוסף רכיב "Custom Element" ל-masterPage (Elements Panel > Embed > Custom Element).
 * 2. הגדר "Tag Name" בדיוק לפי הערך: promo-popup
 * 3. תן לרכיב את ה-ID: promoPopup1 (או עדכן PROMO_POPUP_ELEMENT_ID ב-masterPage.js)
 * 4. העלה קובץ זה תחת "Source: Upload a file".
 * 5. הרכיב עצמו לא תופס מקום בלייאאוט — הוא רק מציג overlay כשיש קמפיין פעיל.
 *
 * תקשורת עם Velo (src/pages/masterPage.js):
 *  - Velo -> CE: setAttribute('campaign-data', JSON.stringify({ show, title, subtitle, ctaText, ctaUrl, termsText }))
 */

const TAG_NAME = 'promo-popup';
const DISMISS_KEY_PREFIX = 'sh_promo_dismissed_';

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

const STYLE = `
    :host { all: initial; }
    .pp-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(20, 12, 8, 0.55);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        font-family: Arial, Helvetica, sans-serif;
        animation: pp-fade-in .25s ease-out;
    }
    @keyframes pp-fade-in { from { opacity: 0; } to { opacity: 1; } }
    .pp-card {
        position: relative;
        background: #fffaf3;
        border-radius: 20px;
        max-width: 440px; width: 100%;
        max-height: 90vh; overflow-y: auto;
        padding: 32px 28px 26px;
        box-shadow: 0 24px 60px rgba(0,0,0,.35);
        text-align: center;
        direction: rtl;
        animation: pp-pop-in .3s cubic-bezier(.2,.9,.3,1.2);
    }
    @keyframes pp-pop-in { from { transform: scale(.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .pp-close {
        position: absolute; top: 12px; inset-inline-end: 12px;
        width: 34px; height: 34px; border-radius: 50%; border: none;
        background: rgba(0,0,0,.06); color: #6b5b4d; font-size: 18px; line-height: 1;
        cursor: pointer;
    }
    .pp-close:hover { background: rgba(0,0,0,.12); }
    .pp-emoji { font-size: 40px; margin-bottom: 6px; }
    .pp-title { font-size: 22px; font-weight: 800; color: #3d2b1f; margin: 0 0 8px; line-height: 1.3; }
    .pp-subtitle { font-size: 15px; color: #6b5b4d; margin: 0 0 22px; line-height: 1.6; white-space: pre-wrap; }
    .pp-cta {
        display: inline-block; width: 100%; box-sizing: border-box;
        background: #c65d2e; color: #fff; font-weight: 700; font-size: 16px;
        border: none; border-radius: 12px; padding: 14px 20px; cursor: pointer;
        text-decoration: none;
    }
    .pp-cta:hover { background: #b04f24; }
    .pp-terms-toggle {
        margin-top: 16px; background: none; border: none; color: #8a7462;
        font-size: 13px; text-decoration: underline; cursor: pointer; padding: 4px;
    }
    .pp-terms {
        margin-top: 10px; text-align: right; font-size: 12px; color: #8a7462;
        white-space: pre-wrap; line-height: 1.6; max-height: 220px; overflow-y: auto;
        background: rgba(0,0,0,.03); border-radius: 10px; padding: 12px;
    }
    .pp-hidden { display: none !important; }
`;

class PromoPopupElement extends HTMLElement {
    static get observedAttributes() {
        return ['campaign-data'];
    }

    constructor() {
        super();
        this._campaign = null;
        this._termsOpen = false;
    }

    connectedCallback() {
        this.innerHTML = `<style>${STYLE}</style><div id="ppRoot"></div>`;
        this._root = this.querySelector('#ppRoot');
        this._hydrateFromAttribute();
        this._render();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name !== 'campaign-data' || newValue === oldValue) return;
        this._hydrateFromAttribute();
        if (this._root) this._render();
    }

    _hydrateFromAttribute() {
        const raw = this.getAttribute('campaign-data');
        if (!raw) { this._campaign = null; return; }
        try {
            this._campaign = JSON.parse(raw);
        } catch (err) {
            console.error('[promo-popup] failed to parse campaign-data:', err);
            this._campaign = null;
        }
    }

    _dismissKey() {
        const c = this._campaign || {};
        // Keyed by content, not just "on/off" — if the studio changes the offer
        // text/CTA, previously-dismissed visitors will see the new popup once.
        return `${DISMISS_KEY_PREFIX}${(c.title || '') + (c.ctaUrl || '')}`.slice(0, 200);
    }

    _isDismissed() {
        try {
            return localStorage.getItem(this._dismissKey()) === '1';
        } catch (_) {
            return false;
        }
    }

    _dismiss() {
        try {
            localStorage.setItem(this._dismissKey(), '1');
        } catch (_) { /* private browsing / storage disabled — just close for this view */ }
        this._render(true);
    }

    _render(forceHidden = false) {
        const c = this._campaign;
        if (!c?.show || forceHidden || this._isDismissed()) {
            this._root.innerHTML = '';
            return;
        }

        const termsHtml = c.termsText
            ? `<button type="button" class="pp-terms-toggle" id="ppTermsToggle">${this._termsOpen ? 'הסתרת תנאי המבצע' : 'תנאי המבצע'}</button>
               <div class="pp-terms ${this._termsOpen ? '' : 'pp-hidden'}" id="ppTermsBox">${escapeHtml(c.termsText)}</div>`
            : '';

        this._root.innerHTML = `
            <div class="pp-overlay" id="ppOverlay">
                <div class="pp-card" role="dialog" aria-modal="true">
                    <button type="button" class="pp-close" id="ppClose" aria-label="סגירה">×</button>
                    <div class="pp-emoji">🎁</div>
                    <h2 class="pp-title">${escapeHtml(c.title || 'מבצע מיוחד')}</h2>
                    <p class="pp-subtitle">${escapeHtml(c.subtitle || '')}</p>
                    <a href="${escapeHtml(c.ctaUrl || '#')}" class="pp-cta" id="ppCta">${escapeHtml(c.ctaText || 'להזמנה')}</a>
                    ${termsHtml}
                </div>
            </div>
        `;

        this._root.querySelector('#ppClose')?.addEventListener('click', () => this._dismiss());
        this._root.querySelector('#ppOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'ppOverlay') this._dismiss();
        });
        this._root.querySelector('#ppCta')?.addEventListener('click', () => this._dismiss());
        this._root.querySelector('#ppTermsToggle')?.addEventListener('click', () => {
            this._termsOpen = !this._termsOpen;
            this._render();
        });
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, PromoPopupElement);
}
