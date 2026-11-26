/**
 * manualOrderService.web.js — Manager-only webMethods for adding/cancelling
 * manual workshop customers and fetching day-specific session pricing.
 */

import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess } from 'backend/employeeAuth.js';
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
        const { employee } = await assertEmployeeAccess('manageScheduling');
        return createManualOrder(input, employee?.displayName || 'מנהל');
    }
);

export const cancelManualWorkshopOrder = webMethod(
    Permissions.SiteMember,
    async (orderId) => {
        const { employee } = await assertEmployeeAccess('manageScheduling');
        return cancelManualOrder(orderId, employee?.displayName || 'מנהל');
    }
);
