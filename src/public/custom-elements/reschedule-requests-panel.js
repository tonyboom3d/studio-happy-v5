/**
 * Employee-portal panel: pending customer reschedule requests (managers
 * only — gated on the manageScheduling permission by the caller). Mirrors
 * the order dashboard's banner (order-manager-dashboard.js), kept in its own
 * module so employee-portal.js stays focused.
 *
 * Data: `ce._rescheduleData` = { items: [{ orderId, organizerName,
 * organizerPhone, workshopType, currentDateLabel, requestedDateLabel }] }
 * — pushed via the `reschedule-data` attribute from employee-portal.de494.js
 * (backend/rescheduleService.web.js → getPendingRescheduleRequests).
 *
 * Actions dispatched (ce._dispatch): 'rescheduleApprove' { orderId,
 * manualActionConfirmed: true }, 'rescheduleReject' { orderId, reason }.
 * Approve REQUIRES the manager to first confirm (checkbox) that they already
 * moved the booking / issued a credit manually — this module never touches
 * Wix Bookings itself.
 */

const WORKSHOP_LABELS = { tufting: 'טאפטינג', candles: 'נרות', ceramics: 'קרמיקה' };

export const RR_STYLE = `
.rr-banner { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; }
.rr-banner-title { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 700; color: #991b1b; margin-bottom: 8px; }
.rr-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 2px; border-bottom: 1px solid #fee2e2; }
.rr-row:last-child { border-bottom: none; }
.rr-row-info { font-size: 12.5px; color: #7f1d1d; }
.rr-row-info b { color: #450a0a; }
.rr-row-actions { display: flex; gap: 8px; flex-shrink: 0; }
.rr-btn { border-radius: 8px; padding: 6px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
.rr-btn.approve { background: #10b981; color: #fff; }
.rr-btn.approve:hover { background: #059669; }
.rr-btn.reject { background: #fff; border-color: #fca5a5; color: #b91c1c; }
.rr-btn.reject:hover { background: #fef2f2; }
.rr-warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 9px; padding: 10px 12px; font-size: 12px; color: #92400e; margin: 10px 0; display: flex; gap: 8px; align-items: flex-start; }
.rr-checkbox-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: #1f2937; margin: 12px 0; cursor: pointer; }
`;

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function findItem(ce, orderId) {
    return (ce._rescheduleData?.items || []).find((i) => i.orderId === orderId);
}

/** Banner listing every open request, plus the approve/reject modal when open. Renders '' when nothing to show. */
export function renderRescheduleRequestsPanel(ce) {
    const items = ce._rescheduleData?.items || [];
    const modal = ce._rescheduleModal ? renderRescheduleModal(ce) : '';
    if (!items.length) return modal;

    const rows = items.map((item) => `
        <div class="rr-row">
            <div class="rr-row-info">
                <b>${escapeHtml(item.organizerName || 'ללא שם')}</b> · ${escapeHtml(item.organizerPhone || '')}
                · ${escapeHtml(WORKSHOP_LABELS[item.workshopType] || item.workshopType || 'סדנה')}
                <br>מועד נוכחי: ${escapeHtml(item.currentDateLabel || '—')} ← מבוקש: ${escapeHtml(item.requestedDateLabel || '—')}
            </div>
            <div class="rr-row-actions">
                <button class="rr-btn approve" data-action="reschedule-open-approve" data-id="${escapeHtml(item.orderId)}">אישור</button>
                <button class="rr-btn reject" data-action="reschedule-open-reject" data-id="${escapeHtml(item.orderId)}">דחייה</button>
            </div>
        </div>`).join('');

    return `
        <div class="rr-banner">
            <div class="rr-banner-title">🔴 בקשות שינוי מועד ממתינות לאישור (${items.length})</div>
            ${rows}
        </div>
        ${modal}`;
}

function renderRescheduleModal(ce) {
    const modal = ce._rescheduleModal;
    const item = findItem(ce, modal.orderId);
    if (!item) return '';

    let title, body;
    if (modal.type === 'approve') {
        title = 'אישור שינוי מועד';
        body = `
            <div class="ep-empty" style="text-align:right;margin-bottom:8px">
                ${escapeHtml(item.organizerName || '')} — ${escapeHtml(item.currentDateLabel || '—')} ← ${escapeHtml(item.requestedDateLabel || '—')}
            </div>
            <div class="rr-warn">
                <span>⚠️</span>
                <span>לפני האישור יש לעדכן ידנית את ההזמנה ב-Wix Bookings למועד החדש, ולבצע זיכוי במידת הצורך. המערכת אינה מזיזה את ההזמנה אוטומטית.</span>
            </div>
            <label class="rr-checkbox-row">
                <input type="checkbox" id="rrApproveConfirmBox" data-action="reschedule-toggle-confirm" ${ce._rescheduleApproveConfirmed ? 'checked' : ''} />
                <span>ביצעתי את העדכון/זיכוי ידנית — אפשר לאשר ולהודיע ללקוח.</span>
            </label>
            <div class="epa-inline">
                <button class="epa-btn primary" data-action="reschedule-confirm-approve" data-id="${escapeHtml(item.orderId)}" ${ce._rescheduleApproveConfirmed ? '' : 'disabled'}>אישור סופי</button>
                <button class="epa-btn" data-action="reschedule-modal-cancel">ביטול</button>
            </div>`;
    } else {
        title = 'דחיית שינוי מועד';
        body = `
            <div class="ep-empty" style="text-align:right;margin-bottom:8px">הלקוח יקבל הודעה שהמועד לא אושר וההזמנה תישאר במועד המקורי. השימוש החינמי בשינוי מועד ישוחזר.</div>
            <div class="epa-field"><label>סיבת הדחייה (אופציונלי, לשימוש פנימי)</label><textarea id="rrRejectReason" rows="2"></textarea></div>
            <div class="epa-inline">
                <button class="epa-btn danger" data-action="reschedule-confirm-reject" data-id="${escapeHtml(item.orderId)}">דחיית הבקשה</button>
                <button class="epa-btn" data-action="reschedule-modal-cancel">ביטול</button>
            </div>`;
    }

    return `<div class="epa-modal-backdrop">
        <div class="epa-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
            <div class="epa-modal-head"><h2>${escapeHtml(title)}</h2><button class="epa-modal-close" data-action="reschedule-modal-cancel" aria-label="סגירה">×</button></div>
            ${body}
        </div>
    </div>`;
}

/** Delegated click handler — returns true when it handled the action (so the caller skips its own switch). */
export function handleRescheduleClick(ce, action, target) {
    switch (action) {
        case 'reschedule-open-approve':
            ce._rescheduleModal = { type: 'approve', orderId: target.dataset.id };
            ce._rescheduleApproveConfirmed = false;
            ce.render();
            return true;
        case 'reschedule-open-reject':
            ce._rescheduleModal = { type: 'reject', orderId: target.dataset.id };
            ce.render();
            return true;
        case 'reschedule-modal-cancel':
            ce._rescheduleModal = null;
            ce.render();
            return true;
        case 'reschedule-confirm-approve': {
            if (!ce._rescheduleApproveConfirmed) return true;
            const orderId = target.dataset.id;
            ce._rescheduleModal = null;
            ce._startBusy('מעדכן…');
            ce._dispatch('rescheduleApprove', { orderId, manualActionConfirmed: true });
            return true;
        }
        case 'reschedule-confirm-reject': {
            const orderId = target.dataset.id;
            const reason = ce.querySelector('#rrRejectReason')?.value?.trim() || '';
            ce._rescheduleModal = null;
            ce._startBusy('מעדכן…');
            ce._dispatch('rescheduleReject', { orderId, reason });
            return true;
        }
        default:
            return false;
    }
}

/** Delegated change handler (checkbox) — returns true when handled. */
export function handleRescheduleChange(ce, action, target) {
    if (action === 'reschedule-toggle-confirm') {
        ce._rescheduleApproveConfirmed = !!target.checked;
        ce.render();
        return true;
    }
    return false;
}
