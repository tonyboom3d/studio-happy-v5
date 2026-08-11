/**
 * Manual Bookings staff API tests — run from the Velo backend console:
 *
 *   import { getStaffMemberTest, testBookingsStaffLink } from 'backend/TEST.web.js';
 *   getStaffMemberTest('997e9b7c-cb6d-4598-bcd9-2e6743a9a2e7').then(console.log);
 *   testBookingsStaffLink().then(console.log);
 *
 *   import { seedEmployeeWhatsAppTemplates } from 'backend/TEST.web.js';
 *   seedEmployeeWhatsAppTemplates().then(console.log);
 *   seedEmployeeWhatsAppTemplates({ overwrite: true }).then(console.log);
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { staffMembers } from '@wix/bookings';
import { listBookingStaff } from 'backend/staffAdminService.web.js';
import { EMPLOYEE_ACTION_KEYS } from 'backend/employeeTemplates.js';
import { TEMPLATE_USE } from 'backend/whatsappTemplates.js';

const SA = { suppressAuth: true };

/** Default messageBody per actionKey — matches original hardcoded texts. */
const EMPLOYEE_TEMPLATE_SEEDS = {
    employee_availability_nudge: `היי {{displayName}} 👋
תזכורת מסטודיו האפי: טרם הושלמה הגשת הזמינות לחודש {{monthKey}}.
להגשה יש להיכנס לפורטל העובדים:
{{portalLink}}`,
    employee_shift_assigned: `היי {{displayName}} 👋
שובצת למשמרת {{detail}}בתאריך {{dow}}, {{date}}.
פרטים בפורטל העובדים: {{portalLink}}`,
    employee_shift_cancelled: `היי {{displayName}} 👋
השיבוץ שלך למשמרת בתאריך {{dow}}, {{date}} בוטל על ידי המנהל/ת.
לפרטים: {{portalLink}}`,
    employee_submission_approved: `היי {{displayName}} 👋
המשמרת שלך ב-{{dow}}, {{date}} אושרה ({{duty}}).
פרטים בפורטל העובדים: {{portalLink}}`,
    employee_submission_rejected: `היי {{displayName}} 👋
המשמרת שהגשת ל-{{dow}}, {{date}} לא אושרה.
לפרטים: {{portalLink}}`,
    employee_shift_offer_standby: `היי {{displayName}} 👋
התפנתה משמרת בסדנת {{workshopName}} בתאריך {{date}}.
ההצעה שמורה לך לשעה הקרובה — לאישור יש להיכנס לפורטל העובדים:
{{portalLink}}`,
    manager_open_call: `⚠️ דרוש/ה עובד/ת לסדנת {{workshopName}} בתאריך {{date}} — אין ממתינים ברשימת ההמתנה. נפתחה קריאה פתוחה בפורטל.`,
    employee_auto_assigned_booking: `היי {{displayName}} 👋
התקבלה הזמנה לסדנת {{workshopName}} בתאריך {{date}} — שובצת אוטומטית למשמרת! 🎉
פרטים בפורטל העובדים: {{portalLink}}`,
    employee_confirm_request_shortnotice: `היי {{displayName}} 👋
התקבלה הזמנה לסדנת {{workshopName}} בתאריך {{date}} (פחות מ-{{hoursWindow}} שעות מראש).
כדי להשלים את השיבוץ נדרש אישורך — ההצעה שמורה לך לשעה הקרובה בפורטל העובדים:
{{portalLink}}`,
    employee_availability_deadline_reminder: `היי {{displayName}} 👋
תזכורת מסטודיו האפי: נותרו {{daysUntilDeadline}} ימים להגשת זמינות לשבועיים {{periodStart}}–{{periodEnd}}.
הוגשו {{quotaSubmitted}} מתוך {{quotaRequired}} משמרות נדרשות.
להגשה: {{portalLink}}`,
    employee_preworkshop_confirm: `{{prefix}}היי {{displayName}} 👋
יש לך משמרת בסדנת {{workshopName}} בתאריך {{date}}{{timeSuffix}}.
נא לאשר הגעה (או לעדכן שלא) בקישור:
{{confirmLink}}`,
    manager_confirmation_escalation: `⚠️ {{displayName}} לא אישר/ה הגעה למשמרת בסדנת {{workshopName}} בתאריך {{date}} ({{time}}). מומלץ ליצור קשר.`,
    manager_employee_declined_confirmation: `❌ {{employeeName}} ביטל/ה הגעה למשמרת בסדנת {{workshopName}} בתאריך {{date}}.{{notesLine}}
המערכת מחפשת מחליף/ה אוטומטית.`,
    employee_swap_request_target: `🔄 בקשת החלפת משמרת מ-{{requesterName}}
סדנה: {{workshopName}}
תאריך ושעה: {{date}} · {{startTime}}–{{endTime}}
לאישור/דחייה יש להיכנס לחשבונך ולפתוח את הקישור:
{{swapLink}}`,
    employee_swap_declined_by_target: `❌ {{targetName}} לא אישר/ה את בקשת ההחלפה למשמרת בתאריך {{date}} ({{workshopName}}).`,
    employee_swap_accepted_by_target: `✔ {{targetName}} אישר/ה את בקשת ההחלפה למשמרת בתאריך {{date}} ({{workshopName}}) — הבקשה הועברה לאישור מנהל/ת.`,
    manager_swap_pending_approval: `🔄 בקשת החלפת משמרת ממתינה לאישורכם
בין {{requesterName}} (מבקש/ת) ל-{{targetName}} (מחליף/ה)
סדנה: {{workshopName}}
תאריך ושעה: {{date}} · {{startTime}}–{{endTime}}
שני הצדדים אישרו — לאישור סופי: {{swapLink}}`,
    employee_swap_manager_approved: `✅ ההחלפה אושרה סופית! המשמרת {{detail}} עודכנה במערכת.`,
    employee_swap_manager_declined: `❌ בקשת ההחלפה למשמרת {{detail}} נדחתה על ידי המנהל/ת.{{commentLine}}`,
    manager_shift_change_request: `📋 בקשת {{requestTypeLabel}} משמרת מ-{{employeeName}}
משמרת קיימת: {{date}} · {{existingStart}}–{{existingEnd}}
{{requestedLine}}
{{notesLine}}
לאישור/דחייה: {{reviewLink}}`,
};

/**
 * Inserts (or optionally updates) all 20 employee-system WhatsApp templates
 * into WhatsApp_Templates. Idempotent: skips rows that already exist unless
 * overwrite=true.
 *
 * @param {{ overwrite?: boolean }} [options]
 */
export const seedEmployeeWhatsAppTemplates = webMethod(Permissions.Admin, async (options = {}) => {
    const overwrite = options?.overwrite === true;

    const existingResult = await wixData.query('WhatsApp_Templates')
        .eq('use', TEMPLATE_USE.EMPLOYEES)
        .limit(1000)
        .find(SA)
        .catch(() => ({ items: [] }));

    const byActionKey = {};
    for (const row of (existingResult.items || [])) {
        if (row.actionKey) byActionKey[row.actionKey] = row;
    }

    const report = { inserted: [], updated: [], skipped: [], errors: [] };

    for (const [actionKey, meta] of Object.entries(EMPLOYEE_ACTION_KEYS)) {
        const messageBody = EMPLOYEE_TEMPLATE_SEEDS[actionKey];
        if (!messageBody) {
            report.errors.push({ actionKey, reason: 'missing seed body in TEST.web.js' });
            continue;
        }

        const title = meta.label;
        const existing = byActionKey[actionKey];

        try {
            if (existing) {
                if (!overwrite) {
                    report.skipped.push({ actionKey, id: existing._id });
                    continue;
                }
                const saved = await wixData.update('WhatsApp_Templates', {
                    ...existing,
                    title,
                    messageBody,
                    use: TEMPLATE_USE.EMPLOYEES,
                    actionKey,
                    isSystem: true,
                }, SA);
                report.updated.push({ actionKey, id: saved._id });
            } else {
                const saved = await wixData.insert('WhatsApp_Templates', {
                    title,
                    messageBody,
                    use: TEMPLATE_USE.EMPLOYEES,
                    actionKey,
                    isSystem: true,
                }, SA);
                report.inserted.push({ actionKey, id: saved._id });
            }
        } catch (err) {
            report.errors.push({ actionKey, reason: err?.message || String(err) });
        }
    }

    console.log('[TEST] seedEmployeeWhatsAppTemplates:', JSON.stringify({
        inserted: report.inserted.length,
        updated: report.updated.length,
        skipped: report.skipped.length,
        errors: report.errors.length,
    }));

    return {
        ok: !report.errors.length,
        overwrite,
        totalSeeds: Object.keys(EMPLOYEE_ACTION_KEYS).length,
        ...report,
    };
});

const DEFAULT_STAFF_MEMBER_ID = '997e9b7c-cb6d-4598-bcd9-2e6743a9a2e7';

/** Returns raw getStaffMember response for a Bookings staff _id. */
export const getStaffMemberTest = webMethod(Permissions.Admin, async (staffMemberId = DEFAULT_STAFF_MEMBER_ID) => {
    const id = String(staffMemberId || DEFAULT_STAFF_MEMBER_ID).trim();
    const response = await staffMembers.getStaffMember(id);
    return {
        ok: true,
        staffMemberId: id,
        response,
        staffMember: response?.staffMember || response,
    };
});

/** Runs listBookingStaff and shows connectedStaff ↔ queryStaffMembers matching per employee. */
export const testBookingsStaffLink = webMethod(Permissions.Admin, async () => {
    const data = await listBookingStaff();
    const staffIdSet = new Set((data?.staffIds || []).map(id => String(id).toLowerCase()));
    const employees = (data?.allEmployees || []).map((e) => {
        const connectedId = String(e.connectedStaffId || e.staffId || '').toLowerCase();
        return {
            roleId: e.id,
            displayName: e.displayName,
            connectedStaffId: connectedId || null,
            bookingsLinked: e.bookingsLinked,
            idInStaffQuery: connectedId ? staffIdSet.has(connectedId) : false,
        };
    });
    return {
        ok: true,
        staffCount: data?.staffIds?.length ?? 0,
        employeesWithConnectedStaff: employees.filter(e => e.connectedStaffId),
        linkedCount: employees.filter(e => e.bookingsLinked).length,
        employees,
        staffSample: (data?.staff || []).slice(0, 5),
    };
});
