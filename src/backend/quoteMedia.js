// Media Manager URIs (wix:image:// / wix:document://) -> public https URLs.
export function mediaHttpsUrl(uri) {
    const s = String(uri || '');
    if (/^https?:\/\//i.test(s)) return s;
    const img = /^wix:image:\/\/v1\/([^/#]+)/.exec(s);
    if (img) return `https://static.wixstatic.com/media/${img[1]}`;
    const doc = /^wix:document:\/\/v1\/(ugd\/[^/#]+)/.exec(s);
    if (doc) return `https://static.wixstatic.com/${doc[1]}`;
    return '';
}

/** QuotePayments bank rows as table rows. Rows uploaded before proofUrl existed fall back to the quote's latest proof. */
export function proofRows(payments, quote) {
    const bank = payments.filter((p) => p.method === 'bank_transfer');
    const latestId = bank.find((p) => p.status === 'pending')?._id;
    return bank.map((p) => ({
        id: p._id,
        at: p._createdDate,
        stage: p.stage,
        amount: p.amount,
        status: p.status,
        url: mediaHttpsUrl(p.proofUrl || (p._id === latestId ? quote?.transferProof : '')),
        isPdf: p.proofType === 'pdf' || /^wix:document:/.test(p.proofUrl || ''),
    }));
}
