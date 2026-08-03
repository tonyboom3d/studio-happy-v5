// Shared ticket-count/price logic for the candles ("סדנת נרות") workshop.
// Keeps CandelsParticipantsSection and CandelsBooking in sync with the
// backend formula in bookingService.web.js (createAndCheckout).
export const MAX_CHILDREN_PER_ADULT = 4;

/**
 * @param {{ adults: number, children: number }} params
 * @returns {{ accompanyingAdults: number, soloAdults: number, parentChildPairs: number, extraChildren: number, totalCandles: number }}
 */
export function computeCandlesCounts({ adults, children }) {
  const accompanyingAdults = Math.min(adults, Math.ceil(children / MAX_CHILDREN_PER_ADULT));
  const parentChildPairs = accompanyingAdults;
  const extraChildren = children - accompanyingAdults;
  const soloAdults = adults - accompanyingAdults;
  const totalCandles = soloAdults + children;

  return { accompanyingAdults, soloAdults, parentChildPairs, extraChildren, totalCandles };
}

/**
 * @param {{ solo?: number, parentChild?: number, extraChild?: number }} pricing
 * @param {{ soloAdults: number, parentChildPairs: number, extraChildren: number }} counts
 */
export function computeCandlesPrice(pricing, counts) {
  const soloUnitPrice = pricing?.solo || 0;
  const parentChildUnitPrice = pricing?.parentChild || soloUnitPrice;
  const extraChildUnitPrice = pricing?.extraChild || parentChildUnitPrice;
  const { soloAdults, parentChildPairs, extraChildren } = counts;

  const totalPrice =
    soloAdults * soloUnitPrice +
    parentChildPairs * parentChildUnitPrice +
    extraChildren * extraChildUnitPrice;

  return { soloUnitPrice, parentChildUnitPrice, extraChildUnitPrice, totalPrice };
}
