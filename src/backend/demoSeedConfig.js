/**
 * Demo seed configuration — ערוך ערכים לפני הרצת seedEmployeePortalDemo.
 *
 * connectedStaffId — Reference ב-CMS: connectedStaff → Bookings/Staff.
 *   _id של עובד הצוות. חובה אם אין שורת Dashboard_Roles. ראה staffList בתשובת ה-seed.
 *
 * memberUserId — Reference ב-CMS: userId → privateMembersData.
 *   _id של החבר באתר (אותו מזהה שמופיע ב-Members). אם ריק — ניסיון איתור לפי employeeEmail.
 *
 * skillWorkshopIds — Multi-reference: skills → workshops.
 *   אם ריק, משתמש בכל הסדנאות מ-CMS.
 */
export const DEMO_SEED_CONFIG = {
    employeeEmail: 'tonyboom3d@gmail.com',
    displayName: 'טוני בדיקה',
    phone: '972501234567',

    // ▼ השלם ב-CMS או כאן (ערכי _id של האוספים המקושרים) ▼
    connectedStaffId: null,
    memberUserId: null,
    skillWorkshopIds: [],

    roleType: 'Employee',
    color: '#7C3AED',
    seniority: 'ותיק',
    priorityRank: 1,
    minShiftsPerMonth: 3,
    minShiftHours: 4,
};
