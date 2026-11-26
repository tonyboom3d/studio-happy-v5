/**
 * manualOrders.js — Manual customer registration to an existing workshop session,
 * day-aware Wix Bookings pricing lookup, Wix Payment Links (create, setNote,
 * send email, deactivate), ManyChat WhatsApp link dispatch, and payment activation.
 */

import wixData from 'wix-data';
import { auth } from '@wix/essentials';
import { paymentLinks } from '@wix/get-paid';
import { bookings, services, serviceOptionsAndVariants } from '@wix/bookings';
import { availabilityCalendar } from 'wix-bookings.v2';
import { contacts } from 'wix-crm-backend';
import { loadWorkshopTypeMap, publishSchedulingUpdate } from 'backend/schedulingEngine.js';
import { toDateKey } from 'backend/availabilityRules.js';
import {
    WORKSHOP_SERVICE_IDS,
    ALL_CANDLES_SERVICE_IDS,
    CANDLES_LIMITED_SERVICE_ID,
    CANDLES_HALLOWEEN_SERVICE_ID,
    applyTuftingDatePricing,
    candlesPriceServiceIdForDate,
    expandCandlesServiceIds,
    serviceIdToWorkshopType,
} from 'backend/workshopServiceIds.js';
import { normalizeIsraeliPhone } from 'backend/orderUtils.js';
import { buildOrderViewUrl } from 'backend/orderLookupService.js';
import { computeSketchEditingDeadline } from 'backend/sketchEditingPolicy.js';
import { sendManualOrderPaymentLinkManyChat } from 'backend/manychatService.jsw';

const ORDERS_COL = 'WorkshopOrders';
const SA = { suppressAuth: true };
const SA_NO_HOOKS = { suppressAuth: true, suppressHooks: true };

function paymentLinkIdOf(link) {
    return link?.id || link?._id || '';
}

function paymentLinkUrlOf(link) {
    const url = link?.links?.url;
    if (typeof url === 'string') return url;
    if (url && typeof url === 'object') return url.url || '';
    return '';
}

/** Payment Links via @wix/get-paid, elevated to run with the site identity. */
const plSdk = {
    create: (link) => auth.elevate(paymentLinks.createPaymentLink)(link),
    get: (id) => auth.elevate(paymentLinks.getPaymentLink)(id),
    setNote: (id, text) => auth.elevate(paymentLinks.setNote)(id, { text }),
    send: (id, recipients) => auth.elevate(paymentLinks.sendPaymentLink)(id, { recipients }),
    deactivate: (id) => auth.elevate(paymentLinks.deactivatePaymentLink)(id),
};
const TZ = 'Asia/Jerusalem';

/** ISO/Date -> "HH:MM" in Israel time ('' if invalid). */
function toIsraelHHMM(dateInput) {
    const d = dateInput ? new Date(dateInput) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

const MANUAL_UNPAID_TAG = 'נפתח ידנית — טרם שולם';
const MANUAL_PAID_TAG = 'נפתח ידנית — שולם';
const MANUAL_PAID_LINK_TAG = 'נפתח ידנית — שולם (קישור תשלום)';

function generateToken() {
    const chars = 'abcdef0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
    return token;
}

function israelWeekday(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return 'SUNDAY';
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(d).toUpperCase();
}

function formatDateHebrew(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

function splitName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || 'לקוח',
        lastName: parts.slice(1).join(' ') || '-',
    };
}

function isCeramicsService(serviceId) {
    return (WORKSHOP_SERVICE_IDS.ceramics || []).includes(serviceId);
}

function isCandlesService(serviceId) {
    return ALL_CANDLES_SERVICE_IDS.includes(serviceId);
}

function isTuftingService(serviceId) {
    return (WORKSHOP_SERVICE_IDS.tufting || []).includes(serviceId);
}

function fallbackSessionTimes(dateKey, sessionStart) {
    const hhmm = /^\d{2}:\d{2}$/.test(String(sessionStart || '')) ? sessionStart : '10:00';
    const [y, m, d] = dateKey.split('-').map(Number);
    const [hh, mm] = hhmm.split(':').map(Number);
    const utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcGuess));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const startMs = utcGuess - (asUtc - utcGuess);
    return {
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(startMs + 2 * 3600000).toISOString(),
    };
}

async function findAvailabilitySlot(serviceIds, dateKey, sessionStart) {
    if (!serviceIds.length) return null;
    const fromIso = new Date(`${dateKey}T00:00:00Z`).getTime() - 86400000;
    const toIso = new Date(`${dateKey}T23:59:59Z`).getTime() + 86400000;
    const all = [];
    await Promise.all(serviceIds.map(async (serviceId) => {
        try {
            const res = await availabilityCalendar.queryAvailability({
                filter: {
                    serviceId,
                    startDate: new Date(fromIso).toISOString(),
                    endDate: new Date(toIso).toISOString(),
                },
            }, { slotsPerDay: 100 });
            all.push(...(res.availabilityEntries || []));
        } catch (err) {
            console.warn('[manualOrders] queryAvailability failed for', serviceId, err?.message || err);
        }
    }));

    const dayEntries = all.filter((e) => {
        const s = e.slot?.startDate;
        return s && toDateKey(s) === dateKey;
    });
    if (!dayEntries.length) return null;

    const exact = sessionStart
        ? dayEntries.find((e) => toIsraelHHMM(e.slot.startDate) === sessionStart)
        : null;
    const picked = exact || dayEntries[0];
    return {
        serviceId: picked.slot.serviceId,
        sessionId: picked.slot.sessionId || null,
        startIso: picked.slot.startDate,
        endIso: picked.slot.endDate || null,
        openSpots: Number(picked.openSpots ?? 0),
        totalSpots: Number(picked.totalSpots ?? 0),
    };
}

async function fetchPricingForServiceAndDate(serviceId, dateIso) {
    if (!serviceId) return { solo: 0, parentChild: 0, extraChild: 0, currency: 'ILS' };

    // Candles limited/halloween inherit ticket prices from regular weekday/Saturday candles service.
    const pricingServiceId = (serviceId === CANDLES_LIMITED_SERVICE_ID || serviceId === CANDLES_HALLOWEEN_SERVICE_ID)
        ? candlesPriceServiceIdForDate(dateIso)
        : serviceId;

    let solo = null;
    let parentChild = null;
    let extraChild = null;
    let currency = 'ILS';

    try {
        const res = await auth.elevate(serviceOptionsAndVariants.queryServiceOptionsAndVariants)({
            filter: { serviceId: { $in: [pricingServiceId] } },
        });
        const item = (res?.serviceOptionsAndVariantsList || []).find((x) => x.serviceId === pricingServiceId);
        const variants = item?.variants?.values || [];
        currency = item?.minPrice?.currency || 'ILS';

        if (isCeramicsService(pricingServiceId)) {
            const weekday = israelWeekday(dateIso);
            for (const v of variants) {
                const choice = v.choices?.[0] || {};
                const dt = choice.dateTime || null;
                const name = (choice.custom || dt?.name || '').trim();
                const days = dt?.hoursAndDaysRule?.days || [];
                const price = parseFloat(v.price?.value);
                if (Number.isNaN(price) || !name || name.includes('כלי נוסף')) continue;
                if (days.length && !days.includes(weekday)) continue;
                if (name.includes('הורה וילד')) parentChild = price;
                else if (name.includes('יחיד')) solo = price;
            }
        } else {
            for (const v of variants) {
                const label = v.choices?.[0]?.custom || '';
                const price = parseFloat(v.price?.value);
                if (Number.isNaN(price)) continue;
                const isExtraChild = label.includes('תוספת ילד');
                const isChild = !isExtraChild && (label.includes('הורה וילד') || label.includes('וילד') || label.includes('ילד'));
                const isSolo = label.includes('יחיד');
                if (isExtraChild && (extraChild === null || price < extraChild)) extraChild = price;
                if (isChild && (parentChild === null || price < parentChild)) parentChild = price;
                if (isSolo && (solo === null || price < solo)) solo = price;
            }
        }

        if (solo === null && parentChild !== null) solo = parentChild;
        if (parentChild === null && solo !== null) parentChild = solo;
        if (extraChild === null && solo !== null) extraChild = solo;

        // If variants existed without recognized keywords, fall back to minPrice.
        if (solo === null && item?.minPrice?.value != null) {
            const minP = parseFloat(item.minPrice.value);
            if (!Number.isNaN(minP) && minP > 0) {
                solo = minP;
                parentChild = minP;
                extraChild = minP;
            }
        }
    } catch (err) {
        console.warn('[manualOrders] variant pricing lookup failed:', err?.message || err);
    }

    // Fixed-price service fallback (e.g. charms / jewelry / custom services without variants).
    if (!solo) {
        try {
            const svcRes = await auth.elevate(services.getService)(pricingServiceId);
            const svc = svcRes?.service ?? svcRes;
            const fixed = parseFloat(svc?.payment?.fixed?.price?.value);
            if (!Number.isNaN(fixed) && fixed > 0) {
                solo = fixed;
                parentChild = fixed;
                extraChild = fixed;
                currency = svc?.payment?.fixed?.price?.currency || currency;
            }
        } catch (err) {
            console.warn('[manualOrders] getService fixed price fallback failed:', err?.message || err);
        }
    }

    let pricing = {
        solo: Number(solo || 0),
        parentChild: Number(parentChild || solo || 0),
        extraChild: Number(extraChild || solo || 0),
        currency,
    };

    if (isTuftingService(pricingServiceId)) {
        pricing = applyTuftingDatePricing(pricing, dateIso);
    }

    return pricing;
}

export function computeManualOrderPrice(pricing, adults, children) {
    const a = Math.max(0, Math.floor(Number(adults) || 0));
    const c = Math.max(0, Math.floor(Number(children) || 0));
    const solo = Number(pricing?.solo || 0);
    const parentChild = Number(pricing?.parentChild || solo || 0);
    const extraChild = Number(pricing?.extraChild || solo || 0);

    const pairs = Math.min(a, c);
    const soloAdults = Math.max(0, a - pairs);
    const extraChildren = Math.max(0, c - pairs);
    const total = Math.round((soloAdults * solo + pairs * parentChild + extraChildren * extraChild) * 100) / 100;

    return {
        adults: a,
        children: c,
        pairs,
        soloAdults,
        extraChildren,
        total,
    };
}

/**
 * Resolves exact Bookings session + day-specific ticket pricing for a workshop slot.
 */
export async function resolveSessionPricing(dateKey, workshopTypeId, sessionStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) {
        throw new Error('תאריך לא תקין.');
    }
    const { typesById, serviceIdToTypeId } = await loadWorkshopTypeMap();
    const workshop = typesById?.[workshopTypeId];
    if (!workshop) throw new Error('הסדנה שנבחרה לא נמצאה.');

    let serviceIds = Object.entries(serviceIdToTypeId || {})
        .filter(([, typeId]) => typeId === workshopTypeId)
        .map(([serviceId]) => serviceId);
    if (serviceIds.some((id) => ALL_CANDLES_SERVICE_IDS.includes(id))) {
        serviceIds = expandCandlesServiceIds(serviceIds, `${dateKey}T12:00:00Z`);
    }
    if (!serviceIds.length) throw new Error('לסדנה הזו לא משויכים שירותי הזמנה.');
    const slot = await findAvailabilitySlot(serviceIds, dateKey, sessionStart);
    const fallback = fallbackSessionTimes(dateKey, sessionStart);

    const startIso = slot?.startIso || fallback.startIso;
    const endIso = slot?.endIso || fallback.endIso;
    const serviceId = slot?.serviceId || serviceIds[0] || '';
    const workshopType = serviceIdToWorkshopType(serviceId) || 'tufting';
    const pricing = await fetchPricingForServiceAndDate(serviceId, startIso);

    return {
        dateKey,
        workshopTypeId,
        workshopName: workshop.name || 'סדנה',
        workshopType,
        serviceId,
        sessionId: slot?.sessionId || null,
        startIso,
        endIso,
        startHHMM: toIsraelHHMM(startIso) || sessionStart || '',
        endHHMM: toIsraelHHMM(endIso) || '',
        openSpots: slot ? slot.openSpots : null,
        totalSpots: slot ? slot.totalSpots : null,
        pricing,
    };
}

async function tryCreateWixBooking(order, slot) {
    const sessionId = slot?.sessionId || order?.sessionId;
    if (!sessionId) return [];
    const { firstName, lastName } = splitName(order.organizerName);
    const seats = Math.max(1, (order.adults || 0) + (order.children || 0));
    try {
        const res = await auth.elevate(bookings.createBooking)({
            bookedEntity: {
                slot: { sessionId, timezone: TZ },
            },
            formSubmission: {
                firstName,
                lastName,
                email: order.organizerEmail || undefined,
                phone: order.organizerPhone || undefined,
            },
            totalParticipants: seats,
            sendSmsReminder: false,
            participantNotification: {
                notifyParticipants: false,
            },
        }, {
            flowControlSettings: {
                skipAvailabilityValidation: true,
                skipBusinessConfirmation: true,
                skipAddOnValidation: true,
            },
        });
        const created = res?.booking ?? res;
        return created?._id ? [created._id] : [];
    } catch (err) {
        console.warn('[manualOrders] best-effort createBooking skipped:', err?.message || err);
        return [];
    }
}

async function tryCancelWixBookings(bookingIds) {
    if (!Array.isArray(bookingIds) || !bookingIds.length) return;
    for (const id of bookingIds) {
        try {
            await auth.elevate(bookings.cancelBooking)(id, {
                participantNotification: { notifyParticipants: false },
                flowControlSettings: { ignoreCancellationPolicy: true },
            });
        } catch (err) {
            console.warn('[manualOrders] cancelBooking skipped for', id, err?.message || err);
        }
    }
}

async function findOrCreateCrmContactId({ name, email, phone }) {
    const { firstName, lastName } = splitName(name);
    const info = { name: { first: firstName, last: lastName } };
    if (email) info.emails = [{ email, primary: true }];
    if (phone) info.phones = [{ phone, primary: true }];
    const res = await contacts.appendOrCreateContact(info);
    return res?.contactId || '';
}

function buildInternalNotes(tag, managerNote) {
    const clean = String(managerNote || '').trim();
    return clean ? `${tag}\n${clean}` : tag;
}

/**
 * Creates a manual customer order for an existing workshop session.
 * - paymentMode === 'paid': activates immediately (status: 'paid').
 * - paymentMode === 'link': creates Wix Payment Link, attaches customer note via setNote,
 *   stores order as inactive ('pending_payment'), and dispatches via Email / ManyChat WhatsApp.
 */
export async function createManualOrder(input, actorName = 'מנהל') {
    const dateKey = String(input?.dateKey || '').trim();
    const workshopTypeId = String(input?.workshopTypeId || '').trim();
    const sessionStart = String(input?.sessionStart || '').trim();
    const organizerName = String(input?.organizerName || '').trim();
    const organizerEmail = String(input?.organizerEmail || '').trim();
    const organizerPhoneRaw = String(input?.organizerPhone || '').trim();
    const organizerPhone = organizerPhoneRaw ? (normalizeIsraeliPhone(organizerPhoneRaw) || organizerPhoneRaw) : '';
    const adults = Math.max(0, Math.floor(Number(input?.adults) || 0));
    const children = Math.max(0, Math.floor(Number(input?.children) || 0));
    const paymentMode = input?.paymentMode === 'paid' ? 'paid' : 'link';
    const sendEmail = paymentMode === 'link' && !!input?.sendEmail;
    const sendWhatsApp = paymentMode === 'link' && !!input?.sendWhatsApp;
    const managerNote = String(input?.internalNotes || '').trim();
    const customerNotes = String(input?.customerNotes || '').trim().slice(0, 300);

    if (!organizerName) throw new Error('יש להזין שם לקוח.');
    if (adults + children < 1) throw new Error('יש לבחור לפחות משתתף אחד.');
    if (sendEmail && !organizerEmail) throw new Error('לשליחת קישור במייל יש להזין כתובת אימייל.');
    if (sendWhatsApp && !organizerPhone) throw new Error('לשליחת קישור בוואטסאפ יש להזין מספר טלפון.');

    const resolved = await resolveSessionPricing(dateKey, workshopTypeId, sessionStart);
    const calc = computeManualOrderPrice(resolved.pricing, adults, children);
    const totalPrice = calc.total;

    if (paymentMode === 'link' && totalPrice <= 0) {
        throw new Error('לא נמצא תמחור תקף לסדנה ביום זה — לא ניתן ליצור קישור לתשלום בסכום 0.');
    }

    const isCeramics = resolved.workshopType === 'ceramics';
    const isCandles = resolved.workshopType === 'candles';
    const rugCount = isCeramics
        ? Math.max(1, calc.soloAdults + calc.pairs)
        : isCandles
            ? Math.max(1, calc.soloAdults + children)
            : Math.max(1, adults || children);

    const now = new Date();
    const workshopStart = new Date(resolved.startIso);
    const workshopEnd = resolved.endIso ? new Date(resolved.endIso) : null;
    const isPaid = paymentMode === 'paid';
    const participantsText = `${adults} מבוגרים${children > 0 ? ` + ${children} ילדים` : ''}`;

    const initialLog = [{
        timestamp: now.toISOString(),
        user: actorName,
        action: isPaid
            ? `הזמנה ידנית נפתחה כשולמה (${participantsText}, ₪${totalPrice})`
            : `הזמנה ידנית נפתחה — ממתינה לתשלום (${participantsText}, ₪${totalPrice})`,
    }];

    const newRecord = {
        orderToken: generateToken(),
        serviceId: resolved.serviceId,
        sessionId: resolved.sessionId,
        workshopStart,
        workshopEnd,
        workshopType: resolved.workshopType,
        adults,
        children,
        rugCount,
        basePrice: totalPrice,
        paidTotal: isPaid ? totalPrice : 0,
        organizerName,
        organizerEmail,
        organizerPhone,
        selectedProducts: [],
        customerNotes,
        internalNotes: buildInternalNotes(isPaid ? MANUAL_PAID_TAG : MANUAL_UNPAID_TAG, managerNote),
        status: 'pending_payment',
        manualOrder: true,
        manualCreatedBy: actorName,
        deadlineAt: computeSketchEditingDeadline(workshopStart, now),
        actionLog: initialLog,
    };

    const inserted = await wixData.insert(ORDERS_COL, newRecord, SA_NO_HOOKS);
    const orderUrl = buildOrderViewUrl({ source: 'cms', id: inserted._id });
    const warnings = [];

    if (isPaid) {
        const bookingIds = await tryCreateWixBooking(inserted, resolved);
        // Update without suppressHooks so data.js WorkshopOrders_afterUpdate runs
        // processBookingPaid (staffing sync) + standard customer confirmation.
        await wixData.update(ORDERS_COL, {
            ...inserted,
            orderUrl,
            bookingIds,
            status: 'paid',
            paidTotal: totalPrice,
        }, SA);
        await publishSchedulingUpdate('manual-order-created', { dateKey, orderId: inserted._id }).catch(() => {});
        return {
            ok: true,
            orderId: inserted._id,
            status: 'paid',
            totalPrice,
            paymentLinkId: '',
            paymentLinkUrl: '',
            emailSent: false,
            whatsappSent: false,
            warnings,
        };
    }

    // --- Payment Link flow ---
    const dateLabel = formatDateHebrew(workshopStart);
    const timeLabel = resolved.startHHMM ? `בשעה ${resolved.startHHMM}` : '';
    const linkTitle = `${resolved.workshopName} — ${organizerName}`.slice(0, 200);
    const linkDesc = `${resolved.workshopName} בתאריך ${dateLabel} ${timeLabel} | ${participantsText}`.trim().slice(0, 600);

    let createdLink;
    try {
        createdLink = await plSdk.create({
                    type: 'ECOM',
                    currency: resolved.pricing.currency || 'ILS',
                    title: linkTitle,
                    description: linkDesc,
                    paymentsLimit: 1,
                    ...(customerNotes ? { note: { text: customerNotes } } : {}),
                    ecomPaymentLink: {
                        lineItems: [{
                            type: 'CUSTOM',
                            customItem: {
                                name: `${resolved.workshopName} (${participantsText})`.slice(0, 200),
                                description: `תאריך: ${dateLabel} ${timeLabel}`.trim().slice(0, 600),
                                quantity: 1,
                                price: Number(totalPrice).toFixed(2),
                                physicalProperties: { shippable: false },
                            },
                        }],
                    },
        });
    } catch (err) {
        // Roll back orphan order if Payment Link creation fails.
        await wixData.remove(ORDERS_COL, inserted._id, SA_NO_HOOKS).catch(() => {});
        throw new Error(`יצירת קישור התשלום נכשלה: ${err?.message || err}`);
    }

    const paymentLinkId = paymentLinkIdOf(createdLink);
    const paymentLinkUrl = paymentLinkUrlOf(createdLink);
    if (!paymentLinkId) {
        await wixData.remove(ORDERS_COL, inserted._id, SA_NO_HOOKS).catch(() => {});
        throw new Error('Wix לא החזיר מזהה לקישור התשלום.');
    }

    if (customerNotes && !createdLink?.note?.text) {
        try {
            await plSdk.setNote(paymentLinkId, customerNotes);
        } catch (err) {
            warnings.push(`שמירת הערת לקוח על קישור התשלום נכשלה: ${err?.message || err}`);
        }
    }

    const savedOrder = await wixData.update(ORDERS_COL, {
        ...inserted,
        orderUrl,
        paymentLinkId,
        paymentLinkUrl,
        paymentLinkStatus: 'ACTIVE',
    }, SA_NO_HOOKS);

    let emailSent = false;
    if (sendEmail && organizerEmail) {
        try {
            const contactId = String(input?.contactId || '').trim() || await findOrCreateCrmContactId({
                name: organizerName,
                email: organizerEmail,
                phone: organizerPhone,
            });
            if (!contactId) throw new Error('לא ניתן ליצור איש קשר ב-CRM.');
            await plSdk.send(paymentLinkId, [{ contactId, sendMethods: ['EMAIL_METHOD'] }]);
            emailSent = true;
        } catch (err) {
            warnings.push(`שליחת המייל נכשלה: ${err?.message || err}`);
        }
    }

    let whatsappSent = false;
    if (sendWhatsApp && organizerPhone) {
        const waRes = await sendManualOrderPaymentLinkManyChat(savedOrder, {
            paymentLinkUrl,
            workshopName: resolved.workshopName,
            customerNote: customerNotes,
        });
        if (waRes?.sent) whatsappSent = true;
        else warnings.push(`שליחת הוואטסאפ נכשלה: ${waRes?.reason || 'שגיאה לא ידועה'}`);
    }

    await publishSchedulingUpdate('manual-order-created', { dateKey, orderId: inserted._id }).catch(() => {});

    return {
        ok: true,
        orderId: inserted._id,
        status: 'pending_payment',
        totalPrice,
        paymentLinkId,
        paymentLinkUrl,
        emailSent,
        whatsappSent,
        warnings,
    };
}

/**
 * Cancels a manual order and deactivates its Wix Payment Link (if any).
 */
export async function cancelManualOrder(orderId, actorName = 'מנהל') {
    if (!orderId) throw new Error('מזהה הזמנה חסר.');
    const order = await wixData.get(ORDERS_COL, orderId, SA);
    if (!order) throw new Error('ההזמנה לא נמצאה.');
    if (order.cancelledAt) return { ok: true, alreadyCancelled: true };

    let linkDeactivated = false;
    let linkWarning = '';
    if (order.paymentLinkId) {
        try {
            await plSdk.deactivate(order.paymentLinkId);
            linkDeactivated = true;
        } catch (err) {
            linkWarning = err?.message || String(err);
            console.warn('[manualOrders] deactivatePaymentLink warning:', linkWarning);
        }
    }

    await tryCancelWixBookings(order.bookingIds);

    const now = new Date();
    const actionText = order.paymentLinkId
        ? `הזמנה בוטלה ידנית${linkDeactivated ? ' וקישור התשלום בוטל' : ''}`
        : 'הזמנה בוטלה ידנית';
    const actionLog = [{ timestamp: now.toISOString(), user: actorName, action: actionText }, ...(order.actionLog || [])].slice(0, 200);

    await wixData.update(ORDERS_COL, {
        ...order,
        status: 'cancelled',
        cancelledAt: now,
        paymentLinkStatus: order.paymentLinkId ? 'INACTIVE' : (order.paymentLinkStatus || null),
        actionLog,
    }, SA_NO_HOOKS);

    const dateKey = order.workshopStart ? toDateKey(order.workshopStart) : '';
    await publishSchedulingUpdate('manual-order-cancelled', { dateKey, orderId }).catch(() => {});

    return { ok: true, orderId, linkDeactivated, linkWarning };
}

/**
 * Activates a pending manual order once its Wix Payment Link is paid.
 * Idempotent: safe to invoke from both paymentLinkPayments and paymentLinks events and cron.
 */
export async function handlePaymentLinkPaid(paymentLinkId, { ecomOrderId = null, amount = null } = {}) {
    if (!paymentLinkId) return { activated: false, reason: 'missing-id' };

    const res = await wixData.query(ORDERS_COL)
        .eq('paymentLinkId', paymentLinkId)
        .limit(1)
        .find(SA);
    const order = res.items[0];
    if (!order) return { activated: false, reason: 'not-found' };
    if (order.status === 'paid') return { activated: false, reason: 'already-paid', orderId: order._id };
    if (order.cancelledAt || order.status === 'cancelled') {
        return { activated: false, reason: 'cancelled', orderId: order._id };
    }

    const paidTotal = Number(amount) || Number(order.basePrice) || 0;
    const prevNotes = String(order.internalNotes || '');
    const updatedNotes = prevNotes.includes(MANUAL_UNPAID_TAG)
        ? prevNotes.replace(MANUAL_UNPAID_TAG, MANUAL_PAID_LINK_TAG)
        : (prevNotes ? `${MANUAL_PAID_LINK_TAG}\n${prevNotes}` : MANUAL_PAID_LINK_TAG);

    const actionLog = [
        { timestamp: new Date().toISOString(), user: 'מערכת (Payment Link)', action: `התשלום התקבל (₪${paidTotal}) — ההזמנה הופעלה` },
        ...(order.actionLog || []),
    ].slice(0, 200);

    // Update WITHOUT suppressHooks so WorkshopOrders_afterUpdate runs staffing sync + WhatsApp confirmation.
    const activated = await wixData.update(ORDERS_COL, {
        ...order,
        status: 'paid',
        paidTotal,
        paymentLinkStatus: 'PAID',
        ecomOrderId: ecomOrderId || order.ecomOrderId || null,
        internalNotes: updatedNotes,
        actionLog,
    }, SA);

    // Best-effort Wix Booking creation now that the order is paid.
    if (order.sessionId && !(order.bookingIds?.length)) {
        const bookingIds = await tryCreateWixBooking(activated, { sessionId: order.sessionId });
        if (bookingIds.length) {
            await wixData.update(ORDERS_COL, { ...activated, bookingIds }, SA_NO_HOOKS).catch(() => {});
        }
    }

    const dateKey = order.workshopStart ? toDateKey(order.workshopStart) : '';
    await publishSchedulingUpdate('manual-order-paid', { dateKey, orderId: order._id }).catch(() => {});
    return { activated: true, orderId: order._id };
}

/**
 * Safety-net reconciler called from jobs.js for pending manual payment-link orders.
 */
export async function reconcileManualPaymentLinkOrder(order) {
    if (!order?.paymentLinkId || order.status === 'paid' || order.cancelledAt) return false;
    try {
        const link = await plSdk.get(order.paymentLinkId);
        const linkStatus = link?.status || '';
        if (linkStatus === 'PAID') {
            const out = await handlePaymentLinkPaid(order.paymentLinkId, {
                amount: link?.totalReceived?.amount || order.basePrice,
            });
            return !!out.activated;
        }
        if ((linkStatus === 'INACTIVE' || linkStatus === 'EXPIRED') && order.paymentLinkStatus !== linkStatus) {
            await wixData.update(ORDERS_COL, { ...order, paymentLinkStatus: linkStatus }, SA_NO_HOOKS);
        }
    } catch (err) {
        console.warn('[manualOrders] reconcileManualPaymentLinkOrder failed:', order._id, err?.message || err);
    }
    return false;
}
