import wixData from 'wix-data';
import { questionEntry } from '@wix/faq';
import { auth } from '@wix/essentials';

const listQuestionEntriesElevated = auth.elevate(questionEntry.listQuestionEntries);

const KNOWLEDGE_BASE = 'Workshops_KnowledgeBase';
const DATA_OPTIONS = { suppressAuth: true };

export const WORKSHOP_NAME_BY_CATEGORY_ID = {
    '41f1d0b9-a5f4-4b58-8e9c-9e96ca7d7a5b': 'כללי',
    '1aba4e76-8d70-4aa2-9b5f-63aee3cb4d2e': 'תכשיטים',
    '6c6a9707-a64e-46ec-ab90-92f48bf3359a': 'טאפטינג',
    '36201862-63cb-4961-a9d6-ce61141051d5': 'צביעה בקרמיקה',
    'f41ebc9d-9759-414f-97ee-8b11c02aff1a': 'נרות',
};

function stripHtml(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function answerText(entry) {
    return stripHtml(entry?.plainText || entry?.answer || '');
}

async function findByQuestionId(questionId) {
    const result = await wixData.query(KNOWLEDGE_BASE)
        .eq('_questionId', questionId)
        .limit(50)
        .find(DATA_OPTIONS);
    return result.items || [];
}

async function loadPlainQuestion(questionId) {
    const response = await listQuestionEntriesElevated({
        questionEntryIds: [questionId],
        contentFormat: 'PLAIN_TEXT',
    });
    return (response.questionEntries || [])[0] || null;
}

async function plainEntry(entity) {
    const questionId = entity?._id;
    if (!questionId) return entity || null;
    try {
        return (await loadPlainQuestion(questionId)) || entity;
    } catch (error) {
        console.error('[faqKnowledge] plain text fetch failed:', questionId, error?.message || error);
        return entity;
    }
}

export async function upsertFaqKnowledge(entry) {
    const questionId = entry?._id;
    const title = String(entry?.question || '').trim();
    const workshopName = WORKSHOP_NAME_BY_CATEGORY_ID[entry?.categoryId];
    if (!questionId || !title || !workshopName) {
        return {
            skipped: true,
            questionId,
            reason: !workshopName ? 'unknown category' : 'empty question',
        };
    }

    const row = {
        _questionId: questionId,
        title,
        workshopName,
        content: answerText(entry),
    };
    const existing = await findByQuestionId(questionId);
    if (!existing.length) {
        const inserted = await wixData.insert(KNOWLEDGE_BASE, row, DATA_OPTIONS);
        return { inserted: 1, id: inserted?._id };
    }

    for (const item of existing) {
        await wixData.update(KNOWLEDGE_BASE, { ...item, ...row }, DATA_OPTIONS);
    }
    return { updated: existing.length, id: existing[0]._id };
}

export async function removeFaqKnowledge(questionId) {
    if (!questionId) return { removed: 0 };
    const existing = await findByQuestionId(questionId);
    for (const item of existing) {
        await wixData.remove(KNOWLEDGE_BASE, item._id, DATA_OPTIONS);
    }
    return { removed: existing.length };
}

export async function syncFaqQuestionSaved(event) {
    const entry = await plainEntry(event?.entity);
    return upsertFaqKnowledge(entry);
}

export async function syncFaqQuestionDeleted(event) {
    const questionId = event?.metadata?.entityId || event?.entity?._id;
    return removeFaqKnowledge(questionId);
}
