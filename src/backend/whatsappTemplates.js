/**
 * WhatsApp_Templates.use — categorizes templates by consuming system.
 * All rows live in the same CMS collection; `use` routes them to the right UI.
 */
export const TEMPLATE_USE = {
    ORDERS: 'orders',
    EMPLOYEES: 'employees',
};

export const TEMPLATE_USE_LABELS = {
    [TEMPLATE_USE.ORDERS]: 'מערכת ניהול הזמנות',
    [TEMPLATE_USE.EMPLOYEES]: 'מערכת עובדים',
};

const ORDER_PLACEHOLDERS = /\{\{(Name|Date|Time|OrderUrl)\}\}/;

/** Normalizes CMS `use` value; infers from title/body when missing (legacy rows). */
export function resolveTemplateUse(row) {
    const raw = String(row?.use || '').trim().toLowerCase();
    if (raw === TEMPLATE_USE.ORDERS || raw === TEMPLATE_USE.EMPLOYEES) return raw;

    const title = String(row?.title || '').toLowerCase();
    const body = String(row?.messageBody || row?.body || '');

    if (ORDER_PLACEHOLDERS.test(body)) return TEMPLATE_USE.ORDERS;
    if (/זמינות|עובד|פורטל|משמרת|שיבוץ|החלפה/.test(title)) return TEMPLATE_USE.EMPLOYEES;
    if (/סקיצה|הזמנה|לקוח|מארגן|אורח|תזכורת/.test(title)) return TEMPLATE_USE.ORDERS;

    return TEMPLATE_USE.ORDERS;
}

export function mapTemplateRow(t) {
    const use = resolveTemplateUse(t);
    return {
        id: t._id,
        title: t.title || '',
        body: t.messageBody || '',
        isSystem: !!t.isSystem,
        use,
        useLabel: TEMPLATE_USE_LABELS[use] || use,
    };
}

export function assertTemplateUse(use, fallback = TEMPLATE_USE.ORDERS) {
    const v = String(use || '').trim().toLowerCase();
    if (v === TEMPLATE_USE.ORDERS || v === TEMPLATE_USE.EMPLOYEES) return v;
    return fallback;
}
