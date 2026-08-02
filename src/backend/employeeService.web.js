/**
 * Employee Portal backend (Module A) — availability submission + personal board.
 *
 * Access model: logged-in Wix member matched to a Dashboard_Roles row (via
 * backend/staffRoles.js) with the `submitAvailability` permission. Scheduling
 * profile fields (displayName, minShifts, rates, …) live on the same
 * Dashboard_Roles row — no separate Employee_Profiles collection.
 *
 * SECURITY: rate fields (rateStudio/rateInstruction/rateWool) and hidden
 * priorityRank are NEVER included in any payload returned to employees.
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import {
    assertEmployeeAccess,
    buildPermissionsFromRole,
    extractMemberName,
    extractMemberEmail,
    refId,
    ROLE_TYPE_LABELS,
} from 'backend/staffRoles.js';
import {
    SUBMISSION_STATUS,
    toDateKey,
    toMonthKey,
    getOpenMonthKeys,
    computeSubmissionDeadline,
    isSubmissionOpenForMonth,
    shiftHours,
    getMinShiftHours,
    getRequiredShifts,
    evaluateQuota,
    validateSubmission,
} from 'backend/availabilityRules.js';
import {
    buildBoard,
    personalDayState,
    resolvePlacement,
    publishSchedulingUpdate,
    loadSettings as loadEngineSettings,
    runScheduling,
    OFFER_KIND,
    OFFER_STATUS,
} from 'backend/schedulingEngine.js';
import { getRoleSkillWorkshopIds } from 'backend/staffRoles.js';
import { loadMyChangeRequests } from 'backend/shiftChangeRequests.js';

const SA = { suppressAuth: true };
// Business hours enforced across the portal's shift time pickers.
const SHIFT_MIN_TIME = '07:00';
const SHIFT_MAX_TIME = '23:59';

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

// Settings load (incl. holidays) is shared with the engine.
const loadSettings = loadEngineSettings;

/**
 * Ensures scheduling profile fields exist on the Dashboard_Roles row.
 * New staff are seeded in events.js; this patches legacy rows on first login.
 */
async function ensureRoleProfile(role, member) {
    const staffId = refId(role.connectedStaff);
    const needsName = !role.displayName;
    const needsActive = role.active === undefined || role.active === null;

    if (!needsName && !needsActive) return role;

    const patch = { ...role };
    if (needsActive) patch.active = true;
    if (needsName) {
        let displayName = extractMemberName(member, extractMemberEmail(member));
        if (!displayName && staffId) {
            try {
                const staff = await wixData.get('Bookings/Staff', staffId, SA);
                if (staff?.name) displayName = staff.name;
            } catch (_) { /* keep fallback */ }
        }
        patch.displayName = displayName || 'עובד/ת';
    }

    const updated = await wixData.update('Dashboard_Roles', patch, SA);
    console.log(`[employeeService] Dashboard_Roles: patched profile fields for role ${role._id}`);
    return updated;
}

/** Employee's non-rejected submissions from the start of the current month onward. */
async function loadMySubmissions(roleId, now = new Date()) {
    const currentMonth = toMonthKey(now);
    const fromDate = new Date(`${currentMonth}-01T00:00:00Z`);
    const result = await wixData.query('AvailabilitySubmissions')
        .eq('employeeId', roleId)
        .ge('date', fromDate)
        .ascending('date')
        .limit(1000)
        .find(SA)
        .catch(() => ({ items: [] }));
    return result.items || [];
}

function mapSubmission(item) {
    return {
        id: item._id,
        date: toDateKey(item.date),
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        hours: item.hours || shiftHours(item.startTime, item.endTime) || null,
        status: item.status || SUBMISSION_STATUS.SUBMITTED,
        monthKey: item.monthKey || toMonthKey(item.date),
        managerOverride: !!item.managerOverride,
        notes: item.notes || '',
    };
}

async function loadWorkshopTypeNamesByServiceId() {
    const result = await wixData.query('workshops').find(SA).catch(() => ({ items: [] }));
    const map = {};
    for (const item of (result.items || [])) {
        const name = item.workshopName || 'סדנה';
        for (const sid of String(item.serviceIds || '').split(',').map(s => s.trim()).filter(Boolean)) {
            map[sid] = name;
        }
    }
    return map;
}

/**
 * Workshop details for the employee's SCHEDULED dates: paid, non-cancelled
 * WorkshopOrders whose workshopStart falls on one of those dates.
 * Employee-safe payload: participants + customer notes only — no phones,
 * no internal notes, no payment data.
 */
async function loadScheduledWorkshopDetails(scheduledSubmissions) {
    const dateKeys = [...new Set(scheduledSubmissions.map(s => s.date).filter(Boolean))];
    if (!dateKeys.length) return [];

    const sorted = [...dateKeys].sort();
    // Padded range (queried once), then exact per-day matching via toDateKey —
    // robust to the Israel/UTC offset without per-day boundary math.
    const rangeStart = new Date(`${sorted[0]}T00:00:00Z`);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
    const rangeEnd = new Date(`${sorted[sorted.length - 1]}T23:59:59Z`);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

    const [ordersResult, typeNamesByServiceId] = await Promise.all([
        wixData.query('WorkshopOrders')
            .eq('status', 'paid')
            .ge('workshopStart', rangeStart)
            .le('workshopStart', rangeEnd)
            .limit(1000)
            .find(SA)
            .catch(() => ({ items: [] })),
        loadWorkshopTypeNamesByServiceId(),
    ]);

    const orders = (ordersResult.items || []).filter(o => !o.cancelledAt);
    const dateKeySet = new Set(dateKeys);
    const relevant = orders.filter(o => dateKeySet.has(toDateKey(o.workshopStart)));

    const orderIds = relevant.map(o => o._id);
    const participantsByOrderId = {};
    if (orderIds.length) {
        const pResult = await wixData.query('WorkshopParticipants')
            .hasSome('orderId', orderIds)
            .limit(1000)
            .find(SA)
            .catch(() => ({ items: [] }));
        for (const p of (pResult.items || [])) {
            if (p.cancelledAt) continue;
            if (!participantsByOrderId[p.orderId]) participantsByOrderId[p.orderId] = [];
            participantsByOrderId[p.orderId].push({
                name: p.name || '',
                childrenCount: p.childrenCount || 0,
                hasChildren: !!p.hasChildren,
            });
        }
    }

    return relevant.map(order => ({
        date: toDateKey(order.workshopStart),
        workshopStart: order.workshopStart,
        workshopType: typeNamesByServiceId[order.serviceId] || order.workshopType || 'סדנה',
        organizerName: order.organizerName || '',
        adults: order.adults || 0,
        children: order.children || 0,
        quantity: (order.adults || 0) + (order.children || 0),
        customerNotes: order.customerNotes || '',
        participants: participantsByOrderId[order._id] || [],
    })).sort((a, b) => new Date(a.workshopStart) - new Date(b.workshopStart));
}

function buildMonthsSummary(role, settings, submissions, now) {
    const openMonths = getOpenMonthKeys(settings, now);
    return openMonths.map(monthKey => {
        const monthSubs = submissions.filter(s => (s.monthKey || toMonthKey(s.date)) === monthKey);
        const quota = evaluateQuota(role, settings, monthSubs);
        const isCurrent = monthKey === toMonthKey(now);
        return {
            monthKey,
            isCurrentMonth: isCurrent,
            deadline: isCurrent ? null : computeSubmissionDeadline(monthKey, settings).toISOString(),
            open: isCurrent ? quota.bonusUnlocked : isSubmissionOpenForMonth(monthKey, settings, now),
            quota,
        };
    });
}

// ---------------------------------------------------------------------------
// Web methods
// ---------------------------------------------------------------------------

export const getMyPortalData = webMethod(Permissions.Anyone, async () => {
    const { member, role } = await assertEmployeeAccess('submitAvailability');
    const now = new Date();

    const [settings, roleRow] = await Promise.all([
        loadSettings(),
        ensureRoleProfile(role, member),
    ]);

    if (roleRow.active === false) {
        throw new Error('ACCESS_DENIED: Employee profile is inactive.');
    }

    const [rawSubmissions, changeRequests] = await Promise.all([
        loadMySubmissions(roleRow._id, now),
        loadMyChangeRequests(roleRow._id),
    ]);
    const submissions = rawSubmissions.map(mapSubmission);
    const scheduled = submissions.filter(s => s.status === SUBMISSION_STATUS.SCHEDULED);
    const scheduledWorkshops = await loadScheduledWorkshopDetails(scheduled);

    // Personalized day states + offers/open calls (per-skill capacity model).
    const openMonths = getOpenMonthKeys(settings, now);
    const lastMonth = openMonths[openMonths.length - 1];
    const [ly, lm] = lastMonth.split('-').map(Number);
    const rangeFrom = toDateKey(now);
    const rangeTo = `${lastMonth}-${String(new Date(Date.UTC(ly, lm, 0)).getUTCDate()).padStart(2, '0')}`;
    const board = await buildBoard(rangeFrom, rangeTo, { includeOffers: true });
    const mySkills = getRoleSkillWorkshopIds(roleRow);

    const dayStates = {};
    for (const [dateKey, day] of Object.entries(board.days)) {
        if (dateKey <= rangeFrom) continue;
        dayStates[dateKey] = {
            state: personalDayState(day, mySkills),
            workshops: Object.values(day.types).map(t => t.name),
        };
    }

    const myScheduledDates = new Set(scheduled.map(s => s.date));
    const myOffers = (board.offers || [])
        .filter(o => o.kind === OFFER_KIND.WAITLIST_OFFER
            && o.status === OFFER_STATUS.PENDING
            && o.employeeId === roleRow._id)
        .map(o => ({
            id: o._id,
            date: o.dateKey || toDateKey(o.date),
            workshopName: o.workshopName || 'סדנה',
            expiresAt: o.expiresAt || null,
        }));
    const openCalls = (board.offers || [])
        .filter(o => o.kind === OFFER_KIND.OPEN_CALL
            && o.status === OFFER_STATUS.OPEN
            && mySkills.includes(o.workshopTypeId)
            && !myScheduledDates.has(o.dateKey || toDateKey(o.date)))
        .map(o => ({
            id: o._id,
            date: o.dateKey || toDateKey(o.date),
            workshopName: o.workshopName || 'סדנה',
        }));

    return {
        dayStates,
        myOffers,
        openCalls,
        holidays: settings.holidays || [],
        user: {
            name: roleRow.displayName || extractMemberName(member, extractMemberEmail(member)),
            roleType: roleRow.roleType || 'Employee',
            roleLabel: ROLE_TYPE_LABELS[roleRow.roleType] || roleRow.roleType || 'עובד/ת',
            isTrainee: !!roleRow.isTrainee || roleRow.roleType === 'Trainee',
            color: roleRow.color || null,
            permissions: buildPermissionsFromRole(roleRow),
        },
        rules: {
            minShiftHours: getMinShiftHours(roleRow, settings),
            requiredShiftsPerMonth: getRequiredShifts(roleRow, settings),
            deadlineDaysBeforeMonthEnd: settings.deadlineDaysBeforeMonthEnd,
            monthsAheadAllowed: settings.monthsAheadAllowed,
            defaultShiftStart: settings.defaultShiftStart,
            defaultShiftEnd: settings.defaultShiftEnd,
            blockedDates: settings.blockedDates,
            fullDates: settings.fullDates,
            promotedDates: settings.promotedDates,
            bonusUnlockEnabled: settings.bonusUnlockEnabled,
        },
        months: buildMonthsSummary(roleRow, settings, submissions, now),
        submissions,
        scheduledWorkshops,
        changeRequests,
        serverNow: now.toISOString(),
    };
});

/**
 * Submits a batch of availability shifts.
 * @param {Array<{date: string, startTime: string, endTime: string, notes?: string}>} shifts
 */
export const submitAvailability = webMethod(Permissions.Anyone, async (shifts) => {
    const { member, role } = await assertEmployeeAccess('submitAvailability');
    const now = new Date();

    const [settings, roleRow] = await Promise.all([
        loadSettings(),
        ensureRoleProfile(role, member),
    ]);
    if (roleRow.active === false) {
        throw new Error('ACCESS_DENIED: Employee profile is inactive.');
    }

    const existingRaw = await loadMySubmissions(roleRow._id, now);
    const existing = existingRaw.map(item => ({
        status: item.status,
        dateKey: toDateKey(item.date),
        monthKey: item.monthKey || toMonthKey(item.date),
    }));

    const cleanShifts = (Array.isArray(shifts) ? shifts : []).map(s => ({
        date: String(s?.date || '').trim(),
        startTime: String(s?.startTime || settings.defaultShiftStart).trim(),
        endTime: String(s?.endTime || settings.defaultShiftEnd).trim(),
        notes: typeof s?.notes === 'string' ? s.notes.slice(0, 500) : '',
    }));

    const validation = validateSubmission(cleanShifts, roleRow, settings, existing, { now });
    if (!validation.ok) {
        return { ok: false, errors: validation.errors, inserted: 0 };
    }

    // Placement decided at click time against a consistent capacity snapshot:
    // OPEN/FREE day → SUBMITTED, skill-matched-but-full → STANDBY (waiting
    // list), no skill match for that day's workshops → rejected.
    const batchDates = cleanShifts.map(s => s.date).sort();
    const board = await buildBoard(batchDates[0], batchDates[batchDates.length - 1], { consistent: true });
    const mySkills = getRoleSkillWorkshopIds(roleRow);

    const placements = {};
    const skillErrors = [];
    for (const shift of cleanShifts) {
        const status = resolvePlacement(board.days[shift.date], mySkills);
        if (!status) {
            skillErrors.push({
                date: shift.date, code: 'NO_SKILL',
                message: `בתאריך ${shift.date} מתקיימות סדנאות שאינן תואמות את ההכשרות שלך.`,
            });
        } else {
            placements[shift.date] = status;
        }
    }
    if (skillErrors.length) {
        return { ok: false, errors: skillErrors, inserted: 0 };
    }

    const staffId = refId(roleRow.connectedStaff);
    let inserted = 0;
    let standby = 0;
    for (const shift of cleanShifts) {
        // Stored at UTC noon so the calendar day is stable in Israel time.
        await wixData.insert('AvailabilitySubmissions', {
            employeeId: roleRow._id,
            staffId,
            date: new Date(`${shift.date}T12:00:00Z`),
            startTime: shift.startTime,
            endTime: shift.endTime,
            hours: shiftHours(shift.startTime, shift.endTime),
            status: placements[shift.date],
            monthKey: shift.date.slice(0, 7),
            managerOverride: false,
            notes: shift.notes,
        }, SA);
        inserted++;
        if (placements[shift.date] === SUBMISSION_STATUS.STANDBY) standby++;
    }

    // Auto-approve mode: run the engine immediately so days with active
    // customer bookings assign the employee on the spot (skill-matched);
    // days without bookings simply stay pending. Manual mode: no-op
    // (runScheduling is gated internally on the same setting).
    if (settings.autoApproveShifts !== false) {
        await runScheduling(batchDates[0], batchDates[batchDates.length - 1]).catch(err =>
            console.error('[employeeService] post-submit runScheduling failed:', err?.message || err));
    }

    await publishSchedulingUpdate('submission', { dates: batchDates });
    console.log(`[employeeService] submitAvailability: role=${roleRow._id} inserted=${inserted} standby=${standby}`);
    return { ok: true, errors: [], inserted, standby, placements };
});

/** Withdraws a future, not-yet-scheduled submission owned by the caller. */
export const withdrawAvailability = webMethod(Permissions.Anyone, async (submissionId) => {
    const { member, role } = await assertEmployeeAccess('submitAvailability');
    if (!submissionId) throw new Error('BAD_REQUEST: submissionId is required.');

    const roleRow = await ensureRoleProfile(role, member);
    const item = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    if (!item || item.employeeId !== roleRow._id) {
        throw new Error('NOT_FOUND: Submission not found.');
    }
    if (item.status !== SUBMISSION_STATUS.SUBMITTED) {
        throw new Error('FORBIDDEN: ניתן לבטל ישירות רק משמרות שטרם אושרו — למשמרות משובצות/בהמתנה יש לשלוח בקשת מחיקה.');
    }
    if (toDateKey(item.date) <= toDateKey(new Date())) {
        throw new Error('FORBIDDEN: לא ניתן לבטל זמינות לתאריך שעבר.');
    }

    await wixData.remove('AvailabilitySubmissions', submissionId, SA);
    await publishSchedulingUpdate('withdrawal', { dates: [toDateKey(item.date)] });
    console.log(`[employeeService] withdrawAvailability: role=${roleRow._id} removed=${submissionId}`);
    return { ok: true };
});

/**
 * Free edit of a SUBMITTED (not-yet-placed) shift owned by the caller.
 * SCHEDULED/STANDBY shifts must go through requestShiftChange instead.
 */
export const updateSubmission = webMethod(Permissions.Anyone, async (submissionId, patch) => {
    const { member, role } = await assertEmployeeAccess('submitAvailability');
    if (!submissionId) throw new Error('BAD_REQUEST: submissionId is required.');

    const roleRow = await ensureRoleProfile(role, member);
    const item = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    if (!item || item.employeeId !== roleRow._id) {
        throw new Error('NOT_FOUND: Submission not found.');
    }
    if (item.status !== SUBMISSION_STATUS.SUBMITTED) {
        throw new Error('FORBIDDEN: ניתן לערוך ישירות רק משמרות שטרם אושרו — למשמרות משובצות/בהמתנה יש לשלוח בקשת שינוי.');
    }
    if (toDateKey(item.date) <= toDateKey(new Date())) {
        throw new Error('FORBIDDEN: לא ניתן לערוך זמינות לתאריך שעבר.');
    }

    const startTime = String(patch?.startTime || '').trim();
    const endTime = String(patch?.endTime || '').trim();
    if (startTime < SHIFT_MIN_TIME || startTime > SHIFT_MAX_TIME || endTime < SHIFT_MIN_TIME || endTime > SHIFT_MAX_TIME) {
        throw new Error(`BAD_REQUEST: שעות המשמרת חייבות להיות בין ${SHIFT_MIN_TIME} ל-${SHIFT_MAX_TIME}.`);
    }
    const settings = await loadSettings();
    const hrs = shiftHours(startTime, endTime);
    const minHrs = getMinShiftHours(roleRow, settings);
    if (hrs === null || hrs < minHrs) {
        throw new Error(`BAD_REQUEST: אורך המשמרת קצר מהמינימום (${minHrs} שעות) או שהשעות שגויות.`);
    }

    await wixData.update('AvailabilitySubmissions', {
        ...item,
        startTime,
        endTime,
        hours: hrs,
    }, SA);
    await publishSchedulingUpdate('submission-edit', { dates: [toDateKey(item.date)] });
    console.log(`[employeeService] updateSubmission: role=${roleRow._id} id=${submissionId}`);
    return { ok: true };
});

/** Scheduled-workshop details for a given month (or all upcoming when omitted). */
export const getMyScheduledWorkshops = webMethod(Permissions.Anyone, async (monthKey) => {
    const { member, role } = await assertEmployeeAccess('submitAvailability');
    const roleRow = await ensureRoleProfile(role, member);

    let query = wixData.query('AvailabilitySubmissions')
        .eq('employeeId', roleRow._id)
        .eq('status', SUBMISSION_STATUS.SCHEDULED);
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
        query = query.eq('monthKey', monthKey);
    } else {
        query = query.ge('date', new Date());
    }
    const result = await query.ascending('date').limit(500).find(SA).catch(() => ({ items: [] }));
    const scheduled = (result.items || []).map(mapSubmission);
    return loadScheduledWorkshopDetails(scheduled);
});
