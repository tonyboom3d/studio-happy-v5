// Single source of truth for the customer-facing state of a quote.
export const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** @returns one of the viewState values from the plan (excluding loading/missing_id, which are client-side). */
export function computeViewState(q, now = Date.now()) {
    if (!q) return 'not_found';
    if (q.status === 'cancelled') return 'cancelled';
    if (q.status === 'signed') {
        if (q.paymentStatus === 'paid_full') return 'paid_full';
        if (q.paymentStatus === 'deposit_paid') return 'balance_due';
        if (q.paymentStatus === 'awaiting_transfer_approval') return 'awaiting_transfer_approval';
        if (q.selectedPaymentMethod === 'bank_transfer') return q.transferProof ? 'awaiting_transfer_approval' : 'awaiting_transfer_proof';
        return 'signed_choose_payment';
    }
    if (q.status === 'expired') return 'expired';
    if (q.status === 'sent' || q.status === 'viewed') {
        if (q.expiresAt && new Date(q.expiresAt).getTime() < now) return 'expired';
        return 'ready_to_sign';
    }
    return 'not_found'; // lead / draft are never exposed
}
