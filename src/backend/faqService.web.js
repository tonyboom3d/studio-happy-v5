import { questionEntry } from "@wix/faq";
import { auth } from "@wix/essentials";
import { webMethod, Permissions } from "wix-web-module";

const listQuestionEntriesElevated = auth.elevate(questionEntry.listQuestionEntries);

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


