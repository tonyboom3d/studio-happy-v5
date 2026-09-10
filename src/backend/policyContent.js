/**
 * policyContent.js — cancellation policy lookup from CMS collection `Policys`.
 * Fields: title, policyContent (Rich Text), type ("important" = always appended).
 */
import wixData from 'wix-data';
import { normalize } from 'backend/aiGuardrails.js';

const SA = { suppressAuth: true, suppressHooks: true };
const POLICY_COLLECTION = 'Policys';
const IMPORTANT_TYPE = 'important';

const GENERAL_WORKSHOP_VALUES = new Set(['', 'general', 'כללי', 'כללי.', 'all']);

const WORKSHOP_ALIASES = {
    tufting: 'tufting',
    'טאפטינג': 'tufting',
    candles: 'candles',
    'נרות': 'candles',
    'סדנת נרות': 'candles',
    charms: 'charms',
    "צ'ארמס": 'charms',
    'צארמס': 'charms',
    'צ׳ארמים': 'charms',
    jewelry: 'jewelry',
    'תכשיטים': 'jewelry',
    'סדנת תכשיטים': 'jewelry',
    ceramics: 'ceramics',
    'קרמיקה': 'ceramics',
    'סדנת קרמיקה': 'ceramics',
};

export function stripRichText(richText) {
    return String(richText || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

export function isGeneralWorkshopSelection(workshopName) {
    const raw = String(workshopName || '').trim();
    return !raw || GENERAL_WORKSHOP_VALUES.has(normalize(raw));
}

function resolveWorkshopKey(workshopName) {
    const trimmed = String(workshopName || '').trim();
    if (!trimmed) return null;
    return WORKSHOP_ALIASES[trimmed] || WORKSHOP_ALIASES[trimmed.toLowerCase()] || null;
}

/** Match CMS `title` to ManyChat `current_workshop` (exact, alias, or contains). */
export function titleMatchesWorkshop(title, workshopName) {
    const nTitle = normalize(title);
    const nWorkshop = normalize(workshopName);
    if (!nTitle || !nWorkshop) return false;
    if (nTitle === nWorkshop) return true;

    const key = resolveWorkshopKey(workshopName);
    if (key) {
        const aliasHit = Object.entries(WORKSHOP_ALIASES).some(
            ([alias, aliasKey]) => aliasKey === key && normalize(alias) === nTitle
        );
        if (aliasHit) return true;
    }

    return nTitle.includes(nWorkshop) || nWorkshop.includes(nTitle);
}

function isImportantRecord(item) {
    return normalize(item?.type) === IMPORTANT_TYPE;
}

function isWorkshopPolicyRecord(item) {
    return !isImportantRecord(item);
}

async function fetchPolicyItems() {
    const result = await wixData.query(POLICY_COLLECTION).limit(100).find(SA).catch((err) => {
        console.error('[policyContent] CMS query failed:', err?.message || err);
        return { items: [] };
    });
    return result.items || [];
}

function formatImportantBlock(items) {
    const important = items.filter(isImportantRecord);
    if (!important.length) return '';

    const parts = important
        .map((item) => stripRichText(item.policyContent))
        .filter(Boolean);

    if (!parts.length) return '';
    return `⚠️ חשוב:\n${parts.join('\n\n')}`;
}

function formatWorkshopBlock(title, policyContent) {
    const body = stripRichText(policyContent);
    if (!body) return '';
    return `📋 תנאי ביטול — ${title}\n${body}`;
}

/**
 * Builds WhatsApp-ready policy text for one workshop or all (General).
 */
export async function buildWorkshopPolicyReply(workshopName) {
    const items = await fetchPolicyItems();
    const importantBlock = formatImportantBlock(items);
    const workshopPolicies = items.filter(isWorkshopPolicyRecord);

    let mainBlock = '';

    if (isGeneralWorkshopSelection(workshopName)) {
        const blocks = workshopPolicies
            .map((item) => formatWorkshopBlock(item.title || 'סדנה', item.policyContent))
            .filter(Boolean);
        mainBlock = blocks.length
            ? blocks.join('\n\n')
            : 'לא נמצאו תנאי ביטול במערכת.';
    } else {
        const matched = workshopPolicies.filter((item) => titleMatchesWorkshop(item.title, workshopName));
        if (!matched.length) {
            mainBlock = `לא נמצאו תנאי ביטול עבור "${workshopName}".`;
        } else {
            mainBlock = matched
                .map((item) => formatWorkshopBlock(item.title || workshopName, item.policyContent))
                .filter(Boolean)
                .join('\n\n');
        }
    }

    const sections = [importantBlock, mainBlock].filter(Boolean);
    return sections.join('\n\n').trim() || 'לא נמצאו תנאי ביטול.';
}
