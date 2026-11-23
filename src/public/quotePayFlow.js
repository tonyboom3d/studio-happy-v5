// Quote payment orchestration for the customer page. The Wix Pay window result is only a hint;
// the backend (webhook + cashier sync behind getQuote) is the source of truth.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const unwrap = (r) => { if (r?.__error) throw new Error(r.__error); return r; };
const PAID_HINT = /^(successful|pending|offline)$/i;
const STOP_HINT = /cancel|fail|declin/i;

/**
 * @returns {Promise<{outcome: 'paid'|'failed'|'cancelled'|'processing', data: object|null}>}
 * Only throws when the payment could not be created.
 */
export async function runQuotePayment({ token, createPayment, startPayment, getQuote, progress }) {
    progress('מכינים תשלום מאובטח...');
    const { paymentId } = unwrap(await createPayment(token));

    progress('ממתינים להשלמת התשלום בחלון המאובטח...');
    let hint = '';
    try {
        hint = String((await startPayment(paymentId, { showThankYouPage: false }))?.status || '');
    } catch (_) {
        hint = 'Cancelled'; // window closed / rejected: verify below, never assume
    }

    progress('מאמתים את התשלום...');
    const optimistic = PAID_HINT.test(hint);
    const stopped = STOP_HINT.test(hint);
    const maxPolls = optimistic ? 30 : stopped ? 3 : 12;
    let data = null;
    for (let i = 0; i < maxPolls; i++) {
        try {
            data = unwrap(await getQuote(token));
            const p = data.lastPayment;
            if (p?.status === 'paid') return { outcome: 'paid', data };
            // A decline can precede a successful retry: after a "success" hint, trust "failed" only late.
            if (p?.status === 'failed' && (!optimistic || i >= 8)) return { outcome: 'failed', data };
        } catch (err) {
            console.error('[quotePayFlow] status check failed', err?.message || err);
        }
        if (i < maxPolls - 1) await wait(i < 3 ? 1200 : 2000);
    }
    return { outcome: stopped ? (/fail|declin/i.test(hint) ? 'failed' : 'cancelled') : 'processing', data };
}
