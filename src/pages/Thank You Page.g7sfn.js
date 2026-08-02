/**
 * Thank You Page — Wix eCommerce
 *
 * Order resolution priority (the LIVE eCom order tied to *this* Thank You page
 * visit is always authoritative — this guarantees a customer who has placed
 * multiple orders always sees the order that was just paid for, never a stale
 * one cached from an earlier visit):
 * 1. getOrder() → resolveWorkshopOrderFromEcom (CMS lookup, with retries)
 * 2. local.getItem('workshop_order_id') — degraded fallback only used when
 *    getOrder() is unavailable or no eCom order could be resolved at all.
 *
 * If a WorkshopOrder exists in CMS → show new hub UI (iframe).
 * If not → show default Wix Thank You page. This is the ONLY place the
 * iframe gets revealed — it is never shown speculatively before a match is
 * confirmed, since every eCom checkout on the site (not just tapting
 * workshop orders) lands on this page.
 * On success, persist the resolved order ID in local storage (mainly so a
 * plain page refresh, with no new checkout involved, stays on the same order).
 */
import { local } from "wix-storage-frontend";
import wixPay from 'wix-pay';
import wixWindowFrontend from 'wix-window-frontend';
import {
    confirmOrderPayment,
    resolveWorkshopOrderFromEcom,
    getOrderContext,
    getOrderHistoryForBuyer,
    generateOrganizerToken,
    setOrderSelectionMode,
    saveParticipants,
    updateParticipant,
    generateParticipantLinks,
    createParticipantGroup,
    deleteParticipantGroup,
    deleteOrganizerSelectionGroup,
    deleteEditableSketchSelection,
    saveSketchSelection,
    updateOrderSettings,
    createCanvasUpgradePayment,
    verifyAccessToken,
    getProductsCatalog,
    checkEditingAllowed,
    verifySketchForEdit,
    getGroupDeletionPreview,
    checkGroupDeletable,
    clearAllOrderData,
    validateImage,
    startGenerateSketch,
    getSketchJobStatus,
    saveApprovedSketch,
    submitFeedback,
    checkAIRateLimit,
    getAITermsStatus,
    acceptAITerms,
} from 'backend/bookingService.web.js';

let resolvedSection = null;
let pendingIframePayload = null;
const ORDER_CONTEXT_REFRESH_MS = 5 * 60 * 1000;
let orderContextRefreshTimer = null;
let activeWorkshopOrderId = null;

function stopOrderContextRefresh() {
    if (orderContextRefreshTimer) {
        clearInterval(orderContextRefreshTimer);
        orderContextRefreshTimer = null;
    }
}

async function refreshOrderContext(iframe, workshopOrderId) {
    if (!iframe || !workshopOrderId) return;
    try {
        const orderContext = await getOrderContext(workshopOrderId);
        if (!orderContext?.order) return;

        if (pendingIframePayload?.type === 'ORDER_CONTEXT') {
            pendingIframePayload = {
                ...pendingIframePayload,
                orderContext,
                ecomSummary: orderContext.ecomSummary || pendingIframePayload.ecomSummary || null,
            };
        } else {
            pendingIframePayload = {
                type: 'ORDER_CONTEXT',
                orderContext,
                role: 'organizer',
                workshopOrderId,
                ecomSummary: orderContext.ecomSummary || null,
            };
        }

        iframe.postMessage(pendingIframePayload);
        console.log('[ThankYouPage] ORDER_CONTEXT refreshed');
    } catch (err) {
        console.warn('[ThankYouPage] ORDER_CONTEXT refresh failed:', err?.message || err);
    }
}

function startOrderContextRefresh(iframe, workshopOrderId) {
    stopOrderContextRefresh();
    activeWorkshopOrderId = workshopOrderId;
    if (!iframe || !workshopOrderId) return;
    orderContextRefreshTimer = setInterval(() => {
        refreshOrderContext(iframe, activeWorkshopOrderId);
    }, ORDER_CONTEXT_REFRESH_MS);
}

$w.onReady(async function () {
    const thankYouPage = $w('#thankYouPage');
    const iframe = $w('#htmlComponent1');

    // section4 is always visible (set in Editor).
    // thankYouPage and section16 start hidden or collapsed (set in Editor).
    // #hideMe is the loading element inside section4 — hide it after 6 seconds max.
    const fallbackTimer = setTimeout(() => {
        if (!resolvedSection) {
            console.log('[ThankYouPage] Fallback timeout — showing thankYouPage');
            showSection('thankYouPage');
        }
    }, 12000);

    // Register iframe message handler early
    if (iframe) {
        iframe.onMessage(async (event) => {
            const data = event.data;
            if (!data || !data.type) return;

            if (data.type === 'IFRAME_READY') {
                console.log('[ThankYouPage] IFRAME_READY received');
                if (pendingIframePayload) {
                    iframe.postMessage(pendingIframePayload);
                    console.log('[ThankYouPage] ORDER_CONTEXT re-sent after IFRAME_READY');
                } else if (data.data?.orderId) {
                    await loadAndShowOrderHub(data.data.orderId, iframe, fallbackTimer);
                }
                return;
            }

            await handlePostPaymentMessage(data, iframe);
        });
    }

    // --- Step 1 (authoritative): resolve against the eCom order that triggered THIS visit ---
    // The iframe hub is only revealed once a WorkshopOrder match is actually
    // confirmed (inside loadAndShowOrderHub below) — never speculatively,
    // since this resolution runs for EVERY completed eCom order on the site,
    // not just tapting workshop orders.
    const resolvedFromEcom = await resolveCurrentEcomOrder(thankYouPage);

    if (resolvedFromEcom?.workshopOrderId) {
        try { local.setItem('workshop_order_id', resolvedFromEcom.workshopOrderId); } catch (_) {}
        await loadAndShowOrderHub(resolvedFromEcom.workshopOrderId, iframe, fallbackTimer, resolvedFromEcom.ecomOrder);
        return;
    }

    // This visit's eCom order was confirmed to exist but is definitively NOT
    // a tapting workshop order — never show the iframe hub for it, even if a
    // stale workshop_order_id from an earlier, unrelated visit is cached on
    // this device/browser.
    if (resolvedFromEcom?.noMatch) {
        console.log('[ThankYouPage] Confirmed non-workshop order — showing default thankYouPage');
        showSection('thankYouPage');
        clearTimeout(fallbackTimer);
        return;
    }

    // --- Step 2 (degraded fallback): only reached when getOrder() itself was
    // unavailable/returned nothing at all (no confirmed eCom order either
    // way) — fall back to a cached workshop order id from local storage. ---
    let sessionOrderId = null;
    try {
        sessionOrderId = local.getItem('workshop_order_id');
    } catch (e) {
        console.warn('[ThankYouPage] Could not read local storage:', e?.message);
    }

    if (sessionOrderId) {
        console.log('[ThankYouPage] Falling back to cached workshop order id:', sessionOrderId);
        await loadAndShowOrderHub(sessionOrderId, iframe, fallbackTimer);
    } else {
        console.log('[ThankYouPage] No ecom order and no cached order — showing default thankYouPage');
        showSection('thankYouPage');
        clearTimeout(fallbackTimer);
    }
});

async function loadAndShowOrderHub(workshopOrderId, iframe, fallbackTimer, ecomOrder) {
    try {
        const orderContext = await getOrderContext(workshopOrderId);
        if (!orderContext || !orderContext.order) {
            console.warn('[ThankYouPage] Order context empty — showing error state');
            showErrorInIframe(iframe, fallbackTimer);
            return;
        }

        const missingNotes = !orderContext.order.customerNotes && ecomOrder;
        if (orderContext.order.status !== 'paid' || missingNotes) {
            try {
                const updatedOrder = await confirmOrderPayment(workshopOrderId, ecomOrder || null);
                if (updatedOrder) orderContext.order = updatedOrder;
            } catch (e) {
                console.warn('[ThankYouPage] confirmOrderPayment skipped:', e?.message);
            }
        }

        // Persist for same-device refresh/revisit
        try { local.setItem('workshop_order_id', workshopOrderId); } catch (_) {}

        // Build ecomSummary from the live ecom order if available (richer —
        // includes workshop name/session date), otherwise fall back to the// CMS-derived summary that getOrderContext already computed.
        const order = orderContext.order;
        const ecomSummary = ecomOrder ?
            buildEcomSummary(ecomOrder) :
            orderContext.ecomSummary;

        // Paint the hub as soon as we have the core order context — token and
        // order history are non-blocking extras and are sent as a follow-up
        // patch once they resolve, so the user isn't stuck looking at a
        // spinner while those two extra calls finish.
        pendingIframePayload = {
            type: 'ORDER_CONTEXT',
            orderContext,
            role: 'organizer',
            organizerToken: null,
            workshopOrderId,
            ecomSummary,
            orderHistory: [],
        };

        console.log('[ThankYouPage] Showing section16, sending ORDER_CONTEXT to iframe');
        showSection('section16');
        clearTimeout(fallbackTimer);

        if (iframe) {
            iframe.postMessage(pendingIframePayload);
        }

        startOrderContextRefresh(iframe, workshopOrderId);

        // Non-blocking follow-up: organizer token + order history, run in
        // parallel and patched into the iframe once both settle.
        Promise.all([
            generateOrganizerToken(workshopOrderId).catch((tokenErr) => {
                console.warn('[ThankYouPage] generateOrganizerToken skipped:', tokenErr?.message);
                return null;
            }),
            getOrderHistoryForBuyer(order.organizerPhone, order.organizerEmail, workshopOrderId).catch((e) => {
                console.warn('[ThankYouPage] getOrderHistoryForBuyer skipped:', e?.message);
                return [];
            }),
        ]).then(([organizerToken, orderHistory]) => {
            if (pendingIframePayload?.type === 'ORDER_CONTEXT' && pendingIframePayload.workshopOrderId === workshopOrderId) {
                pendingIframePayload = { ...pendingIframePayload, organizerToken, orderHistory };
            }
            if (iframe) {
                iframe.postMessage({ type: 'ORDER_CONTEXT', orderContext, role: 'organizer', organizerToken, workshopOrderId, ecomSummary, orderHistory });
            }
        });
    } catch (err) {
        console.error('[ThankYouPage] Failed to load from session ID:', err?.message || err);
        showErrorInIframe(iframe, fallbackTimer);
    }
}

/**
 * Show section16 with an error payload so the iframe renders the
 * "could not load order" UI (with WhatsApp support link).
 */
function showErrorInIframe(iframe, fallbackTimer) {
    pendingIframePayload = { type: 'ORDER_CONTEXT', error: true };
    console.log('[ThankYouPage] Showing section16 with error state');
    showSection('section16');
    clearTimeout(fallbackTimer);
    if (iframe) {
        iframe.postMessage(pendingIframePayload);
    }
}

// Candidate titles for the custom "organizer notes" checkout field, matched
// case-insensitively against order.customFields[].title (kept in sync with
// the identical helper in backend/bookingService.web.js — duplicated here
// since it's a pure/sync helper and plain .web.js exports aren't proxied
// to the frontend).
const ORGANIZER_NOTES_TITLE_CANDIDATES = [
    'organizer_notes',
    'organizer notes',
    'הוסיפו הודעה אישית',
    'הודעה אישית',
    'הערות',
    'הערה',
];

function extractOrganizerNotesFromEcomOrder(ecomOrder) {
    const fields = ecomOrder?.customFields;
    if (!Array.isArray(fields) || fields.length === 0) return '';

    const match = fields.find((f) => {
        const title = (f?.title || '').trim().toLowerCase();
        return ORGANIZER_NOTES_TITLE_CANDIDATES.some((c) => title === c.toLowerCase());
    }) || fields[0];

    const value = match?.value;
    if (value == null) return '';
    return typeof value === 'string' ? value : String(value);
}

/**
 * Extract display-relevant info from the raw eCom order object.
 */
function buildEcomSummary(order) {
    const lineItem = order.lineItems?.[0] || {};
    const totals = order.totals || {};
    const coupon = order.discount?.appliedCoupon || null;
    const buyer = order.buyerInfo || order.billingInfo || {};

    // Parse session date/time from lineItem options
    let sessionDateStr = null;
    if (lineItem.options) {
        const dateOption = lineItem.options.find(o => o.selection && /\d{4}|AM|PM|,/.test(o.selection));
        if (dateOption) sessionDateStr = dateOption.selection;
    }

    // Parse session location from lineItem options
    let locationStr = null;
    if (lineItem.options) {
        const locOption = lineItem.options.find(o => o.selection && /Israel|ישראל|street|רחוב|,\s*\w/.test(o.selection) && !/AM|PM/.test(o.selection));
        if (locOption) locationStr = locOption.selection;
    }

    return {
        orderId: order._id,
        orderNumber: order.number,
        workshopName: lineItem.name || lineItem.translatedName || '',
        subtotal: totals.subtotal || 0,
        discount: totals.discount || 0,
        total: totals.total || 0,
        currency: order.currency || 'ILS',
        coupon: coupon ? { code: coupon.code, name: coupon.name } : null,
        paymentStatus: order.paymentStatus,
        sessionDate: sessionDateStr,
        location: locationStr,
        buyerName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(),
        buyerEmail: buyer.email || '',
        buyerPhone: buyer.phone || '',
        organizerNotes: extractOrganizerNotesFromEcomOrder(order),
    };
}

/**
 * Resolve the WorkshopOrder that belongs to THIS Thank You page visit, using
 * the live eCom order (getOrder()) as the source of truth. This is what makes
 * "place order #1, then order #2" work correctly — each visit resolves against
 * whichever eCom order actually completed checkout just now, not whatever was
 * last cached in local storage.
 * Retries up to 3 times with increasing delays to handle the race condition
 * where the CMS write hasn't completed by the time the Thank You page loads.
 * @returns {Promise<{ workshopOrderId: string|null, ecomOrder: object, noMatch?: boolean } | null>}
 */
async function resolveCurrentEcomOrder(thankYouPage) {
    if (!thankYouPage) return null;

    let order;
    try {
        order = await thankYouPage.getOrder();
    } catch (err) {
        console.error('[ThankYouPage] getOrder() failed:', err?.message || err);
        return null;
    }

    if (!order?._id) return null;

    // NOTE: do NOT reveal section16 (the iframe hub) here. This fires for
    // EVERY completed eCom order on the site, not just tapping workshop
    // orders — revealing the iframe before a WorkshopOrder match is
    // confirmed caused customers who bought something else to get stuck on
    // the iframe's error screen (or, worse, someone else's/their own old
    // order) once the CMS match below failed to find a workshop order for
    // this checkout. The iframe is only revealed once loadAndShowOrderHub
    // actually confirms a matching WorkshopOrder.

    const buyer = order.buyerInfo || order.billingInfo || {};
    const lineItem = order.lineItems?.[0] || {};
    console.log('[ThankYouPage] getOrder() result:', JSON.stringify({
        orderId: order._id,
        orderNumber: order.number,
        buyerPhone: buyer.phone,
        workshopName: lineItem.name,
        catalogItemId: lineItem.catalogReference?.catalogItemId || null,
    }, null, 2));

    const RETRY_DELAYS = [0, 1500, 3000];
    let resolved = null;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        if (attempt > 0) {
            console.log(`[ThankYouPage] CMS retry #${attempt} — waiting ${RETRY_DELAYS[attempt]}ms`);
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        }

        try {
            resolved = await resolveWorkshopOrderFromEcom(order);
        } catch (err) {
            console.warn(`[ThankYouPage] resolveWorkshopOrderFromEcom attempt ${attempt + 1} failed:`, err?.message);
            continue;
        }

        if (resolved?.workshopOrder?._id) {
            console.log('[ThankYouPage] CMS match found on attempt', attempt + 1, '— matchedBy:', resolved.matchedBy);
            break;
        }
    }

    if (!resolved?.workshopOrder?._id) {
        // A REAL eCom order exists but it is confirmed NOT a tapting workshop
        // order (e.g. the customer bought something else entirely). Signal
        // this explicitly (as opposed to returning null, which means "we
        // couldn't even resolve an eCom order") so the caller never falls
        // back to a stale cached workshop_order_id from an earlier, unrelated
        // visit on this device — it must show the default Wix Thank You page.
        console.log('[ThankYouPage] No WorkshopOrder matched after retries — this is not a tapting order');
        return { workshopOrderId: null, ecomOrder: order, noMatch: true };
    }

    return { workshopOrderId: resolved.workshopOrder._id, ecomOrder: order };
}

/**
 * Show the correct content and hide the loading element (#hideMe inside section4).
 * Only runs once — subsequent calls are ignored.
 *
 * 'section16'   → collapse section4, expand + show section16 (iframe post-payment hub)
 * 'thankYouPage' → hide #hideMe, show thankYouPage (default Wix thank you)
 */
function showSection(target) {
    if (resolvedSection) return;
    resolvedSection = target;

    $w('#hideMe').hide('fade', { duration: 300 });

    setTimeout(() => {
        if (target === 'section16') {
            $w('#section4').collapse();
            // section16 may start Collapsed in Editor — show() alone leaves a blank page
            $w('#section16').expand();
            $w('#section16').show('fade', { duration: 400 });
        } else {
            $w('#thankYouPage').expand();
            $w('#thankYouPage').show('fade', { duration: 400 });
        }
    }, 350);
}

/**
 * Handle post-payment messages from the iframe (all imports are at the top)
 */
async function handlePostPaymentMessage(data, iframe) {
    const callbackId = data.data?._callbackId;

    function respond(result) {
        if (callbackId) {
            iframe.postMessage({ type: 'RESPONSE', callbackId, result });
        }
    }

    try {
        switch (data.type) {
        case 'SET_SELECTION_MODE': {
            await setOrderSelectionMode(data.data.orderId, data.data.mode);
            respond({ success: true });
            break;
        }

        case 'SAVE_PARTICIPANTS': {
            const saved = await saveParticipants(data.data.orderId, data.data.participants);
            respond({ participants: saved });
            break;
        }

        case 'UPDATE_PARTICIPANT': {
            const updated = await updateParticipant(data.data.participantId, data.data.updates);
            respond({ participant: updated });
            break;
        }

        case 'CREATE_PARTICIPANT_GROUP': {
            const currentUrl = $w('#htmlComponent1').src || '';
            const created = await createParticipantGroup(data.data.orderId, data.data.group, currentUrl);
            respond({ participant: created.participant, link: created.link, token: created.token });
            break;
        }

        case 'GET_GROUP_DELETION_PREVIEW': {
            const preview = await getGroupDeletionPreview(data.data.participantId);
            respond(preview);
            break;
        }

        case 'CHECK_GROUP_DELETABLE': {
            const result = await checkGroupDeletable(data.data || {});
            respond(result);
            break;
        }

        case 'DELETE_PARTICIPANT_GROUP': {
            const result = await deleteParticipantGroup(data.data.participantId);
            respond(result);
            break;
        }

        case 'DELETE_ORGANIZER_GROUP': {
            const result = await deleteOrganizerSelectionGroup(
                data.data.orderId,
                data.data.participantName,
                data.data.rugIndexes,
                data.data.participantId || null
            );
            respond(result);
            break;
        }

        case 'GENERATE_PARTICIPANT_LINKS': {
            const currentUrl = $w('#htmlComponent1').src || '';
            const links = await generateParticipantLinks(data.data.orderId, currentUrl);
            respond({ links });
            break;
        }

        case 'SAVE_SKETCH_SELECTION': {
            const selection = await saveSketchSelection(data.data);
            respond({ selection });
            break;
        }

        case 'DELETE_SKETCH_SELECTION': {
            const result = await deleteEditableSketchSelection(data.data || {});
            respond(result);
            break;
        }

        case 'UPDATE_ORDER_SETTINGS': {
            await updateOrderSettings(data.data.orderId, data.data.settings);
            respond({ success: true });
            break;
        }

        case 'REQUEST_UPGRADE_PAYMENT': {
            if (!data.data) {
                iframe.postMessage({ type: 'UPGRADE_PAYMENT_RESULT', success: false, error: 'Missing upgrade data' });
                break;
            }
            const { orderId, selections: upgradeSels, orderNumber: oNum, buyerName: bName, buyerPhone: bPhone, buyerEmail: bEmail } = data.data;

            try {
                iframe.postMessage({ type: 'UPGRADE_PAYMENT_STATUS', status: 'creating' });

                const { payment } = await createCanvasUpgradePayment({
                    orderId,
                    selections: upgradeSels,
                    orderNumber: oNum,
                    buyerName: bName,
                    buyerPhone: bPhone,
                    buyerEmail: bEmail,
                });

                const paymentId = payment?.id;
                if (!paymentId) throw new Error('Payment creation failed');

                iframe.postMessage({ type: 'UPGRADE_PAYMENT_STATUS', status: 'processing' });

                // Start the payment for UI flow only. The authoritative paid/failed
                // state is set server-side by wixPay_onPaymentUpdate (events.js) — we
                // never write 'paid' based on this client promise, since closing the
                // window can resolve it inaccurately.
                const payResult = await wixPay.startPayment(paymentId, { showThankYouPage: false });

                if (payResult.status === 'Successful') {
                    const refreshedCtx = await waitForUpgradeResolution(orderId, paymentId);
                    iframe.postMessage({
                        type: 'UPGRADE_PAYMENT_RESULT',
                        success: true,
                        pending: false,
                        selections: refreshedCtx?.selections || [],
                        paymentId,
                    });
                } else if (payResult.status === 'Pending') {
                    const refreshedCtx = await getOrderContext(orderId);
                    iframe.postMessage({
                        type: 'UPGRADE_PAYMENT_RESULT',
                        success: false,
                        pending: true,
                        selections: refreshedCtx?.selections || [],
                        paymentId,
                    });
                } else {
                    const refreshedCtx = await getOrderContext(orderId);
                    iframe.postMessage({
                        type: 'UPGRADE_PAYMENT_RESULT',
                        success: false,
                        pending: false,
                        error: 'Payment was not completed',
                        selections: refreshedCtx?.selections || [],
                        paymentId,
                    });
                }
            } catch (upgradeErr) {
                console.error('[ThankYouPage] REQUEST_UPGRADE_PAYMENT failed:', upgradeErr?.message || upgradeErr, upgradeErr?.stack);
                let refreshedCtx = null;
                try { refreshedCtx = await getOrderContext(orderId); } catch (_) {}
                iframe.postMessage({
                    type: 'UPGRADE_PAYMENT_RESULT',
                    success: false,
                    pending: false,
                    error: upgradeErr?.message || 'Payment failed',
                    selections: refreshedCtx?.selections || [],
                });
            }
            break;
        }

        case 'VERIFY_ACCESS_TOKEN': {
            const result = await verifyAccessToken(data.data.token, data.data.phone);
            if (result.valid && result.role === 'participant') {
                iframe.postMessage({
                    type: 'PARTICIPANT_CONTEXT',
                    participantContext: result,
                    ecomSummary: result.ecomSummary || null,
                });
            } else if (result.valid && result.role === 'organizer') {
                const ctx = await getOrderContext(result.order._id);
                iframe.postMessage({
                    type: 'ORDER_CONTEXT',
                    orderContext: ctx,
                    role: 'organizer',
                });
            } else {
                iframe.postMessage({
                    type: 'PARTICIPANT_CONTEXT',
                    participantContext: { valid: false, reason: result.reason },
                });
            }
            break;
        }

        case 'LOAD_ORDER_CONTEXT': {
            if (data.data?.orderId) {
                const ctx = await getOrderContext(data.data.orderId);
                iframe.postMessage({
                    type: 'ORDER_CONTEXT',
                    orderContext: ctx,
                    role: 'organizer',
                    ecomSummary: ctx?.ecomSummary || null,
                });
            }
            break;
        }

        // User picked a different past order from the "my orders" switcher —
        // load that order's context (and refresh the history list around it).
        case 'SWITCH_ORDER': {
            const targetOrderId = data.data?.orderId;
            if (!targetOrderId) {
                respond({ error: 'Missing orderId' });
                break;
            }
            const ctx = await getOrderContext(targetOrderId);
            if (!ctx || !ctx.order) {
                respond({ error: 'Order not found' });
                break;
            }
            let organizerToken = null;
            try {
                organizerToken = await generateOrganizerToken(targetOrderId);
            } catch (e) {
                console.warn('[ThankYouPage] generateOrganizerToken (switch) skipped:', e?.message);
            }
            let orderHistory = [];
            try {
                orderHistory = await getOrderHistoryForBuyer(ctx.order.organizerPhone, ctx.order.organizerEmail, targetOrderId);
            } catch (e) {
                console.warn('[ThankYouPage] getOrderHistoryForBuyer (switch) skipped:', e?.message);
            }
            try { local.setItem('workshop_order_id', targetOrderId); } catch (_) {}
            activeWorkshopOrderId = targetOrderId;
            pendingIframePayload = {
                type: 'ORDER_CONTEXT',
                orderContext: ctx,
                role: 'organizer',
                workshopOrderId: targetOrderId,
                ecomSummary: ctx.ecomSummary,
                organizerToken,
                orderHistory,
            };
            startOrderContextRefresh(iframe, targetOrderId);
            respond({
                orderContext: ctx,
                ecomSummary: ctx.ecomSummary,
                organizerToken,
                orderHistory,
                workshopOrderId: targetOrderId,
            });
            break;
        }

        case 'CHECK_EDITING_ALLOWED': {
            const result = await checkEditingAllowed(data.data.orderId, data.data.participantId);
            respond(result);
            break;
        }

        case 'VERIFY_SKETCH_FOR_EDIT': {
            const result = await verifySketchForEdit(
                data.data.orderId,
                data.data.rugIndex,
                data.data.participantId || null,
            );
            respond(result);
            break;
        }

        case 'CLEAR_ALL_ORDER_DATA': {
            const result = await clearAllOrderData(data.data.orderId);
            respond(result);
            break;
        }

        case 'FETCH_CATALOG': {
            const products = await getProductsCatalog(data.data?.serviceId);
            respond({ products });
            break;
        }

        case 'COPY_TO_CLIPBOARD': {
            try {
                await wixWindowFrontend.copyToClipboard(data.data.text);
                respond({ success: true });
            } catch (err) {
                respond({ error: err?.message || 'Copy failed' });
            }
            break;
        }

        case 'VALIDATE_IMAGE': {
            const result = await validateImage(data.data.imageBase64, data.data.orderId);
            respond(result);
            break;
        }

        case 'GENERATE_SKETCH': {
            const start = await startGenerateSketch(
                data.data.imageBase64,
                data.data.colorPalette,
                data.data.orderId,
                data.data.imageWidth,
                data.data.imageHeight
            );
            respond(start);
            break;
        }

        case 'GET_SKETCH_JOB': {
            const result = await getSketchJobStatus(data.data.jobId);
            respond(result);
            break;
        }

        case 'SAVE_APPROVED_SKETCH': {
            const d = data.data;
            const originalInput = d.originalInput || d.originalBase64;
            const sketchUrl = d.sketchUrl || d.sketchBase64;
            const result = await saveApprovedSketch(originalInput, sketchUrl, d.colors, d.orderId, d.croppedInput);
            respond(result);
            break;
        }

        case 'SUBMIT_FEEDBACK': {
            const result = await submitFeedback(data.data.feedbackText, data.data.type, data.data.orderId);
            respond(result);
            break;
        }

        case 'CHECK_RATE_LIMIT': {
            const result = await checkAIRateLimit(data.data?.orderId);
            respond(result);
            break;
        }

        case 'GET_AI_TERMS_STATUS': {
            const result = await getAITermsStatus(data.data?.orderId);
            respond(result);
            break;
        }

        case 'ACCEPT_AI_TERMS': {
            const result = await acceptAITerms(data.data?.orderId);
            respond(result);
            break;
        }

        default:
            break;
        }
    } catch (err) {
        console.error('[ThankYouPage] Error handling message:', data.type, err?.message || err, err?.stack);
        const genericMessages = {
            GENERATE_SKETCH: 'שגיאה ביצירת הסקיצה. נסו שוב.',
            SAVE_APPROVED_SKETCH: 'שגיאה בשמירת הסקיצה. נסו שוב.',
        };
        const userMessage = genericMessages[data.type] || (err?.message || 'Unknown error');
        respond({ error: userMessage });
    }
}

/**
 * After a client-side "Successful" charge, poll the order context briefly to
 * give the backend wixPay_onPaymentUpdate event time to flip the matching
 * selections to 'paid'. Returns the freshest context regardless.
 */
async function waitForUpgradeResolution(orderId, paymentId, attempts = 5, delayMs = 1200) {
    let ctx = null;
    for (let i = 0; i < attempts; i++) {
        ctx = await getOrderContext(orderId);
        const related = (ctx?.selections || []).filter(s => s.upgradePaymentId === paymentId);
        const allResolved = related.length > 0 && related.every(s =>
            s.upgradePaymentStatus === 'paid' || s.upgradePaymentStatus === 'failed'
        );
        if (allResolved) return ctx;
        await new Promise(res => setTimeout(res, delayMs));
    }
    return ctx;
}