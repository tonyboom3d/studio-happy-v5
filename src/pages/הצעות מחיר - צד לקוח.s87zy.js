// Customer quote page bridge: <quote-contract> CE <-> backend/quotePublic.web.js. No business logic here.
import wixLocation from 'wix-location';
import wixPay from 'wix-pay';
import { getQuoteByToken, recordView, signQuote, createQuotePayment, submitTransferProof } from 'backend/quotePublic.web.js';
import { runQuotePayment } from 'public/quotePayFlow.js';

const ce = () => $w('CustomElement')[0];
const unwrap = (r) => { if (r?.__error) throw new Error(r.__error); return r; };

$w.onReady(async () => {
    const el = ce();
    if (!el) return;
    const token = wixLocation.query.id || '';
    const push = (data) => el.setAttribute('quote-data', JSON.stringify({ ...data, __ts: Date.now() }));

    const load = async () => {
        if (!token) return push({ viewState: 'missing_id' });
        try {
            const data = unwrap(await getQuoteByToken(token));
            push(data);
            return data;
        } catch (err) {
            console.error('[quote-page] load failed', err?.message || err);
            push({ viewState: 'not_found' });
        }
    };

    const pay = async (_p, progress) => {
        let result;
        try {
            result = await runQuotePayment({
                token, progress, createPayment: createQuotePayment, getQuote: getQuoteByToken,
                startPayment: (id, opts) => wixPay.startPayment(id, opts),
            });
        } catch (err) {
            await load(); // payment could not start: re-sync the screen (the quote may already be signed)
            throw err;
        }
        const { outcome, data } = result;
        if (outcome === 'paid') return push({ ...data, thanks: true, inline: true });
        if (outcome === 'processing') return push({ ...data, thanks: true, inline: true, timedOut: true });
        if (data) push(data); else await load();
        throw new Error(outcome === 'failed'
            ? 'PAYMENT:התשלום לא אושר. ניתן לנסות שוב.'
            : 'PAYMENT:התשלום בוטל ולא חויבתם. ניתן לנסות שוב.');
    };

    const handlers = {
        refresh: () => load(),
        pay,
        proof: async (p) => {
            unwrap(await submitTransferProof(token, p));
            return load();
        },
        sign: async (p) => {
            unwrap(await signQuote(token, p));
            if (p.selectedPaymentMethod !== 'online') return load(); // online: the CE starts payment next, inside the same dialog
        },
    };

    el.on('quote-action', async (event) => {
        const { type, payload, requestId } = event.detail || {};
        const reply = (body) => el.setAttribute('action-result', JSON.stringify({ requestId, ...body, __ts: Date.now() }));
        const progress = (msg) => el.setAttribute('action-progress', JSON.stringify({ requestId, msg, __ts: Date.now() }));
        try {
            if (!handlers[type]) throw new Error(`UNKNOWN_ACTION:${type}`);
            await handlers[type](payload || {}, progress);
            reply({ ok: true });
        } catch (err) {
            reply({ ok: false, error: err?.message || String(err) });
        }
    });

    const first = await load();
    if (first && ['ready_to_sign', 'signed_choose_payment', 'balance_due'].includes(first.viewState)) {
        recordView(token).catch(() => {});
    }
});
