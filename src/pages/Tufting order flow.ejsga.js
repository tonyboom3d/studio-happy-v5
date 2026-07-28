import { services } from "@wix/bookings";
import { local } from "wix-storage-frontend";
import wixLocation from 'wix-location';
import { openLightbox } from 'wix-window-frontend';
import wixEcomFrontend from 'wix-ecom-frontend';
import {
    createAndCheckout, getCourseSessions, getServicePricing,
    verifyAccessToken, getOrderContext, setOrderSelectionMode, saveParticipants,
    updateParticipant, generateParticipantLinks, saveSketchSelection, updateOrderSettings, createCanvasUpgradePayment,
    verifySketchForEdit,
} from 'backend/bookingService.web.js';

// Tufting Service IDs (for reference)
const TUFTING_SERVICE_IDS = {
    weekday: '3406e74d-949b-44b0-a5cc-064548129c08',
    friday: '22e86498-525e-4580-9c83-a4470b0c874d',
    weekend: 'c1c1e799-84a9-4847-adf6-2a34480c5bfe',
};

$w.onReady(function () {
    const mainIframe = $w('#htmlComponent1');
    if (!mainIframe) {
        console.error('[Wix] #htmlComponent1 not found on page!');
        return;
    }
    mainIframe.onMessage((event) => handleIframeMessage(event, mainIframe));

    // Check for participant/organizer access token in URL query
    const queryToken = wixLocation.query?.token;
    if (queryToken) {
        handleTokenAccess(queryToken, mainIframe);
    }
});

/**
 * Handle token-based access (participant or organizer link)
 */
async function handleTokenAccess(token, iframe) {
    try {
        console.log('[Wix] Token-based access detected, verifying...');
        // Initially we don't have a phone — the iframe will ask for it
        // Send token context so the iframe knows it's in "select" mode
        sendMessageToIframe(iframe, {
            type: 'TOKEN_ACCESS',
            token,
        });
    } catch (err) {
        console.error('[Wix] Token access error:', err?.message || err);
    }
}

/**
 * שליחת נתונים ראשוניים (מוצרים, זמנים, שירות) ל-iframe
 */
async function initData(iframe) {
    try {
        const [servicePricing, slots] = await Promise.all([
            getServicePricing(),
            getCourseSessions(new Date(), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        ]);

        console.log('[Wix] Backend Data:', {
            slotsCount: slots?.length ?? 0,
            servicePricing,
            sampleSlotServiceId: slots?.[0]?.serviceId
        });

        sendMessageToIframe(iframe, {
            type: 'WIX_DATA',
            slots,
            servicePricing,
            serviceIds: TUFTING_SERVICE_IDS
        });
    } catch (err) {
        console.error("[Wix] ❌ Failed to init data:", err?.message || err);
    }
}

/**
 * טיפול בהודעות מה-iframe
 */
async function handleIframeMessage(event, iframe) {
    const data = event.data;
    if (!data || !data.type) return;

    try {
        switch (data.type) {
            case 'REQUEST_DATA':
                await initData(iframe);
                break;

            case 'BOOKING_SUBMIT':
                await handleBookingSubmit(data.data, iframe);
                break;

            case 'BOOKING_PROGRESS':
                break;

            case 'CONSULTATION_REQUEST':
                await handleConsultationRequest(data.data);
                break;

            case 'CUSTOM_BUILD_REQUEST':
                await handleCustomBuildRequest(data.data);
                break;

            case 'FETCH_SLOTS':
                await handleSlotFetch(data.data, iframe);
                break;

            case 'OPEN_LIGHTBOX':
                handleOpenLightbox(data.lightboxId);
                break;

            case 'VERIFY_ACCESS_TOKEN':
                await handleVerifyToken(data.data, iframe);
                break;

            case 'LOAD_ORDER_CONTEXT':
                await handleLoadOrderContext(data.data, iframe);
                break;

            case 'SET_SELECTION_MODE':
            case 'SAVE_PARTICIPANTS':
            case 'UPDATE_PARTICIPANT':
            case 'GENERATE_PARTICIPANT_LINKS':
            case 'SAVE_SKETCH_SELECTION':
            case 'UPDATE_ORDER_SETTINGS':
            case 'REQUEST_UPGRADE_PAYMENT':
                await handlePostPaymentAction(data, iframe);
                break;

            default:
                break;
        }
    } catch (err) {
        console.error('[Wix] Message handler error:', err?.message || err);
    }
}

/**
 * טיפול בשליחת הזמנה מה-iframe
 */
async function handleBookingSubmit(bookingData, iframe) {
    try {
        const slots = bookingData.selectedSlot
            ? [bookingData.selectedSlot]
            : bookingData.selected_slots || [];

        const orderData = {
            participants: (bookingData.adults || 0) + (bookingData.children || 0) || 1,
            adults: bookingData.adults,
            children: bookingData.children,
            slots: slots,
            totalSessions: 1,
            userDetails: bookingData.userDetails || bookingData.customerInfo || {
                name: bookingData.name || bookingData.full_name || '',
                phone: bookingData.phone || '',
                email: bookingData.email || '',
            },
        };

        const result = await createAndCheckout(orderData);

        if (!result?.checkoutId) {
            throw new Error('No checkout ID returned');
        }

        // Persist order ID so the Thank You page can load instantly on same device
        try {
            local.setItem('workshop_order_id', result.workshopOrderId);
        } catch (e) {
            console.warn('[Wix] Failed to save session data:', e?.message);
        }

        // Navigate to Wix checkout using the eCommerce frontend API
        const checkoutOptions = {
            skipDeliveryStep: true,
            hideContinueBrowsingButton: false,
            overrideContinueBrowsingUrl: 'https://www.studiohappy.art/booking-flow-tufting',
        };

        await wixEcomFrontend.navigateToCheckoutPage(result.checkoutId, checkoutOptions);

    } catch (err) {
        sendMessageToIframe(iframe, {
            type: 'BOOKING_ERROR',
            error: err.message || 'Booking failed'
        });
    }
}

/**
 * שליפת זמנים זמינים לטווח תאריכים
 */
async function handleSlotFetch(dateRange, iframe) {
    try {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);

        const slots = await getCourseSessions(start, end);

        sendMessageToIframe(iframe, {
            type: 'WIX_SLOTS',
            slots: slots
        });
    } catch (err) {}
}

/**
 * טיפול בבקשת ייעוץ
 */
async function handleConsultationRequest(data) {}

/**
 * טיפול בבקשת בנייה מותאמת
 */
async function handleCustomBuildRequest(data) {}

/**
 * פתיחת Lightbox לפי שם
 */
function handleOpenLightbox(lightboxId) {
    try {
        openLightbox(lightboxId);
    } catch (err) {}
}

/**
 * Verify access token + phone and send context to iframe
 */
async function handleVerifyToken(data, iframe) {
    try {
        const result = await verifyAccessToken(data.token, data.phone);
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
    } catch (err) {
        console.error('[Wix] Token verify error:', err?.message || err);
    }
}

/**
 * Load order context by orderId
 */
async function handleLoadOrderContext(data, iframe) {
    try {
        if (!data?.orderId) return;
        const ctx = await getOrderContext(data.orderId);
        iframe.postMessage({
            type: 'ORDER_CONTEXT',
            orderContext: ctx,
            role: 'organizer',
        });
    } catch (err) {
        console.error('[Wix] Load order context error:', err?.message || err);
    }
}

/**
 * Handle post-payment actions from the iframe (request-reply pattern)
 */
async function handlePostPaymentAction(data, iframe) {
    const callbackId = data.data?._callbackId;

    function respond(result) {
        if (callbackId) {
            iframe.postMessage({ type: 'RESPONSE', callbackId, result });
        }
    }

    try {
        switch (data.type) {
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

            case 'GENERATE_PARTICIPANT_LINKS': {
                const baseUrl = `${wixLocation.baseUrl}${wixLocation.path.join('/')}`;
                const links = await generateParticipantLinks(data.data.orderId, baseUrl);
                respond({ links });
                break;
            }

            case 'SAVE_SKETCH_SELECTION': {
                const selection = await saveSketchSelection(data.data);
                respond({ selection });
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

            case 'UPDATE_ORDER_SETTINGS':
                await updateOrderSettings(data.data.orderId, data.data.settings);
                respond({ success: true });
                break;

            case 'REQUEST_UPGRADE_PAYMENT': {
                if (!data.data) { respond({ error: 'Missing upgrade data' }); break; }
                const upgradeResult = await createCanvasUpgradePayment(data.data);
                iframe.postMessage({
                    type: 'UPGRADE_PAYMENT_RESULT',
                    paymentId: upgradeResult.payment?.id,
                    selectionIds: upgradeResult.selectionIds,
                    success: false,
                    pending: true,
                });
                break;
            }

            default:
                break;
        }
    } catch (err) {
        console.error('[Wix] Post-payment action error:', data.type, err?.message || err);
        respond({ error: err?.message || 'Action failed' });
    }
}

/**
 * שליחת הודעה ל-iframe באמצעות Wix API
 */
function sendMessageToIframe(iframe, message) {
    try {
        iframe.postMessage(message);
    } catch (err) {}
}
