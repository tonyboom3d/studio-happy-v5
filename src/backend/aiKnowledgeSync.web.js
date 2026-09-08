/**
 * aiKnowledgeSync.web.js — one-time / manual sync of Workshops_KnowledgeBase
 * items to the OpenAI Vector Store.
 *
 * CMS inserts via the REST API (or bulk import) do NOT fire Velo data hooks,
 * so openAiFileId stays empty until items are synced through the backend.
 *
 * Run once from the Velo Editor sandbox after seeding FAQ content:
 *   import { syncAllKnowledgeBaseItems } from 'backend/aiKnowledgeSync.web';
 *   syncAllKnowledgeBaseItems().then(console.log);
 */
import wixData from 'wix-data';
import { uploadFile, attachToVectorStore } from 'backend/openaiService.jsw';

const SA = { suppressAuth: true, suppressHooks: true };

function stripHtml(richText) {
    return String(richText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildKnowledgeBaseText(item) {
    const workshopName = item.workshopName || 'General';
    return `Workshop Name: ${workshopName}\nTitle: ${item.title || ''}\nContent: ${stripHtml(item.content)}`;
}

/** Syncs every Workshops_KnowledgeBase item missing openAiFileId. */
export async function syncAllKnowledgeBaseItems() {
    const result = await wixData.query('Workshops_KnowledgeBase').limit(1000).find(SA);
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of result.items || []) {
        if (item.openAiFileId) {
            skipped++;
            continue;
        }
        try {
            const fileId = await uploadFile(buildKnowledgeBaseText(item), `kb-${item._id}.txt`);
            await attachToVectorStore(fileId);
            await wixData.update('Workshops_KnowledgeBase', {
                ...item,
                openAiFileId: fileId,
                lastSynced: new Date(),
            }, SA);
            synced++;
            console.log('[aiKnowledgeSync] synced:', item.title, 'fileId:', fileId);
        } catch (err) {
            failed++;
            console.error('[aiKnowledgeSync] failed:', item._id, item.title, err?.message || err);
        }
    }

    const summary = { synced, skipped, failed, total: (result.items || []).length };
    console.log('[aiKnowledgeSync] done:', JSON.stringify(summary));
    return summary;
}
