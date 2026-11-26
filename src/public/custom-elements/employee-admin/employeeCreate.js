/**
 * "New employee" modal for the admin tab. Submits `adminCreateEmployee`, which creates the
 * Wix Bookings staff member (createStaffMember) and the linked Dashboard_Roles row.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const NEW_EMP_STYLE = `
.epn-hint { font-size: 11.5px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 10px; margin-bottom: 4px; line-height: 1.5; }
.epn-req { color: #dc2626; }
.epn-sec { grid-column: 1 / -1; font-size: 12px; font-weight: 700; color: #334155; margin: 6px 0 -2px; }
`;

function readForm(ce) {
    const v = (id) => ce.querySelector(`#epaN_${id}`)?.value ?? '';
    return {
        displayName: v('displayName').trim(),
        userEmail: v('userEmail').trim(),
        phone: v('phone').trim(),
        roleType: v('roleType'),
        color: v('color'),
        seniority: v('seniority').trim(),
        minShiftsPerWeek: v('minShiftsPerWeek'),
        minShiftHours: v('minShiftHours'),
        requiredFridaysPerMonth: v('reqFridays'),
        requiredSaturdaysPerMonth: v('reqSaturdays'),
        rateStudio: v('rateStudio'),
        rateInstruction: v('rateInstruction'),
        rateWool: v('rateWool'),
        skillIds: [...ce.querySelectorAll('.epaN-skill:checked')].map(x => x.value),
    };
}

/** Keeps typed values across full re-renders while the modal is open. */
export function captureNewEmployeeDraft(ce) {
    if (ce._adminModal?.type !== 'newEmployee' || !ce.querySelector('#epaN_displayName')) return;
    ce._newEmpDraft = readForm(ce);
}

function validate(f) {
    if (!f.displayName) return 'יש להזין שם מלא.';
    if (f.displayName.length > 40) return 'השם ארוך מדי (עד 40 תווים).';
    if (f.userEmail && !EMAIL_RE.test(f.userEmail)) return 'כתובת האימייל אינה תקינה.';
    const digits = f.phone.replace(/\D/g, '');
    if (f.phone && (digits.length < 9 || digits.length > 15)) return 'מספר הטלפון אינו תקין.';
    return null;
}

export function renderNewEmployeeForm(ce, d) {
    const f = ce._newEmpDraft || { roleType: 'Employee', color: '#2563eb', skillIds: [] };
    const field = (id, label, attrs = '', val = f[id]) =>
        `<div><label>${label}</label><input id="epaN_${id}" value="${esc(val ?? '')}" ${attrs}></div>`;
    const skills = (d.workshopTypes || []).map(w => `<label><input type="checkbox" class="epaN-skill" value="${esc(w.id)}" ${(f.skillIds || []).includes(w.id) ? 'checked' : ''}> ${esc(w.name)}</label>`).join('');
    const rates = d.permissions?.manageRates ? `
        <div class="epn-sec">תעריפים</div>
        ${field('rateStudio', 'תעריף סטודיו', 'type="number" min="0"')}
        ${field('rateInstruction', 'תעריף הדרכה', 'type="number" min="0"')}
        ${field('rateWool', 'תעריף צמר', 'type="number" min="0"')}` : '';
    return `<div class="epn-hint">העובד/ת ייווצר/תיווצר ב-Wix Bookings ויקושר/תקושר אוטומטית לפרופיל במערכת. ההרשאות נקבעות לפי התפקיד וניתן לשנות אותן אחר כך בהגדרות העובד/ת.<br>
            <b>אימייל:</b> אותו מייל שאיתו העובד/ת מתחבר/ת לאתר — כך הפורטל יזהה אותו/ה.</div>
        <div class="epa-form">
            <div class="epn-sec">פרטים אישיים</div>
            ${field('displayName', 'שם מלא <span class="epn-req">*</span>', 'maxlength="40"')}
            ${field('userEmail', 'אימייל להתחברות', 'type="email" dir="ltr"')}
            ${field('phone', 'טלפון (וואטסאפ)', 'type="tel" dir="ltr" placeholder="05X-XXXXXXX"')}
            <div><label>תפקיד</label><select id="epaN_roleType">${(d.roleTypes || []).map(r => `<option value="${esc(r.value)}" ${f.roleType === r.value ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div><label>צבע בלוח</label><input id="epaN_color" type="color" value="${esc(f.color || '#2563eb')}"></div>
            ${field('seniority', 'ותק')}
            <div class="epn-sec">מכסות (ריק = ברירת המחדל של המערכת)</div>
            ${field('minShiftsPerWeek', 'משמרות בשבוע', 'type="number" min="0"')}
            ${field('minShiftHours', 'אורך משמרת מינימלי (שעות)', 'type="number" min="0"')}
            ${field('reqFridays', 'ימי שישי בחודש', 'type="number" min="0"', f.requiredFridaysPerMonth)}
            ${field('reqSaturdays', 'ימי שבת בחודש', 'type="number" min="0"', f.requiredSaturdaysPerMonth)}
            ${rates}
            <div class="epn-sec">הכשרות</div>
            <div class="epa-skills">${skills || '<span class="ep-empty">אין סוגי סדנאות מוגדרים</span>'}</div>
        </div>
        <div class="epa-inline">
            <button type="button" class="epa-btn primary" data-action="admin-newemp-submit">יצירת עובד/ת</button>
            <button type="button" class="epa-btn" data-action="admin-close-modal">ביטול</button>
        </div>`;
}

export function handleNewEmployeeClick(ce, action, target) {
    const d = ce._adminData;
    switch (action) {
        case 'admin-new-staff':
            if (!d?.permissions?.manageEmployees) return true;
            ce._adminModal = { type: 'newEmployee' };
            ce.render();
            return true;
        case 'admin-newemp-submit': {
            const form = readForm(ce);
            ce._newEmpDraft = form;
            const error = validate(form);
            if (error) { ce._toast(error, 'error'); return true; }
            ce._startBusy('יוצר עובד/ת ב-Bookings…');
            ce._dispatch('adminCreateEmployee', { input: form });
            return true;
        }
        case 'admin-newemp-for-profile':
            if (!d?.permissions?.manageEmployees) return true;
            ce._adminModal = null;
            ce._startBusy('יוצר עובד/ת ב-Bookings…');
            ce._dispatch('adminCreateEmployee', { input: { roleId: target.dataset.emp } });
            return true;
        default:
            return false;
    }
}

/** Returns true when it handled the result. */
export function handleNewEmployeeResult(ce, result) {
    if (result?.type !== 'adminCreateEmployee' || !result.ok) return false;
    ce._newEmpDraft = null;
    ce._adminModal = null;
    ce._busy = null;
    ce._clearBusyOverlay();
    ce._toast('העובד/ת נוצר/ה ב-Bookings וקושר/ה למערכת.', 'success');
    return true;
}
