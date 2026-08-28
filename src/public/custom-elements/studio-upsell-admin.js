/**
 * Wix Custom Element: studio-upsell-admin
 * ------------------------------------------
 * Admin management page for the in-person QR add-on upsell system.
 *
 * Top-level tabs: סדנאות (workshop list → per-workshop detail with
 * הגדרות + תוספים sub-tabs, plus a "תוספות כלליות" card for add-ons shown
 * alongside every workshop), מלאי (flat inventory management — unmanaged by
 * default, opt into a numeric stock + out-of-stock WhatsApp alert per
 * add-on), עסקאות (transaction history), תור הדפסה (print queue).
 *
 * Add-on images are uploaded to the Wix Media Manager (never a free-text
 * "open" URL) — see backend/studioUpsell/mediaUpload.js. The canonical
 * `wix:image://...` value round-trips through `image`; `imagePreviewUrl`
 * is a derived https URL used only for <img> previews.
 *
 * כמות מקסימלית per add-on can be either "פר הזמנה" (per checkout, default)
 * or "פר מזמין" (lifetime cap per customer phone) — see
 * backend/studioUpsell/inventory.js getPurchasedQuantityForCustomer.
 *
 * הוראות התקנה בוויקס:
 * 1. בעורך וויקס בעמוד "ניהול מערכת תשלום בסטודיו": הוסף רכיב "Custom Element".
 * 2. "Tag Name": studio-upsell-admin
 * 3. ID מומלץ: studioUpsellAdmin1
 * 4. העלה קובץ זה תחת "Source: Upload a file".
 *
 * תקשורת עם Velo (backend/studioUpsellService.web.js):
 *  - CE -> Velo: dispatchEvent('studio-upsell-admin-action', { detail: { type, requestId, payload } })
 *  - Velo -> CE: setAttribute('admin-data', JSON.stringify({ type, requestId, result }))
 */

const TAG_NAME = 'studio-upsell-admin';

// Sentinel `workshopType` value for add-ons shown alongside every workshop's
// catalog — must match backend/studioUpsell/catalog.js GENERAL_WORKSHOP_TYPE.
const GENERAL_WORKSHOP_TYPE = '__general__';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ECOM_ORDER_DASHBOARD_BASE = 'https://manage.wix.com/dashboard/f0548b42-7f52-447c-9076-45112f85765b/ecom-platform/order-details';

const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
    :host, .sa-root { all: initial; }
    :host { display: block; max-width: 100%; overflow-x: hidden; }
    .sa-root {
        display: block; direction: rtl; font-family: 'Rubik', Arial, sans-serif;
        color: #1f2933; box-sizing: border-box; padding: 16px;
        max-width: 100%; overflow-x: hidden;
    }
    .sa-root *, .sa-root *::before, .sa-root *::after { box-sizing: border-box; }
    .sa-table-wrap { width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .sa-table-wrap .sa-table { min-width: 640px; }
    .sa-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    .sa-title { font-size: 20px; font-weight: 800; color: #111827; margin: 0; }
    .sa-tabs { display: flex; gap: 6px; background: #f1f2f4; padding: 4px; border-radius: 12px; flex-wrap: wrap; }
    .sa-tab { padding: 8px 16px; border-radius: 9px; border: none; background: transparent; font-family: inherit; font-size: 13px; font-weight: 700; color: #6b7280; cursor: pointer; }
    .sa-tab.active { background: #fff; color: #4338ca; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .sa-card { background: #fff; border-radius: 16px; border: 1px solid #eef0f2; padding: 20px; margin-bottom: 16px; }
    .sa-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .sa-field { display: flex; flex-direction: column; gap: 4px; min-width: 140px; flex: 1; }
    .sa-label { font-size: 12px; font-weight: 700; color: #374151; }
    .sa-hint { font-size: 12px; color: #9ca3af; margin-top: 4px; line-height: 1.4; }
    .sa-info-icon {
        display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px;
        border-radius: 50%; background: #e5e7eb; color: #6b7280; font-size: 10px; font-weight: 800;
        margin-inline-start: 5px; cursor: help; position: relative; vertical-align: middle; flex-shrink: 0;
    }
    .sa-info-icon:hover .sa-tooltip, .sa-info-icon:focus .sa-tooltip { display: block; }
    .sa-tooltip {
        display: none; position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%);
        background: #111827; color: #fff; padding: 8px 10px; border-radius: 8px; font-size: 12px;
        font-weight: 500; line-height: 1.45; width: 230px; text-align: right; z-index: 50;
        box-shadow: 0 6px 18px rgba(0,0,0,.2); direction: rtl;
    }
    .sa-tooltip::after {
        content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
        border: 6px solid transparent; border-top-color: #111827;
    }
    .sa-icon-btn {
        display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
        border-radius: 8px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563;
        cursor: pointer; font-size: 13px; margin-inline-start: 8px; vertical-align: middle;
    }
    .sa-icon-btn:hover { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
    .sa-ext-link {
        display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
        border-radius: 6px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4338ca;
        text-decoration: none; font-size: 12px; flex-shrink: 0;
    }
    .sa-ext-link:hover { background: #eef2ff; border-color: #c7d2fe; }
    .sa-setting-label-row { display: flex; align-items: center; gap: 2px; }
    .sa-input, .sa-select, .sa-textarea {
        padding: 9px 12px; border-radius: 9px; border: 1.5px solid #e5e7eb; font-size: 14px; font-family: inherit; background: #f9fafb;
    }
    .sa-textarea { resize: vertical; min-height: 60px; }
    .sa-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #374151; }
    .sa-btn { padding: 10px 18px; border-radius: 10px; border: none; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
    .sa-btn:disabled { opacity: .5; cursor: not-allowed; }
    .sa-btn-primary { background: #4f46e5; color: #fff; }
    .sa-btn-primary:hover:not(:disabled) { background: #4338ca; }
    .sa-btn-danger { background: #fef2f2; color: #b91c1c; }
    .sa-btn-danger:hover { background: #fee2e2; }
    .sa-btn-ghost { background: #f1f2f4; color: #374151; }
    .sa-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .sa-table th { text-align: right; padding: 10px 8px; color: #6b7280; font-weight: 700; border-bottom: 1px solid #e5e7eb; }
    .sa-table td { padding: 10px 8px; border-bottom: 1px solid #f1f2f4; }
    .sa-table tr:last-child td { border-bottom: none; }
    .sa-thumb { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: #f1f2f4; }
    .sa-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
    .sa-badge-green { background: #ecfdf5; color: #059669; }
    .sa-badge-gray { background: #f1f2f4; color: #6b7280; }
    .sa-badge-amber { background: #fffbeb; color: #b45309; }
    .sa-badge-red { background: #fef2f2; color: #b91c1c; }
    .sa-empty { text-align: center; padding: 32px; color: #9ca3af; font-size: 13px; }
    .sa-loading { text-align: center; padding: 60px 0; color: #6b7280; font-size: 14px; }
    .sa-spinner {
        width: 34px; height: 34px; border-radius: 50%; margin: 0 auto 14px;
        border: 3px solid #e0e7ff; border-top-color: #4f46e5; animation: sa-spin 0.8s linear infinite;
    }
    @keyframes sa-spin { to { transform: rotate(360deg); } }
    .sa-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #111827; color: #fff; padding: 10px 20px; border-radius: 10px; font-size: 13px; z-index: 999; max-width: 90%; text-align: center; }
    .sa-section-title { font-size: 15px; font-weight: 800; color: #111827; margin: 0 0 12px; }
    .sa-actions-cell { display: flex; gap: 6px; }
    .sa-access-denied { text-align: center; padding: 60px 20px; color: #6b7280; }
    .sa-workshops-list { display: flex; flex-direction: column; gap: 10px; }
    .sa-workshop-row {
        display: flex; align-items: center; justify-content: space-between; gap: 14px;
        padding: 16px 18px; background: #fff; border: 1.5px solid #e5e7eb; border-radius: 14px;
        transition: box-shadow .15s ease, border-color .15s ease;
    }
    .sa-workshop-row:hover { box-shadow: 0 4px 16px rgba(91,33,182,.08); border-color: #ddd6fe; }
    .sa-workshop-row-general { border-style: dashed; background: #faf5ff; border-color: #e9d5ff; }
    .sa-workshop-row-main { flex: 1; min-width: 0; }
    .sa-workshop-row-title { font-weight: 800; font-size: 16px; color: #111827; margin-bottom: 8px; line-height: 1.3; }
    .sa-workshop-row-tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .sa-workshop-row-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .sa-badge-purple { background: #f3e8ff; color: #7c3aed; }
    .sa-toggle-switch {
        position: relative; width: 46px; height: 26px; border-radius: 999px; border: none; padding: 0;
        background: #d1d5db; cursor: pointer; transition: background .2s ease; flex-shrink: 0;
    }
    .sa-toggle-switch[data-on="true"] { background: #7c3aed; }
    .sa-toggle-switch:disabled { cursor: wait; opacity: .75; }
    .sa-toggle-thumb {
        position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%;
        background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.18); transition: right .2s ease;
    }
    .sa-toggle-switch[data-on="true"] .sa-toggle-thumb { right: 23px; }
    .sa-toggle-spinner {
        position: absolute; inset: 0; margin: auto; width: 16px; height: 16px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; animation: sa-spin .7s linear infinite;
    }
    .sa-detail-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
    .sa-subtabs { display: flex; gap: 6px; margin-bottom: 16px; }
    .sa-subtab { padding: 8px 16px; border-radius: 9px; border: 1.5px solid #e5e7eb; background: #fff; font-family: inherit; font-size: 13px; font-weight: 700; color: #6b7280; cursor: pointer; }
    .sa-subtab.active { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }
    .sa-image-picker { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .sa-image-preview { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; background: #f1f2f4; flex-shrink: 0; }
    .sa-image-preview-empty { display: flex; align-items: center; justify-content: center; font-size: 9px; color: #9ca3af; text-align: center; line-height: 1.2; }
    .sa-image-picker-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .sa-segmented { display: flex; border: 1.5px solid #e5e7eb; border-radius: 9px; overflow: hidden; width: fit-content; background: #f9fafb; }
    .sa-seg-btn { padding: 9px 14px; border: none; background: transparent; font-family: inherit; font-size: 12px; font-weight: 700; color: #6b7280; cursor: pointer; }
    .sa-seg-btn.active { background: #4f46e5; color: #fff; }
    .sa-seg-btn:disabled { opacity: .5; cursor: not-allowed; }

    @media (max-width: 640px) {
        .sa-root { padding: 10px; }
        .sa-header { flex-direction: column; align-items: stretch; }
        .sa-title { font-size: 17px; }
        .sa-tabs { width: 100%; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; }
        .sa-tab { flex: 0 0 auto; padding: 8px 12px; font-size: 12px; white-space: nowrap; }
        .sa-card { padding: 14px; border-radius: 12px; }
        .sa-row { gap: 10px; }
        .sa-field { min-width: 0; flex: 1 1 100%; }
        .sa-workshops-list { gap: 8px; }
        .sa-workshop-row { padding: 14px; flex-wrap: wrap; }
        .sa-workshop-row-title { font-size: 15px; }
        .sa-workshop-row-actions { width: 100%; justify-content: flex-end; }
        .sa-detail-header { gap: 8px; }
        .sa-subtabs { width: 100%; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; }
        .sa-subtab { flex: 0 0 auto; white-space: nowrap; }
        .sa-image-picker { flex-direction: column; align-items: flex-start; }
        .sa-image-picker-actions { width: 100%; }
        .sa-actions-cell { flex-wrap: wrap; }
    }
`;

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function formatIls(n) {
    return `₪${(Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function staffNameTooltip(name, at) {
    if (!name) return '';
    const when = formatDate(at);
    return when
        ? `<span style="cursor:help;border-bottom:1px dotted #9ca3af;" title="${escapeHtml(when)}">${escapeHtml(name)}</span>`
        : escapeHtml(name);
}

/** Displays the human-readable Wix order number (6–7 digits) + dashboard link via ecomOrderId. */
function renderOrderNumberCell(t) {
    if (!t.ecomOrderNumber) return '<span style="color:#9ca3af;">—</span>';
    const num = escapeHtml(String(t.ecomOrderNumber));
    if (!t.ecomOrderId) return num;
    const url = `${ECOM_ORDER_DASHBOARD_BASE}/${encodeURIComponent(t.ecomOrderId)}`;
    return `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">${num}<a href="${url}" target="_blank" rel="noopener noreferrer" class="sa-ext-link" title="פתיחת ההזמנה בלוח הבקרה">↗</a></span>`;
}

/** Parses generalCategories from CMS (JSON string or array). */
function parseGeneralCategoriesRaw(raw) {
    if (!raw) return [];
    let list = raw;
    if (typeof raw === 'string') {
        try { list = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(list)) return [];
    return list
        .map((c) => ({
            id: String(c?.id || '').trim(),
            title: String(c?.title || '').trim(),
            sortOrder: Number(c?.sortOrder) || 0,
        }))
        .filter((c) => c.id);
}

/** Small "ⓘ" hover-tooltip next to a setting's label — explains what it does in plain Hebrew. */
function tip(text) {
    return `<span class="sa-info-icon" tabindex="0">i<span class="sa-tooltip">${escapeHtml(text)}</span></span>`;
}

const STATUS_LABELS = {
    pending_payment: { label: 'ממתין לתשלום', cls: 'sa-badge-amber' },
    paid: { label: 'שולם', cls: 'sa-badge-green' },
    abandoned: { label: 'ננטש', cls: 'sa-badge-gray' },
    pending: { label: 'ממתין', cls: 'sa-badge-amber' },
    printing: { label: 'מדפיס', cls: 'sa-badge-amber' },
    printed: { label: 'הודפס', cls: 'sa-badge-green' },
    failed: { label: 'נכשל', cls: 'sa-badge-red' },
};

class StudioUpsellAdminElement extends HTMLElement {
    static get observedAttributes() {
        return ['admin-data'];
    }

    constructor() {
        super();
        this._requestSeq = 0;
        this._state = {
            loaded: false,
            accessDenied: false,
            activeTab: 'workshops', // workshops | inventory | transactions | print
            workshopTypes: [],
            addOns: [],
            settings: [],
            selectedWorkshopTypeId: null, // null = grid view; workshop id or GENERAL_WORKSHOP_TYPE = detail view
            workshopSubTab: 'settings', // settings | addons (detail view only)
            editingAddOn: null,
            uploadingImage: false,
            inventoryDrafts: {}, // { [addOnId]: { inventoryManaged, stockQuantity, notifyOutOfStock } } — unsaved edits in the מלאי tab
            transactionFilters: { status: '', workshopTypeId: '', addOnId: '', date: '' },
            transactions: null,
            printQueue: null,
            toast: null,
            error: null,
            togglingWorkshopTypeId: null,
            quietSettingsSave: false,
            generalCategoryDrafts: [],
        };
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        this.setAttribute('lang', 'he');
        this.innerHTML = `<style>${STYLE}</style><div class="sa-root" id="saRoot"><div class="sa-loading"><div class="sa-spinner"></div>טוען...</div></div>`;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name !== 'admin-data' || !newValue || newValue === oldValue) return;
        try {
            this._handleData(JSON.parse(newValue));
        } catch (err) {
            console.error('[studio-upsell-admin] failed to parse admin-data:', err);
        }
    }

    _dispatch(type, payload) {
        const requestId = `${type}_${++this._requestSeq}`;
        this.dispatchEvent(new CustomEvent('studio-upsell-admin-action', {
            detail: { type, requestId, payload },
            bubbles: true,
        }));
        return requestId;
    }

    _toast(message) {
        const s = this._state;
        s.toast = message;
        this.render();
        setTimeout(() => { s.toast = null; this.render(); }, 3000);
    }

    /** Reads the currently-rendered add-on form's inputs into state before any render() call that would otherwise wipe unsaved typing. */
    _syncEditingAddOnFromDom() {
        const s = this._state;
        if (!s.editingAddOn) return;
        const root = this.querySelector('#saRoot');
        if (!root) return;
        const get = (id) => root.querySelector(id);
        const title = get('#saAddOnTitle'); if (title) s.editingAddOn.title = title.value;
        const price = get('#saAddOnPrice'); if (price) s.editingAddOn.price = price.value;
        const maxQty = get('#saAddOnMaxQty'); if (maxQty) s.editingAddOn.maxQuantity = maxQty.value;
        const sortOrder = get('#saAddOnSortOrder'); if (sortOrder) s.editingAddOn.sortOrder = sortOrder.value;
        const description = get('#saAddOnDescription'); if (description) s.editingAddOn.description = description.value;
        const active = get('#saAddOnActive'); if (active) s.editingAddOn.active = active.checked;
    }

    /** Returns the current unsaved (or default) inventory settings for one add-on row in the מלאי tab. */
    _getInventoryDraft(addOn) {
        const s = this._state;
        return s.inventoryDrafts[addOn._id] || {
            inventoryManaged: !!addOn.inventoryManaged,
            stockQuantity: addOn.stockQuantity ?? 0,
            notifyOutOfStock: !!addOn.notifyOutOfStock,
        };
    }

    /** Reads a מלאי-tab row's current stock/notify inputs into the draft before a re-render (e.g. toggling managed/unmanaged). */
    _syncInventoryDraftFromDom(root, addOnId) {
        const s = this._state;
        const addOn = s.addOns.find((a) => a._id === addOnId) || { _id: addOnId };
        const draft = this._getInventoryDraft(addOn);
        const stockInput = root.querySelector(`#saInvStock_${addOnId}`);
        const notifyInput = root.querySelector(`#saInvNotify_${addOnId}`);
        s.inventoryDrafts[addOnId] = {
            ...draft,
            stockQuantity: stockInput ? stockInput.value : draft.stockQuantity,
            notifyOutOfStock: notifyInput ? notifyInput.checked : draft.notifyOutOfStock,
        };
        return s.inventoryDrafts[addOnId];
    }

    _handleData({ type, result }) {
        const s = this._state;
        this._syncEditingAddOnFromDom();

        if (result && result.error === 'ACCESS_DENIED') {
            s.accessDenied = true;
            s.loaded = true;
            this.render();
            return;
        }

        if (type === 'load') {
            s.loaded = true;
            if (result && result.error) {
                s.error = result.error;
            } else {
                s.error = null;
                s.workshopTypes = result?.workshopTypes || [];
                s.addOns = result?.addOns || [];
                s.settings = result?.settings || [];
                s.generalCategoryDrafts = parseGeneralCategoriesRaw(
                    s.settings.find((row) => row.workshopType === GENERAL_WORKSHOP_TYPE)?.generalCategories
                );
            }
            this.render();
            return;
        }

        if (result && result.error) {
            // Scoped action failure (save/upload/etc.) — surface as a toast, keep the page usable.
            s.uploadingImage = false;
            s.togglingWorkshopTypeId = null;
            s.quietSettingsSave = false;
            this._toast(result.error);
            this.render();
            return;
        }

        if (type === 'saveAddOn' || type === 'deleteAddOn') {
            s.editingAddOn = null;
            s.inventoryDrafts = {};
            this._dispatch('load', {});
            this._toast(type === 'deleteAddOn' ? 'התוסף נמחק' : 'התוסף נשמר');
            return;
        } else if (type === 'saveSettings') {
            s.togglingWorkshopTypeId = null;
            this._dispatch('load', {});
            if (!s.quietSettingsSave) this._toast('ההגדרות נשמרו');
            s.quietSettingsSave = false;
            return;
        } else if (type === 'loadTransactions') {
            s.transactions = result || [];
        } else if (type === 'loadPrintQueue') {
            s.printQueue = result || [];
        } else if (type === 'markPrintJobStatus') {
            this._dispatch('loadPrintQueue', {});
        } else if (type === 'approveOrder') {
            this._toast('ההזמנה אושרה — הבון נשלח להדפסה.');
            this._dispatch('loadTransactions', this._buildTransactionFilterPayload());
        } else if (type === 'uploadAddOnImage') {
            s.uploadingImage = false;
            if (result?.fileUrl && s.editingAddOn) {
                s.editingAddOn.image = result.fileUrl;
                s.editingAddOn.imagePreviewUrl = result.publicUrl || result.fileUrl;
            }
        }

        this.render();
    }

    /** Converts the transactions filter bar's UI state (single date, status, etc.) into a listAddOnTransactions payload. */
    _buildTransactionFilterPayload() {
        const f = this._state.transactionFilters;
        const payload = {};
        if (f.status) payload.status = f.status;
        if (f.workshopTypeId) payload.workshopTypeId = f.workshopTypeId;
        if (f.addOnId) payload.addOnId = f.addOnId;
        if (f.date) {
            payload.dateFrom = `${f.date}T00:00:00`;
            payload.dateTo = `${f.date}T23:59:59`;
        }
        return payload;
    }

    _switchTab(tab) {
        const s = this._state;
        if (tab === 'workshops' && s.activeTab !== 'workshops') s.selectedWorkshopTypeId = null;
        s.activeTab = tab;
        if (tab === 'transactions' && s.transactions === null) this._dispatch('loadTransactions', this._buildTransactionFilterPayload());
        if (tab === 'print' && s.printQueue === null) this._dispatch('loadPrintQueue', {});
        this.render();
    }

    _selectWorkshop(id) {
        const s = this._state;
        s.selectedWorkshopTypeId = id;
        s.workshopSubTab = id === GENERAL_WORKSHOP_TYPE ? 'addons' : 'settings';
        s.editingAddOn = null;
        if (id === GENERAL_WORKSHOP_TYPE) {
            s.generalCategoryDrafts = parseGeneralCategoriesRaw(
                s.settings.find((row) => row.workshopType === GENERAL_WORKSHOP_TYPE)?.generalCategories
            );
        }
        this.render();
    }

    _getGeneralCategories() {
        return parseGeneralCategoriesRaw(
            this._state.settings.find((row) => row.workshopType === GENERAL_WORKSHOP_TYPE)?.generalCategories
        );
    }

    _getGeneralCategoryTitle(categoryId) {
        if (!categoryId) return '—';
        return this._getGeneralCategories().find((c) => c.id === categoryId)?.title || '—';
    }

    _syncGeneralCategoryDraftsFromDom(root) {
        const s = this._state;
        s.generalCategoryDrafts = (s.generalCategoryDrafts || []).map((cat) => {
            const titleInput = root.querySelector(`#saCatTitle_${cat.id}`);
            const sortInput = root.querySelector(`#saCatSort_${cat.id}`);
            return {
                ...cat,
                title: titleInput ? titleInput.value.trim() : cat.title,
                sortOrder: sortInput ? Number(sortInput.value) || 0 : cat.sortOrder,
            };
        });
    }

    _backToWorkshops() {
        const s = this._state;
        s.selectedWorkshopTypeId = null;
        s.editingAddOn = null;
        this.render();
    }

    render() {
        const root = this.querySelector('#saRoot');
        if (!root) return;
        const s = this._state;

        if (s.accessDenied) {
            root.innerHTML = `<div class="sa-access-denied"><h2>אין הרשאה</h2><p>נדרשת הרשאת "ניהול מערכת תוספים בסטודיו" (manageAddOnsSystem) כדי לצפות בעמוד זה.</p></div>`;
            return;
        }

        if (!s.loaded) {
            root.innerHTML = `<div class="sa-loading"><div class="sa-spinner"></div>טוען...</div>`;
            return;
        }

        if (s.error) {
            root.innerHTML = `<div class="sa-card sa-access-denied"><h2>שגיאה בטעינה</h2><p>${escapeHtml(s.error)}</p></div>`;
            return;
        }

        const tabs = [
            ['workshops', 'סדנאות'],
            ['inventory', 'מלאי'],
            ['transactions', 'עסקאות'],
            ['print', 'תור הדפסה'],
        ].map(([id, label]) => `<button class="sa-tab ${s.activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');

        let body = '';
        if (s.activeTab === 'workshops') {
            body = s.selectedWorkshopTypeId ? this._renderWorkshopDetail() : this._renderWorkshopsList();
        } else if (s.activeTab === 'inventory') {
            body = this._renderInventoryTab();
        } else if (s.activeTab === 'transactions') {
            body = this._renderTransactionsTab();
        } else if (s.activeTab === 'print') {
            body = this._renderPrintTab();
        }

        root.innerHTML = `
            <div class="sa-header">
                <h1 class="sa-title">ניהול מערכת תשלום בסטודיו</h1>
                <div class="sa-tabs">${tabs}</div>
            </div>
            ${body}
            ${s.toast ? `<div class="sa-toast">${escapeHtml(s.toast)}</div>` : ''}
        `;
        this._bindEvents(root);
    }

    _getSettingsRow(workshopTypeId) {
        return this._state.settings.find((row) => row.workshopType === workshopTypeId) || null;
    }

    _isWorkshopActive(workshopTypeId) {
        const row = this._getSettingsRow(workshopTypeId);
        return row ? row.active !== false : true;
    }

    _toggleWorkshopActive(workshopTypeId) {
        const s = this._state;
        if (s.togglingWorkshopTypeId) return;
        s.togglingWorkshopTypeId = workshopTypeId;
        s.quietSettingsSave = true;
        this.render();
        this._dispatch('saveSettings', {
            workshopType: workshopTypeId,
            active: !this._isWorkshopActive(workshopTypeId),
        });
    }

    _renderWorkshopsList() {
        const s = this._state;
        const rows = [
            ...s.workshopTypes.map((w) => ({ id: w.id, title: w.title, isGeneral: false })),
            { id: GENERAL_WORKSHOP_TYPE, title: 'תוספות כלליות', isGeneral: true },
        ].map((w) => {
            const addOns = s.addOns.filter((a) => a.workshopType === w.id);
            const count = addOns.length;
            const activeCount = addOns.filter((a) => a.active !== false).length;
            const isActive = !w.isGeneral && this._isWorkshopActive(w.id);
            const isToggling = s.togglingWorkshopTypeId === w.id;

            const tags = [
                `<span class="sa-badge sa-badge-purple">${count} תוספים</span>`,
                count ? `<span class="sa-badge sa-badge-green">${activeCount} פעילים</span>` : '',
                !w.isGeneral ? `<span class="sa-badge ${isActive ? 'sa-badge-green' : 'sa-badge-gray'}">${isActive ? 'מערכת פעילה' : 'מערכת כבויה'}</span>` : '',
            ].filter(Boolean).join('');

            const toggleHtml = !w.isGeneral ? `
                <button type="button" class="sa-toggle-switch" data-toggle-workshop="${escapeHtml(w.id)}"
                    data-on="${isActive ? 'true' : 'false'}" ${isToggling ? 'disabled' : ''}
                    title="${isActive ? 'כיבוי מערכת תוספים' : 'הפעלת מערכת תוספים'}">
                    ${isToggling ? '<span class="sa-toggle-spinner"></span>' : '<span class="sa-toggle-thumb"></span>'}
                </button>
            ` : '';

            return `
                <div class="sa-workshop-row ${w.isGeneral ? 'sa-workshop-row-general' : ''}">
                    <div class="sa-workshop-row-main">
                        <div class="sa-workshop-row-title">${escapeHtml(w.title)}</div>
                        <div class="sa-workshop-row-tags">${tags}</div>
                    </div>
                    <div class="sa-workshop-row-actions">
                        <button type="button" class="sa-icon-btn" data-edit-workshop="${escapeHtml(w.id)}" title="עריכה">✏️</button>
                        ${toggleHtml}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="sa-workshops-list">${rows}</div>
            ${!s.workshopTypes.length ? '<div class="sa-empty" style="margin-top:16px;">לא נמצאו סוגי סדנאות. יש להוסיף סדנאות במערכת התיאום כדי שיופיעו כאן.</div>' : ''}
        `;
    }

    _renderWorkshopDetail() {
        const s = this._state;
        const isGeneral = s.selectedWorkshopTypeId === GENERAL_WORKSHOP_TYPE;
        const workshop = isGeneral ? null : s.workshopTypes.find((w) => w.id === s.selectedWorkshopTypeId);
        const title = isGeneral ? 'תוספות כלליות' : (workshop?.title || 'סדנה');

        const subTabsHtml = isGeneral ? `
            <div class="sa-subtabs">
                <button class="sa-subtab ${s.workshopSubTab === 'categories' ? 'active' : ''}" data-subtab="categories">קטגוריות</button>
                <button class="sa-subtab ${s.workshopSubTab === 'addons' ? 'active' : ''}" data-subtab="addons">תוספים</button>
            </div>
        ` : !isGeneral ? `
            <div class="sa-subtabs">
                <button class="sa-subtab ${s.workshopSubTab === 'settings' ? 'active' : ''}" data-subtab="settings">הגדרות</button>
                <button class="sa-subtab ${s.workshopSubTab === 'addons' ? 'active' : ''}" data-subtab="addons">תוספים</button>
                <button class="sa-subtab ${s.workshopSubTab === 'display' ? 'active' : ''}" data-subtab="display">תצוגה</button>
            </div>
        ` : '';

        const body = isGeneral
            ? (s.workshopSubTab === 'categories' ? this._renderGeneralCategoriesTab() : this._renderCatalogTab())
            : (s.workshopSubTab === 'addons' ? this._renderCatalogTab()
                : s.workshopSubTab === 'display' ? this._renderDisplayTab()
                : this._renderSettingsTab());

        return `
            <div class="sa-detail-header">
                <button class="sa-btn sa-btn-ghost" id="saBackToWorkshopsBtn">→ חזרה לסדנאות</button>
                <h2 class="sa-section-title" style="margin:0;">${escapeHtml(title)}</h2>
            </div>
            ${subTabsHtml}
            ${body}
        `;
    }

    _renderGeneralCategoriesTab() {
        const s = this._state;
        const drafts = s.generalCategoryDrafts || [];

        const rows = drafts.map((cat) => `
            <tr>
                <td><input class="sa-input" id="saCatTitle_${escapeHtml(cat.id)}" value="${escapeHtml(cat.title)}" placeholder="לדוגמה: אוכל" /></td>
                <td><input class="sa-input" type="number" id="saCatSort_${escapeHtml(cat.id)}" value="${escapeHtml(cat.sortOrder ?? 0)}" style="width:90px;" /></td>
                <td><button class="sa-btn sa-btn-danger" type="button" data-cat-delete="${escapeHtml(cat.id)}">מחיקה</button></td>
            </tr>
        `).join('');

        return `
            <div class="sa-card">
                <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">הגדירו קטגוריות (לדוגמה: אוכל, שתייה) — הכותרות יוצגו ללקוח בקטלוג, וכל תוסף כללי ישויך לקטגוריה.</p>
                <div class="sa-row" style="margin-bottom:16px; justify-content:flex-end; gap:8px;">
                    <button class="sa-btn sa-btn-ghost" type="button" id="saAddCategoryBtn">+ קטגוריה חדשה</button>
                    <button class="sa-btn sa-btn-primary" type="button" id="saSaveCategoriesBtn">שמירת קטגוריות</button>
                </div>
                ${drafts.length ? `
                    <div class="sa-table-wrap">
                    <table class="sa-table">
                        <thead><tr><th>שם קטגוריה</th><th>סדר תצוגה</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                    </div>
                ` : '<div class="sa-empty">אין קטגוריות עדיין — הוסיפו קטגוריה ראשונה.</div>'}
            </div>
        `;
    }

    _renderCatalogTab() {
        const s = this._state;
        const isGeneral = s.selectedWorkshopTypeId === GENERAL_WORKSHOP_TYPE;
        const addOnsForType = s.addOns.filter((a) => a.workshopType === s.selectedWorkshopTypeId);
        const editing = s.editingAddOn;
        const categories = this._getGeneralCategories();

        const rows = addOnsForType.map((a) => {
            const thumb = a.imagePreviewUrl || a.image;
            const isActive = a.active !== false;
            const stockLabel = a.inventoryManaged
                ? `<span class="sa-badge ${Number(a.stockQuantity) > 0 ? 'sa-badge-green' : 'sa-badge-red'}">${Number(a.stockQuantity) || 0} במלאי</span>`
                : '<span class="sa-badge sa-badge-gray">ללא הגבלה</span>';
            const categoryCell = isGeneral
                ? `<td>${escapeHtml(this._getGeneralCategoryTitle(a.generalCategoryId))}</td>`
                : '';
            return `
            <tr>
                <td>${thumb ? `<img class="sa-thumb" src="${escapeHtml(thumb)}" />` : '<div class="sa-thumb"></div>'}</td>
                <td>${escapeHtml(a.title)}</td>
                ${categoryCell}
                <td>${formatIls(a.price)}</td>
                <td>${stockLabel}</td>
                <td><button class="sa-badge ${isActive ? 'sa-badge-green' : 'sa-badge-gray'}" style="border:none;cursor:pointer;" data-toggle-active="${a._id}" data-active-value="${isActive ? 'false' : 'true'}" title="לחצו להחלפת מצב">${isActive ? 'פעיל' : 'כבוי'}</button></td>
                <td>${Number(a.sortOrder) || 0}</td>
                <td class="sa-actions-cell">
                    <button class="sa-btn sa-btn-ghost" data-edit-addon="${a._id}">עריכה</button>
                    <button class="sa-btn sa-btn-danger" data-delete-addon="${a._id}">מחיקה</button>
                </td>
            </tr>
        `;
        }).join('');

        const previewUrl = editing ? (editing.imagePreviewUrl || editing.image || '') : '';
        const maxQtyMode = editing?.maxQuantityMode === 'perCustomer' ? 'perCustomer' : 'perOrder';
        const categoryOptions = categories.map((cat) => `
            <option value="${escapeHtml(cat.id)}" ${editing?.generalCategoryId === cat.id ? 'selected' : ''}>${escapeHtml(cat.title)}</option>
        `).join('');
        const categoryFieldHtml = isGeneral ? `
            <div class="sa-field" style="margin-top:10px;">
                <label class="sa-label">קטגוריה</label>
                <select class="sa-select" id="saAddOnGeneralCategory">
                    <option value="">ללא קטגוריה</option>
                    ${categoryOptions}
                </select>
            </div>
        ` : '';
        const formHtml = editing ? `
            <div class="sa-card">
                <h3 class="sa-section-title">${editing._id ? 'עריכת תוסף' : 'תוסף חדש'}</h3>
                <div class="sa-row">
                    <div class="sa-field"><label class="sa-label">שם</label><input class="sa-input" id="saAddOnTitle" value="${escapeHtml(editing.title || '')}" /></div>
                    <div class="sa-field"><label class="sa-label">מחיר</label><input class="sa-input" type="number" min="0" id="saAddOnPrice" value="${escapeHtml(editing.price ?? 0)}" /></div>
                    <div class="sa-field"><label class="sa-label">סדר תצוגה</label><input class="sa-input" type="number" id="saAddOnSortOrder" value="${escapeHtml(editing.sortOrder ?? 0)}" /></div>
                </div>
                <div class="sa-row" style="margin-top:10px;">
                    <div class="sa-field">
                        <label class="sa-label">הגבלת כמות</label>
                        <div class="sa-segmented">
                            <button type="button" class="sa-seg-btn ${maxQtyMode === 'perOrder' ? 'active' : ''}" data-maxqty-mode="perOrder">פר הזמנה</button>
                            <button type="button" class="sa-seg-btn ${maxQtyMode === 'perCustomer' ? 'active' : ''}" data-maxqty-mode="perCustomer">פר מזמין</button>
                        </div>
                    </div>
                    <div class="sa-field"><label class="sa-label">כמות מקסימלית (${maxQtyMode === 'perCustomer' ? 'פר מזמין' : 'פר הזמנה'})</label><input class="sa-input" type="number" min="1" id="saAddOnMaxQty" value="${escapeHtml(editing.maxQuantity ?? 10)}" /></div>
                </div>
                <div class="sa-field" style="margin-top:10px;"><label class="sa-label">תיאור</label><textarea class="sa-textarea" id="saAddOnDescription">${escapeHtml(editing.description || '')}</textarea></div>
                ${categoryFieldHtml}
                <div class="sa-field" style="margin-top:10px;">
                    <label class="sa-label">תמונה</label>
                    <div class="sa-image-picker">
                        ${previewUrl ? `<img class="sa-image-preview" src="${escapeHtml(previewUrl)}" />` : '<div class="sa-image-preview sa-image-preview-empty">אין<br/>תמונה</div>'}
                        <div class="sa-image-picker-actions">
                            <button type="button" class="sa-btn sa-btn-ghost" id="saAddOnImagePickBtn" ${s.uploadingImage ? 'disabled' : ''}>${s.uploadingImage ? 'מעלה תמונה...' : 'בחירת תמונה מהמדיה'}</button>
                            ${previewUrl ? '<button type="button" class="sa-btn sa-btn-ghost" id="saAddOnImageRemoveBtn">הסרת תמונה</button>' : ''}
                            <input type="file" accept="image/*" id="saAddOnImageFile" style="display:none;" />
                        </div>
                    </div>
                </div>
                <div class="sa-checkbox-row" style="margin-top:10px;"><input type="checkbox" id="saAddOnActive" ${editing.active !== false ? 'checked' : ''} /><label for="saAddOnActive">פעיל</label></div>
                <div class="sa-row" style="margin-top:16px;">
                    <button class="sa-btn sa-btn-primary" id="saAddOnSaveBtn">שמירה</button>
                    <button class="sa-btn sa-btn-ghost" id="saAddOnCancelBtn">ביטול</button>
                </div>
            </div>
        ` : '';

        return `
            <div class="sa-card">
                <div class="sa-row" style="margin-bottom:16px; justify-content:flex-end;">
                    <button class="sa-btn sa-btn-primary" id="saAddOnNewBtn">+ תוסף חדש</button>
                </div>
                ${addOnsForType.length ? `
                    <div class="sa-table-wrap">
                    <table class="sa-table">
                        <thead><tr><th></th><th>שם</th>${isGeneral ? '<th>קטגוריה</th>' : ''}<th>מחיר</th><th>מלאי</th><th>סטטוס</th><th>סדר</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                    </div>
                ` : '<div class="sa-empty">אין תוספים עדיין.</div>'}
            </div>
            ${formHtml}
        `;
    }

    _renderInventoryTab() {
        const s = this._state;
        if (!s.addOns.length) return `<div class="sa-card sa-empty">אין תוספים עדיין.</div>`;

        const titleById = new Map(s.workshopTypes.map((w) => [w.id, w.title]));

        const rows = [...s.addOns]
            .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'he'))
            .map((a) => {
                const workshopLabel = a.workshopType === GENERAL_WORKSHOP_TYPE ? 'תוספות כלליות' : (titleById.get(a.workshopType) || '—');
                const draft = this._getInventoryDraft(a);
                const managed = !!draft.inventoryManaged;
                const thumb = a.imagePreviewUrl || a.image;
                return `
                <tr>
                    <td>${thumb ? `<img class="sa-thumb" src="${escapeHtml(thumb)}" />` : '<div class="sa-thumb"></div>'}</td>
                    <td>${escapeHtml(a.title)}</td>
                    <td>${escapeHtml(workshopLabel)}</td>
                    <td>
                        <div class="sa-segmented">
                            <button type="button" class="sa-seg-btn ${!managed ? 'active' : ''}" data-inv-managed="${a._id}" data-inv-value="false">לא מנוהל</button>
                            <button type="button" class="sa-seg-btn ${managed ? 'active' : ''}" data-inv-managed="${a._id}" data-inv-value="true">מנוהל</button>
                        </div>
                    </td>
                    <td><input class="sa-input" type="number" min="0" style="width:90px;" id="saInvStock_${a._id}" value="${escapeHtml(draft.stockQuantity ?? 0)}" ${managed ? '' : 'disabled'} /></td>
                    <td class="sa-checkbox-row" style="justify-content:center;"><input type="checkbox" id="saInvNotify_${a._id}" ${draft.notifyOutOfStock ? 'checked' : ''} ${managed ? '' : 'disabled'} /></td>
                    <td><button class="sa-btn sa-btn-primary" data-inv-save="${a._id}">שמירה</button></td>
                </tr>
            `;
            }).join('');

        return `
            <div class="sa-card">
                <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">כל תוסף חדש נוצר עם מלאי "לא מנוהל" (ללא הגבלה). ניתן להעביר תוסף למלאי מנוהל ולהזין כמות — כל רכישה תפחית מהמלאי אוטומטית, וניתן לבחור לקבל התראת וואטסאפ כשהמלאי מסתיים.</p>
                <div class="sa-table-wrap">
                <table class="sa-table">
                    <thead><tr><th></th><th>שם</th><th>סדנה</th><th>ניהול מלאי</th><th>כמות במלאי</th><th>התראה בסיום מלאי</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                </div>
            </div>
        `;
    }

    _renderSettingsTab() {
        const s = this._state;
        const current = s.settings.find((row) => row.workshopType === s.selectedWorkshopTypeId) || {};
        const openPwEnabled = !!current.openAmountPasswordEnabled;

        return `
            <div class="sa-card">
                <div class="sa-checkbox-row" style="margin-bottom:12px;">
                    <input type="checkbox" id="saSettingActive" ${current.active !== false ? 'checked' : ''} />
                    <label for="saSettingActive" class="sa-setting-label-row">מערכת התוספים פעילה לסוג סדנה זה ${tip('כשכבוי, לקוחות לא יראו תוספות או אפשרות תשלום לסדנה זו במסך ה-QR בסטודיו.')}</label>
                </div>

                <div class="sa-checkbox-row" style="margin-bottom:12px;">
                    <input type="checkbox" id="saSettingOpenAmount" ${current.allowOpenAmount ? 'checked' : ''} />
                    <label for="saSettingOpenAmount" class="sa-setting-label-row">אפשר סכום פתוח (תשלום חופשי) ${tip('מאפשר ללקוח להזין סכום חופשי לתשלום שלא מופיע בקטלוג התוספות, לדוגמה תרומה או תוספת מיוחדת שהוסכמה בעל פה.')}</label>
                </div>
                <div class="sa-row" style="margin-bottom:16px;">
                    <div class="sa-field"><label class="sa-label sa-setting-label-row">תווית לשדה הסכום הפתוח ${tip('הטקסט שמוצג ליד שדה הסכום ללקוח, לדוגמה: "תרומה" או "תוספת מיוחדת".')}</label><input class="sa-input" id="saSettingOpenLabel" value="${escapeHtml(current.openAmountLabel || 'סכום פתוח')}" /></div>
                    <div class="sa-field"><label class="sa-label sa-setting-label-row">סכום מינימלי ${tip('הסכום הכי נמוך שהלקוח יכול להזין. לדוגמה 20 = לא ניתן להזין פחות מ-20 ש"ח.')}</label><input class="sa-input" type="number" min="0" id="saSettingOpenMin" value="${escapeHtml(current.openAmountMin ?? 0)}" /></div>
                    <div class="sa-field"><label class="sa-label sa-setting-label-row">סכום מקסימלי ${tip('הסכום הכי גבוה שהלקוח יכול להזין. השאירו ריק = ללא הגבלה.')}</label><input class="sa-input" type="number" min="0" id="saSettingOpenMax" value="${escapeHtml(current.openAmountMax ?? '')}" /></div>
                </div>

                <div class="sa-checkbox-row" style="margin-bottom:4px;">
                    <input type="checkbox" id="saSettingOpenPwEnabled" ${openPwEnabled ? 'checked' : ''} />
                    <label for="saSettingOpenPwEnabled" class="sa-setting-label-row">
                        הוספת קוד אימות לשדה סכום פתוח <span style="color:#9ca3af; font-size:11px; font-weight:500;">(סיסמה: 1326)</span>
                        ${tip('כשמופעל, לקוח שבוחר "סכום פתוח" יתבקש להעביר את המכשיר לעובד/ת שתזין סיסמה לפני שניתן להמשיך. ברירת המחדל היא 1326, ואפשר לקבוע סיסמה מותאמת בעזרת אייקון העיפרון.')}
                        <button type="button" class="sa-icon-btn" id="saSettingOpenPwEditBtn" title="עריכת סיסמה מותאמת" style="${openPwEnabled ? '' : 'display:none;'}">✏️</button>
                    </label>
                </div>
                <div id="saSettingOpenPwWrap" style="display:none; margin:8px 0 12px;">
                    <label class="sa-label">סיסמה מותאמת (השאירו ריק לברירת המחדל 1326)</label>
                    <input class="sa-input" type="text" id="saSettingOpenPassword" placeholder="1326" value="${escapeHtml(current.openAmountPassword || '')}" />
                </div>

                <div class="sa-checkbox-row" style="margin-bottom:4px;">
                    <input type="checkbox" id="saSettingStaffCode" ${current.showStaffCode ? 'checked' : ''} />
                    <label for="saSettingStaffCode" class="sa-setting-label-row">
                        הצג קוד אימות לצוות בדף התודה
                        ${tip('כשמופעל, אחרי התשלום הלקוח יצטרך להציג את דף התודה לעובד/ת שתזין סיסמת צוות (1326) לפני שההזמנה תושלם ויודפס הבון. אם הלקוח לא הציג את המסך — ניתן לאשר ידנית מטבלת העסקאות.')}
                    </label>
                </div>
                <div class="sa-checkbox-row" style="margin-bottom:20px;">
                    <input type="checkbox" id="saSettingPrint" ${current.printOnPayment !== false ? 'checked' : ''} />
                    <label for="saSettingPrint" class="sa-setting-label-row">הוסף לתור הדפסה עם קבלת תשלום ${tip('כשמופעל, כל הזמנה משולמת (או מאושרת ע"י עובד, אם מוגדר אימות) נכנסת אוטומטית לתור ההדפסה של הבונים בעמוד "תור הדפסה".')}</label>
                </div>

                <button class="sa-btn sa-btn-primary" id="saSettingsSaveBtn">שמירת הגדרות</button>
            </div>
        `;
    }

    _renderDisplayTab() {
        const s = this._state;
        const current = s.settings.find((row) => row.workshopType === s.selectedWorkshopTypeId) || {};
        const collapsed = !!current.catalogCollapsedByDefault;

        return `
            <div class="sa-card">
                <div class="sa-checkbox-row" style="margin-bottom:4px;">
                    <input type="checkbox" id="saSettingCollapsed" ${collapsed ? 'checked' : ''} />
                    <label for="saSettingCollapsed" class="sa-setting-label-row">
                        סגירת תוספות הסדנה לתצוגה ממוזערת כברירת מחדל
                        ${tip('כשמופעל, קטע "תוספות לסדנה" (וגם קטגוריות התוספות הכלליות) יופיעו ללקוח סגורים לגמרי, עם מספר הפריטים בסוגריים — לחיצה על הכותרת תפתח אותם. שים לב: אם מוגדרת למטה "כמות מוצרים להצגה כברירת מחדל" גדולה מ-0, ההגדרה הזו לא תחול והפריטים יוצגו ישירות.')}
                    </label>
                </div>
                <div class="sa-hint" style="margin-bottom:16px;">אם מוגדרת "כמות מוצרים להצגה כברירת מחדל" שונה מ-0 למטה, הפריטים תמיד יוצגו ישירות (עם כפתור "הצג עוד") גם אם ההגדרה הזו מסומנת.</div>

                <div class="sa-field" style="max-width:320px;">
                    <label class="sa-label sa-setting-label-row">כמות מוצרים להצגה כברירת מחדל ${tip('מספר התוספים שיוצגו ללקוח מיד בכל קטע (תוספות לסדנה, וכל קטגוריה כללית) — ללא צורך לפתוח אותו. אם יש יותר, יופיע כפתור "הצג עוד". 0 = השתמש בהגדרת המזעור למעלה.')}</label>
                    <input class="sa-input" type="number" min="0" id="saSettingVisibleCount" value="${escapeHtml(current.catalogDefaultVisibleCount ?? 0)}" placeholder="0 = הגדרת המזעור למעלה" />
                </div>

                <p class="sa-hint" style="margin-top:16px;">ההגדרות האלה חלות באופן זהה על תוספות הסדנה ועל כל קטגוריית תוספות כלליות (למשל אוכל/שתייה); קטגוריות כלליות תמיד מציגות את מספר הפריטים בסוגריים ליד השם.</p>

                <button class="sa-btn sa-btn-primary" id="saDisplaySaveBtn" style="margin-top:12px;">שמירת הגדרות תצוגה</button>
            </div>
        `;
    }

    _renderTransactionFiltersBar() {
        const s = this._state;
        const f = s.transactionFilters;
        const statusOptions = [
            ['', 'כל הסטטוסים'],
            ['pending_payment', 'ממתין לתשלום'],
            ['paid', 'שולם'],
            ['abandoned', 'ננטש'],
        ].map(([v, label]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${label}</option>`).join('');

        const workshopOptions = [
            ['', 'כל הסדנאות'],
            ...s.workshopTypes.map((w) => [w.id, w.title]),
        ].map(([v, label]) => `<option value="${escapeHtml(v)}" ${f.workshopTypeId === v ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');

        const addOnOptions = [
            ['', 'כל התוספים'],
            ...s.addOns.map((a) => [a._id, a.title]),
        ].map(([v, label]) => `<option value="${escapeHtml(v)}" ${f.addOnId === v ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');

        return `
            <div class="sa-card" style="margin-bottom:16px;">
                <div class="sa-row">
                    <div class="sa-field"><label class="sa-label">סטטוס</label><select class="sa-select" id="saFilterStatus">${statusOptions}</select></div>
                    <div class="sa-field"><label class="sa-label">סדנה</label><select class="sa-select" id="saFilterWorkshop">${workshopOptions}</select></div>
                    <div class="sa-field"><label class="sa-label">תוסף</label><select class="sa-select" id="saFilterAddOn">${addOnOptions}</select></div>
                    <div class="sa-field"><label class="sa-label">תאריך</label><input class="sa-input" type="date" id="saFilterDate" value="${escapeHtml(f.date || '')}" /></div>
                    <div class="sa-field" style="flex:0;"><button class="sa-btn sa-btn-ghost" id="saFilterClearBtn">איפוס סינון</button></div>
                </div>
            </div>
        `;
    }

    _renderTransactionsTab() {
        const s = this._state;
        const filtersBar = this._renderTransactionFiltersBar();

        if (s.transactions === null) return `${filtersBar}<div class="sa-card sa-loading"><div class="sa-spinner"></div>טוען עסקאות...</div>`;
        if (!s.transactions.length) return `${filtersBar}<div class="sa-card sa-empty">אין עסקאות התואמות לסינון.</div>`;

        const rows = s.transactions.map((t) => {
            const status = STATUS_LABELS[t.status] || { label: t.status, cls: 'sa-badge-gray' };
            const itemsLabel = Array.isArray(t.items) ? t.items.map((i) => `${i.title} ×${i.quantity}`).join(', ') : '';
            const viaLabel = t.createdVia === 'qr_staff'
                ? `צוות${t.staffName ? ` (${staffNameTooltip(t.staffName, t.staffActionAt)})` : ''}`
                : (t.staffName ? `לקוח · ${staffNameTooltip(t.staffName, t.staffActionAt)}` : 'לקוח');
            // checkoutName is filled from the paid eCom order (reconcile.js) — it's who
            // actually paid, which can differ from the name the order is placed under.
            const checkoutCell = t.checkoutName || t.checkoutPhone
                ? `${escapeHtml(t.checkoutName || '')}${t.checkoutPhone ? `<br/><span style="color:#9ca3af;font-size:11px;">${escapeHtml(t.checkoutPhone)}</span>` : ''}`
                : '<span style="color:#9ca3af;">—</span>';

            // Staff approval column: only relevant for paid orders on a workshop type
            // with "showStaffCode" on. Covers the case where the customer never showed
            // the Thank You page to an employee — a manager can approve it here instead.
            let approvalCell = '<span style="color:#9ca3af;">—</span>';
            if (t.status === 'paid' && t.staffApprovalRequired) {
                approvalCell = t.staffApprovedAt
                    ? `<span class="sa-badge sa-badge-green" title="${escapeHtml(formatDate(t.staffApprovedAt))}">${staffNameTooltip(t.staffApprovedByName || 'אושר', t.staffApprovedAt)}</span>`
                    : `<button class="sa-btn sa-btn-primary" data-approve-order="${t._id}" style="padding:6px 12px;font-size:12px;">אישור ידני</button>`;
            }

            return `
                <tr>
                    <td>${formatDate(t._createdDate)}</td>
                    <td>${renderOrderNumberCell(t)}</td>
                    <td>${escapeHtml(t.workshopTitle || '')}</td>
                    <td>${escapeHtml(t.customerName || '')}<br/><span style="color:#9ca3af;font-size:11px;">${escapeHtml(t.customerPhone || '')}</span></td>
                    <td>${checkoutCell}</td>
                    <td>${escapeHtml(itemsLabel)}${Number(t.openAmount) > 0 ? ` + ${formatIls(t.openAmount)} פתוח` : ''}</td>
                    <td>${formatIls(t.total)}</td>
                    <td><span class="sa-badge ${status.cls}">${status.label}</span></td>
                    <td>${escapeHtml(viaLabel)}</td>
                    <td>${approvalCell}</td>
                </tr>
            `;
        }).join('');

        return `
            ${filtersBar}
            <div class="sa-card">
                <div class="sa-table-wrap">
                <table class="sa-table">
                    <thead><tr><th>תאריך</th><th>מספר הזמנה</th><th>סדנה</th><th>הזמנה על שם</th><th>שולם ע"י (צ'קאאוט)</th><th>פריטים</th><th>סכום</th><th>סטטוס</th><th>מקור</th><th>אישור עובד</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                </div>
            </div>
        `;
    }

    _renderPrintTab() {
        const s = this._state;
        if (s.printQueue === null) return `<div class="sa-card sa-loading"><div class="sa-spinner"></div>טוען תור הדפסה...</div>`;
        if (!s.printQueue.length) return `<div class="sa-card sa-empty">תור ההדפסה ריק.</div>`;

        const rows = s.printQueue.map((p) => {
            const status = STATUS_LABELS[p.status] || { label: p.status, cls: 'sa-badge-gray' };
            const payload = p.payload || {};
            return `
                <tr>
                    <td>${formatDate(p._createdDate)}</td>
                    <td>${escapeHtml(payload.customerName || '')}</td>
                    <td>${escapeHtml(payload.workshopTitle || '')}</td>
                    <td>${formatIls(payload.total)}</td>
                    <td><span class="sa-badge ${status.cls}">${status.label}</span></td>
                    <td class="sa-actions-cell">
                        ${p.status !== 'printed' ? `<button class="sa-btn sa-btn-primary" data-print-id="${p._id}" data-print-status="printed">סמן כהודפס</button>` : ''}
                        ${p.status !== 'failed' ? `<button class="sa-btn sa-btn-danger" data-print-id="${p._id}" data-print-status="failed">סמן ככשל</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sa-card">
                <div class="sa-table-wrap">
                <table class="sa-table">
                    <thead><tr><th>תאריך</th><th>לקוח</th><th>סדנה</th><th>סכום</th><th>סטטוס</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                </div>
            </div>
        `;
    }

    _bindEvents(root) {
        const s = this._state;

        root.querySelectorAll('[data-tab]').forEach((btn) => {
            btn.addEventListener('click', () => this._switchTab(btn.getAttribute('data-tab')));
        });

        root.querySelectorAll('[data-edit-workshop]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._selectWorkshop(btn.getAttribute('data-edit-workshop'));
            });
        });

        root.querySelectorAll('[data-toggle-workshop]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleWorkshopActive(btn.getAttribute('data-toggle-workshop'));
            });
        });

        const backBtn = root.querySelector('#saBackToWorkshopsBtn');
        if (backBtn) backBtn.addEventListener('click', () => this._backToWorkshops());

        root.querySelectorAll('[data-subtab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (s.workshopSubTab === 'categories') this._syncGeneralCategoryDraftsFromDom(root);
                s.workshopSubTab = btn.getAttribute('data-subtab');
                s.editingAddOn = null;
                this.render();
            });
        });

        const addCategoryBtn = root.querySelector('#saAddCategoryBtn');
        if (addCategoryBtn) addCategoryBtn.addEventListener('click', () => {
            this._syncGeneralCategoryDraftsFromDom(root);
            s.generalCategoryDrafts = [...(s.generalCategoryDrafts || []), {
                id: `cat_${Date.now()}`,
                title: '',
                sortOrder: s.generalCategoryDrafts?.length || 0,
            }];
            this.render();
        });

        const saveCategoriesBtn = root.querySelector('#saSaveCategoriesBtn');
        if (saveCategoriesBtn) saveCategoriesBtn.addEventListener('click', () => {
            this._syncGeneralCategoryDraftsFromDom(root);
            const categories = (s.generalCategoryDrafts || []).filter((c) => c.title);
            this._dispatch('saveSettings', {
                workshopType: GENERAL_WORKSHOP_TYPE,
                generalCategories: JSON.stringify(categories),
            });
        });

        root.querySelectorAll('[data-cat-delete]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._syncGeneralCategoryDraftsFromDom(root);
                const id = btn.getAttribute('data-cat-delete');
                s.generalCategoryDrafts = (s.generalCategoryDrafts || []).filter((c) => c.id !== id);
                this.render();
            });
        });

        const newAddOnBtn = root.querySelector('#saAddOnNewBtn');
        if (newAddOnBtn) newAddOnBtn.addEventListener('click', () => {
            s.editingAddOn = { workshopType: s.selectedWorkshopTypeId, active: true, maxQuantityMode: 'perOrder', sortOrder: s.addOns.filter(a => a.workshopType === s.selectedWorkshopTypeId).length };
            this.render();
        });

        root.querySelectorAll('[data-maxqty-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._syncEditingAddOnFromDom();
                if (s.editingAddOn) s.editingAddOn.maxQuantityMode = btn.getAttribute('data-maxqty-mode');
                this.render();
            });
        });

        root.querySelectorAll('[data-edit-addon]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-edit-addon');
                s.editingAddOn = { ...s.addOns.find((a) => a._id === id) };
                this.render();
            });
        });

        root.querySelectorAll('[data-delete-addon]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-delete-addon');
                if (confirm('למחוק את התוסף?')) this._dispatch('deleteAddOn', { addOnId: id });
            });
        });

        root.querySelectorAll('[data-toggle-active]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-toggle-active');
                const active = btn.getAttribute('data-active-value') === 'true';
                this._dispatch('saveAddOn', { _id: id, active });
            });
        });

        const cancelBtn = root.querySelector('#saAddOnCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { s.editingAddOn = null; this.render(); });

        const imagePickBtn = root.querySelector('#saAddOnImagePickBtn');
        const imageFileInput = root.querySelector('#saAddOnImageFile');
        if (imagePickBtn && imageFileInput) imagePickBtn.addEventListener('click', () => imageFileInput.click());
        if (imageFileInput) imageFileInput.addEventListener('change', () => {
            const file = imageFileInput.files?.[0];
            imageFileInput.value = '';
            if (!file) return;
            if (!file.type.startsWith('image/')) { alert('יש לבחור קובץ תמונה.'); return; }
            if (file.size > MAX_IMAGE_BYTES) { alert('התמונה גדולה מהמותר (מקסימום 8MB).'); return; }
            const reader = new FileReader();
            reader.onload = () => {
                this._syncEditingAddOnFromDom();
                s.uploadingImage = true;
                this.render();
                this._dispatch('uploadAddOnImage', { base64: reader.result, filename: file.name });
            };
            reader.onerror = () => alert('קריאת קובץ התמונה נכשלה.');
            reader.readAsDataURL(file);
        });

        const imageRemoveBtn = root.querySelector('#saAddOnImageRemoveBtn');
        if (imageRemoveBtn) imageRemoveBtn.addEventListener('click', () => {
            this._syncEditingAddOnFromDom();
            if (s.editingAddOn) {
                s.editingAddOn.image = '';
                s.editingAddOn.imagePreviewUrl = '';
            }
            this.render();
        });

        const saveAddOnBtn = root.querySelector('#saAddOnSaveBtn');
        if (saveAddOnBtn) saveAddOnBtn.addEventListener('click', () => {
            const editing = s.editingAddOn || {};
            if (s.uploadingImage) { alert('נא להמתין לסיום העלאת התמונה.'); return; }
            const payload = {
                _id: editing._id,
                title: root.querySelector('#saAddOnTitle')?.value || '',
                price: Number(root.querySelector('#saAddOnPrice')?.value) || 0,
                maxQuantity: Number(root.querySelector('#saAddOnMaxQty')?.value) || 10,
                maxQuantityMode: editing.maxQuantityMode === 'perCustomer' ? 'perCustomer' : 'perOrder',
                sortOrder: Number(root.querySelector('#saAddOnSortOrder')?.value) || 0,
                description: root.querySelector('#saAddOnDescription')?.value || '',
                image: editing.image || '',
                active: !!root.querySelector('#saAddOnActive')?.checked,
                workshopType: s.selectedWorkshopTypeId,
            };
            if (s.selectedWorkshopTypeId === GENERAL_WORKSHOP_TYPE) {
                const catId = root.querySelector('#saAddOnGeneralCategory')?.value || '';
                payload.generalCategoryId = catId || null;
            }
            if (!payload.title) { alert('יש להזין שם תוסף'); return; }
            this._dispatch('saveAddOn', payload);
        });

        const openPwEnabledCheckbox = root.querySelector('#saSettingOpenPwEnabled');
        const openPwEditBtn = root.querySelector('#saSettingOpenPwEditBtn');
        const openPwWrap = root.querySelector('#saSettingOpenPwWrap');
        if (openPwEnabledCheckbox && openPwEditBtn) {
            openPwEnabledCheckbox.addEventListener('change', () => {
                const on = openPwEnabledCheckbox.checked;
                openPwEditBtn.style.display = on ? 'inline-flex' : 'none';
                if (!on && openPwWrap) openPwWrap.style.display = 'none';
            });
        }
        if (openPwEditBtn && openPwWrap) {
            openPwEditBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openPwWrap.style.display = openPwWrap.style.display === 'none' ? 'block' : 'none';
            });
        }

        const saveSettingsBtn = root.querySelector('#saSettingsSaveBtn');
        if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => {
            const openMax = root.querySelector('#saSettingOpenMax')?.value;
            this._dispatch('saveSettings', {
                workshopType: s.selectedWorkshopTypeId,
                active: !!root.querySelector('#saSettingActive')?.checked,
                allowOpenAmount: !!root.querySelector('#saSettingOpenAmount')?.checked,
                openAmountLabel: root.querySelector('#saSettingOpenLabel')?.value || 'סכום פתוח',
                openAmountMin: Number(root.querySelector('#saSettingOpenMin')?.value) || 0,
                openAmountMax: openMax === '' ? null : Number(openMax),
                openAmountPasswordEnabled: !!root.querySelector('#saSettingOpenPwEnabled')?.checked,
                openAmountPassword: (root.querySelector('#saSettingOpenPassword')?.value || '').trim(),
                showStaffCode: !!root.querySelector('#saSettingStaffCode')?.checked,
                printOnPayment: !!root.querySelector('#saSettingPrint')?.checked,
            });
        });

        const saveDisplayBtn = root.querySelector('#saDisplaySaveBtn');
        if (saveDisplayBtn) saveDisplayBtn.addEventListener('click', () => {
            this._dispatch('saveSettings', {
                workshopType: s.selectedWorkshopTypeId,
                catalogCollapsedByDefault: !!root.querySelector('#saSettingCollapsed')?.checked,
                catalogDefaultVisibleCount: Number(root.querySelector('#saSettingVisibleCount')?.value) || 0,
            });
        });

        root.querySelectorAll('[data-inv-managed]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-inv-managed');
                const value = btn.getAttribute('data-inv-value') === 'true';
                const draft = this._syncInventoryDraftFromDom(root, id);
                s.inventoryDrafts[id] = { ...draft, inventoryManaged: value };
                this.render();
            });
        });

        root.querySelectorAll('[data-inv-save]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-inv-save');
                const draft = this._syncInventoryDraftFromDom(root, id);
                this._dispatch('saveAddOn', {
                    _id: id,
                    inventoryManaged: !!draft.inventoryManaged,
                    stockQuantity: Number(draft.stockQuantity) || 0,
                    notifyOutOfStock: !!draft.notifyOutOfStock,
                });
            });
        });

        const applyTransactionFilters = () => {
            s.transactions = null;
            this.render();
            this._dispatch('loadTransactions', this._buildTransactionFilterPayload());
        };

        const filterStatus = root.querySelector('#saFilterStatus');
        if (filterStatus) filterStatus.addEventListener('change', () => { s.transactionFilters.status = filterStatus.value; applyTransactionFilters(); });

        const filterWorkshop = root.querySelector('#saFilterWorkshop');
        if (filterWorkshop) filterWorkshop.addEventListener('change', () => { s.transactionFilters.workshopTypeId = filterWorkshop.value; applyTransactionFilters(); });

        const filterAddOn = root.querySelector('#saFilterAddOn');
        if (filterAddOn) filterAddOn.addEventListener('change', () => { s.transactionFilters.addOnId = filterAddOn.value; applyTransactionFilters(); });

        const filterDate = root.querySelector('#saFilterDate');
        if (filterDate) filterDate.addEventListener('change', () => { s.transactionFilters.date = filterDate.value; applyTransactionFilters(); });

        const filterClearBtn = root.querySelector('#saFilterClearBtn');
        if (filterClearBtn) filterClearBtn.addEventListener('click', () => {
            s.transactionFilters = { status: '', workshopTypeId: '', addOnId: '', date: '' };
            applyTransactionFilters();
        });

        root.querySelectorAll('[data-print-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._dispatch('markPrintJobStatus', {
                    printQueueId: btn.getAttribute('data-print-id'),
                    status: btn.getAttribute('data-print-status'),
                });
            });
        });

        root.querySelectorAll('[data-approve-order]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (!confirm('לאשר את ההזמנה הזו ולשלוח את הבון להדפסה?')) return;
                this._dispatch('approveOrder', { addOnOrderId: btn.getAttribute('data-approve-order') });
            });
        });
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, StudioUpsellAdminElement);
}
