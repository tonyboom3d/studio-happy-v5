/**
 * Time clock web methods (Module E).
 *
 * Collections: ClockStations (stationKey → taskType, printable QR URLs),
 * TimeEntries (clock records), TimeApprovals (monthly employee approval).
 *
 * SECURITY: employees never receive rates or salary totals — payloads contain
 * dates, task types and hours only. CSV export requires editTimeEntries.
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess, getRolePermissionValue } from 'backend/staffRoles.js';
import { toDateKey, toMonthKey } from 'backend/availabilityRules.js';
import { loadActiveRoles, publishSchedulingUpdate } from 'backend/schedulingEngine.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };

export const TASK_TYPES = ['STUDIO', 'INSTRUCTION', 'WOOL'];
export const TASK_LABELS = { STUDIO: 'סטודיו', INSTRUCTION: 'הדרכה', WOOL: 'צמר' };
const DEFAULT_APPROVAL_WINDOW_DAYS = 3;

function entryHours(start, end) {
    if (!start || !end) return null;
    const h = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
    return h > 0 ? Math.round(h * 100) / 100 : null;
}

function mapEntry(e) {
    return {
        id: e._id,
        employeeId: e.employeeId,
        dateKey: e.dateKey || toDateKey(e.startTime),
        monthKey: e.monthKey || toMonthKey(e.startTime),
        taskType: e.taskType,
        taskLabel: TASK_LABELS[e.taskType] || e.taskType,
        startTime: e.startTime,
        endTime: e.endTime || null,
        hours: e.hours ?? entryHours(e.startTime, e.endTime),
        source: e.source || 'SCAN',
        notes: e.notes || '',
        open: !e.endTime,
    };
}

function sumByTask(entries) {
    const totals = { total: 0 };
    for (const t of TASK_TYPES) totals[t] = 0;
    for (const e of entries) {
        if (!e.hours) continue;
        totals[e.taskType] = (totals[e.taskType] || 0) + e.hours;
        totals.total += e.hours;
    }
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;
    return totals;
}

async function findOpenEntry(roleId) {
    const result = await wixData.query('TimeEntries')
        .eq('employeeId', roleId)
        .isEmpty('endTime')
        .descending('startTime')
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    return result.items?.[0] || null;
}

async function closeEntry(entry, endTime = new Date()) {
    const hours = entryHours(entry.startTime, endTime);
    return wixData.update('TimeEntries', { ...entry, endTime, hours }, SA);
}

/** Approval window: from N days before month end until the 5th of the next month. */
function isApprovalWindowOpen(monthKey, now = new Date(), windowDays = DEFAULT_APPROVAL_WINDOW_DAYS) {
    const [y, m] = monthKey.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    const windowStart = new Date(monthEnd.getTime() - (windowDays - 1) * 86400000);
    windowStart.setUTCHours(0, 0, 0, 0);
    const windowEnd = new Date(Date.UTC(y, m, 5, 23, 59, 59)); // 5th of next month
    return now >= windowStart && now <= windowEnd;
}

async function getApproval(roleId, monthKey) {
    const result = await wixData.query('TimeApprovals')
        .eq('employeeId', roleId)
        .eq('monthKey', monthKey)
        .limit(1).find(SA).catch(() => ({ items: [] }));
    return result.items?.[0] || null;
}

// ---------------------------------------------------------------------------
// Employee methods
// ---------------------------------------------------------------------------

/** Clock screen state; stationKey (from the QR URL) resolves a default task. */
export const getClockStatus = webMethod(Permissions.SiteMember, async (stationKey) => {
    const { role } = await assertEmployeeAccess('submitAvailability');

    let station = null;
    if (stationKey) {
        const result = await wixData.query('ClockStations')
            .eq('stationKey', String(stationKey))
            .ne('active', false)
            .limit(1).find(SA).catch(() => ({ items: [] }));
        station = result.items?.[0]
            ? { key: result.items[0].stationKey, taskType: result.items[0].taskType, name: result.items[0].name || '' }
            : null;
    }

    const todayKey = toDateKey(new Date());
    const [openEntry, todayResult] = await Promise.all([
        findOpenEntry(role._id),
        wixData.query('TimeEntries')
            .eq('employeeId', role._id)
            .eq('dateKey', todayKey)
            .ascending('startTime')
            .limit(100).find(SA).catch(() => ({ items: [] })),
    ]);
    const todayEntries = (todayResult.items || []).map(mapEntry);

    return {
        user: { name: role.displayName || 'עובד/ת' },
        station,
        taskTypes: TASK_TYPES.map(t => ({ value: t, label: TASK_LABELS[t] })),
        openEntry: openEntry ? mapEntry(openEntry) : null,
        todayEntries,
        todayTotals: sumByTask(todayEntries.filter(e => e.hours)),
        serverNow: new Date().toISOString(),
    };
});

/**
 * Single clock action:
 * - no open entry + taskType → clock in
 * - open entry + same/no taskType → clock out
 * - open entry + different taskType → switch (close + open)
 */
export const clockAction = webMethod(Permissions.SiteMember, async (taskType) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    const task = TASK_TYPES.includes(taskType) ? taskType : null;
    const now = new Date();

    const open = await findOpenEntry(role._id);

    if (open && (!task || open.taskType === task)) {
        const closed = await closeEntry(open, now);
        console.log(`[timeClockService] clock-out: ${role._id} ${open.taskType} ${closed.hours}h`);
        await publishSchedulingUpdate('time-entry', { employeeId: role._id });
        return { ok: true, action: 'out', entry: mapEntry(closed) };
    }

    if (!task) throw new Error('BAD_REQUEST: יש לבחור סוג משימה לתחילת משמרת.');

    if (open) await closeEntry(open, now);

    const inserted = await wixData.insert('TimeEntries', {
        employeeId: role._id,
        dateKey: toDateKey(now),
        monthKey: toMonthKey(now),
        taskType: task,
        startTime: now,
        endTime: null,
        hours: null,
        source: 'SCAN',
        notes: '',
    }, SA);
    console.log(`[timeClockService] clock-${open ? 'switch' : 'in'}: ${role._id} → ${task}`);
    await publishSchedulingUpdate('time-entry', { employeeId: role._id });
    return { ok: true, action: open ? 'switch' : 'in', entry: mapEntry(inserted) };
});

/** Monthly history + totals + approval state for the portal "hours" tab. */
export const getMyTimeEntries = webMethod(Permissions.SiteMember, async (monthKey) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    const month = /^\d{4}-\d{2}$/.test(monthKey || '') ? monthKey : toMonthKey(new Date());

    const [result, approval] = await Promise.all([
        wixData.query('TimeEntries')
            .eq('employeeId', role._id)
            .eq('monthKey', month)
            .ascending('startTime')
            .limit(1000).find(SA).catch(() => ({ items: [] })),
        getApproval(role._id, month),
    ]);
    const entries = (result.items || []).map(mapEntry);

    return {
        monthKey: month,
        entries,
        totals: sumByTask(entries.filter(e => e.hours)),
        approved: !!approval,
        approvedAt: approval?.approvedAt || null,
        approvalWindowOpen: isApprovalWindowOpen(month),
    };
});

export const approveMyMonth = webMethod(Permissions.SiteMember, async (monthKey) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    if (!/^\d{4}-\d{2}$/.test(monthKey || '')) throw new Error('BAD_REQUEST: חודש לא תקין.');
    if (!isApprovalWindowOpen(monthKey)) {
        throw new Error('FORBIDDEN: חלון אישור השעות לחודש זה אינו פתוח.');
    }
    const existing = await getApproval(role._id, monthKey);
    if (existing) return { ok: true, alreadyApproved: true };

    await wixData.insert('TimeApprovals', {
        employeeId: role._id,
        monthKey,
        approvedAt: new Date(),
    }, SA);
    console.log(`[timeClockService] month approved: ${role._id} ${monthKey}`);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// Admin methods (editTimeEntries)
// ---------------------------------------------------------------------------

export const getTeamTime = webMethod(Permissions.SiteMember, async (monthKey) => {
    const { role } = await assertEmployeeAccess('editTimeEntries');
    const month = /^\d{4}-\d{2}$/.test(monthKey || '') ? monthKey : toMonthKey(new Date());

    const [roles, entriesResult, approvalsResult] = await Promise.all([
        loadActiveRoles(),
        wixData.query('TimeEntries').eq('monthKey', month).ascending('startTime').limit(1000).find(SA).catch(() => ({ items: [] })),
        wixData.query('TimeApprovals').eq('monthKey', month).limit(1000).find(SA).catch(() => ({ items: [] })),
    ]);

    const namesById = {};
    for (const r of roles) namesById[r._id] = r.displayName || '(ללא שם)';
    const approvedIds = new Set((approvalsResult.items || []).map(a => a.employeeId));

    const entries = (entriesResult.items || []).map(e => ({ ...mapEntry(e), employeeName: namesById[e.employeeId] || '—' }));
    const byEmployee = {};
    for (const e of entries) {
        if (!byEmployee[e.employeeId]) {
            byEmployee[e.employeeId] = { employeeId: e.employeeId, name: e.employeeName, entries: [], approved: approvedIds.has(e.employeeId) };
        }
        byEmployee[e.employeeId].entries.push(e);
    }
    for (const emp of Object.values(byEmployee)) emp.totals = sumByTask(emp.entries.filter(e => e.hours));

    console.log(`[timeClockService] getTeamTime ${month} by ${role._id}: ${entries.length} entries`);
    return { monthKey: month, employees: Object.values(byEmployee), taskTypes: TASK_TYPES.map(t => ({ value: t, label: TASK_LABELS[t] })) };
});

/** Creates or corrects an entry (manager). */
export const upsertTimeEntry = webMethod(Permissions.SiteMember, async (payload) => {
    const { role } = await assertEmployeeAccess('editTimeEntries');
    const { id, employeeId, taskType, startTime, endTime, notes } = payload || {};
    if (!TASK_TYPES.includes(taskType)) throw new Error('BAD_REQUEST: סוג משימה לא תקין.');
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : null;
    if (Number.isNaN(start.getTime()) || (end && end <= start)) throw new Error('BAD_REQUEST: שעות לא תקינות.');

    const fields = {
        taskType,
        startTime: start,
        endTime: end,
        hours: entryHours(start, end),
        dateKey: toDateKey(start),
        monthKey: toMonthKey(start),
        source: 'EDITED',
        notes: typeof notes === 'string' ? notes.slice(0, 300) : '',
    };

    if (id) {
        const existing = await wixData.get('TimeEntries', id, SA).catch(() => null);
        if (!existing) throw new Error('NOT_FOUND: הרישום לא נמצא.');
        await wixData.update('TimeEntries', { ...existing, ...fields }, SA);
    } else {
        if (!employeeId) throw new Error('BAD_REQUEST: חסר מזהה עובד/ת.');
        await wixData.insert('TimeEntries', { employeeId, ...fields, source: 'MANUAL' }, SA);
    }
    console.log(`[timeClockService] upsertTimeEntry ${id || '(new)'} by ${role._id}`);
    return { ok: true };
});

export const deleteTimeEntry = webMethod(Permissions.SiteMember, async (entryId) => {
    const { role } = await assertEmployeeAccess('editTimeEntries');
    if (!entryId) throw new Error('BAD_REQUEST: חסר מזהה רישום.');
    await wixData.remove('TimeEntries', entryId, SA);
    console.log(`[timeClockService] deleteTimeEntry ${entryId} by ${role._id}`);
    return { ok: true };
});

/** Monthly CSV: Date, Task Type, Hours, Employee (never rates/salary). */
export const exportMonthCsv = webMethod(Permissions.SiteMember, async (monthKey) => {
    const { role } = await assertEmployeeAccess('editTimeEntries');
    const team = await getTeamTime(monthKey);

    const rows = [['Date', 'Task Type', 'Hours', 'Employee']];
    for (const emp of team.employees) {
        for (const e of emp.entries) {
            if (!e.hours) continue;
            rows.push([e.dateKey, e.taskLabel, String(e.hours), emp.name]);
        }
    }
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    console.log(`[timeClockService] exportMonthCsv ${team.monthKey} by ${role._id}: ${rows.length - 1} rows`);
    return { ok: true, monthKey: team.monthKey, filename: `hours-${team.monthKey}.csv`, csv };
});
