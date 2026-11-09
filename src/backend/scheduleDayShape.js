/**
 * Shapes buildBoard() days into the client payload used by the admin board
 * and the schedule calendar (per-type sessions/slots, staffing, capacity).
 */
import { classifyShiftSlot } from 'backend/availabilityRules.js';
import { typeFilledCount, requiredInstructorsFor, canonicalSessionKey } from 'backend/schedulingEngine.js';

const EMPTY_COMP = { adults: 0, children: 0, pairs: 0, soloAdults: 0, extraChildren: 0, people: 0 };

function shapeType(board, dateKey, t) {
    const sortedSessions = [...t.sessions].sort();
    const timeRanges = sortedSessions.map(start => ({ start, end: t.sessionEnds?.[start] || null }));
    const earliestStart = sortedSessions[0] || null;
    const rule = board.rules[t.typeId];
    const slots = (sortedSessions.length ? sortedSessions : [null]).map((start, idx) => {
        const key = start ? canonicalSessionKey(start) : null;
        const comp = key && t.sessionComps?.[key]
            ? t.sessionComps[key]
            : (sortedSessions.length <= 1
                ? { adults: t.adults, children: t.children, pairs: t.pairs, soloAdults: t.soloAdults, extraChildren: t.extraChildren, people: t.people }
                : EMPTY_COMP);
        const cap = key ? t.sessionCapacity?.[key] : null;
        return {
            start: key || start,
            end: key ? (t.sessionEnds?.[key] || null) : null,
            adults: comp.adults || 0,
            children: comp.children || 0,
            required: requiredInstructorsFor(rule, comp),
            label: sortedSessions.length > 1 ? `מפגש ${idx + 1}` : '',
            capacity: cap ? { total: cap.total, open: cap.open } : null,
        };
    });
    let fillRemaining = typeFilledCount(t);
    for (const slot of slots) {
        slot.filled = Math.min(fillRemaining, slot.required);
        fillRemaining -= slot.filled;
    }
    return {
        typeId: t.typeId,
        name: t.name,
        adults: t.adults,
        children: t.children,
        required: t.required,
        filled: typeFilledCount(t),
        assignedEmployeeIds: t.assignedEmployeeIds,
        standbyCount: t.standbyQueue.length,
        timeRanges,
        slots,
        isMorning: earliestStart ? classifyShiftSlot(dateKey, earliestStart) === 'morning' : false,
    };
}

/** @returns {Object<string, { hasWorkshops, hasTufting, types: object[] }>} */
export function shapeBoardDays(board, tuftingTypeIds) {
    const days = {};
    for (const [dateKey, day] of Object.entries(board.days)) {
        days[dateKey] = {
            hasWorkshops: day.hasWorkshops,
            hasTufting: Object.keys(day.types).some(id => tuftingTypeIds?.has(id)),
            types: Object.values(day.types).map(t => shapeType(board, dateKey, t)),
        };
    }
    return days;
}
