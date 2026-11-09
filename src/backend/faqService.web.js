import { category, questionEntry } from "@wix/faq";
import { auth } from "@wix/essentials";
import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";

const listQuestionEntriesElevated = auth.elevate(questionEntry.listQuestionEntries);
const listCategoriesElevated = auth.elevate(category.listCategories);

const PAGE_LIMIT = 100;
const MAX_PAGES = 50;
const KNOWLEDGE_BASE = "Workshops_KnowledgeBase";
const DATA_OPTIONS = { suppressAuth: true };

const WORKSHOP_NAME_BY_CATEGORY_ID = {
    "41f1d0b9-a5f4-4b58-8e9c-9e96ca7d7a5b": "כללי",
    "1aba4e76-8d70-4aa2-9b5f-63aee3cb4d2e": "תכשיטים",
    "6c6a9707-a64e-46ec-ab90-92f48bf3359a": "טאפטינג",
    "36201862-63cb-4961-a9d6-ce61141051d5": "צביעה בקרמיקה",
    "f41ebc9d-9759-414f-97ee-8b11c02aff1a": "נרות",
};

async function listAll(fetchPage, itemsKey) {
    const items = [];
    let cursor;

    for (let page = 0; page < MAX_PAGES; page++) {
        const response = await fetchPage(cursor);
        items.push(...(response[itemsKey] || []));
        cursor = response.pagingMetadata?.cursors?.next;
        if (!cursor) break;
    }

    return items;
}

function bySortOrder(a, b) {
    const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
}

/**
 * Editor sandbox (after publish):
 * import { exportAllFaq } from 'backend/faqService.web.js';
 * exportAllFaq().then(console.log);
 */
async function loadAllFaq() {
    const categories = (await listAll(
        (cursor) => listCategoriesElevated({ paging: { limit: PAGE_LIMIT, cursor } }),
        "categories"
    )).sort(bySortOrder);

    const categoryTitleById = new Map(categories.map((item) => [item._id, item.title || ""]));

    const entries = await listAll(
        (cursor) => listQuestionEntriesElevated({
            contentFormat: "PLAIN_TEXT",
            paging: { limit: PAGE_LIMIT, cursor },
        }),
        "questionEntries"
    );

    const questions = entries
        .slice()
        .sort((a, b) => {
            const categoryDelta = (categoryTitleById.get(a.categoryId) || "").localeCompare(
                categoryTitleById.get(b.categoryId) || "",
                "he"
            );
            return categoryDelta || bySortOrder(a, b);
        })
        .map((entry) => ({
            id: entry._id,
            categoryId: entry.categoryId,
            category: categoryTitleById.get(entry.categoryId) || "",
            question: entry.question || "",
            answer: entry.plainText || entry.answer || "",
            sortOrder: entry.sortOrder,
        }));

    return {
        exportedAt: new Date().toISOString(),
        categoryCount: categories.length,
        questionCount: questions.length,
        categories: categories.map((item) => ({
            id: item._id,
            title: item.title || "",
            sortOrder: item.sortOrder,
        })),
        questions,
    };
}

export const exportAllFaq = webMethod(Permissions.Admin, loadAllFaq);

/**
 * Editor sandbox (after publish):
 * import { importFaqToKnowledgeBase } from 'backend/faqService.web.js';
 * importFaqToKnowledgeBase().then(console.log);
 */
export const importFaqToKnowledgeBase = webMethod(Permissions.Admin, async () => {
    const { questions } = await loadAllFaq();
    const existing = await listKnowledgeBaseItems();
    const byQuestionId = new Map(
        existing.filter((item) => item._questionId).map((item) => [item._questionId, item])
    );

    const toInsert = [];
    const toUpdate = [];
    const skipped = [];

    for (const entry of questions) {
        const title = String(entry.question || "").trim();
        if (!title) {
            skipped.push({ id: entry.id, reason: "empty question" });
            continue;
        }

        const workshopName = WORKSHOP_NAME_BY_CATEGORY_ID[entry.categoryId];
        if (!workshopName) {
            skipped.push({ id: entry.id, categoryId: entry.categoryId, reason: "unknown category" });
            continue;
        }

        const row = {
            _questionId: entry.id,
            title,
            workshopName,
            content: entry.answer || "",
        };
        const current = byQuestionId.get(entry.id);
        if (current) {
            toUpdate.push({ ...current, ...row });
        } else {
            toInsert.push(row);
        }
    }

    const insertedResult = toInsert.length
        ? await wixData.bulkInsert(KNOWLEDGE_BASE, toInsert, DATA_OPTIONS)
        : { inserted: 0, errors: [] };
    const updatedResult = toUpdate.length
        ? await wixData.bulkUpdate(KNOWLEDGE_BASE, toUpdate, DATA_OPTIONS)
        : { updated: 0, errors: [] };

    return {
        inserted: insertedResult.inserted || 0,
        updated: updatedResult.updated || 0,
        skipped: skipped.length,
        skippedItems: skipped,
        errors: [
            ...bulkErrorMessages(insertedResult),
            ...bulkErrorMessages(updatedResult),
        ],
    };
});

async function listKnowledgeBaseItems() {
    const items = [];
    let result = await wixData.query(KNOWLEDGE_BASE).limit(1000).find(DATA_OPTIONS);
    items.push(...result.items);
    while (result.hasNext()) {
        result = await result.next();
        items.push(...result.items);
    }
    return items;
}

function bulkErrorMessages(result) {
    return (result?.errors || []).map((error) => error?.message || String(error));
}

export const getPlainTextQuestionsByCategory = webMethod(Permissions.Anyone, async (categoryId) => {
    if (!categoryId || typeof categoryId !== "string") {
        console.warn("getPlainTextQuestionsByCategory called without a valid categoryId");
        return [];
    }

    const options = {
        categoryId,
        contentFormat: "PLAIN_TEXT",
    };

    try {
        const response = await listQuestionEntriesElevated(options);
        return (response.questionEntries || [])
            .slice()
            .sort((a, b) => {
                const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
                const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
                return aOrder - bOrder;
            });
    } catch (error) {
        console.error("Error fetching question entries:", error);
        return [];
    }
});


