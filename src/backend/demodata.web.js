/**
 * Demo seed for the employee portal (Phase 1).
 *
 * Populates Dashboard_Roles, AvailabilitySettings, AvailabilitySubmissions,
 * and SchedulingRules with realistic sample data for testing.
 *
 * HOW TO RUN (site owner / admin):
 *   import { seedEmployeePortalDemo, clearEmployeePortalDemo } from 'backend/demoSeedService.web.js';
 *   seedEmployeePortalDemo({ connectedStaffId: 'YOUR_STAFF_ID' }).then(console.log);
 *
 * MANUAL VALUES — fill in demoSeedConfig.js or pass in the options object:
 *   connectedStaffId  — Bookings/Staff _id → שדה connectedStaff (Reference)
 *   memberUserId      — privateMembersData _id → שדה userId (Reference)
 *   skillWorkshopIds  — workshops _ids → שדה skills (Multi-reference)
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { members } from 'wix-members.v2';
import { SUBMISSION_STATUS, toDateKey, toMonthKey } from 'backend/availabilityRules.js';
import { refId } from 'backend/staffRoles.js';
import { DEMO_SEED_CONFIG } from 'backend/demoSeedConfig.js';

const SA = { suppressAuth: true };
const DEMO_NOTE = '[DEMO]';

function addDaysFromToday(days) {
    const base = new Date();
    base.setDate(base.getDate() + days);
    return toDateKey(base);
}

function nextMonthKey() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateInMonth(monthKey, day) {
    return `${monthKey}-${String(day).padStart(2, '0')}`;
}

async function loadAllWorkshops() {
    const result = await wixData.query('workshops').find(SA).catch(() => ({ items: [] }));
    return result.items || [];
}

async function loadAllStaff() {
    const result = await wixData.query('Bookings/Staff').find(SA).catch(() => ({ items: [] }));
    return (result.items || []).map(s => ({ _id: s._id, name: s.name || '(ללא שם)' }));
}

async function resolveMemberUserId(email, override) {
    if (override) return override;
    // Returns privateMembersData _id — same value stored in Dashboard_Roles.userId (Reference).
    try {
        const found = await members.queryMembers().eq('loginEmail', email).limit(1).find();
        return found.items?.[0]?._id || null;
    } catch (_) {
        return null;
    }
}

async function seedAvailabilitySettings(monthKey) {
    const existing = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default')
        .limit(1)
        .find(SA)
        .catch(() => ({ items: [] }));

    const promoted = [dateInMonth(monthKey, 8), dateInMonth(monthKey, 15)];
    const full = [dateInMonth(monthKey, 22)];
    const blocked = [dateInMonth(monthKey, 28)];

    const payload = {
        settingKey: 'default',
        deadlineDaysBeforeMonthEnd: 4,
        monthsAheadAllowed: 1,
        defaultMinShiftsPerMonth: 3,
        defaultMinShiftHours: 4,
        defaultShiftStart: '10:00',
        defaultShiftEnd: '16:00',
        blockedDates: JSON.stringify(blocked),
        fullDates: JSON.stringify(full),
        promotedDates: JSON.stringify(promoted),
        bonusUnlockEnabled: true,
    };

    if (existing.items?.[0]) {
        await wixData.update('AvailabilitySettings', { ...existing.items[0], ...payload }, SA);
        return { action: 'updated', id: existing.items[0]._id };
    }
    const inserted = await wixData.insert('AvailabilitySettings', payload, SA);
    return { action: 'created', id: inserted._id };
}

async function seedSchedulingRules(workshops) {
    const created = [];
    const updated = [];
    for (const w of workshops) {
        const existing = await wixData.query('SchedulingRules')
            .eq('workshopTypeId', w._id)
            .limit(1)
            .find(SA)
            .catch(() => ({ items: [] }));

        const payload = {
            workshopTypeId: w._id,
            workshopName: w.workshopName || 'סדנה',
            participantsPerInstructor: 8,
            parentChildParticipantsPerInstructor: 6,
            minInstructors: 1,
            active: true,
        };

        if (existing.items?.[0]) {
            await wixData.update('SchedulingRules', { ...existing.items[0], ...payload }, SA);
            updated.push(w._id);
        } else {
            await wixData.insert('SchedulingRules', payload, SA);
            created.push(w._id);
        }
    }
    return { created: created.length, updated: updated.length };
}

async function findRoleByEmail(email) {
    const result = await wixData.query('Dashboard_Roles').eq('userEmail', email).limit(1).find(SA);
    return result.items?.[0] || null;
}

async function upsertDemoRole(config, workshops, staffList) {
    const email = config.employeeEmail;
    let connectedStaffId = config.connectedStaffId || null;
    const warnings = [];
    const needsManualInput = [];

    let role = await findRoleByEmail(email);

    if (!connectedStaffId && role) {
        connectedStaffId = refId(role.connectedStaff);
        if (connectedStaffId) warnings.push('connectedStaffId נלקח משורת Dashboard_Roles הקיימת.');
    }

    if (!connectedStaffId) {
        needsManualInput.push({
            field: 'connectedStaffId',
            hint: 'Reference connectedStaff → Bookings/Staff. מזהה _id של עובד — חובה ליצירת שורה חדשה. ראה staffList.',
        });
        if (!role) {
            return { role: null, warnings, needsManualInput, staffList };
        }
    }

    const skillIds = (config.skillWorkshopIds?.length
        ? config.skillWorkshopIds
        : workshops.map(w => w._id)).filter(Boolean);

    if (!skillIds.length) {
        needsManualInput.push({
            field: 'skillWorkshopIds',
            hint: 'אוסף workshops ריק — הוסף סדנאות ב-CMS או מלא skillWorkshopIds ב-demoSeedConfig.js',
        });
    }

    const memberUserId = await resolveMemberUserId(email, config.memberUserId || null);
    if (!memberUserId) {
        warnings.push('memberUserId (Reference → privateMembersData) לא נמצא — נסה למלא ב-CMS או ב-demoSeedConfig. התאמה תתבצע לפי userEmail.');
    }

    const rolePayload = {
        connectedStaff: connectedStaffId,
        userEmail: email,
        userId: memberUserId || undefined,
        roleType: config.roleType || 'Employee',
        displayName: config.displayName,
        phone: config.phone || '',
        color: config.color || '#7C3AED',
        seniority: config.seniority || 'ותיק',
        priorityRank: config.priorityRank ?? 1,
        skills: skillIds.length ? skillIds : undefined,
        minShiftsPerMonth: config.minShiftsPerMonth ?? 3,
        minShiftHours: config.minShiftHours ?? 4,
        isTrainee: false,
        active: true,
        rateStudio: 45,
        rateInstruction: 65,
        rateWool: 50,
        viewDashboard: true,
        editSketchStatus: true,
        rejectSketchStatus: true,
        deleteSketchImage: true,
        editOrderNotes: true,
        sendWhatsApp: true,
        manageTemplates: true,
        manageRoles: false,
        submitAvailability: true,
        viewTeamSchedule: false,
        manageEmployeeSystem: false,
        manageScheduling: false,
        manageEmployees: false,
        editTimeEntries: false,
        manageRates: false,
        manageRules: false,
    };

    if (role) {
        role = await wixData.update('Dashboard_Roles', { ...role, ...rolePayload }, SA);
        warnings.push(`Dashboard_Roles עודכן (${role._id}).`);
    } else if (connectedStaffId) {
        role = await wixData.insert('Dashboard_Roles', rolePayload, SA);
        warnings.push(`Dashboard_Roles נוצר (${role._id}).`);
    }

    return { role, warnings, needsManualInput, staffList, skillIds };
}

async function clearDemoSubmissionsForRole(roleId) {
    const existing = await wixData.query('AvailabilitySubmissions')
        .eq('employeeId', roleId)
        .limit(1000)
        .find(SA)
        .catch(() => ({ items: [] }));

    let removed = 0;
    for (const item of (existing.items || [])) {
        if (String(item.notes || '').includes(DEMO_NOTE)) {
            await wixData.remove('AvailabilitySubmissions', item._id, SA);
            removed++;
        }
    }
    return removed;
}

async function seedDemoSubmissions(role, staffId, monthKey) {
    if (!role?._id) return { created: 0, skipped: 'no role' };

    const shifts = [
        { day: 5, start: '10:00', end: '16:00', status: SUBMISSION_STATUS.SUBMITTED },
        { day: 7, start: '10:00', end: '16:00', status: SUBMISSION_STATUS.SUBMITTED },
        { day: 12, start: '09:00', end: '15:00', status: SUBMISSION_STATUS.STANDBY },
        { day: 15, start: '10:00', end: '18:00', status: SUBMISSION_STATUS.SUBMITTED },
        { day: 20, start: '10:00', end: '16:00', status: SUBMISSION_STATUS.SCHEDULED },
    ];

    const currentMonth = toMonthKey(new Date());
    const currentMonthShifts = [
        { date: addDaysFromToday(3), start: '10:00', end: '16:00', status: SUBMISSION_STATUS.SUBMITTED },
        { date: addDaysFromToday(7), start: '10:00', end: '16:00', status: SUBMISSION_STATUS.SUBMITTED },
        { date: addDaysFromToday(10), start: '10:00', end: '16:00', status: SUBMISSION_STATUS.SUBMITTED },
    ];

    let created = 0;

    for (const s of shifts) {
        const dateKey = dateInMonth(monthKey, s.day);
        if (dateKey <= toDateKey(new Date())) continue;
        await wixData.insert('AvailabilitySubmissions', {
            employeeId: role._id,
            staffId,
            date: new Date(`${dateKey}T12:00:00Z`),
            startTime: s.start,
            endTime: s.end,
            hours: 6,
            status: s.status,
            monthKey,
            managerOverride: false,
            notes: `${DEMO_NOTE} משמרת דמו לחודש ${monthKey}`,
        }, SA);
        created++;
    }

    for (const s of currentMonthShifts) {
        if (s.date <= toDateKey(new Date())) continue;
        await wixData.insert('AvailabilitySubmissions', {
            employeeId: role._id,
            staffId,
            date: new Date(`${s.date}T12:00:00Z`),
            startTime: s.start,
            endTime: s.end,
            hours: 6,
            status: s.status,
            monthKey: currentMonth,
            managerOverride: false,
            notes: `${DEMO_NOTE} משמרת דמו — מכסה חודש נוכחי`,
        }, SA);
        created++;
    }

    return { created, monthKey, currentMonth };
}

/**
 * Seeds demo data for the employee portal.
 *
 * @param {object} [options]
 * @param {string} [options.connectedStaffId] — Bookings/Staff _id (see demoSeedConfig.js)
 * @param {string} [options.memberUserId]     — Wix member _id (optional)
 * @param {string[]} [options.skillWorkshopIds] — workshops _ids for skills multi-ref
 * @param {boolean} [options.resetDemo]       — remove prior demo submissions first
 */
export const seedEmployeePortalDemo = webMethod(Permissions.Admin, async (options = {}) => {
    const config = { ...DEMO_SEED_CONFIG, ...options };
    const report = {
        ok: false,
        warnings: [],
        needsManualInput: [],
        created: {},
        staffList: [],
        roleId: null,
        nextSteps: [],
    };

    const workshops = await loadAllWorkshops();
    const staffList = await loadAllStaff();
    report.staffList = staffList;

    const monthKey = nextMonthKey();

    report.created.settings = await seedAvailabilitySettings(monthKey);
    report.created.schedulingRules = await seedSchedulingRules(workshops);

    const roleResult = await upsertDemoRole(config, workshops, staffList);
    report.warnings.push(...(roleResult.warnings || []));
    report.needsManualInput.push(...(roleResult.needsManualInput || []));

    if (!roleResult.role) {
        report.ok = false;
        report.nextSteps = [
            'מלא connectedStaffId ב-backend/demoSeedConfig.js (או העבר ב-options) — ראה staffList.',
            'הרץ שוב: seedEmployeePortalDemo({ connectedStaffId: "..." })',
        ];
        return report;
    }

    const role = roleResult.role;
    report.roleId = role._id;
    const staffId = refId(role.connectedStaff);

    if (options.resetDemo !== false) {
        report.created.demoSubmissionsRemoved = await clearDemoSubmissionsForRole(role._id);
    }

    report.created.submissions = await seedDemoSubmissions(role, staffId, monthKey);

    report.ok = report.needsManualInput.length === 0;
    report.nextSteps = [
        `התחבר לאתר עם ${config.employeeEmail} ופתח את עמוד פורטל העובדים.`,
        'בלוח: ימים 8 ו-15 מסומנים כ"דרושים", יום 22 כ"מאויש", יום 28 חסום (מ-AvailabilitySettings).',
        'סטטוס SCHEDULED יציג פרטי סדנה רק אם קיימת הזמנה ב-WorkshopOrders באותו תאריך.',
    ];

    if (report.needsManualInput.length) {
        report.nextSteps.unshift('השלם שדות חסרים (ראה needsManualInput) והרץ שוב.');
    }

    console.log('[demoSeed] seedEmployeePortalDemo complete:', JSON.stringify(report));
    return report;
});

/** Removes demo availability rows (notes contain [DEMO]) for the configured employee. */
export const clearEmployeePortalDemo = webMethod(Permissions.Admin, async (options = {}) => {
    const email = options.email || DEMO_SEED_CONFIG.employeeEmail;
    const role = await findRoleByEmail(email);
    if (!role) return { ok: false, message: `לא נמצאה שורת Dashboard_Roles עבור ${email}` };

    const removed = await clearDemoSubmissionsForRole(role._id);
    return { ok: true, roleId: role._id, submissionsRemoved: removed };
});
