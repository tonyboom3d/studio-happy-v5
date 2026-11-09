import { category, questionEntry } from "@wix/faq";
import { auth } from "@wix/essentials";
import { webMethod, Permissions } from "wix-web-module";

const listQuestionEntriesElevated = auth.elevate(questionEntry.listQuestionEntries);
const listCategoriesElevated = auth.elevate(category.listCategories);

const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

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
export const exportAllFaq = webMethod(Permissions.Admin, async () => {
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
});

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


