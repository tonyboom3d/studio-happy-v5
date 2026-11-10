// Placeholder rendering + sanitizing for quote contract templates.
export const PLACEHOLDERS = [
    'customerName', 'customerEmail', 'customerPhone', 'companyName', 'eventType', 'eventDate', 'eventStartTime',
    'eventEndTime', 'eventLocation', 'eventAddress', 'workshop', 'participants', 'adults', 'extrasList',
    'totalAmount', 'depositAmount', 'balanceAmount', 'balanceDueDate', 'expiresAt', 'quoteNumber',
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
];
export const DEFAULT_TEMPLATE_FIELDS = [
    'customerName', 'eventType', 'eventDate', 'eventStartTime', 'eventEndTime', 'participants',
    'extrasList', 'totalAmount', 'depositAmount', 'balanceAmount', 'balanceDueDate',
];
const CFG_RE = /^<!--tpl:([^>]*?)-->/;

const textHtml = (s) => esc(s).replace(/\r?\n/g, '<br>');

/** Fixed layout: title, intro, selected-fields table, terms, footer. Config rides in a leading comment. */
export function buildTemplateHtml(config = {}) {
    const keys = FIELD_OPTIONS.map((f) => f.key);
    const cfg = {
        title: String(config.title || '').slice(0, 200),
        intro: String(config.intro || '').slice(0, 3000),
        terms: String(config.terms || '').slice(0, 8000),
        footer: String(config.footer || '').slice(0, 1000),
        fields: (Array.isArray(config.fields) ? config.fields : []).filter((k) => keys.includes(k)),
    };
    const rows = cfg.fields.map((k) => {
        const label = FIELD_OPTIONS.find((f) => f.key === k).label;
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;width:38%">${esc(label)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">{{${k}}}</td></tr>`;
    }).join('');
    return `<!--tpl:${encodeURIComponent(JSON.stringify(cfg))}-->`
        + '<div dir="rtl" style="font-family:Rubik,Arial,sans-serif;line-height:1.7">'
        + (cfg.title ? `<h1 style="font-size:24px;margin:0 0 12px">${esc(cfg.title)}</h1>` : '')
        + (cfg.intro ? `<p>${textHtml(cfg.intro)}</p>` : '')
        + (rows ? `<table style="width:100%;border-collapse:collapse;margin:14px 0"><tbody>${rows}</tbody></table>` : '')
        + (cfg.terms ? `<h3 style="margin:18px 0 6px">תנאים</h3><p>${textHtml(cfg.terms)}</p>` : '')
        + (cfg.footer ? `<p style="margin-top:18px;color:#475569">${textHtml(cfg.footer)}</p>` : '')
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

function valuesFor(q) {
    const extras = (q.extras || []).map((e) => `<li>${esc(e.title || e.name)}${e.price ? ` – ${money(e.price)}` : ''}</li>`).join('');
    return {
        customerName: esc(q.customerName),
        customerEmail: esc(q.customerEmail),
        customerPhone: esc(String(q.customerPhone || '').replace(/^972/, '0')),
        companyName: esc(q.companyName),
        eventType: esc(EVENT_TYPE_LABELS[q.eventType] || q.eventType),
        eventDate: esc(fmtDate(q.eventDate)),
        eventStartTime: esc(q.eventStartTime),
        eventEndTime: esc(q.eventEndTime),
        eventLocation: esc(q.eventLocation),
        eventAddress: esc(q.eventAddress),
        workshop: esc(q.requestedWorkshop),
        participants: esc(q.participants),
        adults: esc(q.adults),
        extrasList: extras ? `<ul>${extras}</ul>` : '—',
        totalAmount: money(q.totalAmount),
        depositAmount: money(q.depositAmount),
        balanceAmount: money(q.balanceAmount),
        balanceDueDate: esc(fmtDate(q.balanceDueDate)),
        expiresAt: esc(fmtDate(q.expiresAt)),
        quoteNumber: esc(q.quoteNumber),
    };
}

/** @returns {{html: string, error: string|null}} */
export function renderTemplate(bodyHtml, quote) {
    const body = sanitizeHtml(bodyHtml);
    const unknown = [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))]
        .filter((k) => !PLACEHOLDERS.includes(k));
    if (unknown.length) return { html: '', error: `משתנים לא מוכרים בתבנית: ${unknown.join(', ')}` };
    const vals = valuesFor(quote);
    return { html: body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vals[k] ?? ''), error: null };
}
