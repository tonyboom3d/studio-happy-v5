/**
 * Schedule calendar (manager "לוח שיבוץ") — light range read + shift-hours edit.
 * Assign/remove/swap reuse staffAdminService (manualAssign/cancelAssignment/swapAssignment).
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess, getRolePermissionValue } from 'backend/staffRoles.js';
import { SUBMISSION_STATUS, toDateKey, normalizeWorkType } from 'backend/availabilityRules.js';
import { buildBoard, loadSettings, loadWorkshopTypeMap, publishSchedulingUpdate } from 'backend/schedulingEngine.js';
import { loadVacationsOverlappingRange, VACATION_STATUS } from 'backend/vacations.js';
import { TUFTING_SERVICE_IDS } from 'backend/sketchEditingPolicy.js';
import { shapeBoardDays } from 'backend/scheduleDayShape.js';

const SA = { suppressAuth: true };
const MAX_RANGE_DAYS = 42;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function daysBetween(fromKey, toKey) {
    return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

function inRange(dateKey, fromKey, toKey) {
    return dateKey >= fromKey && dateKey <= toKey;
}

function pickByDate(map, fromKey, toKey) {
    return Object.fromEntries(Object.entries(map || {}).filter(([k]) => inRange(k, fromKey, toKey)));
}

export const getScheduleRange = webMethod(Permissions.SiteMember, async (fromKey, toKey) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    if (!DATE_RE.test(fromKey || '') || !DATE_RE.test(toKey || '') || fromKey > toKey) {
        throw new Error('BAD_REQUEST: טווח תאריכים לא תקין.');
    }
    if (daysBetween(fromKey, toKey) > MAX_RANGE_DAYS) throw new Error('BAD_REQUEST: טווח תאריכים ארוך מדי.');

    const [board, settings, subsRaw, vacationsRaw, typeMap] = await Promise.all([
        buildBoard(fromKey, toKey),
        loadSettings(),
        wixData.query('AvailabilitySubmissions')
            .ge('date', new Date(`${fromKey}T00:00:00Z`))
            .le('date', new Date(`${toKey}T23:59:59Z`))
            .ne('status', SUBMISSION_STATUS.REJECTED)
            .limit(1000).find(SA).catch(() => ({ items: [] })),
        loadVacationsOverlappingRange(fromKey, toKey),
        loadWorkshopTypeMap(),
    ]);

    const tuftingTypeIds = new Set(Object.values(TUFTING_SERVICE_IDS).map(sid => typeMap.serviceIdToTypeId[sid]).filter(Boolean));
    const days = shapeBoardDays(board, tuftingTypeIds);

    const employees = Object.values(board.rolesById)
        .filter(r => getRolePermissionValue(r, 'submitAvailability'))
        .map(r => ({
            id: r._id,
            displayName: r.displayName || '(ללא שם)',
            color: r.color || null,
            active: r.active !== false,
            isTrainee: !!r.isTrainee,
            priorityRank: r.priorityRank ?? null,
            skillIds: board.skillsByRoleId[r._id] || [],
        }))
        .sort((a, b) => (a.priorityRank ?? 999) - (b.priorityRank ?? 999));

    const submissions = (subsRaw.items || []).map(s => {
        const date = toDateKey(s.date);
        const assignedTypeIds = Object.values(board.days[date]?.types || {})
            .filter(t => t.assignedEmployeeIds.includes(s.employeeId))
            .map(t => t.typeId);
        return {
            id: s._id,
            employeeId: s.employeeId,
            date,
            startTime: s.startTime || '',
            endTime: s.endTime || '',
            status: s.status,
            managerOverride: !!s.managerOverride,
            workType: normalizeWorkType(s.workType),
            assignedTypeIds,
        };
    });

    const vacations = (vacationsRaw || [])
        .filter(v => v.status === VACATION_STATUS.APPROVED)
        .map(v => ({ employeeId: v.employeeId, startDate: v.startDate, endDate: v.endDate || v.startDate }));

    return {
        fromKey,
        toKey,
        permissions: {
            manageScheduling: true,
            manageRules: getRolePermissionValue(role, 'manageRules'),
        },
        workshopTypes: Object.values(board.typesById),
        employees,
        days,
        submissions,
        vacations,
        settings: {
            defaultShiftStart: settings.defaultShiftStart,
            defaultShiftEnd: settings.defaultShiftEnd,
            blockedDates: (settings.blockedDates || []).filter(d => inRange(d, fromKey, toKey)),
            promotedDates: (settings.promotedDates || []).filter(d => inRange(d, fromKey, toKey)),
            holidays: (settings.holidays || []).filter(h => h?.date && inRange(h.date, fromKey, toKey)),
            dayNotes: pickByDate(settings.dayNotes, fromKey, toKey),
            sketchSewingDays: pickByDate(settings.sketchSewingDays, fromKey, toKey),
        },
        serverNow: new Date().toISOString(),
    };
});

/** Manager edits an employee's shift hours (HH:MM, Israel local) for one submission. */
export const adminUpdateShiftHours = webMethod(Permissions.SiteMember, async (submissionId, startTime, endTime) => {
    await assertEmployeeAccess('manageScheduling');
    if (!submissionId) throw new Error('BAD_REQUEST: חסר מזהה משמרת.');
    if (!TIME_RE.test(startTime || '') || !TIME_RE.test(endTime || '')) {
        throw new Error('BAD_REQUEST: יש להזין שעות בפורמט HH:MM.');
    }
    if (startTime >= endTime) throw new Error('BAD_REQUEST: שעת הסיום חייבת להיות אחרי שעת ההתחלה.');

    const sub = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    if (!sub) throw new Error('NOT_FOUND: המשמרת לא נמצאה.');
    await wixData.update('AvailabilitySubmissions', { ...sub, startTime, endTime }, SA);

    const dateKey = toDateKey(sub.date);
    await publishSchedulingUpdate('shift-hours', { dateKey, submissionId });
    return { ok: true, submissionId, dateKey, startTime, endTime };
});
