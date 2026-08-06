/**
 * orderUtils.js — small, pure/sync helpers shared by bookingService.web.js
 * and orderReconciliation.js. No wix-data / network calls here, so both
 * modules can import from this one without creating a circular dependency
 * between them.
 */

export function normalizeIsraeliPhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    if (!digits.startsWith('972')) {
        digits = '972' + digits;
    }

    return '+' + digits;
}

export function getPhoneLookupVariants(phone) {
    if (!phone) return [];
    const raw = String(phone).trim();
    const digits = raw.replace(/\D/g, '');
    const variants = new Set([raw, digits]);
    if (digits.startsWith('972') && digits.length > 3) {
        variants.add('0' + digits.slice(3));
        variants.add('+' + digits);
    }
    if (digits.startsWith('0') && digits.length > 1) {
        variants.add('+972' + digits.slice(1));
        variants.add('972' + digits.slice(1));
    }
    return [...variants].filter(Boolean);
}

export function orderContainsBookingId(order, bookingId) {
    if (!order || !bookingId) return false;
    const ids = order.bookingIds;
    if (Array.isArray(ids)) return ids.includes(bookingId);
    if (typeof ids === 'string') return ids === bookingId || ids.includes(bookingId);
    if (order.bookingId === bookingId) return true;
    return false;
}

export function extractBookingIdsFromEcomOrder(ecomOrder) {
    const ids = new Set();
    for (const item of ecomOrder?.lineItems || []) {
        if (item.productId) ids.add(item.productId);
        if (item.catalogReference?.catalogItemId) ids.add(item.catalogReference.catalogItemId);
    }
    return [...ids];
}

// Candidate titles for the custom "organizer notes" checkout field, matched
// case-insensitively against order.customFields[].title. Titles are
// configured by the business owner in Checkout settings (Info Collection >
// Custom Fields), so we match on a few likely variants rather than a fixed
// key — customFields has no stable id, only a free-text title.
const ORGANIZER_NOTES_TITLE_CANDIDATES = [
    'organizer_notes',
    'organizer notes',
    'הוסיפו הודעה אישית',
    'הודעה אישית',
    'הערות',
    'הערה',
];

export function extractOrganizerNotesFromEcomOrder(ecomOrder) {
    const fields = ecomOrder?.customFields;
    if (!Array.isArray(fields) || fields.length === 0) return '';

    const match = fields.find((f) => {
        const title = (f?.title || '').trim().toLowerCase();
        return ORGANIZER_NOTES_TITLE_CANDIDATES.some((c) => title === c.toLowerCase());
    }) || fields[0]; // fall back to the first custom field if no title matches

    const value = match?.value;
    if (value == null) return '';
    return typeof value === 'string' ? value : String(value);
}

/**
 * Robust buyer-contact extraction across every shape a Wix eCom order can
 * take. This is the fix for the #1 cause of missing name/email/phone on
 * WorkshopOrders: `buyerInfo` alone is frequently sparse (sometimes just
 * `{ contactId, email, visitorId }`), while the actual first/last name and
 * phone usually live under `billingInfo.contactDetails` (checkout form) or
 * `recipientInfo.contactDetails` (no-shipping orders). Merging every source
 * means a missing field in one place doesn't blank out the whole record.
 */
export function extractBuyerContact(ecomOrder) {
    const buyerInfo = ecomOrder?.buyerInfo || {};
    const billing = ecomOrder?.billingInfo?.contactDetails || ecomOrder?.billingInfo || {};
    const recipient = ecomOrder?.recipientInfo?.contactDetails || {};
    const shipping = ecomOrder?.shippingInfo?.logistics?.shippingDestination?.contactDetails || {};

    const firstName = buyerInfo.firstName || billing.firstName || recipient.firstName || shipping.firstName || '';
    const lastName = buyerInfo.lastName || billing.lastName || recipient.lastName || shipping.lastName || '';
    const email = buyerInfo.email || billing.email || recipient.email || '';
    const phone = buyerInfo.phone || billing.phone || recipient.phone || shipping.phone || '';

    return { firstName, lastName, email, phone, fullName: `${firstName} ${lastName}`.trim() };
}

/** True for order payment states that should be treated as "paid" for reconciliation purposes. */
export function isEcomOrderPaid(ecomOrder) {
    const status = ecomOrder?.paymentStatus;
    return status === 'PAID' || status === 'PARTIALLY_PAID';
}
