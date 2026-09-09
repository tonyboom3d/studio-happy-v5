/**
 * aiRouting.js — detects user intents that need a ManyChat button (URL or flow).
 * ManyChat reads action_* fields from the HTTP response and renders the button.
 */
import { normalize } from 'backend/aiGuardrails.js';

const SITE_HOME_URL = 'https://www.studiohappy.art';

const FLOW_ORDER_CHANGES = 'content20260909132814_505480';
const FLOW_BIRTHDAY_EVENTS = 'content20260909133101_025348';

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

const WORKSHOP_BOOKING_URLS = {
    tufting: 'https://www.studiohappy.art/booking-flow-tufting',
    candles: 'https://www.studiohappy.art/booking-flow-candels',
    ceramics: 'https://www.studiohappy.art/booking-flow-ceramic',
    jewelry: 'https://www.studiohappy.art/workshops/סדנת-תכשיטים',
    charms: 'https://www.studiohappy.art/workshops/סדנת-תכשיטים-צ׳ארמים',
};

const GENERAL_WORKSHOP_VALUES = new Set(['', 'general', 'כללי', 'כללי.', 'all']);

const ORDER_CHANGE_PHRASES = [
    'שינוי בהזמנה', 'לשנות הזמנה', 'שינוי הזמנה', 'לעדכן הזמנה', 'עדכון הזמנה',
    'לבטל הזמנה', 'ביטול הזמנה', 'לבטל את ההזמנה', 'הזמנה שלי', 'ניהול הזמנה',
    'לשנות תאריך', 'שינוי תאריך', 'לדחות', 'לשנות שעה', 'שינוי מספר משתתפים',
];

const BIRTHDAY_EVENT_PHRASES = [
    'יום הולדת', 'ימי הולדת', 'יום-הולדת', 'birthday',
    'חגיגת יום הולדת', 'מסיבת יום הולדת', 'מסיבת', 'party',
    'אירוע פרטי', 'אירועים פרטיים', 'אירוע בסטודיו', 'אירועים בסטודיו',
];

const SCHEDULE_PHRASES = [
    'שעות', 'באיזה שעות', 'איזה שעות', 'מתי יש', 'מתי מתקיימ', 'מתי הסדנה',
    'איזה יום', 'באיזה יום', 'באילו ימים', 'ימים', 'לוח סדנאות', 'לוח סדנות',
    'תאריכים', 'מועדים', 'מתי פתוח', 'מתי אתם פתוחים', 'שעות פעילות',
];

const AVAILABILITY_PHRASES = [
    'יש מקום', 'מקום פנוי', 'מקומות פנויים', 'זמינות', 'זמין', 'פתוח להרשמה',
    'אפשר להירשם', 'נשאר מקום', 'יש עוד מקום', 'יש עוד מקומות', 'יש מקומות',
    'available', 'availability',
];

function includesAnyPhrase(text, phrases) {
    const n = normalize(text);
    return phrases.some((p) => n.includes(normalize(p)));
}

function resolveWorkshopKey(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed || GENERAL_WORKSHOP_VALUES.has(normalize(trimmed))) return null;
    return WORKSHOP_ALIASES[trimmed] || WORKSHOP_ALIASES[trimmed.toLowerCase()] || null;
}

/** Workshop from current_workshop field, else from user message text. */
export function resolveWorkshopKeyFromContext(workshopName, userMessage) {
    return resolveWorkshopKey(workshopName) || detectWorkshopKeyInMessage(userMessage);
}

function detectWorkshopKeyInMessage(userMessage) {
    const n = normalize(userMessage);
    for (const [alias, key] of Object.entries(WORKSHOP_ALIASES)) {
        if (n.includes(normalize(alias))) return key;
    }
    return null;
}

export function resolveBookingUrl(workshopName, userMessage) {
    const key = resolveWorkshopKeyFromContext(workshopName, userMessage);
    return (key && WORKSHOP_BOOKING_URLS[key]) || SITE_HOME_URL;
}

/**
 * Returns a suggested action for ManyChat, or null for a plain text reply.
 * @returns {{ route, action_type: 'url'|'flow', action_target, button_label }|null}
 */
export function detectSuggestedAction(userMessage, workshopName) {
    const msg = String(userMessage || '');

    if (includesAnyPhrase(msg, ORDER_CHANGE_PHRASES)) {
        return {
            route: 'order_change',
            action_type: 'flow',
            action_target: FLOW_ORDER_CHANGES,
            button_label: 'לשינוי / ניהול הזמנה 📝',
        };
    }

    if (includesAnyPhrase(msg, BIRTHDAY_EVENT_PHRASES)) {
        return {
            route: 'birthday_events',
            action_type: 'flow',
            action_target: FLOW_BIRTHDAY_EVENTS,
            button_label: 'לפרטים על ימי הולדת ואירועים 🎉',
        };
    }

    if (includesAnyPhrase(msg, SCHEDULE_PHRASES)) {
        return {
            route: 'workshop_schedule',
            action_type: 'url',
            action_target: resolveBookingUrl(workshopName, msg),
            button_label: 'להרשמה ולצפייה בתאריכים 📅',
        };
    }

    if (includesAnyPhrase(msg, AVAILABILITY_PHRASES)) {
        return {
            route: 'workshop_availability',
            action_type: 'url',
            action_target: resolveBookingUrl(workshopName, msg),
            button_label: 'לבדיקת זמינות והרשמה ✨',
        };
    }

    return null;
}

export const ROUTE_REPLY_OVERRIDES = {
    birthday_events:
        'כן! ב-Studio Happy אפשר לקיים ימי הולדת ואירועים בסטודיו 🎉 יש לנו חבילות מותאמות — לחצ/י על הכפתור לפרטים.',
};

/** True when the model wrongly refused a valid studio topic. */
export function looksLikeOffTopicRefusal(text) {
    const n = normalize(text);
    return /סדנאות בלבד|לא רלוונט|עניינים אישיים|איך נוכל לעזור לך לגבי הסדנה/.test(n);
}

/** If AI refused a routed business intent, use a safe default reply instead. */
export function finalizeRoutedReply(action, aiReply) {
    if (!action || !looksLikeOffTopicRefusal(aiReply)) return aiReply;
    return ROUTE_REPLY_OVERRIDES[action.route] || aiReply;
}

export function isRoutingIntent(userMessage, workshopName) {
    return !!detectSuggestedAction(userMessage, workshopName);
}

