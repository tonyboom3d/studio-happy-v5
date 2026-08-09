/**
 * Employee vacations (Module A add-on) — internal module, no web methods.
 *
 * Managers can define approved vacation date-ranges per employee directly.
 * Employees may request single-day (or multi-day) time off; requests start as
 * PENDING and require manager approval before they affect quota exemptions.
 *
 * Collection: EmployeeVacations — employeeId, startDate/endDate ('YYYY-MM-DD'),
 * notes, status ('PENDING'|'APPROVED'|'REJECTED'), source ('MANAGER'|'EMPLOYEE'),
 * managerComment, decidedAt.
 */
import wixData from 'wix-data';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };

export const VACATION_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };
export const VACATION_SOURCE = { MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE' };

function mapVacation(item) {
    return {
        id: item._id,
        employeeId: item.employeeId,
        startDate: item.startDate,
        endDate: item.endDate,
        notes: item.notes || '',
        status: item.status || VACATION_STATUS.APPROVED,
        source: item.source || VACATION_SOURCE.MANAGER,
        managerComment: item.managerComment || '',
        createdAt: item._createdDate ? new Date(item._createdDate).toISOString() : null,
        decidedAt: item.decidedAt || null,
    };
}

/** Approved vacations only — used for quota / weekend-exemption calculations. */
export async function loadVacationsForEmployee(employeeId) {
    const result = await wixData.query('EmployeeVacations')
        .eq('employeeId', employeeId)
        .limit(500).find(SA).catch(() => ({ items: [] }));
    return (result.items || []).map(mapVacation).filter(v => v.status === VACATION_STATUS.APPROVED);
}

/** Full vacation history for an employee (all statuses). */
export async function loadVacationHistoryForEmployee(employeeId) {
    const result = await wixData.query('EmployeeVacations')
        .eq('employeeId', employeeId)
        .descending('startDate')
        .limit(500).find(SA).catch(() => ({ items: [] }));
    return (result.items || []).map(mapVacation);
}

/** Vacations overlapping ['fromKey','toKey'] across all employees, grouped by employeeId (approved only). */
export async function loadVacationsOverlappingRangeByEmployee(fromKey, toKey) {
    const result = await wixData.query('EmployeeVacations')
        .le('startDate', toKey)
        .ge('endDate', fromKey)
        .limit(1000).find(SA).catch(() => ({ items: [] }));
    const byEmployee = {};
    for (const item of (result.items || [])) {
        const v = mapVacation(item);
        if (v.status !== VACATION_STATUS.APPROVED) continue;
        if (!byEmployee[v.employeeId]) byEmployee[v.employeeId] = [];
        byEmployee[v.employeeId].push(v);
    }
    return byEmployee;
}

export async function listAllVacations() {
    const result = await wixData.query('EmployeeVacations')
        .descending('startDate')
        .limit(1000).find(SA).catch(() => ({ items: [] }));
    return (result.items || []).map(mapVacation);
}

async function loadEmployeeVacations(employeeId) {
    const result = await wixData.query('EmployeeVacations')
        .eq('employeeId', employeeId)
        .limit(500).find(SAC).catch(() => ({ items: [] }));
    return (result.items || []).map(mapVacation);
}

function assertNoOverlap(existing, startDate, endDate, { excludeId } = {}) {
    for (const v of existing) {
        if (excludeId && v.id === excludeId) continue;
        if (v.status === VACATION_STATUS.REJECTED) continue;
        if (endDate < v.startDate || startDate > v.endDate) continue;
        if (v.status === VACATION_STATUS.PENDING) {
            throw new Error('BAD_REQUEST: כבר קיימת בקשת חופש ממתינה לאישור לתאריך זה.');
        }
        throw new Error('BAD_REQUEST: כבר מוגדר יום חופש מאושר לתאריך זה.');
    }
}

export async function saveVacation(vacation) {
    if (!vacation?.employeeId) throw new Error('BAD_REQUEST: יש לבחור עובד/ת.');
    const startDate = String(vacation.startDate || '').trim();
    const endDate = String(vacation.endDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error('BAD_REQUEST: יש להזין תאריכי התחלה וסיום תקינים.');
    }
    if (endDate < startDate) throw new Error('BAD_REQUEST: תאריך הסיום לפני תאריך ההתחלה.');

    const existing = await loadEmployeeVacations(vacation.employeeId);
    assertNoOverlap(existing, startDate, endDate, { excludeId: vacation.id });

    const data = {
        employeeId: vacation.employeeId,
        startDate,
        endDate,
        notes: String(vacation.notes || '').slice(0, 300),
        status: VACATION_STATUS.APPROVED,
        source: VACATION_SOURCE.MANAGER,
        managerComment: '',
        decidedAt: new Date().toISOString(),
    };

    if (vacation.id) {
        const row = await wixData.get('EmployeeVacations', vacation.id, SAC).catch(() => null);
        if (!row) throw new Error('NOT_FOUND: החופשה לא נמצאה.');
        return mapVacation(await wixData.update('EmployeeVacations', { ...row, ...data }, SA));
    }
    return mapVacation(await wixData.insert('EmployeeVacations', data, SA));
}

/** Employee requests one or more days off (each becomes a single-day PENDING row). */
export async function requestEmployeeDaysOff(role, dateKeys, notes = '') {
    const dates = [...new Set((dateKeys || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
    if (!dates.length) throw new Error('BAD_REQUEST: יש לבחור לפחות יום אחד.');

    const today = new Date().toISOString().slice(0, 10);
    const existing = await loadEmployeeVacations(role._id);
    const created = [];

    for (const dateKey of dates) {
        if (dateKey <= today) {
            throw new Error(`BAD_REQUEST: לא ניתן לבקש חופש לתאריך שעבר (${dateKey}).`);
        }
        assertNoOverlap(existing, dateKey, dateKey);
        const row = await wixData.insert('EmployeeVacations', {
            employeeId: role._id,
            startDate: dateKey,
            endDate: dateKey,
            notes: String(notes || '').slice(0, 300),
            status: VACATION_STATUS.PENDING,
            source: VACATION_SOURCE.EMPLOYEE,
            managerComment: '',
            decidedAt: null,
        }, SA);
        const mapped = mapVacation(row);
        existing.push(mapped);
        created.push(mapped);
    }
    return { ok: true, created };
}

/** Manager approves or rejects a pending vacation request. */
export async function decideVacationRequest(vacationId, approve, managerComment = '') {
    const row = await wixData.get('EmployeeVacations', vacationId, SAC).catch(() => null);
    if (!row) throw new Error('NOT_FOUND: הבקשה לא נמצאה.');
    if ((row.status || VACATION_STATUS.APPROVED) !== VACATION_STATUS.PENDING) {
        throw new Error('CONFLICT: הבקשה כבר טופלה.');
    }

    if (approve) {
        const existing = await loadEmployeeVacations(row.employeeId);
        assertNoOverlap(existing, row.startDate, row.endDate, { excludeId: row._id });
        const updated = await wixData.update('EmployeeVacations', {
            ...row,
            status: VACATION_STATUS.APPROVED,
            managerComment: String(managerComment || '').slice(0, 300),
            decidedAt: new Date().toISOString(),
        }, SA);
        return { ok: true, approved: true, vacation: mapVacation(updated) };
    }

    const updated = await wixData.update('EmployeeVacations', {
        ...row,
        status: VACATION_STATUS.REJECTED,
        managerComment: String(managerComment || '').slice(0, 300),
        decidedAt: new Date().toISOString(),
    }, SA);
    return { ok: true, approved: false, vacation: mapVacation(updated) };
}

export async function deleteVacation(vacationId) {
    if (!vacationId) throw new Error('BAD_REQUEST: חסר מזהה חופשה.');
    await wixData.remove('EmployeeVacations', vacationId, SA);
    return { ok: true };
}
