/**
 * Scheduling engine (Modules B+C) — internal module, no web methods.
 *
 * Capacity model (per user spec):
 * - Required instructors per day/workshop-type derive from paid WorkshopOrders
 *   participants and the SchedulingRules ratios (client-editable).
 * - Day availability is personalized per employee skills: a day is OPEN only
 *   if some workshop that day matching the employee's skills still needs
 *   instructors; skill-matched but full → STANDBY (waiting list); no skill
 *   match at all → submission rejected; no workshops → FREE (studio work).
 * - Waiting list is FIFO. Offers escalate hourly; exhausted/empty queue →
 *   OPEN_CALL banner (skill-matched employees) + WhatsApp to managers.
 *
 * Collections: ShiftAssignments, ShiftOffers (specs in plan).
 */
import wixData from 'wix-data';
import { availabilityCalendar } from 'wix-bookings.v2';
import { publish } from 'wix-realtime-backend';
import { SUBMISSION_STATUS, toDateKey, normalizeSettings, DEFAULT_WORK_TYPE } from 'backend/availabilityRules.js';
import { refIds, getRolePermissionValue, attachSkillsToRoles } from 'backend/staffRoles.js';
import { sendGreenApiWhatsApp } from 'backend/whatsappService.jsw';
import { enqueueNotification, enqueueManagerNotification, flushOutbox, PRIORITY } from 'backend/notificationOutbox.js';
import { maybeSuppressForPendingBacklog } from 'backend/pendingItemsQuery.js';
import { maybeSuppressManagerNotification } from 'backend/managerPendingQuery.js';

const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const PORTAL_URL = 'https://www.studiohappy.art/employee-portal';

export const ASSIGNMENT_STATUS = { STANDBY: 'STANDBY', APPROVED: 'APPROVED', CANCELLED: 'CANCELLED' };
export const OFFER_KIND = { WAITLIST_OFFER: 'WAITLIST_OFFER', OPEN_CALL: 'OPEN_CALL' };
export const OFFER_STATUS = { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', DECLINED: 'DECLINED', EXPIRED: 'EXPIRED', OPEN: 'OPEN', FILLED: 'FILLED' };
export const DAY_STATE = { FREE: 'FREE', OPEN: 'OPEN', WAITLIST: 'WAITLIST', NO_SKILL: 'NO_SKILL' };

export const OFFER_TTL_MS = 60 * 60 * 1000; // 1h FIFO escalation window

const REALTIME_CHANNEL = { name: 'scheduling-updates' };

export function publishSchedulingUpdate(reason, extra = {}) {
    return publish(REALTIME_CHANNEL, { reason, ...extra, ts: Date.now() })
        .catch(err => console.warn('[schedulingEngine] realtime publish failed:', err?.message || err));
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadSettings() {
    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA).catch(() => ({ items: [] }));
    const raw = result.items?.[0] || null;
    return {
        ...normalizeSettings(raw),
        holidays: parseHolidays(raw?.holidays),
        dayNotes: parseDayNotes(raw?.dayNotes),
        sketchSewingDays: parseSketchSewingDays(raw?.sketchSewingDays),
        _rawId: raw?._id || null,
    };
}

function parseHolidays(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.filter(h => h && h.date);
        } catch (_) { /* ignore */ }
    }
    return [];
}

/** { "<dateKey>": { message, updatedBy, updatedAt } } — manager notes on calendar days. */
function parseDayNotes(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) { /* ignore */ }
    }
    return {};
}

/** { "<dateKey>": { startTime, endTime, confirmedOverlap, updatedBy, updatedAt } } — manager-defined "sketch sewing" days, gated by the sketchSewingSkill flag. */
function parseSketchSewingDays(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) { /* ignore */ }
    }
    return {};
}

export async function loadWorkshopTypeMap() {
    const result = await wixData.query('workshops').find(SA).catch(() => ({ items: [] }));
    const typesById = {};
    const serviceIdToTypeId = {};
    for (const item of (result.items || [])) {
        typesById[item._id] = { id: item._id, name: item.workshopName || 'סדנה' };
        for (const sid of String(item.serviceIds || '').split(',').map(s => s.trim()).filter(Boolean)) {
            serviceIdToTypeId[sid] = item._id;
        }
    }
    return { typesById, serviceIdToTypeId };
}

export async function loadRulesByTypeId() {
    const result = await wixData.query('SchedulingRules').limit(500).find(SA).catch(() => ({ items: [] }));
    const map = {};
    for (const r of (result.items || [])) {
        if (r.active === false || !r.workshopTypeId) continue;
        map[r.workshopTypeId] = {
            id: r._id,
            workshopTypeId: r.workshopTypeId,
            participantsPerInstructor: Number(r.participantsPerInstructor) > 0 ? Number(r.participantsPerInstructor) : 8,
            parentChildParticipantsPerInstructor: Number(r.parentChildParticipantsPerInstructor) > 0 ? Number(r.parentChildParticipantsPerInstructor) : 6,
            minInstructors: Number(r.minInstructors) > 0 ? Number(r.minInstructors) : 1,
        };
    }
    return map;
}

export function requiredInstructorsFor(rule, adults, children) {
    const r = rule || { participantsPerInstructor: 8, parentChildParticipantsPerInstructor: 6, minInstructors: 1 };
    const load = (adults || 0) / r.participantsPerInstructor + (children || 0) / r.parentChildParticipantsPerInstructor;
    return Math.max(r.minInstructors, Math.ceil(load));
}

/** Active Dashboard_Roles rows; skills expanded when the field is a multi-ref. */
export async function loadActiveRoles() {
    const result = await wixData.query('Dashboard_Roles').ne('active', false).limit(1000).find(SA).catch(() => ({ items: [] }));
    return attachSkillsToRoles(result.items || []);
}

function dateRangeFilter(query, fromKey, toKey) {
    // Padded range + exact dateKey matching downstream (Israel/UTC safe).
    const start = new Date(`${fromKey}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(`${toKey}T23:59:59Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
}

async function loadPaidOrders(fromKey, toKey) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const items = [];
    let skip = 0;
    const pageSize = 1000;
    while (true) {
        const result = await wixData.query('WorkshopOrders')
            .eq('status', 'paid')
            .ge('workshopStart', start).le('workshopStart', end)
            .ascending('workshopStart')
            .skip(skip).limit(pageSize).find(SA).catch(() => ({ items: [] }));
        const batch = (result.items || []).filter(o => !o.cancelledAt);
        items.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
    }
    return items;
}

/** Scheduled Bookings slots — used so the calendar shows workshops even before paid orders exist. */
async function loadBookingsSessions(fromKey, toKey, serviceIdToTypeId) {
    const serviceIds = Object.keys(serviceIdToTypeId || {});
    if (!serviceIds.length) return [];

    const startDate = new Date(`${fromKey}T00:00:00Z`);
    const endDate = new Date(`${toKey}T23:59:59Z`);
    const options = { slotsPerDay: 100 };
    const rows = [];

    await Promise.all(serviceIds.map(async (serviceId) => {
        try {
            const query = {
                filter: {
                    serviceId,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                },
            };
            const availability = await availabilityCalendar.queryAvailability(query, options);
            for (const entry of (availability.availabilityEntries || [])) {
                const slot = entry.slot || {};
                if (!slot.startDate) continue;
                const dateKey = toDateKey(slot.startDate);
                if (dateKey < fromKey || dateKey > toKey) continue;
                const typeId = serviceIdToTypeId[slot.serviceId || serviceId];
                if (!typeId) continue;
                rows.push({
                    dateKey,
                    typeId,
                    startIso: new Date(slot.startDate).toISOString(),
                    endIso: slot.endDate ? new Date(slot.endDate).toISOString() : null,
                });
            }
        } catch (err) {
            console.warn(`[schedulingEngine] Bookings sessions load failed for ${serviceId}:`, err?.message || err);
        }
    }));

    return rows;
}

async function loadSubmissions(fromKey, toKey, consistent) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const result = await wixData.query('AvailabilitySubmissions')
        .ne('status', SUBMISSION_STATUS.REJECTED)
        .ge('date', start).le('date', end)
        .ascending('_createdDate')
        .limit(1000).find(consistent ? SAC : SA).catch(() => ({ items: [] }));
    return result.items || [];
}

async function loadAssignments(fromKey, toKey, consistent) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const result = await wixData.query('ShiftAssignments')
        .ne('status', ASSIGNMENT_STATUS.CANCELLED)
        .ge('date', start).le('date', end)
        .limit(1000).find(consistent ? SAC : SA).catch(() => ({ items: [] }));
    return result.items || [];
}

async function loadOffers(fromKey, toKey) {
    const { start, end } = dateRangeFilter(null, fromKey, toKey);
    const result = await wixData.query('ShiftOffers')
        .ge('date', start).le('date', end)
        .limit(1000).find(SAC).catch(() => ({ items: [] }));
    return result.items || [];
}

// ---------------------------------------------------------------------------
// Board — per-day / per-workshop-type capacity picture
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{
 *   days: Object<string, { hasWorkshops: boolean, types: Object<string, {
 *     typeId: string, name: string, adults: number, children: number,
 *     required: number, activeCount: number,
 *     standbyQueue: Array<{submissionId: string, employeeId: string, createdAt: Date}>,
 *     assignedCount: number, assignedEmployeeIds: string[]
 *   }> }>,
 *   skillsByRoleId: Object<string, string[]>,
 *   rolesById: Object<string, object>,
 *   typesById: Object<string, {id: string, name: string}>,
 *   rules: Object<string, object>,
 *   offers: object[]
 * }>}
 */
export async function buildBoard(fromKey, toKey, { consistent = false, includeOffers = false } = {}) {
    const { typesById, serviceIdToTypeId } = await loadWorkshopTypeMap();
    const [rules, roles, orders, submissions, assignments, offers, sessionRows] = await Promise.all([
        loadRulesByTypeId(),
        loadActiveRoles(),
        loadPaidOrders(fromKey, toKey),
        loadSubmissions(fromKey, toKey, consistent),
        loadAssignments(fromKey, toKey, consistent),
        includeOffers ? loadOffers(fromKey, toKey) : Promise.resolve([]),
        loadBookingsSessions(fromKey, toKey, serviceIdToTypeId),
    ]);

    const rolesById = {};
    const skillsByRoleId = {};
    for (const r of roles) {
        rolesById[r._id] = r;
        skillsByRoleId[r._id] = refIds(r.skills);
    }

    const days = {};
    const dayType = (dateKey, typeId) => {
        if (!days[dateKey]) days[dateKey] = { hasWorkshops: false, types: {} };
        if (!days[dateKey].types[typeId]) {
            days[dateKey].types[typeId] = {
                typeId,
                name: typesById[typeId]?.name || 'סדנה',
                adults: 0, children: 0, required: 0,
                activeCount: 0, standbyQueue: [],
                assignedCount: 0, assignedEmployeeIds: [],
                sessions: [], // distinct workshopStart ISO timestamps that day (calendar display)
                sessionEnds: {}, // startIso -> endIso, resolved from Bookings availability where known
            };
        }
        return days[dateKey].types[typeId];
    };

    for (const order of orders) {
        const dateKey = toDateKey(order.workshopStart);
        const typeId = serviceIdToTypeId[order.serviceId];
        if (!dateKey || !typeId || dateKey < fromKey || dateKey > toKey) continue;
        const t = dayType(dateKey, typeId);
        t.adults += order.adults || 0;
        t.children += order.children || 0;
        const startIso = order.workshopStart instanceof Date ? order.workshopStart.toISOString() : new Date(order.workshopStart).toISOString();
        if (!t.sessions.includes(startIso)) t.sessions.push(startIso);
        days[dateKey].hasWorkshops = true;
    }

    for (const { dateKey, typeId, startIso, endIso } of sessionRows) {
        const t = dayType(dateKey, typeId);
        if (!t.sessions.includes(startIso)) t.sessions.push(startIso);
        if (endIso) t.sessionEnds[startIso] = endIso;
        days[dateKey].hasWorkshops = true;
    }

    for (const dateKey of Object.keys(days)) {
        for (const t of Object.values(days[dateKey].types)) {
            t.required = requiredInstructorsFor(rules[t.typeId], t.adults, t.children);
        }
    }

    for (const a of assignments) {
        const dateKey = a.dateKey || toDateKey(a.date);
        if (!dateKey || dateKey < fromKey || dateKey > toKey || !a.workshopTypeId) continue;
        const t = dayType(dateKey, a.workshopTypeId);
        t.assignedCount++;
        if (a.employeeId) t.assignedEmployeeIds.push(a.employeeId);
    }

    for (const s of submissions) {
        const dateKey = toDateKey(s.date);
        if (!dateKey || dateKey < fromKey || dateKey > toKey) continue;
        const day = days[dateKey];
        if (!day) continue;
        const skills = skillsByRoleId[s.employeeId] || [];
        for (const typeId of Object.keys(day.types)) {
            if (!skills.includes(typeId)) continue;
            const t = day.types[typeId];
            if (s.status === SUBMISSION_STATUS.STANDBY) {
                t.standbyQueue.push({ submissionId: s._id, employeeId: s.employeeId, createdAt: s._createdDate });
            } else if (t.assignedEmployeeIds.includes(s.employeeId)) {
                // Already counted through the assignment row.
            } else {
                t.activeCount++;
            }
        }
    }

    return { days, skillsByRoleId, rolesById, typesById, rules, offers };
}

/** Coverage per type: filled = assigned + not-yet-assigned active submissions. */
export function typeFilledCount(t) {
    return t.assignedCount + t.activeCount;
}

/** Personalized day state for an employee's skills. */
export function personalDayState(day, skillTypeIds) {
    if (!day || !day.hasWorkshops) return DAY_STATE.FREE;
    const matched = Object.values(day.types).filter(t => skillTypeIds.includes(t.typeId));
    if (!matched.length) return DAY_STATE.NO_SKILL;
    return matched.some(t => typeFilledCount(t) < t.required) ? DAY_STATE.OPEN : DAY_STATE.WAITLIST;
}

/** Placement for a new submission at click time: SUBMITTED | STANDBY | null (no skill). */
export function resolvePlacement(day, skillTypeIds) {
    const state = personalDayState(day, skillTypeIds);
    if (state === DAY_STATE.FREE || state === DAY_STATE.OPEN) return SUBMISSION_STATUS.SUBMITTED;
    if (state === DAY_STATE.WAITLIST) return SUBMISSION_STATUS.STANDBY;
    return null;
}

// ---------------------------------------------------------------------------
// WhatsApp helpers
// ---------------------------------------------------------------------------

export async function notifyManagers(message, rolesById = null) {
    const roles = rolesById ? Object.values(rolesById) : await loadActiveRoles();
    const managers = roles.filter(r => getRolePermissionValue(r, 'manageScheduling') && r.phone);
    for (const m of managers) {
        await sendGreenApiWhatsApp(m.phone, message).catch(err =>
            console.error('[schedulingEngine] manager WhatsApp failed:', err?.message || err));
    }
    return managers.length;
}

function formatDateHe(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
    return `${dow}, ${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Waiting-list offers & open calls
// ---------------------------------------------------------------------------

function offersFor(offers, dateKey, typeId) {
    return offers.filter(o => (o.dateKey || toDateKey(o.date)) === dateKey && o.workshopTypeId === typeId);
}

/**
 * Ensures the day/type shortage is being handled: pending offer to next FIFO
 * standby, or an open call when the queue is exhausted/empty.
 */
async function ensureShortageHandled(dateKey, t, board, { batchNotify = false } = {}) {
    const existing = offersFor(board.offers, dateKey, t.typeId);
    if (existing.some(o => o.status === OFFER_STATUS.PENDING || o.status === OFFER_STATUS.OPEN)) return null;

    const alreadyOffered = new Set(existing
        .filter(o => o.kind === OFFER_KIND.WAITLIST_OFFER)
        .map(o => o.employeeId).filter(Boolean));

    const queue = [...t.standbyQueue].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const next = queue.find(q =>
        !alreadyOffered.has(q.employeeId) && !t.assignedEmployeeIds.includes(q.employeeId));

    const base = {
        dateKey,
        date: new Date(`${dateKey}T12:00:00Z`),
        monthKey: dateKey.slice(0, 7),
        workshopTypeId: t.typeId,
        workshopName: t.name,
        notifiedAt: new Date(),
    };

    if (next) {
        const offer = await wixData.insert('ShiftOffers', {
            ...base,
            kind: OFFER_KIND.WAITLIST_OFFER,
            status: OFFER_STATUS.PENDING,
            employeeId: next.employeeId,
            submissionId: next.submissionId,
            expiresAt: new Date(Date.now() + OFFER_TTL_MS),
        }, SA);
        const role = board.rolesById[next.employeeId];
        if (role?.phone) {
            const suppressed = await maybeSuppressForPendingBacklog(role);
            if (!suppressed) {
                await enqueueNotification({
                    actionKey: 'employee_shift_offer_standby',
                    recipientId: role._id,
                    recipientPhone: role.phone,
                    priority: PRIORITY.NORMAL,
                    entityKey: `offer:${dateKey}:${t.typeId}:${role._id}`,
                    vars: {
                        displayName: role?.displayName || '',
                        workshopName: t.name,
                        date: formatDateHe(dateKey),
                        portalLink: PORTAL_URL,
                    },
                });
            }
        } else {
            console.warn(`[schedulingEngine] role ${role?._id} has no phone — skipping WhatsApp`);
        }
        board.offers.push(offer);
        return offer;
    }

    const call = await wixData.insert('ShiftOffers', {
        ...base,
        kind: OFFER_KIND.OPEN_CALL,
        status: OFFER_STATUS.OPEN,
        employeeId: null,
        submissionId: null,
        expiresAt: null,
    }, SA);
    const openCallLine = `סדנת ${t.name}, ${formatDateHe(dateKey)}`;
    await enqueueManagerNotification('manager_open_call', {
        workshopName: t.name,
        date: formatDateHe(dateKey),
    }, {
        priority: batchNotify ? PRIORITY.NORMAL : PRIORITY.URGENT,
        entityKey: `open-call:${dateKey}:${t.typeId}`,
        rolesById: board.rolesById,
        shouldSuppress: batchNotify ? undefined : maybeSuppressManagerNotification,
        digest: batchNotify ? { line: openCallLine, kind: 'open_call' } : undefined,
    });
    board.offers.push(call);
    return call;
}

// ---------------------------------------------------------------------------
// Engine run
// ---------------------------------------------------------------------------

/**
 * Auto-assigns SUBMITTED availability to short workshops (priorityRank, then
 * FIFO), then routes remaining shortages to waiting-list offers / open calls.
 *
 * Fully disabled when the "אישור אוטומטי של משמרות" setting is OFF — in that
 * mode all submissions stay pending until a manager assigns them manually.
 */
export async function runScheduling(fromKey, toKey, { batchNotify = false } = {}) {
    const settings = await loadSettings();
    if (settings.autoApproveShifts === false) {
        console.log('[schedulingEngine] runScheduling skipped — autoApproveShifts is OFF (manual mode)');
        return { assigned: 0, offers: 0, openCalls: 0, skipped: 'manual-mode' };
    }
    const board = await buildBoard(fromKey, toKey, { consistent: true, includeOffers: true });
    const submissions = await loadSubmissions(fromKey, toKey, true);
    const subsById = {};
    for (const s of submissions) subsById[s._id] = s;

    const report = { assigned: 0, offers: 0, openCalls: 0 };
    const todayKey = toDateKey(new Date());

    for (const dateKey of Object.keys(board.days).sort()) {
        if (dateKey <= todayKey) continue;
        const day = board.days[dateKey];
        for (const t of Object.values(day.types)) {
            let shortage = t.required - t.assignedCount;
            if (shortage <= 0) continue;

            // Candidates: this day's SUBMITTED/SCHEDULED-not-assigned submissions with the skill.
            const candidates = submissions
                .filter(s => toDateKey(s.date) === dateKey
                    && s.status !== SUBMISSION_STATUS.STANDBY
                    && (board.skillsByRoleId[s.employeeId] || []).includes(t.typeId)
                    && !t.assignedEmployeeIds.includes(s.employeeId))
                .sort((a, b) => {
                    const ra = Number(board.rolesById[a.employeeId]?.priorityRank) || 999;
                    const rb = Number(board.rolesById[b.employeeId]?.priorityRank) || 999;
                    return ra - rb || new Date(a._createdDate) - new Date(b._createdDate);
                });

            for (const sub of candidates) {
                if (shortage <= 0) break;
                await wixData.insert('ShiftAssignments', {
                    dateKey,
                    date: new Date(`${dateKey}T12:00:00Z`),
                    monthKey: dateKey.slice(0, 7),
                    workshopTypeId: t.typeId,
                    workshopName: t.name,
                    employeeId: sub.employeeId,
                    submissionId: sub._id,
                    status: ASSIGNMENT_STATUS.APPROVED,
                    source: 'AUTO',
                    workType: DEFAULT_WORK_TYPE,
                }, SA);
                if (sub.status !== SUBMISSION_STATUS.SCHEDULED) {
                    await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SCHEDULED }, SA);
                }
                t.assignedCount++;
                t.assignedEmployeeIds.push(sub.employeeId);
                if (t.activeCount > 0) t.activeCount--;
                shortage--;
                report.assigned++;

                const role = board.rolesById[sub.employeeId];
                if (role?.phone) {
                    await enqueueNotification({
                        actionKey: 'employee_shift_assigned',
                        recipientId: role._id,
                        recipientPhone: role.phone,
                        priority: PRIORITY.NORMAL,
                        entityKey: `shift:${dateKey}:${role._id}`,
                        digest: { line: `${formatDateHe(dateKey)} — ${t.name}`, kind: 'assigned' },
                        vars: { displayName: role.displayName || '', portalLink: PORTAL_URL },
                    });
                }
            }

            if (shortage > 0) {
                const created = await ensureShortageHandled(dateKey, t, board, { batchNotify });
                if (created?.kind === OFFER_KIND.WAITLIST_OFFER) report.offers++;
                if (created?.kind === OFFER_KIND.OPEN_CALL) report.openCalls++;
            }
        }
    }

    if (report.assigned || report.offers || report.openCalls) {
        await publishSchedulingUpdate('engine-run', report);
    }
    if (report.assigned && !batchNotify) {
        await flushOutbox({ force: true }).catch(err => console.error('[schedulingEngine] flushOutbox failed:', err?.message || err));
    }
    console.log(`[schedulingEngine] runScheduling ${fromKey}..${toKey}:`, JSON.stringify(report));
    return report;
}

export const MAX_MANUAL_RUN_EMPLOYEES = 3;
export const MAX_MANUAL_RUN_DAYS = 28; // 4 weeks

/**
 * Manager-triggered batch run: assigns a hand-picked set of employees
 * (≤ MAX_MANUAL_RUN_EMPLOYEES) into open capacity across a bounded date range
 * (≤ MAX_MANUAL_RUN_DAYS), using each employee's own submitted availability
 * and skills. Unlike runScheduling this is an explicit manual action, so it
 * runs regardless of the "אישור אוטומטי" setting, and returns a full,
 * per-employee report (assigned / already-scheduled / standby / no-capacity /
 * no matching availability) for the confirmation UI.
 */
export async function runSchedulingForEmployees(fromKey, toKey, employeeIds) {
    const ids = Array.from(new Set((employeeIds || []).filter(Boolean)));
    if (!ids.length) throw new Error('BAD_REQUEST: לא נבחרו עובדים.');
    if (ids.length > MAX_MANUAL_RUN_EMPLOYEES) {
        throw new Error(`BAD_REQUEST: ניתן לבחור עד ${MAX_MANUAL_RUN_EMPLOYEES} עובדים בכל פעם.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toKey || '') || toKey < fromKey) {
        throw new Error('BAD_REQUEST: טווח תאריכים לא תקין.');
    }
    const spanDays = Math.round((new Date(`${toKey}T00:00:00Z`) - new Date(`${fromKey}T00:00:00Z`)) / 86400000) + 1;
    if (spanDays > MAX_MANUAL_RUN_DAYS) {
        throw new Error(`BAD_REQUEST: טווח התאריכים לא יכול לעלות על ${MAX_MANUAL_RUN_DAYS} ימים (4 שבועות).`);
    }

    const board = await buildBoard(fromKey, toKey, { consistent: true, includeOffers: true });
    const submissions = await loadSubmissions(fromKey, toKey, true);
    const idSet = new Set(ids);

    const reportByEmployee = {};
    for (const id of ids) {
        reportByEmployee[id] = {
            employeeId: id,
            employeeName: board.rolesById[id]?.displayName || '(לא נמצא/ה)',
            shifts: [],
        };
    }

    const todayKey = toDateKey(new Date());
    for (const dateKey of Object.keys(board.days).sort()) {
        if (dateKey < fromKey || dateKey > toKey || dateKey <= todayKey) continue;
        const day = board.days[dateKey];
        for (const t of Object.values(day.types)) {
            const daySubs = submissions.filter(s => idSet.has(s.employeeId) && toDateKey(s.date) === dateKey);
            for (const sub of daySubs) {
                const rep = reportByEmployee[sub.employeeId];
                if (!rep) continue;
                const hasSkill = (board.skillsByRoleId[sub.employeeId] || []).includes(t.typeId);
                if (!hasSkill) continue;

                if (t.assignedEmployeeIds.includes(sub.employeeId)) {
                    if (!rep.shifts.some(x => x.dateKey === dateKey && x.workshopTypeId === t.typeId)) {
                        rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'ALREADY_ASSIGNED' });
                    }
                    continue;
                }
                if (sub.status === SUBMISSION_STATUS.STANDBY) {
                    rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'STANDBY' });
                    continue;
                }

                const shortage = t.required - t.assignedCount;
                if (shortage > 0) {
                    await wixData.insert('ShiftAssignments', {
                        dateKey,
                        date: new Date(`${dateKey}T12:00:00Z`),
                        monthKey: dateKey.slice(0, 7),
                        workshopTypeId: t.typeId,
                        workshopName: t.name,
                        employeeId: sub.employeeId,
                        submissionId: sub._id,
                        status: ASSIGNMENT_STATUS.APPROVED,
                        source: 'MANUAL_BATCH',
                        workType: DEFAULT_WORK_TYPE,
                    }, SA);
                    if (sub.status !== SUBMISSION_STATUS.SCHEDULED) {
                        await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SCHEDULED }, SA);
                        sub.status = SUBMISSION_STATUS.SCHEDULED;
                    }
                    t.assignedCount++;
                    t.assignedEmployeeIds.push(sub.employeeId);
                    rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'ASSIGNED' });

                    const role = board.rolesById[sub.employeeId];
                    if (role?.phone) {
                        await enqueueNotification({
                            actionKey: 'employee_shift_assigned',
                            recipientId: role._id,
                            recipientPhone: role.phone,
                            priority: PRIORITY.NORMAL,
                            entityKey: `shift:${dateKey}:${role._id}`,
                            digest: { line: `${formatDateHe(dateKey)} — ${t.name}`, kind: 'assigned' },
                            vars: { displayName: role.displayName || '', portalLink: PORTAL_URL },
                        });
                    }
                } else {
                    rep.shifts.push({ dateKey, workshopTypeId: t.typeId, workshopName: t.name, status: 'FULL' });
                }
            }
        }
    }

    for (const id of ids) {
        if (!reportByEmployee[id].shifts.length) {
            reportByEmployee[id].shifts.push({ dateKey: null, workshopTypeId: null, workshopName: null, status: 'NO_MATCHING_AVAILABILITY' });
        }
    }

    const employees = ids.map(id => reportByEmployee[id]);
    const totalAssigned = employees.reduce((sum, e) => sum + e.shifts.filter(s => s.status === 'ASSIGNED').length, 0);
    if (totalAssigned) {
        await publishSchedulingUpdate('manual-batch-scheduling', { fromKey, toKey, employeeIds: ids });
        await flushOutbox({ force: true }).catch(err => console.error('[schedulingEngine] flushOutbox failed:', err?.message || err));
    }

    console.log(`[schedulingEngine] runSchedulingForEmployees ${fromKey}..${toKey} employees=${ids.join(',')}: assigned=${totalAssigned}`);
    return { ok: true, fromKey, toKey, employees };
}

/** Hourly: expire stale offers and escalate to the next in the FIFO queue. */
export async function processOfferEscalation(now = new Date(), { batchNotify = false } = {}) {
    const result = await wixData.query('ShiftOffers')
        .eq('status', OFFER_STATUS.PENDING)
        .lt('expiresAt', now)
        .limit(200).find(SAC).catch(() => ({ items: [] }));

    let escalated = 0;
    for (const offer of (result.items || [])) {
        await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.EXPIRED }, SA);
        const dateKey = offer.dateKey || toDateKey(offer.date);
        const board = await buildBoard(dateKey, dateKey, { consistent: true, includeOffers: true });
        const t = board.days[dateKey]?.types?.[offer.workshopTypeId];
        if (t && t.assignedCount < t.required) {
            await ensureShortageHandled(dateKey, t, board, { batchNotify });
            escalated++;
        }
    }
    if (escalated) await publishSchedulingUpdate('offer-escalation', { escalated });
    return { expired: result.items?.length || 0, escalated };
}

// ---------------------------------------------------------------------------
// Booking-paid trigger — dynamic assignment for pending employees
// ---------------------------------------------------------------------------

const CONFIRM_WINDOW_HOURS = 24;

/**
 * Fired the moment a WorkshopOrders row turns 'paid' (data.js afterUpdate
 * hook). If instructors are now needed for that day's workshop and pending
 * (SUBMITTED) employees with the right skill exist:
 * - more than 24h before the workshop → auto-assign (priorityRank, then FIFO);
 * - less than 24h before → a pending offer + WhatsApp requiring the
 *   employee's confirmation in the portal before the assignment is final.
 * No-op when autoApproveShifts is OFF (manual mode).
 */
export async function processBookingPaid(order) {
    if (!order?.workshopStart || !order?.serviceId) return { handled: false };

    const settings = await loadSettings();
    if (settings.autoApproveShifts === false) {
        return { handled: false, reason: 'manual-mode' };
    }

    const workshopStart = new Date(order.workshopStart);
    const dateKey = toDateKey(workshopStart);
    if (!dateKey || dateKey <= toDateKey(new Date())) return { handled: false, reason: 'past-or-today' };

    const [{ serviceIdToTypeId }, board] = await Promise.all([
        loadWorkshopTypeMap(),
        buildBoard(dateKey, dateKey, { consistent: true, includeOffers: true }),
    ]);
    const typeId = serviceIdToTypeId[order.serviceId];
    const t = board.days[dateKey]?.types?.[typeId];
    if (!typeId || !t) return { handled: false, reason: 'no-type' };

    let shortage = t.required - t.assignedCount;
    if (shortage <= 0) return { handled: false, reason: 'covered' };

    const submissions = await loadSubmissions(dateKey, dateKey, true);
    const candidates = submissions
        .filter(s => toDateKey(s.date) === dateKey
            && s.status === SUBMISSION_STATUS.SUBMITTED
            && (board.skillsByRoleId[s.employeeId] || []).includes(typeId)
            && !t.assignedEmployeeIds.includes(s.employeeId))
        .sort((a, b) => {
            const ra = Number(board.rolesById[a.employeeId]?.priorityRank) || 999;
            const rb = Number(board.rolesById[b.employeeId]?.priorityRank) || 999;
            return ra - rb || new Date(a._createdDate) - new Date(b._createdDate);
        });

    if (!candidates.length) {
        // No pending employees — fall back to standby offers / open call.
        await ensureShortageHandled(dateKey, t, board);
        await publishSchedulingUpdate('booking-paid', { dateKey });
        return { handled: true, mode: 'shortage-flow' };
    }

    const hoursUntil = (workshopStart.getTime() - Date.now()) / 3600000;
    const report = { handled: true, assigned: 0, confirmations: 0 };

    if (hoursUntil > CONFIRM_WINDOW_HOURS) {
        for (const sub of candidates) {
            if (shortage <= 0) break;
            await wixData.insert('ShiftAssignments', {
                dateKey,
                date: new Date(`${dateKey}T12:00:00Z`),
                monthKey: dateKey.slice(0, 7),
                workshopTypeId: typeId,
                workshopName: t.name,
                employeeId: sub.employeeId,
                submissionId: sub._id,
                status: ASSIGNMENT_STATUS.APPROVED,
                source: 'AUTO',
                workType: DEFAULT_WORK_TYPE,
            }, SA);
            if (sub.status !== SUBMISSION_STATUS.SCHEDULED) {
                await wixData.update('AvailabilitySubmissions', { ...sub, status: SUBMISSION_STATUS.SCHEDULED }, SA);
            }
            t.assignedCount++;
            t.assignedEmployeeIds.push(sub.employeeId);
            shortage--;
            report.assigned++;
            const role = board.rolesById[sub.employeeId];
            if (role?.phone) {
                await enqueueNotification({
                    actionKey: 'employee_auto_assigned_booking',
                    recipientId: role._id,
                    recipientPhone: role.phone,
                    priority: PRIORITY.NORMAL,
                    entityKey: `shift:${dateKey}:${role._id}`,
                    digest: { line: `${formatDateHe(dateKey)} — ${t.name}`, kind: 'assigned' },
                    vars: { displayName: role?.displayName || '', portalLink: PORTAL_URL },
                });
            } else {
                console.warn(`[schedulingEngine] role ${role?._id} has no phone — skipping WhatsApp`);
            }
        }
        if (report.assigned) {
            await flushOutbox({ force: true }).catch(err => console.error('[schedulingEngine] flushOutbox failed:', err?.message || err));
        }
    } else {
        // Inside the confirmation window: one pending offer at a time (FIFO);
        // the hourly escalation moves it along if unanswered.
        const existing = offersFor(board.offers, dateKey, typeId);
        if (!existing.some(o => o.status === OFFER_STATUS.PENDING || o.status === OFFER_STATUS.OPEN)) {
            const first = candidates[0];
            await wixData.insert('ShiftOffers', {
                dateKey,
                date: new Date(`${dateKey}T12:00:00Z`),
                monthKey: dateKey.slice(0, 7),
                workshopTypeId: typeId,
                workshopName: t.name,
                kind: OFFER_KIND.WAITLIST_OFFER,
                status: OFFER_STATUS.PENDING,
                employeeId: first.employeeId,
                submissionId: first._id,
                expiresAt: new Date(Date.now() + OFFER_TTL_MS),
                notifiedAt: new Date(),
            }, SA);
            const role = board.rolesById[first.employeeId];
            if (role?.phone) {
                // Short-notice confirmations stay urgent even with a backlog — always sent individually.
                await enqueueNotification({
                    actionKey: 'employee_confirm_request_shortnotice',
                    recipientId: role._id,
                    recipientPhone: role.phone,
                    priority: PRIORITY.URGENT,
                    entityKey: `offer:${dateKey}:${typeId}:${role._id}`,
                    vars: {
                        displayName: role?.displayName || '',
                        workshopName: t.name,
                        date: formatDateHe(dateKey),
                        hoursWindow: CONFIRM_WINDOW_HOURS,
                        portalLink: PORTAL_URL,
                    },
                });
            } else {
                console.warn(`[schedulingEngine] role ${role?._id} has no phone — skipping WhatsApp`);
            }
            report.confirmations++;
        }
    }

    await publishSchedulingUpdate('booking-paid', { dateKey });
    console.log(`[schedulingEngine] processBookingPaid ${dateKey}/${typeId}:`, JSON.stringify(report));
    return report;
}

// ---------------------------------------------------------------------------
// Atomic claims (first-write-wins via consistentRead re-check)
// ---------------------------------------------------------------------------

async function assignFromClaim(dateKey, t, role, submission) {
    await wixData.insert('ShiftAssignments', {
        dateKey,
        date: new Date(`${dateKey}T12:00:00Z`),
        monthKey: dateKey.slice(0, 7),
        workshopTypeId: t.typeId,
        workshopName: t.name,
        employeeId: role._id,
        submissionId: submission._id,
        status: ASSIGNMENT_STATUS.APPROVED,
        source: 'AUTO',
        workType: DEFAULT_WORK_TYPE,
    }, SA);
    if (submission.status !== SUBMISSION_STATUS.SCHEDULED) {
        await wixData.update('AvailabilitySubmissions', { ...submission, status: SUBMISSION_STATUS.SCHEDULED }, SA);
    }
}

/** Employee accepts/declines a waiting-list offer addressed to them. */
export async function respondToOffer(offerId, role, accept) {
    const offer = await wixData.get('ShiftOffers', offerId, SAC).catch(() => null);
    if (!offer || offer.kind !== OFFER_KIND.WAITLIST_OFFER || offer.employeeId !== role._id) {
        throw new Error('NOT_FOUND: ההצעה לא נמצאה.');
    }
    if (offer.status !== OFFER_STATUS.PENDING) {
        throw new Error('CONFLICT: ההצעה כבר אינה בתוקף.');
    }
    const dateKey = offer.dateKey || toDateKey(offer.date);

    if (!accept) {
        await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.DECLINED }, SA);
        const board = await buildBoard(dateKey, dateKey, { consistent: true, includeOffers: true });
        const t = board.days[dateKey]?.types?.[offer.workshopTypeId];
        if (t && t.assignedCount < t.required) await ensureShortageHandled(dateKey, t, board);
        await publishSchedulingUpdate('offer-declined', { dateKey });
        return { ok: true, accepted: false };
    }

    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const t = board.days[dateKey]?.types?.[offer.workshopTypeId];
    if (!t || t.assignedCount >= t.required) {
        await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.EXPIRED }, SA);
        throw new Error('CONFLICT: המשמרת כבר אוישה.');
    }
    const submission = await wixData.get('AvailabilitySubmissions', offer.submissionId, SAC).catch(() => null);
    if (!submission) throw new Error('NOT_FOUND: הגשת הזמינות המקורית לא נמצאה.');

    await assignFromClaim(dateKey, t, role, submission);
    await wixData.update('ShiftOffers', { ...offer, status: OFFER_STATUS.ACCEPTED, claimedBy: role._id }, SA);
    await publishSchedulingUpdate('offer-accepted', { dateKey });
    return { ok: true, accepted: true, dateKey };
}

/** Employee claims an open call (first-click wins). */
export async function claimOpenCall(callId, role, settings) {
    const call = await wixData.get('ShiftOffers', callId, SAC).catch(() => null);
    if (!call || call.kind !== OFFER_KIND.OPEN_CALL) throw new Error('NOT_FOUND: הקריאה לא נמצאה.');
    if (call.status !== OFFER_STATUS.OPEN) throw new Error('CONFLICT: המשמרת כבר נתפסה על ידי עובד/ת אחר/ת.');

    const skills = refIds(role.skills);
    if (!skills.includes(call.workshopTypeId)) throw new Error('FORBIDDEN: אין לך הכשרה לסדנה זו.');

    const dateKey = call.dateKey || toDateKey(call.date);
    const board = await buildBoard(dateKey, dateKey, { consistent: true });
    const t = board.days[dateKey]?.types?.[call.workshopTypeId];
    if (!t || t.assignedCount >= t.required) {
        await wixData.update('ShiftOffers', { ...call, status: OFFER_STATUS.FILLED }, SA);
        throw new Error('CONFLICT: המשמרת כבר אוישה.');
    }
    if (t.assignedEmployeeIds.includes(role._id)) throw new Error('CONFLICT: כבר שובצת ליום זה.');

    // Reuse the employee's submission for that date, or create one.
    const existing = await wixData.query('AvailabilitySubmissions')
        .eq('employeeId', role._id)
        .between('date', new Date(`${dateKey}T00:00:00Z`), new Date(`${dateKey}T23:59:59Z`))
        .limit(1).find(SAC).catch(() => ({ items: [] }));
    let submission = existing.items?.[0] || null;
    if (!submission) {
        submission = await wixData.insert('AvailabilitySubmissions', {
            employeeId: role._id,
            staffId: null,
            date: new Date(`${dateKey}T12:00:00Z`),
            startTime: settings?.defaultShiftStart || '10:00',
            endTime: settings?.defaultShiftEnd || '16:00',
            status: SUBMISSION_STATUS.SCHEDULED,
            monthKey: dateKey.slice(0, 7),
            managerOverride: false,
            notes: 'שובץ דרך קריאה פתוחה',
        }, SA);
    }

    await assignFromClaim(dateKey, t, role, submission);
    await wixData.update('ShiftOffers', { ...call, status: OFFER_STATUS.FILLED, claimedBy: role._id }, SA);
    await publishSchedulingUpdate('open-call-claimed', { dateKey });
    return { ok: true, dateKey };
}

/**
 * Employee claims a batch of open calls at once (bulk selection UI).
 * Each call is re-verified against the live database immediately before being
 * claimed (consistent read inside claimOpenCall), so two employees racing to
 * grab the same shift can never both win it — the second one simply fails
 * with a CONFLICT for that specific item while the rest of the batch proceeds.
 */
export async function claimOpenCalls(callIds, role, settings) {
    const ids = Array.from(new Set((callIds || []).filter(Boolean)));
    const results = [];
    for (const callId of ids) {
        const call = await wixData.get('ShiftOffers', callId, SAC).catch(() => null);
        const dateKey = call ? (call.dateKey || toDateKey(call.date)) : null;
        const workshopName = call?.workshopName || 'סדנה';
        try {
            const outcome = await claimOpenCall(callId, role, settings);
            results.push({ callId, ok: true, dateKey: outcome.dateKey || dateKey, workshopName });
        } catch (err) {
            results.push({ callId, ok: false, dateKey, workshopName, error: err?.message || String(err) });
        }
    }
    return { ok: true, results };
}
