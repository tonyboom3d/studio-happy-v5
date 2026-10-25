/**
 * Zadarma PBX webhook (NOTIFY_START) → SMS to the caller.
 *
 * Signature matches Zadarma's PHP sample: base64( hex HMAC-SHA1 ).
 * PHP hash_hmac() returns hex unless raw output is requested.
 *
 * Dedupe collection `IncomingCallSms` (create in CMS, permissions: backend only):
 *   pbxCallId (Text), callerId (Text), calledDid (Text), callStart (Text), sentAt (Date).
 * _id is a UUID derived from pbxCallId so a retry cannot insert twice.
 */
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import wixSecretsBackend from 'wix-secrets-backend';
import wixData from 'wix-data';
import { sendIncomingCallSms } from 'backend/sendMsgService.jsw';

const COLLECTION = 'IncomingCallSms';
const SA = { suppressAuth: true };

function headerValue(request, name) {
    const headers = request?.headers || {};
    const lower = String(name).toLowerCase();
    const key = Object.keys(headers).find((k) => k.toLowerCase() === lower);
    const value = key ? headers[key] : '';
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

async function readBody(request) {
    const body = request?.body;
    if (!body) return '';
    if (typeof body.text === 'function') return await body.text();
    if (typeof body === 'string') return body;
    return '';
}

function parseForm(text) {
    const params = new URLSearchParams(text || '');
    const fields = {};
    for (const [key, value] of params.entries()) fields[key] = value;
    return fields;
}

/** Zadarma: base64_encode(hash_hmac('sha1', data, secret)) — hex, then base64. */
export function zadarmaSignature(data, secret) {
    const hex = createHmac('sha1', secret).update(String(data), 'utf8').digest('hex');
    return Buffer.from(hex, 'utf8').toString('base64');
}

function signaturesMatch(expected, received) {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(received || ''));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function callIdToUuid(callId) {
    const hex = createHash('md5').update(String(callId)).digest('hex');
    const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

export function zadarmaEchoValue(query) {
    const value = query?.zd_echo;
    if (value == null || value === '') return null;
    return String(value);
}

async function claimCall(callId, fields) {
    const id = callIdToUuid(callId);
    try {
        await wixData.insert(COLLECTION, {
            _id: id,
            pbxCallId: callId,
            callerId: String(fields.caller_id || ''),
            calledDid: String(fields.called_did || ''),
            callStart: String(fields.call_start || ''),
            sentAt: new Date(),
        }, SA);
        return { claimed: true, id, persisted: true };
    } catch (err) {
        const msg = String(err?.message || err);
        if (/already exists|duplicate|WDE0074|WDE0100/i.test(msg)) return { claimed: false };
        console.warn('[zadarmaCall] claim skipped:', msg);
        return { claimed: true, id, persisted: false };
    }
}

async function releaseCall(id) {
    if (!id) return;
    await wixData.remove(COLLECTION, id, SA).catch((err) => {
        console.warn('[zadarmaCall] release failed:', err?.message || err);
    });
}

export async function handleZadarmaNotify(request) {
    const fields = parseForm(await readBody(request));
    if (fields.event !== 'NOTIFY_START') return { status: 200, body: 'OK' };

    const secret = await wixSecretsBackend.getSecret('zadarma_api_secret').catch(() => '');
    if (!secret) {
        console.error('[zadarmaCall] missing zadarma_api_secret');
        return { status: 500, body: 'error' };
    }

    const signed = `${fields.caller_id || ''}${fields.called_did || ''}${fields.call_start || ''}`;
    const received = headerValue(request, 'Signature');
    if (!signaturesMatch(zadarmaSignature(signed, secret), received)) {
        console.warn('[zadarmaCall] bad signature');
        return { status: 403, body: 'forbidden' };
    }

    const callId = String(fields.pbx_call_id || '').trim();
    if (!callId) return { status: 200, body: 'OK' };

    const claim = await claimCall(callId, fields);
    if (!claim.claimed) return { status: 200, body: 'OK' };

    const sms = await sendIncomingCallSms(fields.caller_id);
    if (sms?.sent) return { status: 200, body: 'OK' };
    if (sms?.reason === 'error') {
        if (claim.persisted) await releaseCall(claim.id);
        return { status: 500, body: 'error' };
    }
    return { status: 200, body: 'OK' };
}
