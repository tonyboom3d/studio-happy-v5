/**
 * Availability submission rules (Module A) — pure functions, no I/O.
 *
 * All thresholds come from the AvailabilitySettings CMS row and per-employee
 * overrides on Dashboard_Roles, so the client can tune rules without code
 * changes. Dates are handled as 'YYYY-MM-DD' strings in Israel local time to
 * avoid timezone drift between server (UTC) and studio (Asia/Jerusalem).
 */

const ISRAEL_TZ = 'Asia/Jerusalem';

export const SUBMISSION_STATUS = {
    SUBMITTED: 'SUBMITTED',
    STANDBY: 'STANDBY',
    SCHEDULED: 'SCHEDULED',
    REJECTED: 'REJECTED',
};

export const DEFAULT_SETTINGS = {
    deadlineDaysBeforeMonthEnd: 4,
    monthsAheadAllowed: 1,
    defaultMinShiftsPerMonth: 3,
    defaultMinShiftHours: 4,
    defaultShiftStart: '10:00',
    defaultShiftEnd: '16:00',
    blockedDates: [],
    fullDates: [],
    promotedDates: [],
    holidayDates: [],
    bonusUnlockEnabled: true,
    autoApproveShifts: true,
};

/** Normalizes a raw AvailabilitySettings CMS row (JSON strings → arrays). */
export function normalizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS };
    if (!raw) return s;

    const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
    s.deadlineDaysBeforeMonthEnd = num(raw.deadlineDaysBeforeMonthEnd, s.deadlineDaysBeforeMonthEnd);
    s.monthsAheadAllowed = Math.max(1, num(raw.monthsAheadAllowed, s.monthsAheadAllowed));
    s.defaultMinShiftsPerMonth = num(raw.defaultMinShiftsPerMonth, s.defaultMinShiftsPerMonth);
    s.defaultMinShiftHours = num(raw.defaultMinShiftHours, s.defaultMinShiftHours);
    if (typeof raw.defaultShiftStart === 'string' && raw.defaultShiftStart.trim()) s.defaultShiftStart = raw.defaultShiftStart.trim();
    if (typeof raw.defaultShiftEnd === 'string' && raw.defaultShiftEnd.trim()) s.defaultShiftEnd = raw.defaultShiftEnd.trim();
    if (raw.bonusUnlockEnabled !== undefined && raw.bonusUnlockEnabled !== null) s.bonusUnlockEnabled = !!raw.bonusUnlockEnabled;
    if (raw.autoApproveShifts !== undefined && raw.autoApproveShifts !== null) s.autoApproveShifts = !!raw.autoApproveShifts;

    for (const key of ['blockedDates', 'fullDates', 'promotedDates', 'holidayDates']) {
        const v = raw[key];
        if (Array.isArray(v)) { s[key] = v.filter(Boolean); continue; }
        if (typeof v === 'string' && v.trim()) {
            try {
                const parsed = JSON.parse(v);
                if (Array.isArray(parsed)) s[key] = parsed.filter(Boolean);
            } catch (_) { /* keep default */ }
        }
    }
    return s;
}

/** 'YYYY-MM-DD' for a Date, in Israel local time. */
export function toDateKey(dateInput) {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
    return parts; // en-CA formats as YYYY-MM-DD
}

/** 'YYYY-MM' month key from a date key or Date. */
export function toMonthKey(dateInput) {
    const key = typeof dateInput === 'string' && /^\d{4}-\d{2}/.test(dateInput)
        ? dateInput
        : toDateKey(dateInput);
    return key ? key.slice(0, 7) : null;
}

function addMonths(monthKey, n) {
    const [y, m] = monthKey.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * Month keys currently open for submission: next month plus
 * (monthsAheadAllowed - 1) further months. The current month itself is open
 * too (bonus/late submissions for remaining days are validated separately).
 */
export function getOpenMonthKeys(settings, now = new Date()) {
    const current = toMonthKey(now);
    const keys = [current];
    for (let i = 1; i <= settings.monthsAheadAllowed; i++) {
        keys.push(addMonths(current, i));
    }
    return keys;
}

/**
 * Deadline for submitting availability for `monthKey`: N days before the end
 * of the preceding month, at 23:59:59 Israel time.
 * Example: monthKey 2026-08, N=4 → deadline 2026-07-27 23:59:59.
 */
export function computeSubmissionDeadline(monthKey, settings) {
    const [y, m] = monthKey.split('-').map(Number);
    // Day 0 of monthKey = last day of the preceding month (UTC arithmetic on a
    // date-only value; the deadline is then anchored to Israel end-of-day).
    const lastDayPrevMonth = new Date(Date.UTC(y, m - 1, 0));
    const deadlineDay = new Date(lastDayPrevMonth.getTime() - (settings.deadlineDaysBeforeMonthEnd * 24 * 60 * 60 * 1000));
    const dayKey = deadlineDay.toISOString().slice(0, 10);
    // Israel is UTC+2/+3; using +02:00 makes the deadline at worst 1h earlier
    // in summer — acceptable (never later than the intended local deadline).
    return new Date(`${dayKey}T23:59:59+02:00`);
}

/** True while the deadline for `monthKey` has not passed. */
export function isSubmissionOpenForMonth(monthKey, settings, now = new Date()) {
    const currentMonth = toMonthKey(now);
    if (monthKey <= currentMonth) return false; // current/past months: deadline passed by definition
    return now.getTime() <= computeSubmissionDeadline(monthKey, settings).getTime();
}

/** Shift length in hours from 'HH:mm' strings; null when invalid/negative. */
export function shiftHours(startTime, endTime) {
    const parse = (t) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
        if (!m) return null;
        const h = Number(m[1]), min = Number(m[2]);
        if (h > 23 || min > 59) return null;
        return h * 60 + min;
    };
    const start = parse(startTime);
    const end = parse(endTime);
    if (start === null || end === null || end <= start) return null;
    return Math.round(((end - start) / 60) * 100) / 100;
}

export function getMinShiftHours(profile, settings) {
    const v = Number(profile?.minShiftHours);
    return Number.isFinite(v) && v > 0 ? v : settings.defaultMinShiftHours;
}

export function getRequiredShifts(profile, settings) {
    const v = Number(profile?.minShiftsPerMonth);
    return Number.isFinite(v) && v > 0 ? v : settings.defaultMinShiftsPerMonth;
}

/**
 * Quota status for one month.
 * `submissions` = this employee's non-rejected rows for that month.
 */
export function evaluateQuota(profile, settings, submissions) {
    const required = getRequiredShifts(profile, settings);
    const submitted = (submissions || []).filter(s => s.status !== SUBMISSION_STATUS.REJECTED).length;
    return {
        required,
        submitted,
        met: submitted >= required,
        bonusUnlocked: settings.bonusUnlockEnabled && submitted >= required,
    };
}

/**
 * Validates a batch of new shifts. Pure — caller supplies existing rows.
 *
 * @param {Array<{date: string, startTime: string, endTime: string}>} shifts   new shifts ('YYYY-MM-DD')
 * @param {object} profile        Dashboard_Roles row (scheduling profile fields)
 * @param {object} settings       normalized settings
 * @param {Array}  existing       employee's existing non-rejected submissions (all open months)
 * @param {object} [opts]         { managerOverride?: boolean, now?: Date }
 * @returns {{ ok: boolean, errors: Array<{date: string|null, code: string, message: string}> }}
 */
export function validateSubmission(shifts, profile, settings, existing, opts = {}) {
    const now = opts.now || new Date();
    const managerOverride = !!opts.managerOverride;
    const errors = [];

    if (!Array.isArray(shifts) || !shifts.length) {
        return { ok: false, errors: [{ date: null, code: 'EMPTY', message: 'לא נבחרו משמרות להגשה.' }] };
    }

    const openMonths = getOpenMonthKeys(settings, now);
    const minHours = getMinShiftHours(profile, settings);
    const todayKey = toDateKey(now);
    const existingDates = new Set((existing || [])
        .filter(s => s.status !== SUBMISSION_STATUS.REJECTED)
        .map(s => s.dateKey || toDateKey(s.date)));

    // Quota per target month must account for shifts already submitted plus
    // the new batch, so bonus/full-day gating is evaluated against the final state.
    const existingByMonth = {};
    for (const s of (existing || [])) {
        if (s.status === SUBMISSION_STATUS.REJECTED) continue;
        const mk = s.monthKey || toMonthKey(s.date);
        existingByMonth[mk] = (existingByMonth[mk] || 0) + 1;
    }

    const seenInBatch = new Set();

    for (const shift of shifts) {
        const dateKey = String(shift.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            errors.push({ date: dateKey || null, code: 'BAD_DATE', message: 'תאריך לא תקין.' });
            continue;
        }
        const monthKey = dateKey.slice(0, 7);

        if (seenInBatch.has(dateKey)) {
            errors.push({ date: dateKey, code: 'DUPLICATE', message: `תאריך ${dateKey} נבחר פעמיים.` });
            continue;
        }
        seenInBatch.add(dateKey);

        if (existingDates.has(dateKey)) {
            errors.push({ date: dateKey, code: 'ALREADY_SUBMITTED', message: `כבר הוגשה זמינות לתאריך ${dateKey}.` });
            continue;
        }

        if (dateKey <= todayKey) {
            errors.push({ date: dateKey, code: 'PAST_DATE', message: 'לא ניתן להגיש זמינות לתאריך שעבר.' });
            continue;
        }

        if (!openMonths.includes(monthKey)) {
            errors.push({ date: dateKey, code: 'MONTH_CLOSED', message: `חודש ${monthKey} אינו פתוח להגשה.` });
            continue;
        }

        const hours = shiftHours(shift.startTime, shift.endTime);
        if (hours === null) {
            errors.push({ date: dateKey, code: 'BAD_TIME', message: `שעות משמרת לא תקינות בתאריך ${dateKey}.` });
            continue;
        }
        if (!managerOverride && hours < minHours) {
            errors.push({
                date: dateKey, code: 'SHIFT_TOO_SHORT',
                message: `משמרת בתאריך ${dateKey} קצרה מהמינימום (${minHours} שעות).`,
            });
            continue;
        }

        if (managerOverride) continue; // manager bypasses date-level gates below

        if (settings.blockedDates.includes(dateKey)) {
            errors.push({ date: dateKey, code: 'DATE_BLOCKED', message: `תאריך ${dateKey} חסום להגשה.` });
            continue;
        }

        // Future months (not current): deadline gate.
        const currentMonth = toMonthKey(now);
        if (monthKey > currentMonth && !isSubmissionOpenForMonth(monthKey, settings, now)) {
            errors.push({ date: dateKey, code: 'DEADLINE_PASSED', message: `חלף המועד האחרון להגשת זמינות לחודש ${monthKey}.` });
            continue;
        }

        // Current-month additions are a bonus perk: allowed only once the
        // employee met the quota for that month (incentivization rule).
        const quotaBefore = evaluateQuota(profile, settings, new Array(existingByMonth[monthKey] || 0).fill({ status: SUBMISSION_STATUS.SUBMITTED }));
        if (monthKey === currentMonth && !quotaBefore.bonusUnlocked) {
            errors.push({ date: dateKey, code: 'BONUS_LOCKED', message: 'הגשת משמרות נוספות לחודש הנוכחי נפתחת רק לאחר עמידה במכסה החודשית.' });
            continue;
        }

        // "Full" days: open only to employees who met their quota.
        if (settings.fullDates.includes(dateKey) && !quotaBefore.bonusUnlocked) {
            errors.push({ date: dateKey, code: 'DAY_FULL', message: `תאריך ${dateKey} מאויש — פתוח רק לעובדים שהשלימו את המכסה.` });
            continue;
        }
    }

    return { ok: errors.length === 0, errors };
}
