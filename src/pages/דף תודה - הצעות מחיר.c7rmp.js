// Quote payment thank-you page: polls the quote until the webhook confirms the payment.
import wixLocation from 'wix-location';
import { getQuoteByToken } from 'backend/quotePublic.web.js';

const POLL_MS = 2000;
const MAX_POLLS = 10;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

$w.onReady(async () => {
    const el = $w('CustomElement')[0];
    if (!el) return;
    el.setAttribute('mode', 'thanks');
    const token = wixLocation.query.id || '';
    const push = (data) => el.setAttribute('quote-data', JSON.stringify({
        ...data, thanks: true, backUrl: token ? `/offers?id=${encodeURIComponent(token)}` : '', __ts: Date.now(),
    }));

    if (!token) return push({ viewState: 'missing_id' });

    for (let i = 0; i < MAX_POLLS; i++) {
        let data;
        try { data = await getQuoteByToken(token); } catch (_) { data = { viewState: 'not_found' }; }
        if (data.viewState === 'not_found' || data.viewState === 'cancelled') return push(data);
        const st = data.lastPayment?.status;
        if (st === 'paid' || st === 'failed' || st === 'refunded') return push(data);
        const last = i === MAX_POLLS - 1;
        push({ ...data, timedOut: last });
        if (!last) await wait(POLL_MS);
    }
});
