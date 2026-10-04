/**
 * Wix Custom Element: pickup-scheduler
 * ------------------------------------
 * עמוד "תיאום איסוף" — הלקוח מגיע מקישור חד-פעמי בוואטסאפ (טוקן בתוקף 30
 * דקות, נוצר ע"י http-functions.js get_startPickup) ובוחר מועד/שעת סדנה
 * שבה יגיע לאסוף את ההזמנה. רק סדנאות עם 2+ הזמנות שונות מוצגות (כדי
 * שיהיה מי לקבל את הלקוח), עד 20 יום ממועד הודעת "מוכן לאיסוף".
 *
 * התקנה בוויקס (לביצוע ע"י המשתמש):
 * 1. יצירת עמוד חדש "תיאום איסוף" (יקבל סיומת קובץ אוטומטית, למשל .xxxxx.js).
 * 2. הוספת Custom Element — Tag Name: pickup-scheduler, Source: קובץ זה.
 * 3. רישום ה-Element ID שהעורך נתן (למשל #pickupScheduler1) בקוד העמוד.
 * 4. לוודא שכתובת העמוד תואמת ל-PICKUP_PAGE_URL ב-http-functions.js
 *    (get_startPickup) — כרגע https://www.studiohappy.art/pickup-schedule.
 *
 * תקשורת:
 * - קלט:  attribute `context-data` — תוצאת getPickupContext (או {loading}/{error}).
 * - קלט:  attribute `submit-result` — תוצאת submitPickupAppointment.
 * - פלט:  CustomEvent `submit-request` עם detail = { slotKey }.
 */

const PS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap');
pickup-scheduler { display: block; direction: rtl; font-family: 'Rubik', 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
pickup-scheduler * { box-sizing: border-box; font-family: inherit; }
.ps-wrap { max-width: 560px; margin: 0 auto; padding: 28px 16px 60px; }
.ps-head { text-align: center; margin-bottom: 16px; }
.ps-head h1 { margin: 0 0 4px; font-size: 19px; color: #581E83; }
.ps-sub { color: #6b7280; font-size: 13.5px; }
.ps-quota { text-align: center; font-size: 13px; color: #581E83; background: #f3ecfb; border: 1px solid #d9c3ee; border-radius: 10px; padding: 8px; margin-bottom: 14px; }
.ps-current { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 12px; padding: 10px 14px; margin-bottom: 16px; font-size: 13.5px; }
.ps-list { display: flex; flex-direction: column; gap: 8px; }
.ps-slot { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 12px 14px; cursor: pointer; }
.ps-slot:hover { border-color: #cbb2e6; }
.ps-slot.ps-selected { border-color: #5E2F88; background: #f3ecfb; }
.ps-slot-main { font-size: 14px; font-weight: 700; color: #374151; }
.ps-slot-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
.ps-radio { width: 18px; height: 18px; accent-color: #5E2F88; flex-shrink: 0; }
.ps-empty { text-align: center; color: #6b7280; font-size: 14.5px; padding: 30px 10px; }
.ps-submit { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: 15.5px; font-weight: 700; cursor: pointer; font-family: inherit; background: #5E2F88; color: #fff; margin-top: 16px; transition: background-color .15s; }
.ps-submit:hover:not(:disabled) { background: #7B3DB0; }
.ps-submit:disabled { opacity: .5; cursor: default; }
.ps-msg { border-radius: 12px; padding: 20px 16px; font-size: 14.5px; font-weight: 600; text-align: center; }
.ps-msg.ps-bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.ps-msg.ps-good { background: #f3ecfb; border: 1px solid #cbb2e6; color: #581E83; }
.ps-qr { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; margin: 14px 0; text-align: center; }
.ps-qr img { display: block; margin: 0 auto 8px; max-width: 100%; height: auto; }
.ps-qr-note { font-size: 13px; color: #374151; font-weight: 600; }
.ps-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 14px; font-size: 14px; line-height: 1.6; }
.ps-items { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.ps-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13.5px; }
.ps-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.ps-badge-ready { background: #fef3c7; color: #92400e; }
.ps-badge-done { background: #d1fae5; color: #065f46; }
.ps-field { display: block; width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 11px 12px; font-size: 15px; margin-top: 8px; font-family: inherit; }
.ps-inline-error { color: #b91c1c; font-size: 13px; margin-top: 8px; font-weight: 600; }
.ps-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #5E2F88; border-radius: 50%; margin: 30px auto; animation: ps-spin .8s linear infinite; }
.ps-loading-block { text-align: center; padding: 24px 12px 32px; }
.ps-loading-text { color: #6b7280; font-size: 14px; line-height: 1.5; margin-top: 8px; }
@keyframes ps-spin { to { transform: rotate(360deg); } }
`;

const PS_CRITICAL_STYLE = `
@keyframes ps-spin { to { transform: rotate(360deg); } }
pickup-scheduler { display:block; direction:rtl; min-height:100vh; background:#f4f4f6; font-family:Rubik,Heebo,sans-serif; color:#1f2937; }
`;

const ERROR_MESSAGES = {
    NOT_FOUND: 'הקישור לא תקין. לקבלת קישור חדש — חזרו לשיחה עם הבוט בוואטסאפ ובקשו שוב לתאם איסוף.',
    EXPIRED: 'הקישור פג תוקף. לקבלת קישור חדש — חזרו לשיחה עם הבוט בוואטסאפ ובקשו שוב לתאם איסוף.',
    NO_ITEMS: 'לא נמצאו פריטים מוכנים לאיסוף להזמנה זו כרגע.',
    COLLECTED: 'כל הפריטים בהזמנה זו נאספו כבר 🎉',
    EXPIRED_WINDOW: 'עברו 20 ימים מאז שהפריטים הוכרזו מוכנים לאיסוף. ניתן לפנות לשירות הלקוחות.',
    QUOTA_EXCEEDED: 'נוצלו כל 3 התיאומים האפשריים להזמנה זו. ניתן לפנות לשירות הלקוחות להמשך תיאום.',
    SLOT_UNAVAILABLE: 'המועד שנבחר אינו זמין יותר. בחרו מועד אחר מהרשימה.',
    BAD_REQUEST: 'לא נבחר מועד. יש לבחור מועד מהרשימה.',
    PASS_EXPIRED: 'הקישור פג תוקף. ניתן לתאם איסוף מחדש דרך הבוט בוואטסאפ.',
    REPLACED: 'תיאום האיסוף הזה הוחלף במועד אחר, ולכן הקישור אינו פעיל.',
};

function psEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const IL_TZ = 'Asia/Jerusalem';
const HE_WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function formatSlotDate(iso) {
    const d = new Date(iso);
    const dow = HE_WEEKDAY[new Intl.DateTimeFormat('en-US', { timeZone: IL_TZ, weekday: 'short' }).format(d) === 'Sun' ? 0 : d.getDay()];
    const dateLabel = new Intl.DateTimeFormat('he-IL', { timeZone: IL_TZ, day: '2-digit', month: '2-digit' }).format(d);
    return `יום ${dow}, ${dateLabel}`;
}

function formatSlotTime(startIso, endIso) {
    const opts = { timeZone: IL_TZ, hour: '2-digit', minute: '2-digit' };
    const start = new Intl.DateTimeFormat('he-IL', opts).format(new Date(startIso));
    const end = new Intl.DateTimeFormat('he-IL', opts).format(new Date(endIso));
    return `${start}-${end}`;
}

class PickupScheduler extends HTMLElement {
    static get observedAttributes() { return ['context-data', 'submit-result']; }

    constructor() {
        super();
        this._context = null;
        this._contextError = null;
        this._bootstrapMessage = 'טוענים את עמוד תיאום האיסוף…';
        this._selectedSlotKey = null;
        this._sending = false;
        this._submitResult = null;
        this._clickBound = false;
    }

    _renderQr(qrDataUrl) {
        if (!qrDataUrl) return '';
        return `
            <div class="ps-qr">
                <img src="${psEsc(qrDataUrl)}" alt="קוד QR לאישור איסוף" width="240" height="240">
                <div class="ps-qr-note">הציגו את הקוד לעובד/ת הסטודיו בעת האיסוף. אפשר לשמור צילום מסך.</div>
            </div>`;
    }

    _ensureStyles() {
        if (!document.getElementById('ps-critical-style')) {
            const critical = document.createElement('style');
            critical.id = 'ps-critical-style';
            critical.textContent = PS_CRITICAL_STYLE;
            document.head.appendChild(critical);
        }
        if (!document.getElementById('ps-style')) {
            const style = document.createElement('style');
            style.id = 'ps-style';
            style.textContent = PS_STYLE;
            document.head.appendChild(style);
        }
    }

    _renderBootstrapPanel(message) {
        return `
            <div class="ps-wrap">
                <div class="ps-head">
                    <h1>תיאום איסוף</h1>
                    <div class="ps-sub">בחרו מועד סדנה שבו תגיעו לאסוף את ההזמנה</div>
                </div>
                <div class="ps-loading-block">
                    <div class="ps-spinner"></div>
                    <div class="ps-loading-text">${psEsc(message || this._bootstrapMessage)}</div>
                </div>
            </div>`;
    }

    connectedCallback() {
        this._ensureStyles();
        this.render();

        if (this._clickBound) return;
        this._clickBound = true;

        this.addEventListener('click', (e) => {
            if (this._sending || this._submitResult?.ok) return;

            const slotEl = e.target.closest('[data-slot-key]');
            if (slotEl) {
                this._selectedSlotKey = slotEl.dataset.slotKey;
                this.render();
                return;
            }

            const submitBtn = e.target.closest('[data-submit]');
            if (submitBtn && this._selectedSlotKey) {
                this._sending = true;
                this.render();
                this.dispatchEvent(new CustomEvent('submit-request', { detail: { slotKey: this._selectedSlotKey }, bubbles: true }));
            }
        });
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        try {
            if (name === 'context-data') {
                const data = JSON.parse(newVal);
                if (data.loading) {
                    this._context = null;
                    this._contextError = null;
                    this._bootstrapMessage = data.message || 'מאמתים את הקישור…';
                } else if (data.error) {
                    this._contextError = data;
                    this._context = null;
                } else {
                    this._context = data;
                    this._contextError = null;
                }
            }
            if (name === 'submit-result') {
                this._sending = false;
                this._submitResult = JSON.parse(newVal);
            }
        } catch (err) {
            console.error('[pickup-scheduler] bad JSON attribute:', err);
            return;
        }
        if (this.isConnected) this.render();
    }

    render() {
        if (this._contextError) {
            const message = ERROR_MESSAGES[this._contextError.code] || this._contextError.message || 'אירעה שגיאה.';
            this.innerHTML = `<div class="ps-wrap"><div class="ps-msg ps-bad">${psEsc(message)}</div></div>`;
            return;
        }

        if (this._submitResult?.ok) {
            const a = this._submitResult.appointment;
            const label = a ? `${formatSlotDate(a.start)}, ${formatSlotTime(a.start, a.end)}` : '';
            const followUp = this._submitResult.messageSent === false
                ? 'לא הצלחנו לשלוח הודעת אישור בוואטסאפ, אבל התיאום נשמר.'
                : 'שלחנו לך הודעה בוואטסאפ עם פרטי האיסוף.';
            this.innerHTML = `
                <div class="ps-wrap">
                    <div class="ps-msg ps-good">✅ תיאום האיסוף נקבע ל-${psEsc(label)} (${psEsc(a?.workshopName || 'סדנה')})!<br/><br/>${followUp}</div>
                    ${this._renderQr(this._submitResult.qrDataUrl)}
                </div>`;
            return;
        }

        if (this._submitResult && this._submitResult.ok === false) {
            const msg = ERROR_MESSAGES[this._submitResult.code] || this._submitResult.message || 'שליחת הבקשה נכשלה. נסו שוב.';
            this.innerHTML = `<div class="ps-wrap"><div class="ps-msg ps-bad">${psEsc(msg)}</div></div>`;
            return;
        }

        if (!this._context) {
            this.innerHTML = this._renderBootstrapPanel(this._bootstrapMessage);
            return;
        }

        const { slots, used, remaining, currentAppointment, qrDataUrl, canBook } = this._context;

        const currentBlock = currentAppointment ? `
            <div class="ps-current">
                📅 כבר תואם איסוף עבורך ל-${psEsc(formatSlotDate(currentAppointment.start))}, ${psEsc(formatSlotTime(currentAppointment.start, currentAppointment.end))}.
                ${canBook === false ? '' : 'ניתן לבחור מועד אחר מהרשימה למטה כדי להחליף.'}
            </div>
            ${this._renderQr(qrDataUrl)}` : '';

        if (canBook === false) {
            this.innerHTML = `
                <div class="ps-wrap">
                    <div class="ps-head"><h1>תיאום איסוף</h1></div>
                    ${currentBlock}
                    <div class="ps-quota">נוצלו ${used ?? 0} מתוך 3 תיאומים אפשריים — לשינוי מועד יש לפנות לשירות הלקוחות.</div>
                </div>`;
            return;
        }

        let listBody;
        if (!Array.isArray(slots) || !slots.length) {
            listBody = `<div class="ps-empty">לא נמצאו מועדי סדנה פעילים לאיסוף בטווח הזמן הקרוב. יש לפנות לשירות הלקוחות לתיאום ידני.</div>`;
        } else {
            listBody = `<div class="ps-list">${slots.map((slot) => {
                const isSelected = this._selectedSlotKey === slot.slotKey;
                return `
                    <label class="ps-slot ${isSelected ? 'ps-selected' : ''}" data-slot-key="${psEsc(slot.slotKey)}">
                        <span>
                            <div class="ps-slot-main">${psEsc(formatSlotDate(slot.start))} · ${psEsc(formatSlotTime(slot.start, slot.end))}</div>
                            <div class="ps-slot-sub">${psEsc(slot.workshopName || 'סדנה')}</div>
                        </span>
                        <input type="radio" class="ps-radio" name="ps-slot" ${isSelected ? 'checked' : ''} readonly>
                    </label>`;
            }).join('')}</div>`;
        }

        const canSubmit = !!this._selectedSlotKey && !this._sending;

        this.innerHTML = `
            <div class="ps-wrap">
                <div class="ps-head">
                    <h1>תיאום איסוף</h1>
                    <div class="ps-sub">בחרו מועד סדנה שבו תגיעו לאסוף את ההזמנה</div>
                </div>
                <div class="ps-quota">נוצלו ${used ?? 0} מתוך 3 תיאומים אפשריים להזמנה זו (${remaining ?? 0} נותרו)</div>
                ${currentBlock}
                ${listBody}
                <button type="button" class="ps-submit" data-submit ${canSubmit ? '' : 'disabled'}>${this._sending ? 'שולח…' : 'אישור מועד איסוף'}</button>
            </div>`;
    }
}

if (!customElements.get('pickup-scheduler')) {
    customElements.define('pickup-scheduler', PickupScheduler);
}
