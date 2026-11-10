// <quote-contract> — customer quote page UI. UI only: renders by data.viewState, never derives state.
// In:  attribute `quote-data` (JSON from page). Out: 'quote-action' {type, payload, requestId}; page answers
// via attribute `action-result` JSON {requestId, ok, error}. Add mock="ready_to_sign" (any viewState) for local dev.

const TAG = 'quote-contract';

const MSG = {
    missing_id: ['הקישור אינו תקין', 'חסר מזהה הצעה בכתובת. אנא השתמשו בקישור שנשלח אליכם.'],
    not_found: ['לא מצאנו הצעת מחיר בקישור זה', 'ייתכן שהקישור שגוי או שההצעה הוסרה.'],
    cancelled: ['ההצעה בוטלה', 'להצעה חדשה או לשאלות, אנא צרו קשר.'],
    expired: ['תוקף ההצעה פג', 'לחידוש ההצעה פנו אלינו ונשמח לעדכן.'],
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap');
:host{display:block;direction:rtl;font-family:Rubik,Arial,sans-serif;color:#0f172a;background:#f1f5f9;padding:16px;--brand:#2563eb}
*{box-sizing:border-box}
.box{max-width:760px;margin:0 auto}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:14px}
.hdr{display:flex;align-items:center;gap:12px;margin-bottom:14px}.hdr img{max-height:48px}.hdr h1{margin:0;font-size:22px;flex:1}
.sub{color:#64748b;font-size:13px}
.contract{line-height:1.7;overflow-wrap:anywhere}
.msg{text-align:center;padding:40px 16px}.msg h2{margin:0 0 8px}.msg .ic{font-size:44px}
.sk{height:16px;border-radius:8px;background:linear-gradient(90deg,#e2e8f0,#f1f5f9,#e2e8f0);background-size:200% 100%;animation:sh 1.2s infinite;margin:12px 0}
@keyframes sh{to{background-position:-200% 0}}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
.sum div{background:#f1f5f9;border-radius:10px;padding:10px;text-align:center}.sum b{display:block;font-size:18px}
.opt{display:flex;gap:10px;align-items:flex-start;border:1px solid #cbd5e1;border-radius:10px;padding:10px;margin:8px 0;cursor:pointer}
.opt input{margin-top:4px}
h3{margin:0 0 8px;font-size:16px;color:var(--brand)}
canvas{width:100%;height:180px;border:1px dashed #94a3b8;border-radius:10px;background:#fff;touch-action:none;display:block}
button{font:inherit;cursor:pointer;border-radius:10px;padding:11px 18px;border:1px solid #cbd5e1;background:#fff;color:#0f172a}
.btn{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:700;width:100%;margin-top:10px}
.btn:disabled{opacity:.55;cursor:not-allowed}
.row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:6px}
.err{background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;padding:10px;border-radius:8px;margin-top:10px}
.ok{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px}
.bank{white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px}
a{color:var(--brand)}
@media(max-width:560px){.sum{grid-template-columns:1fr}}
`;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
const dmy = (v) => (v ? new Date(v).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');
const errText = (e) => { const m = String(e?.message || e || 'שגיאה'); const i = m.indexOf(':'); return /^[A-Z_]+$/.test(m.slice(0, i)) ? m.slice(i + 1) : m; };
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '');
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

class QuoteContract extends HTMLElement {
    static get observedAttributes() { return ['quote-data', 'action-result']; }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.pending = new Map();
        this.seq = 0;
        this.data = null;
        this.busy = false;
        this.error = '';
        this.ink = 0;
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        this.root.innerHTML = `<style>${CSS}</style><div id="app"></div>`;
        this.root.addEventListener('click', (e) => this.onClick(e));
        const mock = this.getAttribute('mock');
        if (mock) this.data = this.mockData(mock);
        this.render();
    }

    attributeChangedCallback(name, _o, val) {
        if (!val) return;
        try {
            const msg = JSON.parse(val);
            if (name === 'quote-data') { this.data = msg; this.error = ''; this.render(); return; }
            const p = this.pending.get(msg.requestId);
            if (!p) return;
            this.pending.delete(msg.requestId);
            clearTimeout(p.timer);
            if (msg.ok) p.resolve(); else p.reject(new Error(msg.error || 'שגיאה'));
        } catch (err) { console.error('[quote-contract] bad attribute', err); }
    }

    req(type, payload = {}) {
        if (this.getAttribute('mock')) return new Promise((r) => setTimeout(r, 300));
        const requestId = `${Date.now()}-${++this.seq}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('הבקשה נכשלה (פג זמן). נסו שוב.')); }, 60000);
            this.pending.set(requestId, { resolve, reject, timer });
            this.dispatchEvent(new CustomEvent('quote-action', { detail: { type, payload, requestId }, bubbles: true, composed: true }));
        });
    }

    mockData(state) {
        return {
            viewState: state, quoteNumber: 1001, customerName: 'דנה כהן', totalAmount: 2500, depositAmount: 750, balanceAmount: 1750,
            balanceDueDate: new Date().toISOString(), paidAmount: 750, allowOnlinePayment: true, allowBankTransfer: true,
            selectedPaymentPlan: 'deposit', selectedPaymentMethod: 'online', bankDetailsText: 'בנק לדוגמה\nחשבון 123456',
            contractHtml: '<h2>הסכם לדוגמה</h2><p>תוכן החוזה...</p>',
        };
    }

    // ---------- interactions ----------
    onClick(e) {
        const el = e.target.closest('[data-act]');
        if (!el || this.busy) return;
        const a = el.dataset.act;
        if (a === 'clear') return this.clearSig();
        if (a === 'sign') return this.sign();
        if (a === 'pay') return this.action('pay', { stage: el.dataset.stage });
        if (a === 'upload') return this.upload();
    }

    async upload() {
        const file = this.root.querySelector('#proofFile')?.files?.[0];
        if (!file) { this.error = 'יש לבחור קובץ.'; return this.render(); }
        this.busy = true; this.error = ''; this.render();
        try {
            const dataUrl = await this.prepareProof(file);
            await this.req('proof', { dataUrl, fileName: file.name });
        } catch (err) { this.error = errText(err); }
        this.busy = false; this.render();
    }

    /** Images are downscaled to <=1600px JPEG; PDFs must be <=3MB. */
    prepareProof(file) {
        const readAsUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('קריאת הקובץ נכשלה.')); r.readAsDataURL(f); });
        if (file.type === 'application/pdf') {
            if (file.size > 3 * 1024 * 1024) return Promise.reject(new Error('קובץ ה-PDF גדול מדי (עד 3MB).'));
            return readAsUrl(file);
        }
        if (!/^image\//.test(file.type)) return Promise.reject(new Error('יש להעלות תמונה או PDF.'));
        return readAsUrl(file).then((url) => new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, 1600 / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0, c.width, c.height);
                res(c.toDataURL('image/jpeg', 0.82));
            };
            img.onerror = () => rej(new Error('לא ניתן לקרוא את התמונה.'));
            img.src = url;
        }));
    }

    async action(type, payload) {
        this.busy = true; this.error = ''; this.render();
        try { await this.req(type, payload); } catch (err) { this.error = errText(err); }
        this.busy = false; this.render();
    }

    async sign() {
        const q = (s) => this.root.querySelector(s);
        if (!q('#approve')?.checked) { this.error = 'יש לאשר את תנאי ההצעה.'; return this.render(true); }
        const plan = q('input[name=plan]:checked')?.value;
        const method = q('input[name=method]:checked')?.value;
        if (!plan) { this.error = 'יש לבחור מסלול תשלום.'; return this.render(true); }
        if (!method) { this.error = 'יש לבחור אמצעי תשלום.'; return this.render(true); }
        if (this.ink < 25) { this.error = 'יש לחתום בתיבת החתימה.'; return this.render(true); }
        const png = this.canvas.toDataURL('image/png');
        const keep = { plan, method, approved: true, png };
        this.busy = true; this.error = ''; this.render(true);
        try {
            await this.req('sign', { signaturePngDataUrl: keep.png, selectedPaymentPlan: plan, selectedPaymentMethod: method, approved: true, userAgent: navigator.userAgent });
        } catch (err) { this.error = errText(err); }
        this.busy = false; this.render(!this.error ? false : true);
    }

    // ---------- signature canvas ----------
    initCanvas() {
        const c = this.root.querySelector('#sig');
        if (!c) { this.canvas = null; return; }
        this.canvas = c;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = c.clientWidth || 600; const h = 180;
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        const ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
        let drawing = false; let last = null;
        const pos = (ev) => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
        c.onpointerdown = (ev) => { if (this.busy) return; drawing = true; last = pos(ev); c.setPointerCapture(ev.pointerId); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(last.x + 0.1, last.y + 0.1); ctx.stroke(); };
        c.onpointermove = (ev) => {
            if (!drawing) return;
            const p = pos(ev);
            ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            this.ink += Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
            last = p;
        };
        const end = () => { drawing = false; };
        c.onpointerup = end; c.onpointercancel = end; c.onpointerleave = end;
        this.ink = 0;
    }

    clearSig() {
        if (!this.canvas) return;
        this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ink = 0;
    }

    // ---------- render ----------
    render(keepForm = false) {
        const app = this.root.getElementById('app');
        if (!app) return;
        const d = this.data;
        const brand = safeColor(d?.brandColor);
        if (brand) this.style.setProperty('--brand', brand);
        const form = keepForm ? this.snapshotForm() : null;
        app.innerHTML = `<div class="box">${this.screen(d)}</div>`;
        this.initCanvas();
        if (form) this.restoreForm(form);
    }

    snapshotForm() {
        const q = (s) => this.root.querySelector(s);
        if (!q('#approve')) return null;
        let img = null;
        if (this.canvas) { img = new Image(); img.src = this.canvas.toDataURL(); }
        return { approve: q('#approve').checked, plan: q('input[name=plan]:checked')?.value, method: q('input[name=method]:checked')?.value, img, ink: this.ink };
    }

    restoreForm(f) {
        const q = (s) => this.root.querySelector(s);
        if (q('#approve')) q('#approve').checked = f.approve;
        if (f.plan) { const r = q(`input[name=plan][value=${f.plan}]`); if (r) r.checked = true; }
        if (f.method) { const r = q(`input[name=method][value=${f.method}]`); if (r) r.checked = true; }
        if (f.img && this.canvas) {
            const draw = () => { const ctx = this.canvas.getContext('2d'); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(f.img, 0, 0); ctx.restore(); this.ink = f.ink; };
            if (f.img.complete) draw(); else f.img.onload = draw;
        }
    }

    header(d) {
        const logo = safeUrl(d?.logo);
        return `<div class="hdr">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<h1>הצעת מחיר${d?.quoteNumber ? ` #${esc(d.quoteNumber)}` : ''}</h1></div>`;
    }

    screen(d) {
        if (!d) return `<div class="card"><div class="sk" style="width:40%"></div><div class="sk"></div><div class="sk"></div><div class="sk" style="width:70%"></div></div>`;
        const vs = d.viewState;
        if (d.thanks && !MSG[vs]) return this.thanksScreen(d);
        if (MSG[vs]) return `<div class="card msg"><div class="ic">${vs === 'expired' ? '⏰' : vs === 'cancelled' ? '🚫' : '🔎'}</div><h2>${MSG[vs][0]}</h2><p class="sub">${MSG[vs][1]}</p></div>`;
        if (vs === 'ready_to_sign') return this.signScreen(d);
        return this.postSignScreen(d);
    }

    summary(d) {
        return `<div class="sum"><div><span class="sub">סה"כ</span><b>${money(d.totalAmount)}</b></div><div><span class="sub">שולם</span><b>${money(d.paidAmount)}</b></div><div><span class="sub">יתרה</span><b>${money(Math.max(0, (Number(d.totalAmount) || 0) - (Number(d.paidAmount) || 0)))}</b></div></div>`;
    }

    signScreen(d) {
        const hasDep = Number(d.depositAmount) > 0 && Number(d.balanceAmount) > 0;
        const plans = `<label class="opt"><input type="radio" name="plan" value="full"><span><b>תשלום מלא — ${money(d.totalAmount)}</b></span></label>
            ${hasDep ? `<label class="opt"><input type="radio" name="plan" value="deposit"><span><b>מקדמה ${money(d.depositAmount)} כעת</b><br><span class="sub">והשלמת ${money(d.balanceAmount)} עד ${esc(dmy(d.balanceDueDate))}</span></span></label>` : ''}`;
        const methods = `${d.allowOnlinePayment ? '<label class="opt"><input type="radio" name="method" value="online"><span><b>תשלום מקוון</b><br><span class="sub">ביט / כרטיס אשראי / Apple Pay</span></span></label>' : ''}
            ${d.allowBankTransfer ? '<label class="opt"><input type="radio" name="method" value="bank_transfer"><span><b>העברה בנקאית</b><br><span class="sub">פרטי החשבון יוצגו לאחר החתימה</span></span></label>' : ''}`;
        return `${this.header(d)}<div class="card contract">${d.contractHtml || ''}</div>
            ${d.expiresAt ? `<div class="sub" style="margin:-6px 4px 10px">ההצעה בתוקף עד ${esc(dmy(d.expiresAt))}</div>` : ''}
            <div class="card"><h3>מסלול תשלום</h3>${plans}<h3 style="margin-top:14px">אמצעי תשלום</h3>${methods}</div>
            <div class="card"><label class="opt" style="border:0;padding:0"><input type="checkbox" id="approve"><span>קראתי ואני מאשר/ת את תנאי ההצעה</span></label>
              <h3 style="margin-top:14px">חתימה</h3><canvas id="sig"></canvas>
              <div class="row"><span class="sub">חתמו באמצעות האצבע או העכבר</span><button data-act="clear" ${this.busy ? 'disabled' : ''}>נקה חתימה</button></div>
              ${this.error ? `<div class="err">${esc(this.error)}</div>` : ''}
              <button class="btn" data-act="sign" ${this.busy ? 'disabled' : ''}>${this.busy ? 'שולח...' : 'אישור וחתימה'}</button></div>`;
    }

    payButton(stage, amount) {
        return `<button class="btn" data-act="pay" data-stage="${stage}" ${this.busy ? 'disabled' : ''}>${this.busy ? 'מעבד...' : `לתשלום מאובטח ${money(amount)}`}</button><div class="sub" style="text-align:center;margin-top:6px">ביט / כרטיס אשראי / Apple Pay</div>`;
    }

    uploadBox(err) {
        return `<h3 style="margin-top:14px">העלאת אסמכתא</h3><p class="sub">לאחר ביצוע ההעברה, צרפו צילום או PDF של האישור.</p>
            <input type="file" id="proofFile" accept="image/*,application/pdf" ${this.busy ? 'disabled' : ''}>${err}
            <button class="btn" data-act="upload" ${this.busy ? 'disabled' : ''}>${this.busy ? 'מעלה...' : 'שליחת אסמכתא'}</button>`;
    }

    thanksScreen(d) {
        const p = d.lastPayment;
        const back = /^\/[^/]/.test(d.backUrl || '') ? `<p style="text-align:center"><a href="${esc(d.backUrl)}">חזרה להצעה</a></p>` : '';
        const stage = { deposit: 'מקדמה', full: 'תשלום מלא', balance: 'יתרה' }[p?.stage] || '';
        const remaining = Math.max(0, (Number(d.totalAmount) || 0) - (Number(d.paidAmount) || 0));
        let body;
        if (p?.status === 'paid') {
            body = `<div class="msg"><div class="ic">✅</div><h2>התשלום התקבל, תודה!</h2><p>${esc(stage)} על סך <b>${money(p.amount)}</b></p>
                ${remaining > 0 ? `<p class="sub">יתרה לתשלום: ${money(remaining)} עד ${esc(dmy(d.balanceDueDate))}</p>` : '<p class="sub">ההצעה שולמה במלואה.</p>'}</div>`;
        } else if (p?.status === 'failed' || p?.status === 'refunded') {
            body = '<div class="msg"><div class="ic">⚠️</div><h2>התשלום לא הושלם</h2><p class="sub">ניתן לחזור להצעה ולנסות שוב.</p></div>';
        } else if (d.timedOut) {
            body = '<div class="msg"><div class="ic">⏳</div><h2>התשלום בעיבוד</h2><p class="sub">נעדכן אותך בוואטסאפ ברגע שיאושר.</p></div>';
        } else {
            body = '<div class="msg"><div class="ic">⏳</div><h2>מאמתים את התשלום...</h2><div class="sk" style="width:60%;margin:12px auto"></div></div>';
        }
        return `${this.header(d)}<div class="card">${body}</div>${back}`;
    }

    postSignScreen(d) {
        const vs = d.viewState;
        const err = this.error ? `<div class="err">${esc(this.error)}</div>` : '';
        const bank = d.bankDetailsText ? `<h3>פרטי העברה בנקאית</h3><div class="bank">${esc(d.bankDetailsText)}</div>` : '';
        const pdf = safeUrl(d.signedPdf) ? `<p><a href="${esc(safeUrl(d.signedPdf))}" target="_blank" rel="noopener">הורדת ההצעה החתומה (PDF)</a></p>` : '';
        let body = '';
        if (vs === 'signed_choose_payment') {
            const stage = d.selectedPaymentPlan === 'deposit' ? 'deposit' : 'full';
            const amount = stage === 'deposit' ? d.depositAmount : d.totalAmount;
            body = `<div class="ok">תודה! ההצעה נחתמה בהצלחה.</div>${this.summary(d)}${d.selectedPaymentMethod === 'online' ? this.payButton(stage, amount) : ''}${err}`;
        } else if (vs === 'awaiting_transfer_proof') {
            body = `<div class="ok">תודה! ההצעה נחתמה. נותר לבצע את ההעברה.</div>${this.summary(d)}${bank}${this.uploadBox(err)}`;
        } else if (vs === 'awaiting_transfer_approval') {
            body = `<div class="ok">האסמכתא התקבלה וממתינה לאישור.</div>${this.summary(d)}${err}`;
        } else if (vs === 'balance_due') {
            body = `<div class="ok">שולמה מקדמה ${money(d.paidAmount)}.</div><p>יתרה לתשלום <b>${money(d.balanceAmount)}</b> עד ${esc(dmy(d.balanceDueDate))}</p>${this.summary(d)}${d.selectedPaymentMethod === 'bank_transfer' ? bank + this.uploadBox(err) : this.payButton('balance', d.balanceAmount) + err}`;
        } else if (vs === 'paid_full') {
            body = `<div class="ok">ההצעה שולמה במלואה, תודה! 🎉</div>${this.summary(d)}${pdf}`;
        }
        return `${this.header(d)}<div class="card">${body}</div><details class="card"><summary>צפייה בהסכם</summary><div class="contract">${d.contractHtml || ''}</div></details>`;
    }
}

if (!customElements.get(TAG)) customElements.define(TAG, QuoteContract);
