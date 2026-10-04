// Apps Script answers a POST with a redirect. If that redirect is not
// followed, the write stays queued and only lands on the next request.
import { fetch } from 'wix-fetch';

function headerValue(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
    return headers[name] || headers[name.toLowerCase()] || '';
}

export async function postSheetWebhook(endpoint, payload) {
    const first = await fetch(endpoint, {
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'manual',
    });
    const location = headerValue(first.headers, 'location');
    const response = location ? await fetch(location, { method: 'get' }) : first;
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* HTML error page */ }
    if (json?.ok) return json;
    // Google often answers the redirect with HTML even after the row is queued.
    if (response.ok || response.status === 302) {
        console.warn('[sheetWebhook] non-json response, POST was still sent:', String(text).slice(0, 200));
        return { ok: true, unverified: true };
    }
    throw new Error(`Apps Script responded ${response.status}: ${String(text).slice(0, 300)}`);
}
