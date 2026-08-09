/**
 * Shared staff role & permission logic (Module F).
 *
 * Single source of truth for the Dashboard_Roles permission model, used by
 * both dashboardService.web.js (admin dashboard) and employeeService.web.js
 * (employee portal). Permission semantics are identical to the original
 * dashboardService implementation: dedicated boolean field on the CMS row,
 * legacy `permissions` JSON fallback, then PERMISSION_DEFAULTS.
 */
import wixData from 'wix-data';
import { currentMember } from 'wix-members-backend';

const SA = { suppressAuth: true };

export const ROLE_TYPES = ['Trainee', 'Employee', 'ShiftManager', 'Owner'];

export const ROLE_TYPE_LABELS = {
    Trainee: 'חניכה',
    Employee: 'עובד/ת',
    ShiftManager: 'אחראי/ת משמרת',
    Owner: 'מנהל/ת',
};

export const PERMISSION_KEYS = [
    // Dashboard (existing)
    'viewDashboard',
    'editSketchStatus',
    'rejectSketchStatus',
    'deleteSketchImage',
    'editOrderNotes',
    'sendWhatsApp',
    'manageTemplates',
    'manageRoles',
    // Employee management & scheduling (Module F)
    'submitAvailability',
    'viewTeamSchedule',
    'manageScheduling',
    'manageEmployees',
    'editTimeEntries',
    'manageRates',
    'manageRules',
    // Skills (scales) — gate visibility of skill-specific calendar items.
    'sketchSewingSkill',
    // Placeholder — behavior to be defined later.
    'manageOrdersSystem',
];

export const PERMISSION_DEFAULTS = {
    viewDashboard: true,
    manageRoles: true,
    deleteSketchImage: true,
    editSketchStatus: true,
    editOrderNotes: true,
    sendWhatsApp: true,
    manageTemplates: true,
    // Gates selecting the "לא מאושרת לביצוע" sketch status specifically —
    // independent from the general editSketchStatus permission.
    rejectSketchStatus: true,
    // New keys: sensitive capabilities default to OFF; portal access defaults ON.
    submitAvailability: true,
    viewTeamSchedule: false,
    manageScheduling: false,
    manageEmployees: false,
    editTimeEntries: false,
    manageRates: false,
    manageRules: false,
    sketchSewingSkill: false,
    manageOrdersSystem: false,
};

/** Per-roleType permission presets used when seeding/normalizing role rows. */
export const ROLE_TYPE_PRESETS = {
    Trainee: {
        viewDashboard: false, submitAvailability: true, viewTeamSchedule: false,
        manageScheduling: false, manageEmployees: false, editTimeEntries: false,
        manageRates: false, manageRules: false, manageRoles: false,
    },
    Employee: {
        viewDashboard: false, submitAvailability: true, viewTeamSchedule: false,
        manageScheduling: false, manageEmployees: false, editTimeEntries: false,
        manageRates: false, manageRules: false, manageRoles: false,
    },
    ShiftManager: {
        viewDashboard: true, submitAvailability: true, viewTeamSchedule: true,
        manageScheduling: true, manageEmployees: false, editTimeEntries: false,
        manageRates: false, manageRules: false, manageRoles: false,
    },
    Owner: {
        viewDashboard: true, submitAvailability: true, viewTeamSchedule: true,
        manageScheduling: true, manageEmployees: true, editTimeEntries: true,
        manageRates: true, manageRules: true, manageRoles: true,
    },
};

/** Hebrew labels for each permission key, for admin UI checkboxes. */
export const PERMISSION_LABELS = {
    viewDashboard: 'צפייה בדשבורד הזמנות',
    editSketchStatus: 'עדכון סטטוס סקיצה',
    rejectSketchStatus: 'דחיית סקיצה',
    deleteSketchImage: 'מחיקת תמונת סקיצה',
    editOrderNotes: 'עריכת הערות הזמנה',
    sendWhatsApp: 'שליחת הודעות וואטסאפ',
    manageTemplates: 'ניהול תבניות וואטסאפ',
    manageRoles: 'ניהול הרשאות עובדים',
    submitAvailability: 'הגשת זמינות (פורטל עובדים)',
    viewTeamSchedule: 'צפייה בלוח הצוות',
    manageScheduling: 'ניהול שיבוץ',
    manageEmployees: 'ניהול עובדים (חיבור וערכת פרופיל)',
    editTimeEntries: 'ניהול שעות צוות',
    manageRates: 'צפייה ועדכון תעריפים',
    manageRules: 'ניהול הגדרות, כללים ומועדים',
    sketchSewingSkill: 'תפירת סקיצות',
    manageOrdersSystem: 'מנהל מערכת הזמנות',
};

/** Grouping of permission keys for the admin permissions editor UI. */
export const PERMISSION_GROUPS = [
    { id: 'dashboard', label: 'דשבורד הזמנות', keys: ['viewDashboard', 'editSketchStatus', 'rejectSketchStatus', 'deleteSketchImage', 'editOrderNotes', 'sendWhatsApp', 'manageOrdersSystem'] },
    { id: 'portal', label: 'פורטל עובדים ושיבוץ', keys: ['submitAvailability', 'viewTeamSchedule', 'manageScheduling', 'manageEmployees'] },
    { id: 'hours', label: 'ניהול שעות ותחנות', keys: ['editTimeEntries'] },
    { id: 'sensitive', label: 'הרשאות והגדרות רגישות', keys: ['manageRates', 'manageRules', 'manageTemplates', 'manageRoles'] },
    { id: 'skills', label: 'כישורים מיוחדים', keys: ['sketchSewingSkill'] },
];

/**
 * Builds a full permissions map for a roleType, applying ROLE_TYPE_PRESETS as
 * the base and layering explicit overrides on top. Used both when linking a
 * new employee (roleType-only) and when an authorized editor supplies overrides.
 */
export function buildPermissionsFromPreset(roleType, overrides = {}) {
    const preset = ROLE_TYPE_PRESETS[roleType] || ROLE_TYPE_PRESETS.Employee;
    const out = {};
    for (const key of PERMISSION_KEYS) {
        if (overrides[key] !== undefined) out[key] = !!overrides[key];
        else if (preset[key] !== undefined) out[key] = !!preset[key];
        else out[key] = PERMISSION_DEFAULTS[key] !== false;
    }
    return out;
}

export function getRolePermissionValue(role, key) {
    if (!role) return PERMISSION_DEFAULTS[key] !== false;

    // New CMS structure: top-level boolean field on the Dashboard_Roles row.
    if (Object.prototype.hasOwnProperty.call(role, key)) {
        const direct = role[key];
        if (direct !== undefined && direct !== null) return !!direct;
    }

    // Legacy fallback: permissions JSON object (pre-migration rows).
    const perms = role.permissions;
    if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
        const legacy = perms[key];
        if (legacy !== undefined && legacy !== null) return !!legacy;
    }

    return PERMISSION_DEFAULTS[key] !== false;
}

export function hasPermission(role, key) {
    return getRolePermissionValue(role, key);
}

/** Normalized permissions object for UIs (always booleans, all keys present). */
export function buildPermissionsFromRole(role) {
    const out = {};
    for (const key of PERMISSION_KEYS) {
        out[key] = getRolePermissionValue(role, key);
    }
    return out;
}

// Member → Dashboard_Roles resolution.
// Dashboard_Roles reference fields in CMS:
//   connectedStaff → Bookings/Staff
//   userId         → privateMembersData (site member _id)
// Match order: userEmail, then userId; row must have connectedStaff set.

const MEMBER_FIELDSET_OPTIONS = { fieldsets: ['FULL'] };

export async function getLoggedInMember() {
    return currentMember.getMember(MEMBER_FIELDSET_OPTIONS).catch(() => null);
}

export function extractMemberEmail(member) {
    if (!member) return null;
    return member.loginEmail || member.contactDetails?.emails?.[0] || null;
}

export function extractMemberName(member, email) {
    if (!member) return email || null;
    const fromContact = [member.contactDetails?.firstName, member.contactDetails?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
    if (fromContact) return fromContact;
    const nickname = (member.profile?.nickname || '').trim();
    if (nickname) return nickname;
    return email || null;
}

export async function findDashboardRoleForMember(member) {
    if (!member) return null;

    const email = extractMemberEmail(member);
    if (email) {
        const byEmail = await wixData.query('Dashboard_Roles').eq('userEmail', email).find(SA);
        if (byEmail.items?.[0]) return byEmail.items[0];
    }

    if (member._id) {
        const byUserId = await wixData.query('Dashboard_Roles').eq('userId', member._id).find(SA);
        if (byUserId.items?.[0]) return byUserId.items[0];
    }

    return null;
}

export async function getCurrentRoleRecord(member) {
    const resolvedMember = member || await getLoggedInMember();
    if (!resolvedMember) return null;

    const role = await findDashboardRoleForMember(resolvedMember);
    if (!refId(role?.connectedStaff)) return null;

    return role;
}

/** Multi-ref skills are only reliable with include('skills') — needed for skill checks and calendar day states. */
export async function loadRoleWithSkills(role) {
    if (!role?._id) return role;
    try {
        const result = await wixData.query('Dashboard_Roles')
            .eq('_id', role._id)
            .include('skills')
            .limit(1)
            .find(SA);
        return result.items?.[0] || role;
    } catch (_) {
        return role;
    }
}

/** True when the role row has a linked Bookings/Staff reference. */
export function hasConnectedStaff(role) {
    return !!refId(role?.connectedStaff);
}

/**
 * Employee-portal access gate: role row must exist and grant a specific
 * permission (default: submitAvailability). Returns { member, role }.
 */
export async function assertEmployeeAccess(permissionKey = 'submitAvailability') {
    const member = await getLoggedInMember();
    if (!member) {
        throw new Error('ACCESS_DENIED: No logged-in member.');
    }
    const role = await getCurrentRoleRecord(member);
    if (!role) {
        throw new Error('ACCESS_DENIED: This user is not registered in Dashboard_Roles.');
    }
    if (!hasPermission(role, permissionKey)) {
        throw new Error(`PERMISSION_DENIED:${permissionKey}`);
    }
    return { member, role };
}

// ---------------------------------------------------------------------------
// CMS reference helpers (Dashboard_Roles profile fields)
// ---------------------------------------------------------------------------
// connectedStaff — Reference → Bookings/Staff
// userId         — Reference → privateMembersData
// skills         — Multi-reference → workshops

/** Single Wix reference field → item _id (string or expanded object). */
export function refId(refValue) {
    if (!refValue) return null;
    if (typeof refValue === 'string') return refValue;
    return refValue._id || null;
}

/** Multi-reference field → array of item _ids. */
export function refIds(refValue) {
    if (!refValue) return [];
    const arr = Array.isArray(refValue) ? refValue : [refValue];
    return arr.map((r) => (typeof r === 'string' ? r : r?._id)).filter(Boolean);
}

/**
 * `skills` on Dashboard_Roles — Multi-reference → `workshops`.
 * Returns workshop collection _ids the employee is certified to instruct.
 */
export function getRoleSkillWorkshopIds(role) {
    return refIds(role?.skills);
}

/** True when the role's skills include the given workshops collection item _id. */
export function roleHasWorkshopSkill(role, workshopTypeId) {
    if (!workshopTypeId) return false;
    return getRoleSkillWorkshopIds(role).includes(workshopTypeId);
}
