/**
 * Employee Portal — page code (Modules A+B+C)
 *
 * Editor setup required:
 *  - Create a members-only page ("פורטל עובדים") and add the `employee-portal`
 *    custom element (source file: src/public/custom-elements/employee-portal.js).
 *  - This file assumes the element's ID is `#employeePortal1` (Wix's default
 *    ID for the first instance). If renamed in the editor, update
 *    PORTAL_ELEMENT_ID below.
 *  - IMPORTANT: once the element is added via the Wix Editor, Wix generates
 *    the actual page code file (e.g. "Employee Portal.abc12.js"). Copy the
 *    contents of this file into that generated file — this file is a
 *    reference implementation, not a page Wix picks up automatically.
 *
 * Data flow (same pattern as workshop-dashboard.js):
 *  - `portal-data` attribute ← getMyPortalData(); `admin-data` ← getStaffAdminData().
 *  - `portal-action` CustomEvents route to backend web methods; results pushed
 *    via `action-result`, then fresh data is re-pushed.
 *  - Realtime: subscribes to the `scheduling-updates` channel and refreshes
 *    all connected clients when scheduling data changes anywhere.
 */
import { subscribe } from 'wix-realtime';
import { authentication } from 'wix-members-frontend';
import {
    getMyPortalData,
    submitAvailability,
    withdrawAvailability,
    updateSubmission,
} from 'backend/employeeService.web.js';
import {
    requestShiftChange,
    acknowledgeShiftRequest,
} from 'backend/shiftChangeRequests.web.js';
import {
    loadSwapCandidates,
    requestShiftSwap,
    acknowledgeShiftSwap,
} from 'backend/shiftSwaps.web.js';
import {
    getStaffAdminData,
    saveEmployeeAdmin,
    updateEmployeeProfile,
    updateEmployeePermissions,
    updateSchedulingRule,
    updateDayFlags,
    updateHolidays,
    updateAvailabilitySettings,
    getStaffTemplates,
    saveStaffTemplate,
    deleteStaffTemplate,
    sendAvailabilityNudge,
    manualAssign,
    cancelAssignment,
    approveSubmission,
    rejectSubmission,
    updateSubmissionWorkType,
    listBookingStaff,
    linkEmployeeStaff,
    listVacations,
    saveEmployeeVacation,
    deleteEmployeeVacation,
} from 'backend/staffAdminService.web.js';
import {
    runSchedulingNow,
    respondToOffer,
    claimOpenCall,
} from 'backend/schedulingService.web.js';
import {
    getMyTimeEntries,
    approveMyMonth,
    getTeamTime,
    upsertTimeEntry,
    deleteTimeEntry,
    exportMonthCsv,
} from 'backend/timeClockService.web.js';
import {
    getMyMessages,
    listAllMessages,
    saveMessage,
    deleteMessage,
} from 'backend/messagingService.web.js';

const PORTAL_ELEMENT_ID = '#employeePortal1';
const REALTIME_DEBOUNCE_MS = 1500;

let __epLoadGeneration = 0;
let __epAdminGeneration = 0;
let __epLastAdminMonth = null;
let __epRealtimeTimer = null;
let __epSuppressRealtimeUntil = 0;

$w.onReady(function () {
    console.log('[employee-portal] $w.onReady fired');

    const portalEl = $w(PORTAL_ELEMENT_ID);
    if (!portalEl) {
        console.error(`[employee-portal] ELEMENT NOT FOUND: ${PORTAL_ELEMENT_ID}`);
        console.error('[employee-portal] Check: Custom Element on page, tag=employee-portal, ID matches PORTAL_ELEMENT_ID');
        return;
    }

    console.log('[employee-portal] element found', {
        id: PORTAL_ELEMENT_ID,
        hasOn: typeof portalEl.on === 'function',
        hasSetAttribute: typeof portalEl.setAttribute === 'function',
    });

    portalEl.on('portal-action', (event) => {
        console.log('[employee-portal] page ← portal-action', event.detail?.type, event.detail?.payload ?? '');
        handlePortalAction(portalEl, event.detail).catch((err) => {
            console.error('[employee-portal] Unhandled action error:', err?.message || err, err?.stack || '');
            pushActionResult(portalEl, {
                type: event.detail?.type || 'unknown',
                error: true,
                message: friendlyError(err),
            });
        });
    });

    subscribeToRealtime(portalEl);
    loadAndPushData(portalEl).catch((err) => {
        console.error('[employee-portal] loadAndPushData unhandled:', err?.message || err);
    });
});

/** Debounced refresh whenever any client changes scheduling data. */
function subscribeToRealtime(portalEl) {
    subscribe({ name: 'scheduling-updates' }, () => {
        if (Date.now() < __epSuppressRealtimeUntil) return;
        console.log('[employee-portal] realtime scheduling-updates → refresh');
        clearTimeout(__epRealtimeTimer);
        __epRealtimeTimer = setTimeout(() => {
            loadAndPushData(portalEl);
            if (__epLastAdminMonth) loadAndPushAdminData(portalEl, __epLastAdminMonth);
        }, REALTIME_DEBOUNCE_MS);
    }).catch((err) => {
        console.warn('[employee-portal] realtime subscribe failed:', err?.message || err);
    });
}

function friendlyError(err) {
    const message = err?.message || String(err);
    // Backend errors carry a Hebrew explanation after the code prefix.
    const parts = message.split(':');
    if (parts.length > 1 && /[\u0590-\u05FF]/.test(parts.slice(1).join(':'))) {
        return parts.slice(1).join(':').trim();
    }
    return 'אירעה שגיאה. נסו שוב.';
}

async function loadAndPushData(portalEl) {
    const generation = ++__epLoadGeneration;
    const t0 = Date.now();
    console.log('[employee-portal] loadAndPushData start', { generation });

    try {
        console.log('[employee-portal] calling getMyPortalData()…');
        const data = await getMyPortalData();
        const elapsed = Date.now() - t0;

        if (generation !== __epLoadGeneration) {
            console.log('[employee-portal] loadAndPushData stale — skipped', { generation, current: __epLoadGeneration });
            return;
        }

        console.log('[employee-portal] getMyPortalData OK', {
            elapsedMs: elapsed,
            user: data?.user?.name,
            roleType: data?.user?.roleType,
            submissions: data?.submissions?.length ?? 0,
            months: data?.months?.length ?? 0,
            hasUser: !!data?.user,
        });

        if (!data?.user) {
            console.error('[employee-portal] getMyPortalData returned no user object — CE will stay on loading');
        }

        const json = JSON.stringify({ ...data, __fetchedAt: Date.now() });
        console.log('[employee-portal] setAttribute portal-data', { bytes: json.length });
        portalEl.setAttribute('portal-data', json);
        console.log('[employee-portal] portal-data pushed successfully');
    } catch (err) {
        if (generation !== __epLoadGeneration) return;

        const message = err?.message || String(err);
        const elapsed = Date.now() - t0;
        console.error('[employee-portal] loadAndPushData FAILED', {
            elapsedMs: elapsed,
            message,
            stack: err?.stack || '(no stack)',
        });

        // Always push something to the CE — otherwise it stays on the loading spinner forever.
        const payload = message.startsWith('ACCESS_DENIED') || message.startsWith('PERMISSION_DENIED')
            ? { error: 'ACCESS_DENIED', message }
            : { error: 'LOAD_FAILED', message };

        console.log('[employee-portal] pushing error state to CE:', payload.error);
        portalEl.setAttribute('portal-data', JSON.stringify({
            ...payload,
            __fetchedAt: Date.now(),
        }));
    }
}

async function loadAndPushAdminData(portalEl, monthKey) {
    const generation = ++__epAdminGeneration;
    __epLastAdminMonth = monthKey;
    try {
        const data = await getStaffAdminData(monthKey);
        if (generation !== __epAdminGeneration) return;
        console.log('[employee-portal] page → admin-data pushed', {
            month: data.monthKey,
            employees: data.employees?.length ?? 0,
        });
        portalEl.setAttribute('admin-data', JSON.stringify({
            ...data,
            __fetchedAt: Date.now(),
        }));
    } catch (err) {
        if (generation !== __epAdminGeneration) return;
        console.error('[employee-portal] Failed to load admin data:', err?.message || err);
    }
}

async function loadAndPushHoursData(portalEl, monthKey) {
    try {
        const data = await getMyTimeEntries(monthKey);
        console.log('[employee-portal] page → hours-data pushed', {
            month: data.monthKey,
            entries: data.entries?.length ?? 0,
        });
        portalEl.setAttribute('hours-data', JSON.stringify({
            ...data,
            __fetchedAt: Date.now(),
        }));
    } catch (err) {
        console.error('[employee-portal] Failed to load hours data:', err?.message || err);
        pushActionResult(portalEl, { type: 'loadMyHours', error: true, message: friendlyError(err) });
    }
}

async function loadAndPushTemplates(portalEl) {
    const templates = await getStaffTemplates();
    portalEl.setAttribute('templates-data', JSON.stringify(templates));
}

async function loadAndPushStaffList(portalEl) {
    const staff = await listBookingStaff();
    portalEl.setAttribute('staff-data', JSON.stringify({ staff, __fetchedAt: Date.now() }));
}

async function loadAndPushTeamTime(portalEl, monthKey) {
    try {
        const data = await getTeamTime(monthKey);
        portalEl.setAttribute('team-time-data', JSON.stringify({ ...data, __fetchedAt: Date.now() }));
    } catch (err) {
        console.error('[employee-portal] Failed to load team time:', err?.message || err);
        pushActionResult(portalEl, { type: 'adminTeamTimeLoad', error: true, message: friendlyError(err) });
    }
}

async function loadAndPushMessages(portalEl) {
    try {
        const data = await getMyMessages();
        portalEl.setAttribute('messages-data', JSON.stringify({ ...data, __fetchedAt: Date.now() }));
    } catch (err) {
        console.error('[employee-portal] Failed to load messages:', err?.message || err);
        pushActionResult(portalEl, { type: 'loadMyMessages', error: true, message: friendlyError(err) });
    }
}

async function loadAndPushVacations(portalEl) {
    try {
        const vacations = await listVacations();
        portalEl.setAttribute('vacations-data', JSON.stringify(vacations));
    } catch (err) {
        console.error('[employee-portal] Failed to load vacations:', err?.message || err);
        pushActionResult(portalEl, { type: 'adminVacationsLoad', error: true, message: friendlyError(err) });
    }
}

async function loadAndPushAdminMessages(portalEl) {
    try {
        const messages = await listAllMessages();
        portalEl.setAttribute('messages-admin-data', JSON.stringify({ messages, __fetchedAt: Date.now() }));
    } catch (err) {
        console.error('[employee-portal] Failed to load admin messages:', err?.message || err);
        pushActionResult(portalEl, { type: 'adminMessagesLoad', error: true, message: friendlyError(err) });
    }
}

function pushActionResult(portalEl, result) {
    portalEl.setAttribute('action-result', JSON.stringify({
        ...result,
        __ts: Date.now(),
    }));
}

async function handlePortalAction(portalEl, detail) {
    const { type, payload } = detail || {};
    if (!type) return;

    let refreshPortal = true;
    let refreshAdmin = !!__epLastAdminMonth;

    switch (type) {
        case 'refresh':
            break;

        case 'promptLogin':
            refreshPortal = false;
            refreshAdmin = false;
            try {
                await authentication.promptLogin({ mode: 'login', modal: true });
                await loadAndPushData(portalEl);
            } catch (err) {
                console.warn('[employee-portal] promptLogin cancelled/failed:', err?.message || err);
            }
            return;

        case 'submitAvailability': {
            const result = await submitAvailability(payload?.shifts || []);
            console.log('[employee-portal] submitAvailability result', result);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        case 'withdrawAvailability': {
            await withdrawAvailability(payload?.id);
            pushActionResult(portalEl, { type, ok: true });
            break;
        }

        case 'updateSubmission': {
            const result = await updateSubmission(payload?.id, payload?.patch);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        case 'requestShiftChange': {
            const result = await requestShiftChange(payload?.submissionId, payload?.payload);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        case 'acknowledgeShiftRequest': {
            const result = await acknowledgeShiftRequest(payload?.requestId);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        case 'loadSwapCandidates': {
            const result = await loadSwapCandidates(payload?.submissionId);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            return;
        }

        case 'createSwapRequest': {
            const result = await requestShiftSwap(payload?.submissionId, payload?.targetEmployeeId);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        case 'acknowledgeShiftSwap': {
            const result = await acknowledgeShiftSwap(payload?.swapId);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        case 'respondToOffer': {
            const result = await respondToOffer(payload?.offerId, !!payload?.accept);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        case 'claimOpenCall': {
            const result = await claimOpenCall(payload?.callId);
            pushActionResult(portalEl, { type, ...result });
            break;
        }

        // --- Hours tab actions (timeClockService) ---

        case 'loadMyHours':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushHoursData(portalEl, payload?.monthKey);
            return;

        case 'approveMyMonth': {
            const result = await approveMyMonth(payload?.monthKey);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushHoursData(portalEl, payload?.monthKey);
            break;
        }

        // --- Messaging (messagingService) ---

        case 'loadMyMessages':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushMessages(portalEl);
            return;

        case 'adminMessagesLoad':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushAdminMessages(portalEl);
            return;

        case 'adminMessageSave': {
            const result = await saveMessage(payload?.message);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushAdminMessages(portalEl);
            break;
        }

        case 'adminMessageDelete': {
            const result = await deleteMessage(payload?.messageId);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushAdminMessages(portalEl);
            break;
        }

        case 'adminVacationsLoad':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushVacations(portalEl);
            return;

        case 'adminSaveVacation': {
            const result = await saveEmployeeVacation(payload?.vacation);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushVacations(portalEl);
            break;
        }

        case 'adminDeleteVacation': {
            const result = await deleteEmployeeVacation(payload?.vacationId);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushVacations(portalEl);
            break;
        }

        // --- Admin tab actions (staffAdminService / schedulingService) ---

        case 'adminLoad':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushAdminData(portalEl, payload?.monthKey);
            return;

        case 'adminSaveEmployee': {
            const result = await saveEmployeeAdmin(payload?.roleId, payload?.patch, payload?.permissions || null);
            __epSuppressRealtimeUntil = Date.now() + 4000;
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = true;
            break;
        }

        case 'adminUpdateEmployee': {
            const result = await updateEmployeeProfile(payload?.roleId, payload?.patch);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = true;
            break;
        }

        case 'adminUpdateEmployeePermissions': {
            const result = await updateEmployeePermissions(payload?.roleId, payload?.permissions);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = true;
            break;
        }

        case 'adminStaffLoad':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushStaffList(portalEl);
            return;

        case 'adminLinkStaff': {
            const result = await linkEmployeeStaff(payload?.staffId, payload?.patch);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = true;
            await loadAndPushStaffList(portalEl);
            break;
        }

        case 'adminTeamTimeLoad':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushTeamTime(portalEl, payload?.monthKey);
            return;

        case 'adminTeamTimeUpsert': {
            const result = await upsertTimeEntry(payload?.entry);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushTeamTime(portalEl, payload?.monthKey);
            break;
        }

        case 'adminTeamTimeDelete': {
            const result = await deleteTimeEntry(payload?.entryId);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushTeamTime(portalEl, payload?.monthKey);
            break;
        }

        case 'adminTeamTimeExport': {
            const result = await exportMonthCsv(payload?.monthKey);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            break;
        }

        case 'adminUpdateRule': {
            const result = await updateSchedulingRule(payload?.workshopTypeId, payload?.patch);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = true;
            break;
        }

        case 'adminUpdateSettings': {
            const result = await updateAvailabilitySettings(payload?.patch);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = true;
            refreshAdmin = true;
            break;
        }

        case 'adminUpdateHolidays': {
            const result = await updateHolidays(payload?.holidays || []);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = true;
            refreshAdmin = true;
            break;
        }

        case 'adminTemplatesLoad':
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushTemplates(portalEl);
            return;

        case 'adminTemplateSave': {
            const result = await saveStaffTemplate(payload?.template);
            pushActionResult(portalEl, { type, ok: true, template: result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushTemplates(portalEl);
            break;
        }

        case 'adminTemplateDelete': {
            const result = await deleteStaffTemplate(payload?.templateId);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            await loadAndPushTemplates(portalEl);
            break;
        }

        case 'adminDayFlags': {
            const result = await updateDayFlags(payload?.dateKey, payload?.flags);
            pushActionResult(portalEl, { type, ...result });
            refreshAdmin = true;
            break;
        }

        case 'adminNudge': {
            const result = await sendAvailabilityNudge(payload?.roleIds, payload?.monthKey);
            pushActionResult(portalEl, { type, ...result });
            refreshPortal = false;
            refreshAdmin = false;
            break;
        }

        case 'adminManualAssign': {
            const result = await manualAssign(payload?.dateKey, payload?.workshopTypeId, payload?.employeeId, payload?.workType);
            pushActionResult(portalEl, { type, ...result });
            refreshAdmin = true;
            break;
        }

        case 'adminApproveSubmission': {
            const result = await approveSubmission(payload?.submissionId, payload?.workshopTypeId, payload?.workType);
            pushActionResult(portalEl, { type, ...result });
            refreshAdmin = true;
            break;
        }

        case 'adminRejectSubmission': {
            const result = await rejectSubmission(payload?.submissionId);
            pushActionResult(portalEl, { type, ...result });
            refreshAdmin = true;
            break;
        }

        case 'adminUpdateWorkType': {
            const result = await updateSubmissionWorkType(payload?.submissionId, payload?.workType);
            pushActionResult(portalEl, { type, ...result });
            refreshAdmin = true;
            break;
        }

        case 'adminCancelAssignment': {
            const result = await cancelAssignment(payload?.dateKey, payload?.workshopTypeId, payload?.employeeId);
            pushActionResult(portalEl, { type, ...result });
            refreshAdmin = true;
            break;
        }

        case 'adminRunScheduling': {
            const result = await runSchedulingNow(payload?.scope);
            pushActionResult(portalEl, { type, ...result });
            refreshAdmin = true;
            break;
        }

        default:
            console.warn('[employee-portal] Unknown portal-action type:', type);
            return;
    }

    // Mutations re-fetch so both tabs reflect authoritative state.
    if (refreshPortal) await loadAndPushData(portalEl);
    if (refreshAdmin && __epLastAdminMonth) await loadAndPushAdminData(portalEl, __epLastAdminMonth);
}
