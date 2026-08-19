// Shared price logic for the ceramics ("סדנת קרמיקה") workshop.
// Keeps CeramicsParticipantsSection and CeramicsBooking in sync with the
// backend formula in bookingService.web.js (createAndCheckout).
//
// Model: one "משתתף" ticket per person (no adult/child split); each
// participant may add up to one "כלי קרמיקה נוסף" (extra item), a
// surcharge-only add-on with no Wix Bookings seat of its own.
//
// Pricing is defined in Wix per day-of-week (single consolidated service
// with ticket variants), not per serviceId — resolveCeramicsDayPricing picks
// out the {base, extraItem} pair for the selected slot's day.

import { getSlotWeekdayEnum } from './slotTime';

/**
 * @param {{ byDay?: Record<string, { solo: number|null, extraItem: number|null }> }} servicePricing
 * @param {object} slot - the selected slot (needs slot.start.timestamp)
 * @returns {{ base: number, extraItem: number } | null}
 */
export function resolveCeramicsDayPricing(servicePricing, slot) {
  const byDay = servicePricing?.byDay;
  if (!byDay || !slot) return null;
  const dayEnum = getSlotWeekdayEnum(slot);
  const entry = dayEnum ? byDay[dayEnum] : null;
  if (!entry || typeof entry.solo !== 'number') return null;
  return { base: entry.solo, extraItem: entry.extraItem || 0 };
}

/** Extra ceramic items never exceed one per participant. */
export function getMaxExtraItems(participants) {
  return Math.max(0, Number(participants) || 0);
}

/**
 * @param {{ participants: number, extraItems: number }} counts
 * @param {{ base?: number, extraItem?: number }} pricing
 * @returns {{ baseUnitPrice: number, extraItemUnitPrice: number, basePriceTotal: number, extraItemsTotal: number, totalPrice: number }}
 */
export function computeCeramicsPrice({ participants, extraItems }, pricing) {
  const baseUnitPrice = pricing?.base || 0;
  const extraItemUnitPrice = pricing?.extraItem || 0;
  const numParticipants = Number(participants) || 0;
  const numExtraItems = Math.max(0, Math.min(Number(extraItems) || 0, numParticipants));

  const basePriceTotal = numParticipants * baseUnitPrice;
  const extraItemsTotal = numExtraItems * extraItemUnitPrice;

  return {
    baseUnitPrice,
    extraItemUnitPrice,
    basePriceTotal,
    extraItemsTotal,
    totalPrice: basePriceTotal + extraItemsTotal,
  };
}
