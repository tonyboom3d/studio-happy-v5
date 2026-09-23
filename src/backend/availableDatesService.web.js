/**
 * Shared ManyChat / reschedule availability.
 * queryAvailability runs here (not in http-functions) — no auth.elevate (breaks in HTTP context).
 */
import { Permissions, webMethod } from 'wix-web-module';
import { availabilityCalendar } from 'wix-bookings.v2';
import {
  WORKSHOP_SERVICE_IDS,
  WORKSHOP_TYPE_LABELS_HE,
  resolveWorkshopType,
  expandCandlesServiceIds,
  isCandlesLimitedSlotAllowed,
  CANDLES_LIMITED_SERVICE_ID,
} from 'backend/workshopServiceIds.js';

const ISRAEL_TZ = 'Asia/Jerusalem';
const PAGE_SIZE = 10;
const QUERY_CHUNK_DAYS = 45;
const MAX_LOOKAHEAD_DAYS = 365;

const WORKSHOP_TYPE_LABELS_HE_LIST = ['טאפטינג', 'נרות', 'תכשיטים', "צ'ארמס", 'קרמיקה'];

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

function parseOffset(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value === 'null' || value === 'undefined') return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function resolveServiceIds(workshopKey) {
  if (!workshopKey) return null;
  if (workshopKey === 'candles') {
    return expandCandlesServiceIds(WORKSHOP_SERVICE_IDS.candles, new Date());
  }
  return WORKSHOP_SERVICE_IDS[workshopKey];
}

async function queryAvailabilityForService(serviceId, startDate, endDate, options) {
  const query = {
    filter: {
      serviceId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  };
  const availability = await availabilityCalendar.queryAvailability(query, options);
  return availability.availabilityEntries || [];
}

async function fetchAvailabilityChunk(serviceIds, startDate, endDate) {
  const options = { slotsPerDay: 100 };
  const results = await Promise.all(serviceIds.map(async (serviceId) => {
    try {
      return await queryAvailabilityForService(serviceId, startDate, endDate, options);
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

async function collectAvailableDates(serviceIds, neededCount) {
  const now = new Date();
  const byDate = new Map();
  let chunkStart = new Date(now);
  let daysScanned = 0;

  while (byDate.size < neededCount && daysScanned < MAX_LOOKAHEAD_DAYS) {
    const chunkEnd = new Date(chunkStart.getTime() + QUERY_CHUNK_DAYS * 24 * 60 * 60 * 1000);
    const entries = await fetchAvailabilityChunk(serviceIds, chunkStart, chunkEnd);

    for (const entry of entries) {
      if (!isBookableEntry(entry, now)) continue;
      const startDateObj = new Date(entry.slot.startDate);
      const entryServiceId = entry.slot?.serviceId;
      if (entryServiceId === CANDLES_LIMITED_SERVICE_ID && !isCandlesLimitedSlotAllowed(startDateObj)) continue;
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

/**
 * Builds the JSON body for GET /_functions/availableDates (ManyChat + CE fallback).
 * @param {string} [nextPageUrlBase] — full request URL for pagination links
 */
export async function buildAvailableDatesPayload(workshopTypeRaw, offsetRaw, nextPageUrlBase) {
  const workshopType = String(workshopTypeRaw || '').trim();
  const workshopKey = resolveWorkshopType(workshopType);
  const serviceIds = resolveServiceIds(workshopKey);

  if (!serviceIds) {
    return {
      invalid: true,
      body: {
        version: 'v2',
        content: {
          messages: [{
            type: 'text',
            text: `סוג סדנה לא תקין. השתמש באחד מהערכים: ${WORKSHOP_TYPE_LABELS_HE_LIST.join(' | ')}`,
          }],
        },
        error: 'invalid_workshopType',
      },
    };
  }

  const offset = parseOffset(offsetRaw);
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
  let nextPageUrl = null;
  if (hasMore && nextPageUrlBase) {
    try {
      const u = new URL(nextPageUrlBase);
      u.searchParams.set('workshopType', workshopType);
      u.searchParams.set('offset', String(nextOffset));
      nextPageUrl = u.toString();
    } catch (_) { /* ignore */ }
  }

  const datesText = dates.length ? dates.join('\n') : 'לא נמצאו תאריכים פנויים.';

  return {
    invalid: false,
    body: {
      version: 'v2',
      content: { messages: [{ type: 'text', text: datesText }] },
      workshopType,
      offset,
      count: dates.length,
      dates,
      datesText,
      hasMore,
      nextOffset,
      nextPageUrl,
    },
  };
}

/** Reschedule page / site frontend — same payload without HTTP wrapper. */
export const getAvailableDatesPage = webMethod(Permissions.Anyone, async (workshopTypeRaw, offsetRaw) => {
  const result = await buildAvailableDatesPayload(workshopTypeRaw, offsetRaw, null);
  if (result.invalid) {
    throw new Error(result.body?.error || 'invalid_workshopType');
  }
  return result.body;
});
