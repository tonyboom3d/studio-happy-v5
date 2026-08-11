/**
 * Staff admin web methods (Module B) — powers the admin tab in the
 * employee-portal CE. Strictly separate from dashboardService (order dashboard).
 *
 * Permission gates (staffRoles.js): manageEmployeeSystem (admin tab access),
 * viewTeamSchedule (read), manageEmployees,
 * manageRules, manageScheduling, manageRates. Rates are stripped from
 * payloads unless the caller holds manageRates.
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { staffMembers } from '@wix/bookings';
import {
    assertEmployeeAccess,
    buildPermissionsFromPreset,
    getRolePermissionValue,
    PERMISSION_GROUPS,
    PERMISSION_KEYS,
    PERMISSION_LABELS,
    refId,
    refIds,
    ROLE_TYPE_LABELS,
    ROLE_TYPES,
} from 'backend/staffRoles.js';
import {
    SUBMISSION_STATUS,
    toDateKey,
    evaluateQuota,
    evaluateWeekendCompliance,
    WORK_TYPES,
    WORK_TYPE_LABELS,
    DEFAULT_WORK_TYPE,
    normalizeWorkType,
} from 'backend/availabilityRules.js';
import { syncHebcalHolidays } from 'backend/holidayService.js';
import { TUFTING_SERVICE_IDS } from 'backend/sketchEditingPolicy.js';
import {
    buildBoard,
    typeFilledCount,
    loadSettings,
    loadRulesByTypeId,
    loadWorkshopTypeMap,
    runScheduling,
    publishSchedulingUpdate,
    OFFER_STATUS,
    ASSIGNMENT_STATUS,
} from 'backend/schedulingEngine.js';
import {
    loadVacationsOverlappingRangeByEmployee,
    loadVacationsForEmployee,
    listAllVacations,
    saveVacation as saveVacationRow,
    deleteVacation as deleteVacationRow,
    decideVacationRequest,
} from 'backend/vacations.js';
import {
    TEMPLATE_USE,
    assertTemplateUse,
    mapTemplateRow,
} from 'backend/whatsappTemplates.js';
import { sendEmployeeTemplateMessage, EMPLOYEE_ACTION_KEYS } from 'backend/employeeTemplates.js';

const PORTAL_URL = 'https://www.studiohappy.art/employee-portal';

const SA = { suppressAuth: true };

async function queryStaffMembers(query, options) {
    return staffMembers.queryStaffMembers(query, options);
}

/** Normalizes Bookings staff _id for Set lookups (case-insensitive GUID). */
function normalizeBookingStaffId(id) {
    if (!id) return null;
    const s = String(id).trim();
    return s ? s.toLowerCase() : null;
}

function buildBookingStaffIdSet(staffList) {
    const set = new Set();
    for (const member of staffList || []) {
        const id = normalizeBookingStaffId(member?._id || member?.id);
        if (id) set.add(id);
    }
    return set;
}

/**
 * True when Dashboard_Roles.connectedStaff points to a live Bookings staff _id.
 * Requires connectedStaff to be set AND that id to exist in queryStaffMembers results.
 */
export function isConnectedStaffBookingsLinked(connectedStaff, bookingStaffIdSet) {
    const connectedId = normalizeBookingStaffId(refId(connectedStaff));
    if (!connectedId || !bookingStaffIdSet?.size) return false;
    return bookingStaffIdSet.has(connectedId);
}

/** Loads all Bookings staff (paginated + non-service-providers). */
async function loadAllBookingStaffMembers() {
    const byId = new Map();

    async function fetchPages(queryBase = {}) {
        let cursor;
        do {
            const query = {
                ...queryBase,
                cursorPaging: { limit: 100, ...(cursor ? { cursor } : {}) },
            };
            const response = await queryStaffMembers(query);
            for (const member of (response?.staffMembers || [])) {
                const id = member?._id || member?.id;
                if (id) byId.set(id, member);
            }
            cursor = response?.pagingMetadata?.cursors?.next;
        } while (cursor);
    }

    await fetchPages();
    await fetchPages({ filter: { serviceProvider: { $eq: false } } }).catch(() => {});

    if (typeof staffMembers.queryStaffMembersV2 === 'function') {
        try {
            let cursor;
            do {
                const response = await staffMembers.queryStaffMembersV2({
                    cursorPaging: { limit: 100, ...(cursor ? { cursor } : {}) },
                });
                for (const member of (response?.staffMembers || [])) {
                    const id = member?._id || member?.id;
                    if (id) byId.set(id, member);
                }
                cursor = response?.pagingMetadata?.cursors?.next;
            } while (cursor);
        } catch (_) { /* V2 optional */ }
    }

    return [...byId.values()];
}

const WIX_NEW_STAFF_URL = 'https://manage.wix.com/dashboard/f0548b42-7f52-447c-9076-45112f85765b/bookings/staff?referralInfo=search';

function monthRange(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(monthKey || '')) throw new Error('BAD_REQUEST: monthKey לא תקין.');
    const [y, m] = monthKey.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { fromKey: `${monthKey}-01`, toKey: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

/** Adds/subtracts days from a 'YYYY-MM-DD' key (plain calendar arithmetic, UTC). */
function shiftDateKey(dateKey, days) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Workshop typeIds (CMS `workshops` rows) whose serviceIds include a tufting Bookings service. */
async function loadTuftingTypeIdSet() {
    const { serviceIdToTypeId } = await loadWorkshopTypeMap();
    return new Set(Object.values(TUFTING_SERVICE_IDS).map(sid => serviceIdToTypeId[sid]).filter(Boolean));
}

/** Whether any tufting workshop appears on the board for this single date (paid or Bookings-scheduled). */
async function dateHasTuftingWorkshop(dateKey) {
    const [tuftingTypeIds, board] = await Promise.all([
        loadTuftingTypeIdSet(),
        buildBoard(dateKey, dateKey),
    ]);
    const day = board.days[dateKey];
    if (!day) return false;
    return Object.keys(day.types).some(id => tuftingTypeIds.has(id));
}

function mapEmployeeForAdmin(role, canSeeRates, canManageRoles, bookingStaffIdSet) {
    const staffId = refId(role.connectedStaff);
    return {
        id: role._id,
        displayName: role.displayName || '(ללא שם)',
        roleType: role.roleType || 'Employee',
        roleLabel: ROLE_TYPE_LABELS[role.roleType] || role.roleType || 'עובד/ת',
        active: role.active !== false,
        isTrainee: !!role.isTrainee,
        phone: role.phone || '',
        color: role.color || null,
        seniority: role.seniority || '',
        priorityRank: role.priorityRank ?? null,
        minShiftsPerWeek: role.minShiftsPerWeek ?? null,
        minShiftHours: role.minShiftHours ?? null,
        skillIds: refIds(role.skills),
        staffId,
        connectedStaffId: staffId,
        bookingsLinked: bookingStaffIdSet
            ? isConnectedStaffBookingsLinked(role.connectedStaff, bookingStaffIdSet)
            : undefined,
        ...(canSeeRates ? {
            rateStudio: role.rateStudio ?? null,
            rateInstruction: role.rateInstruction ?? null,
            rateWool: role.rateWool ?? null,
        } : {}),
        ...(canManageRoles ? {
            permissions: Object.fromEntries(PERMISSION_KEYS.map(k => [k, getRolePermissionValue(role, k)])),
        } : {}),
    };
}

// ---------------------------------------------------------------------------
// Read: full admin dataset for a month
// ---------------------------------------------------------------------------

export const getStaffAdminData = webMethod(Permissions.SiteMember, async (monthKey) => {
    const { role } = await assertEmployeeAccess('manageEmployeeSystem');
    const canSeeRates = getRolePermissionValue(role, 'manageRates');
    const canManageRoles = getRolePermissionValue(role, 'manageRoles');
    const { fromKey, toKey } = monthRange(monthKey);
    // Padded ±6 days so Sun–Sat weeks straddling the month boundary are
    // still counted correctly for the weekly-quota tracker below.
    const paddedFromKey = shiftDateKey(fromKey, -6);
    const paddedToKey = shiftDateKey(toKey, 6);

    const [board, settings, submissionsRaw, weeklySubsRaw, vacationsByEmployee, tuftingTypeIds] = await Promise.all([
        buildBoard(fromKey, toKey, { includeOffers: true }),
        loadSettings(),
        // All statuses (incl. REJECTED) so the tracker page shows the full picture;
        // board views and quota counts filter REJECTED out downstream.
        wixData.query('AvailabilitySubmissions')
            .eq('monthKey', monthKey)
            .limit(1000).find(SA).catch(() => ({ items: [] })),
        wixData.query('AvailabilitySubmissions')
            .ge('date', new Date(`${paddedFromKey}T00:00:00Z`))
            .le('date', new Date(`${paddedToKey}T23:59:59Z`))
            .ne('status', SUBMISSION_STATUS.REJECTED)
            .limit(1000).find(SA).catch(() => ({ items: [] })),
        loadVacationsOverlappingRangeByEmployee(fromKey, toKey),
        loadTuftingTypeIdSet(),
    ]);

    const weeklySubsByEmployee = {};
    for (const s of (weeklySubsRaw.items || [])) {
        if (!weeklySubsByEmployee[s.employeeId]) weeklySubsByEmployee[s.employeeId] = [];
        weeklySubsByEmployee[s.employeeId].push({ status: s.status, dateKey: toDateKey(s.date) });
    }

    const employees = Object.values(board.rolesById)
        .filter(r => getRolePermissionValue(r, 'submitAvailability'))
        .map(r => mapEmployeeForAdmin(r, canSeeRates, canManageRoles))
        .sort((a, b) => (a.priorityRank ?? 999) - (b.priorityRank ?? 999));

    const submissions = (submissionsRaw.items || []).map(s => {
        const date = toDateKey(s.date);
        const assignedType = Object.values(board.days[date]?.types || {})
            .find(t => t.assignedEmployeeIds.includes(s.employeeId));
        return {
            id: s._id,
            employeeId: s.employeeId,
            employeeName: board.rolesById[s.employeeId]?.displayName || '—',
            date,
            startTime: s.startTime || '',
            endTime: s.endTime || '',
            status: s.status,
            managerOverride: !!s.managerOverride,
            workshopTypeId: assignedType?.typeId || null,
            workshopName: assignedType?.name || null,
            workType: normalizeWorkType(s.workType),
        };
    });

    // Day coverage for heatmap/list views.
    const days = {};
    for (const [dateKey, day] of Object.entries(board.days)) {
        days[dateKey] = {
            hasWorkshops: day.hasWorkshops,
            hasTufting: Object.keys(day.types).some(id => tuftingTypeIds.has(id)),
            types: Object.values(day.types).map(t => ({
                typeId: t.typeId,
                name: t.name,
                adults: t.adults,
                children: t.children,
                required: t.required,
                filled: typeFilledCount(t),
                assignedEmployeeIds: t.assignedEmployeeIds,
                standbyCount: t.standbyQueue.length,
            })),
        };
    }

    // Submission tracker: weekly quota + Friday/Saturday compliance per employee.
    const tracker = employees.filter(e => e.active).map(e => {
        const empSubs = weeklySubsByEmployee[e.id] || [];
        const empVacations = vacationsByEmployee[e.id] || [];
        const quota = evaluateQuota(board.rolesById[e.id], settings, monthKey, empSubs, empVacations);
        const weekend = evaluateWeekendCompliance(board.rolesById[e.id], settings, monthKey, empSubs, empVacations);
        return {
            employeeId: e.id,
            name: e.displayName,
            phone: e.phone,
            required: quota.required,
            submitted: quota.submitted,
            met: quota.met,
            weeks: quota.weeks,
            weekend,
        };
    });

    const openOffers = (board.offers || [])
        .filter(o => o.status === OFFER_STATUS.PENDING || o.status === OFFER_STATUS.OPEN)
        .map(o => ({
            id: o._id,
            kind: o.kind,
            status: o.status,
            date: o.dateKey || toDateKey(o.date),
            workshopName: o.workshopName || '',
            employeeName: o.employeeId ? (board.rolesById[o.employeeId]?.displayName || '—') : null,
            expiresAt: o.expiresAt || null,
        }));

    const rules = Object.values(board.rules || {}).map(r => ({
        workshopTypeId: r.workshopTypeId,
        workshopName: board.typesById[r.workshopTypeId]?.name || 'סדנה',
        participantsPerInstructor: r.participantsPerInstructor,
        parentChildParticipantsPerInstructor: r.parentChildParticipantsPerInstructor,
        minInstructors: r.minInstructors,
    }));

    return {
        monthKey,
        permissions: {
            manageEmployeeSystem: getRolePermissionValue(role, 'manageEmployeeSystem'),
            viewTeamSchedule: getRolePermissionValue(role, 'viewTeamSchedule'),
            manageEmployees: getRolePermissionValue(role, 'manageEmployees'),
            manageRules: getRolePermissionValue(role, 'manageRules'),
            manageScheduling: getRolePermissionValue(role, 'manageScheduling'),
            manageRates: canSeeRates,
            manageTemplates: getRolePermissionValue(role, 'manageTemplates'),
            manageRoles: canManageRoles,
            editTimeEntries: getRolePermissionValue(role, 'editTimeEntries'),
        },
        employees,
        workshopTypes: Object.values(board.typesById),
        workTypes: WORK_TYPES.map(value => ({ value, label: WORK_TYPE_LABELS[value] })),
        roleTypes: ROLE_TYPES.map(rt => ({ value: rt, label: ROLE_TYPE_LABELS[rt] })),
        ...(canManageRoles ? {
            permissionKeys: PERMISSION_KEYS,
            permissionLabels: PERMISSION_LABELS,
            permissionGroups: PERMISSION_GROUPS,
        } : {}),
        days,
        submissions,
        tracker,
        openOffers,
        rules,
        settings: {
            deadlineDaysBeforeMonthEnd: settings.deadlineDaysBeforeMonthEnd,
            monthsAheadAllowed: settings.monthsAheadAllowed,
            defaultMinShiftsPerWeek: settings.defaultMinShiftsPerWeek,
            requiredFridaysPerMonth: settings.requiredFridaysPerMonth,
            requiredSaturdaysPerMonth: settings.requiredSaturdaysPerMonth,
            defaultMinShiftHours: settings.defaultMinShiftHours,
            defaultShiftStart: settings.defaultShiftStart,
            defaultShiftEnd: settings.defaultShiftEnd,
            bonusUnlockEnabled: settings.bonusUnlockEnabled,
            autoApproveShifts: settings.autoApproveShifts,
            blockedDates: settings.blockedDates,
            promotedDates: settings.promotedDates,
            holidays: settings.holidays,
            dayNotes: settings.dayNotes,
            sketchSewingDays: settings.sketchSewingDays,
        },
        serverNow: new Date().toISOString(),
    };
});

// ---------------------------------------------------------------------------
// Employee profile management
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = ['displayName', 'phone', 'color', 'seniority', 'isTrainee', 'active', 'minShiftsPerWeek', 'minShiftHours', 'priorityRank', 'roleType'];
const RATE_FIELDS = ['rateStudio', 'rateInstruction', 'rateWool'];

/** Normalize workshop multi-ref ids for a CMS write (strings only). */
function skillIdsForWrite(skillIds) {
    return (Array.isArray(skillIds) ? skillIds : [])
        .map(id => String(id || '').trim())
        .filter(Boolean);
}

/** Multi-reference fields must use replaceReferences — wixData.update ignores them. */
async function applyEmployeeSkills(roleId, skillIds) {
    await wixData.replaceReferences('Dashboard_Roles', 'skills', roleId, skillIdsForWrite(skillIds), SA);
}

/**
 * Merge a patch onto an existing CMS row.
 * Wix update() drops any property omitted from the item — so we must start from
 * the full existing row. Multi-ref `skills` is stripped (handled separately).
 */
function mergeRoleRowForUpdate(existing, patchRow) {
    const row = { ...existing, ...patchRow };
    delete row.skills;
    if (row.connectedStaff) row.connectedStaff = refId(row.connectedStaff) || row.connectedStaff;
    if (row.userId) row.userId = refId(row.userId) || row.userId;
    return row;
}

/** Build a partial Dashboard_Roles row — only touched scalar fields, never spread a full get(). */
function buildEmployeePatchRow(roleId, patch, { callerRole, permissions } = {}) {
    const row = { _id: roleId };
    for (const field of PROFILE_FIELDS) {
        if (patch[field] !== undefined) row[field] = patch[field];
    }
    if (patch.roleType !== undefined && !ROLE_TYPES.includes(patch.roleType)) {
        throw new Error('BAD_REQUEST: roleType לא תקין.');
    }
    if (RATE_FIELDS.some(f => patch[f] !== undefined)) {
        if (!getRolePermissionValue(callerRole, 'manageRates')) throw new Error('PERMISSION_DENIED:manageRates');
        for (const field of RATE_FIELDS) {
            if (patch[field] !== undefined) row[field] = patch[field];
        }
    }
    if (permissions && typeof permissions === 'object') {
        if (!getRolePermissionValue(callerRole, 'manageRoles')) throw new Error('PERMISSION_DENIED:manageRoles');
        for (const key of PERMISSION_KEYS) {
            if (permissions[key] !== undefined) row[key] = !!permissions[key];
        }
    }
    return row;
}

async function persistEmployeePatch(roleId, patch, { callerRole, permissions } = {}) {
    const existing = await wixData.get('Dashboard_Roles', roleId, SA).catch(() => null);
    if (!existing) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

    const patchRow = buildEmployeePatchRow(roleId, patch, { callerRole, permissions });
    const row = mergeRoleRowForUpdate(existing, patchRow);
    await wixData.update('Dashboard_Roles', row, SA);
    if (Array.isArray(patch.skillIds)) {
        await applyEmployeeSkills(roleId, patch.skillIds);
    }
}

/** Atomic employee save — profile, skills, rates, and optional permissions in one CMS write. */
export const saveEmployeeAdmin = webMethod(Permissions.SiteMember, async (roleId, patch, permissions) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    if (!roleId || !patch || typeof patch !== 'object') throw new Error('BAD_REQUEST: חסרים פרטים.');

    const exists = await wixData.get('Dashboard_Roles', roleId, SA).catch(() => null);
    if (!exists) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

    await persistEmployeePatch(roleId, patch, { callerRole: role, permissions });
    await publishSchedulingUpdate('employee-updated', { roleId });
    console.log(`[staffAdminService] saveEmployeeAdmin: ${roleId} by ${role._id}`, {
        skills: Array.isArray(patch.skillIds) ? skillIdsForWrite(patch.skillIds).length : 'unchanged',
    });
    return { ok: true };
});

/** Persists manual employee list order via priorityRank (1 = first). */
export const reorderEmployees = webMethod(Permissions.SiteMember, async (roleIds) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    if (!Array.isArray(roleIds) || !roleIds.length) {
        throw new Error('BAD_REQUEST: חסרה רשימת עובדים לסידור.');
    }
    const unique = [...new Set(roleIds.map(id => String(id || '').trim()).filter(Boolean))];
    await Promise.all(unique.map(async (roleId, index) => {
        const existing = await wixData.get('Dashboard_Roles', roleId, SA).catch(() => null);
        if (!existing) return;
        await wixData.update('Dashboard_Roles', mergeRoleRowForUpdate(existing, {
            _id: roleId,
            priorityRank: index + 1,
        }), SA);
    }));
    await publishSchedulingUpdate('employees-reordered', { count: unique.length });
    console.log(`[staffAdminService] reorderEmployees: ${unique.length} rows by ${role._id}`);
    return { ok: true, roleIds: unique };
});

export const updateEmployeeProfile = webMethod(Permissions.SiteMember, async (roleId, patch) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    if (!roleId || !patch || typeof patch !== 'object') throw new Error('BAD_REQUEST: חסרים פרטים.');

    const exists = await wixData.get('Dashboard_Roles', roleId, SA).catch(() => null);
    if (!exists) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

    await persistEmployeePatch(roleId, patch, { callerRole: role });
    await publishSchedulingUpdate('employee-updated', { roleId });
    console.log(`[staffAdminService] updateEmployeeProfile: ${roleId} by ${role._id}`);
    return { ok: true };
});

/** Updates granular permission flags on a Dashboard_Roles row. Gated by manageRoles. */
export const updateEmployeePermissions = webMethod(Permissions.SiteMember, async (roleId, permissions) => {
    const { role } = await assertEmployeeAccess('manageRoles');
    if (!roleId || !permissions || typeof permissions !== 'object') throw new Error('BAD_REQUEST: חסרים פרטים.');

    const exists = await wixData.get('Dashboard_Roles', roleId, SA).catch(() => null);
    if (!exists) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

    const patchRow = { _id: roleId };
    for (const key of PERMISSION_KEYS) {
        if (permissions[key] !== undefined) patchRow[key] = !!permissions[key];
    }
    const row = mergeRoleRowForUpdate(exists, patchRow);

    await wixData.update('Dashboard_Roles', row, SA);
    await publishSchedulingUpdate('employee-permissions-updated', { roleId });
    console.log(`[staffAdminService] updateEmployeePermissions: ${roleId} by ${role._id}`);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// Wix Bookings Staff — load, link, onboard
// ---------------------------------------------------------------------------

/**
 * Lists Wix Bookings staff member IDs for matching against Dashboard_Roles.connectedStaff.
 * Gated by manageEmployees.
 */
export const listBookingStaff = webMethod(Permissions.SiteMember, async () => {
    const { role: caller } = await assertEmployeeAccess('manageEmployees');
    const canSeeRates = getRolePermissionValue(caller, 'manageRates');
    const canManageRoles = getRolePermissionValue(caller, 'manageRoles');

    const [staffList, allRolesResult, linkedResult] = await Promise.all([
        loadAllBookingStaffMembers().catch((err) => {
            console.error('[staffAdminService] listBookingStaff query failed:', err?.message || err);
            throw new Error('LOAD_FAILED: לא ניתן לטעון את רשימת הצוות מ-Wix Bookings.');
        }),
        wixData.query('Dashboard_Roles').limit(1000).find(SA).catch(() => ({ items: [] })),
        wixData.query('Dashboard_Roles')
            .isNotEmpty('connectedStaff')
            .limit(1000).find(SA).catch(() => ({ items: [] })),
    ]);

    const bookingStaffIdSet = buildBookingStaffIdSet(staffList);

    const roleByStaffId = {};
    for (const r of (linkedResult.items || [])) {
        const staffId = refId(r.connectedStaff);
        if (staffId) roleByStaffId[staffId] = r;
    }

    const staffIds = staffList.map(s => s._id).filter(Boolean);
    const allEmployees = (allRolesResult.items || [])
        .map(r => mapEmployeeForAdmin(r, canSeeRates, canManageRoles, bookingStaffIdSet))
        .sort((a, b) => (a.priorityRank ?? 999) - (b.priorityRank ?? 999)
            || a.displayName.localeCompare(b.displayName, 'he'));

    return {
        staffIds,
        allEmployees,
        staff: staffList.map((s) => {
            const linkedRole = roleByStaffId[s._id];
            return {
                staffId: s._id,
                name: s.name || '',
                email: s.email || '',
                phone: s.phone || '',
                linked: !!linkedRole,
                roleId: linkedRole?._id || null,
            };
        }),
    };
});

/**
 * Links (or re-links) an existing Wix Bookings staff member to a
 * Dashboard_Roles profile. Staff-supplied fields (name/phone) seed the
 * defaults; the manager can override them via `patch`. roleType selection
 * applies ROLE_TYPE_PRESETS as the permission baseline — explicit permission
 * overrides in `patch.permissions` only take effect if the caller also holds
 * manageRoles, so a manageEmployees-only admin can onboard staff but not
 * grant sensitive access.
 */
export const linkEmployeeStaff = webMethod(Permissions.SiteMember, async (staffId, patch) => {
    const { role: caller } = await assertEmployeeAccess('manageEmployees');
    if (!staffId) throw new Error('BAD_REQUEST: חסר מזהה עובד/ת מ-Wix Bookings.');

    let staffInfo = null;
    try {
        const response = await queryStaffMembers({ filter: { _id: staffId }, cursorPaging: { limit: 1 } }, {});
        staffInfo = response?.staffMembers?.[0] || null;
    } catch (err) {
        console.warn('[staffAdminService] linkEmployeeStaff: could not fetch staff defaults:', err?.message || err);
    }

    if (patch?.roleId) {
        const targetRow = await wixData.get('Dashboard_Roles', patch.roleId, SA).catch(() => null);
        if (!targetRow) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

        const dup = await wixData.query('Dashboard_Roles')
            .eq('connectedStaff', staffId)
            .ne('_id', patch.roleId)
            .limit(1000).find(SA).catch(() => ({ items: [] }));
        if (dup.items?.some(r => r.active !== false)) {
            throw new Error('CONFLICT: העובד/ת הזה/ו כבר מחובר/ת לפרופיל פעיל אחר.');
        }

        const savedRow = mergeRoleRowForUpdate(targetRow, {
            connectedStaff: staffId,
            displayName: String(patch?.displayName || '').trim() || targetRow.displayName || staffInfo?.name || 'עובד/ת',
            phone: patch?.phone !== undefined ? patch.phone : (staffInfo?.phone || targetRow.phone || ''),
            userEmail: patch?.userEmail !== undefined ? patch.userEmail : (staffInfo?.email || targetRow.userEmail || null),
        });
        const saved = await wixData.update('Dashboard_Roles', savedRow, SA);
        await publishSchedulingUpdate('employee-linked', { roleId: saved._id, staffId });
        console.log(`[staffAdminService] linkEmployeeStaff: staff=${staffId} → existing role=${saved._id} by ${caller._id}`);
        return { ok: true, roleId: saved._id };
    }

    const roleType = ROLE_TYPES.includes(patch?.roleType) ? patch.roleType : 'Employee';
    const canManageRoles = getRolePermissionValue(caller, 'manageRoles');
    const permissionOverrides = canManageRoles && patch?.permissions && typeof patch.permissions === 'object'
        ? patch.permissions
        : {};
    const permissions = buildPermissionsFromPreset(roleType, permissionOverrides);

    const existing = await wixData.query('Dashboard_Roles')
        .eq('connectedStaff', staffId).limit(1).find(SA);
    const existingRow = existing.items?.[0] || null;
    if (existingRow && existingRow.active !== false) {
        throw new Error('CONFLICT: העובד/ת הזה/ו כבר מחובר/ת לפרופיל פעיל.');
    }

    // Prevent linking the same Wix member to a second active profile.
    if (patch?.userEmail) {
        const dupEmail = await wixData.query('Dashboard_Roles')
            .eq('userEmail', patch.userEmail).ne('active', false).limit(1).find(SA).catch(() => ({ items: [] }));
        if (dupEmail.items?.some(r => r._id !== existingRow?._id)) {
            throw new Error('CONFLICT: כתובת האימייל הזו מחוברת כבר לפרופיל פעיל אחר.');
        }
    }

    const displayName = String(patch?.displayName || '').trim() || staffInfo?.name || existingRow?.displayName || 'עובד/ת';
    const phone = patch?.phone !== undefined ? patch.phone : (staffInfo?.phone || existingRow?.phone || '');
    const userEmail = patch?.userEmail !== undefined ? patch.userEmail : (staffInfo?.email || existingRow?.userEmail || null);

    const baseRow = existingRow || { connectedStaff: staffId };
    const savedRow = {
        ...baseRow,
        connectedStaff: staffId,
        displayName,
        phone,
        userEmail,
        roleType,
        active: true,
        isTrainee: roleType === 'Trainee',
        color: patch?.color || baseRow.color || null,
        seniority: patch?.seniority || baseRow.seniority || '',
        priorityRank: patch?.priorityRank ?? baseRow.priorityRank ?? null,
        minShiftsPerWeek: patch?.minShiftsPerWeek ?? baseRow.minShiftsPerWeek ?? null,
        minShiftHours: patch?.minShiftHours ?? baseRow.minShiftHours ?? null,
        ...permissions,
    };

    const saved = existingRow
        ? await wixData.update('Dashboard_Roles', savedRow, SA)
        : await wixData.insert('Dashboard_Roles', savedRow, SA);

    await publishSchedulingUpdate('employee-linked', { roleId: saved._id, staffId });
    console.log(`[staffAdminService] linkEmployeeStaff: staff=${staffId} role=${saved._id} by ${caller._id}`);
    return { ok: true, roleId: saved._id };
});

// ---------------------------------------------------------------------------
// Scheduling rules + day flags + holidays
// ---------------------------------------------------------------------------

export const updateSchedulingRule = webMethod(Permissions.SiteMember, async (workshopTypeId, patch) => {
    const { role } = await assertEmployeeAccess('manageRules');
    if (!workshopTypeId) throw new Error('BAD_REQUEST: חסר workshopTypeId.');

    const num = (v) => (Number(v) > 0 ? Number(v) : undefined);
    const fields = {
        participantsPerInstructor: num(patch?.participantsPerInstructor),
        parentChildParticipantsPerInstructor: num(patch?.parentChildParticipantsPerInstructor),
        minInstructors: num(patch?.minInstructors),
    };

    const existing = await wixData.query('SchedulingRules')
        .eq('workshopTypeId', workshopTypeId).limit(1).find(SA).catch(() => ({ items: [] }));

    if (existing.items?.[0]) {
        const row = existing.items[0];
        for (const [k, v] of Object.entries(fields)) if (v !== undefined) row[k] = v;
        await wixData.update('SchedulingRules', row, SA);
    } else {
        const { typesById } = await loadWorkshopTypeMap();
        await wixData.insert('SchedulingRules', {
            workshopTypeId,
            workshopName: typesById[workshopTypeId]?.name || 'סדנה',
            participantsPerInstructor: fields.participantsPerInstructor || 8,
            parentChildParticipantsPerInstructor: fields.parentChildParticipantsPerInstructor || 6,
            minInstructors: fields.minInstructors || 1,
            active: true,
        }, SA);
    }
    await publishSchedulingUpdate('rules-updated', { workshopTypeId });
    console.log(`[staffAdminService] updateSchedulingRule: ${workshopTypeId} by ${role._id}`);
    return { ok: true };
});

async function updateSettingsList(listField, dateKey, on) {
    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    let list = [];
    try { list = JSON.parse(row[listField] || '[]'); } catch (_) { list = []; }
    if (!Array.isArray(list)) list = [];

    const has = list.includes(dateKey);
    if (on && !has) list.push(dateKey);
    if (!on && has) list = list.filter(d => d !== dateKey);

    await wixData.update('AvailabilitySettings', { ...row, [listField]: JSON.stringify(list.sort()) }, SA);
}

/** Blocks/unblocks or promotes/unpromotes a day for submissions. */
export const updateDayFlags = webMethod(Permissions.SiteMember, async (dateKey, flags) => {
    const { role } = await assertEmployeeAccess('manageRules');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw new Error('BAD_REQUEST: תאריך לא תקין.');

    if (flags?.blocked !== undefined) await updateSettingsList('blockedDates', dateKey, !!flags.blocked);
    if (flags?.promoted !== undefined) await updateSettingsList('promotedDates', dateKey, !!flags.promoted);

    await publishSchedulingUpdate('day-flags-updated', { dateKey });
    console.log(`[staffAdminService] updateDayFlags: ${dateKey} ${JSON.stringify(flags)} by ${role._id}`);
    return { ok: true };
});

const HOLIDAY_MODES = ['', 'CLOSED', 'SHORT'];

export const updateHolidays = webMethod(Permissions.SiteMember, async (holidays) => {
    const { role } = await assertEmployeeAccess('manageRules');
    const clean = (Array.isArray(holidays) ? holidays : [])
        .filter(h => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date))
        .map(h => ({
            date: h.date,
            name: String(h.name || '').slice(0, 80),
            hebcalId: String(h.hebcalId || ''),
            mode: HOLIDAY_MODES.includes(h.mode) ? h.mode : '',
            shortStart: /^\d{2}:\d{2}$/.test(h.shortStart || '') ? h.shortStart : '',
            shortEnd: /^\d{2}:\d{2}$/.test(h.shortEnd || '') ? h.shortEnd : '',
        }));

    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    await wixData.update('AvailabilitySettings', { ...row, holidays: JSON.stringify(clean) }, SA);
    await publishSchedulingUpdate('holidays-updated', {});
    console.log(`[staffAdminService] updateHolidays: ${clean.length} entries by ${role._id}`);
    return { ok: true };
});

/** Sets a single date's holiday mode (CLOSED/SHORT/regular) + short-day hours; used from the day-detail panel. */
export const setHolidayMode = webMethod(Permissions.SiteMember, async (dateKey, mode, shortStart, shortEnd) => {
    const { role } = await assertEmployeeAccess('manageRules');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw new Error('BAD_REQUEST: תאריך לא תקין.');
    const cleanMode = HOLIDAY_MODES.includes(mode) ? mode : '';
    const cleanStart = /^\d{2}:\d{2}$/.test(shortStart || '') ? shortStart : '';
    const cleanEnd = /^\d{2}:\d{2}$/.test(shortEnd || '') ? shortEnd : '';

    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    let list = [];
    try { const parsed = JSON.parse(row.holidays || '[]'); if (Array.isArray(parsed)) list = parsed; } catch (_) { list = []; }
    const idx = list.findIndex(h => h?.date === dateKey);
    if (idx >= 0) {
        list[idx] = { ...list[idx], mode: cleanMode, shortStart: cleanStart, shortEnd: cleanEnd };
    } else {
        // Manager can also set a mode on a plain (non-holiday) date, e.g. an
        // ad-hoc closure day, without it being a Hebcal-imported holiday.
        list.push({ date: dateKey, name: '', hebcalId: '', mode: cleanMode, shortStart: cleanStart, shortEnd: cleanEnd });
    }

    await wixData.update('AvailabilitySettings', { ...row, holidays: JSON.stringify(list) }, SA);
    await publishSchedulingUpdate('holidays-updated', { dateKey });
    console.log(`[staffAdminService] setHolidayMode: ${dateKey} -> ${cleanMode || 'regular'} by ${role._id}`);
    return { ok: true };
});

/** Manual "sync now" button in admin — fetches Hebcal for a given year (default: current). */
export const syncHolidaysNow = webMethod(Permissions.SiteMember, async (year) => {
    const { role } = await assertEmployeeAccess('manageRules');
    const result = await syncHebcalHolidays(year);
    console.log(`[staffAdminService] syncHolidaysNow: year=${result.year} by ${role._id}`);
    return result;
});

/** Sets (or clears, when message is empty) a manager note on a calendar day. No new CMS — stored as a JSON map on AvailabilitySettings.dayNotes. */
export const setDayNote = webMethod(Permissions.SiteMember, async (dateKey, message) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw new Error('BAD_REQUEST: תאריך לא תקין.');
    const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 500) : '';

    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    let notes = {};
    try { const parsed = JSON.parse(row.dayNotes || '{}'); if (parsed && typeof parsed === 'object') notes = parsed; } catch (_) { notes = {}; }

    if (cleanMessage) {
        notes[dateKey] = { message: cleanMessage, updatedBy: role.displayName || '', updatedAt: new Date().toISOString() };
    } else {
        delete notes[dateKey];
    }

    await wixData.update('AvailabilitySettings', { ...row, dayNotes: JSON.stringify(notes) }, SA);
    await publishSchedulingUpdate('day-note-updated', { dateKey });
    console.log(`[staffAdminService] setDayNote: ${dateKey} ${cleanMessage ? 'set' : 'cleared'} by ${role._id}`);
    return { ok: true };
});

/**
 * Defines (or updates) a "sketch sewing" duty window on a calendar day —
 * visible only to employees holding the sketchSewingSkill flag. No new CMS —
 * stored as a JSON map on AvailabilitySettings.sketchSewingDays.
 *
 * If a tufting workshop appears on the board for that date and the caller
 * hasn't confirmed the overlap yet, returns { ok: false, needsConfirm: true }
 * without writing anything — the admin UI must re-call with confirmOverlap=true.
 */
export const saveSketchSewingDay = webMethod(Permissions.SiteMember, async (dateKey, startTime, endTime, confirmOverlap) => {
    const { role } = await assertEmployeeAccess('manageRules');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw new Error('BAD_REQUEST: תאריך לא תקין.');
    if (!/^\d{2}:\d{2}$/.test(startTime || '') || !/^\d{2}:\d{2}$/.test(endTime || '')) {
        throw new Error('BAD_REQUEST: שעת התחלה/סיום לא תקינה.');
    }
    if (startTime >= endTime) throw new Error('BAD_REQUEST: שעת ההתחלה חייבת להיות לפני שעת הסיום.');

    const hasTufting = await dateHasTuftingWorkshop(dateKey);
    if (hasTufting && !confirmOverlap) {
        return { ok: false, needsConfirm: true };
    }

    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    let days = {};
    try { const parsed = JSON.parse(row.sketchSewingDays || '{}'); if (parsed && typeof parsed === 'object') days = parsed; } catch (_) { days = {}; }

    days[dateKey] = {
        startTime,
        endTime,
        confirmedOverlap: !!hasTufting,
        updatedBy: role.displayName || '',
        updatedAt: new Date().toISOString(),
    };

    await wixData.update('AvailabilitySettings', { ...row, sketchSewingDays: JSON.stringify(days) }, SA);
    await publishSchedulingUpdate('sketch-duty-updated', { dateKey });
    console.log(`[staffAdminService] saveSketchSewingDay: ${dateKey} ${startTime}-${endTime} by ${role._id}`);
    return { ok: true };
});

/** Removes a "sketch sewing" duty day. */
export const deleteSketchSewingDay = webMethod(Permissions.SiteMember, async (dateKey) => {
    const { role } = await assertEmployeeAccess('manageRules');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw new Error('BAD_REQUEST: תאריך לא תקין.');

    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    let days = {};
    try { const parsed = JSON.parse(row.sketchSewingDays || '{}'); if (parsed && typeof parsed === 'object') days = parsed; } catch (_) { days = {}; }
    delete days[dateKey];

    await wixData.update('AvailabilitySettings', { ...row, sketchSewingDays: JSON.stringify(days) }, SA);
    await publishSchedulingUpdate('sketch-duty-updated', { dateKey });
    console.log(`[staffAdminService] deleteSketchSewingDay: ${dateKey} by ${role._id}`);
    return { ok: true };
});

export const updateAvailabilitySettings = webMethod(Permissions.SiteMember, async (patch) => {
    const { role } = await assertEmployeeAccess('manageRules');
    if (!patch || typeof patch !== 'object') throw new Error('BAD_REQUEST: חסרות הגדרות.');

    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    const updated = { ...row };
    const positiveNumberFields = [
        'deadlineDaysBeforeMonthEnd',
        'monthsAheadAllowed',
        'defaultMinShiftsPerWeek',
        'defaultMinShiftHours',
    ];
    for (const field of positiveNumberFields) {
        if (patch[field] === undefined) continue;
        const value = Number(patch[field]);
        if (!Number.isFinite(value) || value <= 0) throw new Error('BAD_REQUEST: ערך מספרי לא תקין.');
        updated[field] = value;
    }
    const nonNegativeNumberFields = ['requiredFridaysPerMonth', 'requiredSaturdaysPerMonth'];
    for (const field of nonNegativeNumberFields) {
        if (patch[field] === undefined) continue;
        const value = Number(patch[field]);
        if (!Number.isFinite(value) || value < 0) throw new Error('BAD_REQUEST: ערך מספרי לא תקין.');
        updated[field] = value;
    }
    for (const field of ['defaultShiftStart', 'defaultShiftEnd']) {
        if (patch[field] === undefined) continue;
        const value = String(patch[field] || '');
        if (!/^\d{2}:\d{2}$/.test(value)) throw new Error('BAD_REQUEST: שעה לא תקינה.');
        updated[field] = value;
    }
    if (patch.bonusUnlockEnabled !== undefined) updated.bonusUnlockEnabled = !!patch.bonusUnlockEnabled;
    if (patch.autoApproveShifts !== undefined) updated.autoApproveShifts = !!patch.autoApproveShifts;

    await wixData.update('AvailabilitySettings', updated, SA);
    await publishSchedulingUpdate('settings-updated', {});
    console.log(`[staffAdminService] updateAvailabilitySettings by ${role._id}`);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// Employee vacations (Friday/Saturday requirement exemptions)
// ---------------------------------------------------------------------------

export const listVacations = webMethod(Permissions.SiteMember, async () => {
    await assertEmployeeAccess('manageEmployees');
    const [vacations, rolesResult] = await Promise.all([
        listAllVacations(),
        wixData.query('Dashboard_Roles').limit(1000).find(SA).catch(() => ({ items: [] })),
    ]);
    const nameById = {};
    for (const r of (rolesResult.items || [])) nameById[r._id] = r.displayName || '(ללא שם)';
    return vacations.map(v => ({ ...v, employeeName: nameById[v.employeeId] || '—' }));
});

export const saveEmployeeVacation = webMethod(Permissions.SiteMember, async (vacation) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    const saved = await saveVacationRow(vacation);
    await publishSchedulingUpdate('vacation-updated', { employeeId: saved.employeeId });
    console.log(`[staffAdminService] saveEmployeeVacation: ${saved.id} by ${role._id}`);
    return { ok: true, vacation: saved };
});

export const deleteEmployeeVacation = webMethod(Permissions.SiteMember, async (vacationId) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    await deleteVacationRow(vacationId);
    await publishSchedulingUpdate('vacation-updated', {});
    console.log(`[staffAdminService] deleteEmployeeVacation: ${vacationId} by ${role._id}`);
    return { ok: true };
});

export const approveEmployeeVacation = webMethod(Permissions.SiteMember, async (vacationId, managerComment) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    const result = await decideVacationRequest(vacationId, true, managerComment);
    await publishSchedulingUpdate('vacation-updated', { employeeId: result.vacation?.employeeId });
    console.log(`[staffAdminService] approveEmployeeVacation: ${vacationId} by ${role._id}`);
    return result;
});

export const rejectEmployeeVacation = webMethod(Permissions.SiteMember, async (vacationId, managerComment) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    const result = await decideVacationRequest(vacationId, false, managerComment);
    await publishSchedulingUpdate('vacation-updated', { employeeId: result.vacation?.employeeId });
    console.log(`[staffAdminService] rejectEmployeeVacation: ${vacationId} by ${role._id}`);
    return result;
});

// ---------------------------------------------------------------------------
// WhatsApp templates
// ---------------------------------------------------------------------------

export const getStaffTemplates = webMethod(Permissions.SiteMember, async () => {
    await assertEmployeeAccess('manageTemplates');
    const result = await wixData.query('WhatsApp_Templates').ascending('title').limit(1000).find(SA);
    return (result.items || []).map(t => mapTemplateRow(t, EMPLOYEE_ACTION_KEYS));
});

export const saveStaffTemplate = webMethod(Permissions.SiteMember, async (template) => {
    await assertEmployeeAccess('manageTemplates');
    const title = String(template?.title || '').trim().slice(0, 120);
    const body = String(template?.body || '').trim();
    if (!title || !body) throw new Error('BAD_REQUEST: יש להזין כותרת ותוכן.');

    const use = assertTemplateUse(template?.use, TEMPLATE_USE.EMPLOYEES);
    const data = { title, messageBody: body, use };
    let saved;
    if (template?.id) {
        const existing = await wixData.get('WhatsApp_Templates', template.id, SA).catch(() => null);
        if (!existing) throw new Error('NOT_FOUND: התבנית לא נמצאה.');
        // actionKey is permanent once set — never let a client-side save clear it.
        saved = await wixData.update('WhatsApp_Templates', { ...existing, ...data, actionKey: existing.actionKey || null }, SA);
    } else {
        saved = await wixData.insert('WhatsApp_Templates', { ...data, isSystem: false }, SA);
    }
    return mapTemplateRow(saved, EMPLOYEE_ACTION_KEYS);
});

export const deleteStaffTemplate = webMethod(Permissions.SiteMember, async (templateId) => {
    await assertEmployeeAccess('manageTemplates');
    const existing = await wixData.get('WhatsApp_Templates', templateId, SA).catch(() => null);
    if (!existing) throw new Error('NOT_FOUND: התבנית לא נמצאה.');
    if (existing.isSystem) throw new Error('BAD_REQUEST: לא ניתן למחוק תבנית מערכת.');
    await wixData.remove('WhatsApp_Templates', templateId, SA);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// WhatsApp nudge
// ---------------------------------------------------------------------------

export const sendAvailabilityNudge = webMethod(Permissions.SiteMember, async (roleIds, monthKey) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    const ids = (Array.isArray(roleIds) ? roleIds : [roleIds]).filter(Boolean);
    if (!ids.length) throw new Error('BAD_REQUEST: לא נבחרו עובדים.');

    let sent = 0;
    const failures = [];
    for (const id of ids) {
        const target = await wixData.get('Dashboard_Roles', id, SA).catch(() => null);
        if (!target?.phone) { failures.push({ id, reason: 'אין מספר טלפון' }); continue; }
        try {
            await sendEmployeeTemplateMessage('employee_availability_nudge', target.phone, {
                displayName: target.displayName || '',
                monthKey: monthKey || 'הקרוב',
                portalLink: PORTAL_URL,
            });
            sent++;
        } catch (err) {
            failures.push({ id, reason: err?.message || 'שגיאת שליחה' });
        }
    }
    console.log(`[staffAdminService] sendAvailabilityNudge: sent=${sent} failures=${failures.length} by ${role._id}`);
    return { ok: true, sent, failures };
});

// ---------------------------------------------------------------------------
// Manual assignment control
// ---------------------------------------------------------------------------

/**
 * Manager assigns an employee to a day — zero, one, or several workshops at
 * once (each becomes its own ShiftAssignments row on the shared submission),
 * plus a single work-type ("מתלה": סדנה/פתיחה/קיפול) for that day. An empty
 * workshopTypeIds array is valid — used for days with no workshops, where the
 * manager still wants to schedule the employee (e.g. for opening/closing).
 */
export const manualAssign = webMethod(Permissions.SiteMember, async (dateKey, workshopTypeIds, employeeId, workType) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '') || !employeeId) {
        throw new Error('BAD_REQUEST: חסרים פרטים לשיבוץ.');
    }
    const typeIds = Array.from(new Set(
        (Array.isArray(workshopTypeIds) ? workshopTypeIds : (workshopTypeIds ? [workshopTypeIds] : []))
            .filter(Boolean)
    ));

    const target = await wixData.get('Dashboard_Roles', employeeId, SA).catch(() => null);
    if (!target) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

    const approvedVacations = await loadVacationsForEmployee(employeeId);
    const onVacation = approvedVacations.some(v => v.startDate <= dateKey && dateKey <= v.endDate);
    if (onVacation) {
        throw new Error(`CONFLICT: לא ניתן לשבץ את ${target.displayName || 'העובד/ת'} בתאריך זה — יש לו/ה חופשה מאושרת ביום זה.`);
    }

    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const alreadyAssigned = typeIds.filter(id => board.days[dateKey]?.types?.[id]?.assignedEmployeeIds.includes(employeeId));
    const toAssign = typeIds.filter(id => !alreadyAssigned.includes(id));
    if (typeIds.length && !toAssign.length) {
        throw new Error('CONFLICT: העובד/ת כבר משובץ/ת לכל הסדנאות שנבחרו ביום זה.');
    }

    const settings = await loadSettings();
    const normalizedWorkType = normalizeWorkType(workType);
    const existing = await wixData.query('AvailabilitySubmissions')
        .eq('employeeId', employeeId)
        .between('date', new Date(`${dateKey}T00:00:00Z`), new Date(`${dateKey}T23:59:59Z`))
        .limit(1).find(SA).catch(() => ({ items: [] }));

    let submission = existing.items?.[0] || null;
    if (submission) {
        if (submission.status !== SUBMISSION_STATUS.SCHEDULED || normalizeWorkType(submission.workType) !== normalizedWorkType) {
            submission = await wixData.update('AvailabilitySubmissions', {
                ...submission,
                status: SUBMISSION_STATUS.SCHEDULED,
                managerOverride: true,
                workType: normalizedWorkType,
            }, SA);
        }
    } else {
        submission = await wixData.insert('AvailabilitySubmissions', {
            employeeId,
            staffId: refId(target.connectedStaff),
            date: new Date(`${dateKey}T12:00:00Z`),
            startTime: settings.defaultShiftStart,
            endTime: settings.defaultShiftEnd,
            status: SUBMISSION_STATUS.SCHEDULED,
            monthKey: dateKey.slice(0, 7),
            managerOverride: true,
            workType: normalizedWorkType,
            submittedByName: role.displayName || 'מנהל/ת',
            notes: 'שיבוץ ידני על ידי מנהל/ת',
        }, SA);
    }

    const { typesById } = await loadWorkshopTypeMap();
    for (const workshopTypeId of toAssign) {
        await wixData.insert('ShiftAssignments', {
            dateKey,
            date: new Date(`${dateKey}T12:00:00Z`),
            monthKey: dateKey.slice(0, 7),
            workshopTypeId,
            workshopName: typesById[workshopTypeId]?.name || 'סדנה',
            employeeId,
            submissionId: submission._id,
            status: ASSIGNMENT_STATUS.APPROVED,
            source: 'MANUAL',
            workType: normalizedWorkType,
        }, SA);
    }

    await publishSchedulingUpdate('manual-assign', { dateKey });

    // Schedule-change notification (Module D)
    if (target.phone) {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
        const names = toAssign.map(id => typesById[id]?.name || 'סדנה');
        const detail = names.length ? `בסדנת ${names.join(', ')} ` : '';
        await sendEmployeeTemplateMessage('employee_shift_assigned', target.phone, {
            displayName: target.displayName || '',
            detail,
            dow,
            date: `${d}.${m}.${y}`,
            portalLink: PORTAL_URL,
        }).catch(err => console.error('[staffAdminService] assign notify failed:', err?.message || err));
    }

    console.log(`[staffAdminService] manualAssign: ${employeeId} → ${dateKey}/[${toAssign.join(',')}] workType=${normalizedWorkType} by ${role._id}`);
    return { ok: true, assigned: toAssign.length, skipped: alreadyAssigned.length };
});

export const cancelAssignment = webMethod(Permissions.SiteMember, async (dateKey, workshopTypeId, employeeId) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    const result = await wixData.query('ShiftAssignments')
        .eq('dateKey', dateKey)
        .eq('workshopTypeId', workshopTypeId)
        .eq('employeeId', employeeId)
        .ne('status', ASSIGNMENT_STATUS.CANCELLED)
        .limit(10).find(SA).catch(() => ({ items: [] }));
    if (!result.items?.length) throw new Error('NOT_FOUND: השיבוץ לא נמצא.');

    for (const a of result.items) {
        await wixData.update('ShiftAssignments', { ...a, status: ASSIGNMENT_STATUS.CANCELLED }, SA);
        if (a.submissionId) {
            const sub = await wixData.get('AvailabilitySubmissions', a.submissionId, SA).catch(() => null);
            if (sub && sub.status === SUBMISSION_STATUS.SCHEDULED) {
                await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SUBMITTED }, SA);
            }
        }
    }

    // Schedule-change notification (Module D)
    const target = await wixData.get('Dashboard_Roles', employeeId, SA).catch(() => null);
    if (target?.phone) {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
        await sendEmployeeTemplateMessage('employee_shift_cancelled', target.phone, {
            displayName: target.displayName || '',
            dow,
            date: `${d}.${m}.${y}`,
            portalLink: PORTAL_URL,
        }).catch(err => console.error('[staffAdminService] cancel notify failed:', err?.message || err));
    }

    // Freed capacity: rerun the engine for that day (auto-fill / offers / open call).
    await runScheduling(dateKey, dateKey);
    console.log(`[staffAdminService] cancelAssignment: ${employeeId} @ ${dateKey}/${workshopTypeId} by ${role._id}`);
    return { ok: true };
});

async function notifyShiftChange(target, actionKey, vars) {
    if (!target?.phone) return;
    await sendEmployeeTemplateMessage(actionKey, target.phone, vars)
        .catch(err => console.error('[staffAdminService] notify failed:', err?.message || err));
}

async function cancelAssignmentsForSubmission(submissionId) {
    const result = await wixData.query('ShiftAssignments')
        .eq('submissionId', submissionId)
        .ne('status', ASSIGNMENT_STATUS.CANCELLED)
        .limit(20)
        .find(SA)
        .catch(() => ({ items: [] }));
    for (const a of (result.items || [])) {
        await wixData.update('ShiftAssignments', { ...a, status: ASSIGNMENT_STATUS.CANCELLED }, SA);
    }
}

/** Manager approves a pending submission and optionally sets workshop + work type. */
export const approveSubmission = webMethod(Permissions.SiteMember, async (submissionId, workshopTypeId, workType) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    if (!submissionId) throw new Error('BAD_REQUEST: חסר מזהה הגשה.');

    const submission = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    if (!submission) throw new Error('NOT_FOUND: ההגשה לא נמצאה.');
    if (submission.status === SUBMISSION_STATUS.REJECTED) {
        throw new Error('CONFLICT: לא ניתן לאשר הגשה שנדחתה.');
    }

    const dateKey = toDateKey(submission.date);
    const employeeId = submission.employeeId;
    const normalizedWorkType = normalizeWorkType(workType);

    let typeId = workshopTypeId;
    if (!typeId) {
        const board = await buildBoard(dateKey, dateKey, { consistent: true });
        const dayTypeIds = Object.keys(board.days[dateKey]?.types || {});
        if (dayTypeIds.length === 1) typeId = dayTypeIds[0];
        else throw new Error('BAD_REQUEST: יש לבחור סוג סדנה.');
    }

    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const t = board.days[dateKey]?.types?.[typeId];
    if (t?.assignedEmployeeIds.includes(employeeId)) {
        await wixData.update('AvailabilitySubmissions', {
            ...submission,
            status: SUBMISSION_STATUS.SCHEDULED,
            managerOverride: true,
            workType: normalizedWorkType,
        }, SA);
        const active = await wixData.query('ShiftAssignments')
            .eq('submissionId', submissionId)
            .ne('status', ASSIGNMENT_STATUS.CANCELLED)
            .limit(5)
            .find(SA)
            .catch(() => ({ items: [] }));
        for (const a of (active.items || [])) {
            await wixData.update('ShiftAssignments', { ...a, workType: normalizedWorkType }, SA);
        }
        return { ok: true };
    }

    const conflict = await wixData.query('ShiftAssignments')
        .eq('dateKey', dateKey)
        .eq('employeeId', employeeId)
        .ne('status', ASSIGNMENT_STATUS.CANCELLED)
        .limit(5)
        .find(SA)
        .catch(() => ({ items: [] }));
    if (conflict.items?.length) {
        throw new Error('CONFLICT: העובד/ת כבר משובץ/ת ליום זה.');
    }

    const updated = await wixData.update('AvailabilitySubmissions', {
        ...submission,
        status: SUBMISSION_STATUS.SCHEDULED,
        managerOverride: true,
        workType: normalizedWorkType,
    }, SA);

    const { typesById } = await loadWorkshopTypeMap();
    await wixData.insert('ShiftAssignments', {
        dateKey,
        date: new Date(`${dateKey}T12:00:00Z`),
        monthKey: dateKey.slice(0, 7),
        workshopTypeId: typeId,
        workshopName: typesById[typeId]?.name || 'סדנה',
        employeeId,
        submissionId: updated._id,
        status: ASSIGNMENT_STATUS.APPROVED,
        source: 'MANUAL',
        workType: normalizedWorkType,
    }, SA);

    await publishSchedulingUpdate('approve-submission', { submissionId, dateKey });

    const target = await wixData.get('Dashboard_Roles', employeeId, SA).catch(() => null);
    if (target?.phone) {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
        const duty = WORK_TYPE_LABELS[normalizedWorkType] || WORK_TYPE_LABELS[DEFAULT_WORK_TYPE];
        await notifyShiftChange(target, 'employee_submission_approved', {
            displayName: target.displayName || '',
            dow,
            date: `${d}.${m}.${y}`,
            duty,
            portalLink: PORTAL_URL,
        });
    }

    console.log(`[staffAdminService] approveSubmission: ${submissionId} by ${role._id}`);
    return { ok: true };
});

/** Manager rejects/cancels a submission from the tracker list. */
export const rejectSubmission = webMethod(Permissions.SiteMember, async (submissionId) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    if (!submissionId) throw new Error('BAD_REQUEST: חסר מזהה הגשה.');

    const submission = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    if (!submission) throw new Error('NOT_FOUND: ההגשה לא נמצאה.');
    if (submission.status === SUBMISSION_STATUS.REJECTED) return { ok: true };

    const dateKey = toDateKey(submission.date);
    await wixData.update('AvailabilitySubmissions', {
        ...submission,
        status: SUBMISSION_STATUS.REJECTED,
        managerOverride: true,
    }, SA);
    await cancelAssignmentsForSubmission(submissionId);
    await runScheduling(dateKey, dateKey);
    await publishSchedulingUpdate('reject-submission', { submissionId, dateKey });

    const target = await wixData.get('Dashboard_Roles', submission.employeeId, SA).catch(() => null);
    if (target?.phone) {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
        await notifyShiftChange(target, 'employee_submission_rejected', {
            displayName: target.displayName || '',
            dow,
            date: `${d}.${m}.${y}`,
            portalLink: PORTAL_URL,
        });
    }

    console.log(`[staffAdminService] rejectSubmission: ${submissionId} by ${role._id}`);
    return { ok: true };
});

/** Updates work type on an approved/scheduled submission. */
export const updateSubmissionWorkType = webMethod(Permissions.SiteMember, async (submissionId, workType) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    if (!submissionId) throw new Error('BAD_REQUEST: חסר מזהה הגשה.');

    const submission = await wixData.get('AvailabilitySubmissions', submissionId, SA).catch(() => null);
    if (!submission) throw new Error('NOT_FOUND: ההגשה לא נמצאה.');
    if (submission.status === SUBMISSION_STATUS.REJECTED) {
        throw new Error('CONFLICT: לא ניתן לעדכן הגשה שנדחתה.');
    }

    const normalizedWorkType = normalizeWorkType(workType);
    await wixData.update('AvailabilitySubmissions', { ...submission, workType: normalizedWorkType }, SA);

    const active = await wixData.query('ShiftAssignments')
        .eq('submissionId', submissionId)
        .ne('status', ASSIGNMENT_STATUS.CANCELLED)
        .limit(10)
        .find(SA)
        .catch(() => ({ items: [] }));
    for (const a of (active.items || [])) {
        await wixData.update('ShiftAssignments', { ...a, workType: normalizedWorkType }, SA);
    }

    await publishSchedulingUpdate('work-type-update', { submissionId });
    console.log(`[staffAdminService] updateSubmissionWorkType: ${submissionId} → ${normalizedWorkType} by ${role._id}`);
    return { ok: true };
});
