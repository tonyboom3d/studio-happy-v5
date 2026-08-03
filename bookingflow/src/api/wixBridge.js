/**
 * Wix Bridge - Communication layer with Wix Custom Element
 * 
 * This module handles bidirectional communication between
 * the React booking app (embedded in iframe) and the Wix parent page.
 * 
 * Communication patterns:
 * - FROM Wix: window.addEventListener('message', ...) receives data
 * - TO Wix: window.parent.postMessage(...) sends data
 * 
 * Performance optimizations:
 * - Origin validation לאבטחה ולמניעת עיבוד הודעות מיותרות
 * - Debounce לשליחת summary updates למניעת עומס
 */

// Store for received data from Wix
let wixData = {
    products: null,
    slots: null,
    servicePricing: null,
    orderContext: null,
    ecomSummary: null,
    orderHistory: null,
    orderRole: null,
    participantContext: null,
    participantReady: false,
    orderError: false,
    initialized: false,
    orderContextReady: false,
};

// Pending response callbacks for request-reply pattern
const pendingCallbacks = new Map();
let callbackIdCounter = 0;

// Callbacks for data updates
const listeners = new Set();

// רשימת origins מותרים
const ALLOWED_ORIGINS = [
    // Studio Happy
    'https://www.studiohappy.art',
    'https://studiohappy.art',
    // Wix Editor & Management
    'https://editor.wix.com',
    'https://manage.wix.com',
    'https://www.wix.com',
    // GitHub Pages (האפליקציה עצמה)
    'https://tonyboom3d.github.io',
    // Wix iframes & static
    'https://static.parastorage.com',
    'https://www.wixstatic.com',
    // Wix hosting domains
    'https://www.wixsite.com',
];

// Debounce timer לשליחת summary
let summaryDebounceTimer = null;
const SUMMARY_DEBOUNCE_DELAY = 300; // 300ms

/**
 * בדיקה אם ה-origin מותר
 */
function isAllowedOrigin(origin) {
    // בפיתוח - להתיר הכל
    const isDev = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.protocol === 'file:');
    
    if (isDev) return true;
    
    // אם אין origin (null או undefined) - יכול להיות מ-Wix iframe
    if (!origin || origin === 'null') return true;
    
    // כל דומיין Wix מותר
    if (origin.includes('.wix.com') || origin.includes('.wixsite.com') || 
        origin.includes('.wixstatic.com') || origin.includes('.parastorage.com')) {
        return true;
    }
    
    // בדיקה אם ה-origin ברשימת המותרים
    return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

/**
 * Initialize communication with Wix
 */
export function initWixBridge() {
    window.addEventListener('message', handleWixMessage);

    requestDataFromWix();

    if (isInWix()) {
        const hash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
        if (hash.includes('/order') || hash.includes('/select')) {
            setTimeout(() => notifyIframeReady(), 50);
        }
    }
}

/**
 * Handle incoming messages from Wix
 * עם origin validation לאבטחה וביצועים
 */
function handleWixMessage(event) {
    // Origin validation - יציאה מוקדמת אם לא מותר
    if (!isAllowedOrigin(event.origin)) {
        return;
    }

    const { data } = event;

    // יציאה מוקדמת אם אין type
    if (!data || !data.type) return;

    // טיפול רק ב-types שאנחנו מכירים
    switch (data.type) {
        case 'WIX_DATA':
            if (data.products) wixData.products = data.products;
            if (data.slots) wixData.slots = data.slots;
            if (data.servicePricing) wixData.servicePricing = data.servicePricing;
            wixData.initialized = true;
            notifyListeners();
            break;

        case 'WIX_PRODUCTS':
            wixData.products = data.products;
            notifyListeners();
            break;

        case 'WIX_SLOTS':
            wixData.slots = data.slots;
            notifyListeners();
            break;

        case 'BOOKING_CONFIRMED':
            // Wix confirmed booking was saved (legacy Wix Pay flow)
            notifyListeners({ 
                bookingConfirmed: true, 
                bookingId: data.bookingId,
                paymentStatus: data.paymentStatus || 'Successful'
            });
            break;

        case 'ORDER_CONFIRMED':
            // Wix eCommerce checkout completed — sent from Thank You Page
            // ממפה את ה-order לאותה לוגיקה כמו BOOKING_CONFIRMED
            notifyListeners({
                bookingConfirmed: true,
                bookingId: data.order?.orderId,
                paymentStatus: data.order?.paymentStatus || 'Successful',
                orderData: data.order  // נתוני ה-order המלאים לתצוגה בדף תודה
            });
            break;

        case 'BOOKING_ERROR':
            // Booking failed
            notifyListeners({
                bookingError: data.error === 'FIRST_ORDER_MIN_TICKETS'
                    ? 'זוהי ההזמנה הראשונה למועד זה, ולכן נדרשים לפחות 2 כרטיסים (מבוגרים) כדי לפתוח את הסדנה. אם ברצונכם להזמין כרטיס אחד בלבד, אנא בחרו מועד אחר שכבר נרשמו בו משתתפים, או חפשו תאריך ושעה אחרים.'
                    : data.error,
            });
            break;

        case 'ORDER_CONTEXT':
            if (data.error) {
                wixData.orderError = true;
                wixData.orderContextReady = true;
                notifyListeners({ orderError: true });
                break;
            }
            wixData.orderContext = data.orderContext || null;
            wixData.ecomSummary = data.ecomSummary || null;
            wixData.orderHistory = data.orderHistory || wixData.orderHistory || null;
            wixData.orderRole = data.role || 'organizer';
            wixData.orderContextReady = !!data.orderContext;
            wixData.orderError = false;
            if (data.orderContext?.catalog?.length) {
                wixData.products = data.orderContext.catalog;
            }
            notifyListeners({
                orderContext: wixData.orderContext,
                role: wixData.orderRole,
                ecomSummary: wixData.ecomSummary,
                orderHistory: wixData.orderHistory,
                products: wixData.products,
            });
            break;

        case 'PARTICIPANT_CONTEXT':
            wixData.participantContext = data.participantContext || null;
            wixData.participantReady = !!data.participantContext;
            wixData.orderRole = 'participant';
            if (data.participantContext?.ecomSummary) {
                wixData.ecomSummary = data.participantContext.ecomSummary;
            } else if (data.ecomSummary) {
                wixData.ecomSummary = data.ecomSummary;
            }
            notifyListeners({
                participantContext: data.participantContext,
                ecomSummary: data.participantContext?.ecomSummary || data.ecomSummary || wixData.ecomSummary || null,
                role: 'participant',
            });
            break;

        case 'RESPONSE': {
            const cb = pendingCallbacks.get(data.callbackId);
            if (cb) {
                pendingCallbacks.delete(data.callbackId);
                cb(data.result);
            }
            break;
        }

        case 'ADMIN_OTP_REQUIRED':
            notifyListeners({ adminOtpRequired: true, adminOrderId: data.orderId });
            break;

        case 'SKETCH_SELECTION_SAVED':
            notifyListeners({ sketchSelectionSaved: data.selection });
            break;

        case 'UPGRADE_PAYMENT_RESULT':
            notifyListeners({ upgradePaymentResult: data });
            break;

        case 'TOKEN_ACCESS':
            notifyListeners({ tokenAccess: data.token, groupInfo: data.groupInfo || null });
            break;

        default:
            break;
    }
}

/**
 * Subscribe to data updates from Wix
 */
export function subscribeToWix(callback) {
    listeners.add(callback);

    if (wixData.initialized || wixData.orderContextReady || wixData.participantReady) {
        callback({
            ...wixData,
            role: wixData.participantReady ? 'participant' : wixData.orderRole,
        });
    }

    return () => listeners.delete(callback);
}

/**
 * Notify all listeners of data changes
 */
function notifyListeners(extra = {}) {
    const payload = { ...wixData, ...extra };
    listeners.forEach(callback => callback(payload));
}

/**
 * Request data (products, slots) from Wix
 */
export function requestDataFromWix() {
    sendToWix('REQUEST_DATA', {});
}

/**
 * Submit booking to Wix
 */
export function submitBooking(bookingData) {
    sendToWix('BOOKING_SUBMIT', bookingData);
}

/**
 * Notify Wix of user progress through the booking flow
 */
export function notifyProgress(section, data = {}) {
    sendToWix('BOOKING_PROGRESS', { section, ...data });
}

/**
 * Send a message to Wix parent
 */
function sendToWix(type, data) {
    try {
        window.parent.postMessage({ type, data }, '*');
    } catch (error) {}
}

/**
 * Get current cached data from Wix
 */
export function getWixData() {
    return { ...wixData };
}

/**
 * Check if we're running inside a Wix iframe
 */
export function isInWix() {
    try {
        return window.self !== window.parent;
    } catch (e) {
        return true; // Cross-origin restriction means we're in iframe
    }
}

/**
 * זיהוי עורך Wix / תצוגה מקדימה — לדילוג על מסך טעינה מלא בזמן עריכה (לא מכביד על העורך).
 * מסתמך בעיקר על document.referrer כשהאפליקציה ב-iframe בתוך editor.wix.com וכו'.
 */
export function isWixEditorOrPreview() {
    if (typeof window === 'undefined') return false;
    try {
        const href = window.location.href || '';
        const ref = document.referrer || '';
        const combined = `${href} ${ref}`;

        // Override ידני לבדיקות
        if (/[?&](noLoadScreen|skipBookingLoader|wixEditor)=1\b/i.test(href)) return true;

        if (/editor\.wix\.com|manage\.wix\.com|editorx\.wix\.com/i.test(combined)) return true;

        if (/\.wix\.com\/(editor|preview|html)/i.test(ref)) return true;

        if (/[?&]preview=/i.test(href) && /wixsite\.com/i.test(href)) return true;
    } catch (e) {
        return false;
    }
    return false;
}

/**
 * Send summary data to Wix for the external booking-summary Custom Element
 * עם Debounce למניעת שליחות מיותרות
 */
export function sendSummaryUpdate(summaryData) {
    if (summaryDebounceTimer) {
        clearTimeout(summaryDebounceTimer);
    }
    summaryDebounceTimer = setTimeout(() => {
        sendToWix('SUMMARY_UPDATE', summaryData);
        summaryDebounceTimer = null;
    }, SUMMARY_DEBOUNCE_DELAY);
}

/**
 * Send a message to Wix with a callback for the response (request-reply pattern).
 * The Wix page script sends back { type: 'RESPONSE', callbackId, result }.
 */
export function sendWithCallback(type, data, callback, timeoutMs = 30000) {
    const callbackId = ++callbackIdCounter;
    pendingCallbacks.set(callbackId, callback);
    sendToWix(type, { ...data, _callbackId: callbackId });
    setTimeout(() => {
        if (pendingCallbacks.has(callbackId)) {
            pendingCallbacks.delete(callbackId);
            callback({ error: 'timeout' });
        }
    }, timeoutMs);
}

/**
 * Request order context for the post-payment hub
 */
export function requestOrderContext(params = {}) {
    sendToWix('LOAD_ORDER_CONTEXT', params);
}

/**
 * Notify Wix parent that iframe React app is mounted and listening.
 * Parent should (re)send ORDER_CONTEXT after this.
 */
export function notifyIframeReady(extra = {}) {
    let orderId = null;
    try {
        orderId = sessionStorage.getItem('workshop_order_id');
    } catch (_) {}
    sendToWix('IFRAME_READY', {
        route: typeof window !== 'undefined' ? (window.location.hash || window.location.pathname) : '',
        orderId,
        ...extra,
    });
}

/**
 * Verify a participant token + phone
 */
export function verifyParticipantAccess(token, phone) {
    sendToWix('VERIFY_ACCESS_TOKEN', { token, phone });
}
