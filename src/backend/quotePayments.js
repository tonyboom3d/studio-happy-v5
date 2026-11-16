// Quote payment rules: routing prefix, stage amounts, state recompute, Wix Pay webhook handling.
import wixData from 'wix-data';
import { httpClient } from '@wix/essentials';
import { writeQuoteLog } from 'backend/quoteLog.js';
import { notifyManagers } from 'backend/quoteNotify.js';
import { onQuotePaid } from 'backend/quotePostPayment.js';

const SA = { suppressAuth: true, suppressHooks: true };

/** Routing marker only. The quote is always resolved by QuotePayments.wixPaymentId. */
export const QUOTE_ITEM_PREFIX = 'תשלום עבור הצעת מחיר';
export const STAGE_LABELS = { deposit: 'מקדמה', full: 'תשלום מלא', balance: 'יתרה' };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const PAID_STATUSES = ['SUCCESSFUL', 'CHARGED', 'APPROVED', 'COMPLETED_FUNDS_HELD'];
const FAILED_STATUSES = ['DECLINED', 'FAILED', 'BUYER_CANCELED', 'TIMEOUT', 'TPA_CANCELED', 'VOID', 'EXPIRED', 'CANCELLED', 'CANCELED'];
const REFUND_STATUSES = ['REFUNDED', 'REFUND'];

/** Wix Pay events say "Successful"; the cashier transaction list says "APPROVED". Both mean paid. */
export function normalizePayStatus(status) {
    const s = String(status || '').toUpperCase();
    if (PAID_STATUSES.includes(s)) return 'paid';
    if (FAILED_STATUSES.includes(s)) return 'failed';
    if (REFUND_STATUSES.includes(s)) return 'refunded';
    if (s) return 'pending';
    return null;
}

export function isQuotePayment(payment) {
    return Array.isArray(payment?.items) && payment.items.some((i) => String(i?.name || '').startsWith(QUOTE_ITEM_PREFIX));
}

export function isQuoteOrder(order) {
    return Array.isArray(order?.lineItems) && order.lineItems.some((i) => String(i?.productName?.original || '').startsWith(QUOTE_ITEM_PREFIX));
}

/** Next payable step from stored data only. Returns null when nothing is payable. */
export function nextPayment(quote, viewState) {
    const remaining = round2((Number(quote.totalAmount) || 0) - (Number(quote.paidAmount) || 0));
    if (viewState === 'signed_choose_payment') {
        if (quote.selectedPaymentPlan === 'deposit') return { stage: 'deposit', amount: round2(quote.depositAmount) };
        return { stage: 'full', amount: remaining };
    }
    if (viewState === 'balance_due') return { stage: 'balance', amount: remaining };
    if (viewState === 'awaiting_transfer_proof') {
        return quote.selectedPaymentPlan === 'deposit'
            ? { stage: 'deposit', amount: round2(quote.depositAmount) }
            : { stage: 'full', amount: remaining };
    }
    return null;
}

/** Derives paidAmount/paymentStatus from QuotePayments rows (idempotent; no counters). */
export async function recomputePaymentState(quoteId) {
    const [quote, rows] = await Promise.all([
        wixData.get('Quotes', quoteId, SA),
        wixData.query('QuotePayments').eq('quoteId', quoteId).limit(200).find(SA),
    ]);
    if (!quote) return null;
    const paid = round2(rows.items.filter((r) => r.status === 'paid').reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const pendingBank = rows.items.some((r) => r.method === 'bank_transfer' && r.status === 'pending');
    let paymentStatus = 'unpaid';
    if (paid >= round2(quote.totalAmount) && paid > 0) paymentStatus = 'paid_full';
    else if (pendingBank) paymentStatus = 'awaiting_transfer_approval';
    else if (paid > 0) paymentStatus = 'deposit_paid';
    const next = { ...quote, paidAmount: paid, paymentStatus };
    if (!pendingBank) { next.transferProof = null; next.transferProofAt = null; }
    return wixData.update('Quotes', next, SA);
}

/** @returns {Promise<boolean>} true if the payment belongs to a quote (handled), false otherwise. */
export async function handleQuotePaymentUpdate(payment) {
    const found = await wixData.query('QuotePayments').eq('wixPaymentId', payment.id).limit(1).find(SA);
    const row = found.items[0];
    if (!row) {
        if (isQuotePayment(payment)) console.warn('[quotePayments] quote-prefixed payment without row:', payment.id);
        return isQuotePayment(payment);
    }
    const next = normalizePayStatus(payment.status);
    if (!next || next === 'pending' || row.status === next) return true;
    if (row.status === 'paid' && next !== 'refunded') return true; // never downgrade
    await wixData.update('QuotePayments', {
        ...row, status: next, rawStatus: String(payment.status), paidAt: next === 'paid' ? new Date() : row.paidAt,
    }, SA);
    const updated = await recomputePaymentState(row.quoteId);
    if (next === 'paid' && updated) await notifyManagers('manager_quote_paid', updated, { amount: row.amount, stage: STAGE_LABELS[row.stage] || row.stage });
    const action = next === 'paid' ? 'payment_succeeded' : next === 'refunded' ? 'payment_refunded' : next === 'failed' ? 'payment_failed' : null;
    if (action) await writeQuoteLog(row.quoteId, action, { stage: row.stage, amount: row.amount, method: 'online' }, { type: 'system', name: 'Wix Pay', userId: '' });
    if (next === 'paid' && updated) await onQuotePaid(row.quoteId, row);
    return true;
}

/** The payment event often never arrives. Pending rows are checked against the cashier transaction list (order.id = wixPaymentId). */
export async function syncPendingOnlinePayments(quoteId) {
    const pending = await wixData.query('QuotePayments').eq('quoteId', quoteId).eq('method', 'online').eq('status', 'pending').limit(20).find(SA);
    if (!pending.items.length) return false;
    const from = new Date(Math.min(...pending.items.map((r) => new Date(r._createdDate).getTime())) - 60 * 60 * 1000).toISOString();
    const res = await httpClient.fetchWithAuth(`https://www.wixapis.com/payments/v2/transactions?from=${encodeURIComponent(from)}&limit=100&order=date:desc`);
    if (!res.ok) { console.error('[quotePayments] cashier list failed', res.status); return false; }
    const data = await res.json();
    const byOrder = new Map((data.transactions || []).filter((t) => t.order?.id).map((t) => [t.order.id, t.status]));
    let changed = false;
    const paidRows = [];
    for (const row of pending.items) {
        const next = normalizePayStatus(byOrder.get(row.wixPaymentId));
        if (!next || next === 'pending' || next === row.status) continue;
        await wixData.update('QuotePayments', { ...row, status: next, rawStatus: String(byOrder.get(row.wixPaymentId)), paidAt: next === 'paid' ? new Date() : row.paidAt }, SA);
        const action = next === 'paid' ? 'payment_succeeded' : next === 'refunded' ? 'payment_refunded' : 'payment_failed';
        await writeQuoteLog(quoteId, action, { stage: row.stage, amount: row.amount, method: 'online', via: 'cashier' }, { type: 'system', name: 'Wix Pay', userId: '' });
        if (next === 'paid') {
            const quote = await wixData.get('Quotes', quoteId, SA);
            if (quote) await notifyManagers('manager_quote_paid', quote, { amount: row.amount, stage: STAGE_LABELS[row.stage] || row.stage });
            paidRows.push(row);
        }
        changed = true;
    }
    if (changed) await recomputePaymentState(quoteId);
    for (const row of paidRows) await onQuotePaid(quoteId, row);
    return changed;
}
