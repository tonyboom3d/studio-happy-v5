// Customer quote page bridge: <quote-contract> CE <-> backend/quotePublic.web.js. No business logic here.
import wixLocation from 'wix-location';
import wixPay from 'wix-pay';
import { getQuoteByToken, recordView, signQuote, createQuotePayment, submitTransferProof } from 'backend/quotePublic.web.js';

const ce = () => $w('CustomElement')[0];
const unwrap = (r) => { if (r?.__error) throw new Error(r.__error); return r; };

$w.onReady(async () => {
    const el = ce();
    if (!el) return;
    const token = wixLocation.query.id || '';
    const push = (data) => el.setAttribute('quote-data', JSON.stringify({ ...data, __ts: Date.now() }));
    const thanks = () => wixLocation.to(`/thank-you-page-offers?id=${encodeURIComponent(token)}`);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

    const handlers = {
        refresh: () => load(),
        pay: async () => {
            const { paymentId } = unwrap(await createQuotePayment(token));
            // The payment window stays on this page. Thank-you navigation happens only after the charge is confirmed.
            const res = await wixPay.startPayment(paymentId, { showThankYouPage: false });
            if (!['Successful', 'Pending', 'Offline'].includes(res?.status)) throw new Error('PAYMENT:התשלום לא הושלם. ניתן לנסות שוב.');
            for (let i = 0; i < 8; i++) {
                const data = unwrap(await getQuoteByToken(token));
                push(data);
                if (data.lastPayment?.status === 'paid') return thanks();
                if (i < 7) await wait(1500);
            }
            throw new Error('PAYMENT:התשלום עדיין לא אושר. אם חויבתם, רעננו את הדף בעוד רגע.');
        },
        proof: async (p) => {
            unwrap(await submitTransferProof(token, p));
            return load();
        },
        sign: async (p) => {
            unwrap(await signQuote(token, p));
            return load();
        },
    };

    el.on('quote-action', async (event) => {
        const { type, payload, requestId } = event.detail || {};
        const reply = (body) => el.setAttribute('action-result', JSON.stringify({ requestId, ...body, __ts: Date.now() }));
        try {
            if (!handlers[type]) throw new Error(`UNKNOWN_ACTION:${type}`);
            await handlers[type](payload || {});
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
