/**
 * Wix Custom Element: reschedule-workshop
 * ------------------------------------
 * עמוד "עדכון מועד סדנה" — הלקוח מגיע מקישור חד-פעמי בוואטסאפ (טוקן בתוקף
 * 10 דקות), בוחר תאריך/שעה חדשים מתוך התאריכים הפנויים (נשלף ישירות מ-
 * `/_functions/availableDates`, כמו שהבוט משתמש), ונשלח בחזרה לוואטסאפ
 * לאישור סופי — לא משנה שום דבר ב-Wix Bookings בעצמו.
 *
 * התקנה בוויקס:
 * 1. עמוד "עדכון מועד סדנה" (src/pages/עדכון מועד סדנה.lndnu.js).
 * 2. Custom Element — Tag Name: reschedule-workshop, Source: קובץ זה.
 * 3. Element ID בעמוד: #rescheduleWorkshop1.
 *
 * תקשורת:
 * - קלט:  attribute `context-data` — { orderId, workshopType, currentWorkshopStart,
 *          expiresAt, subscriberId } או { error, code, message }.
 * - קלט:  attribute `submit-result` — { ok, chosenDateLabel, message }.
 * - פלט:  CustomEvent `submit-request` עם detail = { chosenDateIso }.
 */

const RW_STYLE = `
reschedule-workshop { display: block; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
reschedule-workshop * { box-sizing: border-box; }
.rw-wrap { max-width: 560px; margin: 0 auto; padding: 28px 16px 60px; }
.rw-head { text-align: center; margin-bottom: 16px; }
.rw-head h1 { margin: 0 0 4px; font-size: 19px; }
.rw-sub { color: #6b7280; font-size: 13.5px; }
.rw-timer { text-align: center; font-weight: 700; font-size: 14px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px; margin-bottom: 16px; }
.rw-timer.rw-timer-low { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
.rw-current { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 10px 14px; margin-bottom: 16px; font-size: 13.5px; }
.rw-day { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer; }
.rw-day.rw-selected { border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79,70,229,.15); }
.rw-day.rw-locked { opacity: .55; cursor: default; background: #f9fafb; }
.rw-day-label { font-weight: 700; font-size: 14.5px; display: flex; justify-content: space-between; align-items: center; }
.rw-day-lock-badge { font-size: 12px; color: #6b7280; font-weight: 500; }
.rw-times { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.rw-time-chip { border: 1px solid #c7d2fe; background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 6px 14px; font-size: 13.5px; cursor: pointer; font-family: inherit; }
.rw-time-chip.rw-selected { background: #4f46e5; color: #fff; border-color: #4f46e5; }
.rw-empty { text-align: center; color: #6b7280; font-size: 14.5px; padding: 30px 10px; }
.rw-submit { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: 15.5px; font-weight: 700; cursor: pointer; font-family: inherit; background: #4f46e5; color: #fff; margin-top: 14px; }
.rw-submit:disabled { opacity: .5; cursor: default; }
.rw-msg { border-radius: 12px; padding: 20px 16px; font-size: 14.5px; font-weight: 600; text-align: center; }
.rw-msg.rw-bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.rw-msg.rw-good { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; }
.rw-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; margin: 30px auto; animation: rw-spin .8s linear infinite; }
@keyframes rw-spin { to { transform: rotate(360deg); } }
`;

const ERROR_MESSAGES = {
    NOT_FOUND: 'הקישור לא תקין. אנא בקש/י קישור חדש דרך הוואטסאפ.',
    EXPIRED: 'הקישור פג תוקף (תקף ל-10 דקות בלבד). אנא בקש/י קישור חדש דרך הוואטסאפ.',
    BLOCKED_48H: 'הסדנה שלך מתקיימת בעוד פחות מ-48 שעות, ולכן לא ניתן לדחות אותה באופן עצמאי. אנא פני/ה לשירות הלקוחות שלנו.',
    ALREADY_USED: 'כבר נעשה שינוי מועד חד-פעמי להזמנה הזו בעבר. אנא פני/ה לשירות הלקוחות שלנו.',
    ALREADY_PENDING: 'יש כבר בקשת שינוי מועד ממתינה לטיפול הצוות שלנו.',
};

function rwEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const IL_TZ = 'Asia/Jerusalem';
const AVAILABLE_DATES_URL = 'https://www.studiohappy.art/_functions/availableDates';

/** Fallback when context lacks workshopTypeForDates (older cached responses). */
const WORKSHOP_KEY_TO_DATES_QUERY = {
    tufting: 'טאפטינג',
    candles: 'נרות',
    ceramics: 'קרמיקה',
    charms: "צ'ארמס",
    jewelry: 'תכשיטים',
};

function ilDateKey(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: IL_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get('day')}/${get('month')}/${get('year')}`;
}

/** Israel UTC offset (minutes) at a given instant — via the standard two-pass Intl trick. */
function ilOffsetMinutes(utcGuess) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: IL_TZ, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(utcGuess);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return (asUtc - utcGuess.getTime()) / 60000;
}

/** Converts an Israel wall-clock date (dd/mm/yyyy) + time (HH:mm) into a real UTC Date. */
function ilWallClockToUtc(dayLabel, timeLabel) {
    const [d, m, y] = dayLabel.split('/').map(Number);
    const [hh, mm] = timeLabel.split(':').map(Number);
    const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const offsetMin = ilOffsetMinutes(utcGuess);
    return new Date(utcGuess.getTime() - offsetMin * 60000);
}

/** Parses "23/09/2026: 10:00 | 14:00" lines from get_availableDates into { day, times[] }. */
function parseDatesText(dates) {
    return (dates || []).map((line) => {
        const [day, timesRaw] = line.split(':').length > 1
            ? [line.split(': ')[0], line.slice(line.indexOf(': ') + 2)]
            : [line, ''];
        const times = timesRaw ? timesRaw.split('|').map((t) => t.trim()).filter(Boolean) : [];
        return { day: day.trim(), times };
    }).filter((d) => d.day && d.times.length);
}

class RescheduleWorkshop extends HTMLElement {
    static get observedAttributes() { return ['context-data', 'submit-result']; }

    constructor() {
        super();
        this._context = null;
        this._contextError = null;
        this._days = [];
        this._loadingDates = false;
        this._datesLoadFailed = false;
        this._selectedDay = null;
        this._selectedTime = null;
        this._sending = false;
        this._submitResult = null;
        this._expired = false;
        this._remainingMs = null;
        this._timerHandle = null;
    }

    connectedCallback() {
        if (!document.getElementById('rw-style')) {
            const style = document.createElement('style');
            style.id = 'rw-style';
            style.textContent = RW_STYLE;
            document.head.appendChild(style);
        }
        this.render();

        this.addEventListener('click', (e) => {
            if (this._expired || this._sending || this._submitResult?.ok) return;

            const dayBtn = e.target.closest('[data-day]');
            if (dayBtn && !dayBtn.classList.contains('rw-locked')) {
                const day = dayBtn.dataset.day;
                this._selectedDay = this._selectedDay === day ? null : day;
                this._selectedTime = null;
                this.render();
                return;
            }

            const timeBtn = e.target.closest('[data-time]');
            if (timeBtn) {
                this._selectedTime = timeBtn.dataset.time;
                this.render();
                return;
            }

            const submitBtn = e.target.closest('[data-submit]');
            if (submitBtn && this._selectedDay && this._selectedTime) {
                const chosenDateIso = ilWallClockToUtc(this._selectedDay, this._selectedTime).toISOString();
                this._sending = true;
                this.render();
                this.dispatchEvent(new CustomEvent('submit-request', { detail: { chosenDateIso }, bubbles: true }));
            }
        });
    }

    disconnectedCallback() {
        if (this._timerHandle) clearInterval(this._timerHandle);
    }

    attributeChangedCallback(name, _oldVal, newVal) {
        if (!newVal) return;
        try {
            if (name === 'context-data') {
                const data = JSON.parse(newVal);
                if (data.error) {
                    this._contextError = data;
                    this._context = null;
                } else {
                    this._context = data;
                    this._contextError = null;
                    this._startTimer(data.expiresAt);
                    this._loadDates(data, data.currentWorkshopStart);
                }
            }
            if (name === 'submit-result') {
                this._sending = false;
                this._submitResult = JSON.parse(newVal);
            }
        } catch (err) {
            console.error('[reschedule-workshop] bad JSON attribute:', err);
            return;
        }
        this.render();
    }

    _startTimer(expiresAtIso) {
        if (this._timerHandle) clearInterval(this._timerHandle);
        const expiresAt = new Date(expiresAtIso).getTime();
        const tick = () => {
            this._remainingMs = expiresAt - Date.now();
            if (this._remainingMs <= 0) {
                this._remainingMs = 0;
                this._expired = true;
                clearInterval(this._timerHandle);
            }
            this.render();
        };
        tick();
        this._timerHandle = setInterval(tick, 1000);
    }

    _resolveDatesQuery(context) {
        if (!context || typeof context === 'string') {
            return WORKSHOP_KEY_TO_DATES_QUERY[context] || context || '';
        }
        if (context.workshopTypeForDates) return context.workshopTypeForDates;
        if (context.datesWorkshop) return context.datesWorkshop;
        const key = context.workshopType;
        if (key && WORKSHOP_KEY_TO_DATES_QUERY[key]) return WORKSHOP_KEY_TO_DATES_QUERY[key];
        const knownLabels = Object.values(WORKSHOP_KEY_TO_DATES_QUERY);
        if (key && knownLabels.includes(key)) return key;
        return key || '';
    }

    async _loadDates(context, currentWorkshopStartIso) {
        this._loadingDates = true;
        this._datesLoadFailed = false;
        this.render();

        const datesQuery = this._resolveDatesQuery(context);
        if (!datesQuery) {
            console.error('[reschedule-workshop] missing workshopTypeForDates', context?.workshopType, context?.orderId);
            this._loadingDates = false;
            this._datesLoadFailed = true;
            this.render();
            return;
        }

        const currentDayKey = currentWorkshopStartIso ? ilDateKey(new Date(currentWorkshopStartIso)) : null;
        const byDay = new Map();

        try {
            let offset = 0;
            let hasMore = true;
            let pagesLoaded = 0;
            while (hasMore && pagesLoaded < 6) {
                const res = await fetch(`${AVAILABLE_DATES_URL}?workshopType=${encodeURIComponent(datesQuery)}&offset=${offset}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                for (const parsed of parseDatesText(json.dates)) {
                    byDay.set(parsed.day, parsed.times);
                }
                hasMore = !!json.hasMore;
                offset = json.nextOffset ?? offset + 10;
                pagesLoaded += 1;
            }
        } catch (err) {
            console.error('[reschedule-workshop] _loadDates failed:', err?.message || err);
            this._datesLoadFailed = true;
        }

        if (currentDayKey && !byDay.has(currentDayKey)) {
            byDay.set(currentDayKey, []); // shown as a locked placeholder for orientation
        }

        this._days = [...byDay.entries()]
            .map(([day, times]) => ({ day, times, isCurrent: day === currentDayKey }))
            .sort((a, b) => {
                const [ad, am, ay] = a.day.split('/').map(Number);
                const [bd, bm, by] = b.day.split('/').map(Number);
                return new Date(ay, am - 1, ad) - new Date(by, bm - 1, bd);
            });

        this._loadingDates = false;
        this.render();
    }

    _renderTimer() {
        if (this._remainingMs == null) return '';
        const totalSec = Math.max(0, Math.ceil(this._remainingMs / 1000));
        const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
        const ss = String(totalSec % 60).padStart(2, '0');
        const low = totalSec <= 60;
        return `<div class="rw-timer ${low ? 'rw-timer-low' : ''}">⏱️ הקישור בתוקף עוד ${mm}:${ss}</div>`;
    }

    _renderDay(entry) {
        const isSelected = this._selectedDay === entry.day;
        const locked = entry.isCurrent && !entry.times.length;
        return `
            <div class="rw-day ${isSelected ? 'rw-selected' : ''} ${locked ? 'rw-locked' : ''}" data-day="${rwEsc(entry.day)}">
                <div class="rw-day-label">
                    <span>${rwEsc(entry.day)}${entry.isCurrent ? ' (המועד הנוכחי שלך)' : ''}</span>
                    ${locked ? '<span class="rw-day-lock-badge">🔒 לא ניתן לבחירה</span> ' : ''}
                </div>
                ${isSelected && entry.times.length ? `
                    <div class="rw-times">
                        ${entry.times.map((t) => `<button type="button" class="rw-time-chip ${this._selectedTime === t ? 'rw-selected' : ''}" data-time="${rwEsc(t)}">${rwEsc(t)}</button>`).join('')}
                    </div>` : ''}
            </div>`;
    }

    render() {
        if (this._contextError) {
            const message = ERROR_MESSAGES[this._contextError.code] || this._contextError.message || 'אירעה שגיאה.';
            this.innerHTML = `<div class="rw-wrap"><div class="rw-msg rw-bad">${rwEsc(message)}</div></div>`;
            return;
        }

        if (this._submitResult?.ok) {
            this.innerHTML = `
                <div class="rw-wrap">
                    <div class="rw-msg rw-good">✅ הבקשה לשינוי מועד ל-${rwEsc(this._submitResult.chosenDateLabel || '')} נשלחה בהצלחה!<br/><br/>חזרי לוואטסאפ ולחצי על "אישור סופי" כדי לסיים את התהליך 💬</div>
                </div>`;
            return;
        }

        if (this._submitResult && this._submitResult.ok === false) {
            this.innerHTML = `<div class="rw-wrap"><div class="rw-msg rw-bad">${rwEsc(this._submitResult.message || 'שליחת הבקשה נכשלה. נסו שוב.')}</div></div>`;
            return;
        }

        if (this._expired) {
            this.innerHTML = `<div class="rw-wrap"><div class="rw-msg rw-bad">${rwEsc(ERROR_MESSAGES.EXPIRED)}</div></div>`;
            return;
        }

        if (!this._context) {
            this.innerHTML = `<div class="rw-wrap"><div class="rw-spinner"></div><div class="rw-sub" style="text-align:center;">טוען...</div></div>`;
            return;
        }

        const currentLabel = this._context.currentWorkshopStart
            ? new Intl.DateTimeFormat('he-IL', { timeZone: IL_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(this._context.currentWorkshopStart))
            : null;

        let daysBody;
        if (this._loadingDates) {
            daysBody = `<div class="rw-spinner"></div><div class="rw-sub" style="text-align:center;">טוען תאריכים פנויים…</div>`;
        } else if (this._datesLoadFailed) {
            daysBody = `<div class="rw-empty">לא הצלחנו לטעון תאריכים פנויים כרגע. נסו לרענן את הדף.</div>`;
        } else if (!this._days.length) {
            daysBody = `<div class="rw-empty">לא נמצאו תאריכים פנויים כרגע.</div>`;
        } else {
            daysBody = this._days.map((d) => this._renderDay(d)).join('');
        }

        const canSubmit = !!(this._selectedDay && this._selectedTime) && !this._sending;

        this.innerHTML = `
            <div class="rw-wrap">
                <div class="rw-head">
                    <h1>עדכון מועד סדנה</h1>
                    <div class="rw-sub">בחרי תאריך ושעה חדשים לסדנה שלך</div>
                </div>
                ${this._renderTimer()}
                ${currentLabel ? `<div class="rw-current">📅 המועד הנוכחי שלך: <strong>${rwEsc(currentLabel)}</strong></div>` : ''}
                ${daysBody}
                <button type="button" class="rw-submit" data-submit ${canSubmit ? '' : 'disabled'}>${this._sending ? 'שולח…' : 'אישור בחירת מועד'}</button>
            </div>`;
    }
}

if (!customElements.get('reschedule-workshop')) {
    customElements.define('reschedule-workshop', RescheduleWorkshop);
}
