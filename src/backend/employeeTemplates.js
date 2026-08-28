/**
 * Employee-system notifications — sent via ManyChat (see manychatService.jsw
 * → sendStaffManyChat), not Green API. The actual approved WhatsApp message
 * content lives in the ManyChat flow itself, routed by the `actionKey`
 * (custom field `action_key`); the CMS `WhatsApp_Templates` rows below are
 * kept only as a **read-only reference/preview** of what each actionKey's
 * message looks like — editing them no longer changes what gets sent.
 */
import wixData from 'wix-data';
import { getRolePermissionValue } from 'backend/staffRoles.js';
import { sendStaffManyChat } from 'backend/manychatService.jsw';

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
    employee_shifts_digest: {
        label: 'סיכום שיבוצים מרוכז (אוטומטי — נשלח במקום כמה הודעות בודדות)',
        placeholders: ['displayName', 'count', 'shiftList', 'portalLink'],
    },
    manager_notifications_digest: {
        label: 'סיכום התראות מרוכז למנהלים (אוטומטי)',
        placeholders: ['count', 'itemList'],
    },
    employee_pending_items_alert: {
        label: 'התראה על פריטים ממתינים לאישור (קישור מרוכז)',
        placeholders: ['displayName', 'count', 'pendingLink'],
    },
    manager_pending_items_alert: {
        label: 'התראה למנהלים על פריטים ממתינים לאישור (קישור מרוכז)',
        placeholders: ['count', 'pendingLink'],
    },
};

/** Replaces {{key}} tokens; unknown/missing vars render as empty string. */
export function renderTemplate(body, vars = {}) {
    return String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
        const v = vars[key];
        return v === undefined || v === null ? '' : String(v);
    });
}

/**
 * Sends one employee notification via ManyChat (action_key + vars →
 * ManyChat custom fields, shared staff flow). Returns true if actually sent
 * (false on missing phone or ManyChat failure — sendStaffManyChat never throws).
 */
export async function sendEmployeeTemplateMessage(actionKey, phone, vars = {}, audience = 'employee') {
    if (!phone) {
        console.warn(`[employeeTemplates] no phone for actionKey=${actionKey} — skipping send`);
        return false;
    }
    const result = await sendStaffManyChat(actionKey, phone, audience, vars);
    return !!result.sent;
}

/** Sends the same notification to every manager (manageScheduling + phone) via ManyChat. */
export async function sendEmployeeTemplateToManagers(actionKey, vars = {}, rolesById = null) {
    const roles = rolesById
        ? Object.values(rolesById)
        : (await wixData.query('Dashboard_Roles').ne('active', false).limit(1000).find(SA).catch(() => ({ items: [] }))).items || [];
    const managers = roles.filter(r => getRolePermissionValue(r, 'manageScheduling') && r.phone);
    let sent = 0;
    for (const m of managers) {
        const result = await sendStaffManyChat(actionKey, m.phone, 'manager', vars);
        if (result.sent) sent++;
    }
    return sent;
}
