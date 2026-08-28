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
        background: #f1f2f4; flex-shrink: 0; display: block;
    }
    .su-addon-img-btn {
        border: none; padding: 0; background: none; flex-shrink: 0; cursor: zoom-in;
    }
    .su-addon-img-btn:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; border-radius: 10px; }
    .su-addon-info { flex: 1; min-width: 0; }
    .su-addon-title { font-weight: 700; font-size: 14px; color: #111827; }
    .su-addon-price { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .su-addon-row-disabled .su-addon-title, .su-addon-row-disabled .su-addon-price { color: #9ca3af; }
    .su-addon-row-disabled .su-addon-img { opacity: .55; }
    .su-catalog-section { margin-top: 22px; }
    .su-catalog-section:first-of-type { margin-top: 0; }
    .su-catalog-section-title {
        font-size: 15px; font-weight: 800; color: #4338ca; margin: 0 0 12px;
        padding-bottom: 8px; border-bottom: 2px solid #e0e7ff;
    }
    .su-catalog-section-title-clickable {
        cursor: pointer; display: flex; align-items: center; justify-content: space-between;
        user-select: none;
    }
    .su-catalog-section-count { color: #7c86e8; font-weight: 700; }
    .su-catalog-section-arrow { font-size: 11px; color: #a5b4fc; margin-inline-start: 8px; }
    .su-show-more-btn { display: block; width: 100%; margin-top: 8px; }
    .su-addon-note { font-size: 11px; font-weight: 700; color: #9ca3af; margin-top: 3px; }
    .su-addon-unavailable {
        font-size: 12px; font-weight: 700; color: #6b7280; background: #f1f2f4;
        padding: 6px 10px; border-radius: 8px; white-space: nowrap;
    }
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
    .su-image-lightbox-backdrop {
        position: fixed; inset: 0; background: rgba(17, 24, 39, 0.88);
        display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
        cursor: zoom-out;
    }
    .su-image-lightbox-img {
        max-width: min(92vw, 520px); max-height: 85vh; border-radius: 14px;
        object-fit: contain; box-shadow: 0 8px 32px rgba(0,0,0,.35); cursor: default;
    }
    .su-image-lightbox-close {
        position: absolute; top: 16px; left: 16px; width: 36px; height: 36px; border-radius: 50%;
        border: none; background: rgba(255,255,255,.15); color: #fff; font-size: 18px; cursor: pointer;
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
            screen: 'identify', // identify | pickWorkshop | catalog | choosePaymentMode | openAmount | notFound | loading | staffModal:false
            staffOptions: [],
            staffOptionsLoading: false,
            staffModalOpen: false,
            staffPin: '',
            staffPinConfirmed: false,
            staffName: null,
            staffActionAt: null,
            createdVia: 'qr_customer',
            phone: '',
            workshops: [],
            selectedWorkshop: null,
            catalog: { addOns: [], workshopAddOns: [], generalSections: [], settings: null },
            quantities: {},
            openAmount: '',
            paymentMode: null, // null | 'catalog' | 'openAmount' — which payment option the customer picked
            openAmountUnlocked: false, // true once no password is required, or the staff code was verified
            openAmountPasswordModalOpen: false,
            openAmountPasswordInput: '',
            openAmountPwPinConfirmed: false,
            openAmountStaffId: '',
            openAmountApprovedByStaffName: null,
            openAmountApprovedAt: null,
            openAmountVerifying: false,
            customerName: '',
            customerPhone: '',
            error: null,
            submitting: false,
            imagePreviewUrl: null,
            catalogPhone: null, // phone the current catalog's perCustomer caps were computed for
            keepQuantitiesOnLoad: false,
            sectionUI: {}, // sectionId -> { expanded, showAll } — collapsible catalog sections
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
            if (this._state.openAmountPasswordModalOpen && this._state.openAmountPwPinConfirmed
                && !this._state.openAmountStaffId && this._state.staffOptions.length) {
                this._state.openAmountStaffId = this._state.staffOptions[0].id;
            }
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
                this._state.staffActionAt = new Date().toISOString();
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
            this._state.catalog = result || { addOns: [], workshopAddOns: [], generalSections: [], settings: null };
            // Re-fetches mid-order (staff flow, customer phone just entered) keep
            // existing picks re-clamped to the fresh caps, and stay on whichever
            // screen (catalog / openAmount) the customer was already on.
            if (this._state.keepQuantitiesOnLoad) {
                const next = {};
                for (const addOn of this._allCatalogAddOns()) {
                    const qty = Math.min(this._state.quantities[addOn.id] || 0, addOn.maxQuantity || 0);
                    if (qty > 0) next[addOn.id] = qty;
                }
                this._state.quantities = next;
                this._state.keepQuantitiesOnLoad = false;
            } else {
                this._state.quantities = {};
                const settings = this._state.catalog.settings;
                this._state.openAmountUnlocked = !settings?.openAmountRequiresPassword;
                if (settings?.allowOpenAmount) {
                    this._state.paymentMode = null;
                    this._state.screen = 'choosePaymentMode';
                } else {
                    this._state.paymentMode = 'catalog';
                    this._state.screen = 'catalog';
                }
            }
        } else if (type === 'verifyOpenAmountCode') {
            this._state.openAmountVerifying = false;
            if (result?.valid) {
                this._state.openAmountUnlocked = true;
                this._state.openAmountPasswordModalOpen = false;
                this._state.openAmountPasswordInput = '';
                this._state.openAmountPwPinConfirmed = false;
                this._state.openAmountStaffId = '';
                this._state.openAmountApprovedByStaffName = result.staffName || null;
                this._state.openAmountApprovedAt = new Date().toISOString();
                this._state.quantities = {};
                this._state.paymentMode = 'openAmount';
                this._state.screen = 'openAmount';
                this._state.error = null;
            } else {
                const reasonMessages = {
                    wrong_pin: 'קוד שגוי — נסו שוב.',
                    missing_staff: 'יש לבחור שם מהרשימה.',
                    invalid_staff: 'העובד/ת שנבחר/ה אינו/ה פעיל/ה.',
                };
                this._state.error = reasonMessages[result?.reason] || 'קוד שגוי — נסו שוב.';
                if (result?.reason === 'wrong_pin') {
                    this._state.openAmountPwPinConfirmed = false;
                    this._state.openAmountPasswordInput = '';
                }
            }
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
        this._fetchCatalog(this._state.phone || null);
    }

    /**
     * Loads the catalog for the selected workshop. `customerPhone` + scope let the
     * backend flag 'perCustomer' add-ons already bought for THIS session as
     * not-selectable. `keepQuantities` is used when re-fetching mid-order (staff
     * flow, once the customer's phone is known) so current picks aren't lost.
     */
    _fetchCatalog(customerPhone, { keepQuantities = false } = {}) {
        const workshop = this._state.selectedWorkshop || {};
        this._state.catalogPhone = customerPhone || null;
        this._state.keepQuantitiesOnLoad = keepQuantities;
        this._dispatch('getAddOnCatalogForWorkshop', {
            workshopTypeId: workshop.workshopTypeId,
            customerPhone: customerPhone || null,
            scope: {
                sessionId: workshop.sessionId || null,
                workshopOrderId: workshop.workshopOrderId || null,
                workshopTypeId: workshop.workshopTypeId || null,
                workshopStart: workshop.start || null,
            },
        });
    }

    _qty(addOnId) {
        return this._state.quantities[addOnId] || 0;
    }

    /** Flat list of every purchasable add-on in the current catalog (workshop + general). */
    _allCatalogAddOns() {
        const c = this._state.catalog || {};
        if (Array.isArray(c.addOns) && c.addOns.length) return c.addOns;
        const general = (c.generalSections || []).flatMap((sec) => sec.addOns || []);
        return [...(c.workshopAddOns || []), ...general];
    }

    _renderAddonRow(a) {
        return `
            <div class="su-addon-row ${a.soldOut ? 'su-addon-row-disabled' : ''}">
                ${a.image
                    ? `<button type="button" class="su-addon-img-btn" data-preview-image="${escapeHtml(a.image)}" aria-label="הגדלת תמונה"><img class="su-addon-img" src="${escapeHtml(a.image)}" alt="" /></button>`
                    : '<div class="su-addon-img"></div>'}
                <div class="su-addon-info">
                    <div class="su-addon-title">${escapeHtml(a.title)}</div>
                    <div class="su-addon-price">${formatIls(a.price)}</div>
                    ${a.soldOut ? `<div class="su-addon-note">${a.soldOutReason === 'perCustomer' ? 'כבר נרכש עבור סדנה זו' : 'אזל מהמלאי'}</div>` : ''}
                </div>
                ${a.soldOut
                    ? `<span class="su-addon-unavailable">${a.soldOutReason === 'perCustomer' ? 'נרכש' : 'אין במלאי'}</span>`
                    : `<div class="su-stepper">
                        <button data-addon="${a.id}" data-delta="-1" ${this._qty(a.id) <= 0 ? 'disabled' : ''}>−</button>
                        <span>${this._qty(a.id)}</span>
                        <button data-addon="${a.id}" data-max="${a.maxQuantity}" data-delta="1" ${this._qty(a.id) >= a.maxQuantity ? 'disabled' : ''}>+</button>
                    </div>`}
            </div>
        `;
    }

    _setQty(addOnId, max, delta) {
        const current = this._qty(addOnId);
        const next = Math.max(0, Math.min(max, current + delta));
        this._state.quantities = { ...this._state.quantities, [addOnId]: next };
        this.render();
    }

    /** Only one of the two payment modes ever counts toward the total — never both at once. */
    _computeTotal() {
        if (this._state.paymentMode === 'openAmount') {
            return Number(this._state.openAmount) || 0;
        }
        const { addOns } = this._state.catalog;
        let total = 0;
        for (const addOn of this._allCatalogAddOns()) {
            total += (this._qty(addOn.id) || 0) * (Number(addOn.price) || 0);
        }
        return total;
    }

    /** True when the customer picked at least one add-on qty or entered an open amount — even if total is ₪0. */
    _hasSelectedItems() {
        if (this._state.paymentMode === 'openAmount') {
            return (Number(this._state.openAmount) || 0) > 0;
        }
        return this._allCatalogAddOns().some((a) => this._qty(a.id) > 0);
    }

    /** Re-paints just the total + checkout button — avoids a full re-render (and losing input focus) on every keystroke. */
    _refreshSummary(root) {
        const s = this._state;
        const total = this._computeTotal();
        const canCheckout = this._hasSelectedItems();
        const summaryValue = root.querySelector('.su-summary span:last-child');
        if (summaryValue) summaryValue.textContent = formatIls(total);
        const checkoutBtn = root.querySelector('#suCheckoutBtn');
        if (checkoutBtn) {
            checkoutBtn.disabled = s.submitting || !canCheckout;
            checkoutBtn.textContent = s.submitting ? 'מעביר לתשלום...' : (total > 0 ? 'המשך לתשלום' : 'המשך להזמנה');
        }
    }

    _submitCheckout() {
        const { addOns, settings } = this._state.catalog;
        const isOpenAmountMode = this._state.paymentMode === 'openAmount';

        // Only one of the two payment modes is ever sent to checkout — never both.
        const items = isOpenAmountMode ? [] : this._allCatalogAddOns()
            .filter((a) => this._qty(a.id) > 0)
            .map((a) => ({ id: a.id, title: a.title, price: a.price, quantity: this._qty(a.id), image: a.image }));

        const openAmount = isOpenAmountMode ? (Number(this._state.openAmount) || 0) : 0;
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
            staffName: this._state.staffName || this._state.openAmountApprovedByStaffName || null,
            staffActionAt: this._state.staffActionAt || this._state.openAmountApprovedAt || null,
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
        } else if (s.screen === 'choosePaymentMode') {
            body = this._renderChoosePaymentMode();
        } else if (s.screen === 'openAmount') {
            body = this._renderOpenAmount();
        }

        root.innerHTML = body
            + (s.staffModalOpen ? this._renderStaffModal() : '')
            + (s.openAmountPasswordModalOpen ? this._renderOpenAmountPasswordModal() : '')
            + (s.imagePreviewUrl ? this._renderImageLightbox() : '');
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

    _getSectionState(id, collapsedByDefault) {
        if (!this._state.sectionUI[id]) {
            this._state.sectionUI[id] = { expanded: !collapsedByDefault, showAll: false };
        }
        return this._state.sectionUI[id];
    }

    _renderCollapsibleSection(id, title, addOns, opts) {
        const { collapsibleHeader = false, defaultVisibleCount = 0 } = opts || {};
        const state = this._getSectionState(id, collapsibleHeader);
        const count = addOns.length;

        const header = collapsibleHeader
            ? `<h2 class="su-catalog-section-title su-catalog-section-title-clickable" data-toggle-section="${id}">
                    <span>${escapeHtml(title)} <span class="su-catalog-section-count">(${count})</span></span>
                    <span class="su-catalog-section-arrow">${state.expanded ? '▲' : '▼'}</span>
                </h2>`
            : `<h2 class="su-catalog-section-title">${escapeHtml(title)}</h2>`;

        if (collapsibleHeader && !state.expanded) {
            return `<div class="su-catalog-section">${header}</div>`;
        }

        let itemsToShow = addOns;
        let showMoreBtn = '';
        if (defaultVisibleCount > 0 && !state.showAll && addOns.length > defaultVisibleCount) {
            itemsToShow = addOns.slice(0, defaultVisibleCount);
            showMoreBtn = `<button type="button" class="su-btn su-btn-ghost su-show-more-btn" data-show-more-section="${id}">הצג עוד ${addOns.length - defaultVisibleCount} תוספות</button>`;
        }

        return `<div class="su-catalog-section">${header}${itemsToShow.map((a) => this._renderAddonRow(a)).join('')}${showMoreBtn}</div>`;
    }

    _renderCatalog() {
        const s = this._state;
        const { workshopAddOns, generalSections, settings } = s.catalog;
        const w = s.selectedWorkshop || {};
        const workshopItems = workshopAddOns || [];
        const visibleCount = Number(settings?.catalogDefaultVisibleCount) || 0;

        const generalBlocks = (generalSections || [])
            .filter((sec) => (sec.addOns || []).length)
            .map((sec) => this._renderCollapsibleSection(`general_${sec.id}`, `${sec.title}`, sec.addOns, {
                collapsibleHeader: true,
                defaultVisibleCount: visibleCount,
            }))
            .join('');

        const workshopBlock = workshopItems.length
            ? this._renderCollapsibleSection('workshop', 'תוספות לסדנה', workshopItems, {
                collapsibleHeader: !!settings?.catalogCollapsedByDefault,
                defaultVisibleCount: visibleCount,
            })
            : '';

        const hasAny = workshopItems.length || generalBlocks;

        const identityBlock = s.createdVia === 'qr_staff' ? h`
            <div style="margin-top:6px;">
                <label class="su-label" for="suCustomerName">שם הלקוח</label>
                <input class="su-input" id="suCustomerName" type="text" required value="${escapeHtml(s.customerName)}" />
                <label class="su-label" for="suCustomerPhone">טלפון הלקוח</label>
                <input class="su-input" id="suCustomerPhone" type="tel" inputmode="tel" required value="${escapeHtml(s.customerPhone)}" />
            </div>
        ` : '';

        const total = this._computeTotal();
        const canCheckout = this._hasSelectedItems();

        return h`
            <div class="su-card">
                ${renderSteps(2)}
                <h1 class="su-title">${escapeHtml(w.workshopTitle || 'תוספות לסדנה')}</h1>
                <p class="su-subtitle">${escapeHtml(w.startLabel ? `סדנה בשעה ${w.startLabel}` : 'בחרו תוספות לתשלום')}</p>
                ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                ${hasAny ? `${workshopBlock}${generalBlocks}` : '<p class="su-subtitle">אין תוספות זמינות לסדנה זו כרגע.</p>'}
                ${identityBlock}
                <div class="su-summary"><span>סה"כ לתשלום</span><span>${formatIls(total)}</span></div>
                <button class="su-btn su-btn-primary" id="suCheckoutBtn" ${s.submitting || !canCheckout ? 'disabled' : ''}>
                    ${s.submitting ? 'מעביר לתשלום...' : (total > 0 ? 'המשך לתשלום' : 'המשך להזמנה')}
                </button>
                ${settings?.allowOpenAmount ? `<div class="su-link-row"><button class="su-btn su-btn-ghost" id="suBackToModeBtn">אפשרויות תשלום אחרות</button></div>` : ''}
            </div>
        `;
    }

    _renderChoosePaymentMode() {
        const s = this._state;
        const { settings } = s.catalog;
        const w = s.selectedWorkshop || {};
        return h`
            <div class="su-card">
                ${renderSteps(2)}
                <h1 class="su-title">${escapeHtml(w.workshopTitle || 'תוספות לסדנה')}</h1>
                <p class="su-subtitle">איך תרצו לשלם?</p>
                ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                <button class="su-btn su-btn-primary" id="suModeCatalogBtn">בחירה מקטלוג תוספות</button>
                <button class="su-btn su-btn-secondary" id="suModeOpenBtn" style="margin-top:10px;">${escapeHtml(settings?.openAmountLabel || 'סכום פתוח')}</button>
            </div>
        `;
    }

    _renderOpenAmount() {
        const s = this._state;
        const { settings } = s.catalog;
        const w = s.selectedWorkshop || {};

        const identityBlock = s.createdVia === 'qr_staff' ? h`
            <div style="margin-top:6px;">
                <label class="su-label" for="suCustomerName">שם הלקוח</label>
                <input class="su-input" id="suCustomerName" type="text" required value="${escapeHtml(s.customerName)}" />
                <label class="su-label" for="suCustomerPhone">טלפון הלקוח</label>
                <input class="su-input" id="suCustomerPhone" type="tel" inputmode="tel" required value="${escapeHtml(s.customerPhone)}" />
            </div>
        ` : '';

        const total = this._computeTotal();
        const canCheckout = this._hasSelectedItems();

        return h`
            <div class="su-card">
                ${renderSteps(2)}
                <h1 class="su-title">${escapeHtml(w.workshopTitle || 'סכום פתוח')}</h1>
                <p class="su-subtitle">הזינו את הסכום לתשלום.</p>
                ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                <label class="su-label" for="suOpenAmount">${escapeHtml(settings?.openAmountLabel || 'סכום פתוח')}</label>
                <input class="su-input" id="suOpenAmount" type="number" min="0" step="1" placeholder="0" value="${escapeHtml(s.openAmount)}" />
                ${identityBlock}
                <div class="su-summary"><span>סה"כ לתשלום</span><span>${formatIls(total)}</span></div>
                <button class="su-btn su-btn-primary" id="suCheckoutBtn" ${s.submitting || !canCheckout ? 'disabled' : ''}>
                    ${s.submitting ? 'מעביר לתשלום...' : (total > 0 ? 'המשך לתשלום' : 'המשך להזמנה')}
                </button>
                <div class="su-link-row">
                    <button class="su-btn su-btn-ghost" id="suBackToModeBtn">חזרה</button>
                </div>
            </div>
        `;
    }

    _renderOpenAmountPasswordModal() {
        const s = this._state;

        if (!s.openAmountPwPinConfirmed) {
            return h`
                <div class="su-modal-backdrop" id="suOpenAmountPwBackdrop">
                    <div class="su-modal">
                        <h2 class="su-title">אישור עובד/ת</h2>
                        <p class="su-subtitle">תשלום בסכום פתוח דורש אישור צוות — הזינו את קוד הצוות.</p>
                        ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                        <label class="su-label" for="suOpenAmountPw">קוד אישור</label>
                        <input class="su-input" id="suOpenAmountPw" type="password" inputmode="numeric" maxlength="6" value="${escapeHtml(s.openAmountPasswordInput)}" />
                        <button class="su-btn su-btn-primary" id="suOpenAmountPwContinueBtn">המשך</button>
                        <div class="su-link-row"><button class="su-btn su-btn-ghost" id="suOpenAmountPwCancelBtn">ביטול</button></div>
                    </div>
                </div>
            `;
        }

        const options = (s.staffOptions || []).map((o) => `
            <option value="${escapeHtml(o.id)}" ${s.openAmountStaffId === o.id ? 'selected' : ''}>${escapeHtml(o.firstName)}</option>
        `).join('');

        return h`
            <div class="su-modal-backdrop" id="suOpenAmountPwBackdrop">
                <div class="su-modal">
                    <h2 class="su-title">אישור עובד/ת</h2>
                    <p class="su-subtitle">בחרו את שמכם מהרשימה כדי לאשר סכום פתוח.</p>
                    ${s.error ? `<div class="su-error">${escapeHtml(s.error)}</div>` : ''}
                    <label class="su-label" for="suOpenAmountStaffSelect">שם</label>
                    ${s.staffOptionsLoading
                        ? '<p class="su-subtitle">טוען רשימת עובדים...</p>'
                        : `<select class="su-select" id="suOpenAmountStaffSelect">${options}</select>`}
                    <button class="su-btn su-btn-primary" id="suOpenAmountPwSubmitBtn" ${s.openAmountVerifying || s.staffOptionsLoading || !s.staffOptions.length ? 'disabled' : ''}>${s.openAmountVerifying ? 'בודק...' : 'אישור'}</button>
                    <div class="su-link-row"><button class="su-btn su-btn-ghost" id="suOpenAmountPwBackBtn">חזרה</button></div>
                </div>
            </div>
        `;
    }

    _renderImageLightbox() {
        const url = this._state.imagePreviewUrl;
        if (!url) return '';
        return h`
            <div class="su-image-lightbox-backdrop" id="suImageLightbox">
                <button type="button" class="su-image-lightbox-close" id="suImageLightboxClose" aria-label="סגירה">✕</button>
                <img class="su-image-lightbox-img" src="${escapeHtml(url)}" alt="" />
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

        root.querySelectorAll('[data-toggle-section]').forEach((el) => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-toggle-section');
                const state = this._getSectionState(id, true);
                state.expanded = !state.expanded;
                this.render();
            });
        });

        root.querySelectorAll('[data-show-more-section]').forEach((el) => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-show-more-section');
                const state = this._getSectionState(id, false);
                state.showAll = true;
                this.render();
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

        root.querySelectorAll('[data-preview-image]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                s.imagePreviewUrl = btn.getAttribute('data-preview-image');
                this.render();
            });
        });

        const imageLightbox = root.querySelector('#suImageLightbox');
        if (imageLightbox) {
            imageLightbox.addEventListener('click', () => {
                s.imagePreviewUrl = null;
                this.render();
            });
            const lightboxImg = imageLightbox.querySelector('.su-image-lightbox-img');
            if (lightboxImg) lightboxImg.addEventListener('click', (e) => e.stopPropagation());
        }
        const imageLightboxClose = root.querySelector('#suImageLightboxClose');
        if (imageLightboxClose) imageLightboxClose.addEventListener('click', (e) => {
            e.stopPropagation();
            s.imagePreviewUrl = null;
            this.render();
        });

        const openAmountInput = root.querySelector('#suOpenAmount');
        if (openAmountInput) openAmountInput.addEventListener('input', (e) => {
            s.openAmount = e.target.value;
            this._refreshSummary(root);
        });

        const customerNameInput = root.querySelector('#suCustomerName');
        if (customerNameInput) customerNameInput.addEventListener('input', (e) => { s.customerName = e.target.value; });

        const customerPhoneInput = root.querySelector('#suCustomerPhone');
        if (customerPhoneInput) {
            customerPhoneInput.addEventListener('input', (e) => { s.customerPhone = e.target.value; });
            // Staff enter the customer's phone only here, after the catalog loaded —
            // re-check the perCustomer caps for that customer once the number is set.
            customerPhoneInput.addEventListener('change', () => {
                const phone = (s.customerPhone || '').trim();
                if (phone.replace(/\D/g, '').length < 7 || phone === s.catalogPhone) return;
                this._fetchCatalog(phone, { keepQuantities: true });
            });
        }

        const checkoutBtn = root.querySelector('#suCheckoutBtn');
        if (checkoutBtn) checkoutBtn.addEventListener('click', () => this._submitCheckout());

        const modeCatalogBtn = root.querySelector('#suModeCatalogBtn');
        if (modeCatalogBtn) modeCatalogBtn.addEventListener('click', () => {
            s.paymentMode = 'catalog';
            s.screen = 'catalog';
            s.openAmount = '';
            s.error = null;
            this.render();
        });

        const modeOpenBtn = root.querySelector('#suModeOpenBtn');
        if (modeOpenBtn) modeOpenBtn.addEventListener('click', () => {
            s.error = null;
            if (s.openAmountUnlocked) {
                s.quantities = {};
                s.paymentMode = 'openAmount';
                s.screen = 'openAmount';
            } else {
                s.openAmountPasswordModalOpen = true;
                s.openAmountPasswordInput = '';
                s.openAmountPwPinConfirmed = false;
                s.openAmountStaffId = '';
            }
            this.render();
        });

        const backToModeBtn = root.querySelector('#suBackToModeBtn');
        if (backToModeBtn) backToModeBtn.addEventListener('click', () => {
            s.paymentMode = null;
            s.screen = 'choosePaymentMode';
            s.error = null;
            this.render();
        });

        const pwCancelBtn = root.querySelector('#suOpenAmountPwCancelBtn');
        if (pwCancelBtn) pwCancelBtn.addEventListener('click', () => {
            s.openAmountPasswordModalOpen = false;
            s.openAmountPasswordInput = '';
            s.openAmountPwPinConfirmed = false;
            s.openAmountStaffId = '';
            s.error = null;
            this.render();
        });

        const openAmountPwInput = root.querySelector('#suOpenAmountPw');
        if (openAmountPwInput) openAmountPwInput.addEventListener('input', (e) => { s.openAmountPasswordInput = e.target.value; });

        const pwContinueBtn = root.querySelector('#suOpenAmountPwContinueBtn');
        if (pwContinueBtn) pwContinueBtn.addEventListener('click', () => {
            if (!s.openAmountPasswordInput) {
                s.error = 'אנא הזינו קוד.';
                this.render();
                return;
            }
            s.error = null;
            s.openAmountPwPinConfirmed = true;
            if (!s.staffOptions.length) {
                s.staffOptionsLoading = true;
                this.render();
                this._dispatch('getStaffOptions', {});
            } else {
                if (!s.openAmountStaffId) s.openAmountStaffId = s.staffOptions[0].id;
                this.render();
            }
        });

        const pwBackBtn = root.querySelector('#suOpenAmountPwBackBtn');
        if (pwBackBtn) pwBackBtn.addEventListener('click', () => {
            s.openAmountPwPinConfirmed = false;
            s.error = null;
            this.render();
        });

        const openAmountStaffSelect = root.querySelector('#suOpenAmountStaffSelect');
        if (openAmountStaffSelect) openAmountStaffSelect.addEventListener('change', (e) => {
            s.openAmountStaffId = e.target.value;
        });

        const pwSubmitBtn = root.querySelector('#suOpenAmountPwSubmitBtn');
        if (pwSubmitBtn) pwSubmitBtn.addEventListener('click', () => {
            const staffId = s.openAmountStaffId || root.querySelector('#suOpenAmountStaffSelect')?.value || '';
            if (!s.openAmountPasswordInput) {
                s.error = 'אנא הזינו קוד.';
                s.openAmountPwPinConfirmed = false;
                this.render();
                return;
            }
            if (!staffId) {
                s.error = 'יש לבחור שם מהרשימה.';
                this.render();
                return;
            }
            s.error = null;
            s.openAmountVerifying = true;
            s.openAmountStaffId = staffId;
            this.render();
            this._dispatch('verifyOpenAmountCode', {
                workshopTypeId: (s.selectedWorkshop || {}).workshopTypeId,
                code: s.openAmountPasswordInput.trim(),
                staffId,
            });
        });

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
