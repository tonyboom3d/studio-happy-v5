import wixEcomFrontend from 'wix-ecom-frontend';
import { local } from 'wix-storage-frontend';
import {
    createAndCheckout, getCourseSessions, getServicePricing,
} from 'backend/bookingService.web.js';

// Ceramics Workshop ("סדנת קרמיקה") — single consolidated Wix Bookings
// service. Thin Velo bridge for the "ceramics" React route. Kept separate
// from the Tufting/Candles pages so those flows are never touched by this file.
const CERAMICS_SERVICE_ID = 'ad89914a-1845-48c6-804d-544cd17f179b';
const CERAMICS_SERVICE_ID_LIST = [CERAMICS_SERVICE_ID];

$w.onReady(function () {
    const mainIframe = $w('#htmlComponent1');
    if (!mainIframe) {
        console.error('[Wix][ceramics] #htmlComponent1 not found on page!');
        return;
    }
    mainIframe.onMessage((event) => handleIframeMessage(event, mainIframe));
});

/**
 * שליחת נתונים ראשוניים (זמנים, מחירים) ל-iframe — אין קטלוג לסדנת קרמיקה
 */
async function initData(iframe) {
    try {
        const [servicePricing, slots] = await Promise.all([
            getServicePricing(CERAMICS_SERVICE_ID_LIST),
            getCourseSessions(new Date(), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), CERAMICS_SERVICE_ID_LIST),
        ]);

        console.log('[Wix][ceramics] Backend Data:', {
            slotsCount: slots?.length ?? 0,
            servicePricing,
        });

        sendMessageToIframe(iframe, {
            type: 'WIX_DATA',
            slots,
            servicePricing,
            serviceId: CERAMICS_SERVICE_ID,
        });
    } catch (err) {
        console.error('[Wix][ceramics] Failed to init data:', err?.message || err);
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

            case 'FETCH_SLOTS':
                await handleSlotFetch(data.data, iframe);
                break;

            default:
                break;
        }
    } catch (err) {
        console.error('[Wix][ceramics] Message handler error:', err?.message || err);
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
            participants: bookingData.participants || 1,
            extraItems: bookingData.extraItems || 0,
            slots: slots,
            totalSessions: 1,
            products: [],
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

        try {
            local.setItem('workshop_order_id', result.workshopOrderId);
        } catch (e) {
            console.warn('[Wix][ceramics] Failed to save session data:', e?.message);
        }

        const checkoutOptions = {
            skipDeliveryStep: true,
            hideContinueBrowsingButton: false,
            overrideContinueBrowsingUrl: 'https://www.studiohappy.art/booking-flow-ceramics',
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

        const slots = await getCourseSessions(start, end, CERAMICS_SERVICE_ID_LIST);

        sendMessageToIframe(iframe, {
            type: 'WIX_SLOTS',
            slots: slots
        });
    } catch (err) {}
}

/**
 * שליחת הודעה ל-iframe באמצעות Wix API
 */
function sendMessageToIframe(iframe, message) {
    try {
        iframe.postMessage(message);
    } catch (err) {}
}
