import { getSlotDateStrIsrael } from '@/lib/slotTime';

const TUFTING_SERVICE_IDS = new Set([
  '22e86498-525e-4580-9c83-a4470b0c874d',
  '3406e74d-949b-44b0-a5cc-064548129c08',
  'c1c1e799-84a9-4847-adf6-2a34480c5bfe',
]);

/** Keep in sync with TUFTING_DATE_PRICE_OVERRIDES in workshopServiceIds.js */
const TUFTING_DATE_PRICE_OVERRIDES = {
  '2026-10-27': { solo: 550, parentChild: 600 },
};

export function resolveDisplayedPricing(slot, servicePricing) {
  const pricing = servicePricing?.[slot?.serviceId];
  if (!pricing || pricing.byDay) return pricing || null;
  if (!TUFTING_SERVICE_IDS.has(slot?.serviceId)) return pricing;
  const override = TUFTING_DATE_PRICE_OVERRIDES[getSlotDateStrIsrael(slot)];
  if (!override) return pricing;
  return {
    ...pricing,
    solo: override.solo,
    parentChild: override.parentChild,
    minPrice: override.solo,
    maxPrice: override.parentChild,
  };
}
