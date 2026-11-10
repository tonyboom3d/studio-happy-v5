// Customer-facing (token-gated) web methods. Permissions.Anyone: every method re-validates state server-side.
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import crypto from 'crypto';
import { mediaManager } from 'wix-media-backend';
import { getQuoteSettings } from 'backend/quoteCore.js';
import { computeAmounts } from 'backend/quotePricing.js';
import { renderTemplate } from 'backend/quoteTemplates.js';
import { resolveTemplate } from 'backend/quoteBuilder.js';
import { writeQuoteLog } from 'backend/quoteLog.js';
import { computeViewState, TOKEN_RE } from 'backend/quoteState.js';
import wixPayBackend from 'wix-pay-backend';
import { notifyManagers } from 'backend/quoteNotify.js';
import { QUOTE_ITEM_PREFIX, STAGE_LABELS, nextPayment } from 'backend/quotePayments.js';

const SA = { suppressAuth: true, suppressHooks: true };
const VIEW_LOG_THROTTLE_MS = 10 * 60 * 1000;
const MAX_SIGNATURE_B64 = 280000;

async function findByToken(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    const res = await wixData.query('Quotes').eq('publicToken', token).limit(1).find(SA);
    return res.items[0] || null;
}

const customerActor = (q) => ({ type: 'customer', name: q.customerName || '', userId: '' });

function toDto(q, viewState, settings, contractHtml) {
    const showBank = ['awaiting_transfer_proof', 'awaiting_transfer_approval', 'balance_due'].includes(viewState)
        && q.selectedPaymentMethod === 'bank_transfer';
    return {
        viewState,
        quoteNumber: q.quoteNumber,
        customerName: q.customerName,
        eventType: q.eventType,
        eventDate: q.eventDate,
        eventStartTime: q.eventStartTime,
        eventEndTime: q.eventEndTime,
        extras: (q.extras || []).map((e) => ({ title: e.title, price: e.price })),
        totalAmount: q.totalAmount,
        depositAmount: q.depositAmount,
        balanceAmount: q.balanceAmount,
        balanceDueDate: q.balanceDueDate,
        expiresAt: q.expiresAt,
        paidAmount: q.paidAmount || 0,
        paymentStatus: q.paymentStatus,
        allowOnlinePayment: !!q.allowOnlinePayment,
        allowBankTransfer: !!q.allowBankTransfer,
        selectedPaymentPlan: q.selectedPaymentPlan || '',
        selectedPaymentMethod: q.selectedPaymentMethod || '',
        signedAt: q.signedAt,
        signedPdf: viewState === 'paid_full' || q.status === 'signed' ? (q.signedPdf || '') : '',
        contractHtml,
        bankDetailsText: showBank ? (settings?.bankDetailsText || '') : '',
        brandColor: settings?.brandColor || '',
        logo: settings?.logo || '',
    };
}

async function buildContractHtml(q) {
    if (q.status === 'signed' && q.contractSnapshotHtml) return q.contractSnapshotHtml;
    const tpl = await resolveTemplate(q.templateId, q.eventType);
    if (!tpl) return '';
    const out = renderTemplate(tpl.bodyHtml, q);
    return out.error ? '' : out.html;
}

export const getQuoteByToken = webMethod(Permissions.Anyone, async (token) => {
    const q = await findByToken(token);
    const viewState = computeViewState(q);
    if (viewState === 'not_found') return { viewState: 'not_found' };
    if (viewState === 'cancelled') return { viewState, quoteNumber: q.quoteNumber };
    const settings = await getQuoteSettings();
    const html = viewState === 'expired' ? '' : await buildContractHtml(q);
    const dto = toDto(q, viewState, settings, html);
    if (q.status === 'signed') {
        const last = await wixData.query('QuotePayments').eq('quoteId', q._id).eq('method', 'online').descending('_createdDate').limit(1).find(SA);
        const p = last.items[0];
        if (p) dto.lastPayment = { stage: p.stage, amount: p.amount, status: p.status };
    }
    return dto;
});

/** Creates the Wix Pay payment from stored amounts only; the page then opens the Wix Pay window. */
export const createQuotePayment = webMethod(Permissions.Anyone, async (token) => {
    const q = await findByToken(token);
    const viewState = computeViewState(q);
    if (!['signed_choose_payment', 'balance_due'].includes(viewState)) throw new Error('STATE:אין כרגע תשלום פתוח בהצעה זו.');
    if (q.selectedPaymentMethod !== 'online' || !q.allowOnlinePayment) throw new Error('STATE:תשלום מקוון אינו זמין בהצעה זו.');
    const step = nextPayment(q, viewState);
    if (!step || !(step.amount > 0)) throw new Error('STATE:אין סכום לתשלום.');

    const nameParts = String(q.customerName || '').trim().split(/\s+/);
    const userInfo = { firstName: nameParts[0] || 'לקוח', lastName: nameParts.slice(1).join(' ') || '-', countryCode: 'ISR' };
    if (q.customerEmail) userInfo.email = q.customerEmail;
    if (q.customerPhone) userInfo.phone = String(q.customerPhone).replace(/^972/, '0');

    const payment = await wixPayBackend.createPayment({
        amount: step.amount,
        items: [{ name: `${QUOTE_ITEM_PREFIX} #${q.quoteNumber} – ${STAGE_LABELS[step.stage]}`, price: step.amount, quantity: 1 }],
        userInfo,
    });
    if (!payment?.id) throw new Error('PAYMENT:יצירת התשלום נכשלה. נסו שוב.');
    await wixData.insert('QuotePayments', {
        quoteId: q._id, wixPaymentId: payment.id, stage: step.stage, amount: step.amount, method: 'online', status: 'pending',
    }, SA);
    await writeQuoteLog(q._id, 'payment_started', { stage: step.stage, amount: step.amount }, customerActor(q));
    return { paymentId: payment.id, stage: step.stage };
});

const PROOF_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_PROOF_B64 = 4_500_000;

/** Bank transfer receipt: client sends a (compressed) data URL; stored via Media Manager. */
export const submitTransferProof = webMethod(Permissions.Anyone, async (token, input = {}) => {
    const q = await findByToken(token);
    const viewState = computeViewState(q);
    const payable = viewState === 'awaiting_transfer_proof' || (viewState === 'balance_due' && q.selectedPaymentMethod === 'bank_transfer');
    if (!payable) throw new Error('STATE:לא ניתן להעלות אסמכתא להצעה זו כרגע.');
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(input.dataUrl || ''));
    const ext = m && PROOF_MIME[m[1]];
    if (!ext || m[2].length > MAX_PROOF_B64) throw new Error('VALIDATION:הקובץ אינו נתמך או גדול מדי (תמונה או PDF עד כ-3MB).');
    const step = nextPayment(q, viewState);
    if (!step) throw new Error('STATE:אין סכום לתשלום.');

    const up = await mediaManager.upload('/quote-transfer-proofs', Buffer.from(m[2], 'base64'), `proof-${q.quoteNumber}-${Date.now()}.${ext}`, {
        mediaOptions: { mimeType: m[1], mediaType: ext === 'pdf' ? 'document' : 'image' },
    });
    await wixData.insert('QuotePayments', {
        quoteId: q._id, wixPaymentId: `bank:${q._id}:${step.stage}:${Date.now()}`, stage: step.stage, amount: step.amount,
        method: 'bank_transfer', status: 'pending',
    }, SA);
    await wixData.update('Quotes', { ...q, transferProof: up.fileUrl, transferProofAt: new Date(), paymentStatus: 'awaiting_transfer_approval' }, SA);
    await writeQuoteLog(q._id, 'transfer_proof_uploaded', { stage: step.stage, amount: step.amount }, customerActor(q));
    await notifyManagers('manager_quote_transfer_proof', q, { amount: step.amount });
    return { ok: true };
});

/** First view flips sent -> viewed; log throttled to one entry per 10 minutes. */
export const recordView = webMethod(Permissions.Anyone, async (token) => {
    const q = await findByToken(token);
    if (!q || !['sent', 'viewed', 'signed'].includes(q.status)) return { ok: false };
    const last = q.lastViewLoggedAt ? new Date(q.lastViewLoggedAt).getTime() : 0;
    const now = Date.now();
    const next = { ...q };
    let dirty = false;
    if (q.status === 'sent') { next.status = 'viewed'; dirty = true; }
    if (now - last > VIEW_LOG_THROTTLE_MS) { next.lastViewLoggedAt = new Date(now); dirty = true; }
    if (dirty) {
        await wixData.update('Quotes', next, SA);
        if (next.lastViewLoggedAt !== q.lastViewLoggedAt) await writeQuoteLog(q._id, 'viewed', {}, customerActor(q));
    }
    return { ok: true };
});

async function storeSignature(dataUrl, quoteNumber) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m || m[1].length > MAX_SIGNATURE_B64) throw new Error('VALIDATION:החתימה אינה תקינה.');
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length < 200 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('VALIDATION:החתימה אינה תקינה.');
    const up = await mediaManager.upload('/quote-signatures', buf, `signature-${quoteNumber}-${Date.now()}.png`, {
        mediaOptions: { mimeType: 'image/png', mediaType: 'image' },
    });
    return up.fileUrl;
}

export const signQuote = webMethod(Permissions.Anyone, async (token, input = {}) => {
    const q = await findByToken(token);
    if (computeViewState(q) !== 'ready_to_sign') throw new Error('STATE:לא ניתן לחתום על הצעה זו כרגע. רעננו את הדף.');
    if (input.approved !== true) throw new Error('VALIDATION:יש לאשר את תנאי ההצעה.');

    const plan = input.selectedPaymentPlan;
    const method = input.selectedPaymentMethod;
    if (!['full', 'deposit'].includes(plan)) throw new Error('VALIDATION:יש לבחור מסלול תשלום.');
    if (plan === 'deposit' && !(Number(q.depositAmount) > 0 && Number(q.balanceAmount) > 0)) throw new Error('VALIDATION:מסלול מקדמה אינו זמין בהצעה זו.');
    if (method === 'online' ? !q.allowOnlinePayment : method === 'bank_transfer' ? !q.allowBankTransfer : true) {
        throw new Error('VALIDATION:אמצעי התשלום שנבחר אינו זמין.');
    }

    const amounts = computeAmounts(q);
    if (amounts.error || amounts.totalAmount !== q.totalAmount) throw new Error('STATE:נתוני ההצעה השתנו. פנו אלינו.');

    const tpl = await resolveTemplate(q.templateId, q.eventType);
    if (!tpl) throw new Error('STATE:תבנית החוזה חסרה. פנו אלינו.');
    const rendered = renderTemplate(tpl.bodyHtml, q);
    if (rendered.error) throw new Error('STATE:תבנית החוזה אינה תקינה. פנו אלינו.');

    const signatureImage = await storeSignature(input.signaturePngDataUrl, q.quoteNumber);

    const fresh = await wixData.get('Quotes', q._id, SA); // double-submit guard
    if (!fresh || !['sent', 'viewed'].includes(fresh.status)) throw new Error('STATE:ההצעה כבר נחתמה.');

    const hash = crypto.createHash('sha256').update(JSON.stringify({ html: rendered.html, total: q.totalAmount, dep: q.depositAmount, plan, method })).digest('hex');
    const saved = await wixData.update('Quotes', {
        ...fresh,
        status: 'signed',
        signatureStatus: 'signed',
        signedAt: new Date(),
        signatureImage,
        signerUserAgent: String(input.userAgent || '').slice(0, 300),
        contractSnapshotHtml: rendered.html,
        contractHash: hash,
        selectedPaymentPlan: plan,
        selectedPaymentMethod: method,
        pdfPending: true,
    }, SA);
    await writeQuoteLog(q._id, 'signed', { plan, method, hash }, customerActor(q));
    notifyManagers('manager_quote_signed', saved);
    // Conflict detection + calendar block: added in the calendar phase.
    return { viewState: computeViewState(saved) };
});
