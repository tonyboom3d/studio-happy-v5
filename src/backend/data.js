import wixData from 'wix-data';
import { sendOrderConfirmationManyChat } from 'backend/manychatService.jsw';
import { processBookingPaid } from 'backend/schedulingEngine.js';
import { uploadFile, attachToVectorStore, deleteFile, detachFromVectorStore } from 'backend/openaiService.jsw';

const SA = { suppressAuth: true, suppressHooks: true };

/**
 * WorkshopOrders afterUpdate hook — sends WhatsApp confirmation when:
 * 1. Status changes to 'paid' (new order confirmed)
 * 2. resendWhatsApp field is set to true (manual resend trigger)
 *
 * The hook fires server-side on every CMS update to WorkshopOrders,
 * so it works regardless of which code path triggered the update.
 *
 * Date fields (workshopStart) are stored as ISO UTC strings like
 * "2026-08-21T01:00:00.000Z" — the WhatsApp service uses Intl with
 * timeZone: 'Asia/Jerusalem' to display the correct local time
 * (handles both winter/summer DST automatically).
 */
export function WorkshopOrders_afterUpdate(item, context) {
    const previousItem = context.currentItem;

    const justPaid = item.status === 'paid' && previousItem.status !== 'paid';
    const resendRequested = item.resendWhatsApp === true && previousItem.resendWhatsApp !== true;

    if (!justPaid && !resendRequested) return item;

    // Dynamic staff assignment (Module B/C): the moment an order is paid,
    // check whether the day's workshop now needs instructors and assign a
    // pending employee (>24h out) or request their confirmation (<24h out).
    if (justPaid) {
        processBookingPaid(item)
            .then(report => {
                if (report?.handled) console.log('[data.js hook] processBookingPaid:', item._id, JSON.stringify(report));
            })
            .catch(err => {
                console.error('[data.js hook] processBookingPaid failed. orderId:', item._id, 'error:', err?.message || err);
            });
    }

    if (!item.organizerPhone) {
        console.warn('[data.js hook] Skipping WhatsApp — no organizerPhone. orderId:', item._id);
        return item;
    }

    const reason = justPaid ? 'status changed to paid' : 'resendWhatsApp triggered';

    // ManyChat import permission was approved by ManyChat support — all
    // paid orders now go through the "אישור הזמנה" ManyChat flow (no more
    // Green API / test-phone gate here).
    console.log(`[data.js hook] Sending confirmation via ManyChat (${reason}). orderId:`, item._id, 'phone:', item.organizerPhone);

    sendOrderConfirmationManyChat(item)
        .then(() => {
            console.log('[data.js hook] Confirmation sent successfully. orderId:', item._id);
            if (resendRequested) {
                return wixData.update('WorkshopOrders', {
                    ...item,
                    resendWhatsApp: false,
                }, SA);
            }
        })
        .catch(err => {
            // Never let a messaging failure affect the saved order — log only.
            console.error('[data.js hook] Confirmation send failed. orderId:', item._id, 'error:', err?.message || err);
        });

    return item;
}

// ============================================================
// Workshops_KnowledgeBase → OpenAI Vector Store sync (AI Assistant PRD §4)
//
// Keeps the file_search knowledge base in sync with the CMS. All three
// hooks are fire-and-forget (never block the CMS write) and use SA
// (suppressHooks: true) for their own write-back, so they never
// re-trigger themselves.
// ============================================================

function stripHtml(richText) {
    return String(richText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildKnowledgeBaseText(item) {
    const workshopName = item.workshopName || 'כללי';
    return `Workshop Name: ${workshopName}\nTitle: ${item.title || ''}\nContent: ${stripHtml(item.content)}`;
}

async function syncKnowledgeBaseItem(item) {
    const text = buildKnowledgeBaseText(item);
    const fileId = await uploadFile(text, `kb-${item._id}.txt`);
    await attachToVectorStore(fileId);
    await wixData.update('Workshops_KnowledgeBase', {
        ...item,
        openAiFileId: fileId,
        lastSynced: new Date(),
    }, SA);
    console.log('[data.js hook] Workshops_KnowledgeBase synced. itemId:', item._id, 'fileId:', fileId);
}

export function Workshops_KnowledgeBase_afterInsert(item, context) {
    syncKnowledgeBaseItem(item).catch(err => {
        console.error('[data.js hook] Workshops_KnowledgeBase_afterInsert sync failed. itemId:', item._id, 'error:', err?.message || err);
    });
    return item;
}

async function resyncKnowledgeBaseItem(item, oldFileId) {
    if (oldFileId) {
        await detachFromVectorStore(oldFileId);
        await deleteFile(oldFileId);
    }
    const text = buildKnowledgeBaseText(item);
    const fileId = await uploadFile(text, `kb-${item._id}.txt`);
    await attachToVectorStore(fileId);
    await wixData.update('Workshops_KnowledgeBase', {
        ...item,
        openAiFileId: fileId,
        lastSynced: new Date(),
    }, SA);
    console.log('[data.js hook] Workshops_KnowledgeBase re-synced. itemId:', item._id, 'fileId:', fileId);
}

export function Workshops_KnowledgeBase_afterUpdate(item, context) {
    const previousItem = context.currentItem;

    const contentChanged = item.title !== previousItem?.title
        || item.workshopName !== previousItem?.workshopName
        || item.content !== previousItem?.content;
    if (!contentChanged) return item;

    resyncKnowledgeBaseItem(item, previousItem?.openAiFileId).catch(err => {
        console.error('[data.js hook] Workshops_KnowledgeBase_afterUpdate sync failed. itemId:', item._id, 'error:', err?.message || err);
    });
    return item;
}

export function Workshops_KnowledgeBase_afterRemove(item, context) {
    if (!item.openAiFileId) return item;

    detachFromVectorStore(item.openAiFileId)
        .then(() => deleteFile(item.openAiFileId))
        .catch(err => {
            console.error('[data.js hook] Workshops_KnowledgeBase_afterRemove cleanup failed. itemId:', item._id, 'error:', err?.message || err);
        });

    return item;
}