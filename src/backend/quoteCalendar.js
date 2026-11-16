// Quote calendar: blocked-time event on the studio staff schedule + workshop overlap detection.
import { events } from '@wix/calendar';
import { auth } from '@wix/essentials';
import { getQuoteSettings } from 'backend/quoteCore.js';

const TZ = 'Asia/Jerusalem';
// Business Owner staff events schedule (staff on every workshop service). QuoteSettings.calendarScheduleId overrides.
const DEFAULT_SCHEDULE_ID = 'cd7f5055-7597-40be-83dd-5af19bc49a47';

const ilDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const hhmm = (t) => (/^\d{1,2}:\d{2}$/.test(String(t || '')) ? String(t).padStart(5, '0') : '');
const local16 = (v) => String(v?.localDate || '').slice(0, 16);

/** Local (Israel) event window, or null when date/times are missing. */
export function quoteWindow(quote) {
    const start = hhmm(quote?.eventStartTime);
    const end = hhmm(quote?.eventEndTime);
    if (!quote?.eventDate || !start || !end || start >= end) return null;
    const day = ilDay(quote.eventDate);
    return { day, start: `${day}T${start}:00`, end: `${day}T${end}:00` };
}

/** Creates the blocked-time event. Idempotent per quote (_id is the idempotency key). */
export async function blockQuoteCalendar(quote) {
    if (quote.calendarEventId) return { eventId: quote.calendarEventId, already: true };
    const w = quoteWindow(quote);
    if (!w) return { error: 'no-window' };
    const settings = await getQuoteSettings().catch(() => null);
    const scheduleId = String(settings?.calendarScheduleId || '').trim() || DEFAULT_SCHEDULE_ID;
    const title = `אירוע פרטי #${quote.quoteNumber ?? ''} – ${quote.customerName || ''}`.trim().slice(0, 200);
    try {
        const ev = await auth.elevate(events.createEvent)({
            scheduleId,
            type: 'DEFAULT',
            transparency: 'OPAQUE',
            title,
            timeZone: TZ,
            start: { localDate: w.start },
            end: { localDate: w.end },
        }, { timeZone: TZ, idempotencyKey: quote._id });
        return { eventId: ev?._id || ev?.id || '', scheduleId };
    } catch (err) {
        console.error('[quoteCalendar] block failed:', err?.message || err);
        return { error: err?.message || String(err) };
    }
}

export async function releaseQuoteCalendar(quote) {
    if (!quote?.calendarEventId) return { released: false, reason: 'no-event' };
    try {
        await auth.elevate(events.cancelEvent)(quote.calendarEventId, { participantNotification: { notifyParticipants: false } });
        return { released: true };
    } catch (err) {
        console.error('[quoteCalendar] release failed:', err?.message || err);
        return { released: false, reason: 'error', error: err?.message || String(err) };
    }
}

/** Bookings class sessions overlapping the event window: [{ key, title, start, end, total, booked, remaining, summary }]. */
export async function findWorkshopOverlaps(quote) {
    const w = quoteWindow(quote);
    if (!w) return [];
    try {
        const res = await auth.elevate(events.queryEvents)({ cursorPaging: { limit: 100 } }, { fromLocalDate: w.start, toLocalDate: w.end, timeZone: TZ });
        const s = w.start.slice(0, 16);
        const e = w.end.slice(0, 16);
        return (res?.events || [])
            .filter((ev) => ev.type === 'CLASS' && ev.status !== 'CANCELLED' && (ev._id || ev.id) !== quote.calendarEventId)
            .filter((ev) => local16(ev.adjustedStart || ev.start) < e && local16(ev.adjustedEnd || ev.end) > s)
            .map((ev) => {
                const total = Number(ev.totalCapacity) || 0;
                const remaining = Math.max(0, Number(ev.remainingCapacity) || 0);
                const booked = Math.max(0, total - remaining);
                const start = local16(ev.adjustedStart || ev.start).slice(11);
                const end = local16(ev.adjustedEnd || ev.end).slice(11);
                const title = ev.title || 'סדנה';
                return {
                    key: ev._id || ev.id, title, start, end, total, booked, remaining,
                    summary: `${title} ${start}-${end} (${booked}/${total} רשומים, נותרו ${remaining})`,
                };
            });
    } catch (err) {
        console.error('[quoteCalendar] overlap query failed:', err?.message || err);
        return [];
    }
}
