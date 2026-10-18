/**
 * Wix Custom Element: birthday-landing
 * -------------------------------------
 * Vibrant, responsive landing page for birthday workshops.
 *
 * הוראות התקנה בוויקס (עמוד "ימי הולדת" — ycwo5):
 * 1. בעורך וויקס: הוסף רכיב "Custom Element" (Elements Panel > Embed > Custom Element)
 *    או השתמש ברכיב הקיים #customElement2 בעמוד.
 * 2. בהגדרות הרכיב, הגדר "Tag Name" בדיוק לפי הערך: birthday-landing
 * 3. תן לרכיב את ה-ID: customElement2 (או עדכן את ELEMENT_ID בקובץ ה-Velo של העמוד).
 * 4. העלה קובץ זה תחת "Source: Upload a file".
 * 5. הגדירו את רכיב ה-Custom Element ל-Full Width / Stretch, וגובה גמיש (Auto).
 *
 * CMS — birthdayWorkshops:
 *   `menuCardImage` (Image) — תמונת כרטיסייה בתפריט
 *   `workshopSlug` (Text) — שם באנגלית ל-URL, למשל "Pottery Party" (fallback: _id)
 *
 * תקשורת עם Velo (src/pages/ימי הולדת.ycwo5.js):
 *  - Velo -> CE: setAttribute('workshops-data', ...)
 *              / setAttribute('active-workshop-ref', '<slug|id>')  ← מ-query ?workshop=
 *              / setAttribute('lead-result', ...)
 *  - CE -> Velo: dispatchEvent('birthday-workshop-select', { detail: { workshopRef } })
 *              / dispatchEvent('birthday-workshop-clear')
 *              / dispatchEvent('birthday-tab-change', { detail: { workshopRef } })
 *              / dispatchEvent('submitLead', { detail: { requestId, payload } })
 */

const TAG_NAME = 'birthday-landing';
const WORKSHOP_QUERY_KEY = 'workshop';

function h(strings, ...values) {
    return strings.reduce((out, s, i) => out + s + (values[i] !== undefined ? values[i] : ''), '');
}

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

/** Normalizes a Media Manager gallery entry (string / wix:image:// / resolved object) into a usable <img> src. */
function resolveMediaUrl(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return resolveWixImage(entry);
    const candidate = entry.url || entry.src || (entry.image && (entry.image.url || entry.image)) || entry.uri || '';
    return resolveWixImage(candidate);
}

function resolveWixImage(value) {
    const str = String(value || '');
    if (!str) return '';
    if (str.startsWith('wix:image://')) {
        const match = str.match(/wix:image:\/\/v\d\/([^/]+)\//);
        if (match && match[1]) return `https://static.wixstatic.com/media/${match[1]}`;
    }
    return str;
}

/** Returns a resized wixstatic URL for faster gallery loading. */
function optimizeMediaUrl(entry, targetWidth, targetHeight) {
    const url = resolveMediaUrl(entry);
    if (!url) return '';
    if (!url.includes('static.wixstatic.com/media/')) return url;
    if (url.includes('/v1/fill/') || url.includes('/v1/crop/')) return url;

    const match = url.match(/static\.wixstatic\.com\/media\/([^/?#]+)/);
    if (!match) return url;

    const hash = match[1];
    const afterHash = url.split(`/media/${hash}`)[1] || '';
    const filenameMatch = afterHash.match(/\/([^/?#]+)$/);
    const filename = filenameMatch ? filenameMatch[1] : 'image.jpg';
    const h = targetHeight || Math.round(targetWidth * 0.75);

    return `https://static.wixstatic.com/media/${hash}/v1/fill/w_${targetWidth},h_${h},al_c,q_80,usm_0.66_1.00_0.01,enc_auto/${filename}`;
}

function mediaAlt(entry, fallback) {
    if (entry && typeof entry === 'object') return entry.title || entry.altText || entry.description || fallback || '';
    return fallback || '';
}

/** Decodes and normalizes a workshop URL ref (slug or id) for comparison. */
function normalizeWorkshopRef(ref) {
    if (ref == null || ref === '') return '';
    let str = String(ref).trim();
    try { str = decodeURIComponent(str.replace(/\+/g, ' ')); } catch (e) { /* keep raw */ }
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getWorkshopUrlRef(workshop) {
    const slug = String(workshop?.workshopSlug || workshop?.urlRef || '').trim();
    return slug || workshop?._id || '';
}

function readWorkshopRefFromUrl() {
    try {
        return new URL(window.location.href).searchParams.get(WORKSHOP_QUERY_KEY) || '';
    } catch (e) {
        return '';
    }
}

function workshopRefMatches(workshop, ref) {
    if (!workshop || ref == null || ref === '') return false;
    const normalized = normalizeWorkshopRef(ref);
    if (!normalized) return false;
    if (workshop._id && normalizeWorkshopRef(workshop._id) === normalized) return true;
    if (workshop.workshopSlug && normalizeWorkshopRef(workshop.workshopSlug) === normalized) return true;
    if (workshop.urlRef && normalizeWorkshopRef(workshop.urlRef) === normalized) return true;
    return false;
}

/** Plain-text excerpt from workshop description for menu cards (max 3 lines via CSS). */
function descriptionPreview(text) {
    if (!text) return '';
    const lines = String(text).trim().split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const bodyLines = lines.filter((line) => !/משך\s*(ה)?סדנ[אה]/i.test(line));
    return bodyLines.join(' ') || String(text).trim();
}

/** Formats workshop description into readable paragraphs + duration badge. */
function renderDescription(text) {
    if (!text) return '<p class="bl-desc-empty">פרטי הסדנה יתעדכנו בקרוב.</p>';

    const raw = String(text).trim();
    const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    let bodyLines = lines;
    let durationLine = '';

    const durationIdx = lines.findIndex((line) => /משך\s*(ה)?סדנ[אה]/i.test(line));
    if (durationIdx >= 0) {
        durationLine = lines[durationIdx].replace(/^\*+\s*/, '');
        bodyLines = lines.filter((_, i) => i !== durationIdx);
    }

    let paragraphs = bodyLines;
    if (paragraphs.length === 1 && paragraphs[0].length > 140) {
        paragraphs = paragraphs[0]
            .split(/(?<=[!.…])\s+/u)
            .map((s) => s.trim())
            .filter(Boolean);
        if (paragraphs.length > 3) {
            const mid = Math.ceil(paragraphs.length / 2);
            paragraphs = [
                paragraphs.slice(0, mid).join(' '),
                paragraphs.slice(mid).join(' '),
            ];
        }
    }

    const bodyHtml = paragraphs.map((part, i) => {
        const cls = i === 0 ? 'bl-desc-lead' : 'bl-desc-p';
        return `<p class="${cls}">${escapeHtml(part)}</p>`;
    }).join('');

    const durationHtml = durationLine
        ? `<div class="bl-desc-duration"><span class="bl-desc-duration-icon">⏱</span>${escapeHtml(durationLine)}</div>`
        : '';

    return `<div class="bl-desc-body">${bodyHtml}${durationHtml}</div>`;
}

/** Minimal Ricos (Rich Content) renderer: paragraphs, headings, lists, dividers, text decorations. */
function renderRicos(content) {
    if (!content) return '<p class="bl-price-placeholder">פרטי התמחור יתעדכנו בקרוב.</p>';
    if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch (e) { return `<p>${escapeHtml(content)}</p>`; }
    }
    const nodes = content && Array.isArray(content.nodes) ? content.nodes : null;
    if (!nodes) return '<p class="bl-price-placeholder">פרטי התמחור יתעדכנו בקרוב.</p>';

    function renderTextNode(node) {
        let text = escapeHtml(node.textData && node.textData.text);
        const decorations = (node.textData && node.textData.decorations) || [];
        decorations.forEach((d) => {
            if (d.type === 'BOLD') text = `<strong>${text}</strong>`;
            else if (d.type === 'ITALIC') text = `<em>${text}</em>`;
            else if (d.type === 'UNDERLINE') text = `<u>${text}</u>`;
        });
        return text;
    }

    function renderChildren(list) {
        return (list || []).map(renderNode).join('');
    }

    function renderNode(node) {
        if (!node || !node.type) return '';
        switch (node.type) {
            case 'TEXT':
                return renderTextNode(node);
            case 'PARAGRAPH':
                return `<p class="bl-rich-p">${renderChildren(node.nodes)}</p>`;
            case 'HEADING': {
                const level = Math.min(Math.max((node.headingData && node.headingData.level) || 3, 2), 4);
                return `<h${level} class="bl-rich-h">${renderChildren(node.nodes)}</h${level}>`;
            }
            case 'BULLETED_LIST':
                return `<ul class="bl-rich-ul">${renderChildren(node.nodes)}</ul>`;
            case 'ORDERED_LIST':
                return `<ol class="bl-rich-ol">${renderChildren(node.nodes)}</ol>`;
            case 'LIST_ITEM':
                return `<li>${renderChildren(node.nodes)}</li>`;
            case 'DIVIDER':
                return '<hr class="bl-rich-hr" />';
            default:
                return renderChildren(node.nodes);
        }
    }

    const html = renderChildren(nodes).trim();
    return html || '<p class="bl-price-placeholder">פרטי התמחור יתעדכנו בקרוב.</p>';
}

/** Pricing layout: intro on top, tier lines in a horizontal grid. */
function renderPricingDetails(content) {
    if (!content) return '<p class="bl-price-placeholder">פרטי התמחור יתעדכנו בקרוב.</p>';
    if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch (e) {
            return `<div class="bl-price-body"><p class="bl-rich-p">${escapeHtml(content)}</p></div>`;
        }
    }
    const nodes = content && Array.isArray(content.nodes) ? content.nodes : null;
    if (!nodes || !nodes.length) return '<p class="bl-price-placeholder">פרטי התמחור יתעדכנו בקרוב.</p>';

    function renderInline(node) {
        if (!node || !node.type) return '';
        if (node.type === 'TEXT') {
            let text = escapeHtml(node.textData && node.textData.text);
            (node.textData && node.textData.decorations || []).forEach((d) => {
                if (d.type === 'BOLD') text = `<strong>${text}</strong>`;
            });
            return text;
        }
        return (node.nodes || []).map(renderInline).join('');
    }

    let intro = '';
    const tiers = [];

    nodes.forEach((node) => {
        if (node.type === 'BULLETED_LIST' || node.type === 'ORDERED_LIST') {
            (node.nodes || []).forEach((li) => {
                const text = (li.nodes || []).map(renderInline).join('').trim();
                if (text) tiers.push(text);
            });
        } else if (node.type === 'PARAGRAPH' || node.type === 'HEADING') {
            const inner = (node.nodes || []).map(renderInline).join('').trim();
            if (!inner) return;
            const tag = node.type === 'HEADING'
                ? `h${Math.min(Math.max((node.headingData && node.headingData.level) || 3, 2), 4)}`
                : 'p';
            const cls = node.type === 'HEADING' ? 'bl-rich-h bl-price-intro' : 'bl-rich-p bl-price-intro';
            const block = `<${tag} class="${cls}">${inner}</${tag}>`;
            if (!intro) intro = block;
            else tiers.push(inner);
        }
    });

    if (!intro && !tiers.length) {
        return `<div class="bl-price-body">${renderRicos(content)}</div>`;
    }

    const tierHtml = tiers.length
        ? `<div class="bl-price-tiers">${tiers.map((t) => `<div class="bl-price-tier">${t}</div>`).join('')}</div>`
        : '';
    return `<div class="bl-price-body">${intro}${tierHtml}</div>`;
}

const BULLET_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-bullet-icon"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-faq-chevron"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SPINNER_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-spinner"><circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-dasharray="40 100"/></svg>`;
const FAB_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-fab-icon"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const WHATSAPP_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-faq-wa-icon"><path d="M12 2a10 10 0 00-8.7 14.9L2 22l5.3-1.3A10 10 0 1012 2z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 9.5c.3-.7 1-.7 1.3-.7h.3c.1 0 .3 0 .4.3l.6 1.4c.1.2 0 .5-.2.6l-.5.4c-.1.1-.1.3 0 .4.5.9 1.3 1.7 2.2 2.2.1.1.3.1.4 0l.4-.5c.1-.2.4-.3.6-.2l1.4.6c.3.1.3.3.3.4v.3c0 .3-.1 1-.7 1.3-.5.3-1.2.3-2.1-.1-.9-.4-1.8-1-2.6-1.8-.8-.8-1.4-1.7-1.8-2.6-.4-.9-.4-1.6-.1-2.1z" fill="#fff"/></svg>`;
const WHATSAPP_SUPPORT_PHONE = '972522272270';
const FORM_SUCCESS_MESSAGE = 'הפנייה נשלחה בהצלחה! נחזור אליכם טלפונית או בוואטסאפ עם פרטים נוספים בהקדם האפשרי.';
const CONFETTI_COLORS = ['#00A4FD', '#A56AF0', '#FF5FC0', '#F2AF49', '#35B89A', '#FFFFFF'];
const CONFETTI_CDN = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.browser.min.js';
const MIN_CHILDREN_COUNT = 15;
const FORM_ERROR_DISPLAY_MS = 5000;
const COUNTER_LIMITS = {
    childrenCount: { min: MIN_CHILDREN_COUNT, max: 60 },
    adultsCount: { min: 0, max: 50 },
};

const FEATURE_HIGHLIGHTS = [
    {
        title: 'יצירה אישית',
        subtitle: 'שחוזרים איתה הביתה',
        color: '#00A4FD',
        icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M5 19h14" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    },
    {
        title: 'שעה וחצי',
        subtitle: 'של כיף ויצירה',
        color: '#A56AF0',
        icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="2"/><path d="M12 8v5l3 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    },
    {
        title: 'מרפסת לעוגה',
        subtitle: 'לעוגה וחגיגה',
        color: '#FF5FC0',
        icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 14h16v2a4 4 0 01-4 4H8a4 4 0 01-4-4v-2z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M8 14V9.5a2 2 0 014 0V14M12 14V8.5a2 2 0 014 0V14" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M7 9c0-1.2 1-2.2 2.2-2.2.9 0 1.6.5 1.8 1.2M14 8c0-1.2 1-2.2 2.2-2.2.9 0 1.6.5 1.8 1.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="6.5" r="0.8" fill="#fff"/><circle cx="15" cy="6.5" r="0.8" fill="#fff"/></svg>',
    },
    {
        title: 'חומרים כלולים',
        subtitle: 'רק להגיע',
        color: '#35B89A',
        icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M8 7h8l1 12H7L8 7z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 7V5a2 2 0 014 0v2" stroke="#fff" stroke-width="2"/></svg>',
    },
    {
        title: 'חוויה קבוצתית',
        subtitle: 'חוגגים יחד בכיף',
        color: '#00A4FD',
        icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="#fff" stroke-width="2"/><circle cx="16" cy="10" r="2.5" stroke="#fff" stroke-width="2"/><path d="M4 19c0-2.5 2.2-4 5-4M13 19c0-1.8 1.6-3 3.5-3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    },
    {
        title: 'מיקום נגיש',
        subtitle: 'קל ונוח להגיע',
        color: '#A56AF0',
        icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11" r="2.5" stroke="#fff" stroke-width="2"/></svg>',
    },
];

/** Party add-ons (fixed catalog, mirrors backend/birthdayAddons.js — keep in sync). */
const BIRTHDAY_ADDONS = [
    {
        id: 'balloons',
        image: 'data:image/jpeg;base64,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',
        title: 'קישוטי בלוני הליום',
        pill: '#FF9BC8',
        description: '25 בלוני הליום מפוזרים ברחבי הסטודיו ומשתלבים בעיצוב הצבעוני והממותג של המקום.',
        price: 250,
        color: '#FF5FC0',
        icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="9" r="4" stroke="#fff" stroke-width="2"/><circle cx="16" cy="7" r="3" stroke="#fff" stroke-width="2"/><path d="M8 13v7M16 10v5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    },
    {
        id: 'candy-table',
        image: 'data:image/jpeg;base64,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',
        title: 'שולחן מתוקים וחטיפים',
        pill: '#FF7EB6',
        description: 'שולחן חגיגי עם סוכריות גומי ומרשמלו, במבה, ביסלי, תפוצ׳פס ועוד.',
        price: 800,
        color: '#A56AF0',
        icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="7" cy="8" r="2.5" stroke="#fff" stroke-width="2"/><circle cx="13" cy="6" r="2" stroke="#fff" stroke-width="2"/><circle cx="17" cy="11" r="2.2" stroke="#fff" stroke-width="2"/><circle cx="9" cy="15" r="2.3" stroke="#fff" stroke-width="2"/><circle cx="15" cy="17" r="1.8" stroke="#fff" stroke-width="2"/></svg>',
    },
    {
        id: 'crepe-station',
        image: 'data:image/jpeg;base64,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',
        title: 'עמדת קרפ צרפתי',
        pill: '#C9B3F7',
        description: 'עד 30 קרפים המוכנים במקום, עם שוקולד נוטלה או השחר, ותוספת שברן מקופלת.',
        price: 1000,
        color: '#F2AF49',
        icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="2"/><path d="M8 13c1.2 1.6 6.8 1.6 8 0" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    },
    {
        id: 'hotdog-station',
        image: 'data:image/jpeg;base64,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',
        title: 'עמדת נקניקיות חמות',
        pill: '#C7A6F2',
        description: '40 נקניקיות עוף איכותיות בלחמנייה, המוכנות במקום, במלוא האירוע ומוגשות נקניקיות חמות וטריות.',
        price: 1000,
        color: '#35B89A',
        icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="10" width="18" height="5" rx="2.5" stroke="#fff" stroke-width="2"/><path d="M6 10V8a2 2 0 012-2h8a2 2 0 012 2v2" stroke="#fff" stroke-width="2"/></svg>',
    },
    {
        id: 'popcorn-machine',
        image: 'data:image/jpeg;base64,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',
        title: 'מכונת פופקורן',
        pill: '#F6C85A',
        description: 'פופקורן חם וטרי שמוכן במקום, מונחה על ידי האירועון.',
        price: 300,
        color: '#00A4FD',
        icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 10h12l-1.5 10h-9L6 10z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M8 10l1-5M12 10V5M16 10l-1-5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    },
    {
        id: 'slush',
        image: 'data:image/jpeg;base64,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',
        title: 'ברד',
        pill: '#7ED3F7',
        description: 'ברד קר ומרענן לאורך כל החגיגה.',
        price: 200,
        color: '#FF5FC0',
        icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 4h6l-1 5h2l-5 11-1-8H8l1-8z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
    },
];
const BIRTHDAY_ADDONS_BY_ID = BIRTHDAY_ADDONS.reduce((map, a) => { map[a.id] = a; return map; }, {});
function formatAddonPrice(price) {
    return `${Number(price || 0).toLocaleString('he-IL')} ₪`;
}

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HE_WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function todayParts() {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() };
}

function toIsoDate(y, m, day) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    return { y: Number(match[1]), m: Number(match[2]) - 1, day: Number(match[3]) };
}

function isBeforeToday(y, m, day) {
    const t = todayParts();
    if (y !== t.y) return y < t.y;
    if (m !== t.m) return m < t.m;
    return day < t.day;
}

function formatDisplayDate(iso) {
    const parts = parseIsoDate(iso);
    if (!parts) return '';
    return `${String(parts.day).padStart(2, '0')}/${String(parts.m + 1).padStart(2, '0')}/${parts.y}`;
}

const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;600;800&family=Quicksand:wght@400;600;800&family=Varela+Round&family=Rubik:wght@400;600;800&display=swap');

    :host, .bl-root { all: initial; }
    :host { display: block; }
    .bl-root {
        display: block;
        position: relative;
        overflow: hidden;
        direction: rtl;
        font-family: 'Quicksand', 'Varela Round', 'Rubik', Arial, sans-serif;
        color: #262626;
        background: #F9FBFD;
        box-sizing: border-box;
        padding-bottom: 40px;
    }
    .bl-root *, .bl-root *::before, .bl-root *::after { box-sizing: border-box; }
    .bl-root h1, .bl-root h2, .bl-root h3, .bl-root h4 {
        font-family: 'Baloo 2', 'Varela Round', 'Rubik', Arial, sans-serif;
        font-weight: 800;
        margin: 0;
        color: #262626;
    }
    .bl-root p, .bl-root span, .bl-root label, .bl-root button, .bl-root input,
    .bl-root textarea, .bl-root select { font-family: 'Quicksand', 'Varela Round', 'Rubik', Arial, sans-serif; }
    .bl-root button { cursor: pointer; }

    /* Floating background layer */
    .bl-bg-layer {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        z-index: 0;
    }
    .bl-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(3px);
        opacity: 0.14;
        pointer-events: none;
        animation: bl-float-a 11s ease-in-out infinite;
        will-change: transform;
    }
    .bl-blob[data-anim="b"] { animation-name: bl-float-b; }
    .bl-blob[data-anim="c"] { animation-name: bl-drift; }
    .bl-bg-shape {
        position: absolute;
        pointer-events: none;
        opacity: 0.2;
        will-change: transform;
        animation: bl-float-b 13s ease-in-out infinite;
    }
    .bl-bg-shape[data-anim="a"] { animation-name: bl-float-a; }
    .bl-bg-shape[data-anim="c"] { animation-name: bl-drift; }
    .bl-bg-shape[data-anim="orbit"] { animation-name: bl-orbit; }
    .bl-bg-ring {
        border-radius: 50%;
        border: 3px solid currentColor;
        background: transparent;
        box-sizing: border-box;
    }
    .bl-bg-dot {
        border-radius: 50%;
        filter: blur(1px);
    }
    .bl-bg-plus {
        position: relative;
        color: inherit;
    }
    .bl-bg-plus::before,
    .bl-bg-plus::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        background: currentColor;
        border-radius: 999px;
        transform: translate(-50%, -50%);
    }
    .bl-bg-plus::before { width: 100%; height: 22%; }
    .bl-bg-plus::after { width: 22%; height: 100%; }
    .bl-bg-spark {
        clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 72%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    }
    @keyframes bl-float-a {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(14px, -20px) scale(1.05); }
        66% { transform: translate(-10px, -32px) scale(0.97); }
    }
    @keyframes bl-float-b {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(-16px, 22px) rotate(10deg); }
    }
    @keyframes bl-drift {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(28px, -16px); }
    }
    @keyframes bl-orbit {
        0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
        50% { transform: translate(12px, 18px) rotate(160deg) scale(1.08); }
    }
    @media (prefers-reduced-motion: reduce) {
        .bl-blob, .bl-bg-shape, .bl-bg-brand { animation: none !important; }
    }
    @media (max-width: 900px) {
        .bl-blob { opacity: 0.11; filter: blur(4px); }
        .bl-bg-shape { opacity: 0.16; }
        .bl-bg-brand { opacity: calc(var(--bl-brand-opacity, 0.3) * 0.85); }
    }
    .bl-bg-brand {
        position: absolute;
        pointer-events: none;
        border-radius: 50%;
        overflow: hidden;
        opacity: var(--bl-brand-opacity, 0.3);
        animation: bl-float-b 15s ease-in-out infinite;
        will-change: transform;
        box-shadow: 0 8px 22px rgba(102, 34, 136, 0.1);
    }
    .bl-bg-brand[data-anim="a"] { animation-name: bl-float-a; }
    .bl-bg-brand[data-anim="c"] { animation-name: bl-drift; }
    .bl-bg-brand[data-anim="orbit"] { animation-name: bl-orbit; }
    .bl-bg-brand img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    /* ---------- Hero logo ---------- */
    .bl-hero-logo {
        display: block;
        height: 90px;
        width: auto;
        max-width: min(503px, 92%);
        object-fit: contain;
        margin: 0 0 16px;
        align-self: flex-start;
        filter: drop-shadow(0 4px 14px rgba(38, 38, 38, 0.08));
    }

    .bl-section { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; padding: 0 20px; }

    /* ---------- Hero ---------- */
    .bl-hero {
        display: grid;
        grid-template-columns: 1fr 1.15fr;
        gap: 28px;
        align-items: center;
        padding: 32px 20px 16px;
        max-width: 1180px;
        margin: 0 auto;
        position: relative;
        z-index: 1;
    }
    .bl-hero-gallery-wrap {
        position: relative;
        padding: 18px 14px;
    }
    .bl-hero-card {
        position: absolute;
        border-radius: 28px;
        z-index: 0;
        width: 94%;
        height: 90%;
        opacity: 0.85;
    }
    .bl-hero-card-1 {
        background: #00A4FD;
        top: 0;
        right: 0;
        transform: rotate(5deg);
    }
    .bl-hero-card-2 {
        background: #FF5FC0;
        bottom: 0;
        left: 0;
        transform: rotate(-5deg);
    }
    .bl-hero-gallery {
        position: relative;
        z-index: 1;
        border-radius: 28px;
        overflow: hidden;
        aspect-ratio: 4 / 3;
        box-shadow: 0 16px 40px rgba(0, 164, 253, 0.18);
        background: #e9f4fc;
    }
    .bl-hero-gallery img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transition: opacity 1.1s ease-in-out;
    }
    .bl-hero-gallery img.is-active { opacity: 1; }
    .bl-hero-badge {
        position: absolute;
        bottom: 14px;
        right: 14px;
        background: #FF5FC0;
        color: #fff;
        font-weight: 800;
        font-size: 13px;
        padding: 8px 16px;
        border-radius: 999px;
        transform: rotate(2deg);
        box-shadow: 0 6px 14px rgba(255, 95, 192, 0.35);
        z-index: 2;
    }
    .bl-hero-text {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding-right: 44px;
    }
    .bl-hero-title { font-size: clamp(28px, 4vw, 44px); line-height: 1.15; }
    .bl-hero-brand {
        display: block;
        color: #00A4FD;
        margin-top: 4px;
    }
    .bl-hero-subtitle { font-size: 18px; color: #525252; font-weight: 600; }

    /* ---------- Top workshop nav (detail view) ---------- */
    .bl-topnav {
        position: sticky;
        top: 0;
        z-index: 100;
        background: rgba(249, 251, 253, 0.94);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(165, 106, 240, 0.14);
        box-shadow: 0 4px 18px rgba(37, 38, 38, 0.04);
    }
    .bl-topnav-inner {
        max-width: 1180px;
        margin: 0 auto;
        padding: 10px 20px;
        display: flex;
        align-items: center;
        gap: 14px;
    }
    .bl-topnav-logo-btn {
        flex-shrink: 0;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        line-height: 0;
    }
    .bl-topnav-logo-btn img {
        height: 44px;
        width: auto;
        max-width: 120px;
        object-fit: contain;
        display: block;
    }
    .bl-topnav-scroll {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
    }
    .bl-topnav-scroll::-webkit-scrollbar { display: none; }
    .bl-topnav-items {
        display: flex;
        flex-wrap: nowrap;
        gap: 10px;
        width: max-content;
        padding: 2px 0;
    }
    .bl-topnav-item {
        flex-shrink: 0;
        border: 2px solid #A56AF0;
        background: #fff;
        color: #262626;
        font-weight: 800;
        font-size: 13px;
        padding: 9px 16px;
        border-radius: 999px;
        white-space: nowrap;
        transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    }
    .bl-topnav-item:hover { transform: translateY(-1px); }
    .bl-topnav-item.is-active {
        background: linear-gradient(135deg, #00A4FD, #A56AF0);
        color: #fff;
        border-color: transparent;
        box-shadow: 0 6px 16px rgba(165, 106, 240, 0.32);
    }
    @media (min-width: 901px) {
        .bl-topnav-items { flex-wrap: wrap; width: auto; max-width: 100%; }
        .bl-topnav-item { font-size: 14px; padding: 10px 18px; }
    }

    /* ---------- Description card ---------- */
    .bl-desc-card {
        background: #fff;
        border-radius: 28px;
        padding: 32px 36px 28px;
        margin: 36px auto 0;
        max-width: 1140px;
        box-shadow: 0 10px 30px rgba(37, 38, 38, 0.06);
        border: 3px solid #F2AF49;
        position: relative;
        z-index: 1;
    }
    .bl-desc-card h2 {
        font-size: 26px;
        margin: 0 0 8px;
        color: #4097C3;
        text-align: center;
    }
    .bl-desc-subtitle {
        text-align: center;
        font-size: 17px;
        font-weight: 700;
        color: #FF5FC0;
        margin: 0 0 18px;
    }
    .bl-desc-body {
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-width: 860px;
        margin: 0 auto;
        text-align: center;
    }
    .bl-desc-lead {
        font-size: 18px;
        line-height: 1.8;
        color: #262626;
        font-weight: 700;
        margin: 0;
    }
    .bl-desc-p {
        font-size: 16px;
        line-height: 1.85;
        color: #525252;
        font-weight: 600;
        margin: 0;
    }
    .bl-desc-empty {
        text-align: center;
        font-size: 16px;
        color: #525252;
        font-weight: 600;
        margin: 0;
    }
    .bl-desc-duration {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 6px;
        padding: 10px 20px;
        border-radius: 999px;
        background: linear-gradient(135deg, #fff8ed 0%, #fff 100%);
        border: 2px solid #F2AF49;
        color: #262626;
        font-weight: 800;
        font-size: 15px;
        align-self: center;
        box-shadow: 0 4px 14px rgba(242, 175, 73, 0.15);
    }
    .bl-desc-duration-icon { font-size: 16px; line-height: 1; }
    /* ---------- Marquee strip (width aligned with .bl-desc-card) ---------- */
    .bl-marquee-section {
        position: relative;
        z-index: 1;
        max-width: 1140px;
        width: 100%;
        margin: 36px auto 0;
    }
    .bl-marquee-wrap {
        position: relative;
        overflow: hidden;
        transform: rotate(-2deg);
        direction: ltr;
        border-radius: 24px;
    }
    .bl-marquee-track {
        display: flex;
        gap: 14px;
        width: max-content;
        animation: bl-infinite-scroll 40s linear infinite;
        will-change: transform;
        padding: 8px 0;
    }
    @keyframes bl-infinite-scroll {
        from { transform: translate3d(0, 0, 0); }
        to { transform: translate3d(-50%, 0, 0); }
    }
    @media (prefers-reduced-motion: reduce) {
        .bl-marquee-track { animation: none; }
    }
    .bl-marquee-track img {
        height: 180px;
        width: 264px;
        object-fit: cover;
        border-radius: 20px;
        border: 4px solid #fff;
        box-shadow: 0 8px 18px rgba(0,0,0,0.12);
        flex-shrink: 0;
    }
    .bl-marquee-edge {
        position: absolute;
        top: 0;
        bottom: 0;
        width: min(26%, 150px);
        z-index: 2;
        pointer-events: none;
    }
    .bl-marquee-edge-start {
        left: 0;
        background: linear-gradient(to right, #F9FBFD 0%, rgba(249, 251, 253, 0.92) 40%, transparent 100%);
    }
    .bl-marquee-edge-end {
        right: 0;
        background: linear-gradient(to left, #F9FBFD 0%, rgba(249, 251, 253, 0.92) 40%, transparent 100%);
    }

    /* ---------- Scroll-reveal (mobile) ---------- */
    @media (max-width: 900px) {
        .bl-reveal {
            opacity: 0;
            transform: translateY(28px);
            transition:
                opacity 0.65s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.65s cubic-bezier(0.22, 1, 0.36, 1);
            transition-delay: var(--bl-delay, 0ms);
            will-change: opacity, transform;
        }
        .bl-reveal.is-visible {
            opacity: 1;
            transform: translateY(0);
        }
        .bl-marquee-section { margin: 28px auto 0; }
        .bl-marquee-wrap { transform: rotate(-1.5deg); }
        .bl-marquee-edge { width: min(18%, 72px); }
        .bl-marquee-edge-start {
            background: linear-gradient(to right, #F9FBFD 0%, rgba(249, 251, 253, 0.9) 55%, transparent 100%);
        }
        .bl-marquee-edge-end {
            background: linear-gradient(to left, #F9FBFD 0%, rgba(249, 251, 253, 0.9) 55%, transparent 100%);
        }
        .bl-marquee-track {
            gap: 16px;
            animation-duration: 34s;
        }
        .bl-marquee-track img {
            height: 228px;
            width: 336px;
            border-radius: 22px;
            border-width: 5px;
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .bl-reveal {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
        }
    }

    /* ---------- Pricing & important info ---------- */
    .bl-stack-cards {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-top: 10px;
    }
    .bl-card {
        background: #fff;
        border-radius: 24px;
        padding: 26px 28px;
        box-shadow: 0 10px 28px rgba(37, 38, 38, 0.06);
        width: 100%;
    }
    .bl-price-card { border-top: 6px solid #00A4FD; }
    .bl-price-card h2 { color: #00A4FD; font-size: 22px; margin-bottom: 16px; text-align: center; }
    .bl-price-body { display: flex; flex-direction: column; gap: 18px; }
    .bl-price-intro { text-align: center; font-size: 17px; font-weight: 800; color: #262626; margin: 0; }
    .bl-price-tiers {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
    }
    .bl-price-tier {
        background: linear-gradient(180deg, #f9fbfd 0%, #fff 100%);
        border: 2px solid #e3f4fc;
        border-radius: 18px;
        padding: 18px 14px;
        text-align: center;
        font-weight: 700;
        font-size: 15px;
        line-height: 1.55;
        color: #525252;
        box-shadow: 0 4px 14px rgba(0, 164, 253, 0.08);
        transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .bl-price-tier:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 20px rgba(0, 164, 253, 0.14);
    }
    .bl-price-body .bl-rich-ul {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .bl-price-body .bl-rich-ul li {
        background: linear-gradient(180deg, #f9fbfd 0%, #fff 100%);
        border: 2px solid #e3f4fc;
        border-radius: 18px;
        padding: 18px 14px;
        text-align: center;
        font-weight: 700;
        font-size: 15px;
        line-height: 1.55;
        color: #525252;
    }
    .bl-rich-p { margin: 0 0 10px; font-size: 15px; line-height: 1.7; color: #525252; font-weight: 600; }
    .bl-rich-h { font-size: 18px; margin: 14px 0 8px; color: #262626; }
    .bl-rich-ul, .bl-rich-ol { margin: 0 0 12px; padding-inline-start: 22px; color: #525252; font-weight: 600; }
    .bl-rich-hr { border: none; border-top: 2px dashed #F2AF49; margin: 14px 0; }
    .bl-price-placeholder { color: #525252; font-weight: 600; }

    .bl-info-card { border-top: 6px solid #F2AF49; }
    .bl-info-card h2 { color: #F2AF49; font-size: 22px; margin-bottom: 14px; }
    .bl-info-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .bl-info-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; font-weight: 600; color: #525252; }
    .bl-bullet {
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #35B89A;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .bl-bullet-icon { width: 14px; height: 14px; }

    /* ---------- Feature highlights ---------- */
    .bl-highlights-section { margin-top: 36px; }
    .bl-highlights-section h2 { text-align: center; font-size: 26px; margin-bottom: 22px; color: #262626; }
    .bl-highlights-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 16px;
    }
    .bl-highlight-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        text-align: center;
    }
    .bl-highlight-icon-wrap {
        width: 72px;
        height: 72px;
        border-radius: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 24px rgba(37, 38, 38, 0.1);
        transition: transform 0.22s ease, box-shadow 0.22s ease;
    }
    .bl-highlight-icon-wrap svg { width: 32px; height: 32px; }
    .bl-highlight-item:hover .bl-highlight-icon-wrap {
        transform: translateY(-4px) rotate(-2deg);
        box-shadow: 0 14px 28px rgba(0, 164, 253, 0.22);
    }
    .bl-highlight-title {
        font-size: 14px;
        font-weight: 800;
        color: #262626;
        line-height: 1.35;
    }
    .bl-highlight-sub {
        font-size: 12px;
        font-weight: 600;
        color: #525252;
        line-height: 1.4;
        max-width: 120px;
    }

    /* ---------- Add-ons ---------- */
    .bl-addons-section { margin-top: 36px; }
    .bl-addons-section h2 { text-align: center; font-size: 26px; margin-bottom: 8px; color: #262626; }
    .bl-addons-sub { text-align: center; font-size: 15px; font-weight: 600; color: #525252; margin: 0 0 22px; }
    .bl-addons-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
    }
    .bl-addon-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        text-align: center;
        gap: 0;
        overflow: hidden;
        background: #fff;
        border: 2px solid #f3eef8;
        border-radius: 26px;
        padding: 0 0 16px;
        cursor: pointer;
        box-shadow: 0 10px 24px rgba(37, 38, 38, 0.06);
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }
    .bl-addon-card:hover { transform: translateY(-3px); box-shadow: 0 14px 28px rgba(37, 38, 38, 0.1); }
    .bl-addon-card.is-selected { border-color: #A56AF0; box-shadow: 0 10px 26px rgba(165, 106, 240, 0.22); }
    .bl-addon-check {
        position: absolute;
        top: 12px;
        inset-inline-end: 12px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #A56AF0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.6);
        transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .bl-addon-check svg { width: 12px; height: 12px; }
    .bl-addon-card.is-selected .bl-addon-check { opacity: 1; transform: scale(1); }
    .bl-addon-photo {
        display: block;
        height: 148px;
        margin: 0;
        background-image: var(--addon-photo);
        background-size: cover;
        background-position: center;
        border-radius: 22px 22px 18px 18px;
    }
    .bl-addon-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        margin-top: -18px;
        padding: 0 14px;
        position: relative;
        z-index: 1;
    }
    .bl-addon-title {
        display: inline-block;
        max-width: 100%;
        background: var(--addon-pill, #C9B3F7);
        color: #fff;
        font-size: 15px;
        font-weight: 800;
        line-height: 1.3;
        padding: 8px 16px;
        border-radius: 999px;
        box-shadow: 0 6px 16px rgba(37, 38, 38, 0.1);
    }
    .bl-addon-desc { font-size: 12.5px; font-weight: 600; color: #525252; line-height: 1.5; }
    .bl-addon-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 8px;
        margin-top: 2px;
    }
    .bl-addon-glyph { width: 40px; height: 40px; flex-shrink: 0; color: var(--addon-pill, #C9B3F7); }
    .bl-addon-glyph svg { width: 100%; height: 100%; }
    .bl-addon-glyph svg * { stroke: currentColor; }
    .bl-addon-price {
        background: var(--addon-pill, #C9B3F7);
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        line-height: 1;
        padding: 8px 14px;
        border-radius: 999px;
        margin-top: 0;
    }

    /* ---------- FAQ ---------- */
    .bl-faq-section { margin-top: 30px; }
    .bl-faq-section h2 { text-align: center; font-size: 26px; margin-bottom: 18px; color: #262626; }
    .bl-faq-item {
        background: #fff;
        border-radius: 18px;
        margin-bottom: 12px;
        box-shadow: 0 6px 18px rgba(37, 38, 38, 0.05);
        overflow: hidden;
    }
    .bl-faq-question {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        background: none;
        border: none;
        padding: 18px 20px;
        font-size: 16px;
        font-weight: 800;
        color: #262626;
        text-align: right;
        transition: color 0.2s ease;
    }
    .bl-faq-item.is-open .bl-faq-question { color: #00A4FD; }
    .bl-faq-q-content {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
        text-align: right;
    }
    .bl-faq-num {
        flex-shrink: 0;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, #A56AF0, #00A4FD);
        color: #fff;
        font-size: 13px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .bl-faq-q-text { flex: 1; min-width: 0; }
    .bl-faq-item.is-open .bl-faq-num { background: linear-gradient(135deg, #00A4FD, #35B89A); }
    .bl-faq-chevron {
        width: 20px; height: 20px; color: #A56AF0; flex-shrink: 0;
        transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease;
    }
    .bl-faq-item.is-open .bl-faq-chevron { transform: rotate(180deg); color: #00A4FD; }
    .bl-faq-answer {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.38s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .bl-faq-item.is-open .bl-faq-answer { grid-template-rows: 1fr; }
    .bl-faq-answer-inner {
        overflow: hidden;
        padding: 0 20px;
        font-size: 15px;
        line-height: 1.7;
        color: #525252;
        font-weight: 600;
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity 0.32s ease, transform 0.32s ease, padding 0.38s ease;
    }
    .bl-faq-item.is-open .bl-faq-answer-inner {
        padding: 0 20px 18px;
        opacity: 1;
        transform: translateY(0);
    }
    .bl-faq-whatsapp {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 4px;
        padding: 18px 22px;
        border-radius: 18px;
        background: #25D366;
        color: #fff;
        text-decoration: none;
        font-weight: 800;
        font-size: 16px;
        box-shadow: 0 8px 22px rgba(37, 211, 102, 0.35);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .bl-faq-whatsapp:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(37, 211, 102, 0.45);
    }
    .bl-faq-wa-icon { width: 24px; height: 24px; flex-shrink: 0; }

    /* ---------- Floating CTA ---------- */
    .bl-fab {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        border: none;
        border-radius: 999px;
        padding: 14px 20px 14px 16px;
        background: linear-gradient(135deg, #00A4FD, #A56AF0);
        color: #fff;
        font-weight: 800;
        font-size: 15px;
        box-shadow: 0 8px 28px rgba(165, 106, 240, 0.45);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .bl-fab:hover { transform: scale(1.06); box-shadow: 0 12px 32px rgba(0, 164, 253, 0.5); }
    .bl-fab-icon { width: 20px; height: 20px; flex-shrink: 0; }

    /* ---------- Lead form ---------- */
    .bl-form-section {
        margin-top: 44px;
        border-radius: 32px;
        padding: 36px 30px;
        background: linear-gradient(135deg, #00A4FD, #A56AF0 55%, #FF5FC0);
        color: #fff;
        position: relative;
        overflow: hidden;
    }
    .bl-form-section h2 { color: #fff; font-size: 28px; text-align: center; margin-bottom: 6px; }
    .bl-form-section .bl-form-sub { text-align: center; color: rgba(255,255,255,0.9); font-weight: 600; margin-bottom: 26px; }
    .bl-form-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 14px;
        max-width: 780px;
        margin: 0 auto;
    }
    .bl-field {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: rgba(255,255,255,0.16);
        border: 1px solid rgba(255,255,255,0.32);
        border-radius: 18px;
        padding: 12px;
    }
    .bl-field.bl-span-2 { grid-column: 1 / -1; }
    .bl-field label { font-size: 13px; font-weight: 800; color: #fff; line-height: 1.3; }
    .bl-req-mark { color: #FFE08A; margin-right: 3px; }
    .bl-field-hint { font-weight: 600; opacity: 0.8; font-size: 12px; }
    .bl-field input[type="text"], .bl-field input[type="email"], .bl-field input[type="tel"],
    .bl-field input[type="number"], .bl-field input[type="date"], .bl-field textarea, .bl-field select,
    .bl-date-trigger {
        width: 100%;
        min-height: 48px;
        border: none;
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 15px;
        font-weight: 600;
        color: #262626;
        font-family: 'Quicksand', 'Varela Round', Arial, sans-serif;
        outline: none;
        background: #fff;
        box-shadow: 0 4px 14px rgba(37, 38, 38, 0.08);
    }
    .bl-field input::placeholder, .bl-field textarea::placeholder { color: #9a9a9a; }
    .bl-field input:focus, .bl-field textarea:focus, .bl-date-trigger:focus {
        box-shadow: 0 0 0 3px rgba(255,255,255,0.7);
    }
    #blPhone { direction: ltr; text-align: right; }
    .bl-field textarea { resize: vertical; min-height: 96px; }
    .bl-date-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        text-align: right;
    }
    .bl-date-trigger.is-empty { color: #8a8a8a; }
    .bl-date-trigger svg { width: 18px; height: 18px; flex-shrink: 0; }
    .bl-cal {
        position: fixed;
        z-index: 10000;
        width: 280px;
        background: #fff;
        color: #262626;
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 16px 40px rgba(37, 38, 38, 0.18);
        font-family: 'Quicksand', 'Varela Round', 'Rubik', Arial, sans-serif;
    }
    .bl-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .bl-cal-head strong { font-size: 15px; }
    .bl-cal-nav {
        width: 32px; height: 32px; border: none; border-radius: 50%;
        background: #f4eefe; color: #A56AF0; font-size: 18px; font-weight: 800;
    }
    .bl-cal-nav:disabled { opacity: 0.35; }
    .bl-cal-week, .bl-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .bl-cal-week span { text-align: center; font-size: 12px; font-weight: 800; color: #A56AF0; padding: 4px 0; }
    .bl-cal-day {
        width: 34px; height: 34px; margin: 0 auto; border: none; border-radius: 50%;
        background: transparent; font-weight: 700; font-size: 13px; color: #262626;
    }
    .bl-cal-day:hover { background: #f4eefe; }
    .bl-cal-day.is-past { color: #c5c5c5; cursor: default; }
    .bl-cal-day.is-past:hover { background: transparent; }
    .bl-cal-day.is-today { box-shadow: inset 0 0 0 2px #A56AF0; }
    .bl-cal-day.is-selected { background: #A56AF0; color: #fff; box-shadow: none; }
    .bl-cal-empty { height: 34px; }
    .bl-multiselect { display: flex; flex-wrap: wrap; gap: 8px; }
    .bl-chip-option {
        border: 2px solid rgba(255,255,255,0.7);
        background: rgba(255,255,255,0.22);
        color: #fff;
        font-weight: 800;
        font-size: 13px;
        padding: 8px 14px;
        border-radius: 999px;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .bl-chip-option.is-selected { background: #fff; color: #A56AF0; border-color: #fff; }
    .bl-counter {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 48px;
        background: #fff;
        border-radius: 14px;
        padding: 6px 8px;
        box-shadow: 0 4px 14px rgba(37, 38, 38, 0.08);
    }
    .bl-counter button {
        width: 34px; height: 34px; border-radius: 50%; border: none;
        background: #f4eefe; color: #A56AF0; font-weight: 800; font-size: 18px;
        display: flex; align-items: center; justify-content: center;
    }
    .bl-counter input[type="number"] {
        width: 56px;
        min-height: 0;
        text-align: center;
        font-weight: 800;
        font-size: 16px;
        padding: 6px 4px;
        border-radius: 10px;
        border: none;
        color: #262626;
        background: transparent;
        box-shadow: none;
        -moz-appearance: textfield;
    }
    .bl-counter input[type="number"]::-webkit-outer-spin-button,
    .bl-counter input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .bl-form-success-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        padding: 36px 24px;
        text-align: center;
    }
    .bl-form-success-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: rgba(255,255,255,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        line-height: 1;
    }
    .bl-form-success-title {
        font-size: 22px;
        font-weight: 800;
        color: #fff;
        margin: 0;
    }
    .bl-form-success-text {
        font-size: 16px;
        font-weight: 600;
        color: rgba(255,255,255,0.95);
        line-height: 1.65;
        max-width: 520px;
        margin: 0;
    }

    .bl-checkbox-row { display: flex; align-items: flex-start; gap: 10px; }
    .bl-checkbox-row input { margin-top: 2px; width: 18px; height: 18px; accent-color: #A56AF0; flex-shrink: 0; }
    .bl-checkbox-row label { font-size: 13px; font-weight: 600; color: #fff; line-height: 1.45; }
    .bl-form-footer {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        max-width: 780px;
        margin: 22px auto 0;
        gap: 14px;
    }
    #blFormStatus:empty { display: none; }
    #blFormStatus:not(:empty) { display: block; }
    .bl-form-error {
        background: rgba(255,255,255,0.9);
        color: #b3261e;
        font-weight: 800;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        text-align: center;
    }
    .bl-form-success { background: rgba(255,255,255,0.95); color: #1a7a4c; font-weight: 800; padding: 14px 18px; border-radius: 14px; font-size: 15px; text-align: center; }
    .bl-submit-btn {
        width: 100%;
        border: none;
        border-radius: 999px;
        padding: 16px;
        font-size: 17px;
        font-weight: 800;
        color: #A56AF0;
        background: #fff;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        animation: bl-submit-pulse 2.8s ease-in-out infinite;
    }
    @keyframes bl-submit-pulse {
        0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 16px rgba(255, 255, 255, 0.25);
        }
        50% {
            transform: scale(1.015);
            box-shadow: 0 8px 28px rgba(255, 255, 255, 0.55);
        }
    }
    .bl-submit-btn:hover:not(:disabled) {
        animation-play-state: paused;
        transform: scale(1.03);
        box-shadow: 0 0 26px rgba(255, 255, 255, 0.75);
    }
    .bl-submit-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        animation: none;
    }
    @media (prefers-reduced-motion: reduce) {
        .bl-submit-btn { animation: none; }
    }
    .bl-spinner { width: 18px; height: 18px; animation: bl-spin 0.8s linear infinite; }
    @keyframes bl-spin { to { transform: rotate(360deg); } }

    .bl-empty { text-align: center; padding: 80px 20px; color: #525252; font-weight: 600; font-size: 16px; }

    .bl-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 20px 100px;
        gap: 20px;
    }
    .bl-loading-spinner {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 4px solid #e3f4fc;
        border-top-color: #00A4FD;
        animation: bl-spin 0.85s linear infinite;
    }
    .bl-loading-text { font-size: 16px; font-weight: 700; color: #525252; margin: 0; }
    .bl-loading-skeleton {
        width: min(520px, 100%);
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 8px;
    }
    .bl-skel {
        border-radius: 14px;
        background: linear-gradient(90deg, #eef3f8 25%, #f9fbfd 50%, #eef3f8 75%);
        background-size: 200% 100%;
        animation: bl-shimmer 1.4s ease-in-out infinite;
    }
    .bl-skel-hero { height: 120px; }
    .bl-skel-line { height: 16px; }
    .bl-skel-line.short { width: 60%; align-self: center; }
    @keyframes bl-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }

    @media (max-width: 900px) {
        .bl-hero { grid-template-columns: 1fr; }
        .bl-form-grid { grid-template-columns: 1fr; }
        .bl-highlights-grid { grid-template-columns: repeat(3, 1fr); }
        .bl-addons-grid { grid-template-columns: repeat(2, 1fr); }
        .bl-price-tiers, .bl-price-body .bl-rich-ul { grid-template-columns: 1fr; }
        .bl-topnav-inner { padding: 6px 12px; gap: 8px; }
        .bl-topnav-logo-btn img { height: 32px; max-width: 88px; }
        .bl-topnav-items { gap: 6px; }
        .bl-topnav-item {
            font-size: 11px;
            padding: 6px 10px;
            border-width: 1.5px;
            font-weight: 700;
        }
        .bl-topnav-item.is-active { box-shadow: 0 4px 10px rgba(165, 106, 240, 0.22); }
    }
    @media (max-width: 600px) {
        .bl-topnav-inner { padding: 5px 10px; gap: 6px; }
        .bl-topnav-logo-btn img { height: 28px; max-width: 72px; }
        .bl-topnav-item { font-size: 10px; padding: 5px 8px; }
        .bl-marquee-edge { width: min(14%, 52px); }
        .bl-marquee-track img { height: 210px; width: 306px; }
        .bl-desc-card, .bl-card, .bl-form-section { padding: 20px; }
        .bl-highlights-grid { grid-template-columns: repeat(2, 1fr); }
        .bl-addons-grid { grid-template-columns: 1fr; }
        .bl-fab { right: 16px; bottom: 16px; padding: 12px 16px; font-size: 14px; }
        .bl-hero-logo { height: 69px; margin-bottom: 12px; }
        .bl-hero-text { padding-right: 28px; }
        .bl-menu-grid { grid-template-columns: 1fr; }
    }

    /* ---------- Menu ( /birthday home ) ---------- */
    .bl-menu-page { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; padding: 32px 20px 48px; }
    .bl-menu-header { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-bottom: 32px; }
    .bl-menu-title { font-size: clamp(28px, 4vw, 40px); line-height: 1.15; }
    .bl-menu-subtitle { font-size: 18px; color: #525252; font-weight: 600; margin: 0; max-width: 640px; }
    .bl-menu-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
    }
    .bl-menu-card {
        background: #fff;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 10px 28px rgba(37, 38, 38, 0.08);
        cursor: pointer;
        transition: transform 0.28s ease, box-shadow 0.28s ease;
        display: flex;
        flex-direction: column;
        text-align: right;
    }
    .bl-menu-card:hover {
        transform: scale(1.03);
        box-shadow: 0 16px 36px rgba(0, 164, 253, 0.18);
    }
    .bl-menu-card-img-wrap {
        aspect-ratio: 4 / 3;
        overflow: hidden;
        background: #e9f4fc;
    }
    .bl-menu-card-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.4s ease;
    }
    .bl-menu-card:hover .bl-menu-card-img { transform: scale(1.1); }
    .bl-menu-card-body { padding: 20px 22px 22px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
    .bl-menu-card-title { font-size: 20px; color: #262626; margin: 0; }
    .bl-menu-card-desc {
        font-size: 15px;
        line-height: 1.65;
        color: #525252;
        font-weight: 600;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .bl-menu-card-btn {
        margin-top: auto;
        align-self: flex-start;
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        font-size: 14px;
        font-weight: 800;
        color: #fff;
        background: linear-gradient(135deg, #00A4FD, #A56AF0);
        pointer-events: none;
    }
`;

const BRAND_CIRCLE_IMG = 'https://static.wixstatic.com/media/6b73e9_6e7c52763bb24ba6812aaac51ecb4296~mv2.png';
const BRAND_LOGO_IMG = 'https://static.wixstatic.com/media/6b73e9_3d8054d68ecb422a82c328f8c4c163f3~mv2.png';

const BLOBS = [
    { top: '2%', left: '1%', size: 150, color: '#00A4FD', anim: 'a', duration: 11, delay: 0 },
    { top: '14%', right: '3%', size: 110, color: '#FF5FC0', anim: 'b', duration: 13, delay: 1.2 },
    { top: '32%', left: '4%', size: 95, color: '#A56AF0', anim: 'c', duration: 15, delay: 0.6 },
    { top: '48%', right: '6%', size: 130, color: '#35B89A', anim: 'a', duration: 12, delay: 2 },
    { top: '62%', left: '2%', size: 115, color: '#F2AF49', anim: 'b', duration: 14, delay: 0.3 },
    { top: '78%', right: '4%', size: 100, color: '#00A4FD', anim: 'c', duration: 16, delay: 1.8 },
    { top: '90%', left: '8%', size: 85, color: '#FF5FC0', anim: 'a', duration: 10, delay: 2.4 },
];

const BG_SHAPES = [
    { type: 'ring', top: '8%', right: '14%', size: 52, color: '#FF5FC0', anim: 'orbit', duration: 18, delay: 0 },
    { type: 'spark', top: '22%', left: '10%', size: 26, color: '#F2AF49', anim: 'a', duration: 9, delay: 0.5 },
    { type: 'dot', top: '38%', right: '10%', size: 18, color: '#00A4FD', anim: 'c', duration: 11, delay: 1 },
    { type: 'plus', top: '52%', left: '6%', size: 28, color: '#A56AF0', anim: 'b', duration: 12, delay: 0.2 },
    { type: 'ring', top: '66%', right: '12%', size: 40, color: '#35B89A', anim: 'c', duration: 14, delay: 1.5 },
    { type: 'spark', top: '74%', left: '12%', size: 22, color: '#FF5FC0', anim: 'orbit', duration: 16, delay: 0.8 },
    { type: 'dot', top: '84%', right: '8%', size: 14, color: '#F2AF49', anim: 'a', duration: 10, delay: 2 },
    { type: 'plus', top: '44%', right: '3%', size: 24, color: '#00A4FD', anim: 'orbit', duration: 17, delay: 1.2 },
    { type: 'ring', top: '28%', left: '3%', size: 34, color: '#A56AF0', anim: 'b', duration: 13, delay: 2.2 },
    { type: 'dot', top: '58%', left: '14%', size: 12, color: '#35B89A', anim: 'a', duration: 9, delay: 0.4 },
];

const BG_BRAND_CIRCLES = [
    { top: '5%', right: '1%', size: 92, anim: 'orbit', duration: 20, delay: 0, opacity: 0.34 },
    { top: '30%', left: '0%', size: 76, anim: 'b', duration: 17, delay: 1.2, opacity: 0.28 },
    { top: '55%', right: '3%', size: 88, anim: 'a', duration: 19, delay: 0.6, opacity: 0.3 },
    { top: '72%', left: '4%', size: 68, anim: 'c', duration: 15, delay: 1.8, opacity: 0.26 },
    { top: '92%', right: '7%', size: 80, anim: 'orbit', duration: 21, delay: 2.4, opacity: 0.24 },
];

const HERO_FADE_MS = 4200;
class BirthdayLandingElement extends HTMLElement {
    static get observedAttributes() {
        return ['workshops-data', 'lead-result', 'active-workshop-ref'];
    }

    constructor() {
        super();
        this._requestSeq = 0;
        this._heroTimer = null;
        this._formErrorTimer = null;
        this._confettiLoadPromise = null;
        this._state = {
            loading: true,
            dataLoaded: false,
            workshops: [],
            activeWorkshopRef: null,
            activeIndex: 0,
            heroImageIndex: 0,
            faqOpenIndex: null,
            submitting: false,
            submitError: null,
            submitSuccess: false,
            pendingRequestId: null,
            form: { workshopTypes: [], addons: [], preferredDate: '', childrenCount: MIN_CHILDREN_COUNT, adultsCount: 0, termsAccepted: true },
        };
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        this.setAttribute('lang', 'he');
        this.innerHTML = `<style>${STYLE}</style><div class="bl-root" id="blRoot"></div>`;
        this._root = this.querySelector('#blRoot');
        this._boundPopState = () => this._onPopState();
        window.addEventListener('popstate', this._boundPopState);
        this._hydrateFromAttribute();
        this._renderAll();
        this._bindEvents();
    }

    _hydrateFromAttribute() {
        const workshopRef = (this.getAttribute('active-workshop-ref') || '').trim();
        if (workshopRef) this._state.activeWorkshopRef = workshopRef;

        const raw = this.getAttribute('workshops-data');
        if (!raw) return;
        try {
            const data = JSON.parse(raw);
            this._state.workshops = Array.isArray(data.workshops) ? data.workshops : [];
            this._state.dataLoaded = true;
            this._state.loading = false;
            this._resolveActiveIndex();
        } catch (err) {
            console.error('[birthday-landing] failed to parse initial workshops-data:', err);
        }
    }

    disconnectedCallback() {
        if (this._heroTimer) clearInterval(this._heroTimer);
        this._clearFormErrorTimer();
        if (this._boundPopState) window.removeEventListener('popstate', this._boundPopState);
        if (this._revealObserver) {
            this._revealObserver.disconnect();
            this._revealObserver = null;
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'active-workshop-ref') {
            const ref = (newValue || '').trim();
            if (ref === (this._state.activeWorkshopRef || '')) return;
            this._state.activeWorkshopRef = ref || null;
            this._state.faqOpenIndex = null;
            this._resolveActiveIndex();
            if (this._root) { this._renderAll(); this._bindEvents(); }
            return;
        }
        if (!newValue || newValue === oldValue) return;
        if (name === 'workshops-data') {
            try {
                const data = JSON.parse(newValue);
                this._state.workshops = Array.isArray(data.workshops) ? data.workshops : [];
                this._state.dataLoaded = true;
                this._state.loading = false;
                this._state.heroImageIndex = 0;
                this._state.faqOpenIndex = null;
                this._resolveActiveIndex();
                if (this._root) { this._renderAll(); this._bindEvents(); }
            } catch (err) {
                console.error('[birthday-landing] failed to parse workshops-data:', err);
                this._state.dataLoaded = true;
                this._state.loading = false;
                if (this._root) this._renderAll();
            }
        } else if (name === 'lead-result') {
            try { this._handleLeadResult(JSON.parse(newValue)); } catch (err) {
                console.error('[birthday-landing] failed to parse lead-result:', err);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------

    _activeWorkshop() {
        return this._state.workshops[this._state.activeIndex] || null;
    }

    _findWorkshopIndexByRef(ref) {
        if (!ref) return -1;
        return this._state.workshops.findIndex((w) => workshopRefMatches(w, ref));
    }

    _findWorkshopIndex(workshopId) {
        return this._state.workshops.findIndex((w) => w._id === workshopId);
    }

    _resolveActiveIndex() {
        const idx = this._state.activeWorkshopRef
            ? this._findWorkshopIndexByRef(this._state.activeWorkshopRef)
            : -1;
        this._state.activeIndex = idx >= 0 ? idx : 0;
    }

    _isDetailView() {
        return !!(this._state.activeWorkshopRef && this._findWorkshopIndexByRef(this._state.activeWorkshopRef) >= 0);
    }

    _getMenuCardImage(workshop) {
        const source = workshop.menuCardImage
            || (Array.isArray(workshop.gallery) && workshop.gallery[0])
            || '';
        return optimizeMediaUrl(source, 640, 480);
    }

    _renderAll() {
        this._closeCalendar();
        if (this._heroTimer) clearInterval(this._heroTimer);
        const s = this._state;
        if (s.loading || !s.dataLoaded) {
            this._root.innerHTML = `${this._renderBackground()}${this._renderLoading()}`;
            return;
        }
        if (!s.workshops.length) {
            this._root.innerHTML = `${this._renderBackground()}<div class="bl-empty">אין כרגע סדנאות זמינות להצגה. נשמח לראותכם בקרוב!</div>`;
            return;
        }
        if (!this._isDetailView()) {
            this._root.innerHTML = `${this._renderBackground()}${this._renderMenu()}`;
            this._initRevealAnimations();
            return;
        }
        const active = this._activeWorkshop();
        this._ensureActiveWorkshopTypeSelected();
        this._root.innerHTML = h`
            ${this._renderBackground()}
            ${this._renderTopNav()}
            <header class="bl-hero">
                <div class="bl-hero-gallery-wrap">
                    <div class="bl-hero-card bl-hero-card-1" aria-hidden="true"></div>
                    <div class="bl-hero-card bl-hero-card-2" aria-hidden="true"></div>
                    <div class="bl-hero-gallery" id="blHeroGallery">${this._renderHeroImages(active)}</div>
                </div>
                <div class="bl-hero-text">
                    <h1 class="bl-hero-title">חוגגים יום הולדת ב<span class="bl-hero-brand">Studio Happy</span></h1>
                    <p class="bl-hero-subtitle" id="blActiveSubtitle">${escapeHtml(active.subtitle || '')}</p>
                </div>
            </header>
            <div id="blContent">${this._renderContent(active)}</div>
            <div class="bl-section" id="blFormSection">${this._renderForm()}</div>
            <button type="button" class="bl-fab" id="blFab" aria-label="גלילה לטופס הזמנה">${FAB_ICON}<span>להזמנה</span></button>
        `;
        this._startHeroFade();
        this._initRevealAnimations();
    }

    _renderMenu() {
        const cards = this._state.workshops.map((workshop, i) => {
            const imgSrc = this._getMenuCardImage(workshop);
            const preview = descriptionPreview(workshop.description);
            const imgHtml = imgSrc
                ? `<img class="bl-menu-card-img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(workshop.title || '')}" loading="lazy" decoding="async" />`
                : '<div class="bl-menu-card-img" style="background:linear-gradient(135deg,#e9f4fc,#f3e8ff);"></div>';
            return `
                <article class="bl-menu-card bl-reveal" data-workshop-id="${escapeHtml(workshop._id || '')}" style="--bl-delay:${Math.min(i, 5) * 70}ms" tabindex="0" role="button" aria-label="${escapeHtml(workshop.title || 'סדנה')}">
                    <div class="bl-menu-card-img-wrap">${imgHtml}</div>
                    <div class="bl-menu-card-body">
                        <h3 class="bl-menu-card-title">${escapeHtml(workshop.title || 'סדנה')}</h3>
                        <p class="bl-menu-card-desc">${escapeHtml(preview || 'פרטי הסדנה יתעדכנו בקרוב.')}</p>
                        <span class="bl-menu-card-btn">פרטים נוספים</span>
                    </div>
                </article>
            `;
        }).join('');

        return `
            <div class="bl-menu-page">
                <header class="bl-menu-header bl-reveal">
                    ${this._renderHeroLogo()}
                    <h1 class="bl-menu-title">חוגגים יום הולדת ב<span class="bl-hero-brand">Studio Happy</span></h1>
                    <p class="bl-menu-subtitle">בחרו את הסדנה המושלמת ליום ההולדת — לחצו על כרטיסייה לפרטים מלאים והזמנה</p>
                </header>
                <div class="bl-menu-grid">${cards}</div>
            </div>
        `;
    }

    _initRevealAnimations() {
        if (this._revealObserver) {
            this._revealObserver.disconnect();
            this._revealObserver = null;
        }

        const nodes = this._root.querySelectorAll('.bl-reveal');
        if (!nodes.length) return;

        const isMobile = window.matchMedia('(max-width: 900px)').matches;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!isMobile || reduceMotion) {
            nodes.forEach((el) => el.classList.add('is-visible'));
            return;
        }

        nodes.forEach((el) => el.classList.remove('is-visible'));

        this._revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                this._revealObserver.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

        nodes.forEach((el) => this._revealObserver.observe(el));
    }

    _renderLoading() {
        return `
            <div class="bl-loading" aria-live="polite" aria-busy="true">
                <div class="bl-loading-spinner"></div>
                <p class="bl-loading-text">טוען את הסדנאות...</p>
                <div class="bl-loading-skeleton">
                    <div class="bl-skel bl-skel-hero"></div>
                    <div class="bl-skel bl-skel-line"></div>
                    <div class="bl-skel bl-skel-line short"></div>
                </div>
            </div>
        `;
    }

    _renderBackground() {
        const posStyle = (item) => [
            item.top ? `top:${item.top};` : '',
            item.left ? `left:${item.left};` : '',
            item.right ? `right:${item.right};` : '',
            item.bottom ? `bottom:${item.bottom};` : '',
        ].join('');

        const animStyle = (item) => {
            const parts = [];
            if (item.duration) parts.push(`animation-duration:${item.duration}s`);
            if (item.delay) parts.push(`animation-delay:${item.delay}s`);
            return parts.join(';');
        };

        const blobs = BLOBS.map((b) => `
            <span class="bl-blob" data-anim="${b.anim || 'a'}" style="${posStyle(b)}width:${b.size}px;height:${b.size}px;background:${b.color};${animStyle(b)}"></span>
        `).join('');

        const shapes = BG_SHAPES.map((s) => {
            const cls = `bl-bg-shape bl-bg-${s.type}`;
            const bg = s.type === 'ring' ? '' : `background:${s.color};`;
            return `<span class="${cls}" data-anim="${s.anim || 'b'}" style="${posStyle(s)}width:${s.size}px;height:${s.size}px;color:${s.color};${bg}${animStyle(s)}"></span>`;
        }).join('');

        const brandCircles = BG_BRAND_CIRCLES.map((b) => `
            <span class="bl-bg-brand" data-anim="${b.anim || 'b'}" style="${posStyle(b)}width:${b.size}px;height:${b.size}px;--bl-brand-opacity:${b.opacity ?? 0.3};${animStyle(b)}">
                <img src="${BRAND_CIRCLE_IMG}" alt="" loading="lazy" decoding="async" />
            </span>
        `).join('');

        return `<div class="bl-bg-layer" aria-hidden="true">${blobs}${shapes}${brandCircles}</div>`;
    }

    _renderHeroLogo() {
        return `<img class="bl-hero-logo bl-reveal" src="${BRAND_LOGO_IMG}" alt="Studio Happy" loading="eager" decoding="async" />`;
    }

    _renderHeroImages(workshop) {
        const gallery = Array.isArray(workshop.gallery) ? workshop.gallery : [];
        if (!gallery.length) return '<div class="bl-hero-badge">✨ סטודיו Happy</div>';
        const imgs = gallery.slice(0, 8).map((entry, i) => {
            const src = optimizeMediaUrl(entry, 960, 720);
            if (!src) return '';
            const loading = i === 0 ? 'eager' : 'lazy';
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(mediaAlt(entry, workshop.title))}" class="${i === 0 ? 'is-active' : ''}" data-hero-img loading="${loading}" decoding="async" />`;
        }).join('');
        return `${imgs}<div class="bl-hero-badge">✨ סטודיו Happy</div>`;
    }

    _renderTopNav() {
        return `
            <nav class="bl-topnav bl-reveal" id="blTopNav" aria-label="ניווט סדנאות">
                <div class="bl-topnav-inner">
                    <button type="button" class="bl-topnav-logo-btn" id="blTopNavHome" aria-label="חזרה לכל הסדנאות">
                        <img src="${BRAND_LOGO_IMG}" alt="Studio Happy" loading="eager" decoding="async" />
                    </button>
                    <div class="bl-topnav-scroll">
                        <div class="bl-topnav-items" id="blTopNavItems">${this._renderWorkshopNavItems()}</div>
                    </div>
                </div>
            </nav>
        `;
    }

    _renderWorkshopNavItems() {
        return this._state.workshops.map((w, i) => `
            <button type="button" class="bl-topnav-item ${i === this._state.activeIndex ? 'is-active' : ''}" data-tab-index="${i}">
                ${escapeHtml(w.title || 'סדנה')}
            </button>
        `).join('');
    }

    _renderContent(workshop) {
        return h`
            <div class="bl-section">
                <div class="bl-desc-card bl-reveal">
                    <h2>${escapeHtml(workshop.title || '')}</h2>
                    ${workshop.subtitle ? `<p class="bl-desc-subtitle">${escapeHtml(workshop.subtitle)}</p>` : ''}
                    ${renderDescription(workshop.description)}
                </div>
            </div>
            ${this._renderMarquee(workshop)}
            <div class="bl-section">
                <div class="bl-stack-cards">
                    <div class="bl-card bl-price-card bl-reveal" style="--bl-delay: 80ms">
                        <h2>מחירים</h2>
                        ${renderPricingDetails(workshop.pricingDetails)}
                    </div>
                    <div class="bl-card bl-info-card bl-reveal" style="--bl-delay: 160ms">
                        <h2>חשוב לדעת</h2>
                        ${this._renderImportantInfo(workshop.importantInfo)}
                    </div>
                </div>
                ${this._renderHighlights()}
                ${this._renderAddons()}
                ${this._renderFaq(workshop.faqList)}
            </div>
        `;
    }

    _renderAddons() {
        const selected = this._state.form.addons || [];
        const cards = BIRTHDAY_ADDONS.map((addon, i) => `
            <button type="button" class="bl-addon-card bl-reveal ${selected.includes(addon.id) ? 'is-selected' : ''}" data-addon-id="${addon.id}" style="${addon.image ? `--addon-photo:url('${addon.image}');` : ''}--addon-pill:${addon.pill || addon.color};--bl-delay: ${Math.min(i, 5) * 60}ms" aria-pressed="${selected.includes(addon.id)}">
                <span class="bl-addon-check" aria-hidden="true">${BULLET_ICON}</span>
                <span class="bl-addon-photo" aria-hidden="true"></span>
                <span class="bl-addon-body">
                    <span class="bl-addon-title">${escapeHtml(addon.title)}</span>
                    <span class="bl-addon-desc">${escapeHtml(addon.description)}</span>
                    <span class="bl-addon-foot">
                        <span class="bl-addon-glyph" aria-hidden="true">${addon.icon}</span>
                        <span class="bl-addon-price">₪ ${Number(addon.price || 0).toLocaleString('he-IL')}</span>
                    </span>
                </span>
            </button>
        `).join('');
        return `
            <div class="bl-addons-section bl-reveal" style="--bl-delay: 40ms">
                <h2>רוצים להגיע ליום ההולדת כשהכול כבר מוכן?</h2>
                <p class="bl-addons-sub">בחרו את התוספות שמתאימות לכם ונדאג להכין את הכל מראש.</p>
                <div class="bl-addons-grid">${cards}</div>
                <p class="bl-addons-footer">בלי קניות, בלי הכנות, בלי לסחוב</p>
            </div>
        `;
    }

    _renderHighlights() {
        const items = FEATURE_HIGHLIGHTS.map((item, i) => `
            <div class="bl-highlight-item bl-reveal" style="--bl-delay: ${Math.min(i, 5) * 70}ms">
                <div class="bl-highlight-icon-wrap" style="background:${item.color};">${item.icon}</div>
                <span class="bl-highlight-title">${escapeHtml(item.title)}</span>
                <span class="bl-highlight-sub">${escapeHtml(item.subtitle)}</span>
            </div>
        `).join('');
        return `
            <div class="bl-highlights-section bl-reveal" style="--bl-delay: 40ms">
                <h2>למה לחגוג אצלנו?</h2>
                <div class="bl-highlights-grid">${items}</div>
            </div>
        `;
    }

    _renderMarquee(workshop) {
        const gallery = Array.isArray(workshop.stripGallery) ? workshop.stripGallery : [];
        if (!gallery.length) return '';
        const tiles = gallery
            .map((entry) => ({ src: optimizeMediaUrl(entry, 672, 456), alt: mediaAlt(entry, workshop.title) }))
            .filter((t) => t.src);
        if (!tiles.length) return '';
        const renderTile = (t) => `<img src="${escapeHtml(t.src)}" alt="${escapeHtml(t.alt)}" loading="lazy" decoding="async" />`;
        const oneSet = tiles.map(renderTile).join('');
        return `
            <div class="bl-section">
                <div class="bl-marquee-section bl-reveal">
                    <div class="bl-marquee-wrap">
                        <div class="bl-marquee-track">${oneSet}${oneSet}</div>
                        <div class="bl-marquee-edge bl-marquee-edge-start" aria-hidden="true"></div>
                        <div class="bl-marquee-edge bl-marquee-edge-end" aria-hidden="true"></div>
                    </div>
                </div>
            </div>
        `;
    }

    _renderImportantInfo(list) {
        const items = Array.isArray(list) ? list : [];
        if (!items.length) return '<p class="bl-price-placeholder">פרטים נוספים יעודכנו בקרוב.</p>';
        return `<ul class="bl-info-list">${items.map((txt) => `
            <li><span class="bl-bullet">${BULLET_ICON}</span><span>${escapeHtml(txt)}</span></li>
        `).join('')}</ul>`;
    }

    _renderFaq(list) {
        const items = Array.isArray(list) ? list : [];
        if (!items.length) return '';
        const waText = encodeURIComponent('היי, יש לי שאלה לגבי ימי הולדת בסטודיו Happy');
        const waUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_SUPPORT_PHONE}&text=${waText}`;
        return `
            <div class="bl-faq-section bl-reveal" style="--bl-delay: 60ms">
                <h2>שאלות נפוצות</h2>
                ${items.map((item, i) => `
                    <div class="bl-faq-item bl-reveal ${this._state.faqOpenIndex === i ? 'is-open' : ''}" data-faq-index="${i}" style="--bl-delay: ${Math.min(i, 4) * 60}ms">
                        <button type="button" class="bl-faq-question" data-faq-toggle="${i}" aria-expanded="${this._state.faqOpenIndex === i}">
                            <span class="bl-faq-q-content">
                                <span class="bl-faq-num">${i + 1}</span>
                                <span class="bl-faq-q-text">${escapeHtml(item.question)}</span>
                            </span>
                            ${CHEVRON_ICON}
                        </button>
                        <div class="bl-faq-answer" aria-hidden="${this._state.faqOpenIndex !== i}">
                            <div class="bl-faq-answer-inner">${escapeHtml(item.answer)}</div>
                        </div>
                    </div>
                `).join('')}
                <a class="bl-faq-whatsapp bl-reveal" href="${waUrl}" target="_blank" rel="noopener noreferrer" style="--bl-delay: 120ms">
                    ${WHATSAPP_ICON}
                    <span>יש לך שאלות נוספות?</span>
                </a>
            </div>
        `;
    }

    _renderWorkshopTypeChips() {
        const workshopOptions = this._state.workshops.map((w) => w.title).filter(Boolean);
        const f = this._state.form;
        return workshopOptions.map((title) => `
            <button type="button" class="bl-chip-option ${f.workshopTypes.includes(title) ? 'is-selected' : ''}" data-workshop-type="${escapeHtml(title)}">${escapeHtml(title)}</button>
        `).join('');
    }

    _renderAddonChips() {
        const selected = this._state.form.addons || [];
        return BIRTHDAY_ADDONS.map((addon) => `
            <button type="button" class="bl-chip-option ${selected.includes(addon.id) ? 'is-selected' : ''}" data-addon-id="${addon.id}">${escapeHtml(addon.title)} (${formatAddonPrice(addon.price)})</button>
        `).join('');
    }

    _ensureActiveWorkshopTypeSelected() {
        const active = this._activeWorkshop();
        if (!active || !active.title) return;
        if (!this._state.form.workshopTypes.includes(active.title)) {
            this._state.form.workshopTypes.push(active.title);
        }
    }

    _renderForm() {
        const f = this._state.form;
        const req = '<span class="bl-req-mark" aria-hidden="true">*</span>';
        return h`
            <div class="bl-form-section bl-reveal" style="--bl-delay: 80ms">
                <h2>רוצים לחגוג אצלנו?</h2>
                <p class="bl-form-sub">מלאו פרטים ונחזור אליכם עם כל הפרטים לסדנה המושלמת</p>
                <form id="blLeadForm" class="bl-form-grid" novalidate>
                    <div class="bl-field">
                        <label for="blFullName">שם מלא${req}</label>
                        <input type="text" id="blFullName" name="fullName" placeholder="שם מלא" autocomplete="name" />
                    </div>
                    <div class="bl-field">
                        <label for="blEmail">אימייל${req}</label>
                        <input type="email" id="blEmail" name="email" placeholder="name@example.com" autocomplete="email" />
                    </div>
                    <div class="bl-field">
                        <label for="blPhone">טלפון${req}</label>
                        <input type="text" id="blPhone" name="phone" inputmode="tel" placeholder="050-0000000" autocomplete="tel" />
                    </div>
                    <div class="bl-field">
                        <label for="blDateTrigger">תאריך מועדף${req}</label>
                        <button type="button" class="bl-date-trigger ${f.preferredDate ? '' : 'is-empty'}" id="blDateTrigger" aria-haspopup="dialog">
                            <span id="blDateLabel">${f.preferredDate ? escapeHtml(formatDisplayDate(f.preferredDate)) : 'בחרו תאריך'}</span>
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="#A56AF0" stroke-width="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke="#A56AF0" stroke-width="2" stroke-linecap="round"/></svg>
                        </button>
                        <input type="hidden" id="blDate" name="preferredDate" value="${escapeHtml(f.preferredDate || '')}" />
                    </div>
                    <div class="bl-field bl-span-2">
                        <label>סוג סדנה מבוקש${req}</label>
                        <div class="bl-multiselect" id="blWorkshopTypes">${this._renderWorkshopTypeChips()}</div>
                    </div>
                    <div class="bl-field bl-span-2">
                        <label>תוספות (אופציונלי)</label>
                        <div class="bl-multiselect" id="blAddons">${this._renderAddonChips()}</div>
                    </div>
                    <div class="bl-field">
                        <label for="blChildrenCount">מספר ילדים${req} <span class="bl-field-hint">(מינימום ${MIN_CHILDREN_COUNT})</span></label>
                        <div class="bl-counter" data-counter="childrenCount">
                            <button type="button" data-counter-delta="-1" aria-label="הפחתת מספר ילדים">−</button>
                            <input type="number" id="blChildrenCount" min="${MIN_CHILDREN_COUNT}" max="${COUNTER_LIMITS.childrenCount.max}" value="${f.childrenCount}" data-counter-input inputmode="numeric" aria-label="מספר ילדים" />
                            <button type="button" data-counter-delta="1" aria-label="הוספת מספר ילדים">+</button>
                        </div>
                    </div>
                    <div class="bl-field">
                        <label for="blAdultsCount">מספר מבוגרים/מלווים</label>
                        <div class="bl-counter" data-counter="adultsCount">
                            <button type="button" data-counter-delta="-1" aria-label="הפחתת מספר מלווים">−</button>
                            <input type="number" id="blAdultsCount" min="${COUNTER_LIMITS.adultsCount.min}" max="${COUNTER_LIMITS.adultsCount.max}" value="${f.adultsCount}" data-counter-input inputmode="numeric" aria-label="מספר מלווים" />
                            <button type="button" data-counter-delta="1" aria-label="הוספת מספר מלווים">+</button>
                        </div>
                    </div>
                    <div class="bl-field bl-span-2">
                        <label for="blNotes">הערות / בקשות מיוחדות</label>
                        <textarea id="blNotes" name="notes" placeholder="ספרו לנו עוד..."></textarea>
                    </div>
                    <div class="bl-field bl-span-2">
                        <div class="bl-checkbox-row">
                            <input type="checkbox" id="blTerms" name="termsAccepted" ${f.termsAccepted ? 'checked' : ''} />
                            <label for="blTerms">קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות של הסטודיו</label>
                        </div>
                    </div>
                </form>
                <div class="bl-form-footer">
                    <button type="button" class="bl-submit-btn" id="blSubmitBtn">שליחה</button>
                    <div id="blFormStatus" role="alert" aria-live="polite"></div>
                </div>
            </div>
        `;
    }

    _renderFormSuccess(message) {
        const text = message || FORM_SUCCESS_MESSAGE;
        return `
            <div class="bl-form-section bl-reveal is-visible">
                <div class="bl-form-success-panel" role="status" aria-live="polite">
                    <div class="bl-form-success-icon" aria-hidden="true">✓</div>
                    <h2 class="bl-form-success-title">תודה על הפנייה!</h2>
                    <p class="bl-form-success-text">${escapeHtml(text)}</p>
                </div>
            </div>
        `;
    }

    // ---------------------------------------------------------------------
    // Hero auto-fade
    // ---------------------------------------------------------------------

    _startHeroFade() {
        const gallery = this._root.querySelector('#blHeroGallery');
        if (!gallery) return;
        const imgs = gallery.querySelectorAll('[data-hero-img]');
        if (imgs.length < 2) return;
        let idx = 0;
        this._heroTimer = setInterval(() => {
            idx = (idx + 1) % imgs.length;
            imgs.forEach((img, i) => img.classList.toggle('is-active', i === idx));
        }, HERO_FADE_MS);
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    _bindEvents() {
        if (this._boundClick) this._root.removeEventListener('click', this._boundClick);
        if (this._boundInput) this._root.removeEventListener('input', this._boundInput);
        if (this._boundChange) this._root.removeEventListener('change', this._boundChange);
        this._boundClick = (e) => this._onClick(e);
        this._boundInput = (e) => this._onCounterInput(e);
        this._boundChange = (e) => this._onCounterInput(e);
        this._root.addEventListener('click', this._boundClick);
        this._root.addEventListener('input', this._boundInput);
        this._root.addEventListener('change', this._boundChange);
    }

    _onClick(e) {
        const menuCard = e.target.closest('[data-workshop-id]');
        if (menuCard && menuCard.dataset.workshopId) {
            this._selectWorkshop(menuCard.dataset.workshopId);
            return;
        }

        if (e.target.closest('#blTopNavHome')) {
            this._clearWorkshop();
            return;
        }

        const tabBtn = e.target.closest('[data-tab-index]');
        if (tabBtn) { this._onTabClick(Number(tabBtn.dataset.tabIndex)); return; }

        const faqBtn = e.target.closest('[data-faq-toggle]');
        if (faqBtn) { this._onFaqToggle(Number(faqBtn.dataset.faqToggle)); return; }

        const typeBtn = e.target.closest('[data-workshop-type]');
        if (typeBtn) { this._onWorkshopTypeToggle(typeBtn); return; }

        const addonBtn = e.target.closest('[data-addon-id]');
        if (addonBtn) { this._onAddonToggle(addonBtn); return; }

        const counterBtn = e.target.closest('[data-counter-delta]');
        if (counterBtn) { this._onCounterChange(counterBtn); return; }

        if (e.target.closest('#blDateTrigger')) { this._toggleCalendar(e); return; }

        if (e.target.closest('#blSubmitBtn')) { this._onSubmit(); return; }

        if (e.target.closest('#blFab')) { this._scrollToForm(); }
    }

    _scrollToForm() {
        const target = this._root.querySelector('#blFormSection');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    _updateBrowserUrl(workshopRef, replace = false) {
        try {
            const url = new URL(window.location.href);
            if (workshopRef) url.searchParams.set(WORKSHOP_QUERY_KEY, workshopRef);
            else url.searchParams.delete(WORKSHOP_QUERY_KEY);
            const next = `${url.pathname}${url.search}${url.hash}`;
            const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            if (next === current) return;
            const state = { workshopRef: workshopRef || '' };
            if (replace) window.history.replaceState(state, '', next);
            else window.history.pushState(state, '', next);
        } catch (err) {
            console.warn('[birthday-landing] failed to update browser URL:', err);
        }
    }

    _applyWorkshopRef(ref) {
        const nextRef = (ref || '').trim() || null;
        if (nextRef === (this._state.activeWorkshopRef || null)) return;
        this._state.activeWorkshopRef = nextRef;
        this._state.faqOpenIndex = null;
        this._resolveActiveIndex();
        this._renderAll();
        this._bindEvents();
    }

    _onPopState() {
        this._applyWorkshopRef(readWorkshopRefFromUrl());
    }

    _selectWorkshop(workshopId) {
        const workshop = this._state.workshops[this._findWorkshopIndex(workshopId)];
        if (!workshop) return;
        const workshopRef = getWorkshopUrlRef(workshop);
        this._state.activeWorkshopRef = workshopRef;
        this._resolveActiveIndex();
        this._state.faqOpenIndex = null;
        this._renderAll();
        this._bindEvents();
        this._updateBrowserUrl(workshopRef, false);
        this.dispatchEvent(new CustomEvent('birthday-workshop-select', {
            detail: { workshopId: workshop._id, workshopRef },
            bubbles: true,
            composed: true,
        }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    _clearWorkshop() {
        this._state.activeWorkshopRef = null;
        this._state.faqOpenIndex = null;
        this._renderAll();
        this._bindEvents();
        this._updateBrowserUrl('', false);
        this.dispatchEvent(new CustomEvent('birthday-workshop-clear', {
            bubbles: true,
            composed: true,
        }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    _onTabClick(index) {
        if (index === this._state.activeIndex) return;
        this._state.activeIndex = index;
        const active = this._activeWorkshop();
        if (active) this._state.activeWorkshopRef = getWorkshopUrlRef(active);
        this._state.heroImageIndex = 0;
        this._state.faqOpenIndex = null;
        this._root.querySelectorAll('[data-tab-index]').forEach((btn) => {
            btn.classList.toggle('is-active', Number(btn.dataset.tabIndex) === index);
        });
        const activeNavBtn = this._root.querySelector('.bl-topnav-item.is-active');
        if (activeNavBtn) activeNavBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        const subtitleEl = this._root.querySelector('#blActiveSubtitle');
        if (subtitleEl) subtitleEl.textContent = active.subtitle || '';
        const galleryEl = this._root.querySelector('#blHeroGallery');
        if (galleryEl) galleryEl.innerHTML = this._renderHeroImages(active);
        const contentEl = this._root.querySelector('#blContent');
        if (contentEl) contentEl.innerHTML = this._renderContent(active);
        this._ensureActiveWorkshopTypeSelected();
        const chipsEl = this._root.querySelector('#blWorkshopTypes');
        if (chipsEl) chipsEl.innerHTML = this._renderWorkshopTypeChips();
        if (this._heroTimer) clearInterval(this._heroTimer);
        this._startHeroFade();
        this._initRevealAnimations();
        const workshopRef = getWorkshopUrlRef(active);
        this._updateBrowserUrl(workshopRef, true);
        this.dispatchEvent(new CustomEvent('birthday-tab-change', {
            detail: {
                workshopId: active._id || null,
                workshopRef,
                title: active.title || null,
            },
            bubbles: true,
            composed: true,
        }));
    }

    _onFaqToggle(index) {
        this._state.faqOpenIndex = this._state.faqOpenIndex === index ? null : index;
        this._root.querySelectorAll('.bl-faq-item').forEach((item) => {
            const isOpen = Number(item.dataset.faqIndex) === this._state.faqOpenIndex;
            item.classList.toggle('is-open', isOpen);
            const btn = item.querySelector('.bl-faq-question');
            const answer = item.querySelector('.bl-faq-answer');
            if (btn) btn.setAttribute('aria-expanded', String(isOpen));
            if (answer) answer.setAttribute('aria-hidden', String(!isOpen));
        });
    }

    _onWorkshopTypeToggle(btn) {
        const title = btn.dataset.workshopType;
        const list = this._state.form.workshopTypes;
        const idx = list.indexOf(title);
        if (idx >= 0) list.splice(idx, 1); else list.push(title);
        btn.classList.toggle('is-selected', idx < 0);
    }

    _onAddonToggle(btn) {
        const id = btn.dataset.addonId;
        const list = this._state.form.addons;
        const idx = list.indexOf(id);
        const nowSelected = idx < 0;
        if (nowSelected) list.push(id); else list.splice(idx, 1);
        // Both the display cards and the form chips share data-addon-id — keep all instances in sync.
        this._root.querySelectorAll(`[data-addon-id="${id}"]`).forEach((el) => {
            el.classList.toggle('is-selected', nowSelected);
            if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(nowSelected));
        });
    }

    _onCounterChange(btn) {
        const wrap = btn.closest('[data-counter]');
        const key = wrap.dataset.counter;
        const limits = COUNTER_LIMITS[key] || { min: 0, max: 50 };
        const delta = Number(btn.dataset.counterDelta);
        const next = Math.max(limits.min, Math.min(limits.max, (this._state.form[key] || limits.min) + delta));
        this._state.form[key] = next;
        const input = wrap.querySelector('[data-counter-input]');
        if (input) input.value = String(next);
    }

    _onCounterInput(e) {
        const input = e.target.closest('[data-counter-input]');
        if (!input) return;
        const wrap = input.closest('[data-counter]');
        const key = wrap.dataset.counter;
        const limits = COUNTER_LIMITS[key] || { min: 0, max: 50 };
        let val = parseInt(input.value, 10);
        if (Number.isNaN(val) || input.value === '') val = limits.min;
        val = Math.max(limits.min, Math.min(limits.max, val));
        this._state.form[key] = val;
        if (String(val) !== input.value) input.value = String(val);
    }

    _getCounterValue(key) {
        const limits = COUNTER_LIMITS[key] || { min: 0, max: 50 };
        const wrap = this._root.querySelector(`[data-counter="${key}"]`);
        const input = wrap && wrap.querySelector('[data-counter-input]');
        if (input) {
            const val = parseInt(input.value, 10);
            return Math.max(limits.min, Math.min(limits.max, Number.isNaN(val) ? limits.min : val));
        }
        return this._state.form[key] || limits.min;
    }

    // ---------------------------------------------------------------------
    // Lead form submission
    // ---------------------------------------------------------------------

    _toggleCalendar(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.querySelector('#blCalendar')) this._closeCalendar();
        else this._openCalendar();
    }

    _openCalendar() {
        const selected = parseIsoDate(this._state.form.preferredDate);
        const today = todayParts();
        const view = selected && !isBeforeToday(selected.y, selected.m, selected.day) ? selected : today;
        this._calView = { y: view.y, m: view.m };
        this._renderCalendar();
        this._calOutside = (ev) => {
            const cal = this.querySelector('#blCalendar');
            const trigger = this._root && this._root.querySelector('#blDateTrigger');
            if ((cal && cal.contains(ev.target)) || (trigger && trigger.contains(ev.target))) return;
            this._closeCalendar();
        };
        setTimeout(() => document.addEventListener('pointerdown', this._calOutside), 0);
    }

    _closeCalendar() {
        const cal = this.querySelector('#blCalendar');
        if (cal) cal.remove();
        if (this._calOutside) {
            document.removeEventListener('pointerdown', this._calOutside);
            this._calOutside = null;
        }
    }

    _shiftCalendar(delta) {
        let { y, m } = this._calView;
        m += delta;
        if (m < 0) { m = 11; y -= 1; }
        if (m > 11) { m = 0; y += 1; }
        this._calView = { y, m };
        this._renderCalendar();
    }

    _selectCalendarDay(iso) {
        this._state.form.preferredDate = iso;
        const hidden = this._root.querySelector('#blDate');
        const label = this._root.querySelector('#blDateLabel');
        const trigger = this._root.querySelector('#blDateTrigger');
        if (hidden) hidden.value = iso;
        if (label) label.textContent = formatDisplayDate(iso);
        if (trigger) trigger.classList.remove('is-empty');
        this._closeCalendar();
    }

    _renderCalendar() {
        const { y, m } = this._calView;
        const today = todayParts();
        const selected = this._state.form.preferredDate;
        const firstWeekday = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstWeekday; i++) cells.push('<span class="bl-cal-empty"></span>');
        for (let day = 1; day <= daysInMonth; day++) {
            const iso = toIsoDate(y, m, day);
            const isToday = y === today.y && m === today.m && day === today.day;
            if (isBeforeToday(y, m, day)) {
                cells.push(`<button type="button" class="bl-cal-day is-past" disabled>${day}</button>`);
                continue;
            }
            const classes = ['bl-cal-day', iso === selected ? 'is-selected' : '', isToday ? 'is-today' : ''].filter(Boolean).join(' ');
            cells.push(`<button type="button" class="${classes}" data-cal-day="${iso}">${day}</button>`);
        }
        const prevCal = this.querySelector('#blCalendar');
        if (prevCal) prevCal.remove();
        const cal = document.createElement('div');
        cal.id = 'blCalendar';
        cal.className = 'bl-cal';
        cal.setAttribute('role', 'dialog');
        cal.innerHTML = `
            <div class="bl-cal-head">
                <button type="button" class="bl-cal-nav" data-cal-shift="-1" aria-label="חודש קודם">‹</button>
                <strong>${HE_MONTHS[m]} ${y}</strong>
                <button type="button" class="bl-cal-nav" data-cal-shift="1" aria-label="חודש הבא">›</button>
            </div>
            <div class="bl-cal-week">${HE_WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
            <div class="bl-cal-grid">${cells.join('')}</div>
        `;
        cal.addEventListener('click', (ev) => {
            const shift = ev.target.closest('[data-cal-shift]');
            if (shift && !shift.disabled) { this._shiftCalendar(Number(shift.dataset.calShift)); return; }
            const dayBtn = ev.target.closest('[data-cal-day]');
            if (dayBtn) this._selectCalendarDay(dayBtn.dataset.calDay);
        });
        this.appendChild(cal);
        const trigger = this._root.querySelector('#blDateTrigger');
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const width = Math.max(280, rect.width);
        let left = rect.left;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        if (left < 8) left = 8;
        let top = rect.bottom + 6;
        if (top + 320 > window.innerHeight) top = Math.max(8, rect.top - 326);
        cal.style.width = `${width}px`;
        cal.style.left = `${left}px`;
        cal.style.top = `${top}px`;
    }

    _readFormValues() {
        const root = this._root;
        return {
            fullName: (root.querySelector('#blFullName').value || '').trim(),
            email: (root.querySelector('#blEmail').value || '').trim(),
            phone: (root.querySelector('#blPhone').value || '').trim(),
            preferredDate: root.querySelector('#blDate').value || '',
            notes: (root.querySelector('#blNotes').value || '').trim(),
            termsAccepted: !!root.querySelector('#blTerms').checked,
            workshopTypes: this._state.form.workshopTypes.slice(),
            addons: this._state.form.addons.slice(),
            childrenCount: this._getCounterValue('childrenCount'),
            adultsCount: this._getCounterValue('adultsCount'),
        };
    }

    _validate(values) {
        if (!values.fullName) return 'נא למלא שם מלא.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return 'נא להזין כתובת אימייל תקינה.';
        const phoneDigits = values.phone.replace(/\D/g, '');
        if (!/^05\d{8}$/.test(phoneDigits) && !/^9725\d{8}$/.test(phoneDigits)) {
            return 'נא לוודא שמספר הפלאפון תקין, מתחיל ב-05 ומכיל 10 ספרות.';
        }
        if (!values.preferredDate) return 'נא לבחור תאריך מועדף.';
        if (!values.workshopTypes || !values.workshopTypes.length) return 'נא לבחור סוג סדנה מבוקש.';
        if (!values.childrenCount || values.childrenCount < MIN_CHILDREN_COUNT) return `מספר הילדים המינימלי הוא ${MIN_CHILDREN_COUNT}.`;
        if (!values.termsAccepted) return 'יש לאשר את תנאי השימוש כדי להמשיך.';
        return null;
    }

    _clearFormErrorTimer() {
        if (this._formErrorTimer) {
            clearTimeout(this._formErrorTimer);
            this._formErrorTimer = null;
        }
    }

    _clearFormError() {
        this._clearFormErrorTimer();
        const statusEl = this._root && this._root.querySelector('#blFormStatus');
        if (statusEl) statusEl.innerHTML = '';
    }

    _showFormError(message) {
        const statusEl = this._root && this._root.querySelector('#blFormStatus');
        if (!statusEl) return;
        this._clearFormErrorTimer();
        statusEl.innerHTML = `<div class="bl-form-error">${escapeHtml(message)}</div>`;
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this._formErrorTimer = setTimeout(() => {
            this._formErrorTimer = null;
            if (statusEl) statusEl.innerHTML = '';
        }, FORM_ERROR_DISPLAY_MS);
    }

    _onSubmit() {
        if (this._state.submitting) return;
        const values = this._readFormValues();
        const error = this._validate(values);
        if (error) {
            this._showFormError(error);
            return;
        }
        this._clearFormError();
        this._state.submitting = true;
        this._state.submitError = null;
        this._state.submitSuccess = false;
        const requestId = `lead_${Date.now()}_${++this._requestSeq}`;
        this._state.pendingRequestId = requestId;
        const btn = this._root.querySelector('#blSubmitBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = `${SPINNER_ICON} שולח...`; }
        this.dispatchEvent(new CustomEvent('submitLead', {
            detail: { requestId, payload: values },
            bubbles: true,
            composed: true,
        }));
    }

    _loadConfettiLib() {
        if (typeof window.confetti === 'function') return Promise.resolve(window.confetti);
        if (this._confettiLoadPromise) return this._confettiLoadPromise;
        this._confettiLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = CONFETTI_CDN;
            script.async = true;
            script.onload = () => {
                if (typeof window.confetti === 'function') resolve(window.confetti);
                else reject(new Error('canvas-confetti failed to load'));
            };
            script.onerror = () => reject(new Error('canvas-confetti script failed'));
            document.head.appendChild(script);
        });
        return this._confettiLoadPromise;
    }

    _fireConfettiBurst(confetti, opts) {
        confetti({
            particleCount: opts.particleCount,
            angle: opts.angle,
            spread: opts.spread,
            startVelocity: opts.startVelocity,
            decay: 0.91,
            gravity: 1.05,
            ticks: 220,
            origin: opts.origin,
            colors: CONFETTI_COLORS,
            zIndex: 10001,
            disableForReducedMotion: true,
        });
    }

    async _launchConfetti() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        try {
            const confetti = await this._loadConfettiLib();
            this._fireConfettiBurst(confetti, {
                particleCount: 90,
                angle: 62,
                spread: 58,
                startVelocity: 52,
                origin: { x: 0, y: 0.62 },
            });
            this._fireConfettiBurst(confetti, {
                particleCount: 90,
                angle: 118,
                spread: 58,
                startVelocity: 52,
                origin: { x: 1, y: 0.62 },
            });
            setTimeout(() => {
                confetti({
                    particleCount: 55,
                    spread: 72,
                    startVelocity: 38,
                    decay: 0.92,
                    gravity: 1,
                    ticks: 180,
                    origin: { y: 0.58 },
                    colors: CONFETTI_COLORS,
                    zIndex: 10001,
                    disableForReducedMotion: true,
                });
            }, 180);
        } catch (err) {
            console.warn('[birthday-landing] confetti failed:', err);
        }
    }

    _handleLeadResult(result) {
        if (!result || result.requestId !== this._state.pendingRequestId) return;
        this._state.submitting = false;
        this._state.pendingRequestId = null;
        const btn = this._root.querySelector('#blSubmitBtn');
        if (result.ok) {
            this._clearFormError();
            this._state.submitSuccess = true;
            this._state.form = { workshopTypes: [], addons: [], preferredDate: '', childrenCount: MIN_CHILDREN_COUNT, adultsCount: 0, termsAccepted: true };
            const formSection = this._root.querySelector('#blFormSection');
            if (formSection) {
                formSection.innerHTML = this._renderFormSuccess(result.message);
                formSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            this._launchConfetti();
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'שליחה'; }
            this._showFormError(result.message || 'אירעה שגיאה בשליחת הפנייה. נסו שוב.');
        }
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, BirthdayLandingElement);
}
