/**
 * Wix Custom Element: reschedule-workshop
 * ------------------------------------
 * עמוד "עדכון מועד סדנה" — הלקוח מגיע מקישור חד-פעמי בוואטסאפ (טוקן בתוקף
 * 10 דקות), בוחר תאריך/שעה חדשים מתוך התאריכים הפנויים (מועברים מעמוד ה-Velo
 * דרך `available-slots`), ונשלח בחזרה לוואטסאפ
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
 * - קלט:  attribute `available-slots` — מערך slots מ-getCourseSessions.
 * - קלט:  attribute `submit-result` — { ok, chosenDateLabel, message }.
 * - פלט:  CustomEvent `submit-request` עם detail = { chosenDateIso }.
 */

const RW_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap');
reschedule-workshop { display: block; direction: rtl; font-family: 'Rubik', 'Heebo', 'Segoe UI', Arial, sans-serif; background: #f4f4f6; min-height: 100vh; color: #1f2937; }
reschedule-workshop * { box-sizing: border-box; font-family: inherit; }
.rw-wrap { max-width: 560px; margin: 0 auto; padding: 28px 16px 60px; }
.rw-head { text-align: center; margin-bottom: 16px; }
.rw-head h1 { margin: 0 0 4px; font-size: 19px; color: #581E83; }
.rw-sub { color: #6b7280; font-size: 13.5px; }
.rw-timer { text-align: center; font-weight: 700; font-size: 14px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px; margin-bottom: 16px; }
.rw-timer.rw-timer-low { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
.rw-current { background: #f3ecfb; border: 1px solid #d9c3ee; border-radius: 12px; padding: 10px 14px; margin-bottom: 16px; font-size: 13.5px; color: #581E83; }
.rw-restriction-note { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 10px; padding: 8px 12px; margin-bottom: 14px; font-size: 12.5px; text-align: center; }
.rw-cal-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; margin-bottom: 10px; }
.rw-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.rw-cal-nav-btn { border: none; background: transparent; cursor: pointer; font-size: 16px; color: #5E2F88; padding: 4px 10px; border-radius: 8px; font-family: inherit; line-height: 1; }
.rw-cal-nav-btn:hover:not(:disabled) { background: rgba(94,47,136,.1); }
.rw-cal-nav-btn:disabled { color: #d1d5db; cursor: default; }
.rw-cal-month-title { text-align: center; font-weight: 700; font-size: 14px; color: #581E83; margin-bottom: 8px; }
.rw-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
.rw-cal-wd { text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; padding: 2px 0; }
.rw-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.rw-cal-cell { height: 40px; border-radius: 9px; border: 1px solid transparent; background: transparent; font-size: 13.5px; font-family: inherit; color: #d1d5db; padding: 0; }
.rw-cal-empty { visibility: hidden; }
.rw-cal-bookable { border-color: #cbb2e6; background: #f3ecfb; color: #581E83; font-weight: 700; cursor: pointer; }
.rw-cal-bookable:hover { background: #e6d7f5; }
.rw-cal-current { position: relative; }
.rw-cal-current::after { content: ''; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; }
.rw-cal-selected { background: #5E2F88 !important; color: #fff !important; border-color: #5E2F88 !important; }
.rw-cal-selected.rw-cal-current::after { background: #fff; }
.rw-times-panel { margin-top: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
.rw-times-panel-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 8px; }
.rw-times { display: flex; flex-wrap: wrap; gap: 8px; }
.rw-time-chip { border: 1px solid #cbb2e6; background: #f3ecfb; color: #581E83; border-radius: 999px; padding: 6px 14px; font-size: 13.5px; cursor: pointer; font-family: inherit; }
.rw-time-chip.rw-selected { background: #5E2F88; color: #fff; border-color: #5E2F88; }
.rw-empty { text-align: center; color: #6b7280; font-size: 14.5px; padding: 30px 10px; }
.rw-submit { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: 15.5px; font-weight: 700; cursor: pointer; font-family: inherit; background: #5E2F88; color: #fff; margin-top: 14px; transition: background-color .15s; }
.rw-submit:hover:not(:disabled) { background: #7B3DB0; }
.rw-submit:disabled { opacity: .5; cursor: default; }
.rw-msg { border-radius: 12px; padding: 20px 16px; font-size: 14.5px; font-weight: 600; text-align: center; }
.rw-msg.rw-bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.rw-msg.rw-good { background: #f3ecfb; border: 1px solid #cbb2e6; color: #581E83; }
.rw-spinner { width: 34px; height: 34px; border: 3px solid #e5e7eb; border-top-color: #5E2F88; border-radius: 50%; margin: 30px auto; animation: rw-spin .8s linear infinite; }
@keyframes rw-spin { to { transform: rotate(360deg); } }
`;

const ERROR_MESSAGES = {
    NOT_FOUND: 'הקישור לא תקין או שכבר נוצל. לקבלת קישור חדש — חזרו לשיחה עם הבוט בוואטסאפ ובקשו שוב לשינוי מועד.',
    EXPIRED: 'הקישור פג תוקף (תקף ל-10 דקות בלבד). לקבלת קישור חדש — חזרו לשיחה עם הבוט בוואטסאפ ובקשו שוב לשינוי מועד.',
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

/** Pulls date lines from get_availableDates JSON (array, datesText, or ManyChat v2 content). */
function extractDatesLines(json) {
    if (Array.isArray(json?.dates) && json.dates.length) return json.dates;
    const text = json?.datesText || json?.content?.messages?.[0]?.text || '';
    if (!text || typeof text !== 'string') return [];
    if (text.includes('לא נמצאו') || text.includes('לא תקין')) return [];
    return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function readUrlQueryParam(name) {
    try {
        return new URLSearchParams(window.location.search).get(name);
    } catch (_) {
        return null;
    }
}

const HE_WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // Sun..Sat
const HE_MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** JS day-of-week (0=Sun..6=Sat) for a "dd/mm/yyyy" label — day itself is already the Israel calendar date. */
function dayOfWeekFromLabel(dayLabel) {
    const [d, m, y] = dayLabel.split('/').map(Number);
    return new Date(y, m - 1, d).getDay();
}

/** Parses "23/09/2026: 10:00 | 14:00" lines from get_availableDates into { day, times[] }. */
function parseDatesText(lines) {
    return (lines || []).map((line) => {
        const sep = line.indexOf(': ');
        if (sep === -1) return { day: line.trim(), times: [] };
        const day = line.slice(0, sep).trim();
        const timesRaw = line.slice(sep + 2);
        const times = timesRaw ? timesRaw.split('|').map((t) => t.trim()).filter(Boolean) : [];
        return { day, times };
    }).filter((d) => d.day && d.times.length);
}

class RescheduleWorkshop extends HTMLElement {
    static get observedAttributes() { return ['context-data', 'available-slots', 'submit-result']; }

    constructor() {
        super();
        this._context = null;
        this._contextError = null;
        this._availableSlots = null;
        this._days = [];
        this._originIsSaturday = false;
        this._calendarMonthIndex = 0;
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

            const navBtn = e.target.closest('[data-cal-nav]');
            if (navBtn && !navBtn.disabled) {
                const dir = navBtn.dataset.calNav === 'next' ? 1 : -1;
                this._calendarMonthIndex += dir;
                this.render();
                return;
            }

            const dayBtn = e.target.closest('[data-day]');
            if (dayBtn && !dayBtn.disabled) {
                const day = dayBtn.dataset.day;
                if (this._selectedDay === day) {
                    this._selectedDay = null;
                    this._selectedTime = null;
                } else {
                    this._selectedDay = day;
                    const entry = this._days.find((d) => d.day === day);
                    // Single time slot for the day — pick it automatically, no extra tap needed.
                    this._selectedTime = entry?.times?.length === 1 ? entry.times[0] : null;
                }
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
            if (name === 'available-slots') {
                const slots = JSON.parse(newVal);
                this._availableSlots = Array.isArray(slots) ? slots : [];
                if (this._context) this._loadDates(this._context, this._context.currentWorkshopStart);
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
        const fromUrl = readUrlQueryParam('datesWorkshop');
        if (fromUrl) return fromUrl;
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

    async _fetchAvailableDatesPage(datesQuery, offset) {
        const q = `workshopType=${encodeURIComponent(datesQuery)}&offset=${offset}`;
        const urls = [
            `${AVAILABLE_DATES_URL}?${q}`,
            `${window.location.origin}/_functions/availableDates?${q}`,
        ];
        let lastErr = null;
        for (const url of urls) {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr || new Error('fetch failed');
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
        // Reschedule day-type policy: a Saturday booking may move to ANY day of the week;
        // a weekday (Sun-Thu) or Friday booking may only move within Sun-Thu (no upgrade to Fri/Sat).
        this._originIsSaturday = currentDayKey ? dayOfWeekFromLabel(currentDayKey) === 6 : false;
        const byDay = new Map();

        // Backend re-scans availability from scratch on every page (cost grows with offset),
        // so cap pages tightly and render after EACH page — first page (~2-4s) already gives
        // the customer plenty of choice instead of blocking on a slow multi-page fetch chain.
        const MAX_PAGES = 3;
        const applyDays = () => {
            this._days = [...byDay.entries()]
                .map(([day, times]) => ({ day, times, isCurrent: day === currentDayKey }))
                .filter((entry) => {
                    if (!entry.times.length) return false;
                    if (this._originIsSaturday) return true;
                    const dow = dayOfWeekFromLabel(entry.day);
                    return dow >= 0 && dow <= 4; // Sun-Thu only
                })
                .sort((a, b) => {
                    const [ad, am, ay] = a.day.split('/').map(Number);
                    const [bd, bm, by] = b.day.split('/').map(Number);
                    return new Date(ay, am - 1, ad) - new Date(by, bm - 1, bd);
                });
        };

        if (Array.isArray(this._availableSlots)) {
            for (const slot of this._availableSlots) {
                const timestamp = slot?.start?.timestamp;
                if (!timestamp) continue;
                const start = new Date(timestamp);
                if (Number.isNaN(start.getTime())) continue;
                const day = ilDateKey(start);
                if (!byDay.has(day)) byDay.set(day, []);
                const time = new Intl.DateTimeFormat('en-GB', {
                    timeZone: IL_TZ,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                }).format(start);
                if (!byDay.get(day).includes(time)) byDay.get(day).push(time);
            }
            applyDays();
            this._loadingDates = false;
            this.render();
            return;
        }

        try {
            let offset = 0;
            let hasMore = true;
            let pagesLoaded = 0;
            while (hasMore && pagesLoaded < MAX_PAGES) {
                const json = await this._fetchAvailableDatesPage(datesQuery, offset);
                const lines = extractDatesLines(json);
                for (const parsed of parseDatesText(lines)) {
                    byDay.set(parsed.day, parsed.times);
                }
                hasMore = !!json.hasMore;
                offset = json.nextOffset ?? offset + 10;
                pagesLoaded += 1;

                // Render as soon as the first page lands so the customer isn't stuck on a spinner.
                applyDays();
                this._loadingDates = false;
                this.render();
            }
            if (!byDay.size) {
                console.warn('[reschedule-workshop] availableDates returned no bookable days. query:', datesQuery);
            }
        } catch (err) {
            console.error('[reschedule-workshop] _loadDates failed:', err?.message || err);
            if (!byDay.size) this._datesLoadFailed = true; // keep already-rendered days on later-page failures
        }

        applyDays();
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

    /** Groups this._days into per-month buckets, keyed by { year, month, byDate: Map<dayNum, entry> }. */
    _groupDaysByMonth() {
        const map = new Map();
        for (const entry of this._days) {
            const [d, m, y] = entry.day.split('/').map(Number);
            const key = `${y}-${m}`;
            if (!map.has(key)) map.set(key, { year: y, month: m, byDate: new Map() });
            map.get(key).byDate.set(d, entry);
        }
        return [...map.values()].sort((a, b) => (a.year - b.year) || (a.month - b.month));
    }

    _renderMonthCalendar({ year, month, byDate }, { canPrev, canNext } = {}) {
        const firstOfMonth = new Date(year, month - 1, 1);
        const startDow = firstOfMonth.getDay(); // 0=Sun
        const daysInMonth = new Date(year, month, 0).getDate();

        const cells = [];
        for (let i = 0; i < startDow; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);

        const cellsHtml = cells.map((d) => {
            if (d == null) return `<div class="rw-cal-cell rw-cal-empty"></div>`;
            const label = `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
            const entry = byDate.get(d);
            const isSelected = this._selectedDay === label;
            const classes = ['rw-cal-cell'];
            if (entry) classes.push('rw-cal-bookable');
            if (entry?.isCurrent) classes.push('rw-cal-current');
            if (isSelected) classes.push('rw-cal-selected');
            const attrs = entry ? `data-day="${rwEsc(label)}"` : 'disabled';
            return `<button type="button" class="${classes.join(' ')}" ${attrs}>${d}</button>`;
        }).join('');

        return `
            <div class="rw-cal-card">
                <div class="rw-cal-nav">
                    <button type="button" class="rw-cal-nav-btn" data-cal-nav="prev" ${canPrev ? '' : 'disabled'}>›</button>
                    <div class="rw-cal-month-title">${HE_MONTH_NAMES[month - 1]} ${year}</div>
                    <button type="button" class="rw-cal-nav-btn" data-cal-nav="next" ${canNext ? '' : 'disabled'}>‹</button>
                </div>
                <div class="rw-cal-weekdays">${HE_WEEKDAY_LETTERS.map((l) => `<div class="rw-cal-wd">${l}</div>`).join('')}</div>
                <div class="rw-cal-grid">${cellsHtml}</div>
            </div>`;
    }

    _renderCalendar() {
        const months = this._groupDaysByMonth();
        if (this._calendarMonthIndex < 0) this._calendarMonthIndex = 0;
        if (this._calendarMonthIndex > months.length - 1) this._calendarMonthIndex = months.length - 1;

        const current = months[this._calendarMonthIndex];
        const calendarHtml = current ? this._renderMonthCalendar(current, {
            canPrev: this._calendarMonthIndex > 0,
            canNext: this._calendarMonthIndex < months.length - 1,
        }) : '';

        const selectedEntry = this._days.find((d) => d.day === this._selectedDay);
        const timesPanel = selectedEntry ? `
            <div class="rw-times-panel">
                <div class="rw-times-panel-title">בחרי שעה ל-${rwEsc(selectedEntry.day)}:</div>
                <div class="rw-times">
                    ${selectedEntry.times.map((t) => `<button type="button" class="rw-time-chip ${this._selectedTime === t ? 'rw-selected' : ''}" data-time="${rwEsc(t)}">${rwEsc(t)}</button>`).join('')}
                </div>
            </div>` : '';

        return calendarHtml + timesPanel;
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
            const submitMsg = ERROR_MESSAGES[this._submitResult.code] || this._submitResult.message || 'שליחת הבקשה נכשלה. נסו שוב.';
            this.innerHTML = `<div class="rw-wrap"><div class="rw-msg rw-bad">${rwEsc(submitMsg)}</div></div>`;
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
        if (this._loadingDates && !this._days.length) {
            daysBody = `<div class="rw-spinner"></div><div class="rw-sub" style="text-align:center;">טוען תאריכים פנויים…</div>`;
        } else if (this._datesLoadFailed) {
            daysBody = `<div class="rw-empty">לא הצלחנו לטעון תאריכים פנויים כרגע. נסו לרענן את הדף.</div>`;
        } else if (!this._days.length) {
            daysBody = `<div class="rw-empty">לא נמצאו תאריכים פנויים לבחירה כרגע. נסו לרענן את הדף, או פנו לשירות הלקוחות.</div>`;
        } else {
            const restrictionNote = this._originIsSaturday
                ? '📅 ניתן לבחור כל יום בשבוע למועד החדש.'
                : '📅 ניתן לבחור מועד חדש בין ימי א׳-ה׳ בלבד (בהתאם למועד המקורי).';
            daysBody = `<div class="rw-restriction-note">${restrictionNote}</div>${this._renderCalendar()}`;
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
