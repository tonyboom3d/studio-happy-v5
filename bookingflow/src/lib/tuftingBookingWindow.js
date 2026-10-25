import { getSlotDateStrIsrael } from '@/lib/slotTime';

const TUFTING_SERVICE_IDS = new Set([
  '22e86498-525e-4580-9c83-a4470b0c874d',
  '3406e74d-949b-44b0-a5cc-064548129c08',
  'c1c1e799-84a9-4847-adf6-2a34480c5bfe',
]);

/** Keep in sync with TUFTING_REGISTRATION_CUTOFFS in workshopServiceIds.js */
const TUFTING_REGISTRATION_CUTOFFS = {
  '2026-10-27': '2026-10-26T18:00:00',
};

function israelLocalToUtcMs(localIso) {
  const [datePart, timePart] = String(localIso).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm || 0, ss || 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcGuess));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return utcGuess - (asUtc - utcGuess);
}

/** Ms when this slot's one-off window closes, or null (48h rule). */
export function tuftingSlotCutoffMs(slot) {
  if (slot?.serviceId && !TUFTING_SERVICE_IDS.has(slot.serviceId)) return null;
  const key = getSlotDateStrIsrael(slot);
  const localIso = key && TUFTING_REGISTRATION_CUTOFFS[key];
  if (!localIso) return null;
  return israelLocalToUtcMs(localIso);
}
