/**

 * ManyChat + reschedule available dates.

 * Uses the same slot source as the booking iframe: bookingService.getCourseSessions

 * (Candels/Tufting order flow pages) — not raw queryAvailability from http-functions.

 */

import { Permissions, webMethod } from 'wix-web-module';

import { fetchCourseSessionsInternal } from 'backend/bookingService.web.js';

import {

  WORKSHOP_SERVICE_IDS,

  resolveWorkshopType,

  expandCandlesServiceIds,

} from 'backend/workshopServiceIds.js';



const ISRAEL_TZ = 'Asia/Jerusalem';

const PAGE_SIZE = 10;

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



/** Same bookable slots as CandelsBooking / TimeSlotsSection (via getCourseSessions). */

async function collectAvailableDatesByDay(serviceIds) {

  const now = new Date();

  const rangeEnd = new Date(now.getTime() + MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  let slots = [];

  try {

    slots = await fetchCourseSessionsInternal(now, rangeEnd, serviceIds);

  } catch (err) {

    console.warn('[availableDates] fetchCourseSessions failed:', err?.message || err, err?.details || '');

    slots = [];

  }

  if (!Array.isArray(slots)) slots = [];



  const byDate = new Map();

  for (const slot of slots) {

    const ts = slot?.start?.timestamp;

    if (!ts) continue;

    const startDateObj = new Date(ts);

    if (startDateObj.getTime() < now.getTime()) continue;



    const dayKey = israelDateKey(startDateObj);

    if (!byDate.has(dayKey)) {

      byDate.set(dayKey, { dateObj: startDateObj, times: new Set() });

    }

    const bucket = byDate.get(dayKey);

    bucket.times.add(formatTimeIL(startDateObj));

    if (startDateObj < bucket.dateObj) bucket.dateObj = startDateObj;

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

  const byDate = await collectAvailableDatesByDay(serviceIds);



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



/** Reschedule page — webMethod context (same payload). */

export const getAvailableDatesPage = webMethod(Permissions.Anyone, async (workshopTypeRaw, offsetRaw) => {

  const result = await buildAvailableDatesPayload(workshopTypeRaw, offsetRaw, null);

  if (result.invalid) {

    throw new Error(result.body?.error || 'invalid_workshopType');

  }

  return result.body;

});


