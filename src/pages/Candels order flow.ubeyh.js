import wixEcomFrontend from 'wix-ecom-frontend';
import { local } from 'wix-storage-frontend';
import {
    createAndCheckout, getCourseSessions, getServicePricing, getProductsCatalog,
} from 'backend/bookingService.web.js';

// Candles Workshop ("סדנת נרות") Service IDs — thin Velo bridge for the
// "candels" React route. Kept separate from the Tufting page so the
// Tufting flow is never touched by this file.
const CANDLES_SERVICE_IDS = {
    a: 'eb8fec0e-5d04-48a3-a795-e3e8051d07da',
    b: 'f0f6e447-02d8-4808-80ba-3c380ce9eae8',
};
const CANDLES_SERVICE_ID_LIST = Object.values(CANDLES_SERVICE_IDS);

$w.onReady(function () {
    const mainIframe = $w('#htmlComponent1');
    if (!mainIframe) {
        console.error('[Wix][candels] #htmlComponent1 not found on page!');
        return;
    }
    mainIframe.onMessage((event) => handleIframeMessage(event, mainIframe));
});

/**
 * שליחת נתונים ראשוניים (זמנים, מחירים, קטלוג כוסות) ל-iframe
 */
async function initData(iframe) {
    try {
        const [servicePricing, slots, products] = await Promise.all([
            getServicePricing(CANDLES_SERVICE_ID_LIST),
            getCourseSessions(new Date(), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), CANDLES_SERVICE_ID_LIST),
            getProductsCatalog(CANDLES_SERVICE_IDS.a),
        ]);

        console.log('[Wix][candels] Backend Data:', {
            slotsCount: slots?.length ?? 0,
            servicePricing,
            productsCount: products?.length ?? 0,
        });

        sendMessageToIframe(iframe, {
            type: 'WIX_DATA',
            slots,
            servicePricing,
            serviceIds: CANDLES_SERVICE_IDS,
            products,
        });
    } catch (err) {
        console.error('[Wix][candels] Failed to init data:', err?.message || err);
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
        console.error('[Wix][candels] Message handler error:', err?.message || err);
    }
}

/**
 * טיפול בשליחת הזמנה מה-iframe (כולל הכוסות שנבחרו)
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
            products: bookingData.products || bookingData.selectedProducts || [],
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
            console.warn('[Wix][candels] Failed to save session data:', e?.message);
        }

        const checkoutOptions = {
            skipDeliveryStep: true,
            hideContinueBrowsingButton: false,
            overrideContinueBrowsingUrl: 'https://www.studiohappy.art/booking-flow-candels',
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

        const slots = await getCourseSessions(start, end, CANDLES_SERVICE_ID_LIST);

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
