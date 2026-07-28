/**

 * Employee Portal — Velo page code (reference, Module A)

 *

 * Pairs with CE: src/public/custom-elements/employee-portal.js

 *

 * Editor setup required:

 *  - Create a members-only page ("פורטל עובדים") and add the `employee-portal`

 *    custom element (source file above).

 *  - This file assumes the element's ID is `#employeePortal1` (Wix's default

 *    ID for the first instance). If renamed in the editor, update

 *    PORTAL_ELEMENT_ID below.

 *  - IMPORTANT: once the element is added via the Wix Editor, Wix generates

 *    the actual page code file (e.g. "Employee Portal.abc12.js"). Copy the

 *    contents of THIS file into that generated file — this file is a

 *    reference implementation, not a page Wix picks up automatically.

 *

 * Data flow (same pattern as order-managment-dashboard-velo.js):

 *  - On load, fetches getMyPortalData() → pushes into the element via the

 *    `portal-data` attribute (JSON string).

 *  - Listens for `portal-action` CustomEvents (submitAvailability /

 *    withdrawAvailability / refresh), routes to backend web methods, pushes

 *    the action result via `action-result`, then re-pushes fresh data.

 */

import {

    getMyPortalData,

    submitAvailability,

    withdrawAvailability,

} from 'backend/employeeService.web.js';

const PORTAL_ELEMENT_ID = '#employeePortal1';

let __epLoadGeneration = 0;

$w.onReady(function () {

    const portalEl = $w(PORTAL_ELEMENT_ID);

    if (!portalEl) {

        console.error(`[employee-portal-velo] ${PORTAL_ELEMENT_ID} not found on page!`);

        return;

    }

    portalEl.on('portal-action', (event) => {

        handlePortalAction(portalEl, event.detail).catch((err) => {

            console.error('[employee-portal-velo] Unhandled action error:', err?.message || err);

            pushActionResult(portalEl, {

                type: event.detail?.type || 'unknown',

                error: true,

                message: friendlyError(err),

            });

        });

    });

    loadAndPushData(portalEl);

});

function friendlyError(err) {

    const message = err?.message || String(err);

    const parts = message.split(':');

    if (parts.length > 1 && /[\u0590-\u05FF]/.test(parts.slice(1).join(':'))) {

        return parts.slice(1).join(':').trim();

    }

    return 'אירעה שגיאה. נסו שוב.';

}

async function loadAndPushData(portalEl) {

    const generation = ++__epLoadGeneration;

    try {

        const data = await getMyPortalData();

        if (generation !== __epLoadGeneration) return;

        portalEl.setAttribute('portal-data', JSON.stringify({

            ...data,

            __fetchedAt: Date.now(),

        }));

    } catch (err) {

        if (generation !== __epLoadGeneration) return;

        const message = err?.message || String(err);

        console.error('[employee-portal-velo] Failed to load portal data:', message);

        if (message.startsWith('ACCESS_DENIED') || message.startsWith('PERMISSION_DENIED')) {

            portalEl.setAttribute('portal-data', JSON.stringify({

                error: 'ACCESS_DENIED',

                __fetchedAt: Date.now(),

            }));

        }

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

    switch (type) {

    case 'refresh':

        await loadAndPushData(portalEl);

        return;

    case 'submitAvailability': {

        const result = await submitAvailability(payload?.shifts || []);

        pushActionResult(portalEl, { type, ...result });

        break;

    }

    case 'withdrawAvailability': {

        await withdrawAvailability(payload?.id);

        pushActionResult(portalEl, { type, ok: true });

        break;

    }

    default:

        console.warn('[employee-portal-velo] Unknown portal-action type:', type);

        return;

    }

    await loadAndPushData(portalEl);

}