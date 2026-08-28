/**
 * studioUpsell/sessions.js — resolves "today's" active workshop sessions for
 * the QR in-person add-on upsell flow. Mirrors the workshops/session
 * matching patterns already used in dashboardService.web.js (loadWorkshopTypes
 * / loadSessions), but scoped strictly to the current Israel calendar day.
 */
import wixData from 'wix-data';
import { availabilityCalendar } from 'wix-bookings.v2';

const SA = { suppressAuth: true };
const ISRAEL_TZ = 'Asia/Jerusalem';
const DEFAULT_COLOR_HEX = '#6B7280';
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeColorHex(colorTag) {
    const value = (colorTag || '').trim();
    return HEX_COLOR_RE.test(value) ? value : DEFAULT_COLOR_HEX;
}

/** Israel-local Y-M-D key for any date input — used to bucket sessions/orders by calendar day. */
export function israelDateKey(dateInput) {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Wide UTC bounds guaranteed to cover "today" in Israel time, regardless of DST offset. */
function getIsraelDayQueryRange(referenceDate = new Date()) {
    const start = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
    const end = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);
    return { start, end, dateKey: israelDateKey(referenceDate) };
}

function formatTimeIL(dateInput) {
    if (!dateInput) return '';
    return new Intl.DateTimeFormat('he-IL', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dateInput));
}

/** `workshops` CMS -> { typesMap, serviceIdToTypeId, allServiceIds } */
export async function loadWorkshopTypes() {
    const result = await wixData.query('workshops').find(SA);
    const typesMap = {};
    const serviceIdToTypeId = {};

    for (const item of (result.items || [])) {
        const serviceIds = String(item.serviceIds || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!serviceIds.length) continue;
        typesMap[item._id] = {
            id: item._id,
            title: item.workshopName || 'סדנה',
            colorHex: normalizeColorHex(item.colorTag),
            serviceIds,
        };
        for (const sid of serviceIds) serviceIdToTypeId[sid] = item._id;
    }

    return { typesMap, serviceIdToTypeId, allServiceIds: Object.keys(serviceIdToTypeId) };
}

/**
 * Today's Wix Bookings sessions across every workshop type's service ids,
 * enriched with the CMS workshop type (id/title/color). Used both for the
 * customer identification flow (matching a phone to a session) and the
 * staff bypass (picking any active workshop directly).
 */
export async function getTodaySessions() {
    const { typesMap, serviceIdToTypeId, allServiceIds } = await loadWorkshopTypes();
    if (!allServiceIds.length) return [];

    const { start, end, dateKey } = getIsraelDayQueryRange();
    const options = { slotsPerDay: 100 };

    const allResults = await Promise.all(allServiceIds.map(async (serviceId) => {
        try {
            const query = { filter: { serviceId, startDate: start.toISOString(), endDate: end.toISOString() } };
            const availability = await availabilityCalendar.queryAvailability(query, options);
            return availability.availabilityEntries || [];
        } catch (err) {
            console.error('[studioUpsell/sessions] availability error for service', serviceId, err?.message || err);
            return [];
        }
    }));

    const sessions = [];
    const seen = new Set();

    for (const entries of allResults) {
        for (const entry of entries) {
            const slot = entry.slot || {};
            const anyId = slot.eventId || slot.sessionId;
            if (!anyId || !slot.startDate) continue;
            if (israelDateKey(slot.startDate) !== dateKey) continue;

            const key = `${slot.serviceId}_${new Date(slot.startDate).getTime()}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const typeId = serviceIdToTypeId[slot.serviceId] || null;
            const type = typeId ? typesMap[typeId] : null;

            sessions.push({
                id: anyId,
                sessionId: slot.sessionId || null,
                eventId: slot.eventId || null,
                serviceId: slot.serviceId,
                workshopTypeId: typeId,
                workshopTitle: type?.title || 'סדנה',
                colorHex: type?.colorHex || DEFAULT_COLOR_HEX,
                start: slot.startDate,
                startLabel: formatTimeIL(slot.startDate),
            });
        }
    }

    sessions.sort((a, b) => new Date(a.start) - new Date(b.start));
    return sessions;
}

export async function getSessionById(sessionId) {
    if (!sessionId) return null;
    const sessions = await getTodaySessions();
    return sessions.find((s) => s.id === sessionId || s.sessionId === sessionId || s.eventId === sessionId) || null;
}
