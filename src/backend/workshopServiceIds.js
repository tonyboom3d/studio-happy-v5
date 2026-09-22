/**
 * workshopServiceIds.js — shared Wix Bookings service-ID map, used by
 * http-functions.js (ManyChat availableDates) and orderLookupService.js
 * (order identification). Single source of truth to avoid drift between
 * the two.
 *
 * tufting / candles / ceramics also get a WorkshopOrders CMS record.
 * charms / jewelry are booked directly via Wix Bookings only — no CMS record.
 */

export const WORKSHOP_SERVICE_IDS = {
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

/** Primary Wix Bookings service id for סדנת קרמיקה (promo coupons scope here). */
export const CERAMICS_SERVICE_ID = WORKSHOP_SERVICE_IDS.ceramics[0];

// Workshop types with no WorkshopOrders CMS record — booking-only lookup path.
export const BOOKING_ONLY_WORKSHOP_TYPES = ['charms', 'jewelry'];

export function getBookingOnlyServiceIds() {
  return BOOKING_ONLY_WORKSHOP_TYPES.flatMap((type) => WORKSHOP_SERVICE_IDS[type] || []);
}

export const WORKSHOP_TYPE_ALIASES = {
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

export const WORKSHOP_TYPE_LABELS_HE = {
  tufting: 'טאפטינג',
  candles: 'נרות',
  ceramics: 'קרמיקה',
  charms: "צ'ארמס",
  jewelry: 'תכשיטים',
};

export function resolveWorkshopType(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  return WORKSHOP_TYPE_ALIASES[trimmed] || WORKSHOP_TYPE_ALIASES[trimmed.toLowerCase()] || null;
}

export function serviceIdToWorkshopType(serviceId) {
  for (const [type, ids] of Object.entries(WORKSHOP_SERVICE_IDS)) {
    if (ids.includes(serviceId)) return type;
  }
  return null;
}
