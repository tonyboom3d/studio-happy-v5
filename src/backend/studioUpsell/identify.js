/**
 * studioUpsell/identify.js — matches a customer's phone number to their
 * same-day workshop(s), for the QR add-on upsell kiosk's identification step.
 */
import wixData from 'wix-data';
import { getPhoneLookupVariants } from 'backend/orderUtils.js';
import { getTodaySessions, israelDateKey } from './sessions.js';

const SA = { suppressAuth: true };

// Admin QA bypass — this phone skips WorkshopOrders lookup and opens
// סדנת נרות so the full upsell flow can be tested without a real booking.
const CANDLES_WORKSHOP_TYPE_ID = '4572e26f-37ae-45c6-a767-5b49ee144bb4';
const ADMIN_TEST_PHONE = '0523813929';
const ADMIN_TEST_PHONE_VARIANTS = new Set(getPhoneLookupVariants(ADMIN_TEST_PHONE));

function isAdminTestPhone(phone) {
    return getPhoneLookupVariants(phone).some((v) => ADMIN_TEST_PHONE_VARIANTS.has(v));
}

function toIdentifyMatch(session, extras = {}) {
    return {
        workshopOrderId: null,
        organizerName: 'בדיקת אדמין',
        organizerPhone: ADMIN_TEST_PHONE,
        sessionId: session?.id || session?.sessionId || null,
        serviceId: session?.serviceId || null,
        workshopTypeId: session?.workshopTypeId || CANDLES_WORKSHOP_TYPE_ID,
        workshopTitle: session?.workshopTitle || 'סדנת נרות',
        startLabel: session?.startLabel || extras.startLabel || '',
        start: session?.start || extras.start || new Date().toISOString(),
    };
}

/** Today's candle sessions if any; otherwise a synthetic candles workshop. */
async function findAdminTestCandlesMatches() {
    const sessions = await getTodaySessions().catch(() => []);
    const candles = (sessions || []).filter((s) => s.workshopTypeId === CANDLES_WORKSHOP_TYPE_ID);
    if (candles.length) return candles.map((s) => toIdentifyMatch(s));
    return [toIdentifyMatch(null, { startLabel: 'בדיקת אדמין' })];
}

function findMatchingSession(order, sessions) {
    if (order.sessionId) {
        const bySessionId = sessions.find((s) =>
            s.sessionId === order.sessionId || s.eventId === order.sessionId || s.id === order.sessionId);
        if (bySessionId) return bySessionId;
    }
    if (!order.serviceId || !order.workshopStart) return null;
    const orderStartMs = new Date(order.workshopStart).getTime();
    return sessions.find((s) =>
        s.serviceId === order.serviceId && Math.abs(new Date(s.start).getTime() - orderStartMs) < 5 * 60 * 1000) || null;
}

/**
 * Finds every paid WorkshopOrders record for today whose organizer (or any
 * participant) phone matches one of the given phone's lookup variants, and
 * maps each to its resolved today's session for display/selection.
 */
export async function findTodayWorkshopsByPhone(phone) {
    if (isAdminTestPhone(phone)) return findAdminTestCandlesMatches();

    const variants = getPhoneLookupVariants(phone);
    if (!variants.length) return [];

    const sessions = await getTodaySessions();
    if (!sessions.length) return [];

    const todayKey = israelDateKey(new Date());
    const orderIds = new Set();
    const matchedOrders = [];

    for (const variant of variants) {
        const byOrganizer = await wixData.query('WorkshopOrders')
            .eq('organizerPhone', variant)
            .eq('status', 'paid')
            .find(SA);
        for (const order of (byOrganizer.items || [])) {
            if (orderIds.has(order._id)) continue;
            orderIds.add(order._id);
            matchedOrders.push(order);
        }
    }

    for (const variant of variants) {
        const byParticipant = await wixData.query('WorkshopParticipants')
            .eq('phone', variant)
            .find(SA);
        for (const participant of (byParticipant.items || [])) {
            if (!participant.orderId || orderIds.has(participant.orderId)) continue;
            const order = await wixData.get('WorkshopOrders', participant.orderId, SA).catch(() => null);
            if (order && order.status === 'paid' && !orderIds.has(order._id)) {
                orderIds.add(order._id);
                matchedOrders.push(order);
            }
        }
    }

    const results = [];
    for (const order of matchedOrders) {
        if (order.cancelledAt) continue;
        if (!order.workshopStart || israelDateKey(order.workshopStart) !== todayKey) continue;

        const session = findMatchingSession(order, sessions);

        results.push({
            workshopOrderId: order._id,
            organizerName: order.organizerName || '',
            organizerPhone: order.organizerPhone || '',
            sessionId: session?.id || order.sessionId || null,
            serviceId: order.serviceId || session?.serviceId || null,
            workshopTypeId: session?.workshopTypeId || null,
            workshopTitle: session?.workshopTitle || 'סדנה',
            startLabel: session?.startLabel || '',
            start: session?.start || order.workshopStart,
        });
    }

    // De-dupe by resolved session — the same customer might have >1 order row for the same session.
    const bySession = new Map();
    for (const r of results) {
        const key = r.sessionId || r.workshopOrderId;
        if (!bySession.has(key)) bySession.set(key, r);
    }
    return [...bySession.values()];
}
