/**
 * aiGuardrails.js — Workshops AI Assistant guardrails, rate limiting, and
 * human-handoff detection (PRD §3 Guardrails_Rules, §5 steps 2-3, §7).
 *
 * `UserConversations` uses `subscriberId` as the record `_id` (PK) so both
 * this module and http-functions.js can do O(1) get/update lookups.
 */
import wixData from 'wix-data';

const SA = { suppressAuth: true, suppressHooks: true };

// --- Rate limiting ---
const RATE_LIMIT_MAX_MESSAGES = 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute sliding window

/**
 * Per-subscriber sliding-window rate limit, persisted on the
 * UserConversations record (rateWindowStart / rateCount) so it survives
 * across warm/cold backend instances. Creates a bare record on first
 * contact if none exists yet — http-functions.js later fills in
 * conversationId/lastWorkshop on the same record.
 */
export async function checkRateLimit(subscriberId) {
    if (!subscriberId) return { allowed: false, reason: 'no-subscriber-id' };

    const now = new Date();
    const existing = await wixData.get('UserConversations', subscriberId, SA).catch(() => null);

    if (!existing) {
        await wixData.insert('UserConversations', {
            _id: subscriberId,
            subscriberId,
            rateWindowStart: now,
            rateCount: 1,
        }, SA).catch((err) => console.warn('[aiGuardrails] rate-limit insert failed:', err?.message || err));
        return { allowed: true };
    }

    const windowStart = existing.rateWindowStart ? new Date(existing.rateWindowStart) : now;
    const withinWindow = now.getTime() - windowStart.getTime() < RATE_LIMIT_WINDOW_MS;
    const nextCount = withinWindow ? (existing.rateCount || 0) + 1 : 1;
    const nextWindowStart = withinWindow ? windowStart : now;

    await wixData.update('UserConversations', {
        ...existing,
        rateWindowStart: nextWindowStart,
        rateCount: nextCount,
    }, SA).catch((err) => console.warn('[aiGuardrails] rate-limit update failed:', err?.message || err));

    if (withinWindow && nextCount > RATE_LIMIT_MAX_MESSAGES) {
        console.warn('[aiGuardrails] rate-limited subscriber:', subscriberId, 'count:', nextCount);
        return { allowed: false, reason: 'rate-limited' };
    }
    return { allowed: true };
}

// --- Text normalization (Hebrew) ---
// Strips niqqud (diacritics) and normalizes final-letter forms so
// matchMode: 'normalized' rules catch variants like "כן" vs "כן " or
// words written with/without vowel points.
const HEBREW_FINAL_LETTERS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export function normalize(text) {
    if (!text) return '';
    let out = String(text)
        .normalize('NFKD')
        .replace(/[\u0591-\u05C7]/g, ''); // Hebrew diacritics/cantillation marks
    out = out.replace(/[ךםןףץ]/g, (ch) => HEBREW_FINAL_LETTERS[ch] || ch);
    return out.trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Guardrails ---
const DEFAULT_FALLBACK_MESSAGE = 'מצטערים, אין לנו מענה לבקשה הזו כרגע. ניצור עם נציג קשר בהקדם 🙏';

/**
 * Checks the user message against active Guardrails_Rules before any
 * OpenAI call is made (PRD §5 step 3, §9). Returns the first matching
 * rule's fallbackMessage, or { triggered: false } if nothing matched.
 */
export async function checkGuardrails(userMessage) {
    const rawMessage = String(userMessage || '');
    if (!rawMessage.trim()) return { triggered: false };

    const rulesResult = await wixData.query('Guardrails_Rules')
        .eq('isActive', true)
        .limit(500)
        .find(SA)
        .catch((err) => {
            console.error('[aiGuardrails] Guardrails_Rules query failed:', err?.message || err);
            return { items: [] };
        });

    const normalizedMessage = normalize(rawMessage);

    for (const rule of rulesResult.items || []) {
        const keyword = String(rule.keywordOrTopic || '').trim();
        if (!keyword) continue;

        let hit = false;
        if (rule.matchMode === 'exact-word') {
            const wordRegex = new RegExp(`(^|\\W)${escapeRegex(keyword)}(\\W|$)`, 'i');
            hit = wordRegex.test(rawMessage);
        } else if (rule.matchMode === 'substring') {
            hit = rawMessage.toLowerCase().includes(keyword.toLowerCase());
        } else {
            // 'normalized' (default) — strips diacritics/final-letter forms first
            hit = normalizedMessage.includes(normalize(keyword));
        }

        if (hit) {
            console.log('[aiGuardrails] Guardrail triggered:', rule.ruleType, '|', keyword);
            return {
                triggered: true,
                ruleType: rule.ruleType,
                fallbackMessage: rule.fallbackMessage || DEFAULT_FALLBACK_MESSAGE,
            };
        }
    }

    return { triggered: false };
}

// --- Human handoff detection (PRD §7) ---
// The OpenAI Prompt's system instructions should emit this marker whenever
// it decides the user needs a human (missing info / explicitly asked for a
// person). It's stripped from the text actually sent back to the user.
const HANDOFF_MARKER = '[[HANDOFF]]';

// Keyword-based trigger as a second, independent path (works even if the
// model forgets the marker) — extend as needed.
const HANDOFF_KEYWORDS = ['נציג', 'לדבר עם מישהו', 'אדם אמיתי', 'בן אדם', 'מוקד'];

/**
 * Detects whether this turn needs human handoff, from either the model's
 * output marker or the user's own wording. Returns the reply text with the
 * marker stripped so it's never shown to the end user.
 */
export function detectHandoff(replyText, userMessage) {
    const rawReply = String(replyText || '');
    const markerHit = rawReply.includes(HANDOFF_MARKER);

    const normalizedUserMessage = normalize(userMessage);
    const keywordHit = HANDOFF_KEYWORDS.some((k) => normalizedUserMessage.includes(normalize(k)));

    const cleanedReply = rawReply.split(HANDOFF_MARKER).join('').trim();

    return { needsHandoff: markerHit || keywordHit, cleanedReply };
}
