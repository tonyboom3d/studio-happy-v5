/**
 * Employee-system WhatsApp templates — resolves the actual message text for
 * a given action from the `WhatsApp_Templates` CMS collection (use='employees',
 * matched by `actionKey`), renders `{{placeholder}}` variables, and sends it.
 *
 * If no CMS row exists for an actionKey, the send is skipped entirely and
 * managers are alerted via WhatsApp instead (throttled to once/day per
 * actionKey, in-memory — resets on redeploy/cold start, which is fine for an
 * ops alert).
 *
 * Every actionKey below is a permanent (isSystem=true) CMS row: managers can
 * edit its title/body freely, but it can't be deleted (see deleteStaffTemplate
 * in staffAdminService.web.js) and the mapping to the action stays intact.
 */
import wixData from 'wix-data';
import { getRolePermissionValue } from 'backend/staffRoles.js';
import { sendGreenApiWhatsApp } from 'backend/whatsappService.jsw';
import { TEMPLATE_USE } from 'backend/whatsappTemplates.js';

const SA = { suppressAuth: true };

export const EMPLOYEE_ACTION_KEYS = {
    employee_availability_nudge: {
        label: 'תזכורת הגשת זמינות (יזום ע"י מנהל)',
        placeholders: ['displayName', 'monthKey', 'portalLink'],
    },
    employee_shift_assigned: {
        label: 'שיבוץ למשמרת (ידני)',
        placeholders: ['displayName', 'detail', 'dow', 'date', 'portalLink'],
    },
    employee_shift_cancelled: {
        label: 'ביטול שיבוץ למשמרת',
        placeholders: ['displayName', 'dow', 'date', 'portalLink'],
    },
    employee_submission_approved: {
        label: 'אישור הגשת משמרת',
        placeholders: ['displayName', 'dow', 'date', 'duty', 'portalLink'],
    },
    employee_submission_rejected: {
        label: 'דחיית הגשת משמרת',
        placeholders: ['displayName', 'dow', 'date', 'portalLink'],
    },
    employee_shift_offer_standby: {
        label: 'הצעת משמרת ממתינה (רשימת המתנה)',
        placeholders: ['displayName', 'workshopName', 'date', 'portalLink'],
    },
    manager_open_call: {
        label: 'קריאה פתוחה למנהלים — חסר עובד',
        placeholders: ['workshopName', 'date'],
    },
    employee_auto_assigned_booking: {
        label: 'שיבוץ אוטומטי עקב הזמנה חדשה',
        placeholders: ['displayName', 'workshopName', 'date', 'portalLink'],
    },
    employee_confirm_request_shortnotice: {
        label: 'הצעת שיבוץ בהתראה קצרה (דורש אישור)',
        placeholders: ['displayName', 'workshopName', 'date', 'hoursWindow', 'portalLink'],
    },
    employee_availability_deadline_reminder: {
        label: 'תזכורת דדליין הגשת זמינות (אוטומטי)',
        placeholders: ['displayName', 'daysUntilDeadline', 'periodStart', 'periodEnd', 'quotaSubmitted', 'quotaRequired', 'portalLink'],
    },
    employee_preworkshop_confirm: {
        label: 'אישור הגעה לפני סדנה (תזכורת שלב 1/2)',
        placeholders: ['prefix', 'displayName', 'workshopName', 'date', 'timeSuffix', 'confirmLink'],
    },
    manager_confirmation_escalation: {
        label: 'התראת מנהלים — אין אישור הגעה',
        placeholders: ['displayName', 'workshopName', 'date', 'time'],
    },
    manager_employee_declined_confirmation: {
        label: 'התראת מנהלים — עובד ביטל הגעה',
        placeholders: ['employeeName', 'workshopName', 'date', 'notesLine'],
    },
    employee_swap_request_target: {
        label: 'בקשת החלפת משמרת — לעובד המחליף',
        placeholders: ['requesterName', 'workshopName', 'date', 'startTime', 'endTime', 'swapLink'],
    },
    employee_swap_declined_by_target: {
        label: 'החלפת משמרת נדחתה ע"י המחליף (למבקש)',
        placeholders: ['targetName', 'date', 'workshopName'],
    },
    employee_swap_accepted_by_target: {
        label: 'החלפת משמרת אושרה ע"י המחליף (למבקש)',
        placeholders: ['targetName', 'date', 'workshopName'],
    },
    manager_swap_pending_approval: {
        label: 'בקשת החלפה ממתינה לאישור מנהל',
        placeholders: ['requesterName', 'targetName', 'workshopName', 'date', 'startTime', 'endTime', 'swapLink'],
    },
    employee_swap_manager_approved: {
        label: 'החלטת מנהל בבקשת החלפה — אושרה',
        placeholders: ['detail'],
    },
    employee_swap_manager_declined: {
        label: 'החלטת מנהל בבקשת החלפה — נדחתה',
        placeholders: ['detail', 'commentLine'],
    },
    manager_shift_change_request: {
        label: 'בקשת שינוי/מחיקת משמרת למנהלים',
        placeholders: ['employeeName', 'requestTypeLabel', 'date', 'existingStart', 'existingEnd', 'requestedLine', 'notesLine', 'reviewLink'],
    },
};

/** Replaces {{key}} tokens; unknown/missing vars render as empty string. */
export function renderTemplate(body, vars = {}) {
    return String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
        const v = vars[key];
        return v === undefined || v === null ? '' : String(v);
    });
}

async function getEmployeeTemplateBody(actionKey) {
    const result = await wixData.query('WhatsApp_Templates')
        .eq('use', TEMPLATE_USE.EMPLOYEES)
        .eq('actionKey', actionKey)
        .limit(1).find(SA).catch(() => ({ items: [] }));
    const row = result.items?.[0];
    return row?.messageBody || null;
}

// actionKey -> 'YYYY-MM-DD' of the last manager alert sent for it (in-memory, once/day).
const _missingAlertedOn = new Map();

async function alertManagersMissingTemplate(actionKey) {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (_missingAlertedOn.get(actionKey) === todayKey) return;
    _missingAlertedOn.set(actionKey, todayKey);

    const label = EMPLOYEE_ACTION_KEYS[actionKey]?.label || actionKey;
    const message = [
        `⚠️ חסרה תבנית וואטסאפ במערכת העובדים`,
        `פעולה: ${label}`,
        `מפתח (actionKey): ${actionKey}`,
        `ההודעה לא נשלחה. יש להוסיף תבנית ב-CMS (WhatsApp_Templates, use=employees, actionKey=${actionKey}).`,
    ].join('\n');

    try {
        const result = await wixData.query('Dashboard_Roles').ne('active', false).limit(1000).find(SA);
        const managers = (result.items || []).filter(r => getRolePermissionValue(r, 'manageScheduling') && r.phone);
        for (const m of managers) {
            await sendGreenApiWhatsApp(m.phone, message).catch(err =>
                console.error('[employeeTemplates] manager alert failed:', err?.message || err));
        }
    } catch (err) {
        console.error('[employeeTemplates] alertManagersMissingTemplate failed:', err?.message || err);
    }
}

/**
 * Resolves the CMS template for `actionKey`, renders it with `vars`, and
 * sends it to `phone`. If the template is missing, skips the send and
 * alerts managers (throttled). Returns true if a message was sent.
 */
export async function sendEmployeeTemplateMessage(actionKey, phone, vars = {}) {
    if (!phone) {
        console.warn(`[employeeTemplates] no phone for actionKey=${actionKey} — skipping send`);
        return false;
    }
    const body = await getEmployeeTemplateBody(actionKey);
    if (!body) {
        console.warn(`[employeeTemplates] missing template for actionKey=${actionKey}`);
        await alertManagersMissingTemplate(actionKey);
        return false;
    }
    const rendered = renderTemplate(body, vars);
    await sendGreenApiWhatsApp(phone, rendered).catch(err =>
        console.error(`[employeeTemplates] send failed for actionKey=${actionKey}:`, err?.message || err));
    return true;
}

/** Sends the same rendered message to every manager (manageScheduling + phone). Same missing-template handling as sendEmployeeTemplateMessage. */
export async function sendEmployeeTemplateToManagers(actionKey, vars = {}, rolesById = null) {
    const body = await getEmployeeTemplateBody(actionKey);
    if (!body) {
        console.warn(`[employeeTemplates] missing template for actionKey=${actionKey}`);
        await alertManagersMissingTemplate(actionKey);
        return 0;
    }
    const rendered = renderTemplate(body, vars);
    const roles = rolesById
        ? Object.values(rolesById)
        : (await wixData.query('Dashboard_Roles').ne('active', false).limit(1000).find(SA).catch(() => ({ items: [] }))).items || [];
    const managers = roles.filter(r => getRolePermissionValue(r, 'manageScheduling') && r.phone);
    for (const m of managers) {
        await sendGreenApiWhatsApp(m.phone, rendered).catch(err =>
            console.error('[employeeTemplates] manager send failed:', err?.message || err));
    }
    return managers.length;
}
