/** Tufting sketch-selection editing window policies. */

export const TUFTING_SERVICE_IDS = {
    weekday: '3406e74d-949b-44b0-a5cc-064548129c08',
    friday: '22e86498-525e-4580-9c83-a4470b0c874d',
    weekend: 'c1c1e799-84a9-4847-adf6-2a34480c5bfe',
};

const TUFTING_ID_SET = new Set(Object.values(TUFTING_SERVICE_IDS));

export const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
export const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
export const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function isTuftingServiceId(serviceId) {
    return !!serviceId && TUFTING_ID_SET.has(serviceId);
}

/**
 * Policy 1: order >6d before workshop → deadline = workshop − 6d
 * Policy 2: order 6d–48h before workshop (inclusive) → deadline = order + 10h
 * Policy 3: order ≤48h before workshop → deadline = order + 6h
 */
export function computeSketchEditingDeadline(workshopStart, orderCreated) {
    const ws = new Date(workshopStart).getTime();
    const oc = new Date(orderCreated).getTime();
    const msOrderToWorkshop = ws - oc;

    if (msOrderToWorkshop > SIX_DAYS_MS) {
        return { deadline: new Date(ws - SIX_DAYS_MS), policy: 1 };
    }
    if (msOrderToWorkshop > FORTY_EIGHT_HOURS_MS) {
        return { deadline: new Date(oc + TEN_HOURS_MS), policy: 2 };
    }
    return { deadline: new Date(oc + SIX_HOURS_MS), policy: 3 };
}

export function checkEditingWindow(order, now = new Date()) {
    if (!order?.workshopStart || !order?._createdDate) {
        return { allowed: true, reason: null, deadline: null, policy: null };
    }
    if (order.serviceId && !isTuftingServiceId(order.serviceId)) {
        return { allowed: true, reason: null, deadline: null, policy: null };
    }

    const { deadline, policy } = computeSketchEditingDeadline(
        order.workshopStart,
        order._createdDate
    );

    if (now >= deadline) {
        return { allowed: false, reason: 'EDITING_WINDOW_CLOSED', deadline, policy };
    }

    return { allowed: true, reason: null, deadline, policy };
}

export function enrichOrderEditingFields(order) {
    if (!order) return order;
    const editWindow = checkEditingWindow(order);
    return {
        ...order,
        deadlineAt: editWindow.deadline,
        editingWindowAllowed: editWindow.allowed,
        editingWindowPolicy: editWindow.policy,
    };
}
