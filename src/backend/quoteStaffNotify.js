// Quote staff WhatsApp (ManyChat): assignment with role + early-arrival note, unassignment, cancellation.
import wixData from 'wix-data';
import { loadAddonsCatalog } from 'backend/quoteCore.js';
import { writeQuoteLog } from 'backend/quoteLog.js';
import { sendEmployeeTemplateMessage } from 'backend/employeeTemplates.js';
import { quoteVars, manyChatVars } from 'backend/quoteNotify.js';

const SA = { suppressAuth: true, suppressHooks: true };
const SYSTEM = { type: 'system', name: 'מערכת', userId: '' };
const DEFAULT_ROLE = 'מדריך/ה סדנה';

async function loadStaff(ids) {
    if (!ids.length) return [];
    const res = await wixData.query('Dashboard_Roles').hasSome('_id', ids).limit(100).find(SA);
    return Promise.all(res.items.map(async (r) => {
        const t = await wixData.queryReferenced('Dashboard_Roles', r._id, 'connectedTrainings', { suppressAuth: true, limit: 100 }).catch(() => ({ items: [] }));
        return { id: r._id, name: r.displayName || '', phone: r.phone || '', trainingIds: (t.items || []).map((a) => a._id) };
    }));
}

const minusMinutes = (hhmm, mins) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return '';
    const t = (((h * 60 + m - mins) % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Role = quote extras the employee is trained on; arrival = event start minus the largest arrivalOffsetMinutes. */
function roleFor(quote, staff, catalog) {
    const byId = new Map(catalog.map((a) => [a.id, a]));
    const extras = (quote.extras || []).map((x) => byId.get(x.id)).filter((a) => a && staff.trainingIds.includes(a.id));
    const offset = Math.max(0, ...extras.map((a) => a.arrivalOffsetMinutes || 0));
    const start = quote.eventStartTime || '';
    const arrivalTime = offset > 0 ? minusMinutes(start, offset) : start;
    return {
        role: extras.length ? extras.map((a) => a.title).join(', ') : DEFAULT_ROLE,
        arrivalTime,
        arrivalEarly: offset > 0 ? 'כן' : 'לא',
        arrivalNote: offset > 0
            ? `יש להגיע ${offset} דק׳ לפני תחילת האירוע (בשעה ${arrivalTime}) לצורך הכנת ${extras.filter((a) => a.arrivalOffsetMinutes > 0).map((a) => a.title).join(', ')}.`
            : `הגעה בשעת תחילת האירוע (${start}).`,
    };
}

const isConfirmed = (quote) => quote?.status === 'signed' && Number(quote.paidAmount) > 0;

/** Notifies newly assigned / removed staff once the event is confirmed (signed + paid). Returns the saved quote. */
export async function syncStaffNotifications(quote) {
    try {
        if (!isConfirmed(quote)) return quote;
        const assigned = quote.assignedStaffIds || [];
        const notified = quote.staffNotifiedIds || [];
        const added = assigned.filter((id) => !notified.includes(id));
        const removed = notified.filter((id) => !assigned.includes(id));
        if (!added.length && !removed.length) return quote;

        const [staff, catalog] = await Promise.all([loadStaff([...added, ...removed]), loadAddonsCatalog()]);
        const base = quoteVars(quote);
        const sentAdded = [];
        const log = { assigned: [], removed: [] };
        for (const s of staff.filter((x) => added.includes(x.id))) {
            const vars = manyChatVars({ ...base, displayName: s.name, ...roleFor(quote, s, catalog) });
            if (await sendEmployeeTemplateMessage('employee_quote_assigned', s.phone, vars)) { sentAdded.push(s.id); log.assigned.push(s.name); }
        }
        for (const s of staff.filter((x) => removed.includes(x.id))) {
            const vars = manyChatVars({ displayName: s.name, customerName: base.customerName, eventDate: base.eventDate, eventTime: base.eventTime, quoteNumber: base.quoteNumber });
            if (await sendEmployeeTemplateMessage('employee_quote_unassigned', s.phone, vars)) log.removed.push(s.name);
        }
        const staffNotifiedIds = [...notified.filter((id) => assigned.includes(id)), ...sentAdded];
        const fresh = await wixData.get('Quotes', quote._id, SA);
        const saved = await wixData.update('Quotes', { ...fresh, staffNotifiedIds }, SA);
        if (log.assigned.length || log.removed.length) await writeQuoteLog(quote._id, 'staff_notified', log, SYSTEM);
        return saved;
    } catch (err) {
        console.error('[quoteStaffNotify] sync failed:', err?.message || err);
        return quote;
    }
}

export async function notifyStaffCancelled(quote) {
    try {
        const ids = quote.staffNotifiedIds || [];
        if (!ids.length) return 0;
        const base = quoteVars(quote);
        let sent = 0;
        for (const s of await loadStaff(ids)) {
            const vars = manyChatVars({ displayName: s.name, customerName: base.customerName, eventDate: base.eventDate, eventTime: base.eventTime, quoteNumber: base.quoteNumber });
            if (await sendEmployeeTemplateMessage('employee_quote_cancelled', s.phone, vars)) sent++;
        }
        return sent;
    } catch (err) {
        console.error('[quoteStaffNotify] cancel notify failed:', err?.message || err);
        return 0;
    }
}
