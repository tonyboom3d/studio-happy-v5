const IL_TZ = 'Asia/Jerusalem';

function formatPartsIsrael(iso, options) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IL_TZ,
    ...options,
  }).formatToParts(new Date(iso));
}

function pick(parts, type) {
  return parts?.find((p) => p.type === type)?.value;
}

export function formatHHmmIsrael(iso) {
  const parts = formatPartsIsrael(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (!parts) return '';
  const h = pick(parts, 'hour') ?? '00';
  const m = pick(parts, 'minute') ?? '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function getSlotDateStrIsrael(slot) {
  const ts = slot?.start?.timestamp;
  if (!ts) return null;
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: IL_TZ });
}

export function getSlotStartTime(slot) {
  return formatHHmmIsrael(slot?.start?.timestamp);
}

export function getSlotEndTime(slot) {
  return formatHHmmIsrael(slot?.end?.timestamp);
}

export function getSlotTimeRange(slot) {
  const start = getSlotStartTime(slot);
  const end = getSlotEndTime(slot);
  if (!start) return '';
  if (!end || end === start) return start;
  return `${start}-${end}`;
}

export function getSlotLocalDate(slot) {
  const ts = slot?.start?.timestamp;
  if (!ts) return null;
  const dateParts = formatPartsIsrael(ts, { year: 'numeric', month: 'numeric', day: 'numeric' });
  const timeParts = formatPartsIsrael(ts, { hour: 'numeric', minute: 'numeric', hour12: false });
  return {
    year: Number(pick(dateParts, 'year')),
    monthOfYear: Number(pick(dateParts, 'month')),
    dayOfMonth: Number(pick(dateParts, 'day')),
    hourOfDay: Number(pick(timeParts, 'hour')),
    minutesOfHour: Number(pick(timeParts, 'minute')),
  };
}

export function sortSlotsByStartTime(a, b) {
  const ta = a?.start?.timestamp ? new Date(a.start.timestamp).getTime() : 0;
  const tb = b?.start?.timestamp ? new Date(b.start.timestamp).getTime() : 0;
  return ta - tb;
}
