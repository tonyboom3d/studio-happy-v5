/** Side drawers: workshop session (participants + staff) and day panel (staff + day settings). */
import { fmtDayLong, ilParts, hmToMin } from './calendarLayout.js';
import { calState, findEvent, empById, subFor, onVacation, eventCapacity, coverageIssue, buildEvents } from './calendarStore.js';
import { colorForType } from './calendarColors.js';
import { esc, initials, dayFlags, eventStaffState } from './calendarViews.js';

const WORK_TYPE_LABELS = { WORKSHOP: 'סדנה', OPENING: 'פתיחה', CLOSING: 'קיפול' };
const STATUS_LABELS = { SUBMITTED: 'הגיש/ה זמינות', STANDBY: 'ברשימת המתנה', SCHEDULED: 'משובץ/ת' };

export function groupsKey(dateKey, typeId, start) {
    return start ? `${dateKey}::${typeId}::${start}` : `${dateKey}::${typeId}`;
}

function avatar(emp, fallback) {
    const name = emp?.displayName || fallback || '';
    return `<span class="sc-av" style="background:${esc(emp?.color || '#94a3b8')}">${esc(initials(name))}</span>`;
}

function timeText(ev) {
    if (!ev.start) return 'ללא שעה מוגדרת';
    return `${ilParts(ev.start).hm}${ev.end ? `–${ilParts(ev.end).hm}` : ''}`;
}

function hoursEditor(sub) {
    return `<div class="sc-inline">
        <span style="font-size:12px">שעות משמרת:</span>
        <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="scHoursStart" value="${esc(sub.startTime || '')}" placeholder="HH:MM">
        <span>–</span>
        <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="scHoursEnd" value="${esc(sub.endTime || '')}" placeholder="HH:MM">
        <button type="button" class="sc-btn primary sm" data-action="cal-save-hours" data-sub="${esc(sub.id)}" data-date="${esc(sub.date)}">שמירה</button>
        <button type="button" class="sc-btn sm" data-action="cal-hours-cancel">ביטול</button>
    </div>`;
}

function hoursLine(cal, dateKey, emp, sub) {
    const issue = coverageIssue(cal, dateKey, emp.id);
    const wt = sub?.workType && sub.workType !== 'WORKSHOP' ? ` · ${WORK_TYPE_LABELS[sub.workType] || ''}` : '';
    return `<div class="sc-row-sub">🕒 ${sub?.startTime ? `${esc(sub.startTime)}–${esc(sub.endTime)}` : 'ללא שעות'}${esc(wt)}</div>
        ${issue ? `<span class="sc-warn-note">⚠ ${esc(issue)}</span>` : ''}`;
}

// ---------------------------------------------------------------------------
// Session drawer
// ---------------------------------------------------------------------------

const shekel = (n) => `₪${Number(n || 0).toLocaleString('he-IL')}`;

function thumbs(items, label) {
    if (!items.length) return '';
    return `<div class="sc-gd-line"><span class="k">${label}</span><span class="sc-thumbs">${items.map(i => i.img
        ? `<a href="${esc(i.img)}" target="_blank" rel="noopener" class="sc-thumb" title="${esc(i.caption || '')}"><img src="${esc(i.img)}" alt="" loading="lazy">${i.badge ? `<em>${esc(i.badge)}</em>` : ''}</a>`
        : `<span class="sc-thumb empty" title="${esc(i.caption || '')}">—</span>`).join('')}</span></div>`;
}

function groupDetails(g) {
    const line = (k, v) => (v ? `<div class="sc-gd-line"><span class="k">${k}</span><span class="v">${v}</span></div>` : '');
    const phone = g.organizerPhone ? `<a dir="ltr" href="tel:${esc(g.organizerPhone)}">${esc(g.organizerPhone)}</a>` : '';
    const email = g.organizerEmail ? `<a dir="ltr" href="mailto:${esc(g.organizerEmail)}">${esc(g.organizerEmail)}</a>` : '';
    const promo = g.promoCoupon?.code ? `קופון מתנה ${esc(g.promoCoupon.code)} (${g.promoCoupon.status === 'redeemed' || g.promoCoupon.redeemedAt ? 'מומש' : esc(g.promoCoupon.status || 'הונפק')})` : '';
    const coupon = g.couponCode || g.couponName
        ? `✓ נוצל: ${esc(g.couponCode || g.couponName)}${g.paidDiscount ? ` (−${shekel(g.paidDiscount)})` : ''}`
        : (g.paidDiscount ? `הנחה ${shekel(g.paidDiscount)}` : 'לא נוצל קוד קופון');
    const sketches = (g.sketches || []).map((s, i) => ({ img: s.img, caption: `${s.participantName || `סקיצה ${i + 1}`} · ${s.size || ''}`, badge: s.size }));
    const cups = (g.cups || []).map(c => ({ img: c.image, caption: `כוס × ${c.quantity}`, badge: c.quantity > 1 ? `×${c.quantity}` : '' }));
    const people = (g.participants || []).map(p => `${esc(p.name)}${p.phone ? ` (<span dir="ltr">${esc(p.phone)}</span>)` : ''}${p.childrenCount ? ` +${p.childrenCount} ילדים` : ''}`).join('<br>');
    return `<div class="sc-gd">
        ${line('טלפון', phone)}${line('מייל', email)}
        ${line('שולם', `<b>${shekel(g.paidTotal)}</b>`)}
        ${line('קופון', coupon)}${line('קופון מתנה', promo)}
        ${line('הזמנה', g.orderNumber ? `#${esc(g.orderNumber)}` : '')}
        ${line('צ׳ק-אין', g.checkedInAt ? '✓ הגיעו' : '')}
        ${line('משתתפים', people)}
        ${thumbs(sketches, `סקיצות (${sketches.length}${g.rugCount > sketches.length ? `/${g.rugCount}` : ''})`)}
        ${thumbs(cups, 'כוסות')}
        ${g.customerNotes ? `<div class="sc-gd-note"><b>הערת לקוח</b>${esc(g.customerNotes)}</div>` : ''}
        ${g.internalNotes ? `<div class="sc-gd-note int"><b>הערה פנימית</b>${esc(g.internalNotes)}</div>` : ''}
    </div>`;
}

function renderParticipants(ce, ev) {
    const groups = ce._workshopOrderGroups?.[groupsKey(ev.dateKey, ev.typeId, ev.start)];
    if (!Array.isArray(groups)) {
        return '<div class="sc-empty"><span class="sc-mini-spin" style="display:inline-block;vertical-align:middle"></span> טוען משתתפים…</div>';
    }
    if (!groups.length) {
        return `<div class="sc-empty">לא נמצאו הזמנות משולמות למפגש זה${ev.people ? ` (${ev.people} משתתפים רשומים ב-Wix Bookings)` : ''}</div>`;
    }
    const adults = groups.reduce((s, g) => s + (g.adults || 0), 0);
    const children = groups.reduce((s, g) => s + (g.children || 0), 0);
    const cal = calState(ce);
    const rows = groups.map(g => {
        const total = (g.adults || 0) + (g.children || 0);
        const parts = [g.adults ? `${g.adults} מבוגרים` : '', g.children ? `${g.children} ילדים` : ''].filter(Boolean).join(' + ');
        const open = !!cal.openGroups[g.id];
        const noteText = [g.customerNotes ? `הערת לקוח: ${g.customerNotes}` : '', g.internalNotes ? `הערה פנימית: ${g.internalNotes}` : ''].filter(Boolean).join('\n') || g.notes || '';
        return `<div class="sc-grp ${open ? 'open' : ''}">
            <div class="sc-row sc-grp-head" data-action="cal-toggle-group" data-id="${esc(g.id)}" role="button" tabindex="0">
                <span class="sc-av" style="background:#8b9bb0">${esc(initials(g.organizerName))}</span>
                <div class="sc-row-main"><b>${esc(g.organizerName)}</b>
                    <div class="sc-row-sub">${esc(parts || '—')}${g.organizerPhone ? ` · <span dir="ltr">${esc(g.organizerPhone)}</span>` : ''}</div>
                </div>
                ${noteText ? `<span class="sc-tip sc-note-ico" data-tip="${esc(noteText)}">📝</span>` : ''}
                <span class="sc-badge">👥 ${total}</span>
                <span class="sc-chev">${open ? '▴' : '▾'}</span>
            </div>
            ${open ? groupDetails(g) : ''}
        </div>`;
    }).join('');
    return `${rows}
        <div class="sc-note"><b>סה״כ ${adults + children} משתתפים</b> ב-${groups.length} קבוצות · ${adults} מבוגרים · ${children} ילדים</div>`;
}

function candidateInfo(cal, ev, emp) {
    const sub = subFor(cal, ev.dateKey, emp.id);
    const skilled = (emp.skillIds || []).includes(ev.typeId);
    const vacation = onVacation(cal, emp.id, ev.dateKey);
    let label = 'לא הגיש/ה זמינות';
    let cls = 'mute';
    if (vacation) { label = 'בחופשה'; cls = 'warn'; } else if (sub?.status === 'SCHEDULED') {
        const others = (sub.assignedTypeIds || []).map(id => cal.cache.days[ev.dateKey]?.types?.find(t => t.typeId === id)?.name).filter(Boolean);
        label = others.length ? `משובץ/ת ל${others.join(', ')}` : 'משובץ/ת (ללא סדנה)';
        cls = 'warn';
    } else if (sub) {
        label = `${STATUS_LABELS[sub.status] || 'הגיש/ה'} ${sub.startTime ? `${sub.startTime}–${sub.endTime}` : ''}`.trim();
        cls = 'ok';
    }
    let rank = 3;
    if (!vacation) {
        if (skilled && sub && sub.status !== 'SCHEDULED') rank = 0;
        else if (skilled) rank = 1;
        else rank = 2;
    }
    return { sub, skilled, vacation, label, cls, rank };
}

function renderPicker(cal, ev) {
    const p = cal.picker;
    const byId = empById(cal);
    const list = cal.cache.employees
        .filter(e => e.active && !ev.assignedIds.includes(e.id))
        .map(e => ({ e, info: candidateInfo(cal, ev, e) }))
        .sort((a, b) => a.info.rank - b.info.rank || a.e.displayName.localeCompare(b.e.displayName, 'he'));
    const title = p.mode === 'swap' ? `החלפת ${esc(byId[p.fromId]?.displayName || '')} ב…` : 'הוספת עובד/ת למפגש';
    const rows = list.map(({ e, info }) => `<div class="sc-row ${info.vacation ? 'disabled' : ''}">
        ${avatar(e)}
        <div class="sc-row-main"><b>${esc(e.displayName)}</b>
            <div class="sc-row-sub"><span class="sc-badge ${info.cls}">${esc(info.label)}</span>${info.skilled ? '' : ' <span class="sc-badge mute">ללא הכשרה לסדנה</span>'}</div>
        </div>
        <button type="button" class="sc-btn ${info.rank === 0 ? 'primary' : ''} sm" data-action="cal-pick" data-emp="${esc(e.id)}" ${info.vacation ? 'disabled' : ''}>${p.mode === 'swap' ? 'החלפה' : 'הוספה'}</button>
    </div>`).join('');
    return `<div class="sc-picker">
        <div class="sc-picker-head"><span>${title}</span><button type="button" class="sc-icon-btn" style="width:24px;height:24px;font-size:14px" data-action="cal-picker-close" aria-label="סגירה">✕</button></div>
        <div class="sc-picker-list">${rows || '<div class="sc-empty">אין עובדים זמינים</div>'}</div>
    </div>`;
}

function renderStaff(cal, ev) {
    const byId = empById(cal);
    const rows = ev.assignedIds.map(id => {
        const emp = byId[id] || { id, displayName: 'עובד/ת' };
        const sub = subFor(cal, ev.dateKey, id);
        const editing = cal.editHours === id && sub;
        const confirming = cal.removeConfirm === id;
        const tmp = !sub || String(sub.id).startsWith('tmp-');
        return `<div class="sc-row" style="flex-wrap:wrap">
            ${avatar(emp)}
            <div class="sc-row-main"><b>${esc(emp.displayName)}</b>${hoursLine(cal, ev.dateKey, emp, sub)}</div>
            <div class="sc-row-actions">
                <button type="button" class="sc-btn sm" data-action="cal-edit-hours" data-emp="${esc(id)}" ${tmp ? 'disabled title="ממתין לשמירה"' : ''}>שעות</button>
                <button type="button" class="sc-btn sm" data-action="cal-swap-open" data-emp="${esc(id)}">החלפה</button>
                <button type="button" class="sc-btn danger sm" data-action="cal-remove-ask" data-emp="${esc(id)}">הסרה</button>
            </div>
            ${editing ? `<div style="width:100%">${hoursEditor(sub)}</div>` : ''}
            ${confirming ? `<div class="sc-inline" style="width:100%">
                <span style="font-size:12px">להסיר את ${esc(emp.displayName)} מהסדנה?</span>
                <button type="button" class="sc-btn primary sm" data-action="cal-remove" data-emp="${esc(id)}" data-disposition="restore">הסרה (החזרה להגשות)</button>
                <button type="button" class="sc-btn danger sm" data-action="cal-remove" data-emp="${esc(id)}" data-disposition="delete">מחיקת המשמרת</button>
                <button type="button" class="sc-btn sm" data-action="cal-remove-cancel">ביטול</button>
            </div>` : ''}
        </div>`;
    }).join('');
    return `<div class="sc-note">השיבוץ חל על כל מפגשי "${esc(ev.name)}" ביום זה.</div>
        ${rows || '<div class="sc-empty">אין עובדים משובצים</div>'}
        ${cal.picker ? renderPicker(cal, ev) : `<div><button type="button" class="sc-btn primary" data-action="cal-picker-open">+ הוספת עובד/ת</button></div>`}`;
}

function renderSessionDrawer(ce, cal) {
    const d = cal.drawer;
    const ev = findEvent(cal, d.dateKey, d.typeId, d.start);
    if (!ev) {
        return `<aside class="sc-drawer"><div class="sc-dr-head"><h3>המפגש לא נמצא</h3><button type="button" class="sc-icon-btn" data-action="cal-close-drawer" aria-label="סגירה">✕</button></div>
            <div class="sc-dr-body"><div class="sc-empty">ייתכן שהמפגש בוטל או הוסר.</div></div></aside>`;
    }
    const col = colorForType(ev.typeId, cal.cache.workshopTypes);
    const cap = eventCapacity(ev);
    const st = eventStaffState(cal, ev);
    const tab = cal.drawerTab === 'staff' ? 'staff' : 'participants';
    const groups = ce._workshopOrderGroups?.[groupsKey(ev.dateKey, ev.typeId, ev.start)];
    return `<aside class="sc-drawer" role="dialog" aria-label="${esc(ev.name)}">
        <div class="sc-dr-head">
            <span class="sc-dr-color" style="background:${col.border}"></span>
            <h3>${esc(ev.name)}</h3>
            <button type="button" class="sc-icon-btn" data-action="cal-close-drawer" aria-label="סגירה">✕</button>
        </div>
        <div class="sc-dr-when">${esc(fmtDayLong(ev.dateKey))} · <span dir="ltr">${esc(timeText(ev))}</span></div>
        <div class="sc-dr-stats">
            <div class="sc-stat"><span>משתתפים</span><b>${cap.total != null ? `${cap.booked}/${cap.total}` : cap.booked}</b></div>
            <div class="sc-stat"><span>מקומות פנויים</span><b>${cap.open != null ? cap.open : '—'}</b></div>
            <div class="sc-stat ${st.missing ? 'warn' : (ev.required ? 'ok' : '')}"><span>צוות</span><b>${st.assigned}${ev.required ? `/${ev.required}` : ''}</b></div>
        </div>
        <div class="sc-tabs" role="tablist">
            <button type="button" class="sc-tab ${tab === 'participants' ? 'active' : ''}" data-action="cal-tab" data-tab="participants">משתתפים${Array.isArray(groups) ? ` (${groups.length} קבוצות)` : ''}</button>
            <button type="button" class="sc-tab ${tab === 'staff' ? 'active' : ''}" data-action="cal-tab" data-tab="staff">צוות (${st.assigned})</button>
        </div>
        <div class="sc-dr-body">${tab === 'staff' ? renderStaff(cal, ev) : renderParticipants(ce, ev)}</div>
        ${tab === 'staff' ? `<div class="sc-dr-foot">
            <label class="sc-check"><input type="checkbox" data-action="cal-notify" ${cal.notify ? 'checked' : ''}> שליחת עדכון וואטסאפ לעובדים</label>
            <button type="button" class="sc-btn ghost sm" data-action="cal-open-day" data-date="${ev.dateKey}">פרטי היום ›</button>
        </div>` : ''}
    </aside>`;
}

// ---------------------------------------------------------------------------
// Day drawer
// ---------------------------------------------------------------------------

function renderDaySettings(cal, dateKey) {
    const f = dayFlags(cal, dateKey);
    const canRules = !!cal.cache.permissions.manageRules;
    const mode = f.holiday?.mode || '';
    const sk = cal.sketchConfirm?.dateKey === dateKey ? cal.sketchConfirm : null;
    const rulesBlock = canRules ? `
        <div class="sc-field"><label>הגשות ליום זה</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button type="button" class="sc-btn sm ${f.blocked ? 'danger' : ''}" data-action="cal-day-flag" data-flag="blocked" data-on="${f.blocked ? '0' : '1'}" data-date="${dateKey}">${f.blocked ? 'ביטול חסימת היום' : 'חסימת היום להגשות'}</button>
                <button type="button" class="sc-btn sm" data-action="cal-day-flag" data-flag="promoted" data-on="${f.promoted ? '0' : '1'}" data-date="${dateKey}">${f.promoted ? 'ביטול קידום היום' : 'קידום היום (דרושים ⭐)'}</button>
            </div>
        </div>
        <div class="sc-field"><label>מועד / חג${f.holiday?.name ? ` — ${esc(f.holiday.name)}` : ''}</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                <select id="scHolMode" data-action="cal-hol-mode">
                    <option value="" ${mode === '' ? 'selected' : ''}>יום רגיל</option>
                    <option value="CLOSED" ${mode === 'CLOSED' ? 'selected' : ''}>עסק סגור</option>
                    <option value="SHORT" ${mode === 'SHORT' ? 'selected' : ''}>יום מקוצר</option>
                </select>
                <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="scHolStart" value="${esc(f.holiday?.shortStart || '')}" placeholder="פתיחה" ${mode === 'SHORT' ? '' : 'disabled'}>
                <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="scHolEnd" value="${esc(f.holiday?.shortEnd || '')}" placeholder="סגירה" ${mode === 'SHORT' ? '' : 'disabled'}>
                <button type="button" class="sc-btn primary sm" data-action="cal-save-holiday" data-date="${dateKey}">שמירה</button>
            </div>
        </div>
        <div class="sc-field"><label>🧵 תפירת סקיצות (מוצג רק לעובדים עם ההרשאה)</label>
            ${cal.cache.days[dateKey]?.hasTufting ? '<span class="sc-warn-note">⚠ קיימת סדנת טאפטינג ביום זה — ודאו שאין התנגשות</span>' : ''}
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px">
                <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="scSketchStart" value="${esc(sk?.startTime || f.sketch?.startTime || '')}" placeholder="התחלה">
                <input type="text" inputmode="numeric" maxlength="5" class="epa-time-input" id="scSketchEnd" value="${esc(sk?.endTime || f.sketch?.endTime || '')}" placeholder="סיום">
                <button type="button" class="sc-btn primary sm" data-action="cal-save-sketch" data-date="${dateKey}">שמירה</button>
                ${f.sketch ? `<button type="button" class="sc-btn danger sm" data-action="cal-delete-sketch" data-date="${dateKey}">מחיקה</button>` : ''}
                ${sk ? `<button type="button" class="sc-btn danger sm" data-action="cal-confirm-sketch" data-date="${dateKey}">אישור למרות ההתנגשות</button>` : ''}
            </div>
        </div>` : '';
    return `<div class="sc-section"><h4>⚙️ הגדרות יום</h4>
        <div class="sc-field"><label>הודעה לעובדים ליום זה (מוצגת בלוח שלהם)</label>
            <textarea id="scDayNote" rows="2" placeholder="כתבו הודעה לצוות…">${esc(f.note?.message || '')}</textarea>
            <div style="display:flex;gap:6px;margin-top:4px">
                <button type="button" class="sc-btn primary sm" data-action="cal-save-note" data-date="${dateKey}">שמירת הודעה</button>
                ${f.note ? `<button type="button" class="sc-btn danger sm" data-action="cal-clear-note" data-date="${dateKey}">מחיקה</button>` : ''}
            </div>
        </div>
        ${rulesBlock}
    </div>`;
}

function renderDayDrawer(cal) {
    const dateKey = cal.drawer.dateKey;
    const f = dayFlags(cal, dateKey);
    const byId = empById(cal);
    const events = buildEvents(cal, [dateKey], { applyFilters: false }).sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1));
    const subs = (cal.cache.subsByDate[dateKey] || []).slice()
        .sort((a, b) => (a.status === 'SCHEDULED' ? 0 : 1) - (b.status === 'SCHEDULED' ? 0 : 1) || (hmToMin(a.startTime) ?? 0) - (hmToMin(b.startTime) ?? 0));
    const typeName = (id) => cal.cache.days[dateKey]?.types?.find(t => t.typeId === id)?.name || '';
    const banners = [
        f.blocked ? '<div class="sc-banner blk">🚫 היום חסום להגשות</div>' : '',
        f.holiday && (f.holiday.name || f.holiday.mode) ? `<div class="sc-banner hol">🕎 ${esc(f.holiday.name || 'מועד')}${f.closed ? ' · עסק סגור' : ''}${f.holiday.mode === 'SHORT' ? ` · יום מקוצר ${esc(f.holiday.shortStart || '')}–${esc(f.holiday.shortEnd || '')}` : ''}</div>` : '',
        f.note?.message ? `<div class="sc-banner note">✉ ${esc(f.note.message)}</div>` : '',
    ].join('');

    const evRows = events.map(ev => {
        const col = colorForType(ev.typeId, cal.cache.workshopTypes);
        const st = eventStaffState(cal, ev);
        return `<button type="button" class="sc-ev-list-item" data-action="cal-open-event" data-date="${dateKey}" data-type="${esc(ev.typeId)}" data-start="${esc(ev.start || '')}">
            <span class="sc-swatch" style="background:${col.border};width:12px;height:12px"></span>
            <span class="time">${esc(timeText(ev))}</span>
            <span style="flex:1">${esc(ev.name)}</span>
            <span class="sc-badge ${st.missing ? 'warn' : 'ok'}">צוות ${st.assigned}${ev.required ? `/${ev.required}` : ''}</span>
        </button>`;
    }).join('');

    const staffRows = subs.map(s => {
        const emp = byId[s.employeeId] || { id: s.employeeId, displayName: 'עובד/ת' };
        const editing = cal.editHours === s.employeeId;
        const tmp = String(s.id).startsWith('tmp-');
        const ws = (s.assignedTypeIds || []).map(typeName).filter(Boolean);
        const badge = s.status === 'SCHEDULED' ? 'ok' : (s.status === 'STANDBY' ? 'warn' : '');
        return `<div class="sc-row" style="flex-wrap:wrap">
            ${avatar(emp)}
            <div class="sc-row-main"><b>${esc(emp.displayName)}</b> <span class="sc-badge ${badge}">${esc(STATUS_LABELS[s.status] || s.status)}</span>
                ${hoursLine(cal, dateKey, emp, s)}
                ${ws.length ? `<div class="sc-row-sub">🎨 ${esc(ws.join(', '))}</div>` : ''}
            </div>
            <div class="sc-row-actions"><button type="button" class="sc-btn sm" data-action="cal-edit-hours" data-emp="${esc(s.employeeId)}" ${tmp ? 'disabled' : ''}>שעות</button></div>
            ${editing ? `<div style="width:100%">${hoursEditor(s)}</div>` : ''}
        </div>`;
    }).join('');

    const empOptions = cal.cache.employees.filter(e => e.active && !onVacation(cal, e.id, dateKey))
        .map(e => `<option value="${esc(e.id)}">${esc(e.displayName)}</option>`).join('');

    return `<aside class="sc-drawer" role="dialog" aria-label="${esc(fmtDayLong(dateKey))}">
        <div class="sc-dr-head">
            <h3>${esc(fmtDayLong(dateKey))}</h3>
            <button type="button" class="sc-icon-btn" data-action="cal-close-drawer" aria-label="סגירה">✕</button>
        </div>
        <div class="sc-dr-body">
            ${banners}
            <div class="sc-section"><h4>סדנאות ביום זה (${events.length})</h4>${evRows || '<div class="sc-empty">אין סדנאות ביום זה</div>'}</div>
            <div class="sc-section"><h4>עובדים ביום זה (${subs.length})</h4>${staffRows || '<div class="sc-empty">אין הגשות או שיבוצים ליום זה</div>'}</div>
            <div class="sc-section"><h4>שיבוץ ללא סדנה (פתיחה / קיפול)</h4>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center" class="sc-field">
                    <select id="scDayAssignEmp">${empOptions}</select>
                    <select id="scDayAssignWT">${Object.entries(WORK_TYPE_LABELS).map(([v, l]) => `<option value="${v}" ${v === 'OPENING' ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    <button type="button" class="sc-btn primary sm" data-action="cal-day-assign" data-date="${dateKey}">שיבוץ</button>
                </div>
                <label class="sc-check"><input type="checkbox" data-action="cal-notify" ${cal.notify ? 'checked' : ''}> שליחת עדכון וואטסאפ לעובד/ת</label>
            </div>
            ${renderDaySettings(cal, dateKey)}
        </div>
    </aside>`;
}

export function renderDrawer(ce) {
    const cal = calState(ce);
    if (!cal.drawer) return '';
    return cal.drawer.kind === 'day' ? renderDayDrawer(cal) : renderSessionDrawer(ce, cal);
}
