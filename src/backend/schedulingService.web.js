/**
 * Scheduling web methods (Module C) — thin wrappers over schedulingEngine.js.
 * Admin: run the engine on demand. Employees: respond to waiting-list offers
 * and claim open calls (atomic first-write-wins inside the engine).
 */
import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess, loadRoleWithSkills } from 'backend/staffRoles.js';
import { toDateKey } from 'backend/availabilityRules.js';
import {
    runScheduling,
    runSchedulingForEmployees as engineRunSchedulingForEmployees,
    respondToOffer as engineRespondToOffer,
    claimOpenCall as engineClaimOpenCall,
    claimOpenCalls as engineClaimOpenCalls,
    loadSettings,
} from 'backend/schedulingEngine.js';

const DEFAULT_HORIZON_DAYS = 60;

/** Admin: runs auto-scheduling for a day, a month, or the default horizon. */
export const runSchedulingNow = webMethod(Permissions.SiteMember, async (scope) => {
    const { role } = await assertEmployeeAccess('manageScheduling');

    let fromKey, toKey;
    if (/^\d{4}-\d{2}-\d{2}$/.test(scope || '')) {
        fromKey = toKey = scope;
    } else if (/^\d{4}-\d{2}$/.test(scope || '')) {
        const [y, m] = scope.split('-').map(Number);
        fromKey = `${scope}-01`;
        toKey = `${scope}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    } else {
        const now = new Date();
        fromKey = toDateKey(now);
        toKey = toDateKey(new Date(now.getTime() + DEFAULT_HORIZON_DAYS * 86400000));
    }

    const report = await runScheduling(fromKey, toKey);
    console.log(`[schedulingService] runSchedulingNow by ${role._id}: ${fromKey}..${toKey}`);
    return { ok: true, fromKey, toKey, ...report };
});

/** Admin: manual batch run — up to 3 hand-picked employees, up to 4 weeks ahead. Returns a per-employee shift report. */
export const runSchedulingForEmployees = webMethod(Permissions.SiteMember, async (fromKey, toKey, employeeIds) => {
    const { role } = await assertEmployeeAccess('manageScheduling');
    const result = await engineRunSchedulingForEmployees(fromKey, toKey, employeeIds);
    console.log(`[schedulingService] runSchedulingForEmployees by ${role._id}: ${fromKey}..${toKey} employees=${(employeeIds || []).join(',')}`);
    return result;
});

/** Employee: accept/decline a waiting-list offer addressed to them. */
export const respondToOffer = webMethod(Permissions.SiteMember, async (offerId, accept) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    if (!offerId) throw new Error('BAD_REQUEST: חסר מזהה הצעה.');
    return engineRespondToOffer(offerId, role, !!accept);
});

/** Employee: claim an open call (first click wins). */
export const claimOpenCall = webMethod(Permissions.SiteMember, async (callId) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    if (!callId) throw new Error('BAD_REQUEST: חסר מזהה קריאה.');
    const [settings, roleWithSkills] = await Promise.all([
        loadSettings(),
        loadRoleWithSkills(role),
    ]);
    return engineClaimOpenCall(callId, roleWithSkills, settings);
});

/** Employee: claim several open calls at once — each is re-verified against the live DB before being assigned. */
export const claimOpenCalls = webMethod(Permissions.SiteMember, async (callIds) => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    if (!Array.isArray(callIds) || !callIds.length) throw new Error('BAD_REQUEST: לא נבחרו משמרות.');
    const [settings, roleWithSkills] = await Promise.all([
        loadSettings(),
        loadRoleWithSkills(role),
    ]);
    return engineClaimOpenCalls(callIds, roleWithSkills, settings);
});
