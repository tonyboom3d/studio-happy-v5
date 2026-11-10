// Human-readable diff of a quote edit, for the activity log ("עדכונים להצעה").
import wixData from 'wix-data';

const SA = { suppressAuth: true, suppressHooks: true };

const LABELS = {
    customerName: 'שם לקוח', customerEmail: 'אימייל', customerPhone: 'טלפון', companyName: 'חברה', companyRole: 'תפקיד',
    eventLocation: 'מיקום', eventAddress: 'כתובת', participants: 'משתתפים', adults: 'מלווים', eventDate: 'תאריך אירוע',
    eventStartTime: 'שעת התחלה', eventEndTime: 'שעת סיום', workshopClosed: 'סדנה סגורה', requiredInstructors: 'מדריכים נדרשים',
    basePrice: 'מחיר בסיס', priceOverride: 'מחיר מותאם', depositType: 'סוג מקדמה', depositValue: 'ערך מקדמה',
    balanceDueDate: 'מועד תשלום יתרה', expiresAt: 'תוקף ההצעה', allowOnlinePayment: 'תשלום מקוון',
    allowBankTransfer: 'העברה בנקאית', notes: 'הערות פנימיות', extras: 'תוספות', assignedStaffIds: 'צוות משובץ',
    workshopId: 'סדנה', totalAmount: 'סה"כ',
};
const MONEY = ['basePrice', 'priceOverride', 'totalAmount'];
const DATES = ['eventDate', 'balanceDueDate', 'expiresAt'];

const dateStr = (v) => {
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};
const norm = (k, v) => {
    if (DATES.includes(k)) return dateStr(v);
    if (k === 'extras') return JSON.stringify((v || []).map((x) => [x.id, x.title, Number(x.price) || 0]).sort());
    if (k === 'assignedStaffIds') return JSON.stringify([...(v || [])].sort());
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined || v === '') return '';
    return typeof v === 'number' ? v : String(v).trim();
};

function show(k, v) {
    if (v === '' || v === null || v === undefined) return '—';
    if (DATES.includes(k)) { const s = dateStr(v); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'; }
    if (typeof v === 'boolean') return v ? 'כן' : 'לא';
    if (k === 'depositType') return v === 'fixed' ? 'סכום קבוע' : 'אחוז';
    if (MONEY.includes(k)) return `₪${(Number(v) || 0).toLocaleString('he-IL')}`;
    const s = String(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

async function staffNames(ids) {
    if (!ids.length) return {};
    const res = await wixData.query('Dashboard_Roles').hasSome('_id', ids).fields('displayName').limit(100).find(SA).catch(() => ({ items: [] }));
    return Object.fromEntries(res.items.map((r) => [r._id, r.displayName]));
}

/** @returns {Promise<Array<{label: string, from?: string, to?: string, text?: string}>>} only real changes. */
export async function diffQuote(before, after, keys) {
    const out = [];
    const all = [...new Set([...keys, 'totalAmount'])];
    const staffIds = [...new Set([...(before.assignedStaffIds || []), ...(after.assignedStaffIds || [])])];
    const names = keys.includes('assignedStaffIds') ? await staffNames(staffIds) : {};
    for (const k of all) {
        if (norm(k, before[k]) === norm(k, after[k])) continue;
        const label = LABELS[k] || k;
        if (k === 'extras' || k === 'assignedStaffIds') {
            const id = (x) => (k === 'extras' ? x.id : x);
            const name = (x) => (k === 'extras' ? x.title : names[x] || x);
            const prev = new Map((before[k] || []).map((x) => [id(x), name(x)]));
            const next = new Map((after[k] || []).map((x) => [id(x), name(x)]));
            const added = [...next].filter(([i]) => !prev.has(i)).map(([, n]) => n);
            const removed = [...prev].filter(([i]) => !next.has(i)).map(([, n]) => n);
            const parts = [];
            if (added.length) parts.push(`נוספו: ${added.join(', ')}`);
            if (removed.length) parts.push(`הוסרו: ${removed.join(', ')}`);
            out.push({ label, text: parts.join(' · ') || 'עודכן' });
        } else {
            out.push({ label, from: show(k, before[k]), to: show(k, after[k]) });
        }
    }
    return out;
}
