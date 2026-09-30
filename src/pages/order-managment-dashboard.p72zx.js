import {
    getInitialDashboardData,
    getCurrentDashboardUser,
    updateSketchState,
    deleteSketchImage,
    updateOrderInternalNotes,
    sendDashboardWhatsApp,
    saveTemplate,
    deleteTemplate,
    getSketchDownloadUrl,
    debugOrderMatch,
    resendPromoCoupon,
    cancelPromoCouponNoShow,
    cancelRescheduleRequest,
    approveRescheduleRequest,
    rejectRescheduleRequest,
} from 'backend/dashboardService.web.js';

import {
    markReadyForPickup,
    markItemsCollected,
} from 'backend/pickupService.web.js';

import {
    getStaffAdminData,
    updateEmployeeProfile,
    sendAvailabilityNudge,
} from 'backend/staffAdminService.web.js';

import { initiateAdminOtp } from 'backend/bookingService.web.js';

const DASHBOARD_ELEMENT_ID = '#workshopsDashboard1';

const VELO_DEBUG_BUILD = '2026-07-28-staff-tab-v2';

function veloStaffDebug(label, payload) {

    // console.log(`[staff-admin][velo] ${label}`, payload);

}

let __wdLoadInFlight = null;

let __wdLoadGeneration = 0;

// Remembers the last filters used (e.g. { includeAllOrders: true } from the

// dashboard's "show all orders" toggle), so that reloads triggered by a

// mutation (sketch update, notes, WhatsApp, templates) keep respecting the

// user's current toggle state instead of silently resetting it.

let __wdLastFilters = {};

$w.onReady(function () {

    veloStaffDebug('onReady', { build: VELO_DEBUG_BUILD, elementId: DASHBOARD_ELEMENT_ID });

    const dashboardEl = $w(DASHBOARD_ELEMENT_ID);

    if (!dashboardEl) {

        console.error(`[staff-admin][velo] ELEMENT_NOT_FOUND — ${DASHBOARD_ELEMENT_ID} missing on page`);

        return;

    }

    // Standalone permission probe — runs even if CE file is stale.

    getCurrentDashboardUser()

        .then((user) => {

            const p = user?.permissions || {};

            veloStaffDebug('getCurrentDashboardUser', {

                name: user?.name,

                email: user?.email,

                role: user?.role,

                viewDashboard: p.viewDashboard,

                manageEmployees: p.manageEmployees,

                manageScheduling: p.manageScheduling,

                viewTeamSchedule: p.viewTeamSchedule,

            });

        })

        .catch((err) => {

            veloStaffDebug('getCurrentDashboardUser FAILED', { message: err?.message || String(err) });

        });

    dashboardEl.on('dashboard-action', (event) => {

        const type = event?.detail?.type;

        if (type && String(type).startsWith('staffAdmin:')) {

            veloStaffDebug('action received', { type, payload: event.detail?.payload });

        }

        handleDashboardAction(dashboardEl, event.detail).catch((err) => {

            console.error('[staff-admin][velo] action error:', err?.message || err);

        });

    });

    loadAndPushData(dashboardEl);

});

async function loadAndPushData(dashboardEl, filters) {

    const generation = ++__wdLoadGeneration;

    const requestFilters = filters || {};

    const run = async () => {

        try {

            veloStaffDebug('getInitialDashboardData start', { filters: requestFilters });

            const data = await getInitialDashboardData(requestFilters);

            if (generation !== __wdLoadGeneration) return;

            const p = data?.currentUser?.permissions || {};

            veloStaffDebug('getInitialDashboardData ok', {

                workshops: (data?.workshops || []).length,

                orders: (data?.orders || []).length,

                currentUser: data?.currentUser ? {

                    name: data.currentUser.name,

                    role: data.currentUser.role,

                    manageEmployees: p.manageEmployees,

                } : null,

            });

            dashboardEl.setAttribute('dashboard-data', JSON.stringify({

                ...data,

                __fetchedAt: Date.now(),

            }));

        } catch (err) {

            if (generation !== __wdLoadGeneration) return;

            const message = err?.message || String(err);

            veloStaffDebug('getInitialDashboardData FAILED', { message });

            if (message.startsWith('ACCESS_DENIED')) {

                dashboardEl.setAttribute('dashboard-data', JSON.stringify({

                    error: 'ACCESS_DENIED',

                    __fetchedAt: Date.now(),

                }));

            }

        } finally {

            if (generation === __wdLoadGeneration) {

                __wdLoadInFlight = null;

            }

        }

    };

    __wdLoadInFlight = run();

    return __wdLoadInFlight;

}

// --- Staff & Shifts tab (Phase 2, Module B core) — isolated from the order

// dashboard's data flow: separate attributes, no interaction with __wdLastFilters.

let __saLoadGeneration = 0;

async function loadAndPushStaffAdminData(dashboardEl, monthKey) {

    const generation = ++__saLoadGeneration;

    try {

        veloStaffDebug('getStaffAdminData start', { monthKey });

        const data = await getStaffAdminData({ monthKey });

        if (generation !== __saLoadGeneration) return;

        veloStaffDebug('getStaffAdminData ok', {

            monthKey: data?.monthKey,

            employees: (data?.employees || []).length,

        });

        dashboardEl.setAttribute('staff-admin-data', JSON.stringify({ ...data, __fetchedAt: Date.now() }));

    } catch (err) {

        if (generation !== __saLoadGeneration) return;

        veloStaffDebug('getStaffAdminData FAILED', { message: err?.message || String(err) });

        dashboardEl.setAttribute('staff-admin-data', JSON.stringify({ error: true, message: err?.message || String(err), __ts: Date.now() }));

    }

}

function pushStaffAdminActionResult(dashboardEl, result) {

    dashboardEl.setAttribute('staff-admin-action-result', JSON.stringify({ ...result, __ts: Date.now() }));

}

async function handleStaffAdminAction(dashboardEl, type, payload) {

    switch (type) {

    case 'staffAdmin:load':

        await loadAndPushStaffAdminData(dashboardEl, payload?.monthKey);

        return;

    case 'staffAdmin:updateEmployee': {

        const result = await updateEmployeeProfile(payload?.id, payload?.patch || {});

        pushStaffAdminActionResult(dashboardEl, { type: 'updateEmployeeProfile', ...result });

        await loadAndPushStaffAdminData(dashboardEl, payload?.monthKey);

        return;

    }

    case 'staffAdmin:sendNudge': {

        const result = await sendAvailabilityNudge(payload?.roleIds || [], payload?.message || '');

        pushStaffAdminActionResult(dashboardEl, { type: 'sendAvailabilityNudge', ...result });

        return;

    }

    default:

        return;

    }

}

async function handleDashboardAction(dashboardEl, detail) {

    const { type, payload } = detail || {};

    if (!type) return;

    if (typeof type === 'string' && type.startsWith('staffAdmin:')) {

        await handleStaffAdminAction(dashboardEl, type, payload);

        return;

    }

    switch (type) {

    case 'refresh':

        __wdLastFilters = payload || {};

        await loadAndPushData(dashboardEl, {

            ...__wdLastFilters,

            refreshOnly: true,

        });

        return;

    case 'updateSketchState':

        try {

            await updateSketchState(payload.orderId, payload.sketchId, payload.newStatus, {

                expectedUpdatedDate: payload.expectedUpdatedDate || null,

            });

        } catch (err) {

            const message = err?.message || String(err);

            if (message.startsWith('CONFLICT')) {

                console.warn('[order-managment-dashboard-velo] updateSketchState conflict:', message);

                dashboardEl.setAttribute('action-error', JSON.stringify({

                    type: 'updateSketchState',

                    sketchId: payload.sketchId,

                    message: 'הסקיצה השתנתה על ידי מישהו אחר — הנתונים רועננו לגרסה העדכנית.',

                    __ts: Date.now(),

                }));

            } else {

                throw err;

            }

        }

        break;

    case 'deleteSketchImage':

        await deleteSketchImage(payload.orderId, payload.sketchId);

        break;

    case 'updateOrderInternalNotes':

        await updateOrderInternalNotes(payload.orderId, payload.text);

        break;

    case 'sendWhatsApp':

        if (payload.template === 'admin_otp_new1') {

            await initiateAdminOtp(payload.orderId, payload.phone);

        } else {

            await sendDashboardWhatsApp(payload.orderId, payload.phone, { template: payload.template });

        }

        break;

    case 'resendPromoCoupon':

        await resendPromoCoupon(payload.orderId);

        break;

    case 'cancelPromoCouponNoShow':

        await cancelPromoCouponNoShow(payload.orderId);

        break;

    case 'cancelRescheduleRequest':

        await cancelRescheduleRequest(payload.orderId);

        break;

    case 'approveRescheduleRequest':

        await approveRescheduleRequest(payload.orderId, payload.manualActionConfirmed);

        break;

    case 'rejectRescheduleRequest':

        await rejectRescheduleRequest(payload.orderId, payload.reason);

        break;

    case 'markReadyForPickup':

        try {

            await markReadyForPickup(payload.orderId, payload.items, {

                organizerPhone: payload.organizerPhone,

                organizerName: payload.organizerName,

            });

        } catch (err) {

            reportPickupActionError(dashboardEl, 'markReadyForPickup', payload, err);

            return;

        }

        break;

    case 'markItemsCollected':

        try {

            await markItemsCollected(payload.orderId, payload.items, {

                confirmedNotReady: !!payload.confirmedNotReady,

            });

        } catch (err) {

            reportPickupActionError(dashboardEl, 'markItemsCollected', payload, err);

            return;

        }

        break;

    case 'saveTemplate':

        await saveTemplate(payload);

        break;

    case 'deleteTemplate':

        await deleteTemplate(payload.id);

        break;

    case 'debugOrderMatch':

        try {

            const report = await debugOrderMatch(payload?.orderId);

            dashboardEl.setAttribute('order-debug', JSON.stringify({

                ...report,

                __ts: Date.now(),

            }));

        } catch (err) {

            console.error('[order-managment-dashboard-velo] debugOrderMatch failed:', err?.message || err);

            dashboardEl.setAttribute('order-debug', JSON.stringify({

                ok: false,

                orderId: payload?.orderId || null,

                error: err?.message || String(err),

                diagnosis: [{ code: 'error', text: err?.message || String(err) }],

                __ts: Date.now(),

            }));

        }

        return;

    case 'getSketchDownloadUrl':

        try {

            const downloadUrl = await getSketchDownloadUrl(payload.fileUrl, {

                sketchId: payload.sketchId || null,

                downloadedFileName: payload.downloadedFileName || null,

                expirationTime: payload.expirationTime,

            });

            dashboardEl.setAttribute('sketch-download', JSON.stringify({

                requestId: payload.requestId || null,

                url: downloadUrl,

                __ts: Date.now(),

            }));

        } catch (err) {

            console.error('[order-managment-dashboard-velo] getSketchDownloadUrl failed:', err?.message || err);

            dashboardEl.setAttribute('sketch-download', JSON.stringify({

                requestId: payload.requestId || null,

                error: err?.message || String(err),

                __ts: Date.now(),

            }));

        }

        return;

    default:

        console.warn('[order-managment-dashboard-velo] Unknown dashboard-action type:', type);

        return;

    }

    await loadAndPushData(dashboardEl, __wdLastFilters);

}

// --- Pickup ("מוכן לאיסוף" / "פריט נאסף") error reporting -----------------

// pickupService throws plain Error objects with a `CODE:message` convention
// (see pickupService.web.js). NOT_READY_CONFIRMATION_REQUIRED needs a
// dedicated confirm-style popup (not a plain alert) — the CE inspects
// `code`/`items`/`orderId` on the action-error payload to render it and,
// if the user confirms, retries the same action with confirmedNotReady:true.

function parsePickupError(err) {

    const raw = err?.message || String(err);

    const sepIndex = raw.indexOf(':');

    if (sepIndex === -1) return { code: 'GENERIC', message: raw };

    const code = raw.slice(0, sepIndex);

    const rest = raw.slice(sepIndex + 1);

    if (code === 'NOT_READY_CONFIRMATION_REQUIRED') {

        return { code, message: `הפריטים הבאים לא סומנו כ"מוכן לאיסוף" קודם: ${rest}. להמשיך ולסמן כנאסף בכל זאת?` };

    }

    if (code === 'WORKSHOP_NOT_ENDED') {

        return { code, message: rest || 'לא ניתן לסמן פריט כמוכן לאיסוף לפני שהסדנה הסתיימה.' };

    }

    return { code: 'GENERIC', message: raw };

}

function reportPickupActionError(dashboardEl, actionType, payload, err) {

    const { code, message } = parsePickupError(err);

    console.error(`[order-managment-dashboard-velo] ${actionType} failed:`, message);

    dashboardEl.setAttribute('action-error', JSON.stringify({

        type: actionType,

        code,

        message,

        orderId: payload?.orderId || null,

        items: payload?.items || null,

        __ts: Date.now(),

    }));

}