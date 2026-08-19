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
import { staffMembers, addOns, services, serviceOptionsAndVariants } from '@wix/bookings';
import { auth } from '@wix/essentials';
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
    employee_shifts_digest: `היי {{displayName}} 👋
עדכון מרוכז על {{count}} שינויי שיבוץ:

{{shiftList}}

פרטים בפורטל העובדים: {{portalLink}}`,
    manager_notifications_digest: `📋 סיכום {{count}} התראות ממתינות:

{{itemList}}`,
    employee_pending_items_alert: `היי {{displayName}} 👋
יש לך {{count}} פריטים ממתינים לאישור (אישורי הגעה / הצעות / החלפות).
לטיפול מרוכז בקישור אחד:
{{pendingLink}}`,
    manager_pending_items_alert: `📋 יש {{count}} בקשות ממתינות לאישור מנהל/ת.
לטיפול מרוכז בקישור אחד:
{{pendingLink}}`,
};

/**
 * Inserts (or optionally updates) all employee-system WhatsApp templates
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

// Candles workshop ("סדנת נרות") service IDs — used only to look up which
// add-on groups belong to each candles service (see bookingService.web.js
// for the canonical copy).
const CANDLES_SERVICE_IDS_FOR_TEST = {
    a: 'eb8fec0e-5d04-48a3-a795-e3e8051d07da',
    b: 'f0f6e447-02d8-4808-80ba-3c380ce9eae8',
};

/**
 * Lists every add-on in the site (up to 100) plus, for each candles service,
 * which add-on groups/add-ons are already attached to it. Run this once from
 * the Velo backend console to find the "נר נוסף" add-on's _id per service:
 *
 *   import { listCandlesAddOns } from 'backend/TEST.web.js';
 *   listCandlesAddOns().then(console.log);
 *
 *   import { getCeramicsServiceTest } from 'backend/TEST.web.js';
 *   getCeramicsServiceTest().then(console.log);
 */
export const listCandlesAddOns = webMethod(Permissions.Admin, async () => {
    const elevatedQueryAddOns = auth.elevate(addOns.queryAddOns);
    const elevatedListGroups = auth.elevate(services.listAddOnGroupsByServiceId);

    const allAddOnsResult = await elevatedQueryAddOns({ cursorPaging: { limit: 100 } });
    const allAddOns = (allAddOnsResult?.addOns || []).map((a) => ({
        _id: a._id,
        name: a.name,
        price: a.price,
        maxQuantity: a.maxQuantity,
        durationInMinutes: a.durationInMinutes,
    }));

    const byService = {};
    for (const [key, serviceId] of Object.entries(CANDLES_SERVICE_IDS_FOR_TEST)) {
        try {
            const groupsResult = await elevatedListGroups(serviceId);
            byService[key] = {
                serviceId,
                addOnGroups: (groupsResult?.addOnGroups || []).map((g) => ({
                    _id: g._id,
                    name: g.name,
                    addOns: (g.addOns || []).map((a) => ({ _id: a._id, name: a.name, price: a.price })),
                })),
            };
        } catch (err) {
            byService[key] = { serviceId, error: err?.message || String(err) };
        }
    }

    console.log('[TEST] listCandlesAddOns — allAddOns:', JSON.stringify(allAddOns));
    console.log('[TEST] listCandlesAddOns — byService:', JSON.stringify(byService));

    return { ok: true, allAddOns, byService };
});

// Ceramics workshop ("סדנת קרמיקה") — consolidated service with ticket variants.
const CERAMICS_SERVICE_ID_FOR_TEST = 'ad89914a-1845-48c6-804d-544cd17f179b';

/**
 * Fetches the ceramics Bookings service + ticket variants (serviceOptionsAndVariants)
 * so you can inspect pricing/choice labels before wiring createAndCheckout.
 *
 *   import { getCeramicsServiceTest } from 'backend/TEST.web.js';
 *   getCeramicsServiceTest().then(console.log);
 *
 * @param {string} [serviceId] — defaults to CERAMICS_SERVICE_ID_FOR_TEST
 */
export const getCeramicsServiceTest = webMethod(Permissions.Admin, async (serviceId = CERAMICS_SERVICE_ID_FOR_TEST) => {
    const id = String(serviceId || CERAMICS_SERVICE_ID_FOR_TEST).trim();
    const elevatedGetService = auth.elevate(services.getService);
    const elevatedListGroups = auth.elevate(services.listAddOnGroupsByServiceId);

    let service = null;
    let serviceError = null;
    try {
        service = await elevatedGetService(id);
    } catch (err) {
        serviceError = err?.message || String(err);
    }

    let optionsAndVariantsRaw = null;
    let optionsAndVariantsError = null;
    let variantsSummary = [];
    try {
        const response = await serviceOptionsAndVariants.queryServiceOptionsAndVariants({
            filter: { serviceId: { $in: [id] } },
        });
        optionsAndVariantsRaw = response;
        const list = response?.serviceOptionsAndVariantsList || [];
        for (const item of list) {
            const variants = item.variants?.values || [];
            for (const variant of variants) {
                const choice = variant.choices?.[0] || {};
                // This service's option is DATE_TIME (day/hour rule), not CUSTOM —
                // the ticket name and weekday/weekend rule live under
                // choice.dateTime, not choice.custom (which candles/tufting use).
                const dateTime = choice.dateTime || null;
                const choiceLabel = choice.custom || dateTime?.name || '';
                variantsSummary.push({
                    serviceId: item.serviceId,
                    choiceLabel,
                    optionId: choice.optionId || null,
                    days: dateTime?.hoursAndDaysRule?.days || null,
                    startTime: dateTime?.hoursAndDaysRule?.startTime || null,
                    endTime: dateTime?.hoursAndDaysRule?.endTime || null,
                    ruleType: dateTime?.ruleType || null,
                    price: variant.price?.value != null ? parseFloat(variant.price.value) : null,
                    currency: variant.price?.currency || item.minPrice?.currency || 'ILS',
                    variantId: variant._id || variant.id || null,
                });
            }
        }
    } catch (err) {
        optionsAndVariantsError = err?.message || String(err);
    }

    let addOnGroups = null;
    let addOnGroupsError = null;
    try {
        const groupsResult = await elevatedListGroups(id);
        addOnGroups = (groupsResult?.addOnGroups || []).map((g) => ({
            _id: g._id,
            name: g.name,
            addOns: (g.addOns || []).map((a) => ({
                _id: a._id,
                name: a.name,
                price: a.price,
                maxQuantity: a.maxQuantity,
            })),
        }));
    } catch (err) {
        addOnGroupsError = err?.message || String(err);
    }

    const result = {
        ok: !serviceError,
        serviceId: id,
        service,
        serviceError,
        optionsAndVariantsRaw,
        optionsAndVariantsError,
        variantsSummary,
        addOnGroups,
        addOnGroupsError,
    };

    console.log('[TEST] getCeramicsServiceTest:', JSON.stringify({
        serviceId: id,
        serviceName: service?.name || service?.service?.name || null,
        variantsCount: variantsSummary.length,
        variantsSummary,
        addOnGroupsCount: addOnGroups?.length ?? 0,
        serviceError,
        optionsAndVariantsError,
        addOnGroupsError,
    }));

    return result;
});

/**
 * Lists every add-on in the site (up to 100) plus the add-on groups/add-ons
 * already attached to the ceramics ("סדנת קרמיקה") service — used to find
 * the real add-on _id/groupId/price for "כלי קרמיקה נוסף" before switching
 * it from a custom checkout line item to a real Wix Bookings add-on:
 *
 *   import { getCeramicsAddOnsTest } from 'backend/TEST.web.js';
 *   getCeramicsAddOnsTest().then(console.log);
 *
 * @param {string} [serviceId] — defaults to CERAMICS_SERVICE_ID_FOR_TEST
 */
export const getCeramicsAddOnsTest = webMethod(Permissions.Admin, async (serviceId = CERAMICS_SERVICE_ID_FOR_TEST) => {
    const id = String(serviceId || CERAMICS_SERVICE_ID_FOR_TEST).trim();
    const elevatedQueryAddOns = auth.elevate(addOns.queryAddOns);
    const elevatedListGroups = auth.elevate(services.listAddOnGroupsByServiceId);

    const allAddOnsResult = await elevatedQueryAddOns({ cursorPaging: { limit: 100 } });
    const allAddOns = (allAddOnsResult?.addOns || []).map((a) => ({
        _id: a._id,
        name: a.name,
        price: a.price,
        maxQuantity: a.maxQuantity,
        durationInMinutes: a.durationInMinutes,
    }));

    let addOnGroups = null;
    let addOnGroupsError = null;
    try {
        const groupsResult = await elevatedListGroups(id);
        addOnGroups = (groupsResult?.addOnGroups || []).map((g) => ({
            _id: g._id,
            name: g.name,
            addOns: (g.addOns || []).map((a) => ({
                _id: a._id,
                name: a.name,
                price: a.price,
                maxQuantity: a.maxQuantity,
            })),
        }));
    } catch (err) {
        addOnGroupsError = err?.message || String(err);
    }

    const result = { ok: true, serviceId: id, allAddOns, addOnGroups, addOnGroupsError };

    console.log('[TEST] getCeramicsAddOnsTest:', JSON.stringify(result));

    return result;
});
