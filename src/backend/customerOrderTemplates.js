/**
 * Customer-facing WhatsApp templates (ManyChat / Meta).
 * Production messages are sent from ManyChat flows — these strings are the
 * canonical copy for Meta template approval, flow setup, and CMS preview rows.
 *
 * Pre-workshop reminder: manychatService.jsw → sendWorkshopReminderManyChat
 * (notification_type = workshop_reminder), scheduled by workshopReminders.js.
 */

export const WORKSHOP_REMINDER_META_NAME = 'workshop_reminder_48h';
export const WORKSHOP_REMINDER_NOTIFICATION_TYPE = 'workshop_reminder';

/** Meta WhatsApp template body — variables {{1}}…{{6}} only in the approved template. */
export const WORKSHOP_REMINDER_META_BODY = `שלום {{1}},
תזכורת לסדנת {{2}}.

תאריך: {{3}}
שעה: {{4}}
משתתפים: {{5}}
{{6}}

כתובת: הדובדבן 7, קריית אונו, קומה 5
בסרטון למעלה יש הסבר קצר איך מגיעים לסטודיו.

לשאלות ניתן ללחוץ על כפתור "שירות לקוחות" למטה.

נתראה בסדנה.`;

/**
 * Maps Meta template variables → ManyChat custom field names (set in
 * sendWorkshopReminderManyChat via buildOrderCustomFields).
 */
export const WORKSHOP_REMINDER_META_TO_MANYCHAT = [
    { metaVar: 1, manyChatField: 'organizer_name', label: 'שם מזמין/ה' },
    { metaVar: 2, manyChatField: 'workshop_name', label: 'סוג סדנה' },
    { metaVar: 3, manyChatField: 'workshop_date', label: 'תאריך' },
    { metaVar: 4, manyChatField: 'workshop_time', label: 'שעה' },
    { metaVar: 5, manyChatField: 'participants_line', label: 'משתתפים' },
    { metaVar: 6, manyChatField: 'items_line', label: 'שטיחים / נרות / קרמיקה' },
];

/** Example values for Meta template review (submit one set per workshop type if asked). */
export const WORKSHOP_REMINDER_META_SAMPLES = {
    tufting: {
        1: 'נועה',
        2: 'טאפטינג',
        3: 'יום חמישי, 25 בספטמבר 2026 בשעה 18:00',
        4: '18:00',
        5: '2 מבוגרים + 1 ילדים',
        6: 'שטיחים: 2',
    },
    candles: {
        1: 'דני',
        2: 'סדנת נרות',
        3: 'יום שישי, 26 בספטמבר 2026 בשעה 10:00',
        4: '10:00',
        5: '2 מבוגרים',
        6: 'נרות: 4',
    },
    ceramics: {
        1: 'מיכל',
        2: 'סדנת קרמיקה',
        3: 'יום שבת, 27 בספטמבר 2026 בשעה 11:00',
        4: '11:00',
        5: '3',
        6: 'כלי קרמיקה: 3',
    },
};

/**
 * ManyChat custom-field names (must match MC_FIELDS in manychatService.jsw).
 * Use this version when wiring the flow / CMS preview. In the Meta-approved
 * WhatsApp template body, replace each named token with {{1}}…{{6}} per
 * WORKSHOP_REMINDER_META_TO_MANYCHAT.
 */
export const WORKSHOP_REMINDER_NAMED_BODY = `שלום {{organizer_name}},
תזכורת לסדנת {{workshop_name}}.

תאריך: {{workshop_date}}
שעה: {{workshop_time}}
משתתפים: {{participants_line}}
{{items_line}}

כתובת: הדובדבן 7, קריית אונו, קומה 5
בסרטון למעלה יש הסבר קצר איך מגיעים לסטודיו.

לשאלות ניתן ללחוץ על כפתור "שירות לקוחות" למטה.

נתראה בסדנה.`;

/** @deprecated alias — use WORKSHOP_REMINDER_NAMED_BODY */
export const WORKSHOP_REMINDER_PREVIEW_BODY = WORKSHOP_REMINDER_NAMED_BODY;

/** Sample values keyed by ManyChat field name (for preview / tests). */
export const WORKSHOP_REMINDER_NAMED_SAMPLES = {
    tufting: {
        organizer_name: 'נועה',
        workshop_name: 'טאפטינג',
        workshop_date: 'יום חמישי, 25 בספטמבר 2026 בשעה 18:00',
        workshop_time: '18:00',
        participants_line: '2 מבוגרים + 1 ילדים',
        items_line: 'שטיחים: 2',
    },
    candles: {
        organizer_name: 'דני',
        workshop_name: 'סדנת נרות',
        workshop_date: 'יום שישי, 26 בספטמבר 2026 בשעה 10:00',
        workshop_time: '10:00',
        participants_line: '2 מבוגרים',
        items_line: 'נרות: 4',
    },
    ceramics: {
        organizer_name: 'מיכל',
        workshop_name: 'סדנת קרמיקה',
        workshop_date: 'יום שבת, 27 בספטמבר 2026 בשעה 11:00',
        workshop_time: '11:00',
        participants_line: '3',
        items_line: 'כלי קרמיקה: 3',
    },
};

export function renderWorkshopReminderPreview(vars = {}) {
    return String(WORKSHOP_REMINDER_NAMED_BODY).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
        const v = vars[key];
        return v === undefined || v === null ? '' : String(v);
    });
}

/** Filled reminder text using ManyChat field names (tufting / candles / ceramics). */
export function buildWorkshopReminderNamedExample(workshopType = 'tufting') {
    const vars = WORKSHOP_REMINDER_NAMED_SAMPLES[workshopType] || WORKSHOP_REMINDER_NAMED_SAMPLES.tufting;
    return renderWorkshopReminderPreview(vars);
}

/** Filled examples (copy into Meta “sample message” if needed). */
export function buildWorkshopReminderMetaExample(workshopType = 'tufting') {
    const s = WORKSHOP_REMINDER_META_SAMPLES[workshopType] || WORKSHOP_REMINDER_META_SAMPLES.tufting;
    return String(WORKSHOP_REMINDER_META_BODY)
        .replace(/\{\{1\}\}/g, s[1])
        .replace(/\{\{2\}\}/g, s[2])
        .replace(/\{\{3\}\}/g, s[3])
        .replace(/\{\{4\}\}/g, s[4])
        .replace(/\{\{5\}\}/g, s[5])
        .replace(/\{\{6\}\}/g, s[6]);
}
