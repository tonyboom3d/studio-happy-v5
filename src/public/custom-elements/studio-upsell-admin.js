/**
 * Wix Custom Element: studio-upsell-admin
 * ------------------------------------------
 * Admin management page for the in-person QR add-on upsell system.
 *
 * Top-level tabs: סדנאות (workshop cards grid → per-workshop detail with
 * הגדרות + תוספים sub-tabs, plus a "תוספות כלליות" card for add-ons shown
 * alongside every workshop), עסקאות (transaction history), תור הדפסה
 * (print queue).
 *
 * Add-on images are uploaded to the Wix Media Manager (never a free-text
 * "open" URL) — see backend/studioUpsell/mediaUpload.js. The canonical
 * `wix:image://...` value round-trips through `image`; `imagePreviewUrl`
 * is a derived https URL used only for <img> previews.
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

const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
    :host, .sa-root { all: initial; }
    .sa-root {
        display: block; direction: rtl; font-family: 'Rubik', Arial, sans-serif;
        color: #1f2933; box-sizing: border-box; padding: 16px;
    }
    .sa-root *, .sa-root *::before, .sa-root *::after { box-sizing: border-box; }
    .sa-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    .sa-title { font-size: 20px; font-weight: 800; color: #111827; margin: 0; }
    .sa-tabs { display: flex; gap: 6px; background: #f1f2f4; padding: 4px; border-radius: 12px; flex-wrap: wrap; }
    .sa-tab { padding: 8px 16px; border-radius: 9px; border: none; background: transparent; font-family: inherit; font-size: 13px; font-weight: 700; color: #6b7280; cursor: pointer; }
    .sa-tab.active { background: #fff; color: #4338ca; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .sa-card { background: #fff; border-radius: 16px; border: 1px solid #eef0f2; padding: 20px; margin-bottom: 16px; }
    .sa-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .sa-field { display: flex; flex-direction: column; gap: 4px; min-width: 140px; flex: 1; }
    .sa-label { font-size: 12px; font-weight: 700; color: #374151; }
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
    .sa-workshops-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
    .sa-workshop-card {
        background: #fff; border: 1.5px solid #eef0f2; border-radius: 16px; padding: 22px 16px;
        cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; text-align: center;
    }
    .sa-workshop-card:hover { border-color: #6366f1; box-shadow: 0 4px 14px rgba(79,70,229,.12); transform: translateY(-2px); }
    .sa-workshop-card-general { border-style: dashed; background: #f9fafb; }
    .sa-workshop-card-icon { font-size: 30px; margin-bottom: 8px; }
    .sa-workshop-card-title { font-weight: 800; font-size: 15px; color: #111827; margin-bottom: 6px; }
    .sa-workshop-card-meta { font-size: 12px; color: #6b7280; display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; }
    .sa-detail-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
    .sa-subtabs { display: flex; gap: 6px; margin-bottom: 16px; }
    .sa-subtab { padding: 8px 16px; border-radius: 9px; border: 1.5px solid #e5e7eb; background: #fff; font-family: inherit; font-size: 13px; font-weight: 700; color: #6b7280; cursor: pointer; }
    .sa-subtab.active { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }
    .sa-image-picker { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .sa-image-preview { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; background: #f1f2f4; flex-shrink: 0; }
    .sa-image-preview-empty { display: flex; align-items: center; justify-content: center; font-size: 9px; color: #9ca3af; text-align: center; line-height: 1.2; }
    .sa-image-picker-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
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
            activeTab: 'workshops', // workshops | transactions | print
            workshopTypes: [],
            addOns: [],
            settings: [],
            selectedWorkshopTypeId: null, // null = grid view; workshop id or GENERAL_WORKSHOP_TYPE = detail view
            workshopSubTab: 'settings', // settings | addons (detail view only)
            editingAddOn: null,
            uploadingImage: false,
            transactions: null,
            printQueue: null,
            toast: null,
            error: null,
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

    _handleData({ type, result }) {
        const s = this._state;

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
            }
            this.render();
            return;
        }

        if (result && result.error) {
            // Scoped action failure (save/upload/etc.) — surface as a toast, keep the page usable.
            s.uploadingImage = false;
            this._toast(result.error);
            return;
        }

        if (type === 'saveAddOn' || type === 'deleteAddOn') {
            s.editingAddOn = null;
            this._dispatch('load', {});
            this._toast(type === 'deleteAddOn' ? 'התוסף נמחק' : 'התוסף נשמר');
            return;
        } else if (type === 'saveSettings') {
            this._dispatch('load', {});
            this._toast('ההגדרות נשמרו');
            return;
        } else if (type === 'loadTransactions') {
            s.transactions = result || [];
        } else if (type === 'loadPrintQueue') {
            s.printQueue = result || [];
        } else if (type === 'markPrintJobStatus') {
            this._dispatch('loadPrintQueue', {});
        } else if (type === 'uploadAddOnImage') {
            s.uploadingImage = false;
            if (result?.fileUrl && s.editingAddOn) {
                s.editingAddOn.image = result.fileUrl;
                s.editingAddOn.imagePreviewUrl = result.publicUrl || result.fileUrl;
            }
        }

        this.render();
    }

    _switchTab(tab) {
        const s = this._state;
        if (tab === 'workshops' && s.activeTab !== 'workshops') s.selectedWorkshopTypeId = null;
        s.activeTab = tab;
        if (tab === 'transactions' && s.transactions === null) this._dispatch('loadTransactions', {});
        if (tab === 'print' && s.printQueue === null) this._dispatch('loadPrintQueue', {});
        this.render();
    }

    _selectWorkshop(id) {
        const s = this._state;
        s.selectedWorkshopTypeId = id;
        s.workshopSubTab = 'settings';
        s.editingAddOn = null;
        this.render();
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
            ['transactions', 'עסקאות'],
            ['print', 'תור הדפסה'],
        ].map(([id, label]) => `<button class="sa-tab ${s.activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');

        let body = '';
        if (s.activeTab === 'workshops') {
            body = s.selectedWorkshopTypeId ? this._renderWorkshopDetail() : this._renderWorkshopsGrid();
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

    _renderWorkshopsGrid() {
        const s = this._state;
        const cards = [
            ...s.workshopTypes.map((w) => ({ id: w.id, title: w.title, isGeneral: false })),
            { id: GENERAL_WORKSHOP_TYPE, title: 'תוספות כלליות', isGeneral: true },
        ].map((w) => {
            const count = s.addOns.filter((a) => a.workshopType === w.id).length;
            const settingsRow = !w.isGeneral ? s.settings.find((row) => row.workshopType === w.id) : null;
            const activeBadge = !w.isGeneral
                ? `<span class="sa-badge ${settingsRow?.active !== false ? 'sa-badge-green' : 'sa-badge-gray'}">${settingsRow?.active !== false ? 'פעיל' : 'כבוי'}</span>`
                : '';
            return `
                <div class="sa-workshop-card ${w.isGeneral ? 'sa-workshop-card-general' : ''}" data-select-workshop="${escapeHtml(w.id)}">
                    <div class="sa-workshop-card-icon">${w.isGeneral ? '🧩' : '🎨'}</div>
                    <div class="sa-workshop-card-title">${escapeHtml(w.title)}</div>
                    <div class="sa-workshop-card-meta"><span>${count} תוספים</span>${activeBadge}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="sa-workshops-grid">${cards}</div>
            ${!s.workshopTypes.length ? '<div class="sa-empty" style="margin-top:16px;">לא נמצאו סוגי סדנאות. יש להוסיף סדנאות במערכת התיאום כדי שיופיעו כאן.</div>' : ''}
        `;
    }

    _renderWorkshopDetail() {
        const s = this._state;
        const isGeneral = s.selectedWorkshopTypeId === GENERAL_WORKSHOP_TYPE;
        const workshop = isGeneral ? null : s.workshopTypes.find((w) => w.id === s.selectedWorkshopTypeId);
        const title = isGeneral ? 'תוספות כלליות' : (workshop?.title || 'סדנה');

        const subTabsHtml = !isGeneral ? `
            <div class="sa-subtabs">
                <button class="sa-subtab ${s.workshopSubTab === 'settings' ? 'active' : ''}" data-subtab="settings">הגדרות</button>
                <button class="sa-subtab ${s.workshopSubTab === 'addons' ? 'active' : ''}" data-subtab="addons">תוספים</button>
            </div>
        ` : '';

        const body = (isGeneral || s.workshopSubTab === 'addons') ? this._renderCatalogTab() : this._renderSettingsTab();

        return `
            <div class="sa-detail-header">
                <button class="sa-btn sa-btn-ghost" id="saBackToWorkshopsBtn">→ חזרה לסדנאות</button>
                <h2 class="sa-section-title" style="margin:0;">${escapeHtml(title)}</h2>
            </div>
            ${subTabsHtml}
            ${body}
        `;
    }

    _renderCatalogTab() {
        const s = this._state;
        const addOnsForType = s.addOns.filter((a) => a.workshopType === s.selectedWorkshopTypeId);
        const editing = s.editingAddOn;

        const rows = addOnsForType.map((a) => {
            const thumb = a.imagePreviewUrl || a.image;
            return `
            <tr>
                <td>${thumb ? `<img class="sa-thumb" src="${escapeHtml(thumb)}" />` : '<div class="sa-thumb"></div>'}</td>
                <td>${escapeHtml(a.title)}</td>
                <td>${formatIls(a.price)}</td>
                <td><span class="sa-badge ${a.active !== false ? 'sa-badge-green' : 'sa-badge-gray'}">${a.active !== false ? 'פעיל' : 'כבוי'}</span></td>
                <td>${Number(a.sortOrder) || 0}</td>
                <td class="sa-actions-cell">
                    <button class="sa-btn sa-btn-ghost" data-edit-addon="${a._id}">עריכה</button>
                    <button class="sa-btn sa-btn-danger" data-delete-addon="${a._id}">מחיקה</button>
                </td>
            </tr>
        `;
        }).join('');

        const previewUrl = editing ? (editing.imagePreviewUrl || editing.image || '') : '';
        const formHtml = editing ? `
            <div class="sa-card">
                <h3 class="sa-section-title">${editing._id ? 'עריכת תוסף' : 'תוסף חדש'}</h3>
                <div class="sa-row">
                    <div class="sa-field"><label class="sa-label">שם</label><input class="sa-input" id="saAddOnTitle" value="${escapeHtml(editing.title || '')}" /></div>
                    <div class="sa-field"><label class="sa-label">מחיר</label><input class="sa-input" type="number" min="0" id="saAddOnPrice" value="${escapeHtml(editing.price ?? 0)}" /></div>
                    <div class="sa-field"><label class="sa-label">כמות מקסימלית</label><input class="sa-input" type="number" min="1" id="saAddOnMaxQty" value="${escapeHtml(editing.maxQuantity ?? 10)}" /></div>
                    <div class="sa-field"><label class="sa-label">סדר תצוגה</label><input class="sa-input" type="number" id="saAddOnSortOrder" value="${escapeHtml(editing.sortOrder ?? 0)}" /></div>
                </div>
                <div class="sa-field" style="margin-top:10px;"><label class="sa-label">תיאור</label><textarea class="sa-textarea" id="saAddOnDescription">${escapeHtml(editing.description || '')}</textarea></div>
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
                    <table class="sa-table">
                        <thead><tr><th></th><th>שם</th><th>מחיר</th><th>סטטוס</th><th>סדר</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                ` : '<div class="sa-empty">אין תוספים עדיין.</div>'}
            </div>
            ${formHtml}
        `;
    }

    _renderSettingsTab() {
        const s = this._state;
        const current = s.settings.find((row) => row.workshopType === s.selectedWorkshopTypeId) || {};

        return `
            <div class="sa-card">
                <div class="sa-checkbox-row" style="margin-bottom:12px;"><input type="checkbox" id="saSettingActive" ${current.active !== false ? 'checked' : ''} /><label for="saSettingActive">מערכת התוספים פעילה לסוג סדנה זה</label></div>

                <div class="sa-checkbox-row" style="margin-bottom:12px;"><input type="checkbox" id="saSettingOpenAmount" ${current.allowOpenAmount ? 'checked' : ''} /><label for="saSettingOpenAmount">אפשר סכום פתוח (תשלום חופשי)</label></div>
                <div class="sa-row" style="margin-bottom:16px;">
                    <div class="sa-field"><label class="sa-label">תווית לשדה הסכום הפתוח</label><input class="sa-input" id="saSettingOpenLabel" value="${escapeHtml(current.openAmountLabel || 'סכום פתוח')}" /></div>
                    <div class="sa-field"><label class="sa-label">סכום מינימלי</label><input class="sa-input" type="number" min="0" id="saSettingOpenMin" value="${escapeHtml(current.openAmountMin ?? 0)}" /></div>
                    <div class="sa-field"><label class="sa-label">סכום מקסימלי</label><input class="sa-input" type="number" min="0" id="saSettingOpenMax" value="${escapeHtml(current.openAmountMax ?? '')}" /></div>
                </div>

                <div class="sa-checkbox-row" style="margin-bottom:12px;"><input type="checkbox" id="saSettingStaffCode" ${current.showStaffCode ? 'checked' : ''} /><label for="saSettingStaffCode">הצג קוד אימות לצוות בדף התודה</label></div>
                <div class="sa-checkbox-row" style="margin-bottom:20px;"><input type="checkbox" id="saSettingPrint" ${current.printOnPayment !== false ? 'checked' : ''} /><label for="saSettingPrint">הוסף לתור הדפסה עם קבלת תשלום</label></div>

                <button class="sa-btn sa-btn-primary" id="saSettingsSaveBtn">שמירת הגדרות</button>
            </div>
        `;
    }

    _renderTransactionsTab() {
        const s = this._state;
        if (s.transactions === null) return `<div class="sa-card sa-loading"><div class="sa-spinner"></div>טוען עסקאות...</div>`;
        if (!s.transactions.length) return `<div class="sa-card sa-empty">אין עסקאות עדיין.</div>`;

        const rows = s.transactions.map((t) => {
            const status = STATUS_LABELS[t.status] || { label: t.status, cls: 'sa-badge-gray' };
            const itemsLabel = Array.isArray(t.items) ? t.items.map((i) => `${i.title} ×${i.quantity}`).join(', ') : '';
            const viaLabel = t.createdVia === 'qr_staff' ? `צוות${t.staffName ? ` (${t.staffName})` : ''}` : 'לקוח';
            return `
                <tr>
                    <td>${formatDate(t._createdDate)}</td>
                    <td>${escapeHtml(t.workshopTitle || '')}</td>
                    <td>${escapeHtml(t.customerName || '')}<br/><span style="color:#9ca3af;font-size:11px;">${escapeHtml(t.customerPhone || '')}</span></td>
                    <td>${escapeHtml(itemsLabel)}${Number(t.openAmount) > 0 ? ` + ${formatIls(t.openAmount)} פתוח` : ''}</td>
                    <td>${formatIls(t.total)}</td>
                    <td><span class="sa-badge ${status.cls}">${status.label}</span></td>
                    <td>${escapeHtml(viaLabel)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sa-card">
                <table class="sa-table">
                    <thead><tr><th>תאריך</th><th>סדנה</th><th>לקוח</th><th>פריטים</th><th>סכום</th><th>סטטוס</th><th>מקור</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
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
                <table class="sa-table">
                    <thead><tr><th>תאריך</th><th>לקוח</th><th>סדנה</th><th>סכום</th><th>סטטוס</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    _bindEvents(root) {
        const s = this._state;

        root.querySelectorAll('[data-tab]').forEach((btn) => {
            btn.addEventListener('click', () => this._switchTab(btn.getAttribute('data-tab')));
        });

        root.querySelectorAll('[data-select-workshop]').forEach((card) => {
            card.addEventListener('click', () => this._selectWorkshop(card.getAttribute('data-select-workshop')));
        });

        const backBtn = root.querySelector('#saBackToWorkshopsBtn');
        if (backBtn) backBtn.addEventListener('click', () => this._backToWorkshops());

        root.querySelectorAll('[data-subtab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                s.workshopSubTab = btn.getAttribute('data-subtab');
                s.editingAddOn = null;
                this.render();
            });
        });

        const newAddOnBtn = root.querySelector('#saAddOnNewBtn');
        if (newAddOnBtn) newAddOnBtn.addEventListener('click', () => {
            s.editingAddOn = { workshopType: s.selectedWorkshopTypeId, active: true, sortOrder: s.addOns.filter(a => a.workshopType === s.selectedWorkshopTypeId).length };
            this.render();
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
                s.uploadingImage = true;
                this.render();
                this._dispatch('uploadAddOnImage', { base64: reader.result, filename: file.name });
            };
            reader.onerror = () => alert('קריאת קובץ התמונה נכשלה.');
            reader.readAsDataURL(file);
        });

        const imageRemoveBtn = root.querySelector('#saAddOnImageRemoveBtn');
        if (imageRemoveBtn) imageRemoveBtn.addEventListener('click', () => {
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
                sortOrder: Number(root.querySelector('#saAddOnSortOrder')?.value) || 0,
                description: root.querySelector('#saAddOnDescription')?.value || '',
                image: editing.image || '',
                active: !!root.querySelector('#saAddOnActive')?.checked,
                workshopType: s.selectedWorkshopTypeId,
            };
            if (!payload.title) { alert('יש להזין שם תוסף'); return; }
            this._dispatch('saveAddOn', payload);
        });

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
                showStaffCode: !!root.querySelector('#saSettingStaffCode')?.checked,
                printOnPayment: !!root.querySelector('#saSettingPrint')?.checked,
            });
        });

        root.querySelectorAll('[data-print-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._dispatch('markPrintJobStatus', {
                    printQueueId: btn.getAttribute('data-print-id'),
                    status: btn.getAttribute('data-print-status'),
                });
            });
        });
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, StudioUpsellAdminElement);
}
