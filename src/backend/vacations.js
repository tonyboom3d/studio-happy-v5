/**
 * Employee vacations (Module A add-on) — internal module, no web methods.
 *
 * Managers define vacation date-ranges per employee directly (no approval
 * step needed — a manager-created row IS the approval). Used to exempt the
 * Friday/Saturday monthly submission requirement for days that fall inside
 * an employee's vacation (see availabilityRules.evaluateWeekendCompliance).
 *
 * Collection: EmployeeVacations — employeeId, startDate/endDate ('YYYY-MM-DD'
 * strings so range-overlap comparisons are plain string comparisons), notes.
 */
import wixData from 'wix-data';

const SA = { suppressAuth: true };

function mapVacation(item) {
    return {
        id: item._id,
        employeeId: item.employeeId,
        startDate: item.startDate,
        endDate: item.endDate,
        notes: item.notes || '',
    };
}

export async function loadVacationsForEmployee(employeeId) {
    const result = await wixData.query('EmployeeVacations')
        .eq('employeeId', employeeId)
        .limit(500).find(SA).catch(() => ({ items: [] }));
    return (result.items || []).map(mapVacation);
}

/** Vacations overlapping ['fromKey','toKey'] across all employees, grouped by employeeId. */
export async function loadVacationsOverlappingRangeByEmployee(fromKey, toKey) {
    const result = await wixData.query('EmployeeVacations')
        .le('startDate', toKey)
        .ge('endDate', fromKey)
        .limit(1000).find(SA).catch(() => ({ items: [] }));
    const byEmployee = {};
    for (const item of (result.items || [])) {
        const v = mapVacation(item);
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

export async function saveVacation(vacation) {
    if (!vacation?.employeeId) throw new Error('BAD_REQUEST: יש לבחור עובד/ת.');
    const startDate = String(vacation.startDate || '').trim();
    const endDate = String(vacation.endDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error('BAD_REQUEST: יש להזין תאריכי התחלה וסיום תקינים.');
    }
    if (endDate < startDate) throw new Error('BAD_REQUEST: תאריך הסיום לפני תאריך ההתחלה.');

    const data = {
        employeeId: vacation.employeeId,
        startDate,
        endDate,
        notes: String(vacation.notes || '').slice(0, 300),
    };

    if (vacation.id) {
        const existing = await wixData.get('EmployeeVacations', vacation.id, SA).catch(() => null);
        if (!existing) throw new Error('NOT_FOUND: החופשה לא נמצאה.');
        return mapVacation(await wixData.update('EmployeeVacations', { ...existing, ...data }, SA));
    }
    return mapVacation(await wixData.insert('EmployeeVacations', data, SA));
}

export async function deleteVacation(vacationId) {
    if (!vacationId) throw new Error('BAD_REQUEST: חסר מזהה חופשה.');
    await wixData.remove('EmployeeVacations', vacationId, SA);
    return { ok: true };
}
