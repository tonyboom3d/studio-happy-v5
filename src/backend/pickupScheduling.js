/**
 * pickupScheduling.js — "תיאום איסוף" core logic (no webMethods here; see
 * pickupSchedulingService.web.js for the customer-facing page API and
 * http-functions.js get_startPickup for the ManyChat entry point).
 *
 * A workshop session is offered as a pickup slot only when it has at least
 * PICKUP_MIN_ORDERS distinct WorkshopOrders rows (paid, not cancelled) —
 * this makes it very likely someone from staff is actually present to hand
 * over the item, regardless of workshop type.
 *
 * Staff notification timing: scheduled for (slot start − 30min); if that
 * moment is already in the past when the appointment is created (customer
 * picked a slot that's already running/about to start), the notification
 * is sent immediately instead of waiting for the hourly job.
 *
 * ------------------------------------------------------------------
 * WorkshopOrders CMS fields required (create manually in the Wix Editor):
 *   pickupReadyNotifiedAt (Date/Time) — set by pickupService.web.js →
 *     markReadyForPickup; anchors the 20-day appointment-booking window.
 *   pickupToken (Text), pickupTokenExpiresAt (Date/Time)
 *   pickupAppointments (Array): [{ slotKey, start, end, serviceId,
 *     workshopTypeId, workshopName, chosenAt, status: 'active'|'replaced',
 *     staffNotifiedAt, staffRecipient }]
 *   pickupStaffNotifyAt (Date/Time), pickupStaffNotifyStatus (Text:
 *     pending|sent|none)
 * ------------------------------------------------------------------
 */
import wixData from 'wix-data';
import { availabilityCalendar } from 'wix-bookings.v2';
import { getItemWithRetry } from 'backend/wixDataRetry.js';
import { mergePatchWorkshopOrder, patchWorkshopOrderFields } from 'backend/workshopOrderPatch.js';
import { toDateKey } from 'backend/availabilityRules.js';
import { loadWorkshopTypeMap, ASSIGNMENT_STATUS } from 'backend/schedulingEngine.js';
import { sendEmployeeTemplateMessage, sendEmployeeTemplateToManagers } from 'backend/employeeTemplates.js';
import { sendPickupScheduledManyChat } from 'backend/manychatService.jsw';
import { getOrderPickupDisplayItems, getCurrentStaffName } from 'backend/dashboardService.web.js';
import { getSecret } from 'wix-secrets-backend';
import { randomBytes } from 'crypto';
const SA = { suppressAuth: true };
const SAC = { suppressAuth: true, consistentRead: true };
const ISRAEL_TZ = 'Asia/Jerusalem';

export const PICKUP_WINDOW_DAYS = 20;
export const PICKUP_MAX_APPOINTMENTS = 3;
export const PICKUP_MIN_ORDERS = 2;
export const PICKUP_TOKEN_TTL_MS = 30 * 60 * 1000;
const STAFF_NOTIFY_LEAD_MS = 30 * 60 * 1000;
const PASS_TTL_AFTER_END_MS = 24 * 60 * 60 * 1000;
const HANDOVER_MAX_ATTEMPTS = 5;
const HANDOVER_LOCK_MS = 10 * 60 * 1000;
const HANDOVER_CODE_FALLBACK = '1326';
const OPEN_APPOINTMENT_STATUSES = ['pending', 'sent', 'active'];

export const PICKUP_PAGE_URL = 'https://www.studiohappy.art/pickup-schedule';
// Members-only staff page the QR points to (אישור לאיסוף פריטים).
export const PICKUP_CONFIRM_URL = 'https://www.studiohappy.art/pickup-confirm';

function formatDateHe(dateKeyOrDate) {
    const dateKey = dateKeyOrDate instanceof Date ? toDateKey(dateKeyOrDate) : dateKeyOrDate;
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
    return `${dow}, ${d}.${m}.${y}`;
}

function formatTimeHe(date) {
    return new Intl.DateTimeFormat('he-IL', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

function randomToken() {
    return randomBytes(24).toString('hex');
}

export function buildPassLink(orderId, passToken) {
    return `${PICKUP_CONFIRM_URL}?orderId=${encodeURIComponent(orderId)}&pass=${encodeURIComponent(passToken)}`;
}

/** QR (PNG data URL) encoding the staff confirmation link for an appointment. */
export async function generatePassQr(orderId, passToken) {
    if (!orderId || !passToken) return null;
    const mod = await import('qrcode'); // lazy: don't break module load if package missing
    const QRCode = mod.default || mod;
    return QRCode.toDataURL(buildPassLink(orderId, passToken), { margin: 1, width: 320, errorCorrectionLevel: 'M' });
}

export function formatPickupSlotLabel(appointment) {
    return `${formatDateHe(new Date(appointment.start))}, ${formatTimeHe(appointment.start)}-${formatTimeHe(appointment.end)}`;
}

/** Appointment that is still open and whose window hasn't ended yet. */
export function findUpcomingAppointment(order) {
    const now = Date.now();
    return [...(order?.pickupAppointments || [])]
        .reverse()
        .find((a) => OPEN_APPOINTMENT_STATUSES.includes(a.status) && new Date(a.end).getTime() > now) || null;
}

function newPassFields(endIso) {
    return {
        passToken: randomToken(),
        passExpiresAt: new Date(new Date(endIso).getTime() + PASS_TTL_AFTER_END_MS).toISOString(),
        failedAttempts: 0,
    };
}

/** Back-fills a pass on appointments created before passes existed. */
export async function ensureAppointmentPass(order, appointment) {
    if (appointment.passToken) return appointment;
    const updated = { ...appointment, ...newPassFields(appointment.end) };
    const pickupAppointments = (order.pickupAppointments || []).map((a) => (a === appointment ? updated : a));
    await mergePatchWorkshopOrder(order._id, { pickupAppointments }, 'pickupScheduling.ensureAppointmentPass');
    return updated;
}

async function appendOrderActionLog(orderId, action, order, user = 'מערכת (תיאום איסוף)') {
    try {
        const current = order || await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'pickupScheduling.appendOrderActionLog' });
        if (!current) return null;
        const actionLog = [{ timestamp: new Date().toISOString(), user, action }, ...(current.actionLog || [])].slice(0, 200);
        return mergePatchWorkshopOrder(orderId, { actionLog }, 'pickupScheduling.appendOrderActionLog');
    } catch (err) {
        console.warn('[pickupScheduling] appendOrderActionLog failed. orderId:', orderId, 'error:', err?.message || err);
        return null;
    }
}

/** `{orderId}_{slotKey}` isn't needed — slotKey alone identifies the physical session across orders. */
function slotKeyForOrder(order) {
    if (order.sessionId) return `sid:${order.sessionId}`;
    const t = order.workshopStart ? new Date(order.workshopStart).getTime() : null;
    if (t && !Number.isNaN(t) && order.serviceId) return `slot:${order.serviceId}_${t}`;
    return null;
}

/** Batched availability lookup for slot end times — mirrors dashboardService.web.js loadSessions. */
async function loadSlotEndTimes(serviceIds, startDate, endDate) {
    const endByKey = {};
    await Promise.all([...new Set(serviceIds)].map(async (serviceId) => {
        try {
            const query = { filter: { serviceId, startDate: startDate.toISOString(), endDate: endDate.toISOString() } };
            const availability = await availabilityCalendar.queryAvailability(query, { slotsPerDay: 100 });
            for (const entry of (availability.availabilityEntries || [])) {
                const slot = entry.slot || {};
                if (!slot.startDate || !slot.endDate) continue;
                const key = `${serviceId}_${new Date(slot.startDate).getTime()}`;
                endByKey[key] = new Date(slot.endDate);
            }
        } catch (err) {
            console.warn('[pickupScheduling] loadSlotEndTimes failed for service', serviceId, err?.message || err);
        }
    }));
    return endByKey;
}

/**
 * Loads pickup-eligible workshop sessions (>= PICKUP_MIN_ORDERS distinct
 * paid orders) starting in (now, toDate]. Returns one entry per physical
 * session, sorted by start time.
 */
export async function loadPickupSlots(toDate) {
    const now = new Date();
    const items = [];
    let result = await wixData.query('WorkshopOrders')
        .eq('status', 'paid')
        .gt('workshopStart', now)
        .le('workshopStart', toDate)
        .limit(1000)
        .find(SA)
        .catch(() => ({ items: [] }));
    items.push(...(result.items || []));
    while (typeof result.hasNext === 'function' && result.hasNext()) {
        result = await result.next();
        items.push(...(result.items || []));
    }

    const groups = new Map();
    for (const order of items) {
        if (order.cancelledAt) continue;
        const key = slotKeyForOrder(order);
        if (!key || !order.workshopStart) continue;
        if (!groups.has(key)) {
            groups.set(key, {
                slotKey: key,
                start: new Date(order.workshopStart),
                serviceId: order.serviceId || null,
                orderIds: new Set(),
            });
        }
        groups.get(key).orderIds.add(order._id);
    }

    const eligible = [...groups.values()].filter((g) => g.orderIds.size >= PICKUP_MIN_ORDERS);
    if (!eligible.length) return [];

    const [{ serviceIdToTypeId, typesById }, endByKey] = await Promise.all([
        loadWorkshopTypeMap(),
        loadSlotEndTimes(eligible.map((g) => g.serviceId).filter(Boolean), now, toDate),
    ]);

    return eligible
        .map((g) => {
            const endKey = g.serviceId ? `${g.serviceId}_${g.start.getTime()}` : null;
            const end = (endKey && endByKey[endKey]) || new Date(g.start.getTime() + 3 * 60 * 60 * 1000);
            const workshopTypeId = g.serviceId ? serviceIdToTypeId[g.serviceId] || null : null;
            const workshopName = (workshopTypeId && typesById[workshopTypeId]?.name) || 'סדנה';
            return {
                slotKey: g.slotKey,
                start: g.start,
                end,
                serviceId: g.serviceId,
                workshopTypeId,
                workshopName,
                ordersCount: g.orderIds.size,
            };
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Business status for the customer's pickup-appointment flow. */
export function getPickupEligibility(order) {
    const pickupItems = order?.pickupItems || [];
    const readyCount = pickupItems.filter((i) => i.state === 'ready').length;
    const collectedCount = pickupItems.filter((i) => i.state === 'collected').length;

    if (!order?.pickupReadyNotifiedAt) {
        return { status: 'no_items' };
    }
    if (readyCount === 0) {
        return { status: collectedCount > 0 ? 'collected' : 'no_items' };
    }

    const notifiedAt = new Date(order.pickupReadyNotifiedAt);
    const deadline = new Date(notifiedAt.getTime() + PICKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (Date.now() > deadline.getTime()) {
        return { status: 'expired', deadline };
    }

    const usedAppointments = (order.pickupAppointments || []).length;
    const remaining = Math.max(0, PICKUP_MAX_APPOINTMENTS - usedAppointments);
    if (usedAppointments >= PICKUP_MAX_APPOINTMENTS) {
        return { status: 'quota_exceeded', deadline, used: usedAppointments, remaining: 0 };
    }

    const currentAppointment = [...(order.pickupAppointments || [])]
        .reverse()
        .find((a) => a.status === 'active' || a.status === 'sent' || a.status === 'pending');

    return {
        status: 'ok',
        deadline,
        used: usedAppointments,
        remaining,
        readyCount,
        currentAppointment: currentAppointment || null,
    };
}

export async function issuePickupToken(orderId, expiresAt) {
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'pickupScheduling.issuePickupToken' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');

    const token = randomToken();
    const expiry = expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
        ? expiresAt
        : new Date(Date.now() + PICKUP_TOKEN_TTL_MS);
    await patchWorkshopOrderFields(orderId, {
        pickupToken: token,
        pickupTokenExpiresAt: expiry,
    }, 'pickupScheduling.issuePickupToken');
    return { token, expiresAt: expiry };
}

/**
 * Keeps the existing booking-page token (the URL that shows the QR) and
 * sets its expiry to the chosen pickup window end. Issues a token only
 * when the order has none yet.
 */
export async function extendPickupTokenUntil(orderId, expiresAt) {
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'pickupScheduling.extendPickupTokenUntil' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (order.pickupToken) {
        await patchWorkshopOrderFields(orderId, { pickupTokenExpiresAt: expiry }, 'pickupScheduling.extendPickupTokenUntil');
        return { token: order.pickupToken, expiresAt: expiry };
    }
    return issuePickupToken(orderId, expiry);
}

export async function loadOrderByPickupToken(orderId, token) {
    if (!orderId || !token) throw new Error('NOT_FOUND: קישור לא תקין.');
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'pickupScheduling.loadOrderByPickupToken' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');
    if (!order.pickupToken || order.pickupToken !== token) {
        throw new Error('NOT_FOUND: קישור לא תקין.');
    }
    const expiresAt = order.pickupTokenExpiresAt ? new Date(order.pickupTokenExpiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        throw new Error('EXPIRED: הקישור פג תוקף.');
    }
    return order;
}

/** Employee (preferably a shift manager/owner) assigned to the workshop the appointment falls on. */
async function pickStaffRecipient(dateKey, workshopTypeId) {
    if (!dateKey || !workshopTypeId) return null;
    const result = await wixData.query('ShiftAssignments')
        .eq('dateKey', dateKey)
        .eq('workshopTypeId', workshopTypeId)
        .eq('status', ASSIGNMENT_STATUS.APPROVED)
        .limit(50)
        .find(SA)
        .catch(() => ({ items: [] }));
    const assignments = result.items || [];
    if (!assignments.length) return null;

    const employeeIds = assignments.map((a) => a.employeeId).filter(Boolean);
    if (!employeeIds.length) return null;

    const rolesResult = await wixData.query('Dashboard_Roles')
        .hasSome('_id', employeeIds)
        .ne('active', false)
        .limit(50)
        .find(SA)
        .catch(() => ({ items: [] }));
    const roles = rolesResult.items || [];
    if (!roles.length) return null;

    const priority = roles.find((r) => r.roleType === 'ShiftManager')
        || roles.find((r) => r.roleType === 'Owner')
        || roles[0];
    return priority || null;
}

/**
 * Sends the "customer arriving for pickup" WhatsApp notice to one assigned
 * employee (falls back to broadcasting to managers if none are assigned).
 * Never throws — mutates and returns the updated appointment status inline.
 */
export async function sendPickupStaffNotification(order, appointment) {
    const dateKey = toDateKey(appointment.start);
    const readyItems = (order.pickupItems || []).filter((i) => i.state === 'ready');
    const vars = {
        organizerName: order.organizerName || '',
        organizerPhone: order.organizerPhone || '',
        pickupItemsLine: readyItems.map((i) => i.label).join(', '),
        workshopName: appointment.workshopName || 'סדנה',
        date: formatDateHe(dateKey),
        timeWindow: `${formatTimeHe(appointment.start)}-${formatTimeHe(appointment.end)}`,
    };

    const role = await pickStaffRecipient(dateKey, appointment.workshopTypeId).catch(() => null);
    let sent = false;
    let recipientLabel = 'מנהלים';
    if (role?.phone) {
        sent = await sendEmployeeTemplateMessage('employee_pickup_arrival', role.phone, { ...vars, displayName: role.displayName || 'עובד/ת' }, 'employee');
        recipientLabel = role.displayName || 'עובד/ת';
    } else {
        const sentCount = await sendEmployeeTemplateToManagers('employee_pickup_arrival', { ...vars, displayName: '' });
        sent = sentCount > 0;
    }

    return { sent, recipientLabel };
}

/**
 * Creates (or replaces) the customer's pickup appointment for `slotKey`,
 * schedules the staff notification, and logs to the order history.
 */
export async function createPickupAppointment(orderId, slotKey) {
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'pickupScheduling.createPickupAppointment' });
    if (!order) throw new Error('NOT_FOUND: ההזמנה לא נמצאה.');

    const eligibility = getPickupEligibility(order);
    if (eligibility.status !== 'ok') {
        throw new Error(`${eligibility.status.toUpperCase()}: לא ניתן לתאם איסוף כרגע.`);
    }

    const toDate = new Date((new Date(order.pickupReadyNotifiedAt)).getTime() + PICKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const slots = await loadPickupSlots(toDate);
    const slot = slots.find((s) => s.slotKey === slotKey);
    if (!slot) {
        throw new Error('SLOT_UNAVAILABLE: המועד שנבחר אינו זמין יותר. בחר/י מועד אחר.');
    }

    const now = new Date();
    const staffNotifyAt = new Date(slot.start.getTime() - STAFF_NOTIFY_LEAD_MS);
    const shouldSendNow = staffNotifyAt.getTime() <= now.getTime();

    const previousAppointments = (order.pickupAppointments || []).map((a) => (
        a.status === 'active' || a.status === 'pending' || a.status === 'sent'
            ? { ...a, status: 'replaced' }
            : a
    ));

    const newAppointment = {
        slotKey: slot.slotKey,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        serviceId: slot.serviceId,
        workshopTypeId: slot.workshopTypeId,
        workshopName: slot.workshopName,
        chosenAt: now.toISOString(),
        status: 'pending',
        staffNotifiedAt: null,
        staffRecipient: null,
        ...newPassFields(slot.end.toISOString()),
    };

    let pickupAppointments = [...previousAppointments, newAppointment];
    const usedCount = pickupAppointments.length;

    await mergePatchWorkshopOrder(orderId, {
        pickupAppointments,
        pickupStaffNotifyAt: staffNotifyAt,
        pickupStaffNotifyStatus: 'pending',
    }, 'pickupScheduling.createPickupAppointment');

    // The page link that shows the QR stays valid until the pickup window ends
    // (not the 30-minute pre-booking TTL).
    const extended = await extendPickupTokenUntil(orderId, slot.end).catch((err) => {
        console.warn('[pickupScheduling] extendPickupTokenUntil failed:', err?.message || err);
        return null;
    });
    const viewLink = extended?.token
        ? `${PICKUP_PAGE_URL}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(extended.token)}`
        : '';

    await appendOrderActionLog(
        orderId,
        `הלקוח תיאם איסוף ל-${formatDateHe(slot.start)} (${formatTimeHe(slot.start)}-${formatTimeHe(slot.end)}) — תיאום ${usedCount} מתוך ${PICKUP_MAX_APPOINTMENTS}`,
    );

    // Free-form (non-template) WhatsApp reply — the customer just interacted, so we're inside the 24h window.
    const slotLabel = formatPickupSlotLabel(newAppointment);
    const readyItems = (order.pickupItems || []).filter((i) => i.state === 'ready');
    const customerMsg = await sendPickupScheduledManyChat(order, {
        slotLabel: `${slotLabel} (${slot.workshopName})`,
        itemsLine: readyItems.map((i) => i.label).join(', '),
        viewLink,
    }).catch((err) => ({ sent: false, reason: 'error', error: err?.message || String(err) }));
    await appendOrderActionLog(
        orderId,
        customerMsg.sent
            ? 'נשלחה ללקוח הודעה עם פרטי האיסוף (ה-QR מוצג בדף התיאום)'
            : `❌ שליחת פרטי האיסוף ללקוח נכשלה (${customerMsg.reason || 'unknown'})`,
    );

    if (shouldSendNow) {
        const { sent, recipientLabel } = await sendPickupStaffNotification(order, newAppointment);
        pickupAppointments = pickupAppointments.map((a) => (
            a === newAppointment ? { ...a, status: sent ? 'sent' : 'pending', staffNotifiedAt: sent ? now.toISOString() : null, staffRecipient: sent ? recipientLabel : null } : a
        ));
        await mergePatchWorkshopOrder(orderId, {
            pickupAppointments,
            pickupStaffNotifyStatus: sent ? 'sent' : 'pending',
        }, 'pickupScheduling.createPickupAppointment.notifyNow');
        await appendOrderActionLog(
            orderId,
            sent ? `הודעת איסוף נשלחה מיד ל-${recipientLabel} (הסדנה מתקיימת כעת/בקרוב)` : 'שליחת הודעת איסוף מיידית נכשלה — תתבצע נסיון חוזר בשעה הקרובה',
        );
    }

    const qrDataUrl = await generatePassQr(orderId, newAppointment.passToken).catch((err) => {
        console.error('[pickupScheduling] generatePassQr failed:', err?.message || err);
        return null;
    });

    return { ok: true, appointment: newAppointment, qrDataUrl, messageSent: !!customerMsg.sent, used: usedCount, remaining: Math.max(0, PICKUP_MAX_APPOINTMENTS - usedCount) };
}

/**
 * Hourly job (see jobs.js processAlertsHourly) — sends any staff
 * notifications whose scheduled time has arrived. Skips (and clears) orders
 * whose items were all collected before the notification went out.
 */
export async function processPickupStaffNotifications(now = new Date()) {
    const result = await wixData.query('WorkshopOrders')
        .eq('pickupStaffNotifyStatus', 'pending')
        .le('pickupStaffNotifyAt', now)
        .limit(200)
        .find(SAC)
        .catch(() => ({ items: [] }));

    const report = { scanned: (result.items || []).length, sent: 0, skipped: 0, failed: 0 };

    for (const order of (result.items || [])) {
        const activeAppointment = [...(order.pickupAppointments || [])].reverse().find((a) => a.status === 'pending');
        const stillHasReadyItems = (order.pickupItems || []).some((i) => i.state === 'ready');

        if (!activeAppointment || !stillHasReadyItems) {
            await mergePatchWorkshopOrder(order._id, { pickupStaffNotifyStatus: 'none' }, 'pickupScheduling.processPickupStaffNotifications.skip')
                .catch(() => {});
            if (!stillHasReadyItems && activeAppointment) {
                await appendOrderActionLog(order._id, 'התראת צוות לאיסוף בוטלה — כל הפריטים נאספו לפני מועד השליחה.', order).catch(() => {});
            }
            report.skipped++;
            continue;
        }

        try {
            const appointmentStart = new Date(activeAppointment.start);
            const { sent, recipientLabel } = await sendPickupStaffNotification(order, {
                ...activeAppointment,
                start: appointmentStart,
                end: new Date(activeAppointment.end),
            });
            const pickupAppointments = (order.pickupAppointments || []).map((a) => (
                a === activeAppointment || a.slotKey === activeAppointment.slotKey && a.chosenAt === activeAppointment.chosenAt
                    ? { ...a, status: sent ? 'sent' : 'pending', staffNotifiedAt: sent ? now.toISOString() : null, staffRecipient: sent ? recipientLabel : null }
                    : a
            ));
            await mergePatchWorkshopOrder(order._id, {
                pickupAppointments,
                pickupStaffNotifyStatus: sent ? 'sent' : 'pending',
            }, 'pickupScheduling.processPickupStaffNotifications.send');
            await appendOrderActionLog(
                order._id,
                sent ? `הודעת איסוף נשלחה ל-${recipientLabel}` : 'שליחת הודעת איסוף נכשלה — תתבצע נסיון חוזר בשעה הקרובה',
                order,
            );
            if (sent) report.sent++; else report.failed++;
        } catch (err) {
            console.error('[pickupScheduling] processPickupStaffNotifications failed for order', order._id, err?.message || err);
            report.failed++;
        }
    }

    return report;
}

// ------------------------------------------------------------------
// Staff handover via QR — the customer shows the QR (pickup-scheduler page),
// staff scan it, land on the members-only "pickup-confirm" page, review the
// items and confirm with the handover code. Staff identity comes from the
// logged-in member (never from client input).
// ------------------------------------------------------------------

async function getHandoverCode() {
    const secret = await getSecret('pickup_handover_code').catch(() => null);
    return String(secret || HANDOVER_CODE_FALLBACK).trim();
}

async function loadOrderByPass(orderId, pass) {
    if (!orderId || !pass) throw new Error('NOT_FOUND: קישור לא תקין.');
    const order = await getItemWithRetry('WorkshopOrders', orderId, { callerLabel: 'pickupScheduling.loadOrderByPass' });
    const appointment = order && (order.pickupAppointments || []).find((a) => a.passToken && a.passToken === pass);
    if (!appointment) throw new Error('NOT_FOUND: קישור לא תקין.');
    return { order, appointment };
}

function assertPassUsable(appointment) {
    if (appointment.status === 'replaced') {
        throw new Error('REPLACED: תיאום האיסוף הזה הוחלף במועד אחר, ולכן הקוד אינו פעיל.');
    }
    const expiresAt = appointment.passExpiresAt ? new Date(appointment.passExpiresAt).getTime() : 0;
    if (appointment.status !== 'completed' && Date.now() > expiresAt) {
        throw new Error('PASS_EXPIRED: הקוד פג תוקף. ניתן לתאם איסוף מחדש דרך הבוט בוואטסאפ.');
    }
}

/** Every item in the order (sketch / ceramic piece) with its image and pickup state. */
function buildScanItems(order, display) {
    const stateByKey = new Map((order.pickupItems || []).map((i) => [i.key, i]));
    const toItem = (key, label, img) => {
        const pi = stateByKey.get(key);
        return {
            key,
            label,
            img: img || null,
            state: pi?.state || 'pending',
            collectedBy: pi?.collectedBy || null,
            collectedAt: pi?.collectedAt || null,
        };
    };

    if (display.sketches.length) {
        return display.sketches.map((s, idx) => toItem(`sketch:${s.id}`, `שטיח ${idx + 1}`, s.img));
    }

    const seenByProduct = {};
    const items = [];
    display.selectedProducts.forEach((p) => {
        const productKey = p.productId || 'unknown';
        for (let q = 0; q < p.quantity; q++) {
            const n = (seenByProduct[productKey] = (seenByProduct[productKey] || 0) + 1);
            items.push(toItem(`cup:${productKey}:${n}`, `כלי קרמיקה ${items.length + 1}`, p.image));
        }
    });
    return items;
}

/** Staff scan view: order details, all items with images, ready ones flagged. */
export async function getPickupScan(orderId, pass) {
    const { order, appointment } = await loadOrderByPass(orderId, pass);
    assertPassUsable(appointment);
    const completed = appointment.status === 'completed';

    const display = await getOrderPickupDisplayItems(order);
    const staffName = await getCurrentStaffName();

    return {
        state: completed ? 'collected' : 'ready',
        staffName: staffName || '',
        organizerName: order.organizerName || '',
        organizerPhone: order.organizerPhone || '',
        workshopName: appointment.workshopName || 'סדנה',
        slotLabel: formatPickupSlotLabel(appointment),
        items: buildScanItems(order, display),
        collectedAt: completed ? appointment.completedAt || null : null,
        collectedBy: completed ? appointment.completedBy || null : null,
    };
}

/** Marks every "ready" item collected after a correct handover code; logs the staff member. */
export async function confirmPickupHandover(orderId, pass, code) {
    const { order, appointment } = await loadOrderByPass(orderId, pass);
    if (appointment.status === 'completed') {
        throw new Error('ALREADY_COLLECTED: הפריטים כבר נאספו והקוד אינו פעיל עוד.');
    }
    assertPassUsable(appointment);

    const staffName = await getCurrentStaffName();
    if (!staffName) throw new Error('ACCESS_DENIED: לא ניתן לזהות את העובד המחובר.');

    const now = Date.now();
    let attempts = appointment.failedAttempts || 0;
    const lastFailedAt = appointment.lastFailedAt ? new Date(appointment.lastFailedAt).getTime() : 0;
    if (attempts >= HANDOVER_MAX_ATTEMPTS) {
        if (now - lastFailedAt < HANDOVER_LOCK_MS) {
            throw new Error('LOCKED: בוצעו יותר מדי ניסיונות שגויים. נסו שוב בעוד מספר דקות.');
        }
        attempts = 0;
    }

    const expected = await getHandoverCode();
    if (String(code || '').trim() !== expected) {
        const pickupAppointments = order.pickupAppointments.map((a) => (
            a === appointment ? { ...a, failedAttempts: attempts + 1, lastFailedAt: new Date(now).toISOString() } : a
        ));
        await mergePatchWorkshopOrder(orderId, { pickupAppointments }, 'pickupScheduling.confirmPickupHandover.badCode');
        throw new Error('BAD_CODE: הקוד שהוזן שגוי.');
    }

    const readyItems = (order.pickupItems || []).filter((i) => i.state === 'ready');
    if (!readyItems.length) throw new Error('NO_ITEMS: אין פריטים הממתינים לאיסוף בהזמנה זו.');

    const nowIso = new Date(now).toISOString();
    const pickupItems = (order.pickupItems || []).map((i) => (
        i.state === 'ready' ? { ...i, state: 'collected', collectedAt: nowIso, collectedBy: staffName, collectedVia: 'pickup_qr' } : i
    ));
    const pickupAppointments = order.pickupAppointments.map((a) => (
        a === appointment ? { ...a, status: 'completed', completedAt: nowIso, completedBy: staffName, failedAttempts: 0 } : a
    ));
    const patch = { pickupItems, pickupAppointments };
    if (order.pickupStaffNotifyStatus === 'pending') patch.pickupStaffNotifyStatus = 'none';

    await mergePatchWorkshopOrder(orderId, patch, 'pickupScheduling.confirmPickupHandover');
    await appendOrderActionLog(
        orderId,
        `פריט נאסף: ${readyItems.map((i) => i.label).join(', ')} — אושר ע"י ${staffName} (סריקת QR וקוד מסירה)`,
        null,
        staffName,
    );

    return { ok: true, state: 'collected', collectedBy: staffName, collectedAt: nowIso };
}
