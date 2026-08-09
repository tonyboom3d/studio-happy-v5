import wixData from 'wix-data';
import { staffMembers } from '@wix/bookings';
import { computeSketchEditingDeadline } from 'backend/sketchEditingPolicy.js';
import { reconcileEcomOrder } from 'backend/orderReconciliation.js';

const SA = { suppressAuth: true, suppressHooks: true };

/**
 * Dashboard_Roles staff sync — basic implementation (per PRD phase 1 scope):
 * new staff members are upserted with a default 'Employee' role and removed
 * when their staff member record is deleted. Full permission enforcement
 * (mapping specific dashboard capabilities per role) is deferred to a later
 * phase — this only keeps the roles collection in sync with Bookings staff.
 *
 * The link to Bookings/Staff is the `connectedStaff` Reference field.
 * The link to the site member is `userId` Reference → privateMembersData.
 */
async function upsertDashboardRole(staffMemberId) {
    if (!staffMemberId) return;
    const existing = await wixData.query('Dashboard_Roles').eq('connectedStaff', staffMemberId).find(SA);
    if (existing.items.length) {
        await patchRoleProfileDefaults(existing.items[0], staffMemberId);
        return;
    }

    let displayName = 'עובד/ת';
    try {
        const staff = await wixData.get('Bookings/Staff', staffMemberId, SA);
        if (staff?.name) displayName = staff.name;
    } catch (_) { /* keep fallback */ }

    await wixData.insert('Dashboard_Roles', {
        connectedStaff: staffMemberId,
        userEmail: null,
        userId: null,
        roleType: 'Employee',
        displayName,
        active: true,
        isTrainee: false,
        viewDashboard: true,
        editSketchStatus: true,
        rejectSketchStatus: true,
        deleteSketchImage: true,
        editOrderNotes: true,
        sendWhatsApp: true,
        manageTemplates: true,
        manageRoles: false,
        submitAvailability: true,
        viewTeamSchedule: false,
        manageEmployeeSystem: false,
        manageScheduling: false,
        manageEmployees: false,
        editTimeEntries: false,
        manageRates: false,
        manageRules: false,
    }, SA);
    console.log(`[events] Dashboard_Roles: created default role for staff ${staffMemberId}`);
}

/** Patches scheduling profile defaults on legacy Dashboard_Roles rows. */
async function patchRoleProfileDefaults(roleRow, staffMemberId) {
    const needsName = !roleRow.displayName;
    const needsActive = roleRow.active === undefined || roleRow.active === null;
    if (!needsName && !needsActive) return;

    const patch = { ...roleRow };
    if (needsActive) patch.active = true;
    if (needsName) {
        let displayName = 'עובד/ת';
        try {
            const staff = await wixData.get('Bookings/Staff', staffMemberId, SA);
            if (staff?.name) displayName = staff.name;
        } catch (_) { /* keep fallback */ }
        patch.displayName = displayName;
    }
    await wixData.update('Dashboard_Roles', patch, SA);
}

async function removeDashboardRole(staffMemberId) {
    if (!staffMemberId) return;
    const existing = await wixData.query('Dashboard_Roles').eq('connectedStaff', staffMemberId).find(SA);
    for (const item of existing.items) {
        // Deactivate instead of delete — preserves availability history linked by employeeId.
        await wixData.update('Dashboard_Roles', { ...item, active: false }, SA);
    }
    if (existing.items.length) {
        console.log(`[events] Dashboard_Roles: deactivated role(s) for staff ${staffMemberId}`);
    }
}

staffMembers.onStaffMemberCreated((event) => {
    upsertDashboardRole(event?.entity?._id).catch(err => {
        console.error('[events] onStaffMemberCreated error:', err?.message || err);
    });
});

// onStaffMemberFullyCreated fires after connection/photo setup completes —
// upsertDashboardRole is a no-op if the row from onStaffMemberCreated
// already exists, so this is just a safety net for staff created via flows
// that skip the "created" event.
staffMembers.onStaffMemberFullyCreated((event) => {
    upsertDashboardRole(event?.data?.staffMember?._id).catch(err => {
        console.error('[events] onStaffMemberFullyCreated error:', err?.message || err);
    });
});

staffMembers.onStaffMemberDeleted((event) => {
    removeDashboardRole(event?.entity?._id).catch(err => {
        console.error('[events] onStaffMemberDeleted error:', err?.message || err);
    });
});

/**
 * Wix Pay backend event — fires when a payment status changes.
 *
 * This is the secure, authoritative server-side confirmation that a payment
 * has been processed. We rely on this (NOT the client-side promise from
 * wixPay.startPayment()) to mark an upgrade as paid/failed, because the
 * client promise is unreliable if the user closes the window early.
 *
 * - Successful/Charged -> upgradePaymentStatus = 'paid' (90x90 choice kept)
 * - Declined/Refunded  -> upgradePaymentStatus = 'failed' (size reverted to 60x60)
 */
export function wixPay_onPaymentUpdate(event) {
    const { payment } = event;
    if (!payment?.id) return;

    const status = payment.status;
    if (status !== 'Successful' && status !== 'Charged' && status !== 'Refunded' && status !== 'Declined') return;

    return wixData.query('SketchSelections')
        .eq('upgradePaymentId', payment.id)
        .find(SA)
        .then(result => {
            if (!result.items.length) return;

            const isPaid = status === 'Successful' || status === 'Charged';

            const updates = result.items.map(sel => {
                // Never downgrade an already-confirmed paid record from a stray event.
                if (sel.upgradePaymentStatus === 'paid' && !isPaid) {
                    return Promise.resolve(sel);
                }
                const patch = { ...sel };
                if (isPaid) {
                    patch.upgradePaymentStatus = 'paid';
                    patch.canvasSize = '90x90';
                    patch.requestedCanvasSize = null;
                } else {
                    patch.upgradePaymentStatus = 'failed';
                    patch.requestedCanvasSize = null;
                    patch.upgradePaymentId = null;
                    patch.upgradePaymentRequestedAt = null;
                    patch.canvasSize = '60x60';
                    patch.previousCanvasSize = sel.previousCanvasSize || '60x60';
                }
                return wixData.update('SketchSelections', patch, SA);
            });

            return Promise.all(updates);
        })
        .then(() => {
            console.log(`[events] wixPay_onPaymentUpdate: paymentId=${payment.id}, status=${status} — resolved`);
        })
        .catch(err => {
            console.error('[events] wixPay_onPaymentUpdate error:', err?.message || err);
        });
}

/**
 * Wix Bookings cancellation/reschedule sync.
 *
 * Both events fire whenever a booking is cancelled or moved to a different
 * slot — regardless of whether it was the customer or a dashboard admin who
 * triggered it via the Wix Bookings calendar. We use them to keep the
 * WorkshopOrders/WorkshopParticipants/SketchSelections CMS records (and the
 * order-management dashboard, which reads from them) in sync with Bookings,
 * since those records aren't otherwise notified of admin-side changes made
 * directly in Bookings rather than through our own booking flow.
 *
 * Handling is strictly per-booking: each booking that is cancelled/rescheduled
 * fires its own event, so a whole-session cancellation just means N events —
 * there's no separate "workshop cancelled" signal to detect.
 */

function logEntry(action) {
    return { timestamp: new Date().toISOString(), user: 'מערכת (Wix Bookings)', action };
}

async function findOrderByBookingId(bookingId) {
    if (!bookingId) return null;
    try {
        const byArray = await wixData.query('WorkshopOrders')
            .hasSome('bookingIds', [bookingId])
            .limit(1)
            .find(SA);
        if (byArray.items.length > 0) return byArray.items[0];
    } catch (err) {
        console.warn('[events] findOrderByBookingId hasSome query failed, falling back:', err?.message || err);
    }

    const recent = await wixData.query('WorkshopOrders')
        .descending('_createdDate')
        .limit(100)
        .find(SA);
    return recent.items.find((item) => {
        const ids = item.bookingIds;
        if (Array.isArray(ids)) return ids.includes(bookingId);
        if (typeof ids === 'string') return ids === bookingId || ids.includes(bookingId);
        return false;
    }) || null;
}

async function appendOrderActionLog(order, action) {
    const actionLog = [logEntry(action), ...(order.actionLog || [])].slice(0, 200);
    return wixData.update('WorkshopOrders', { ...order, actionLog }, SA);
}

function formatJerusalemDateTime(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

/**
 * Fired when a booking is cancelled in Wix Bookings — whether by the customer
 * or by a dashboard admin/staff member managing the Bookings calendar directly.
 * Marks the matching WorkshopOrder (and its participants/sketches) as
 * cancelled, so the order-management dashboard can grey it out / filter it.
 */
export function wixBookingsV2_onBookingCanceled(event) {
    const booking = event?.data?.booking;
    const bookingId = booking?._id;

    if (!bookingId) {
        console.warn('[events] wixBookingsV2_onBookingCanceled: no booking._id on event, skipping.');
        return;
    }

    return findOrderByBookingId(bookingId)
        .then(async (order) => {
            if (!order) {
                console.log('[events] wixBookingsV2_onBookingCanceled: no matching WorkshopOrder for bookingId', bookingId, '(legacy/non-CMS booking) — skipping.');
                return;
            }

            if (order.cancelledAt) {
                console.log('[events] wixBookingsV2_onBookingCanceled: order', order._id, 'already marked cancelled — skipping.');
                return;
            }

            const cancelledAt = new Date();

            const updatedOrder = await wixData.update('WorkshopOrders', {
                ...order,
                cancelledAt,
            }, SA);
            await appendOrderActionLog(updatedOrder, 'ההזמנה בוטלה דרך Wix Bookings');

            const [participants, sketches] = await Promise.all([
                wixData.query('WorkshopParticipants').eq('orderId', order._id).find(SA),
                wixData.query('SketchSelections').eq('orderId', order._id).find(SA),
            ]);

            await Promise.all([
                ...participants.items.map((p) => wixData.update('WorkshopParticipants', { ...p, cancelledAt }, SA)),
                ...sketches.items.map((s) => wixData.update('SketchSelections', { ...s, cancelledAt }, SA)),
            ]);

            console.log(
                `[events] wixBookingsV2_onBookingCanceled: order ${order._id} marked cancelled ` +
                `(${participants.items.length} participant(s), ${sketches.items.length} sketch(es)).`
            );
        })
        .catch((err) => {
            console.error('[events] wixBookingsV2_onBookingCanceled error:', err?.message || err);
        });
}

/**
 * Fired when a booking is rescheduled (date/time/slot change) in Wix Bookings —
 * typically a dashboard admin moving a booking to a different workshop
 * session. Updates the matching WorkshopOrder's schedule fields so the order
 * follows the booking to its new session on the dashboard, and recomputes the
 * sketch-editing deadline against the new workshop date.
 */
export function wixBookings_onBookingRescheduled(event) {
    const booking = event?.data?.booking;
    const bookingId = booking?._id;

    if (!bookingId) {
        console.warn('[events] wixBookings_onBookingRescheduled: no booking._id on event, skipping.');
        return;
    }

    const newStart = booking?.bookedEntity?.slot?.startDate || booking?.startDate;
    const newSessionId = booking?.bookedEntity?.slot?.sessionId || null;
    const previousStart = event?.data?.previousStartDate
        || event?.data?.previousBookedEntity?.slot?.startDate
        || null;

    if (!newStart) {
        console.warn('[events] wixBookings_onBookingRescheduled: no new startDate on event, skipping.');
        return;
    }

    return findOrderByBookingId(bookingId)
        .then(async (order) => {
            if (!order) {
                console.log('[events] wixBookings_onBookingRescheduled: no matching WorkshopOrder for bookingId', bookingId, '(legacy/non-CMS booking) — skipping.');
                return;
            }

            const newStartDate = new Date(newStart);
            const unchanged = order.workshopStart
                && new Date(order.workshopStart).getTime() === newStartDate.getTime()
                && (!newSessionId || order.sessionId === newSessionId);
            if (unchanged) {
                console.log('[events] wixBookings_onBookingRescheduled: order', order._id, 'already reflects the new schedule — skipping.');
                return;
            }

            const { deadline: deadlineAt } = computeSketchEditingDeadline(newStartDate, order._createdDate);

            const updatedOrder = await wixData.update('WorkshopOrders', {
                ...order,
                workshopStart: newStartDate,
                sessionId: newSessionId || order.sessionId,
                deadlineAt,
            }, SA);

            const prevLabel = formatJerusalemDateTime(previousStart || order.workshopStart);
            const newLabel = formatJerusalemDateTime(newStartDate);
            await appendOrderActionLog(updatedOrder, `תאריך הסדנה עודכן דרך Wix Bookings: ${prevLabel} → ${newLabel}`);

            console.log(`[events] wixBookings_onBookingRescheduled: order ${order._id} rescheduled to ${newStartDate.toISOString()} (sessionId=${newSessionId || order.sessionId}).`);
        })
        .catch((err) => {
            console.error('[events] wixBookings_onBookingRescheduled error:', err?.message || err);
        });
}

/**
 * Wix eCommerce backend event — fires server-side the instant an order's
 * payment status changes, completely independent of the customer's browser.
 * This is the authoritative, backend-first trigger for writing paid status +
 * buyer details + cup selections onto WorkshopOrders (see
 * orderReconciliation.js) — it guarantees the data is captured even if the
 * customer refreshes, loses connection, or closes the tab right after
 * paying, before the Thank You page ever runs.
 *
 * This fires for EVERY completed eCom order on the site, not just workshop
 * orders — reconcileEcomOrder() simply finds no match and no-ops for
 * anything else, which is expected and not logged as an error.
 */
export function wixEcom_onOrderPaymentStatusUpdated(event) {
    const order = event?.data?.order;
    if (!order?._id) {
        console.warn('[events] wixEcom_onOrderPaymentStatusUpdated: no order on event, skipping.');
        return;
    }

    return reconcileEcomOrder(order)
        .then((result) => {
            if (result.reconciled) {
                console.log(`[events] wixEcom_onOrderPaymentStatusUpdated: reconciled WorkshopOrder ${result.workshopOrder?._id} from ecomOrder ${order._id} (matchedBy=${result.matchedBy}).`);
            } else if (result.reason && result.reason !== 'not_paid' && result.reason !== 'no_match') {
                console.log(`[events] wixEcom_onOrderPaymentStatusUpdated: ecomOrder ${order._id} — ${result.reason}.`);
            }
        })
        .catch((err) => {
            console.error('[events] wixEcom_onOrderPaymentStatusUpdated error:', err?.message || err);
        });
}
