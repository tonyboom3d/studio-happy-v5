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
import { availabilityCalendar } from 'wix-bookings.v2';
import { Permissions, webMethod } from 'wix-web-module';
import {
    assertEmployeeAccess,
    buildPermissionsFromRole,
    extractMemberName,
    extractMemberEmail,
    getRolePermissionValue,
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
    getRequiredShiftsPerWeek,
    evaluateQuota,
    evaluateWeekendCompliance,
    evaluatePeriodQuota,
    getUpcomingPeriods,
    validateSubmission,
    normalizeWorkType,
    WORK_TYPE_LABELS,
    SHIFT_MIN_TIME,
    SHIFT_MAX_TIME,
} from 'backend/availabilityRules.js';
import {
    buildBoard,
    personalDayState,
    resolvePlacement,
    publishSchedulingUpdate,
    loadSettings as loadEngineSettings,
    loadWorkshopTypeMap,
    runScheduling,
    OFFER_KIND,
    OFFER_STATUS,
} from 'backend/schedulingEngine.js';
import { getRoleSkillWorkshopIds, loadRoleWithSkills } from 'backend/staffRoles.js';
import { loadMyChangeRequests } from 'backend/shiftChangeRequests.js';
import { loadMySwapRequests } from 'backend/shiftSwaps.js';
import { loadVacationsForEmployee, loadVacationHistoryForEmployee, requestEmployeeDaysOff } from 'backend/vacations.js';

const SA = { suppressAuth: true };
const SESSION_MATCH_TOLERANCE_MS = 5 * 60 * 1000;
// Free edit/delete window for a just-submitted (SUBMITTED) shift. After this,
// changes must go through the manager-approval request flow (shiftChangeRequests.js).
const EDIT_WINDOW_MS = 30 * 60 * 1000;

/** True while a SUBMITTED row is still inside its free-edit window. */
function isWithinEditWindow(item, now = new Date()) {
    const createdAt = item?._createdDate ? new Date(item._createdDate) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    return now.getTime() - createdAt.getTime() < EDIT_WINDOW_MS;
}

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
    const createdAt = item._createdDate ? new Date(item._createdDate) : null;
    const editableUntil = createdAt ? new Date(createdAt.getTime() + EDIT_WINDOW_MS) : null;
    return {
        id: item._id,
        date: toDateKey(item.date),
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        hours: item.hours || shiftHours(item.startTime, item.endTime) || null,
        status: item.status || SUBMISSION_STATUS.SUBMITTED,
        monthKey: item.monthKey || toMonthKey(item.date),
        managerOverride: !!item.managerOverride,
        submittedByName: item.submittedByName || '',
        notes: item.notes || '',
        workType: normalizeWorkType(item.workType),
        workTypeLabel: WORK_TYPE_LABELS[normalizeWorkType(item.workType)],
        createdAt: createdAt ? createdAt.toISOString() : null,
        // Free-edit deadline for SUBMITTED rows (30 min from submission); the
        // instant-auto-approve flag locks a row regardless of this window.
        editableUntil: item.status === SUBMISSION_STATUS.SUBMITTED && editableUntil ? editableUntil.toISOString() : null,
        autoApproved: !!item.autoApproved,
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

/** Bookings session end times keyed by serviceId — matched to orders by start tolerance. */
async function loadSessionSlotsByService(serviceIds, rangeStart, rangeEnd) {
    const slotsByService = {};
    if (!serviceIds.length) return slotsByService;

    const options = { slotsPerDay: 100 };
    await Promise.all(serviceIds.map(async (serviceId) => {
        try {
            const availability = await availabilityCalendar.queryAvailability({
                filter: {
                    serviceId,
                    startDate: rangeStart.toISOString(),
                    endDate: rangeEnd.toISOString(),
                },
            }, options);
            slotsByService[serviceId] = (availability.availabilityEntries || [])
                .map(entry => entry.slot || {})
                .filter(slot => slot.startDate && slot.endDate)
                .map(slot => ({
                    startMs: new Date(slot.startDate).getTime(),
                    endIso: new Date(slot.endDate).toISOString(),
                }));
        } catch (_) {
            slotsByService[serviceId] = [];
        }
    }));
    return slotsByService;
}

function resolveWorkshopEnd(order, slotsByService) {
    const slots = slotsByService[order.serviceId];
    if (!slots?.length || !order.workshopStart) return null;
    const orderStart = new Date(order.workshopStart).getTime();
    for (const slot of slots) {
        if (Math.abs(slot.startMs - orderStart) <= SESSION_MATCH_TOLERANCE_MS) {
            return slot.endIso;
        }
    }
    return null;
}

/** Converts a Wix media URL (wix:image://…) to a browser-displayable HTTPS thumbnail URL. */
function convertWixImageUrl(wixUrl, width = 200, height = 200, quality = 75) {
    if (!wixUrl) return null;
    const raw = String(wixUrl).trim();
    if (!raw) return null;
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
    const match = raw.match(/wix:image:\/\/v1\/([^/]+)/);
    if (match && match[1]) {
        return `https://static.wixstatic.com/media/${match[1]}/v1/fill/w_${width},h_${height},q_${quality}/${match[1]}`;
    }
    return null;
}

function parseProductSnapshot(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
}

/** Employee-safe sketch thumbnails (small + full-size) grouped by orderId — no status/internal fields. */
async function loadSketchImagesByOrderId(orderIds) {
    const byOrderId = {};
    if (!orderIds.length) return byOrderId;
    const result = await wixData.query('SketchSelections')
        .hasSome('orderId', orderIds)
        .limit(1000)
        .find(SA)
        .catch(() => ({ items: [] }));
    const sels = (result.items || []).filter(s => !s.cancelledAt);

    const productIds = [...new Set(sels.map(s => s.productId).filter(Boolean))];
    const productImageById = {};
    if (productIds.length) {
        const productsResult = await wixData.query('bookingProducts')
            .hasSome('_id', productIds)
            .limit(1000)
            .find(SA)
            .catch(() => ({ items: [] }));
        for (const p of (productsResult.items || [])) {
            productImageById[p._id] = String(p?.image || '').trim() || null;
        }
    }

    for (const sel of sels) {
        const snapshot = parseProductSnapshot(sel.productSnapshot);
        const candidates = [
            sel.sketchImage,
            sel.imageUrl,
            snapshot?.imageUrl,
            snapshot?.image,
            productImageById[sel.productId],
        ];
        let thumb = null, full = null;
        for (const url of candidates) {
            const converted = convertWixImageUrl(url, 220, 220, 75);
            if (converted) { thumb = converted; full = convertWixImageUrl(url, 1200, 1200, 90); break; }
        }
        if (!thumb) continue;
        if (!byOrderId[sel.orderId]) byOrderId[sel.orderId] = [];
        byOrderId[sel.orderId].push({ id: sel._id, thumb, full: full || thumb });
    }
    return byOrderId;
}

/**
 * Workshop details for the employee's SCHEDULED dates: paid, non-cancelled
 * WorkshopOrders whose workshopStart falls on one of those dates.
 * Employee-safe payload: participants, customer notes, and organizer phone
 * for assigned workshop days — no internal notes or payment data.
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
    const serviceIds = [...new Set(relevant.map(o => o.serviceId).filter(Boolean))];
    const slotsByService = await loadSessionSlotsByService(serviceIds, rangeStart, rangeEnd);

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
    const sketchesByOrderId = await loadSketchImagesByOrderId(orderIds);

    return relevant.map(order => ({
        orderId: order._id,
        date: toDateKey(order.workshopStart),
        workshopStart: order.workshopStart,
        workshopEnd: resolveWorkshopEnd(order, slotsByService),
        workshopType: typeNamesByServiceId[order.serviceId] || order.workshopType || 'סדנה',
        organizerName: order.organizerName || '',
        organizerPhone: order.organizerPhone || '',
        adults: order.adults || 0,
        children: order.children || 0,
        quantity: (order.adults || 0) + (order.children || 0),
        customerNotes: order.customerNotes || '',
        participants: participantsByOrderId[order._id] || [],
        sketches: sketchesByOrderId[order._id] || [],
    })).sort((a, b) => new Date(a.workshopStart) - new Date(b.workshopStart));
}

function buildMonthsSummary(role, settings, submissions, now, vacations) {
    const openMonths = getOpenMonthKeys(settings, now);
    // evaluateQuota/evaluateWeekendCompliance expect { status, date|dateKey }.
    const subsForRules = submissions.map(s => ({ status: s.status, dateKey: s.date }));
    return openMonths.map(monthKey => {
        const quota = evaluateQuota(role, settings, monthKey, subsForRules, vacations);
        const weekend = evaluateWeekendCompliance(role, settings, monthKey, subsForRules, vacations);
        const isCurrent = monthKey === toMonthKey(now);
        return {
            monthKey,
            isCurrentMonth: isCurrent,
            deadline: isCurrent ? null : computeSubmissionDeadline(monthKey, settings).toISOString(),
            open: isCurrent ? quota.bonusUnlocked : isSubmissionOpenForMonth(monthKey, settings, now),
            quota,
            weekend,
            // Consolidated progress-bar payload: three components summing to 100%.
            progress: {
                shifts: { submitted: quota.submitted, required: quota.required, requiredBase: quota.requiredBase, exempt: quota.vacationExempt },
                fridays: { submitted: weekend.fridays.submitted, required: weekend.fridays.required, requiredBase: weekend.fridays.requiredBase, exempt: weekend.fridays.vacationExempt },
                saturdays: { submitted: weekend.saturdays.submitted, required: weekend.saturdays.required, requiredBase: weekend.saturdays.requiredBase, exempt: weekend.saturdays.vacationExempt },
            },
        };
    });
}

/** Upcoming 2-week submission windows + how many shifts are still missing for each. */
function buildUpcomingWindows(role, settings, submissions, now, vacations) {
    const subsForRules = submissions.map(s => ({ status: s.status, dateKey: s.date }));
    return getUpcomingPeriods(now, 2).map(period => {
        const quota = evaluatePeriodQuota(role, settings, period, subsForRules, vacations);
        return {
            start: period.start,
            end: period.end,
            deadline: period.deadline.toISOString(),
            required: quota.required,
            submitted: quota.submitted,
            missing: quota.missing,
            met: quota.met,
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
        ensureRoleProfile(role, member).then(loadRoleWithSkills),
    ]);

    if (roleRow.active === false) {
        throw new Error('ACCESS_DENIED: Employee profile is inactive.');
    }

    const [rawSubmissions, changeRequests, mySwapRequests, vacations, myVacations] = await Promise.all([
        loadMySubmissions(roleRow._id, now),
        loadMyChangeRequests(roleRow._id),
        loadMySwapRequests(roleRow._id),
        loadVacationsForEmployee(roleRow._id),
        loadVacationHistoryForEmployee(roleRow._id),
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
    const [board, { typesById }] = await Promise.all([
        buildBoard(rangeFrom, rangeTo, { includeOffers: true }),
        loadWorkshopTypeMap(),
    ]);
    const mySkills = getRoleSkillWorkshopIds(roleRow);

    const dayStates = {};
    for (const [dateKey, day] of Object.entries(board.days)) {
        if (dateKey <= rangeFrom) continue;
        dayStates[dateKey] = {
            state: personalDayState(day, mySkills),
            // Times let the calendar show every session (incl. several of the
            // same workshop type on one day) instead of just its name. Strictly
            // filtered to the employee's own skills — workshops they cannot
            // instruct are never shown to them, even as informational text.
            workshops: Object.values(day.types)
                .filter(t => mySkills.includes(t.typeId))
                .map(t => ({
                    id: t.typeId,
                    name: t.name,
                    times: [...t.sessions].sort(),
                })),
        };
    }

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
        .filter(o => {
            if (o.kind !== OFFER_KIND.OPEN_CALL || o.status !== OFFER_STATUS.OPEN) return false;
            if (!mySkills.includes(o.workshopTypeId)) return false;
            const dateKey = o.dateKey || toDateKey(o.date);
            const t = board.days[dateKey]?.types?.[o.workshopTypeId];
            if (t?.assignedEmployeeIds?.includes(roleRow._id)) return false;
            return true;
        })
        .map(o => {
            const dateKey = o.dateKey || toDateKey(o.date);
            const sessions = board.days[dateKey]?.types?.[o.workshopTypeId]?.sessions || [];
            const sessionTime = [...sessions].sort()[0] || null;
            return {
                id: o._id,
                date: dateKey,
                workshopTypeId: o.workshopTypeId || null,
                workshopName: o.workshopName || 'סדנה',
                sessionTime,
            };
        })
        .sort((a, b) => {
            const byDate = (a.date || '').localeCompare(b.date || '');
            if (byDate) return byDate;
            const byTime = (a.sessionTime || '').localeCompare(b.sessionTime || '');
            if (byTime) return byTime;
            return (a.workshopName || '').localeCompare(b.workshopName || '', 'he');
        });

    return {
        dayStates,
        allWorkshopTypes: Object.values(typesById).filter(t => mySkills.includes(t.id)),
        myOffers,
        openCalls,
        holidays: settings.holidays || [],
        dayNotes: settings.dayNotes || {},
        // Only sent to employees holding the sketchSewingSkill flag — this is
        // the sole gate that lets these manager-defined days become visible.
        sketchSewingDays: getRolePermissionValue(roleRow, 'sketchSewingSkill') ? (settings.sketchSewingDays || {}) : {},
        user: {
            name: roleRow.displayName || extractMemberName(member, extractMemberEmail(member)),
            phone: roleRow.phone || '',
            email: roleRow.userEmail || extractMemberEmail(member) || '',
            certifications: getRoleSkillWorkshopIds(roleRow)
                .map(id => typesById[id]?.name)
                .filter(Boolean),
            joinedAt: roleRow._createdDate
                ? new Date(roleRow._createdDate).toISOString()
                : null,
            minShiftsPerWeek: Number.isFinite(Number(roleRow.minShiftsPerWeek)) && Number(roleRow.minShiftsPerWeek) > 0
                ? Number(roleRow.minShiftsPerWeek)
                : null,
            minShiftHours: Number.isFinite(Number(roleRow.minShiftHours)) && Number(roleRow.minShiftHours) > 0
                ? Number(roleRow.minShiftHours)
                : null,
            roleType: roleRow.roleType || 'Employee',
            roleLabel: ROLE_TYPE_LABELS[roleRow.roleType] || roleRow.roleType || 'עובד/ת',
            isTrainee: !!roleRow.isTrainee || roleRow.roleType === 'Trainee',
            color: roleRow.color || null,
            permissions: buildPermissionsFromRole(roleRow),
        },
        rules: {
            minShiftHours: getMinShiftHours(roleRow, settings),
            requiredShiftsPerWeek: getRequiredShiftsPerWeek(roleRow, settings),
            defaultMinShiftHours: settings.defaultMinShiftHours,
            defaultMinShiftsPerWeek: settings.defaultMinShiftsPerWeek,
            deadlineDaysBeforeMonthEnd: settings.deadlineDaysBeforeMonthEnd,
            monthsAheadAllowed: settings.monthsAheadAllowed,
            defaultShiftStart: settings.defaultShiftStart,
            defaultShiftEnd: settings.defaultShiftEnd,
            blockedDates: settings.blockedDates,
            fullDates: settings.fullDates,
            promotedDates: settings.promotedDates,
            bonusUnlockEnabled: settings.bonusUnlockEnabled,
            shiftMinTime: SHIFT_MIN_TIME,
            shiftMaxTime: SHIFT_MAX_TIME,
        },
        months: buildMonthsSummary(roleRow, settings, submissions, now, vacations),
        upcomingWindows: buildUpcomingWindows(roleRow, settings, submissions, now, vacations),
        submissions,
        scheduledWorkshops,
        changeRequests,
        mySwapRequests,
        myVacations,
        serverNow: now.toISOString(),
    };
});

/** Employee: request one or more days off (manager approval required). */
export const requestDayOff = webMethod(Permissions.Anyone, async (dates, notes) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    if (!Array.isArray(dates) || !dates.length) throw new Error('BAD_REQUEST: יש לבחור לפחות יום אחד.');
    return requestEmployeeDaysOff(role, dates, notes);
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
    const insertedIds = [];
    for (const shift of cleanShifts) {
        // Stored at UTC noon so the calendar day is stable in Israel time.
        const row = await wixData.insert('AvailabilitySubmissions', {
            employeeId: roleRow._id,
            staffId,
            date: new Date(`${shift.date}T12:00:00Z`),
            startTime: shift.startTime,
            endTime: shift.endTime,
            hours: shiftHours(shift.startTime, shift.endTime),
            status: placements[shift.date],
            monthKey: shift.date.slice(0, 7),
            managerOverride: false,
            workType: 'WORKSHOP',
            notes: shift.notes,
            autoApproved: false,
        }, SA);
        insertedIds.push({ id: row._id, date: shift.date });
        inserted++;
        if (placements[shift.date] === SUBMISSION_STATUS.STANDBY) standby++;
    }

    // Auto-approve mode: run the engine immediately so days with active
    // customer bookings assign the employee on the spot (skill-matched);
    // days without bookings simply stay pending. Manual mode: no-op
    // (runScheduling is gated internally on the same setting).
    let autoApproved = [];
    if (settings.autoApproveShifts !== false) {
        await runScheduling(batchDates[0], batchDates[batchDates.length - 1]).catch(err =>
            console.error('[employeeService] post-submit runScheduling failed:', err?.message || err));

        // Any of this batch's rows the engine flipped straight to SCHEDULED
        // matched an open customer booking instantly — flag + surface them so
        // the UI can highlight the bypass of the 30-min free-edit window.
        const ids = insertedIds.map(x => x.id);
        const refreshed = await wixData.query('AvailabilitySubmissions')
            .hasSome('_id', ids)
            .eq('status', SUBMISSION_STATUS.SCHEDULED)
            .find(SA).catch(() => ({ items: [] }));
        if (refreshed.items?.length) {
            const assignments = await wixData.query('ShiftAssignments')
                .hasSome('submissionId', refreshed.items.map(r => r._id))
                .find(SA).catch(() => ({ items: [] }));
            const workshopBySubmissionId = {};
            for (const a of (assignments.items || [])) workshopBySubmissionId[a.submissionId] = a.workshopName;

            for (const row of refreshed.items) {
                await wixData.update('AvailabilitySubmissions', { ...row, autoApproved: true }, SA).catch(() => null);
                autoApproved.push({
                    id: row._id,
                    date: toDateKey(row.date),
                    workshopName: workshopBySubmissionId[row._id] || 'סדנה',
                });
            }
        }
    }

    await publishSchedulingUpdate('submission', { dates: batchDates });
    console.log(`[employeeService] submitAvailability: role=${roleRow._id} inserted=${inserted} standby=${standby} autoApproved=${autoApproved.length}`);
    return { ok: true, errors: [], inserted, standby, placements, autoApproved };
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
    if (!isWithinEditWindow(item)) {
        throw new Error('FORBIDDEN: חלפו 30 הדקות לעריכה חופשית — יש לשלוח בקשת מחיקה שתאושר על ידי מנהל/ת.');
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
    if (!isWithinEditWindow(item)) {
        throw new Error('FORBIDDEN: חלפו 30 הדקות לעריכה חופשית — יש לשלוח בקשת שינוי שתאושר על ידי מנהל/ת.');
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
