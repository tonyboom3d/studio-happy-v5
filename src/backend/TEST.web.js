/**
 * Manual Bookings staff API tests — run from the Velo backend console:
 *
 *   import { getStaffMemberTest, testBookingsStaffLink } from 'backend/TEST.web.js';
 *   getStaffMemberTest('997e9b7c-cb6d-4598-bcd9-2e6743a9a2e7').then(console.log);
 *   testBookingsStaffLink().then(console.log);
 */
import { Permissions, webMethod } from 'wix-web-module';
import { staffMembers } from '@wix/bookings';
import { listBookingStaff } from 'backend/staffAdminService.web.js';

const DEFAULT_STAFF_MEMBER_ID = '997e9b7c-cb6d-4598-bcd9-2e6743a9a2e7';

/** Returns raw getStaffMember response for a Bookings staff _id. */
export const getStaffMemberTest = webMethod(Permissions.Admin, async (staffMemberId = DEFAULT_STAFF_MEMBER_ID) => {
    const id = String(staffMemberId || DEFAULT_STAFF_MEMBER_ID).trim();
    const response = await staffMembers.getStaffMember(id);
    return {
        ok: true,
        staffMemberId: id,
        response,
        staffMember: response?.staffMember || response,
    };
});

/** Runs listBookingStaff and shows connectedStaff ↔ queryStaffMembers matching per employee. */
export const testBookingsStaffLink = webMethod(Permissions.Admin, async () => {
    const data = await listBookingStaff();
    const staffIdSet = new Set((data?.staffIds || []).map(id => String(id).toLowerCase()));
    const employees = (data?.allEmployees || []).map((e) => {
        const connectedId = String(e.connectedStaffId || e.staffId || '').toLowerCase();
        return {
            roleId: e.id,
            displayName: e.displayName,
            connectedStaffId: connectedId || null,
            bookingsLinked: e.bookingsLinked,
            idInStaffQuery: connectedId ? staffIdSet.has(connectedId) : false,
        };
    });
    return {
        ok: true,
        staffCount: data?.staffIds?.length ?? 0,
        employeesWithConnectedStaff: employees.filter(e => e.connectedStaffId),
        linkedCount: employees.filter(e => e.bookingsLinked).length,
        employees,
        staffSample: (data?.staff || []).slice(0, 5),
    };
});
