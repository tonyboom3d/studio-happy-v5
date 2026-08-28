/**
 * Wix Custom Element: studio-upsell-confirmation
 * ------------------------------------------------
 * Dedicated Thank You / Confirmation page for the in-person add-on upsell
 * system. Once the payment is confirmed paid, one of two things happens:
 *   - Workshop type has "showStaffCode" OFF -> the full order summary shows
 *     immediately.
 *   - Workshop type has "showStaffCode" ON -> the customer must show THIS
 *     screen to an employee, who types the staff PIN (1326) and picks their
 *     name from the active staff list to approve the order.
 *     If the customer never shows the screen, a manager can approve the same
 *     order from the admin transactions table instead.
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

// Payment is considered "stale" once this many minutes have passed since
// paidAt — the date is then flagged in blinking red on screen so staff notice
// something unusual (e.g. the order sat unapproved for a while).
const STALE_PAYMENT_MINUTES = 10;

const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
    :host, .st-root { all: initial; }
    .st-root {
        display: block; direction: rtl; font-family: 'Rubik', Arial, sans-serif;
        color: #1f2933; box-sizing: border-box; max-width: 480px; margin: 0 auto; padding: 32px 16px 60px;
    }
    .st-root *, .st-root *::before, .st-root *::after { box-sizing: border-box; }
    .st-card { background: #fff; border-radius: 18px; padding: 28px 22px; box-shadow: 0 6px 24px rgba(31,41,51,0.08); border: 1px solid #eef0f2; text-align: center; }
    .st-icon { width: 64px; height: 64px; border-radius: 50%; background: #ecfdf5; color: #059669; font-size: 32px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .st-icon-lock { background: #eef2ff; color: #4338ca; }
    .st-title { font-size: 21px; font-weight: 800; margin: 0 0 6px; color: #111827; }
    .st-subtitle { font-size: 14px; color: #6b7280; margin: 0 0 20px; line-height: 1.5; }
    .st-orderer-top { font-size: 14px; color: #374151; margin: -12px 0 18px; background: #f3f4ff; border-radius: 10px; padding: 8px 12px; }
    .st-orderer-top strong { color: #4338ca; }
    .st-label { display: block; font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 6px; text-align: right; }
    .st-input {
        width: 100%; padding: 12px 14px; border-radius: 12px; border: 1.5px solid #e5e7eb;
        font-size: 16px; font-family: inherit; margin-bottom: 14px; background: #f9fafb; text-align: center;
        letter-spacing: 4px; font-weight: 700;
    }
    .st-input:focus { outline: none; border-color: #6366f1; background: #fff; }
    .st-select {
        width: 100%; padding: 12px 14px; border-radius: 12px; border: 1.5px solid #e5e7eb;
        font-size: 16px; font-family: inherit; margin-bottom: 14px; background: #f9fafb; text-align: right;
    }
    .st-select:focus { outline: none; border-color: #6366f1; background: #fff; }
    .st-btn { width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 16px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .st-btn:disabled { opacity: .5; cursor: not-allowed; }
    .st-btn-primary { background: #4f46e5; color: #fff; }
    .st-details { text-align: right; background: #f9fafb; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
    .st-detail-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 7px 0; border-bottom: 1px solid #f1f2f4; font-size: 13px; }
    .st-detail-row:last-child { border-bottom: none; }
    .st-detail-title { color: #6b7280; flex-shrink: 0; }
    .st-detail-value { font-weight: 700; color: #111827; text-align: left; }
    .st-detail-value-stale { color: #dc2626; animation: st-blink 1s step-start infinite; }
    @keyframes st-blink { 50% { opacity: 0.15; } }
    .st-summary { text-align: right; background: #f9fafb; border-radius: 14px; padding: 16px; margin-bottom: 6px; }
    .st-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f2f4; font-size: 14px; }
    .st-row:last-child { border-bottom: none; }
    .st-row-title { color: #374151; }
    .st-row-value { font-weight: 700; color: #111827; }
    .st-total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; padding-top: 12px; margin-top: 8px; border-top: 2px solid #e5e7eb; }
    .st-loading { text-align: center; padding: 50px 0; color: #6b7280; font-size: 14px; }
    .st-spinner { width: 32px; height: 32px; border-radius: 50%; margin: 0 auto 12px; border: 3px solid #e0e7ff; border-top-color: #4f46e5; animation: st-spin .8s linear infinite; }
    @keyframes st-spin { to { transform: rotate(360deg); } }
    .st-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 10px; padding: 12px; font-size: 14px; margin-bottom: 14px; }
    .st-staff-name { cursor: help; border-bottom: 1px dotted #9ca3af; }
`;

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function formatIls(n) {
    return `₪${(Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

function formatDateTime(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
}

function minutesSince(dateInput) {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / 60000;
}

/** Renders a staff name with a native hover tooltip showing when the action occurred. */
function staffNameCell(name, at) {
    if (!name) return '—';
    const when = formatDateTime(at);
    const title = when ? ` title="${escapeHtml(when)}"` : '';
    return `<span class="st-staff-name"${title}>${escapeHtml(name)}</span>`;
}

function staffDetailRow(label, name, at) {
    if (!name) return '';
    return `<div class="st-detail-row"><span class="st-detail-title">${escapeHtml(label)}</span><span class="st-detail-value">${staffNameCell(name, at)}</span></div>`;
}

// Shown to the customer for any hard failure (thrown backend error, missing
// token, or exhausted polling) — deliberately generic; full details always
// go to console.error for staff/devtools to diagnose.
const SYSTEM_ERROR_MESSAGE = 'שגיאת מערכת, יש לפנות לאחד מהעובדים.';

class StudioUpsellConfirmationElement extends HTMLElement {
    static get observedAttributes() {
        return ['thanks-data', 'thanks-error'];
    }

    constructor() {
        super();
        this._requestSeq = 0;
        this._pollTimer = null;
        this._watchdogTimer = null;
        this._pollAttempts = 0;
        this._state = {
            status: 'loading', // loading | paid | error
            order: null,
            error: null,
            approveCode: '',
            approvePinConfirmed: false,
            staffOptions: [],
            staffOptionsLoading: false,
            selectedStaffId: '',
            approving: false,
            approveError: null,
        };
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
        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (!newValue || newValue === oldValue) return;
        if (this._watchdogTimer) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
        if (name === 'thanks-data') {
            try {
                const { type, result } = JSON.parse(newValue);
                if (type === 'confirm' || type === 'summary') this._handleOrder(result);
                else if (type === 'approve') this._handleApproveResult(result);
                else if (type === 'getStaffOptions') this._handleStaffOptions(result);
            } catch (err) {
                console.error('[studio-upsell-confirmation] failed to parse thanks-data:', err);
            }
        } else if (name === 'thanks-error') {
            try {
                const { type, message } = JSON.parse(newValue);
                this._handleFatalError(type, message);
            } catch (err) {
                console.error('[studio-upsell-confirmation] failed to parse thanks-error:', err);
            }
        }
    }

    /** A genuine backend/network failure (as opposed to "not paid yet") — stop polling and show the fixed customer-facing message. */
    _handleFatalError(type, message) {
        if (this._pollTimer) clearTimeout(this._pollTimer);
        console.error(`[studio-upsell-confirmation] fatal error (type=${type}):`, message);
        if (type === 'approve') {
            this._state.approving = false;
            this._state.approveError = SYSTEM_ERROR_MESSAGE;
            this.render();
            return;
        }
        this._state = { ...this._state, status: 'error', order: null, error: SYSTEM_ERROR_MESSAGE };
        this.render();
    }

    _dispatch(type, payload) {
        const requestId = `${type}_${++this._requestSeq}`;
        this.dispatchEvent(new CustomEvent('studio-upsell-thanks-action', {
            detail: { type, requestId, payload },
            bubbles: true,
        }));
        this._armWatchdog(type);
    }

    /**
     * Safety net for the case where a dispatch fires before Velo's
     * `el.on('studio-upsell-thanks-action', ...)` listener has finished
     * registering (a DOM-connection-order race) — the CustomEvent then has no
     * listener and silently vanishes, so no thanks-data/thanks-error attribute
     * ever comes back and the customer is stuck forever. If nothing comes back
     * within 3s, retry: 'confirm'/'summary' feed into the existing
     * retry/backoff in _handleOrder; 'approve' surfaces a fatal error directly
     * (re-submitting a password entry automatically would be confusing).
     */
    _armWatchdog(type) {
        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);
        this._watchdogTimer = setTimeout(() => {
            this._watchdogTimer = null;
            console.warn(`[studio-upsell-confirmation] no response within 3s of "${type}" dispatch — possible Velo listener registration race.`);
            if (type === 'approve') {
                this._handleFatalError('approve', 'no response within 3s of approve dispatch');
            } else if (type === 'getStaffOptions') {
                this._state.staffOptionsLoading = false;
                this._state.approveError = SYSTEM_ERROR_MESSAGE;
                this.render();
            } else {
                this._handleOrder(null);
            }
        }, 3000);
    }

    _handleOrder(order) {
        if (!order) {
            // Not found yet — the checkout row is written BEFORE payment, so this
            // normally means eventual-consistency lag right after redirect, not a
            // real failure. Poll a few times before giving up.
            this._pollAttempts++;
            if (this._pollAttempts <= 5) {
                this._pollTimer = setTimeout(() => this._dispatch('summary', {}), 1500);
                return;
            }
            console.error(`[studio-upsell-confirmation] order not found after ${this._pollAttempts} polling attempts.`);
            this._state = { ...this._state, status: 'error', order: null, error: SYSTEM_ERROR_MESSAGE };
            this.render();
            return;
        }

        if (order.status !== 'paid') {
            // Webhook may still be in flight — poll a while longer before giving up.
            this._pollAttempts++;
            if (this._pollAttempts <= 8) {
                this._pollTimer = setTimeout(() => this._dispatch('summary', {}), 1500);
                return;
            }
            console.error(`[studio-upsell-confirmation] order ${order._id} still not paid (status=${order.status}) after ${this._pollAttempts} polling attempts.`);
            this._state = { ...this._state, status: 'error', order: null, error: SYSTEM_ERROR_MESSAGE };
            this.render();
            return;
        }

        this._state = { ...this._state, status: 'paid', order, error: null };
        this.render();
    }

    _handleStaffOptions(options) {
        this._state.staffOptions = Array.isArray(options) ? options : [];
        this._state.staffOptionsLoading = false;
        if (this._state.staffOptions.length && !this._state.selectedStaffId) {
            this._state.selectedStaffId = this._state.staffOptions[0].id;
        }
        this.render();
    }

    _handleApproveResult(result) {
        this._state.approving = false;
        if (!result?.success) {
            const reasonMessages = {
                wrong_pin: 'קוד שגוי — נסו שוב.',
                missing_staff: 'יש לבחור שם מהרשימה.',
                invalid_staff: 'העובד/ת שנבחר/ה אינו/ה פעיל/ה.',
                not_found: SYSTEM_ERROR_MESSAGE,
                not_paid: SYSTEM_ERROR_MESSAGE,
            };
            this._state.approveError = reasonMessages[result?.reason] || 'קוד שגוי — נסו שוב.';
            if (result?.reason === 'wrong_pin') {
                this._state.approvePinConfirmed = false;
                this._state.approveCode = '';
            }
            this.render();
            return;
        }
        this._state.approveError = null;
        this._state.approveCode = '';
        this._state.approvePinConfirmed = false;
        this._state.selectedStaffId = '';
        this._state.order = result.order || this._state.order;
        this.render();
    }

    render() {
        const root = this.querySelector('#stRoot');
        if (!root) return;
        const { status, order, error } = this._state;

        if (status === 'loading') {
            root.innerHTML = `<div class="st-card st-loading"><div class="st-spinner"></div>מאמתים את התשלום...</div>`;
            return;
        }

        if (status === 'error') {
            root.innerHTML = `<div class="st-card"><div class="st-error">${escapeHtml(error)}</div></div>`;
            return;
        }

        // Paid, but this workshop type requires an employee to approve on-screen
        // before the summary reveals (and before the receipt prints).
        if (order.staffApprovalRequired && !order.staffApprovedAt) {
            root.innerHTML = this._renderApprovalGate();
            this._bindApprovalGateEvents(root);
            return;
        }

        root.innerHTML = this._renderSummary(order);
    }

    _renderApprovalGate() {
        const s = this._state;

        if (!s.approvePinConfirmed) {
            return `
                <div class="st-card">
                    <div class="st-icon st-icon-lock">🔒</div>
                    <h1 class="st-title">התשלום התקבל בהצלחה!</h1>
                    <p class="st-subtitle">יש להציג מסך זה לאחד מאנשי הצוות — העובד/ת יזין/תזין את סיסמת הצוות כדי להמשיך.</p>
                    ${s.approveError ? `<div class="st-error">${escapeHtml(s.approveError)}</div>` : ''}
                    <label class="st-label" for="stApproveCode">סיסמת צוות</label>
                    <input class="st-input" id="stApproveCode" type="password" inputmode="numeric" maxlength="6" value="${escapeHtml(s.approveCode)}" />
                    <button class="st-btn st-btn-primary" id="stApprovePinContinueBtn">המשך</button>
                </div>
            `;
        }

        const options = (s.staffOptions || []).map((o) => `
            <option value="${escapeHtml(o.id)}" ${s.selectedStaffId === o.id ? 'selected' : ''}>${escapeHtml(o.firstName)}</option>
        `).join('');

        return `
            <div class="st-card">
                <div class="st-icon st-icon-lock">🔒</div>
                <h1 class="st-title">אישור עובד/ת</h1>
                <p class="st-subtitle">בחרו את שמכם מהרשימה כדי להשלים את ההזמנה.</p>
                ${s.approveError ? `<div class="st-error">${escapeHtml(s.approveError)}</div>` : ''}
                <label class="st-label" for="stApproveStaffSelect">שם</label>
                ${s.staffOptionsLoading
                    ? '<p class="st-subtitle">טוען רשימת עובדים...</p>'
                    : `<select class="st-select" id="stApproveStaffSelect">${options}</select>`}
                <button class="st-btn st-btn-primary" id="stApproveBtn" ${s.approving || s.staffOptionsLoading || !s.staffOptions.length ? 'disabled' : ''}>${s.approving ? 'מאשר...' : 'אישור והשלמת הזמנה'}</button>
                <button class="st-btn" id="stApproveBackBtn" style="margin-top:10px;background:#f3f4f6;color:#374151;" ${s.approving ? 'disabled' : ''}>חזרה</button>
            </div>
        `;
    }

    _bindApprovalGateEvents(root) {
        const s = this._state;

        if (!s.approvePinConfirmed) {
            const input = root.querySelector('#stApproveCode');
            if (input) input.addEventListener('input', (e) => { s.approveCode = e.target.value; });

            const continueBtn = root.querySelector('#stApprovePinContinueBtn');
            if (continueBtn) continueBtn.addEventListener('click', () => {
                if (!s.approveCode) {
                    s.approveError = 'יש להזין קוד.';
                    this.render();
                    return;
                }
                s.approveError = null;
                s.approvePinConfirmed = true;
                if (!s.staffOptions.length) {
                    s.staffOptionsLoading = true;
                    this.render();
                    this._dispatch('getStaffOptions', {});
                } else {
                    this.render();
                }
            });
            return;
        }

        const select = root.querySelector('#stApproveStaffSelect');
        if (select) select.addEventListener('change', (e) => { s.selectedStaffId = e.target.value; });

        const backBtn = root.querySelector('#stApproveBackBtn');
        if (backBtn) backBtn.addEventListener('click', () => {
            s.approvePinConfirmed = false;
            s.approveError = null;
            this.render();
        });

        const btn = root.querySelector('#stApproveBtn');
        if (btn) btn.addEventListener('click', () => {
            const staffId = s.selectedStaffId || root.querySelector('#stApproveStaffSelect')?.value || '';
            if (!staffId) {
                s.approveError = 'יש לבחור שם מהרשימה.';
                this.render();
                return;
            }
            if (!s.approveCode) {
                s.approveError = 'יש להזין קוד.';
                s.approvePinConfirmed = false;
                this.render();
                return;
            }
            s.approveError = null;
            s.approving = true;
            s.selectedStaffId = staffId;
            this.render();
            this._dispatch('approve', { code: s.approveCode.trim(), staffId });
        });
    }

    _renderSummary(order) {
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

        // "מבצע ההזמנה" — the name the order is placed under (kiosk phone-identify
        // or staff-entered customer name). "מבצע התשלום" — who actually completed
        // the Wix checkout, which staff-created orders/shared devices can differ from.
        const ordererLabel = order.customerName || order.customerPhone
            ? `${escapeHtml(order.customerName || '')}${order.customerPhone ? ` (${escapeHtml(order.customerPhone)})` : ''}`
            : '—';
        const payerLabel = order.checkoutName || order.checkoutPhone
            ? `${escapeHtml(order.checkoutName || '')}${order.checkoutPhone ? ` (${escapeHtml(order.checkoutPhone)})` : ''}`
            : '—';

        const paidMinutesAgo = minutesSince(order.paidAt);
        const isStalePayment = paidMinutesAgo != null && paidMinutesAgo > STALE_PAYMENT_MINUTES;
        const paidAtLabel = formatDateTime(order.paidAt) || '—';

        const ordererName = order.customerName || order.checkoutName || '';
        const topOrdererHtml = ordererName ? `
            <p class="st-orderer-top">הזמנה בוצע ע"י <strong>${escapeHtml(ordererName)}</strong></p>
        ` : '';

        const kioskStaffLabel = order.createdVia === 'qr_staff' ? 'עובד/ת (כניסת צוות)' : 'עובד/ת (סכום פתוח)';

        const detailsHtml = `
            <div class="st-details">
                <div class="st-detail-row"><span class="st-detail-title">שם סדנה</span><span class="st-detail-value">${escapeHtml(order.workshopTitle || '—')}</span></div>
                <div class="st-detail-row"><span class="st-detail-title">מבצע ההזמנה</span><span class="st-detail-value">${ordererLabel}</span></div>
                <div class="st-detail-row"><span class="st-detail-title">מבצע התשלום</span><span class="st-detail-value">${payerLabel}</span></div>
                <div class="st-detail-row"><span class="st-detail-title">תאריך ושעת תשלום</span><span class="st-detail-value ${isStalePayment ? 'st-detail-value-stale' : ''}">${escapeHtml(paidAtLabel)}</span></div>
                ${staffDetailRow(kioskStaffLabel, order.staffName, order.staffActionAt)}
                ${staffDetailRow('אושר ע"י', order.staffApprovedByName, order.staffApprovedAt)}
                <div class="st-detail-row"><span class="st-detail-title">בון</span><span class="st-detail-value">${order.receiptQueued ? 'הופק' : 'לא הופק'}</span></div>
            </div>
        `;

        return `
            <div class="st-card">
                <div class="st-icon">✓</div>
                <h1 class="st-title">התשלום התקבל בהצלחה!</h1>
                <p class="st-subtitle">${escapeHtml(order.workshopTitle ? `תודה על הרכישה — ${order.workshopTitle}` : 'תודה על הרכישה')}</p>
                ${topOrdererHtml}
                ${detailsHtml}
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
