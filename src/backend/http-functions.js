import { ok, badRequest, serverError } from 'wix-http-functions';
import { availabilityCalendar } from 'wix-bookings.v2';

// ============================================================
// ManyChat availability endpoint
// GET /_functions/availableDates?workshopType=tufting&offset=0
// ============================================================

const ISRAEL_TZ = 'Asia/Jerusalem';
const PAGE_SIZE = 10;
const QUERY_CHUNK_DAYS = 45;
const MAX_LOOKAHEAD_DAYS = 365;

const WORKSHOP_SERVICE_IDS = {
  tufting: [
    '22e86498-525e-4580-9c83-a4470b0c874d',
    '3406e74d-949b-44b0-a5cc-064548129c08',
    'c1c1e799-84a9-4847-adf6-2a34480c5bfe',
  ],
  candles: [
    'eb8fec0e-5d04-48a3-a795-e3e8051d07da',
    'f0f6e447-02d8-4808-80ba-3c380ce9eae8',
  ],
  charms: [
    '06714046-860f-4f2e-a7cd-2d1c118e5385',
    '19261a10-2de0-42dd-a241-ed2bdf960fc6',
  ],
  jewelry: [
    '7e695ead-0363-4ede-9519-c2649674d2d4',
    'e3190974-9abc-4c6f-970f-98dad6032553',
  ],
  ceramics: ['ad89914a-1845-48c6-804d-544cd17f179b'],
};

const WORKSHOP_TYPE_ALIASES = {
  tufting: 'tufting',
  'טאפטינג': 'tufting',
  candles: 'candles',
  'נרות': 'candles',
  charms: 'charms',
  "צ'ארמס": 'charms',
  'צארמס': 'charms',
  jewelry: 'jewelry',
  'תכשיטים': 'jewelry',
  ceramics: 'ceramics',
  'קרמיקה': 'ceramics',
};

const WORKSHOP_TYPE_LABELS_HE = ['טאפטינג', 'נרות', 'תכשיטים', "צ'ארמס", 'קרמיקה'];

function resolveWorkshopType(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  return WORKSHOP_TYPE_ALIASES[trimmed] || WORKSHOP_TYPE_ALIASES[trimmed.toLowerCase()] || null;
}

function israelDateKey(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatDateIL(d) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

function formatTimeIL(d) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

async function fetchAvailabilityChunk(serviceIds, startDate, endDate) {
  const options = { slotsPerDay: 100 };
  const results = await Promise.all(serviceIds.map(async (serviceId) => {
    try {
      const availability = await availabilityCalendar.queryAvailability({
        filter: {
          serviceId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      }, options);
      return availability.availabilityEntries || [];
    } catch (err) {
      console.warn(`[availableDates] availability error for service ${serviceId}:`, err?.message || err);
      return [];
    }
  }));
  return results.flat();
}

function isBookableEntry(entry, now) {
  if (!entry.bookable) return false;
  if (entry.locked) return false;
  if (entry.bookingPolicyViolations?.tooLateToBook) return false;
  if (!entry.openSpots || entry.openSpots <= 0) return false;
  const startDate = entry.slot?.startDate;
  if (!startDate) return false;
  return new Date(startDate).getTime() >= now.getTime();
}

/** Scans forward in date-range chunks until `neededCount` distinct future
 * bookable calendar dates are found (or MAX_LOOKAHEAD_DAYS is hit). */
async function collectAvailableDates(serviceIds, neededCount) {
  const now = new Date();
  const byDate = new Map(); // dateKey -> { dateObj, times: Set<string> }
  let chunkStart = new Date(now);
  let daysScanned = 0;

  while (byDate.size < neededCount && daysScanned < MAX_LOOKAHEAD_DAYS) {
    const chunkEnd = new Date(chunkStart.getTime() + QUERY_CHUNK_DAYS * 24 * 60 * 60 * 1000);
    const entries = await fetchAvailabilityChunk(serviceIds, chunkStart, chunkEnd);

    for (const entry of entries) {
      if (!isBookableEntry(entry, now)) continue;
      const startDateObj = new Date(entry.slot.startDate);
      const dateKey = israelDateKey(startDateObj);

      if (!byDate.has(dateKey)) byDate.set(dateKey, { dateObj: startDateObj, times: new Set() });
      const bucket = byDate.get(dateKey);
      bucket.times.add(formatTimeIL(startDateObj));
      if (startDateObj < bucket.dateObj) bucket.dateObj = startDateObj;
    }

    daysScanned += QUERY_CHUNK_DAYS;
    chunkStart = chunkEnd;
  }

  return byDate;
}

function buildNextPageUrl(request, workshopType, nextOffset) {
  try {
    const u = new URL(request.url);
    u.searchParams.set('workshopType', workshopType);
    u.searchParams.set('offset', String(nextOffset));
    return u.toString();
  } catch (_) {
    return null;
  }
}

function parseOffset(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value === 'null' || value === 'undefined') return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

// GET https://<yourdomain>/_functions/availableDates?workshopType=טאפטינג&offset=0
export async function get_availableDates(request) {
  try {
    const workshopTypeRaw = String(request.query.workshopType || '').trim();
    const workshopKey = resolveWorkshopType(workshopTypeRaw);
    const serviceIds = workshopKey ? WORKSHOP_SERVICE_IDS[workshopKey] : null;

    if (!serviceIds) {
      return badRequest({
        headers: { 'Content-Type': 'application/json' },
        body: {
          version: 'v2',
          content: {
            messages: [{
              type: 'text',
              text: `סוג סדנה לא תקין. השתמש באחד מהערכים: ${WORKSHOP_TYPE_LABELS_HE.join(' | ')}`,
            }],
          },
          error: 'invalid_workshopType',
        },
      });
    }

    const offset = parseOffset(request.query.offset);

    const neededCount = offset + PAGE_SIZE + 1;
    const byDate = await collectAvailableDates(serviceIds, neededCount);

    const sortedDates = [...byDate.values()].sort((a, b) => a.dateObj - b.dateObj);
    const pageSlice = sortedDates.slice(offset, offset + PAGE_SIZE);

    const dates = pageSlice.map(({ dateObj, times }) => {
      const sortedTimes = [...times].sort();
      return `${formatDateIL(dateObj)}: ${sortedTimes.join(' | ')}`;
    });

    const hasMore = sortedDates.length > offset + PAGE_SIZE;
    const nextOffset = hasMore ? offset + PAGE_SIZE : null;
    const nextPageUrl = hasMore ? buildNextPageUrl(request, workshopTypeRaw, nextOffset) : null;
    const datesText = dates.length ? dates.join('\n') : 'לא נמצאו תאריכים פנויים.';

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: {
        version: 'v2',
        content: { messages: [{ type: 'text', text: datesText }] },
        workshopType: workshopTypeRaw,
        offset,
        count: dates.length,
        dates,
        datesText,
        hasMore,
        nextOffset,
        nextPageUrl,
      },
    });
  } catch (err) {
    return serverError({ body: { error: String(err) } });
  }
}
