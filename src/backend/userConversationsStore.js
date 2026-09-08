/**
 * UserConversations CMS helpers — get/upsert by ManyChat subscriberId.
 * Lookup tries _id first (subscriberId as PK), then subscriberId field query.
 */
import wixData from 'wix-data';

const SA = { suppressAuth: true, suppressHooks: true };

export async function getUserConversation(subscriberId) {
    if (!subscriberId) return null;

    const byId = await wixData.get('UserConversations', subscriberId, SA).catch(() => null);
    if (byId) return byId;

    const found = await wixData.query('UserConversations')
        .eq('subscriberId', subscriberId)
        .limit(1)
        .find(SA)
        .catch(() => ({ items: [] }));

    return found.items?.[0] || null;
}

/** Insert or update — never fails silently on missing record. */
export async function upsertUserConversation(subscriberId, patch) {
    if (!subscriberId) return null;

    let current = await getUserConversation(subscriberId);
    const merged = { ...(current || { _id: subscriberId, subscriberId }), ...patch };

    try {
        if (current) {
            return await wixData.update('UserConversations', merged, SA);
        }
        return await wixData.insert('UserConversations', merged, SA);
    } catch (err) {
        current = await getUserConversation(subscriberId);
        if (current) {
            return wixData.update('UserConversations', { ...current, ...patch }, SA);
        }
        console.warn('[userConversationsStore] upsert failed. subscriberId:', subscriberId, err?.message || err);
        throw err;
    }
}
