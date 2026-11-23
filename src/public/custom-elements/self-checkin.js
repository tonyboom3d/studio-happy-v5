/**
 * Wix Custom Element: self-checkin
 * ---------------------------------
 * Self check-in flow (QR scan at the studio → phone → SMS OTP → success).
 * All UI text is Hebrew/RTL per spec.
 *
 * Installation in Wix Editor:
 * 1. New page at /checkin (hidden from menus/sitemap).
 * 2. Custom Element — Tag Name: self-checkin, Source: this file.
 * 3. Page code: see the reference page controller this CE is paired with
 *    (ask the dev — not a real Wix page file yet since the page doesn't
 *    exist in the Editor). Element id assumed: #selfCheckin.
 *
 * Device-token / anti-sharing design: this CE (plain browser JS, full
 * `window`/`localStorage` access — unlike the sandboxed Velo page code)
 * owns the device token and the `?cs=` session id in the URL. The Velo page
 * is a thin bridge to backend/checkinService.web.js and never sees the raw
 * token beyond relaying it.
 *
 * Protocol:
 *   CE  → page:  CustomEvent `checkin-action`, detail { type, payload }
 *                types: 'ready' { deviceToken, sessionId }
 *                       'submitPhone' { phone }
 *                       'resendOtp'   { phone }
 *                       'submitOtp'   { code }
 *   page → CE:   attribute `checkin-state` (JSON), shape:
 *                { step: 'loading'|'phone'|'otp'|'success'|'error',
 *                  sessionId, phone?, error?, order?, staff? }
 */

const DEVICE_TOKEN_KEY = 'studiohappy_checkin_device_token';
const SESSION_QUERY_PARAM = 'cs';
const OTP_LENGTH = 5;

const ERROR_MESSAGES = {
    NON_TRANSFERABLE: 'הקישור הזה אישי ואינו ניתן להעברה. יש לסרוק את קוד ה-QR בסטודיו מהדפדפן שבו הוא נסרק במקור.',
    SESSION_EXPIRED: 'פג תוקף ההפעלה. יש לסרוק את קוד ה-QR מחדש.',
    FEATURE_DISABLED: 'מערכת הצ\'ק-אין העצמי אינה פעילה כרגע. נא לפנות לצוות הסטודיו.',
    NO_ORDER_TODAY: 'לא מצאנו הזמנה לסדנה היום עבור המספר הזה. נא לפנות לצוות הסטודיו.',
    TOO_EARLY: 'הצ\'ק-אין לסדנה שלכם עדיין לא נפתח. נסו שוב בהמשך או פנו לצוות הסטודיו.',
    TOO_LATE: 'חלון הצ\'ק-אין לסדנה שלכם הסתיים. נא לפנות לצוות הסטודיו.',
    INVALID_PHONE: 'מספר הטלפון שהוזן אינו תקין.',
    OTP_SEND_LIMIT: 'חרגתם ממספר הניסיונות לשליחת קוד. נא לפנות לצוות הסטודיו.',
    OTP_COOLDOWN: 'נא להמתין קצת לפני בקשת קוד נוסף.',
    SMS_FAILED: 'שליחת קוד האימות נכשלה. נסו שוב או פנו לצוות הסטודיו.',
    OTP_EXPIRED: 'פג תוקף הקוד. בקשו קוד חדש.',
    OTP_LOCKED: 'חרגתם ממספר הניסיונות. בקשו קוד חדש.',
    OTP_WRONG: 'הקוד שגוי. נסו שוב.',
    NO_OTP: 'לא נשלח קוד אימות. נא לבקש קוד חדש.',
    SYSTEM_ERROR: 'אירעה תקלה. נא לפנות לצוות הסטודיו.',
};

function errorMessageFor(code) {
    return ERROR_MESSAGES[code] || ERROR_MESSAGES.SYSTEM_ERROR;
}

function scEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initialsOf(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(/\s+/);
    return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : trimmed.slice(0, 2);
}

function getOrCreateDeviceToken() {
    try {
        const existing = window.localStorage.getItem(DEVICE_TOKEN_KEY);
        if (existing) return existing;
        const fresh = (window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`)
            + '_' + Math.random().toString(36).slice(2);
        window.localStorage.setItem(DEVICE_TOKEN_KEY, fresh);
        return fresh;
    } catch (err) {
        // localStorage unavailable (private mode / disabled) — token won't
        // survive a refresh, but the current page load still works.
        console.error('[self-checkin] localStorage unavailable:', err?.message || err);
        return `volatile_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
}

function getSessionIdFromUrl() {
    try {
        return new URLSearchParams(window.location.search).get(SESSION_QUERY_PARAM) || null;
    } catch {
        return null;
    }
}

function syncSessionIdToUrl(sessionId) {
    if (!sessionId) return;
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get(SESSION_QUERY_PARAM) === sessionId) return;
        url.searchParams.set(SESSION_QUERY_PARAM, sessionId);
        window.history.replaceState(null, '', url.toString());
    } catch (err) {
        console.error('[self-checkin] failed to sync ?cs= to URL:', err?.message || err);
    }
}

const SELF_CHECKIN_STYLE = `
self-checkin { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #faf7f2; min-height: 100vh; color: #1f2937; }
self-checkin * { box-sizing: border-box; }
.wck-wrap { max-width: 440px; margin: 0 auto; padding: 36px 18px 48px; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; }
.wck-card { background: #fff; border: 1px solid #ece6db; border-radius: 20px; padding: 30px 24px; box-shadow: 0 4px 18px rgba(0,0,0,.06); text-align: center; }
.wck-logo { font-size: 15px; font-weight: 700; color: #a8763e; letter-spacing: .5px; margin-bottom: 18px; }
.wck-h1 { margin: 0 0 8px; font-size: 21px; font-weight: 800; }
.wck-sub { color: #6b7280; font-size: 14px; margin-bottom: 22px; line-height: 1.5; }
.wck-spinner { width: 38px; height: 38px; border: 3px solid #ece6db; border-top-color: #a8763e; border-radius: 50%; margin: 22px auto; animation: wck-spin .8s linear infinite; }
@keyframes wck-spin { to { transform: rotate(360deg); } }
.wck-field { width: 100%; border: 1.5px solid #d9d2c6; border-radius: 12px; padding: 14px 16px; font-size: 18px; font-family: inherit; text-align: center; margin-bottom: 14px; letter-spacing: 1px; }
.wck-field:focus { outline: none; border-color: #a8763e; }
.wck-btn { width: 100%; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: inherit; background: #a8763e; color: #fff; transition: opacity .15s; }
.wck-btn:hover { opacity: .92; }
.wck-btn:disabled { opacity: .5; cursor: default; }
.wck-link-btn { background: none; border: none; color: #a8763e; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; padding: 10px; text-decoration: underline; }
.wck-link-btn:disabled { color: #b7b0a3; cursor: default; text-decoration: none; }
.wck-err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 12px; padding: 13px 14px; font-size: 14px; font-weight: 600; margin-bottom: 16px; text-align: center; line-height: 1.5; }
.wck-fatal { background: #fff; border: 1px solid #fecaca; border-radius: 16px; padding: 24px; text-align: center; }
.wck-fatal-icon { font-size: 38px; margin-bottom: 10px; }
.wck-success-icon { width: 60px; height: 60px; border-radius: 50%; background: #ecfdf5; color: #059669; display: flex; align-items: center; justify-content: center; font-size: 30px; margin: 0 auto 14px; }
.wck-order-box { background: #f6f2ea; border: 1px solid #ece6db; border-radius: 14px; padding: 16px; text-align: right; margin: 18px 0; font-size: 14px; line-height: 1.7; }
.wck-order-box b { font-size: 15px; }
.wck-order-row { display: flex; justify-content: space-between; padding: 3px 0; }
.wck-order-row span:first-child { color: #6b7280; }
.wck-staff-box { display: flex; align-items: center; gap: 14px; background: #fff7ec; border: 1px solid #f3dfb8; border-radius: 14px; padding: 14px; margin-top: 16px; text-align: right; }
.wck-staff-avatar { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #a8763e; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; }
.wck-staff-text { font-size: 14px; line-height: 1.5; }
.wck-staff-text b { display: block; font-size: 15.5px; }
.wck-generic-staff { background: #fff7ec; border: 1px solid #f3dfb8; border-radius: 14px; padding: 14px; margin-top: 16px; font-size: 14px; line-height: 1.6; }
.wck-phone-hint { font-size: 12.5px; color: #9ca3af; margin-top: -6px; margin-bottom: 14px; }
`;

class SelfCheckin extends HTMLElement {
    static get observedAttributes() { return ['checkin-state']; }

    constructor() {
        super();
        this._state = { step: 'loading' };
        this._sessionId = null;
        this._deviceToken = null;
        this._phoneValue = '';
        this._sending = false;
        this._otpAbort = null;
    }

    connectedCallback() {
        if (!document.getElementById('wck-style')) {
            const style = document.createElement('style');
            style.id = 'wck-style';
            style.textContent = SELF_CHECKIN_STYLE;
            document.head.appendChild(style);
        }

        this._deviceToken = getOrCreateDeviceToken();
        this._sessionId = getSessionIdFromUrl();

        this.render();

        this.addEventListener('click', (e) => this.handleClick(e));
        this.addEventListener('submit', (e) => this.handleSubmit(e));

        this.dispatchAction('ready', { deviceToken: this._deviceToken, sessionId: this._sessionId });
        this.tryWebOtpAutofill();
    }

    disconnectedCallback() {
        this._otpAbort?.abort();
    }

    dispatchAction(type, payload) {
        this.dispatchEvent(new CustomEvent('checkin-action', { detail: { type, payload }, bubbles: true }));
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (name !== 'checkin-state' || !newVal) return;
        try {
            const parsed = JSON.parse(newVal);
            if (parsed.sessionId) {
                this._sessionId = parsed.sessionId;
                syncSessionIdToUrl(parsed.sessionId);
            }
            this._state = parsed;
            this._sending = false;
            this.render();
            if (parsed.step === 'otp') this.tryWebOtpAutofill();
        } catch (err) {
            console.error('[self-checkin] bad JSON attribute:', err?.message || err);
        }
    }

    /** Android Chrome WebOTP — auto-fills + submits without opening the SMS app. No-op elsewhere (iOS/desktop autofill via autocomplete="one-time-code" on the input itself). */
    tryWebOtpAutofill() {
        if (!('OTPCredential' in window)) return;
        this._otpAbort?.abort();
        const controller = new AbortController();
        this._otpAbort = controller;
        navigator.credentials.get({ otp: { transport: ['sms'] }, signal: controller.signal })
            .then((otp) => {
                const input = this.querySelector('#wckOtpInput');
                if (input && otp?.code) {
                    input.value = otp.code;
                    this.submitOtp(otp.code);
                }
            })
            .catch(() => { /* user dismissed / unsupported — ignore */ });
    }

    handleClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'resend') this.resendOtp();
    }

    handleSubmit(e) {
        e.preventDefault();
        if (this._sending) return;
        if (this._state.step === 'phone') {
            const phone = this.querySelector('#wckPhoneInput')?.value || '';
            this.submitPhone(phone);
        } else if (this._state.step === 'otp') {
            const code = this.querySelector('#wckOtpInput')?.value || '';
            this.submitOtp(code);
        }
    }

    submitPhone(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (!/^0\d{8,9}$/.test(digits)) {
            this._state = { ...this._state, step: 'phone', error: 'INVALID_PHONE' };
            this.render();
            return;
        }
        this._sending = true;
        this._phoneValue = digits;
        this.render();
        this.dispatchAction('submitPhone', { phone: digits });
    }

    resendOtp() {
        if (this._sending) return;
        this._sending = true;
        this.render();
        this.dispatchAction('resendOtp', { phone: this._phoneValue || this._state.phone });
    }

    submitOtp(code) {
        const digits = String(code || '').replace(/\D/g, '');
        if (digits.length !== OTP_LENGTH) return;
        this._sending = true;
        this.render();
        this.dispatchAction('submitOtp', { code: digits });
    }

    renderOrderBox(order) {
        if (!order) return '';
        const peopleLine = order.children
            ? `${order.adults} מבוגרים, ${order.children} ילדים`
            : `${order.adults} משתתפים`;
        return `
            <div class="wck-order-box">
                <b>${scEsc(order.workshopTypeLabel)}${order.timeLabel ? ` · ${scEsc(order.timeLabel)}` : ''}</b>
                <div class="wck-order-row"><span>שם</span><span>${scEsc(order.organizerName)}</span></div>
                ${order.orderNumber ? `<div class="wck-order-row"><span>מספר הזמנה</span><span>#${scEsc(order.orderNumber)}</span></div>` : ''}
                <div class="wck-order-row"><span>משתתפים</span><span>${scEsc(peopleLine)}</span></div>
            </div>`;
    }

    renderStaffBox(staff) {
        if (staff?.name) {
            const avatar = staff.photoUrl
                ? `<img class="wck-staff-avatar" src="${scEsc(staff.photoUrl)}" alt="${scEsc(staff.name)}">`
                : `<div class="wck-staff-avatar">${scEsc(initialsOf(staff.name))}</div>`;
            return `
                <div class="wck-staff-box">
                    ${avatar}
                    <div class="wck-staff-text">
                        <b>${scEsc(staff.name)}</b>
                        נא לגשת אל ${scEsc(staff.name)} בסטודיו
                    </div>
                </div>`;
        }
        return `<div class="wck-generic-staff">הצ'ק-אין נרשם בהצלחה! נא לגשת לאחד/ת מצוות הסטודיו כדי להתחיל.</div>`;
    }

    render() {
        const s = this._state || { step: 'loading' };
        let inner;

        if (s.step === 'error' || !s.step) {
            inner = `
                <div class="wck-fatal">
                    <div class="wck-fatal-icon">⚠️</div>
                    <div class="wck-h1">לא ניתן להמשיך</div>
                    <div class="wck-sub">${scEsc(errorMessageFor(s.code))}</div>
                </div>`;
        } else if (s.step === 'loading') {
            inner = `
                <div class="wck-card">
                    <div class="wck-logo">STUDIO HAPPY</div>
                    <div class="wck-spinner"></div>
                    <div class="wck-sub">מכינים את הצ'ק-אין…</div>
                </div>`;
        } else if (s.step === 'phone') {
            inner = `
                <div class="wck-card">
                    <div class="wck-logo">STUDIO HAPPY</div>
                    <div class="wck-h1">ברוכים הבאים! 🎉</div>
                    <div class="wck-sub">נא להזין את מספר הטלפון שאיתו נרשמתם לסדנה</div>
                    ${s.error ? `<div class="wck-err">${scEsc(errorMessageFor(s.error))}</div>` : ''}
                    <form id="wckPhoneForm">
                        <input id="wckPhoneInput" class="wck-field" type="tel" inputmode="numeric" autocomplete="tel"
                            placeholder="05XXXXXXXX" maxlength="10" dir="ltr" value="${scEsc(this._phoneValue)}" ${this._sending ? 'disabled' : ''}>
                        <button type="submit" class="wck-btn" ${this._sending ? 'disabled' : ''}>${this._sending ? 'שולח…' : 'שליחת קוד אימות'}</button>
                    </form>
                </div>`;
        } else if (s.step === 'otp') {
            inner = `
                <div class="wck-card">
                    <div class="wck-logo">STUDIO HAPPY</div>
                    <div class="wck-h1">קוד אימות</div>
                    <div class="wck-sub">שלחנו קוד ב-SMS למספר ${scEsc(s.phone || this._phoneValue)}</div>
                    ${s.error ? `<div class="wck-err">${scEsc(errorMessageFor(s.error))}</div>` : ''}
                    <form id="wckOtpForm">
                        <input id="wckOtpInput" class="wck-field" type="text" inputmode="numeric" autocomplete="one-time-code"
                            placeholder="•••••" maxlength="${OTP_LENGTH}" dir="ltr" ${this._sending ? 'disabled' : ''}>
                        <button type="submit" class="wck-btn" ${this._sending ? 'disabled' : ''}>${this._sending ? 'מאשרים…' : 'אישור קוד'}</button>
                    </form>
                    <button type="button" class="wck-link-btn" data-action="resend" ${this._sending ? 'disabled' : ''}>לא קיבלתי קוד — שלחו שוב</button>
                </div>`;
        } else if (s.step === 'success') {
            inner = `
                <div class="wck-card">
                    <div class="wck-success-icon">✓</div>
                    <div class="wck-h1">הצ'ק-אין בוצע בהצלחה!</div>
                    <div class="wck-sub">נתראה בסדנה 🎨</div>
                    ${this.renderOrderBox(s.order)}
                    ${this.renderStaffBox(s.staff)}
                </div>`;
        } else {
            inner = `
                <div class="wck-fatal">
                    <div class="wck-fatal-icon">⚠️</div>
                    <div class="wck-h1">לא ניתן להמשיך</div>
                    <div class="wck-sub">${scEsc(errorMessageFor('SYSTEM_ERROR'))}</div>
                </div>`;
        }

        this.innerHTML = `<div class="wck-wrap">${inner}</div>`;
    }
}

if (!customElements.get('self-checkin')) {
    customElements.define('self-checkin', SelfCheckin);
}
