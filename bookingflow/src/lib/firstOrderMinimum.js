export const FIRST_ORDER_MIN_TICKETS = 2;

export function getSlotBookedParticipants(selectedSlot) {
  if (!selectedSlot) return 0;
  if (typeof selectedSlot.bookedParticipants === 'number') {
    return selectedSlot.bookedParticipants;
  }
  const total = selectedSlot.totalSpots ?? 0;
  const open = selectedSlot.openSpots ?? selectedSlot.remainingSpots ?? 0;
  if (total > 0) return Math.max(0, total - open);
  return 0;
}

export function isFirstOrderSlot(selectedSlot) {
  return getSlotBookedParticipants(selectedSlot) === 0;
}

export const FIRST_ORDER_MIN_TICKETS_MESSAGE =
  'זוהי ההזמנה הראשונה למועד זה, ולכן נדרשים לפחות 2 כרטיסים כדי לפתוח את הסדנה. ' +
  'אם ברצונכם להזמין כרטיס אחד בלבד, אנא בחרו מועד אחר שכבר נרשמו בו משתתפים, או חפשו תאריך ושעה אחרים.';

export function validateFirstOrderMinimum(ticketCount, selectedSlot) {
  if (!isFirstOrderSlot(selectedSlot)) return null;
  if (ticketCount < FIRST_ORDER_MIN_TICKETS) {
    return FIRST_ORDER_MIN_TICKETS_MESSAGE;
  }
  return null;
}
