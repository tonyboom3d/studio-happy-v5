/**
 * manualOrderService.web.js — Manager-only webMethods for adding/cancelling
 * manual workshop customers and fetching day-specific session pricing.
 */

import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess } from 'backend/staffRoles.js';
import {
    resolveSessionPricing,
    createManualOrder,
    cancelManualOrder,
} from 'backend/manualOrders.js';

export const getManualSessionPricing = webMethod(
    Permissions.SiteMember,
    async (dateKey, workshopTypeId, sessionStart) => {
        await assertEmployeeAccess('manageScheduling');
        return resolveSessionPricing(dateKey, workshopTypeId, sessionStart);
    }
);

export const createManualWorkshopOrder = webMethod(
    Permissions.SiteMember,
    async (input) => {
        const { role } = await assertEmployeeAccess('manageScheduling');
        return createManualOrder(input, role?.displayName || 'מנהל');
    }
);

export const cancelManualWorkshopOrder = webMethod(
    Permissions.SiteMember,
    async (orderId) => {
        const { role } = await assertEmployeeAccess('manageScheduling');
        return cancelManualOrder(orderId, role?.displayName || 'מנהל');
    }
);
