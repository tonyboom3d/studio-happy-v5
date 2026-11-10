// Placeholder rendering + sanitizing for quote contract templates.
export const PLACEHOLDERS = [
    'customerName', 'customerEmail', 'customerPhone', 'companyName', 'eventType', 'eventDate', 'eventStartTime',
    'eventEndTime', 'eventLocation', 'eventAddress', 'workshop', 'participants', 'adults', 'extrasList',
    'totalAmount', 'depositAmount', 'balanceAmount', 'balanceDueDate', 'expiresAt', 'quoteNumber',
];

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
