/**
 * Wix Custom Element: studio-upsell
 * ----------------------------------
 * Customer-facing QR landing screen for the in-person add-on upsell system.
 *
 * הוראות התקנה בוויקס:
 * 1. בעורך וויקס בעמוד "מערכת תשלומים עצמאית": הוסף רכיב "Custom Element"
 *    (Elements Panel > Embed > Custom Element).
 * 2. בהגדרות הרכיב, הגדר "Tag Name" בדיוק לפי הערך: studio-upsell
 * 3. תן לרכיב את ה-ID: studioUpsell1 (או עדכן את DEFAULT_ELEMENT_ID בקובץ
 *    ה-Velo של העמוד אם משתמשים ב-ID אחר).
 * 4. העלה קובץ זה תחת "Source: Upload a file".
 * 5. כדי שהחלונית תתמרכז אמצע המסך: הגדירו את גובה רכיב ה-Custom Element
 *    להתמלא לגובה העמוד המלא (Full Page Height / Stretch) בעורך וויקס.
 *
 * תקשורת עם Velo (backend/studioUpsellService.web.js):
 *  - CE -> Velo: dispatchEvent('studio-upsell-action', { detail: { type, requestId, payload } })
 *  - Velo -> CE: setAttribute('upsell-data', JSON.stringify({ type, requestId, result }))
 *              / setAttribute('upsell-error', JSON.stringify({ type, requestId, message }))
 */

const TAG_NAME = 'studio-upsell';

const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
    :host, .su-root { all: initial; }
    :host { display: block; }
    .su-root {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        width: 100%;
        direction: rtl;
        font-family: 'Rubik', Arial, sans-serif;
        color: #1f2933;
        box-sizing: border-box;
        padding: 20px 16px 60px;
    }
    .su-root *, .su-root *::before, .su-root *::after { box-sizing: border-box; }
    .su-card {
        background: #ffffff;
        border-radius: 18px;
        padding: 24px 20px;
        box-shadow: 0 6px 24px rgba(31, 41, 51, 0.08);
        border: 1px solid #eef0f2;
        max-width: 480px;
        width: 100%;
    }
    .su-steps { display: flex; align-items: flex-start; gap: 4px; margin-bottom: 20px; }
    .su-step { display: flex; flex-direction: column; align-items: center; text-align: center; flex: 1; min-width: 0; gap: 5px; }
    .su-step-num {
        width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 800; font-size: 12px; background: #e5e7eb; color: #6b7280; flex-shrink: 0;
    }
    .su-step-active .su-step-num { background: #4f46e5; color: #fff; }
    .su-step-done .su-step-num { background: #c7d2fe; color: #4338ca; }
    .su-step-title { font-size: 11px; font-weight: 700; color: #9ca3af; line-height: 1.3; }
    .su-step-active .su-step-title { color: #111827; }
    .su-step-done .su-step-title { color: #4338ca; }
    .su-step-desc { font-size: 10px; color: #9ca3af; line-height: 1.3; }
    .su-step-sep { flex: 0 0 16px; height: 1.5px; background: #e5e7eb; margin-top: 13px; }
    .su-title {
        font-size: 20px;
        font-weight: 800;
        margin: 0 0 6px;
        color: #111827;
    }
    .su-subtitle {
        font-size: 14px;
        color: #6b7280;
        margin: 0 0 20px;
        line-height: 1.5;
    }
    .su-label {
        display: block;
        font-size: 13px;
        font-weight: 700;
        color: #374151;
        margin-bottom: 6px;
    }
    .su-input {
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1.5px solid #e5e7eb;
        font-size: 16px;
        font-family: inherit;
        margin-bottom: 14px;
        background: #f9fafb;
        transition: border-color .15s ease;
    }
    .su-input:focus { outline: none; border-color: #6366f1; background: #fff; }
    .su-btn {
        width: 100%;
        padding: 14px;
        border-radius: 12px;
        border: none;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        font-family: inherit;
        transition: transform .1s ease, opacity .15s ease;
    }
    .su-btn:active { transform: scale(0.98); }
    .su-btn:disabled { opacity: .5; cursor: not-allowed; }
    .su-btn-primary { background: #4f46e5; color: #fff; }
    .su-btn-primary:hover:not(:disabled) { background: #4338ca; }
    .su-btn-ghost { background: transparent; color: #6b7280; font-size: 13px; font-weight: 600; padding: 8px; }
    .su-btn-secondary { background: #eef2ff; color: #4338ca; }
    .su-link-row { text-align: center; margin-top: 14px; }
    .su-error {
        background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
        border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 14px;
    }
    .su-workshop-card {
        display: flex; align-items: center; justify-content: space-between;
        background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 14px;
        padding: 14px 16px; margin-bottom: 10px; cursor: pointer; transition: all .15s ease;
    }
    .su-workshop-card:hover { border-color: #6366f1; background: #eef2ff; }
    .su-workshop-name { font-weight: 800; font-size: 15px; color: #111827; }
    .su-workshop-time { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .su-chip {
        display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 8px;
        border-radius: 999px; background: #e0e7ff; color: #4338ca;
    }
    .su-addon-row {
        display: flex; align-items: center; gap: 12px;
        padding: 14px 0; border-bottom: 1px solid #f1f2f4;
    }
    .su-addon-img {
        width: 52px; height: 52px; border-radius: 10px; object-fit: cover;
        background: #f1f2f4; flex-shrink: 0;
    }
    .su-addon-info { flex: 1; min-width: 0; }
    .su-addon-title { font-weight: 700; font-size: 14px; color: #111827; }
    .su-addon-price { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .su-stepper { display: flex; align-items: center; gap: 8px; }
    .su-stepper button {
        width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid #e5e7eb;
        background: #fff; font-size: 16px; font-weight: 800; cursor: pointer; color: #4f46e5;
        display: flex; align-items: center; justify-content: center; font-family: inherit;
    }
    .su-stepper button:disabled { opacity: .35; cursor: not-allowed; }
    .su-stepper span { min-width: 20px; text-align: center; font-weight: 700; }
    .su-summary {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 16px; font-weight: 800; padding: 14px 0; border-top: 2px solid #f1f2f4; margin-top: 6px;
    }
    .su-loading { text-align: center; padding: 40px 0; color: #6b7280; font-size: 14px; }
    .su-spinner {
        width: 32px; height: 32px; border-radius: 50%; margin: 0 auto 12px;
        border: 3px solid #e0e7ff; border-top-color: #4f46e5; animation: su-spin 0.8s linear infinite;
    }
    @keyframes su-spin { to { transform: rotate(360deg); } }
    .su-modal-backdrop {
        position: fixed; inset: 0; background: rgba(17, 24, 39, 0.5);
        display: flex; align-items: center; justify-content: center; z-index: 999; padding: 16px;
    }
    .su-modal { background: #fff; border-radius: 18px; padding: 24px 20px; max-width: 380px; width: 100%; }
    .su-icon-badge {
        width: 56px; height: 56px; border-radius: 50%; background: #eef2ff;
        display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px;
    }
    .su-center { text-align: center; }
    .su-select {
        width: 100%; padding: 12px 14px; border-radius: 12px; border: 1.5px solid #e5e7eb;
        font-size: 15px; font-family: inherit; margin-bottom: 14px; background: #f9fafb;
    }
`;

function h(strings, ...values) {
    return strings.reduce((out, s, i) => out + s + (values[i] !== undefined ? values[i] : ''), '');
}

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function formatIls(n) {
    return `₪${(Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

const STEPS = [
    { title: 'הזדהות מהירה', desc: 'טלפון או קוד צוות' },
    { title: 'בחירת מוצר', desc: 'תוספים או סכום פתוח' },
    { title: 'סיום ההזמנה', desc: 'קבלת אישור עם כל הפרטים' },
];

function renderSteps(activeStep) {
    const items = STEPS.map((step, i) => {
        const num = i + 1;
        const cls = num < activeStep ? 'su-step-done' : (num === activeStep ? 'su-step-active' : '');
        return h`
            <div class="su-step ${cls}">
                <div class="su-step-num">${num}</div>
                <div class="su-step-title">${escapeHtml(step.title)}</div>
                <div class="su-step-desc">${escapeHtml(step.desc)}</div>
            </div>
        `;
    }).join('<div class="su-step-sep"></div>');
    return h`<div class="su-steps">${items}</div>`;
}

class StudioUpsellElement extends HTMLElement {
    static get observedAttributes() {
        return ['upsell-data', 'upsell-error'];
    }

    constructor() {
        super();
        this._requestSeq = 0;
        this._pending = new Map();
        this._state = {
            screen: 'identify', // identify | pickWorkshop | catalog | notFound | loading | staffModal:false
            staffOptions: [],
            staffOptionsLoading: false,
            staffModalOpen: false,
            staffPin: '',
            staffPinConfirmed: false,
            staffName: null,
            createdVia: 'qr_customer',
            phone: '',
            workshops: [],
            selectedWorkshop: null,
            catalog: { addOns: [], settings: null },
            quantities: {},
            openAmount: '',
            customerName: '',
            customerPhone: '',
            error: null,
            submitting: false,
        };
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        this.setAttribute('lang', 'he');
        this.innerHTML = `<style>${STYLE}</style><div class="su-root" id="suRoot"></div>`;
        this.render();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (!newValue || newValue === oldValue) return;
        if (name === 'upsell-data') {
            try { this._handleData(JSON.parse(newValue)); } catch (err) {
                console.error('[studio-upsell] failed to parse upsell-data:', err);
            }
        } else if (name === 'upsell-error') {
            try { this._handleError(JSON.parse(newValue)); } catch (err) {
                console.error('[studio-upsell] failed to parse upsell-error:', err);
            }
        }
    }

    _dispatch(type, payload) {
        const requestId = `${type}_${++this._requestSeq}`;
        this._pending.set(requestId, type);
        this.dispatchEvent(new CustomEvent('studio-upsell-action', {
            detail: { type, requestId, payload },
            bubbles: true,
        }));
        return requestId;
    }

    _handleData({ type, requestId, result }) {
        this._pending.delete(requestId);
        this._state.submitting = false;

        if (type === 'getStaffOptions') {
            this._state.staffOptions = result || [];
            this._state.staffOptionsLoading = false;
        } else if (type === 'lookupByPhone') {
            const matches = result?.matches || [];
            if (!matches.length) {
                this._state.screen = 'notFound';
            } else if (matches.length === 1) {
                this._selectWorkshop(matches[0]);
                return;
            } else {
                this._state.workshops = matches;
                this._state.screen = 'pickWorkshop';
            }
        } else if (type === 'staffLogin') {
            if (!result?.valid) {
                this._state.error = 'קוד שגוי — נסו שוב או פנו לצוות.';
                this._state.staffPinConfirmed = false;
            } else {
                this._state.staffName = result.staffName || null;
                this._state.createdVia = 'qr_staff';
                this._state.staffModalOpen = false;
                this._state.staffPinConfirmed = false;
                this._state.staffPin = '';
                const sessions = (result.sessions || []).map((s) => ({
                    sessionId: s.id,
                    serviceId: s.serviceId,
                    workshopTypeId: s.workshopTypeId,
                    workshopTitle: s.workshopTitle,
                    startLabel: s.startLabel,
                    start: s.start,
                }));
                if (!sessions.length) {
                    this._state.error = 'אין סדנאות פעילות היום.';
                } else if (sessions.length === 1) {
                    this._selectWorkshop(sessions[0]);
                    return;
                } else {
                    this._state.workshops = sessions;
                    this._state.screen = 'pickWorkshop';
                }
            }
        } else if (type === 'getAddOnCatalogForWorkshop') {
            this._state.catalog = result || { addOns: [], settings: null };
            this._state.quantities = {};
            this._state.screen = 'catalog';
        } else if (type === 'checkout') {
            // Navigation away happens on the Velo side on success; only surface errors here.
            if (result && result.success === false) {
                this._state.error = result.error || 'שגיאה ביצירת התשלום. נסו שוב.';
            }
        }

        this.render();
    }

    _handleError({ type, message }) {
        this._pending.delete(type);
        this._state.submitting = false;
        this._state.error = message || 'אירעה שגיאה. נסו שוב.';
        this.render();
    }

    _selectWorkshop(workshop) {
        this._state.selectedWorkshop = workshop;
        this._state.screen = 'loading';
        this.render();
        this._dispatch('getAddOnCatalogForWorkshop', { workshopTypeId: workshop.workshopTypeId });
    }

    _qty(addOnId) {
        return this._state.quantities[addOnId] || 0;
    }

    _setQty(addOnId, max, delta) {
        const current = this._qty(addOnId);
        const next = Math.max(0, Math.min(max, current + delta));
        this._state.quantities = { ...this._state.quantities, [addOnId]: next };
        this.render();
    }

    _computeTotal() {
        const { addOns } = this._state.catalog;
        let total = 0;
        for (const addOn of addOns) {
            total += (this._qty(addOn.id) || 0) * (Number(addOn.price) || 0);
        }
        const open = Number(this._state.openAmount) || 0;
        if (open > 0) total += open;
        return total;
    }

    _submitCheckout() {
        const { addOns, settings } = this._state.catalog;
        const items = addOns
            .filter((a) => this._qty(a.id) > 0)
            .map((a) => ({ id: a.id, title: a.title, price: a.price, quantity: this._qty(a.id), image: a.image }));

        const openAmount = Number(this._state.openAmount) || 0;
        if (!items.length && openAmount <= 0) {
            this._state.error = 'יש לבחור לפחות פריט אחד או להזין סכום.';
            this.render();
            return;
        }
        if (settings?.allowOpenAmount && openAmount > 0) {
            if (settings.openAmountMin && openAmount < settings.openAmountMin) {
                this._state.error = `הסכום המינימלי הוא ${formatIls(settings.openAmountMin)}.`;
                this.render();
                return;
            }
            if (settings.openAmountMax && openAmount > settings.openAmountMax) {
                this._state.error = `הסכום המקסימלי הוא ${formatIls(settings.openAmountMax)}.`;
                this.render();
                return;
            }
        }

        if (this._state.createdVia === 'qr_staff') {
            const name = (this._state.customerName || '').trim();
            const phone = (this._state.customerPhone || '').trim();
            if (!name) {
                this._state.error = 'יש להזין שם לקוח.';
                this.render();
                return;
            }
            if (!phone || phone.length < 7) {
                this._state.error = 'יש להזין מספר טלפון תקין של הלקוח.';
                this.render();
                return;
            }
        }

        this._state.error = null;
        this._state.submitting = true;
        this.render();

        const w = this._state.selectedWorkshop || {};
        const customerName = this._state.createdVia === 'qr_staff'
            ? (this._state.customerName || '').trim()
            : (this._state.customerName || w.organizerName || '');
        const customerPhone = this._state.createdVia === 'qr_staff'
            ? (this._state.customerPhone || '').trim()
            : (this._state.customerPhone || this._state.phone || w.organizerPhone || '');
        this._dispatch('checkout', {
            items,
            openAmount,
            openAmountLabel: settings?.openAmountLabel || 'סכום פתוח',
            workshopOrderId: w.workshopOrderId || null,
            sessionId: w.sessionId || null,
            serviceId: w.serviceId || null,
            workshopTypeId: w.workshopTypeId || null,
            workshopStart: w.start || null,
            workshopTitle: w.workshopTitle || '',
            customerName,
            customerPhone,
            createdVia: this._state.createdVia,
            staffName: this._state.staffName || null,
        });
    }

    render() {
        const root = this.querySelector('#suRoot');
        if (!root) return;
        const s = this._state;

        let body = '';
        if (s.screen === 'loading') {
            body = h`<div class="su-card su-loading"><div class="su-spinner"></div>טוען...</div>`;
        } else if (s.screen === 'identify') {
            body = this._renderIdentify();
        } else if (s.screen === 'notFound') {
            body = this._renderNotFound();
        } else if (s.screen === 'pickWorkshop') {
            body = this._renderPickWorkshop();
        } else if (s.screen === 'catalog') {
            body = this._renderCatalog();
        }

        root.innerHTML = body + (s.staffModalOpen ? this._renderStaffModal() : '');
        this._bindEvents(root);
    }

    _renderIdentify() {
        const s = this._state;
        return h`
            <div class="su-card">
                ${renderSteps(1)}
                <h1 class="su-title">רכישת תוספות לסדנה</h1>
                <p class="su-subtitle">הזינו את מספר הטלפון ששימש להזמנת הסדנה שלכם היום, כדי לצפות בתוספות הזמינות.</p>
                ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                <label class="su-label" for="suPhoneInput">מספר טלפון</label>
                <input class="su-input" id="suPhoneInput" type="tel" inputmode="tel" placeholder="050-0000000" value="${escapeHtml(s.phone)}" />
                <button class="su-btn su-btn-primary" id="suLookupBtn">המשך</button>
                <div class="su-link-row">
                    <button class="su-btn su-btn-ghost" id="suStaffOpenBtn">כניסת צוות</button>
                </div>
                <div class="su-link-row">
                    <button class="su-btn su-btn-ghost" id="suHelpBtn">לא מצליח/ה להזדהות?</button>
                </div>
            </div>
        `;
    }

    _renderNotFound() {
        return h`
            <div class="su-card su-center">
                ${renderSteps(1)}
                <div class="su-icon-badge">🔍</div>
                <h1 class="su-title">לא הצלחנו לאתר הזמנה</h1>
                <p class="su-subtitle">לא מצאנו הזמנה פעילה עם מספר הטלפון הזה להיום. אנא פנו לאחד מאנשי הצוות בסטודיו לעזרה.</p>
                <button class="su-btn su-btn-secondary" id="suBackBtn">נסו מספר אחר</button>
                <div class="su-link-row">
                    <button class="su-btn su-btn-ghost" id="suHelpBtn">לא מצליח/ה להזדהות?</button>
                </div>
            </div>
        `;
    }

    _renderPickWorkshop() {
        const s = this._state;
        const cards = s.workshops.map((w, i) => h`
            <div class="su-workshop-card" data-idx="${i}">
                <div>
                    <div class="su-workshop-name">${escapeHtml(w.workshopTitle)}</div>
                    <div class="su-workshop-time">${escapeHtml(w.startLabel || '')}</div>
                </div>
                <span class="su-chip">בחירה</span>
            </div>
        `).join('');
        return h`
            <div class="su-card">
                ${renderSteps(1)}
                <h1 class="su-title">בחרו את הסדנה שלכם</h1>
                <p class="su-subtitle">נמצאו כמה סדנאות פעילות היום — בחרו את הסדנה הנכונה.</p>
                ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                <div id="suWorkshopList">${cards}</div>
            </div>
        `;
    }

    _renderCatalog() {
        const s = this._state;
        const { addOns, settings } = s.catalog;
        const w = s.selectedWorkshop || {};

        const rows = addOns.map((a) => h`
            <div class="su-addon-row">
                ${a.image ? `<img class="su-addon-img" src="${escapeHtml(a.image)}" alt="" />` : '<div class="su-addon-img"></div>'}
                <div class="su-addon-info">
                    <div class="su-addon-title">${escapeHtml(a.title)}</div>
                    <div class="su-addon-price">${formatIls(a.price)}</div>
                </div>
                <div class="su-stepper">
                    <button data-addon="${a.id}" data-delta="-1" ${this._qty(a.id) <= 0 ? 'disabled' : ''}>−</button>
                    <span>${this._qty(a.id)}</span>
                    <button data-addon="${a.id}" data-max="${a.maxQuantity}" data-delta="1" ${this._qty(a.id) >= a.maxQuantity ? 'disabled' : ''}>+</button>
                </div>
            </div>
        `).join('');

        const openAmountBlock = settings?.allowOpenAmount ? h`
            <div style="margin-top:16px;">
                <label class="su-label" for="suOpenAmount">${escapeHtml(settings.openAmountLabel || 'סכום פתוח')}</label>
                <input class="su-input" id="suOpenAmount" type="number" min="0" step="1" placeholder="0" value="${escapeHtml(s.openAmount)}" />
            </div>
        ` : '';

        const identityBlock = s.createdVia === 'qr_staff' ? h`
            <div style="margin-top:6px;">
                <label class="su-label" for="suCustomerName">שם הלקוח</label>
                <input class="su-input" id="suCustomerName" type="text" required value="${escapeHtml(s.customerName)}" />
                <label class="su-label" for="suCustomerPhone">טלפון הלקוח</label>
                <input class="su-input" id="suCustomerPhone" type="tel" inputmode="tel" required value="${escapeHtml(s.customerPhone)}" />
            </div>
        ` : '';

        const total = this._computeTotal();

        return h`
            <div class="su-card">
                ${renderSteps(2)}
                <h1 class="su-title">${escapeHtml(w.workshopTitle || 'תוספות לסדנה')}</h1>
                <p class="su-subtitle">${escapeHtml(w.startLabel ? `סדנה בשעה ${w.startLabel}` : 'בחרו תוספות לתשלום')}</p>
                ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                ${addOns.length ? `<div>${rows}</div>` : '<p class="su-subtitle">אין תוספות זמינות לסדנה זו כרגע.</p>'}
                ${openAmountBlock}
                ${identityBlock}
                <div class="su-summary"><span>סה"כ לתשלום</span><span>${formatIls(total)}</span></div>
                <button class="su-btn su-btn-primary" id="suCheckoutBtn" ${s.submitting || total <= 0 ? 'disabled' : ''}>
                    ${s.submitting ? 'מעביר לתשלום...' : 'המשך לתשלום'}
                </button>
            </div>
        `;
    }

    _renderStaffModal() {
        const s = this._state;

        // Phase 1: PIN only — staff names are not shown until the PIN is entered.
        if (!s.staffPinConfirmed) {
            return h`
                <div class="su-modal-backdrop" id="suStaffBackdrop">
                    <div class="su-modal">
                        <h2 class="su-title">כניסת צוות</h2>
                        <p class="su-subtitle">הזינו את קוד הצוות כדי להמשיך.</p>
                        ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                        <label class="su-label" for="suStaffPin">קוד צוות</label>
                        <input class="su-input" id="suStaffPin" type="password" inputmode="numeric" maxlength="6" value="${escapeHtml(s.staffPin)}" />
                        <button class="su-btn su-btn-primary" id="suStaffPinContinueBtn">המשך</button>
                        <div class="su-link-row"><button class="su-btn su-btn-ghost" id="suStaffCancelBtn">ביטול</button></div>
                    </div>
                </div>
            `;
        }

        // Phase 2: pick your name from the staff list (revealed only after the PIN step).
        const options = s.staffOptions.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.firstName)}</option>`).join('');
        return h`
            <div class="su-modal-backdrop" id="suStaffBackdrop">
                <div class="su-modal">
                    <h2 class="su-title">כניסת צוות</h2>
                    <p class="su-subtitle">בחרו את שמכם מהרשימה.</p>
                    ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                    <label class="su-label" for="suStaffSelect">שם</label>
                    ${s.staffOptionsLoading
                        ? '<p class="su-subtitle">טוען רשימת עובדים...</p>'
                        : `<select class="su-select" id="suStaffSelect">${options}</select>`}
                    <button class="su-btn su-btn-primary" id="suStaffSubmitBtn" ${s.staffOptionsLoading || !s.staffOptions.length ? 'disabled' : ''}>כניסה</button>
                    <div class="su-link-row"><button class="su-btn su-btn-ghost" id="suStaffBackToPinBtn">חזרה</button></div>
                </div>
            </div>
        `;
    }

    _bindEvents(root) {
        const s = this._state;

        const phoneInput = root.querySelector('#suPhoneInput');
        if (phoneInput) phoneInput.addEventListener('input', (e) => { s.phone = e.target.value; });

        const lookupBtn = root.querySelector('#suLookupBtn');
        if (lookupBtn) lookupBtn.addEventListener('click', () => {
            if (!s.phone || s.phone.trim().length < 7) {
                s.error = 'אנא הזינו מספר טלפון תקין.';
                this.render();
                return;
            }
            s.error = null;
            s.screen = 'loading';
            this.render();
            this._dispatch('lookupByPhone', { phone: s.phone.trim() });
        });

        const staffOpenBtn = root.querySelector('#suStaffOpenBtn');
        if (staffOpenBtn) staffOpenBtn.addEventListener('click', () => {
            s.staffModalOpen = true;
            s.staffPinConfirmed = false;
            s.staffPin = '';
            s.error = null;
            this.render();
        });

        const helpBtn = root.querySelector('#suHelpBtn');
        if (helpBtn) helpBtn.addEventListener('click', () => {
            alert('לא הצלחתם להזדהות? אנא פנו לאחד מאנשי הצוות בסטודיו לעזרה.');
        });

        const backBtn = root.querySelector('#suBackBtn');
        if (backBtn) backBtn.addEventListener('click', () => {
            s.screen = 'identify';
            s.error = null;
            this.render();
        });

        const workshopList = root.querySelector('#suWorkshopList');
        if (workshopList) workshopList.querySelectorAll('.su-workshop-card').forEach((el) => {
            el.addEventListener('click', () => {
                const idx = Number(el.getAttribute('data-idx'));
                this._selectWorkshop(s.workshops[idx]);
            });
        });

        root.querySelectorAll('.su-stepper button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const addOnId = btn.getAttribute('data-addon');
                const max = Number(btn.getAttribute('data-max')) || 10;
                const delta = Number(btn.getAttribute('data-delta'));
                this._setQty(addOnId, max, delta);
            });
        });

        const openAmountInput = root.querySelector('#suOpenAmount');
        if (openAmountInput) openAmountInput.addEventListener('input', (e) => { s.openAmount = e.target.value; });

        const customerNameInput = root.querySelector('#suCustomerName');
        if (customerNameInput) customerNameInput.addEventListener('input', (e) => { s.customerName = e.target.value; });

        const customerPhoneInput = root.querySelector('#suCustomerPhone');
        if (customerPhoneInput) customerPhoneInput.addEventListener('input', (e) => { s.customerPhone = e.target.value; });

        const checkoutBtn = root.querySelector('#suCheckoutBtn');
        if (checkoutBtn) checkoutBtn.addEventListener('click', () => this._submitCheckout());

        const staffCancelBtn = root.querySelector('#suStaffCancelBtn');
        if (staffCancelBtn) staffCancelBtn.addEventListener('click', () => {
            s.staffModalOpen = false;
            s.staffPinConfirmed = false;
            s.staffPin = '';
            s.error = null;
            this.render();
        });

        const staffPinInput = root.querySelector('#suStaffPin');
        if (staffPinInput) staffPinInput.addEventListener('input', (e) => { s.staffPin = e.target.value; });

        const staffPinContinueBtn = root.querySelector('#suStaffPinContinueBtn');
        if (staffPinContinueBtn) staffPinContinueBtn.addEventListener('click', () => {
            if (!s.staffPin) {
                s.error = 'אנא הזינו קוד.';
                this.render();
                return;
            }
            s.error = null;
            s.staffPinConfirmed = true;
            if (!s.staffOptions.length) s.staffOptionsLoading = true;
            this.render();
            if (!s.staffOptions.length) this._dispatch('getStaffOptions', {});
        });

        const staffBackToPinBtn = root.querySelector('#suStaffBackToPinBtn');
        if (staffBackToPinBtn) staffBackToPinBtn.addEventListener('click', () => {
            s.staffPinConfirmed = false;
            s.error = null;
            this.render();
        });

        const staffSubmitBtn = root.querySelector('#suStaffSubmitBtn');
        if (staffSubmitBtn) staffSubmitBtn.addEventListener('click', () => {
            const staffId = root.querySelector('#suStaffSelect')?.value || null;
            if (!s.staffPin) {
                s.error = 'אנא הזינו קוד.';
                s.staffPinConfirmed = false;
                this.render();
                return;
            }
            s.error = null;
            this._dispatch('staffLogin', { pin: s.staffPin, staffId });
        });
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, StudioUpsellElement);
}
