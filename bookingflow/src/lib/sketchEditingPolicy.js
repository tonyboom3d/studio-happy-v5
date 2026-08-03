export const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
export const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/** Pre-checkout policy message based on time until workshop. */
export function getPreBookingPolicyHighlight(workshopStartTimestamp) {
  if (!workshopStartTimestamp) return null;

  const msUntilWorkshop = new Date(workshopStartTimestamp).getTime() - Date.now();

  if (msUntilWorkshop > SIX_DAYS_MS) {
    return 'עד 6 ימים לפני מועד הסדנה';
  }
  if (msUntilWorkshop > FORTY_EIGHT_HOURS_MS) {
    return 'עד 10 שעות מרגע ביצוע ההזמנה';
  }
  return 'עד 6 שעות מרגע ביצוע ההזמנה';
}

export function isEditingWindowClosed(order) {
  if (order?.editingWindowAllowed === false) return true;
  if (order?.editingWindowAllowed === true) return false;
  if (!order?.deadlineAt) return false;
  return Date.now() >= new Date(order.deadlineAt).getTime();
}
