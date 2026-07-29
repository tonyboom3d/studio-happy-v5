/**
 * Staff admin web methods (Module B) — powers the admin tab in the
 * employee-portal CE. Strictly separate from dashboardService (order dashboard).
 *
 * Permission gates (staffRoles.js): viewTeamSchedule (read), manageEmployees,
 * manageRules, manageScheduling, manageRates. Rates are stripped from
 * payloads unless the caller holds manageRates.
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import {
    assertEmployeeAccess,
    getRolePermissionValue,
    refId,
    refIds,
    ROLE_TYPE_LABELS,
    ROLE_TYPES,
} from 'backend/staffRoles.js';
import { SUBMISSION_STATUS, toDateKey, getRequiredShifts } from 'backend/availabilityRules.js';
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
import { sendGreenApiWhatsApp } from 'backend/whatsappService.jsw';

const SA = { suppressAuth: true };

function monthRange(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(monthKey || '')) throw new Error('BAD_REQUEST: monthKey לא תקין.');
    const [y, m] = monthKey.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { fromKey: `${monthKey}-01`, toKey: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

function mapEmployeeForAdmin(role, canSeeRates) {
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
        minShiftsPerMonth: role.minShiftsPerMonth ?? null,
        minShiftHours: role.minShiftHours ?? null,
        skillIds: refIds(role.skills),
        ...(canSeeRates ? {
            rateStudio: role.rateStudio ?? null,
            rateInstruction: role.rateInstruction ?? null,
            rateWool: role.rateWool ?? null,
        } : {}),
    };
}

// ---------------------------------------------------------------------------
// Read: full admin dataset for a month
// ---------------------------------------------------------------------------

export const getStaffAdminData = webMethod(Permissions.SiteMember, async (monthKey) => {
    const { role } = await assertEmployeeAccess('viewTeamSchedule');
    const canSeeRates = getRolePermissionValue(role, 'manageRates');
    const { fromKey, toKey } = monthRange(monthKey);

    const [board, settings, submissionsRaw] = await Promise.all([
        buildBoard(fromKey, toKey, { includeOffers: true }),
        loadSettings(),
        wixData.query('AvailabilitySubmissions')
            .ne('status', SUBMISSION_STATUS.REJECTED)
            .eq('monthKey', monthKey)
            .limit(1000).find(SA).catch(() => ({ items: [] })),
    ]);

    const employees = Object.values(board.rolesById)
        .filter(r => getRolePermissionValue(r, 'submitAvailability'))
        .map(r => mapEmployeeForAdmin(r, canSeeRates))
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
        };
    });

    // Day coverage for heatmap/list views.
    const days = {};
    for (const [dateKey, day] of Object.entries(board.days)) {
        days[dateKey] = {
            hasWorkshops: day.hasWorkshops,
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

    // Submission tracker: submitted vs required per employee for this month.
    const countByEmployee = {};
    for (const s of submissions) countByEmployee[s.employeeId] = (countByEmployee[s.employeeId] || 0) + 1;
    const tracker = employees.filter(e => e.active).map(e => {
        const required = getRequiredShifts(board.rolesById[e.id], settings);
        const submitted = countByEmployee[e.id] || 0;
        return { employeeId: e.id, name: e.displayName, phone: e.phone, required, submitted, met: submitted >= required };
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
            viewTeamSchedule: getRolePermissionValue(role, 'viewTeamSchedule'),
            manageEmployees: getRolePermissionValue(role, 'manageEmployees'),
            manageRules: getRolePermissionValue(role, 'manageRules'),
            manageScheduling: getRolePermissionValue(role, 'manageScheduling'),
            manageRates: canSeeRates,
            manageTemplates: getRolePermissionValue(role, 'manageTemplates'),
        },
        employees,
        workshopTypes: Object.values(board.typesById),
        roleTypes: ROLE_TYPES.map(rt => ({ value: rt, label: ROLE_TYPE_LABELS[rt] })),
        days,
        submissions,
        tracker,
        openOffers,
        rules,
        settings: {
            deadlineDaysBeforeMonthEnd: settings.deadlineDaysBeforeMonthEnd,
            monthsAheadAllowed: settings.monthsAheadAllowed,
            defaultMinShiftsPerMonth: settings.defaultMinShiftsPerMonth,
            defaultMinShiftHours: settings.defaultMinShiftHours,
            defaultShiftStart: settings.defaultShiftStart,
            defaultShiftEnd: settings.defaultShiftEnd,
            bonusUnlockEnabled: settings.bonusUnlockEnabled,
            blockedDates: settings.blockedDates,
            promotedDates: settings.promotedDates,
            holidays: settings.holidays,
        },
        serverNow: new Date().toISOString(),
    };
});

// ---------------------------------------------------------------------------
// Employee profile management
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = ['displayName', 'phone', 'color', 'seniority', 'isTrainee', 'active', 'minShiftsPerMonth', 'minShiftHours', 'priorityRank', 'roleType'];
const RATE_FIELDS = ['rateStudio', 'rateInstruction', 'rateWool'];

export const updateEmployeeProfile = webMethod(Permissions.SiteMember, async (roleId, patch) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    if (!roleId || !patch || typeof patch !== 'object') throw new Error('BAD_REQUEST: חסרים פרטים.');

    const target = await wixData.get('Dashboard_Roles', roleId, SA).catch(() => null);
    if (!target) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

    const updated = { ...target };
    for (const field of PROFILE_FIELDS) {
        if (patch[field] !== undefined) updated[field] = patch[field];
    }
    if (patch.roleType !== undefined && !ROLE_TYPES.includes(patch.roleType)) {
        throw new Error('BAD_REQUEST: roleType לא תקין.');
    }
    if (RATE_FIELDS.some(f => patch[f] !== undefined)) {
        if (!getRolePermissionValue(role, 'manageRates')) throw new Error('PERMISSION_DENIED:manageRates');
        for (const field of RATE_FIELDS) {
            if (patch[field] !== undefined) updated[field] = patch[field];
        }
    }
    if (Array.isArray(patch.skillIds)) {
        updated.skills = patch.skillIds.filter(Boolean);
    }

    await wixData.update('Dashboard_Roles', updated, SA);
    await publishSchedulingUpdate('employee-updated', { roleId });
    console.log(`[staffAdminService] updateEmployeeProfile: ${roleId} by ${role._id}`);
    return { ok: true };
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

export const updateHolidays = webMethod(Permissions.SiteMember, async (holidays) => {
    const { role } = await assertEmployeeAccess('manageRules');
    const clean = (Array.isArray(holidays) ? holidays : [])
        .filter(h => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date))
        .map(h => ({ date: h.date, name: String(h.name || '').slice(0, 80) }));

    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA);
    const row = result.items?.[0];
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    await wixData.update('AvailabilitySettings', { ...row, holidays: JSON.stringify(clean) }, SA);
    await publishSchedulingUpdate('holidays-updated', {});
    console.log(`[staffAdminService] updateHolidays: ${clean.length} entries by ${role._id}`);
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
        'defaultMinShiftsPerMonth',
        'defaultMinShiftHours',
    ];
    for (const field of positiveNumberFields) {
        if (patch[field] === undefined) continue;
        const value = Number(patch[field]);
        if (!Number.isFinite(value) || value <= 0) throw new Error('BAD_REQUEST: ערך מספרי לא תקין.');
        updated[field] = value;
    }
    for (const field of ['defaultShiftStart', 'defaultShiftEnd']) {
        if (patch[field] === undefined) continue;
        const value = String(patch[field] || '');
        if (!/^\d{2}:\d{2}$/.test(value)) throw new Error('BAD_REQUEST: שעה לא תקינה.');
        updated[field] = value;
    }
    if (patch.bonusUnlockEnabled !== undefined) updated.bonusUnlockEnabled = !!patch.bonusUnlockEnabled;

    await wixData.update('AvailabilitySettings', updated, SA);
    await publishSchedulingUpdate('settings-updated', {});
    console.log(`[staffAdminService] updateAvailabilitySettings by ${role._id}`);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// WhatsApp templates
// ---------------------------------------------------------------------------

export const getStaffTemplates = webMethod(Permissions.SiteMember, async () => {
    await assertEmployeeAccess('manageTemplates');
    const result = await wixData.query('WhatsApp_Templates').ascending('title').limit(1000).find(SA);
    return (result.items || []).map(t => ({
        id: t._id,
        title: t.title || '',
        body: t.messageBody || '',
        isSystem: !!t.isSystem,
    }));
});

export const saveStaffTemplate = webMethod(Permissions.SiteMember, async (template) => {
    await assertEmployeeAccess('manageTemplates');
    const title = String(template?.title || '').trim().slice(0, 120);
    const body = String(template?.body || '').trim();
    if (!title || !body) throw new Error('BAD_REQUEST: יש להזין כותרת ותוכן.');

    const data = { title, messageBody: body };
    let saved;
    if (template?.id) {
        const existing = await wixData.get('WhatsApp_Templates', template.id, SA).catch(() => null);
        if (!existing) throw new Error('NOT_FOUND: התבנית לא נמצאה.');
        saved = await wixData.update('WhatsApp_Templates', { ...existing, ...data }, SA);
    } else {
        saved = await wixData.insert('WhatsApp_Templates', { ...data, isSystem: false }, SA);
    }
    return { id: saved._id, title: saved.title, body: saved.messageBody, isSystem: !!saved.isSystem };
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
        const msg = [
            `היי ${target.displayName || ''} 👋`,
            `תזכורת מסטודיו האפי: טרם הושלמה הגשת הזמינות לחודש ${monthKey || 'הקרוב'}.`,
            `להגשה יש להיכנס לפורטל העובדים:`,
            `https://www.studiohappy.art/employee-portal`,
        ].join('\n');
        try {
            await sendGreenApiWhatsApp(target.phone, msg);
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

export const manualAssign = webMethod(Permissions.SiteMember, async (dateKey, workshopTypeId, employeeId) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '') || !workshopTypeId || !employeeId) {
        throw new Error('BAD_REQUEST: חסרים פרטים לשיבוץ.');
    }

    const target = await wixData.get('Dashboard_Roles', employeeId, SA).catch(() => null);
    if (!target) throw new Error('NOT_FOUND: העובד/ת לא נמצא/ה.');

    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const t = board.days[dateKey]?.types?.[workshopTypeId];
    if (t?.assignedEmployeeIds.includes(employeeId)) throw new Error('CONFLICT: העובד/ת כבר משובץ/ת ליום זה.');

    const settings = await loadSettings();
    const existing = await wixData.query('AvailabilitySubmissions')
        .eq('employeeId', employeeId)
        .between('date', new Date(`${dateKey}T00:00:00Z`), new Date(`${dateKey}T23:59:59Z`))
        .limit(1).find(SA).catch(() => ({ items: [] }));

    let submission = existing.items?.[0] || null;
    if (submission) {
        if (submission.status !== SUBMISSION_STATUS.SCHEDULED) {
            submission = await wixData.update('AvailabilitySubmissions', { ...submission, status: SUBMISSION_STATUS.SCHEDULED, managerOverride: true }, SA);
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
            notes: 'שיבוץ ידני על ידי מנהל/ת',
        }, SA);
    }

    const { typesById } = await loadWorkshopTypeMap();
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
    }, SA);

    await publishSchedulingUpdate('manual-assign', { dateKey });

    // Schedule-change notification (Module D)
    if (target.phone) {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
        await sendGreenApiWhatsApp(target.phone,
            `היי ${target.displayName || ''} 👋\nשובצת למשמרת בסדנת ${typesById[workshopTypeId]?.name || 'סדנה'} בתאריך ${dow}, ${d}.${m}.${y}.\nפרטים בפורטל העובדים: https://www.studiohappy.art/employee-portal`
        ).catch(err => console.error('[staffAdminService] assign notify failed:', err?.message || err));
    }

    console.log(`[staffAdminService] manualAssign: ${employeeId} → ${dateKey}/${workshopTypeId} by ${role._id}`);
    return { ok: true };
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
        await sendGreenApiWhatsApp(target.phone,
            `היי ${target.displayName || ''} 👋\nהשיבוץ שלך למשמרת בתאריך ${dow}, ${d}.${m}.${y} בוטל על ידי המנהל/ת.\nלפרטים: https://www.studiohappy.art/employee-portal`
        ).catch(err => console.error('[staffAdminService] cancel notify failed:', err?.message || err));
    }

    // Freed capacity: rerun the engine for that day (auto-fill / offers / open call).
    await runScheduling(dateKey, dateKey);
    console.log(`[staffAdminService] cancelAssignment: ${employeeId} @ ${dateKey}/${workshopTypeId} by ${role._id}`);
    return { ok: true };
});
