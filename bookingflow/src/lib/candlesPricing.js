import { validateFirstOrderMinimumCandles } from '@/lib/firstOrderMinimum';
import { getSlotDateStrIsrael, getSlotWeekdayEnum } from '@/lib/slotTime';

export const CANDLES_HALLOWEEN_SERVICE_ID = 'fd10d533-734f-4ef8-a69b-c8dad0dbf23d';
const CANDLES_LIMITED_SERVICE_ID = '925f55fc-521d-43e7-a679-53d243e65268';
const CANDLES_SATURDAY_SERVICE_ID = 'eb8fec0e-5d04-48a3-a795-e3e8051d07da';
const CANDLES_WEEKDAY_SERVICE_ID = 'f0f6e447-02d8-4808-80ba-3c380ce9eae8';
const CANDLES_HALLOWEEN_DATES = new Set(['2026-10-31', '2026-11-01']);

/** Halloween service stays on its two dates. Other candles sessions on those dates stay visible. */
export function filterCandlesCalendarSlots(slots) {
  return (slots || []).filter((slot) => {
    if (slot?.serviceId !== CANDLES_HALLOWEEN_SERVICE_ID) return true;
    return CANDLES_HALLOWEEN_DATES.has(getSlotDateStrIsrael(slot));
  });
}

function candlesPriceSourceId(slot) {
  return getSlotWeekdayEnum(slot) === 'SATURDAY'
    ? CANDLES_SATURDAY_SERVICE_ID
    : CANDLES_WEEKDAY_SERVICE_ID;
}

/** Halloween copies that weekday's ticket prices. Limited sessions keep their own tickets, but "נר נוסף" uses the same weekday price (the limited service has no add-on of its own). */
export function resolveCandlesSlotPricing(slot, servicePricing) {
  if (!slot?.serviceId || !servicePricing) return null;
  const own = servicePricing[slot.serviceId] || null;
  if (slot.serviceId !== CANDLES_HALLOWEEN_SERVICE_ID && slot.serviceId !== CANDLES_LIMITED_SERVICE_ID) {
    return own;
  }
  const source = servicePricing[candlesPriceSourceId(slot)];
  if (slot.serviceId === CANDLES_LIMITED_SERVICE_ID) {
    if (!own && !source) return null;
    return {
      ...(own || {}),
      extraCandle: source?.extraCandle ?? own?.extraCandle,
    };
  }
  if (!source) return own;
  return {
    ...(own || {}),
    solo: source.solo,
    parentChild: source.parentChild,
    extraChild: source.extraChild,
    extraCandle: source.extraCandle,
    minPrice: source.minPrice ?? source.solo,
    maxPrice: source.maxPrice ?? source.parentChild,
  };
}

// Shared ticket-count/price logic for the candles ("סדנת נרות") workshop.
// Keeps CandelsParticipantsSection and CandelsBooking in sync with the
// backend formula in bookingService.web.js (createAndCheckout).
//
// Model: price is per candle; Wix Bookings seats are per person.
// - Solo adult (no child): 1 seat, 1 candle, "יחיד" ticket.
// - Parent+child pair (first child under an adult): 2 seats (1 "יחיד" +
//   1 "ילד"), 1 shared candle, priced as "ילד".
// - Extra child (additional children under the same adult, up to MAX_CHILDREN_PER_ADULT):
//   1 seat ("תוספת ילד" ticket), 1 own candle, priced like a solo ticket.
export const MAX_CHILDREN_PER_ADULT = 5;

/**
 * @param {{ adults: number, children: number }} params
 * @returns {{
 *   accompanyingAdults: number, soloAdults: number, parentChildPairs: number,
 *   extraChildren: number, baseCandles: number, seatsUsed: number,
 *   soloTickets: number, childTickets: number, extraChildTickets: number,
 *   totalCandles: number,
 * }}
 */
export function computeCandlesCounts({ adults, children }) {
  // First child per adult → parent+child pair; second child under same adult → extra child.
  const parentChildPairs = Math.min(adults, children);
  const remainingChildren = children - parentChildPairs;
  const maxExtraPerPairedAdult = MAX_CHILDREN_PER_ADULT - 1;
  const extraChildren = Math.min(
    remainingChildren,
    parentChildPairs * maxExtraPerPairedAdult
  );
  const soloAdults = adults - parentChildPairs;
  const baseCandles = soloAdults + children;

  // Wix Bookings seats — every adult and every child occupies one seat,
  // regardless of how many candles/tickets they share.
  const seatsUsed = adults + children;

  // Wix Bookings ticket (variant) counts — what gets sent as
  // participantsChoices. A parent+child pair sends one "יחיד" seat (the
  // adult) + one "ילד" seat (the child), never a single doubled "ילד" seat.
  const soloTickets = soloAdults + parentChildPairs;
  const childTickets = parentChildPairs;
  const extraChildTickets = extraChildren;

  return {
    accompanyingAdults: parentChildPairs,
    soloAdults,
    parentChildPairs,
    extraChildren,
    baseCandles,
    seatsUsed,
    soloTickets,
    childTickets,
    extraChildTickets,
    // kept for backward compat with existing callers expecting totalCandles
    totalCandles: baseCandles,
  };
}

/**
 * @param {{ solo?: number, parentChild?: number, extraChild?: number }} pricing
 * @param {{ soloAdults: number, parentChildPairs: number, extraChildren: number }} counts
 */
export function computeCandlesPrice(pricing, counts) {
  const soloUnitPrice = pricing?.solo || 0;
  const parentChildUnitPrice = pricing?.parentChild || soloUnitPrice;
  // "תוספת ילד" is priced like a solo ticket — falls back to the solo price,
  // never to the (more expensive) parent+child package price.
  const extraChildUnitPrice = pricing?.extraChild || soloUnitPrice;
  const { soloAdults, parentChildPairs, extraChildren } = counts;

  const totalPrice =
    soloAdults * soloUnitPrice +
    parentChildPairs * parentChildUnitPrice +
    extraChildren * extraChildUnitPrice;

  return { soloUnitPrice, parentChildUnitPrice, extraChildUnitPrice, totalPrice };
}

/** Extra candles ("נר נוסף") never exceed one per base candle already ordered. */
export function getMaxExtraCandles(baseCandles) {
  return Math.max(0, Number(baseCandles) || 0);
}

/** @param {number} extraCandlePrice @param {number} extraCandles */
export function computeExtraCandlesPrice(extraCandlePrice, extraCandles) {
  return (Number(extraCandlePrice) || 0) * (Number(extraCandles) || 0);
}

/**
 * Gate for advancing past step 2 — shared by the continue button and accordion navigation.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCandelsParticipantsStep({
  adults,
  children,
  extraCandles,
  maxParticipants,
  selectedSlot,
}) {
  const { totalCandles, seatsUsed } = computeCandlesCounts({ adults, children });

  if (children > adults * MAX_CHILDREN_PER_ADULT) {
    const missingAdults = Math.ceil(children / MAX_CHILDREN_PER_ADULT) - adults;
    return {
      ok: false,
      error: `יש להוסיף ${missingAdults} ${missingAdults === 1 ? 'מבוגר מלווה' : 'מבוגרים מלווים'} — כל מבוגר יכול ללוות עד ${MAX_CHILDREN_PER_ADULT} ילדים בגילאי 4-10`,
    };
  }

  if (seatsUsed > maxParticipants) {
    return { ok: false, error: `נותרו ${maxParticipants} מקומות בלבד בתאריך שנבחר` };
  }

  const firstOrderError = validateFirstOrderMinimumCandles(totalCandles + extraCandles, selectedSlot);
  if (firstOrderError) {
    return { ok: false, error: firstOrderError };
  }

  return { ok: true };
}
