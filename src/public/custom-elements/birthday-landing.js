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
 * תקשורת עם Velo (src/pages/ימי הולדת.ycwo5.js):
 *  - Velo -> CE: setAttribute('workshops-data', JSON.stringify({ workshops, __ts }))
 *              / setAttribute('lead-result', JSON.stringify({ requestId, ok, message }))
 *  - CE -> Velo: dispatchEvent('birthday-tab-change', { detail: { workshopId } })
 *              / dispatchEvent('submitLead', { detail: { requestId, payload } })
 */

const TAG_NAME = 'birthday-landing';

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

function mediaAlt(entry, fallback) {
    if (entry && typeof entry === 'object') return entry.title || entry.altText || entry.description || fallback || '';
    return fallback || '';
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

const BULLET_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-bullet-icon"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-faq-chevron"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SPINNER_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-spinner"><circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-dasharray="40 100"/></svg>`;
const FAB_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-fab-icon"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const WHATSAPP_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="bl-faq-wa-icon"><path d="M12 2a10 10 0 00-8.7 14.9L2 22l5.3-1.3A10 10 0 1012 2z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 9.5c.3-.7 1-.7 1.3-.7h.3c.1 0 .3 0 .4.3l.6 1.4c.1.2 0 .5-.2.6l-.5.4c-.1.1-.1.3 0 .4.5.9 1.3 1.7 2.2 2.2.1.1.3.1.4 0l.4-.5c.1-.2.4-.3.6-.2l1.4.6c.3.1.3.3.3.4v.3c0 .3-.1 1-.7 1.3-.5.3-1.2.3-2.1-.1-.9-.4-1.8-1-2.6-1.8-.8-.8-1.4-1.7-1.8-2.6-.4-.9-.4-1.6-.1-2.1z" fill="#fff"/></svg>`;
const WHATSAPP_SUPPORT_PHONE = '972522272270';

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

    /* Floating background blobs */
    .bl-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(2px);
        opacity: 0.16;
        z-index: 0;
        pointer-events: none;
        animation: bl-float 9s ease-in-out infinite;
    }
    @keyframes bl-float {
        0%, 100% { transform: translateY(0) translateX(0); }
        50% { transform: translateY(-22px) translateX(10px); }
    }
    @media (prefers-reduced-motion: reduce) {
        .bl-blob { animation: none; }
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
    .bl-hero-text { display: flex; flex-direction: column; gap: 14px; }
    .bl-hero-title { font-size: clamp(28px, 4vw, 44px); line-height: 1.15; }
    .bl-hero-brand {
        display: block;
        color: #00A4FD;
        margin-top: 4px;
    }
    .bl-hero-subtitle { font-size: 18px; color: #525252; font-weight: 600; }
    .bl-tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
    .bl-tab {
        border: 2px solid #A56AF0;
        background: #fff;
        color: #262626;
        font-weight: 800;
        font-size: 14px;
        padding: 10px 18px;
        border-radius: 999px;
        transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease;
    }
    .bl-tab:hover { transform: translateY(-2px); }
    .bl-tab.is-active {
        background: linear-gradient(135deg, #00A4FD, #A56AF0);
        color: #fff;
        border-color: transparent;
        box-shadow: 0 8px 18px rgba(165, 106, 240, 0.35);
    }

    /* ---------- Description card ---------- */
    .bl-desc-card {
        background: #fff;
        border-radius: 28px;
        padding: 28px 30px;
        margin: 36px auto 0;
        max-width: 1140px;
        box-shadow: 0 10px 30px rgba(37, 38, 38, 0.06);
        border: 3px solid #F2AF49;
        position: relative;
        z-index: 1;
    }
    .bl-desc-card h2 { font-size: 24px; margin-bottom: 10px; color: #4097C3; }
    .bl-desc-card p { font-size: 16px; line-height: 1.7; color: #525252; font-weight: 600; }
    /* ---------- Marquee strip ---------- */
    .bl-marquee-wrap {
        margin: 40px 0;
        overflow: hidden;
        transform: rotate(-2deg) scale(1.06);
        position: relative;
        z-index: 1;
        direction: ltr;
        width: 100%;
    }
    .bl-marquee-track {
        display: flex;
        gap: 14px;
        width: max-content;
        animation: bl-infinite-scroll 40s linear infinite;
        will-change: transform;
    }
    @keyframes bl-infinite-scroll {
        from { transform: translate3d(0, 0, 0); }
        to { transform: translate3d(-50%, 0, 0); }
    }
    @media (prefers-reduced-motion: reduce) {
        .bl-marquee-track { animation: none; }
    }
    .bl-marquee-track img {
        height: 150px;
        width: 220px;
        object-fit: cover;
        border-radius: 20px;
        border: 4px solid #fff;
        box-shadow: 0 8px 18px rgba(0,0,0,0.12);
        flex-shrink: 0;
    }

    /* ---------- Pricing & important info ---------- */
    .bl-grid-2 {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 24px;
        margin-top: 10px;
    }
    .bl-card {
        background: #fff;
        border-radius: 24px;
        padding: 26px 28px;
        box-shadow: 0 10px 28px rgba(37, 38, 38, 0.06);
    }
    .bl-price-card { border-top: 6px solid #00A4FD; }
    .bl-price-card h2 { color: #00A4FD; font-size: 22px; margin-bottom: 12px; }
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
        gap: 16px;
        max-width: 780px;
        margin: 0 auto;
    }
    .bl-field { display: flex; flex-direction: column; gap: 6px; }
    .bl-field.bl-span-2 { grid-column: 1 / -1; }
    .bl-field label { font-size: 13px; font-weight: 800; color: #fff; }
    .bl-field input[type="text"], .bl-field input[type="email"], .bl-field input[type="tel"],
    .bl-field input[type="number"], .bl-field input[type="date"], .bl-field textarea, .bl-field select {
        border: none;
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 15px;
        font-weight: 600;
        color: #262626;
        font-family: 'Quicksand', 'Varela Round', Arial, sans-serif;
        outline: none;
        background: #fff;
    }
    .bl-field textarea { resize: vertical; min-height: 80px; }
    .bl-multiselect { display: flex; flex-wrap: wrap; gap: 8px; }
    .bl-chip-option {
        border: 2px solid #fff;
        background: rgba(255,255,255,0.12);
        color: #fff;
        font-weight: 800;
        font-size: 13px;
        padding: 8px 14px;
        border-radius: 999px;
        transition: background 0.15s ease, color 0.15s ease;
    }
    .bl-chip-option.is-selected { background: #fff; color: #A56AF0; }
    .bl-counter { display: flex; align-items: center; gap: 10px; }
    .bl-counter button {
        width: 34px; height: 34px; border-radius: 50%; border: none;
        background: #fff; color: #A56AF0; font-weight: 800; font-size: 18px;
        display: flex; align-items: center; justify-content: center;
    }
    .bl-counter span { min-width: 28px; text-align: center; font-weight: 800; font-size: 16px; }
    .bl-checkbox-row { display: flex; align-items: flex-start; gap: 10px; }
    .bl-checkbox-row input { margin-top: 3px; width: 18px; height: 18px; }
    .bl-checkbox-row label { font-size: 13px; font-weight: 600; color: #fff; }
    .bl-form-error { background: rgba(255,255,255,0.9); color: #b3261e; font-weight: 800; padding: 10px 14px; border-radius: 12px; font-size: 14px; }
    .bl-form-success { background: rgba(255,255,255,0.95); color: #1a7a4c; font-weight: 800; padding: 14px 18px; border-radius: 14px; font-size: 15px; text-align: center; }
    .bl-submit-btn {
        margin-top: 22px;
        width: 100%;
        max-width: 780px;
        display: block;
        margin-inline: auto;
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
    }
    .bl-submit-btn:hover:not(:disabled) { transform: scale(1.03); box-shadow: 0 0 26px rgba(255,255,255,0.75); }
    .bl-submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
    .bl-spinner { width: 18px; height: 18px; animation: bl-spin 0.8s linear infinite; }
    @keyframes bl-spin { to { transform: rotate(360deg); } }

    .bl-empty { text-align: center; padding: 80px 20px; color: #525252; font-weight: 600; font-size: 16px; }

    @media (max-width: 900px) {
        .bl-hero { grid-template-columns: 1fr; }
        .bl-grid-2 { grid-template-columns: 1fr; }
        .bl-form-grid { grid-template-columns: 1fr; }
        .bl-highlights-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 600px) {
        .bl-marquee-track img { height: 100px; width: 150px; }
        .bl-desc-card, .bl-card, .bl-form-section { padding: 20px; }
        .bl-highlights-grid { grid-template-columns: repeat(2, 1fr); }
        .bl-fab { right: 16px; bottom: 16px; padding: 12px 16px; font-size: 14px; }
    }
`;

const BLOBS = [
    { top: '4%', left: '2%', size: 140, color: '#00A4FD' },
    { top: '18%', right: '4%', size: 100, color: '#FF5FC0' },
    { top: '58%', left: '6%', size: 120, color: '#A56AF0' },
    { top: '75%', right: '8%', size: 90, color: '#35B89A' },
];

const HERO_FADE_MS = 4200;
class BirthdayLandingElement extends HTMLElement {
    static get observedAttributes() {
        return ['workshops-data', 'lead-result'];
    }

    constructor() {
        super();
        this._requestSeq = 0;
        this._heroTimer = null;
        this._state = {
            workshops: [],
            activeIndex: 0,
            heroImageIndex: 0,
            faqOpenIndex: null,
            submitting: false,
            submitError: null,
            submitSuccess: false,
            pendingRequestId: null,
            form: { workshopTypes: [], childrenCount: 0, adultsCount: 0, termsAccepted: false },
        };
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        this.setAttribute('lang', 'he');
        this.innerHTML = `<style>${STYLE}</style><div class="bl-root" id="blRoot"></div>`;
        this._root = this.querySelector('#blRoot');
        this._renderAll();
        this._bindEvents();
    }

    disconnectedCallback() {
        if (this._heroTimer) clearInterval(this._heroTimer);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (!newValue || newValue === oldValue) return;
        if (name === 'workshops-data') {
            try {
                const data = JSON.parse(newValue);
                this._state.workshops = Array.isArray(data.workshops) ? data.workshops : [];
                this._state.activeIndex = 0;
                this._state.heroImageIndex = 0;
                this._state.faqOpenIndex = null;
                if (this._root) { this._renderAll(); this._bindEvents(); }
            } catch (err) {
                console.error('[birthday-landing] failed to parse workshops-data:', err);
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

    _renderAll() {
        if (this._heroTimer) clearInterval(this._heroTimer);
        const s = this._state;
        if (!s.workshops.length) {
            this._root.innerHTML = `${this._renderBlobs()}<div class="bl-empty">אין כרגע סדנאות זמינות להצגה. נשמח לראותכם בקרוב!</div>`;
            return;
        }
        const active = this._activeWorkshop();
        this._root.innerHTML = h`
            ${this._renderBlobs()}
            <header class="bl-hero">
                <div class="bl-hero-gallery-wrap">
                    <div class="bl-hero-card bl-hero-card-1" aria-hidden="true"></div>
                    <div class="bl-hero-card bl-hero-card-2" aria-hidden="true"></div>
                    <div class="bl-hero-gallery" id="blHeroGallery">${this._renderHeroImages(active)}</div>
                </div>
                <div class="bl-hero-text">
                    <h1 class="bl-hero-title">חוגגים יום הולדת ב<span class="bl-hero-brand">Studio Happy</span></h1>
                    <p class="bl-hero-subtitle" id="blActiveSubtitle">${escapeHtml(active.subtitle || '')}</p>
                    <div class="bl-tabs" id="blTabs">${this._renderTabs()}</div>
                </div>
            </header>
            <div id="blContent">${this._renderContent(active)}</div>
            <div class="bl-section" id="blFormSection">${this._renderForm()}</div>
            <button type="button" class="bl-fab" id="blFab" aria-label="גלילה לטופס הזמנה">${FAB_ICON}<span>להזמנה</span></button>
        `;
        this._startHeroFade();
    }

    _renderBlobs() {
        return BLOBS.map((b) => {
            const pos = [
                b.top ? `top:${b.top};` : '',
                b.left ? `left:${b.left};` : '',
                b.right ? `right:${b.right};` : '',
            ].join('');
            return `<span class="bl-blob" style="${pos}width:${b.size}px;height:${b.size}px;background:${b.color};"></span>`;
        }).join('');
    }

    _renderHeroImages(workshop) {
        const gallery = Array.isArray(workshop.gallery) ? workshop.gallery : [];
        if (!gallery.length) return '<div class="bl-hero-badge">✨ סטודיו Happy</div>';
        const imgs = gallery.slice(0, 8).map((entry, i) => {
            const src = resolveMediaUrl(entry);
            if (!src) return '';
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(mediaAlt(entry, workshop.title))}" class="${i === 0 ? 'is-active' : ''}" data-hero-img />`;
        }).join('');
        return `${imgs}<div class="bl-hero-badge">✨ סטודיו Happy</div>`;
    }

    _renderTabs() {
        return this._state.workshops.map((w, i) => `
            <button type="button" class="bl-tab ${i === this._state.activeIndex ? 'is-active' : ''}" data-tab-index="${i}">
                ${escapeHtml(w.title || 'סדנה')}
            </button>
        `).join('');
    }

    _renderContent(workshop) {
        return h`
            <div class="bl-section">
                <div class="bl-desc-card">
                    <h2>${escapeHtml(workshop.title || '')}</h2>
                    <p>${escapeHtml(workshop.description || '')}</p>
                </div>
            </div>
            ${this._renderMarquee(workshop)}
            <div class="bl-section">
                <div class="bl-grid-2">
                    <div class="bl-card bl-price-card">
                        <h2>מחירים</h2>
                        ${renderRicos(workshop.pricingDetails)}
                    </div>
                    <div class="bl-card bl-info-card">
                        <h2>חשוב לדעת</h2>
                        ${this._renderImportantInfo(workshop.importantInfo)}
                    </div>
                </div>
                ${this._renderHighlights()}
                ${this._renderFaq(workshop.faqList)}
            </div>
        `;
    }

    _renderHighlights() {
        const items = FEATURE_HIGHLIGHTS.map((item) => `
            <div class="bl-highlight-item">
                <div class="bl-highlight-icon-wrap" style="background:${item.color};">${item.icon}</div>
                <span class="bl-highlight-title">${escapeHtml(item.title)}</span>
                <span class="bl-highlight-sub">${escapeHtml(item.subtitle)}</span>
            </div>
        `).join('');
        return `
            <div class="bl-highlights-section">
                <h2>למה לחגוג אצלנו?</h2>
                <div class="bl-highlights-grid">${items}</div>
            </div>
        `;
    }

    _renderMarquee(workshop) {
        const gallery = Array.isArray(workshop.stripGallery) ? workshop.stripGallery : [];
        if (!gallery.length) return '';
        const tiles = gallery
            .map((entry) => ({ src: resolveMediaUrl(entry), alt: mediaAlt(entry, workshop.title) }))
            .filter((t) => t.src);
        if (!tiles.length) return '';
        const renderTile = (t) => `<img src="${escapeHtml(t.src)}" alt="${escapeHtml(t.alt)}" loading="lazy" />`;
        const oneSet = tiles.map(renderTile).join('');
        return `<div class="bl-marquee-wrap"><div class="bl-marquee-track">${oneSet}${oneSet}</div></div>`;
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
            <div class="bl-faq-section">
                <h2>שאלות נפוצות</h2>
                ${items.map((item, i) => `
                    <div class="bl-faq-item ${this._state.faqOpenIndex === i ? 'is-open' : ''}" data-faq-index="${i}">
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
                <a class="bl-faq-whatsapp" href="${waUrl}" target="_blank" rel="noopener noreferrer">
                    ${WHATSAPP_ICON}
                    <span>יש לך שאלות נוספות?</span>
                </a>
            </div>
        `;
    }

    _renderForm() {
        const workshopOptions = this._state.workshops.map((w) => w.title).filter(Boolean);
        const f = this._state.form;
        return h`
            <div class="bl-form-section">
                <h2>רוצים לחגוג אצלנו?</h2>
                <p class="bl-form-sub">מלאו פרטים ונחזור אליכם עם כל הפרטים לסדנה המושלמת</p>
                <div id="blFormStatus"></div>
                <div class="bl-form-grid">
                    <div class="bl-field">
                        <label for="blFullName">שם מלא</label>
                        <input type="text" id="blFullName" name="fullName" required placeholder="שם מלא" />
                    </div>
                    <div class="bl-field">
                        <label for="blEmail">אימייל</label>
                        <input type="email" id="blEmail" name="email" required placeholder="name@example.com" />
                    </div>
                    <div class="bl-field">
                        <label for="blPhone">טלפון</label>
                        <input type="tel" id="blPhone" name="phone" inputmode="tel" required placeholder="050-0000000" />
                    </div>
                    <div class="bl-field">
                        <label for="blDate">תאריך מועדף</label>
                        <input type="date" id="blDate" name="preferredDate" />
                    </div>
                    <div class="bl-field bl-span-2">
                        <label>סוג סדנה מבוקש</label>
                        <div class="bl-multiselect" id="blWorkshopTypes">
                            ${workshopOptions.map((title) => `
                                <button type="button" class="bl-chip-option ${f.workshopTypes.includes(title) ? 'is-selected' : ''}" data-workshop-type="${escapeHtml(title)}">${escapeHtml(title)}</button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="bl-field">
                        <label>מספר ילדים</label>
                        <div class="bl-counter" data-counter="childrenCount">
                            <button type="button" data-counter-delta="-1">−</button>
                            <span data-counter-value>${f.childrenCount}</span>
                            <button type="button" data-counter-delta="1">+</button>
                        </div>
                    </div>
                    <div class="bl-field">
                        <label>מספר מבוגרים/מלווים</label>
                        <div class="bl-counter" data-counter="adultsCount">
                            <button type="button" data-counter-delta="-1">−</button>
                            <span data-counter-value>${f.adultsCount}</span>
                            <button type="button" data-counter-delta="1">+</button>
                        </div>
                    </div>
                    <div class="bl-field bl-span-2">
                        <label for="blNotes">הערות / בקשות מיוחדות</label>
                        <textarea id="blNotes" name="notes" placeholder="ספרו לנו עוד..."></textarea>
                    </div>
                    <div class="bl-field bl-span-2">
                        <div class="bl-checkbox-row">
                            <input type="checkbox" id="blTerms" name="termsAccepted" />
                            <label for="blTerms">קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות של הסטודיו</label>
                        </div>
                    </div>
                </div>
                <button type="button" class="bl-submit-btn" id="blSubmitBtn">שליחת פנייה</button>
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
        this._boundClick = (e) => this._onClick(e);
        this._root.addEventListener('click', this._boundClick);
    }

    _onClick(e) {
        const tabBtn = e.target.closest('[data-tab-index]');
        if (tabBtn) { this._onTabClick(Number(tabBtn.dataset.tabIndex)); return; }

        const faqBtn = e.target.closest('[data-faq-toggle]');
        if (faqBtn) { this._onFaqToggle(Number(faqBtn.dataset.faqToggle)); return; }

        const typeBtn = e.target.closest('[data-workshop-type]');
        if (typeBtn) { this._onWorkshopTypeToggle(typeBtn); return; }

        const counterBtn = e.target.closest('[data-counter-delta]');
        if (counterBtn) { this._onCounterChange(counterBtn); return; }

        if (e.target.closest('#blSubmitBtn')) { this._onSubmit(); return; }

        if (e.target.closest('#blFab')) { this._scrollToForm(); }
    }

    _scrollToForm() {
        const target = this._root.querySelector('#blFormSection');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    _onTabClick(index) {
        if (index === this._state.activeIndex) return;
        this._state.activeIndex = index;
        this._state.heroImageIndex = 0;
        this._state.faqOpenIndex = null;
        this._root.querySelectorAll('[data-tab-index]').forEach((btn) => {
            btn.classList.toggle('is-active', Number(btn.dataset.tabIndex) === index);
        });
        const active = this._activeWorkshop();
        const subtitleEl = this._root.querySelector('#blActiveSubtitle');
        if (subtitleEl) subtitleEl.textContent = active.subtitle || '';
        const galleryEl = this._root.querySelector('#blHeroGallery');
        if (galleryEl) galleryEl.innerHTML = this._renderHeroImages(active);
        const contentEl = this._root.querySelector('#blContent');
        if (contentEl) contentEl.innerHTML = this._renderContent(active);
        if (this._heroTimer) clearInterval(this._heroTimer);
        this._startHeroFade();
        this.dispatchEvent(new CustomEvent('birthday-tab-change', {
            detail: { workshopId: active._id || null, title: active.title || null },
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

    _onCounterChange(btn) {
        const wrap = btn.closest('[data-counter]');
        const key = wrap.dataset.counter;
        const delta = Number(btn.dataset.counterDelta);
        const next = Math.max(0, Math.min(50, (this._state.form[key] || 0) + delta));
        this._state.form[key] = next;
        wrap.querySelector('[data-counter-value]').textContent = String(next);
    }

    // ---------------------------------------------------------------------
    // Lead form submission
    // ---------------------------------------------------------------------

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
            childrenCount: this._state.form.childrenCount || 0,
            adultsCount: this._state.form.adultsCount || 0,
        };
    }

    _validate(values) {
        if (!values.fullName) return 'נא למלא שם מלא.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return 'נא להזין כתובת אימייל תקינה.';
        const phoneDigits = values.phone.replace(/\D/g, '');
        if (phoneDigits.length < 9 || phoneDigits.length > 10) return 'נא להזין מספר טלפון תקין.';
        if (!values.termsAccepted) return 'יש לאשר את תנאי השימוש כדי להמשיך.';
        return null;
    }

    _onSubmit() {
        if (this._state.submitting) return;
        const values = this._readFormValues();
        const error = this._validate(values);
        const statusEl = this._root.querySelector('#blFormStatus');
        if (error) {
            if (statusEl) statusEl.innerHTML = `<div class="bl-form-error">${escapeHtml(error)}</div>`;
            return;
        }
        if (statusEl) statusEl.innerHTML = '';
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

    _handleLeadResult(result) {
        if (!result || result.requestId !== this._state.pendingRequestId) return;
        this._state.submitting = false;
        this._state.pendingRequestId = null;
        const btn = this._root.querySelector('#blSubmitBtn');
        const statusEl = this._root.querySelector('#blFormStatus');
        if (result.ok) {
            this._state.submitSuccess = true;
            if (statusEl) statusEl.innerHTML = `<div class="bl-form-success">${escapeHtml(result.message || 'תודה! הפנייה שלכם התקבלה ונחזור אליכם בהקדם.')}</div>`;
            const formSection = this._root.querySelector('#blFormSection');
            if (formSection) {
                this._state.form = { workshopTypes: [], childrenCount: 0, adultsCount: 0, termsAccepted: false };
                formSection.innerHTML = this._renderForm();
                const newStatus = this._root.querySelector('#blFormStatus');
                if (newStatus) newStatus.innerHTML = `<div class="bl-form-success">${escapeHtml(result.message || 'תודה! הפנייה שלכם התקבלה ונחזור אליכם בהקדם.')}</div>`;
            }
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'שליחת פנייה'; }
            if (statusEl) statusEl.innerHTML = `<div class="bl-form-error">${escapeHtml(result.message || 'אירעה שגיאה בשליחת הפנייה. נסו שוב.')}</div>`;
        }
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, BirthdayLandingElement);
}
