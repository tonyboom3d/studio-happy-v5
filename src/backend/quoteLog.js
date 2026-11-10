// Single writer for QuoteActivityLog. No other module inserts into it.
import wixData from 'wix-data';

const SA = { suppressAuth: true, suppressHooks: true };

/** actor: { type: 'admin'|'customer'|'system', name?, userId? } */
export async function writeQuoteLog(quoteId, action, details = {}, actor = { type: 'system' }) {
    try {
        await wixData.insert('QuoteActivityLog', {
            quoteId,
            action,
            details,
            actorType: actor.type || 'system',
            actorName: actor.name || (actor.type === 'system' ? 'מערכת' : ''),
            actorUserId: actor.userId || '',
        }, SA);
    } catch (err) {
        console.error('[quoteLog] write failed:', action, quoteId, err?.message || err);
    }
}

export async function listQuoteLog(quoteId, limit = 200) {
    const res = await wixData.query('QuoteActivityLog')
        .eq('quoteId', quoteId)
        .descending('_createdDate')
        .limit(limit)
        .find(SA);
    return res.items;
}
