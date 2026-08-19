// Shared price logic for the ceramics ("סדנת קרמיקה") workshop.
// Keeps CeramicsParticipantsSection and CeramicsBooking in sync with the
// backend formula in bookingService.web.js (createAndCheckout).
//
// Model: two ticket types —
// · "יחיד" (9+) — one seat, one ceramic piece.
// · "הורה וילד" (3-8) — one ticket covers a parent+child pair (2 seats),
//   one shared ceramic piece.
// Each ticket (יחיד or הורה וילד) may add up to one "כלי קרמיקה נוסף" — a
// Wix Bookings add-on (no extra seat). Prices: ₪80 אמצע שבוע, ₪90 שבת.
//
// Pricing is defined in Wix per day-of-week (single consolidated service
// with ticket variants), not per serviceId — resolveCeramicsDayPricing picks
// out the {solo, parentChild, extraItem} triple for the selected slot's day.

import { getSlotWeekdayEnum } from './slotTime';

/**
 * @param {{ byDay?: Record<string, { solo: number|null, parentChild: number|null, extraItem: number|null }> }} servicePricing
 * @param {object} slot - the selected slot (needs slot.start.timestamp)
 * @returns {{ solo: number, parentChild: number, extraItem: number } | null}
 */
export function resolveCeramicsDayPricing(servicePricing, slot) {
  const byDay = servicePricing?.byDay;
  if (!byDay || !slot) return null;
  const dayEnum = getSlotWeekdayEnum(slot);
  const entry = dayEnum ? byDay[dayEnum] : null;
  if (!entry || typeof entry.solo !== 'number') return null;
  return {
    solo: entry.solo,
    parentChild: typeof entry.parentChild === 'number' ? entry.parentChild : entry.solo,
    extraItem: entry.extraItem || 0,
  };
}

/** Extra ceramic items never exceed one per ticket (solo or parent+child). */
export function getMaxExtraItems(soloTickets, parentChildTickets) {
  const totalTickets = (Number(soloTickets) || 0) + (Number(parentChildTickets) || 0);
  return Math.max(0, totalTickets);
}

/**
 * @param {{ soloTickets: number, parentChildTickets: number, extraItems: number }} counts
 * @param {{ solo?: number, parentChild?: number, extraItem?: number }} pricing
 */
export function computeCeramicsPrice({ soloTickets, parentChildTickets, extraItems }, pricing) {
  const soloUnitPrice = pricing?.solo || 0;
  const parentChildUnitPrice = pricing?.parentChild || soloUnitPrice;
  const extraItemUnitPrice = pricing?.extraItem || 0;

  const numSolo = Math.max(0, Number(soloTickets) || 0);
  const numParentChild = Math.max(0, Number(parentChildTickets) || 0);
  const totalTickets = numSolo + numParentChild;
  const numExtraItems = Math.max(0, Math.min(Number(extraItems) || 0, totalTickets));

  const soloTotal = numSolo * soloUnitPrice;
  const parentChildTotal = numParentChild * parentChildUnitPrice;
  const extraItemsTotal = numExtraItems * extraItemUnitPrice;
  const basePriceTotal = soloTotal + parentChildTotal;

  return {
    soloUnitPrice,
    parentChildUnitPrice,
    extraItemUnitPrice,
    soloTotal,
    parentChildTotal,
    basePriceTotal,
    extraItemsTotal,
    totalPrice: basePriceTotal + extraItemsTotal,
  };
}
