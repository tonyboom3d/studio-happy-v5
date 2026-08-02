/**
 * User Selections Page — /user-selections
 *
 * Dedicated page for group members who open a shared selection link.
 * It hosts the SAME HTML iframe as the Thank You page, but resolves the order
 * directly from the URL's `orderId` query param (and optional `token`),
 * bypassing the eCommerce Thank You page resolution logic.
 *
 * URL shape: https://www.studiohappy.art/user-selections?orderId=<id>&token=<token>
 *
 * Editor setup required:
 *  - Create a page with the route `/user-selections`
 *  - Add an HTML iframe component with id `#htmlComponent1` pointing to the same app
 */
import wixLocation from 'wix-location';
import wixPay from 'wix-pay';
import wixWindowFrontend from 'wix-window-frontend';
import {
    getOrderContext,
    verifyAccessToken,
    resolveShortRef,
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
    getProductsCatalog,
    checkEditingAllowed,
    verifySketchForEdit,
    getGroupDeletionPreview,
    checkGroupDeletable,
    clearAllOrderData,
    initiateAdminOtp,
    verifyAdminOtp,
    validateImage,
    startGenerateSketch,
    getSketchJobStatus,
    saveApprovedSketch,
    submitFeedback,
    checkAIRateLimit,
    getAITermsStatus,
    acceptAITerms,
} from 'backend/bookingService.web.js';

let pendingIframePayload = null;
const ORDER_CONTEXT_REFRESH_MS = 5 * 60 * 1000;
let orderContextRefreshTimer = null;
const refreshState = { orderId: null, token: null, phone: null, mode: null };

function stopContextRefresh() {
    if (orderContextRefreshTimer) {
        clearInterval(orderContextRefreshTimer);
        orderContextRefreshTimer = null;
    }
}

function startContextRefresh(iframe, state) {
    stopContextRefresh();
    refreshState.orderId = state.orderId || null;
    refreshState.token = state.token || null;
    refreshState.phone = state.phone || null;
    refreshState.mode = state.mode || null;
    if (!iframe || (!refreshState.orderId && !refreshState.token)) return;
    orderContextRefreshTimer = setInterval(() => refreshIframeContext(iframe), ORDER_CONTEXT_REFRESH_MS);
}

async function refreshIframeContext(iframe) {
    if (!iframe) return;
    try {
        if (refreshState.mode === 'participant' && refreshState.token) {
            const result = await verifyAccessToken(refreshState.token, refreshState.phone);
            if (result?.valid && result.role === 'participant') {
                iframe.postMessage({
                    type: 'PARTICIPANT_CONTEXT',
                    participantContext: result,
                    ecomSummary: result.ecomSummary || null,
                });
            }
            return;
        }

        const orderId = refreshState.orderId;
        if (!orderId) return;
        const orderContext = await getOrderContext(orderId);
        if (!orderContext?.order) return;

        pendingIframePayload = {
            type: 'ORDER_CONTEXT',
            orderContext,
            role: 'organizer',
            workshopOrderId: orderId,
            ecomSummary: orderContext.ecomSummary || null,
        };
        iframe.postMessage(pendingIframePayload);
        console.log('[UserSelections] ORDER_CONTEXT refreshed');
    } catch (err) {
        console.warn('[UserSelections] context refresh failed:', err?.message || err);
    }
}

$w.onReady(function () {
    const iframe = $w('#htmlComponent1');
    if (!iframe) {
        console.error('[UserSelections] #htmlComponent1 not found on page!');
        return;
    }

    const query = wixLocation.query || {};
    const orderId = query.orderId || null;
    const token = query.token || null;
    const ref = query.ref || null;
    const adminOrderId = query.admin || null;

    console.log('[UserSelections] onReady — query:', JSON.stringify(query));
    console.log('[UserSelections] parsed — orderId:', orderId, 'token:', token ? token.slice(0, 8) + '...' : null, 'ref:', ref, 'admin:', adminOrderId);

    const groupInfo = {
        name: query.group ? decodeURIComponent(query.group) : null,
        rugs: query.rugs ? Number(query.rugs) : null,
        children: query.children ? Number(query.children) : null,
    };

    let resolvedToken = token;

    // Pre-resolve the token → participant context so the iframe never needs
    // to ask the user for a phone number.
    const initParticipantContext = (async () => {
        let tkn = token;
        if (ref) {
            const shortResolved = await resolveShortRef(ref).catch(() => null);
            if (!shortResolved) return null;
            tkn = shortResolved.token;
            resolvedToken = tkn;
        }
        if (!tkn) return null;
        const result = await verifyAccessToken(tkn, null).catch(() => null);
        return result;
    })();

    iframe.onMessage(async (event) => {
        const data = event.data;
        if (!data || !data.type) return;

        if (data.type === 'IFRAME_READY') {
            if (adminOrderId) {
                iframe.postMessage({ type: 'ADMIN_OTP_REQUIRED', orderId: adminOrderId });
            } else if (pendingIframePayload) {
                iframe.postMessage(pendingIframePayload);
            } else if (ref || token) {
                const participantCtx = await initParticipantContext;
                if (participantCtx?.valid && participantCtx?.role === 'participant') {
                    iframe.postMessage({
                        type: 'PARTICIPANT_CONTEXT',
                        participantContext: participantCtx,
                        ecomSummary: participantCtx.ecomSummary || null,
                    });
                    startContextRefresh(iframe, { mode: 'participant', token: resolvedToken });
                } else if (participantCtx?.valid && participantCtx?.role === 'organizer') {
                    const ctx = await getOrderContext(participantCtx.order._id);
                    iframe.postMessage({ type: 'ORDER_CONTEXT', orderContext: ctx, role: 'organizer', ecomSummary: ctx?.ecomSummary || null });
                    startContextRefresh(iframe, { mode: 'organizer', orderId: participantCtx.order._id, token: resolvedToken });
                } else {
                    iframe.postMessage({ type: 'ORDER_CONTEXT', error: true });
                }
            } else if (orderId) {
                await loadOrderById(orderId, iframe);
            }
            return;
        }

        if (data.type === 'INITIATE_ADMIN_OTP') {
            try {
                const result = await initiateAdminOtp(data.data.orderId, data.data.phone);
                iframe.postMessage({ type: 'RESPONSE', callbackId: data.data._callbackId, result });
            } catch (err) {
                iframe.postMessage({ type: 'RESPONSE', callbackId: data.data._callbackId, result: { success: false, reason: err?.message || 'error' } });
            }
            return;
        }

        if (data.type === 'VERIFY_ADMIN_OTP') {
            try {
                const result = await verifyAdminOtp(data.data.orderId, data.data.phone, data.data.code);
                if (result.valid && result.orderToken) {
                    const ctx = await getOrderContext(data.data.orderId);
                    iframe.postMessage({ type: 'RESPONSE', callbackId: data.data._callbackId, result: { ...result, orderContext: ctx } });
                    startContextRefresh(iframe, { mode: 'organizer', orderId: data.data.orderId });
                } else {
                    iframe.postMessage({ type: 'RESPONSE', callbackId: data.data._callbackId, result });
                }
            } catch (err) {
                iframe.postMessage({ type: 'RESPONSE', callbackId: data.data._callbackId, result: { valid: false, reason: err?.message || 'error' } });
            }
            return;
        }

        await handlePostPaymentMessage(data, iframe);
    });

    if (!ref && !token && !adminOrderId) {
        if (orderId) {
            loadOrderById(orderId, iframe);
        } else {
            console.warn('[UserSelections] No orderId, token, ref, or admin in URL.');
        }
    }
});

async function loadOrderById(orderId, iframe) {
    try {
        const orderContext = await getOrderContext(orderId);
        if (!orderContext || !orderContext.order) {
            iframe.postMessage({ type: 'ORDER_CONTEXT', error: true });
            return;
        }
        pendingIframePayload = {
            type: 'ORDER_CONTEXT',
            orderContext,
            role: 'organizer',
            workshopOrderId: orderId,
            ecomSummary: orderContext.ecomSummary || null,
        };
        iframe.postMessage(pendingIframePayload);
        startContextRefresh(iframe, { mode: 'organizer', orderId });
    } catch (err) {
        console.error('[UserSelections] loadOrderById error:', err?.message || err);
        iframe.postMessage({ type: 'ORDER_CONTEXT', error: true });
    }
}

async function handlePostPaymentMessage(data, iframe) {
    const callbackId = data.data?._callbackId;
    function respond(result) {
        if (callbackId) iframe.postMessage({ type: 'RESPONSE', callbackId, result });
    }

    try {
        switch (data.type) {
            case 'VERIFY_ACCESS_TOKEN': {
                const result = await verifyAccessToken(data.data.token, data.data.phone);
                if (result.valid && result.role === 'participant') {
                    iframe.postMessage({
                        type: 'PARTICIPANT_CONTEXT',
                        participantContext: result,
                        ecomSummary: result.ecomSummary || null,
                    });
                    startContextRefresh(iframe, {
                        mode: 'participant',
                        token: data.data.token,
                        phone: data.data.phone || null,
                    });
                } else if (result.valid && result.role === 'organizer') {
                    const ctx = await getOrderContext(result.order._id);
                    iframe.postMessage({ type: 'ORDER_CONTEXT', orderContext: ctx, role: 'organizer', ecomSummary: ctx?.ecomSummary || null });
                    startContextRefresh(iframe, {
                        mode: 'organizer',
                        orderId: result.order._id,
                        token: data.data.token,
                        phone: data.data.phone || null,
                    });
                } else {
                    iframe.postMessage({ type: 'PARTICIPANT_CONTEXT', participantContext: { valid: false, reason: result.reason } });
                }
                break;
            }

            case 'LOAD_ORDER_CONTEXT': {
                if (data.data?.orderId) {
                    const ctx = await getOrderContext(data.data.orderId);
                    iframe.postMessage({ type: 'ORDER_CONTEXT', orderContext: ctx, role: 'organizer', ecomSummary: ctx?.ecomSummary || null });
                }
                break;
            }

            case 'SET_SELECTION_MODE':
                await setOrderSelectionMode(data.data.orderId, data.data.mode);
                respond({ success: true });
                break;

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
                const baseUrl = `${wixLocation.baseUrl}${(wixLocation.path || []).join('/')}`;
                const created = await createParticipantGroup(data.data.orderId, data.data.group, baseUrl);
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
                const baseUrl = `${wixLocation.baseUrl}${(wixLocation.path || []).join('/')}`;
                const links = await generateParticipantLinks(data.data.orderId, baseUrl);
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

            case 'UPDATE_ORDER_SETTINGS':
                await updateOrderSettings(data.data.orderId, data.data.settings);
                respond({ success: true });
                break;

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
                    console.error('[user-selections] REQUEST_UPGRADE_PAYMENT failed:', upgradeErr?.message || upgradeErr);
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
                const result = await saveApprovedSketch(originalInput, sketchUrl, d.colors, d.orderId);
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
        console.error('[UserSelections] Error handling message:', data.type, err?.message || err, err?.stack);
        const genericMessages = {
            GENERATE_SKETCH: 'שגיאה ביצירת הסקיצה. נסו שוב.',
            SAVE_APPROVED_SKETCH: 'שגיאה בשמירת הסקיצה. נסו שוב.',
        };
        const userMessage = genericMessages[data.type] || (err?.message || 'Unknown error');
        respond({ error: userMessage });
    }
}

/**
 * Poll briefly after a client "Successful" charge so the backend
 * onPaymentUpdate event has time to mark the selections paid.
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
