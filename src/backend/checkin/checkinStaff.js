/**
 * checkin/checkinStaff.js — resolves "which staff member to approach" for
 * the check-in success screen. Reuses the same ShiftAssignments-by-
 * `${dateKey}|${workshopTypeId}` mapping the order dashboard already uses
 * (see dashboardService.web.js loadShiftInstructorsMap) — picks the first
 * assigned employee. Returns null when nobody is assigned, so the UI falls
 * back to the generic "approach any staff member" message.
 */
import wixData from 'wix-data';
import { toDateKey } from 'backend/availabilityRules.js';
import { loadWorkshopTypes } from 'backend/studioUpsell/sessions.js';

const SA = { suppressAuth: true };

/** Converts a Wix media URL (wix:image://…) to a browser-displayable HTTPS thumbnail URL. Mirrors employeeService.web.js convertWixImageUrl. */
function convertWixImageUrl(wixUrl, width = 240, height = 240, quality = 80) {
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

/** Null when no staff is assigned for this order's workshop type/day — UI shows the generic fallback. */
export async function findAssignedStaffForOrder(order) {
    if (!order?.workshopStart || !order?.serviceId) return null;

    const { serviceIdToTypeId } = await loadWorkshopTypes();
    const workshopTypeId = serviceIdToTypeId[order.serviceId];
    if (!workshopTypeId) return null;

    const dateKey = toDateKey(order.workshopStart);
    if (!dateKey) return null;

    const assignments = await wixData.query('ShiftAssignments')
        .eq('dateKey', dateKey)
        .eq('workshopTypeId', workshopTypeId)
        .ne('status', 'CANCELLED')
        .limit(10)
        .find(SA)
        .catch(() => ({ items: [] }));

    const employeeId = assignments.items?.[0]?.employeeId;
    if (!employeeId) return null;

    const role = await wixData.get('Dashboard_Roles', employeeId, SA).catch(() => null);
    if (!role || !role.displayName) return null;

    return {
        name: role.displayName,
        photoUrl: convertWixImageUrl(role.photo),
    };
}
