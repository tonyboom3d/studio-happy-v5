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

function questionIdOf(entry) {
    return entry?._id || entry?.id || '';
}

async function plainEntry(entity) {
    const questionId = questionIdOf(entity);
    if (!questionId) return entity || null;
    try {
        return (await loadPlainQuestion(questionId)) || entity;
    } catch (error) {
        console.error('[faqKnowledge] plain text fetch failed:', questionId, error?.message || error);
        return entity;
    }
}

export async function upsertFaqKnowledge(entry) {
    const questionId = questionIdOf(entry);
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
    const questionId = event?.metadata?.entityId || questionIdOf(event?.entity);
    return removeFaqKnowledge(questionId);
}

function parseJson(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

function decodeJwtPayload(token) {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (padded.length % 4)) % 4;
    const json = Buffer.from(padded + '='.repeat(padLength), 'base64').toString('utf8');
    return parseJson(json);
}

function unwrapWebhook(body) {
    let payload = body;
    if (typeof payload === 'string') {
        const trimmed = payload.trim();
        payload = trimmed.startsWith('{') ? parseJson(trimmed) : decodeJwtPayload(trimmed);
    }
    if (typeof payload?.jwt === 'string') payload = decodeJwtPayload(payload.jwt);
    if (typeof payload?.data === 'string') payload = parseJson(payload.data);

    const eventType = payload?.eventType || payload?.data?.eventType || '';
    let eventData = payload?.data?.data ?? payload?.data;
    if (typeof eventData === 'string') eventData = parseJson(eventData);
    if (eventData?.slug || eventData?.entityId || eventData?.createdEvent || eventData?.updatedEvent || eventData?.deletedEvent) {
        return { eventType, eventData };
    }
    if (payload?.slug || payload?.entityId) return { eventType, eventData: payload };
    return { eventType, eventData: null };
}

function slugOf(eventType, eventData) {
    if (eventData?.slug) return eventData.slug;
    if (eventType.endsWith('_created')) return 'created';
    if (eventType.endsWith('_updated')) return 'updated';
    if (eventType.endsWith('_deleted')) return 'deleted';
    return '';
}

function entityFromEvent(eventData) {
    const raw = parseJson(eventData?.createdEvent?.entityAsJson)
        || parseJson(eventData?.updatedEvent?.currentEntityAsJson)
        || parseJson(eventData?.updatedEvent?.entityAsJson)
        || parseJson(eventData?.deletedEvent?.entityAsJson);
    if (!raw) return null;
    return raw.questionEntry || raw;
}

/** One webhook for FAQ created, updated, and deleted. */
export async function handleFaqQuestionWebhook(body) {
    const { eventType, eventData } = unwrapWebhook(body);
    if (!eventData) return { skipped: true, reason: 'unrecognized payload' };

    const slug = slugOf(eventType, eventData);
    const hinted = entityFromEvent(eventData);
    const questionId = questionIdOf(hinted) || eventData.entityId || '';

    if (slug === 'deleted') {
        const removed = await removeFaqKnowledge(questionId);
        return { slug, questionId, ...removed };
    }
    if (slug !== 'created' && slug !== 'updated') {
        return { skipped: true, reason: 'unknown slug', eventType, slug };
    }

    const loaded = questionId ? await loadPlainQuestion(questionId).catch(() => null) : null;
    const result = await upsertFaqKnowledge(loaded || hinted || { _id: questionId });
    return { slug, questionId, ...result };
}
