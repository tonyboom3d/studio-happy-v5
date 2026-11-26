/**
 * calendarAddCustomer.js — Two-step "הוספת לקוח לסדנה" form inside the session drawer.
 * Computes live day-based pricing from backend-resolved Wix Bookings ticket variants.
 */
import { esc } from './calendarViews.js';

const shekel = (n) => `₪${Number(n || 0).toLocaleString('he-IL')}`;

export function computePricePreview(pricing, adults, children) {
    const a = Math.max(0, Math.floor(Number(adults) || 0));
    const c = Math.max(0, Math.floor(Number(children) || 0));
    const solo = Number(pricing?.solo || 0);
    const parentChild = Number(pricing?.parentChild || solo || 0);
    const extraChild = Number(pricing?.extraChild || solo || 0);
    const pairs = Math.min(a, c);
    const soloAdults = Math.max(0, a - pairs);
    const extraChildren = Math.max(0, c - pairs);
    const total = Math.round((soloAdults * solo + pairs * parentChild + extraChildren * extraChild) * 100) / 100;
    return { adults: a, children: c, pairs, soloAdults, extraChildren, solo, parentChild, extraChild, total };
}

export function createInitialAddCustomerState(ev) {
    return {
        dateKey: ev.dateKey,
        typeId: ev.typeId,
        start: ev.start || '',
        workshopName: ev.name || 'סדנה',
        step: 1,
        loading: true,
        submitting: false,
        error: '',
        pricingData: null,
        form: {
            organizerName: '',
            organizerPhone: '',
            organizerEmail: '',
            adults: 1,
            children: 0,
            internalNotes: '',
            customerNotes: '',
            paymentMode: 'link', // 'link' | 'paid'
            sendWhatsApp: true,
            sendEmail: false,
        },
    };
}

/** Syncs live DOM inputs from the active add-customer form into state before step change / re-render. */
export function syncAddCustomerInputs(ce, st) {
    if (!st) return;
    const f = st.form;
    const val = (id) => {
        const el = ce.querySelector(`#${id}`);
        return el ? el.value : null;
    };
    const chk = (id) => {
        const el = ce.querySelector(`#${id}`);
        return el ? !!el.checked : null;
    };
    if (st.step === 1) {
        const name = val('scAcName'); if (name !== null) f.organizerName = name;
        const phone = val('scAcPhone'); if (phone !== null) f.organizerPhone = phone;
        const email = val('scAcEmail'); if (email !== null) f.organizerEmail = email;
        const intN = val('scAcInternalNote'); if (intN !== null) f.internalNotes = intN;
        const custN = val('scAcCustomerNote'); if (custN !== null) f.customerNotes = custN;
    } else {
        const wa = chk('scAcSendWa'); if (wa !== null) f.sendWhatsApp = wa;
        const em = chk('scAcSendEmail'); if (em !== null) f.sendEmail = em;
    }
}

export function renderAddCustomerPanel(cal) {
    const st = cal.addCustomer;
    if (!st) return '';
    const f = st.form;
    const pricing = st.pricingData?.pricing || null;
    const calc = computePricePreview(pricing, f.adults, f.children);

    const priceBox = st.loading
        ? `<div class="sc-ac-price"><span class="sc-mini-spin" style="display:inline-block;vertical-align:middle"></span> טוען תמחור ליום זה…</div>`
        : (pricing ? `<div class="sc-ac-price">
            <div class="sc-ac-price-row"><span>מחיר יחיד: ${shekel(calc.solo)}</span>${calc.parentChild !== calc.solo ? `<span>הורה+ילד: ${shekel(calc.parentChild)}</span>` : ''}${calc.extraChild !== calc.solo ? `<span>תוספת ילד: ${shekel(calc.extraChild)}</span>` : ''}</div>
            <div class="sc-ac-total"><span>סה״כ לתשלום</span><b>${shekel(calc.total)}</b></div>
            ${calc.pairs || calc.soloAdults || calc.extraChildren ? `<div class="sc-ac-break">${[
                calc.soloAdults ? `${calc.soloAdults} × יחיד (${shekel(calc.solo)})` : '',
                calc.pairs ? `${calc.pairs} × הורה וילד (${shekel(calc.parentChild)})` : '',
                calc.extraChildren ? `${calc.extraChildren} × ילד נוסף (${shekel(calc.extraChild)})` : '',
            ].filter(Boolean).join(' + ')}</div>` : ''}
        </div>` : `<div class="sc-ac-price warn">לא נמצא תמחור אוטומטי לסדנה זו</div>`);

    const errBanner = st.error ? `<div class="sc-banner blk" style="margin-bottom:8px">${esc(st.error)}</div>` : '';

    if (st.step === 1) {
        return `<div class="sc-ac-box">
            <div class="sc-ac-head">
                <b>הוספת לקוח לסדנה · שלב 1 מתוך 2</b>
                <button type="button" class="sc-icon-btn" style="width:24px;height:24px;font-size:14px" data-action="cal-ac-close" aria-label="סגירה">✕</button>
            </div>
            ${errBanner}
            <div class="sc-field"><label>שם מלא *</label>
                <input type="text" id="scAcName" value="${esc(f.organizerName)}" placeholder="ישראל ישראלי" autocomplete="off">
            </div>
            <div class="sc-ac-grid2">
                <div class="sc-field"><label>טלפון (לוואטסאפ)</label>
                    <input type="text" id="scAcPhone" dir="ltr" value="${esc(f.organizerPhone)}" placeholder="050-0000000" autocomplete="off">
                </div>
                <div class="sc-field"><label>אימייל (למייל)</label>
                    <input type="text" id="scAcEmail" dir="ltr" value="${esc(f.organizerEmail)}" placeholder="name@example.com" autocomplete="off">
                </div>
            </div>
            <div class="sc-ac-grid2">
                <div class="sc-field"><label>מבוגרים</label>
                    <div class="sc-stepper">
                        <button type="button" class="sc-btn sm" data-action="cal-ac-qty" data-field="adults" data-delta="-1">−</button>
                        <b>${f.adults}</b>
                        <button type="button" class="sc-btn sm" data-action="cal-ac-qty" data-field="adults" data-delta="1">+</button>
                    </div>
                </div>
                <div class="sc-field"><label>ילדים</label>
                    <div class="sc-stepper">
                        <button type="button" class="sc-btn sm" data-action="cal-ac-qty" data-field="children" data-delta="-1">−</button>
                        <b>${f.children}</b>
                        <button type="button" class="sc-btn sm" data-action="cal-ac-qty" data-field="children" data-delta="1">+</button>
                    </div>
                </div>
            </div>
            ${priceBox}
            <div class="sc-field"><label>הערה ללקוח (תוצג בקישור לתשלום · עד 300 תווים)</label>
                <textarea id="scAcCustomerNote" rows="2" maxlength="300" placeholder="לדוגמה: כולל חומרים, נא להגיע 10 דקות לפני…">${esc(f.customerNotes)}</textarea>
            </div>
            <div class="sc-field"><label>הערה פנימית למנהל (לא תוצג ללקוח)</label>
                <textarea id="scAcInternalNote" rows="2" maxlength="1000" placeholder="הערה פנימית לצוות…">${esc(f.internalNotes)}</textarea>
            </div>
            <div class="sc-ac-foot">
                <button type="button" class="sc-btn sm" data-action="cal-ac-close">ביטול</button>
                <button type="button" class="sc-btn primary sm" data-action="cal-ac-next" ${st.loading ? 'disabled' : ''}>המשך לתשלום ←</button>
            </div>
        </div>`;
    }

    const participantsSummary = `${f.adults} מבוגרים${f.children > 0 ? ` + ${f.children} ילדים` : ''}`;
    const hasPhone = !!String(f.organizerPhone || '').trim();
    const hasEmail = !!String(f.organizerEmail || '').trim();
    const isLink = f.paymentMode !== 'paid';

    return `<div class="sc-ac-box">
        <div class="sc-ac-head">
            <b>אופן תשלום · שלב 2 מתוך 2</b>
            <button type="button" class="sc-icon-btn" style="width:24px;height:24px;font-size:14px" data-action="cal-ac-close" aria-label="סגירה">✕</button>
        </div>
        ${errBanner}
        <div class="sc-note" style="margin-bottom:8px">
            <b>${esc(f.organizerName)}</b> · ${esc(participantsSummary)} · <b>${shekel(calc.total)}</b>
            ${f.customerNotes ? `<div style="margin-top:3px">הערת לקוח: ${esc(f.customerNotes)}</div>` : ''}
        </div>
        <div class="sc-ac-modes">
            <button type="button" class="sc-ac-mode ${isLink ? 'active' : ''}" data-action="cal-ac-mode" data-mode="link">
                <b>💳 שליחת קישור לתשלום (Pay Link)</b>
                <span>ההזמנה תיפתח כלא פעילה (טרם שולם) ותהפוך לפעילה אוטומטית לאחר התשלום.</span>
            </button>
            <button type="button" class="sc-ac-mode ${!isLink ? 'active' : ''}" data-action="cal-ac-mode" data-mode="paid">
                <b>✓ ההזמנה כבר שולמה</b>
                <span>ההזמנה תתווסף מיד כהזמנה פעילה ומשולמת בסדנה.</span>
            </button>
        </div>
        ${isLink ? `<div class="sc-ac-channels">
            <label class="sc-check">
                <input type="checkbox" id="scAcSendWa" data-action="cal-ac-chk" ${f.sendWhatsApp ? 'checked' : ''} ${hasPhone ? '' : 'disabled'}>
                שליחת קישור בוואטסאפ (ManyChat)${hasPhone ? '' : ' — חסר טלפון'}
            </label>
            <label class="sc-check">
                <input type="checkbox" id="scAcSendEmail" data-action="cal-ac-chk" ${f.sendEmail ? 'checked' : ''} ${hasEmail ? '' : 'disabled'}>
                שליחת קישור במייל (Wix Pay Links)${hasEmail ? '' : ' — חסר אימייל'}
            </label>
        </div>` : ''}
        <div class="sc-ac-foot">
            <button type="button" class="sc-btn sm" data-action="cal-ac-back" ${st.submitting ? 'disabled' : ''}>→ חזרה</button>
            <button type="button" class="sc-btn primary sm" data-action="cal-ac-submit" ${st.submitting ? 'disabled' : ''}>
                ${st.submitting ? '<span class="sc-mini-spin" style="display:inline-block;vertical-align:middle"></span> שומר…' : (isLink ? 'יצירת קישור ושמירה' : 'שמירת הזמנה משולמת')}
            </button>
        </div>
    </div>`;
}
