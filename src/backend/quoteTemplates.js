// Placeholder rendering + sanitizing for quote contract templates.
export const PLACEHOLDERS = [
    'customerName', 'customerEmail', 'customerPhone', 'companyName', 'eventType', 'eventDate', 'eventStartTime',
    'eventEndTime', 'eventLocation', 'eventAddress', 'workshop', 'participants', 'adults', 'extrasList',
    'totalAmount', 'depositAmount', 'balanceAmount', 'balanceDueDate', 'expiresAt', 'quoteNumber',
    'eventTime', 'pricePerParticipant',
];

/** Selectable dynamic fields for the uniform template layout (key = placeholder, label = row title). */
export const FIELD_OPTIONS = [
    { key: 'quoteNumber', label: 'מספר הצעה' }, { key: 'customerName', label: 'שם הלקוח' },
    { key: 'customerPhone', label: 'טלפון' }, { key: 'customerEmail', label: 'אימייל' },
    { key: 'companyName', label: 'חברה' }, { key: 'eventType', label: 'סוג אירוע' },
    { key: 'workshop', label: 'סדנה' }, { key: 'eventDate', label: 'תאריך האירוע' },
    { key: 'eventStartTime', label: 'שעת התחלה' }, { key: 'eventEndTime', label: 'שעת סיום' },
    { key: 'eventLocation', label: 'מיקום' }, { key: 'eventAddress', label: 'כתובת' },
    { key: 'participants', label: 'משתתפים' }, { key: 'adults', label: 'מלווים' },
    { key: 'extrasList', label: 'תוספות' }, { key: 'totalAmount', label: 'סה"כ לתשלום' },
    { key: 'depositAmount', label: 'מקדמה' }, { key: 'balanceAmount', label: 'יתרה' },
    { key: 'balanceDueDate', label: 'מועד תשלום יתרה' }, { key: 'expiresAt', label: 'תוקף ההצעה' },
    { key: 'eventTime', label: 'שעות האירוע' }, { key: 'pricePerParticipant', label: 'מחיר למשתתף' },
];
export const DEFAULT_TEMPLATE_FIELDS = [
    'customerName', 'eventType', 'eventDate', 'eventStartTime', 'eventEndTime', 'participants',
    'extrasList', 'totalAmount', 'depositAmount', 'balanceAmount', 'balanceDueDate',
];
const CFG_RE = /^<!--tpl:([^>]*?)-->/;

const inlineHtml = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** Plain text with light markup: "## heading", "• / - / * item", "**bold**". Blank line ends a list. */
function textHtml(s) {
    const out = [];
    let list = [];
    const flush = () => { if (list.length) out.push(`<ul>${list.map((x) => `<li>${x}</li>`).join('')}</ul>`); list = []; };
    for (const raw of String(s || '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) { flush(); continue; }
        const li = /^[•*-]\s+(.*)$/.exec(line);
        if (li) { list.push(inlineHtml(li[1])); continue; }
        flush();
        const h = /^#{1,3}\s+(.*)$/.exec(line);
        out.push(h ? `<h3>${inlineHtml(h[1])}</h3>` : `<p>${inlineHtml(line)}</p>`);
    }
    flush();
    return out.join('');
}

/** Fixed layout: title, intro, terms, footer. Config rides in a leading comment. */
export function buildTemplateHtml(config = {}) {
    const keys = FIELD_OPTIONS.map((f) => f.key);
    const cfg = {
        title: String(config.title || '').slice(0, 200),
        intro: String(config.intro || '').slice(0, 3000),
        terms: String(config.terms || '').slice(0, 8000),
        footer: String(config.footer || '').slice(0, 1000),
        fields: (Array.isArray(config.fields) ? config.fields : []).filter((k) => keys.includes(k)),
    };
    return `<!--tpl:${encodeURIComponent(JSON.stringify(cfg))}-->`
        + '<div dir="rtl" style="line-height:1.75">'
        + (cfg.title ? `<h1 style="font-size:24px;margin:0 0 12px">${esc(cfg.title)}</h1>` : '')
        + (cfg.intro ? textHtml(cfg.intro) : '')
        + (cfg.terms ? `${/^\s*#/.test(cfg.terms) ? '' : '<h3>תנאים</h3>'}${textHtml(cfg.terms)}` : '')
        + (cfg.footer ? `<div style="margin-top:18px;color:#475569">${textHtml(cfg.footer)}</div>` : '')
        + '</div>';
}

/** Structured config of a template built with buildTemplateHtml, or null for legacy free-HTML templates. */
export function parseTemplateConfig(bodyHtml) {
    const m = CFG_RE.exec(String(bodyHtml || ''));
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (_) { return null; }
}

const EVENT_TYPE_LABELS = { birthday: 'יום הולדת', event: 'אירוע חברה / פרטי' };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');

/** Strip scripts, inline handlers and javascript: URLs from admin-authored HTML. */
export function sanitizeHtml(html) {
    return String(html || '')
        .replace(/<\s*(script|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|iframe|object|embed)[^>]*>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
}

/** Fields the admin may leave empty per quote (shown purple in the editor; inserted as linked segments). */
export const OPTIONAL_FIELDS = [
    'companyName', 'customerEmail', 'eventLocation', 'eventAddress', 'workshop', 'participants', 'adults',
    'extrasList', 'pricePerParticipant', 'depositAmount', 'balanceAmount', 'balanceDueDate', 'expiresAt',
];

function emptyOptional(q) {
    const noDeposit = !(Number(q.depositAmount) > 0);
    const empty = {
        companyName: !q.companyName, customerEmail: !q.customerEmail, eventLocation: !q.eventLocation, eventAddress: !q.eventAddress,
        workshop: !q.requestedWorkshop, participants: !(Number(q.participants) > 0), adults: !(Number(q.adults) > 0),
        extrasList: !(q.extras || []).length,
        pricePerParticipant: !(Number(q.participants) > 0 && Number(q.basePrice) > 0),
        depositAmount: noDeposit, balanceAmount: noDeposit || !(Number(q.balanceAmount) > 0), balanceDueDate: noDeposit || !q.balanceDueDate,
        expiresAt: !q.expiresAt,
    };
    return new Set(OPTIONAL_FIELDS.filter((k) => empty[k]));
}

/** Linked segment: {{?key|text before|text after}} — the whole segment renders only when key has a value. */
const SEG_RE = /\{\{\?(\w+)\|([^|{}]*)\|([^|{}]*)\}\}/g;

/** Bare (unlinked) empty optional tags still drop their whole <tr>/<p>/<li>/<h3>; blocks left empty are removed. */
function hideEmptyBlocks(body, empty) {
    const refsEmpty = (blk) => [...blk.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].some((m) => empty.has(m[1]));
    return body
        .replace(/<(tr|p|li|h3)\b[^>]*>(?:(?!<\/\1>)[\s\S])*<\/\1>/gi, (blk) => (refsEmpty(blk) ? '' : blk))
        .replace(/<(p|li|h3)\b[^>]*>\s*<\/\1>/gi, '')
        .replace(/<ul>\s*<\/ul>/gi, '')
        .replace(/<table[^>]*><tbody>\s*<\/tbody><\/table>/gi, '');
}

// Every filled-in value renders bold so the customer sees what was set for them.
function valuesFor(q) {
    const extras = (q.extras || []).map((e) => `${esc(e.title || e.name)}${e.price ? ` (${money(e.price)})` : ''}`).join(', ');
    const people = Number(q.participants) || 0;
    const time = [q.eventStartTime, q.eventEndTime].filter(Boolean).join(' עד ');
    const raw = {
        customerName: esc(q.customerName),
        customerEmail: esc(q.customerEmail),
        customerPhone: esc(String(q.customerPhone || '').replace(/^972/, '0')),
        companyName: esc(q.companyName),
        eventType: esc(EVENT_TYPE_LABELS[q.eventType] || q.eventType),
        eventDate: esc(fmtDate(q.eventDate)),
        eventStartTime: esc(q.eventStartTime),
        eventEndTime: esc(q.eventEndTime),
        eventTime: esc(time),
        eventLocation: esc(q.eventLocation),
        eventAddress: esc(q.eventAddress),
        workshop: esc(q.requestedWorkshop),
        participants: esc(q.participants),
        adults: esc(q.adults),
        extrasList: extras || '—',
        totalAmount: money(q.totalAmount),
        pricePerParticipant: people > 0 && Number(q.basePrice) > 0 ? money(Math.round(Number(q.basePrice) / people)) : '',
        depositAmount: money(q.depositAmount),
        balanceAmount: money(q.balanceAmount),
        balanceDueDate: esc(fmtDate(q.balanceDueDate)),
        expiresAt: esc(fmtDate(q.expiresAt)),
        quoteNumber: esc(q.quoteNumber),
    };
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === '' || v == null ? '' : `<strong class="dyn">${v}</strong>`]));
}

/** @returns {{html: string, error: string|null}} */
export function renderTemplate(bodyHtml, quote) {
    const body = sanitizeHtml(bodyHtml);
    const unknown = [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g), ...body.matchAll(SEG_RE)].map((m) => m[1]))]
        .filter((k) => !PLACEHOLDERS.includes(k));
    if (unknown.length) return { html: '', error: `משתנים לא מוכרים בתבנית: ${unknown.join(', ')}` };
    const vals = valuesFor(quote);
    const empty = emptyOptional(quote);
    const html = body
        .replace(/<table style="width:100%;border-collapse:collapse;margin:14px 0"><tbody>[\s\S]*?<\/tbody><\/table>/g, '')
        .replace(SEG_RE, (_, k, pre, suf) => (empty.has(k) || !vals[k] ? ''
            : `${pre ? `${pre} ` : ''}{{${k}}}${suf && !/^[.,:;!?)]/.test(suf) ? ' ' : ''}${suf}`));
    return { html: hideEmptyBlocks(html, empty).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vals[k] ?? ''), error: null };
}
