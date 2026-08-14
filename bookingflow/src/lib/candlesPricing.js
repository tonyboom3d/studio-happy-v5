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
