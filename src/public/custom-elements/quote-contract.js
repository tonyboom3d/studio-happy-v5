// <quote-contract> — customer quote page UI. UI only: renders by data.viewState, never derives state.
// In:  attribute `quote-data` (JSON from page). Out: 'quote-action' {type, payload, requestId}; page answers
// via attribute `action-result` JSON {requestId, ok, error}. Add mock="ready_to_sign" (any viewState) for local dev.

const TAG = 'quote-contract';
const DEFAULT_LOGO = 'https://static.wixstatic.com/media/6b73e9_3d8054d68ecb422a82c328f8c4c163f3~mv2.png';

const MSG = {
    missing_id: ['הקישור אינו תקין', 'חסר מזהה הצעה בכתובת. אנא השתמשו בקישור שנשלח אליכם.'],
    not_found: ['לא מצאנו הצעת מחיר בקישור זה', 'ייתכן שהקישור שגוי או שההצעה הוסרה.'],
    cancelled: ['ההצעה בוטלה', 'להצעה חדשה או לשאלות, אנא צרו קשר.'],
    expired: ['תוקף ההצעה פג', 'לחידוש ההצעה פנו אלינו ונשמח לעדכן.'],
};
const EVENT_TYPE = { birthday: 'יום הולדת', event: 'אירוע' };

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&display=swap';

// @font-face inside shadow DOM is ignored, so the font must be registered on the document.
function ensureFont() {
    if (document.getElementById('qc-font')) return;
    const link = document.createElement('link');
    link.id = 'qc-font'; link.rel = 'stylesheet'; link.href = FONT_URL;
    document.head.appendChild(link);
}

const CSS = `
:host{display:block;direction:rtl;font-family:Assistant,Arial,sans-serif;color:#09090b;background:#f9fafb;font-size:18px;line-height:1.6;--brand:#16a34a;min-height:100%}
*{box-sizing:border-box}
.top{background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 16px;text-align:center}
.top h1{margin:0;font-size:22px;font-weight:700;color:#111827}
.top .exp{display:inline-flex;align-items:center;gap:6px;color:#6b7280;font-size:15px;margin-top:2px}
.wrap{max-width:980px;margin:0 auto;padding:28px 16px 40px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.05);padding:32px 40px;margin-bottom:18px}
.logo{display:block;margin:4px auto 26px;max-width:min(360px,80%);height:auto}
.contract{font-size:18px;line-height:1.8;overflow-wrap:anywhere}
.contract,.contract *{font-family:Assistant,Arial,sans-serif!important}
.contract h1{font-size:26px;margin:0 0 12px}
.contract h2,.contract h3{font-size:19px;font-weight:700;margin:20px 0 4px}
.contract p{margin:0 0 4px}
.contract ul{margin:2px 0 8px;padding:0 22px 0 0}
.contract li{margin:2px 0}
.contract strong,.contract b{font-weight:700}
.contract .dyn{font-weight:800;color:#111827}
.contract table td{font-size:17px}
.cta{text-align:center;margin-top:28px}
.btn{font:inherit;font-weight:700;font-size:18px;cursor:pointer;border:0;border-radius:14px;padding:12px 40px;background:var(--brand);color:#fff;box-shadow:0 2px 6px rgba(22,163,74,.25)}
.btn:hover{filter:brightness(.95)}.btn:disabled{opacity:.55;cursor:not-allowed}
.btn.dark{background:#111827;box-shadow:none}
.btn.wide{width:100%}
.ghost{font:inherit;font-size:17px;cursor:pointer;border:1px solid #e5e7eb;border-radius:12px;padding:11px 18px;background:#fff;color:#111827}
.sub{color:#6b7280;font-size:15px}
.sumh{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:21px}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.fact{display:flex;gap:10px;align-items:flex-start;background:#f9fafb;border:1px solid #f1f5f9;border-radius:12px;padding:10px 12px}
.fact .ic{font-size:22px;line-height:1.2;flex:none}
.fact span{display:block;color:#6b7280;font-size:14px;line-height:1.3}
.fact b{display:block;font-size:17px;line-height:1.35;overflow-wrap:anywhere}
.money{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
.money div{border-radius:12px;padding:12px;text-align:center;background:#f0fdf4;border:1px solid #dcfce7}
.money div.total{background:#111827;border-color:#111827;color:#fff}.money div.total span{color:#d1d5db}
.money span{display:block;font-size:14px;color:#4b5563}.money b{display:block;font-size:22px;font-weight:800}
.msg{text-align:center;padding:24px 8px}.msg h2{margin:0 0 8px;font-size:24px}.msg .ic{font-size:46px}
.sk{height:16px;border-radius:8px;background:linear-gradient(90deg,#e5e7eb,#f3f4f6,#e5e7eb);background-size:200% 100%;animation:sh 1.2s infinite;margin:12px 0}
@keyframes sh{to{background-position:-200% 0}}
.spin{width:46px;height:46px;border:5px solid #e5e7eb;border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto}
@keyframes spin{to{transform:rotate(360deg)}}
.loading{text-align:center;padding:26px 8px 10px}.loading b{display:block;margin-top:14px;font-size:20px}
.procmask{position:fixed;inset:0;background:rgba(17,24,39,.5);backdrop-filter:blur(3px);z-index:1002}
.procbox{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(380px,90vw);background:#fff;border-radius:18px;z-index:1003;box-shadow:0 24px 60px rgba(0,0,0,.3);padding:28px 22px;text-align:center}
.procbox b{display:block;margin-top:16px;font-size:19px}.procbox .sub{margin-top:6px}
.sigimg{display:block;max-width:260px;max-height:110px;margin:8px 0 0;border:1px solid #e5e7eb;border-radius:10px;background:#fff;padding:6px}
.err{background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;padding:10px 12px;border-radius:10px;margin-top:12px;font-size:16px}
.ok{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;padding:12px;border-radius:10px;margin-bottom:14px;font-weight:600}
.bank{white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:10px}
h3.t{margin:16px 0 8px;font-size:19px}
a{color:#2563eb}
details.card summary{cursor:pointer;font-weight:700}
input[type=file]{font:inherit;font-size:16px;margin:6px 0}
.mask{position:fixed;inset:0;background:rgba(17,24,39,.45);backdrop-filter:blur(3px);z-index:1000}
.dlg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(560px,94vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;z-index:1001;box-shadow:0 24px 60px rgba(0,0,0,.25)}
.dlg-h{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#eff6ff;border-bottom:1px solid #dbeafe}
.dlg-h .shield{width:38px;height:38px;border-radius:50%;background:#dbeafe;color:#2563eb;display:flex;align-items:center;justify-content:center;flex:none}
.dlg-h b{display:block;font-size:19px}.dlg-h span{font-size:14px;color:#6b7280}
.dlg-b{padding:18px 20px 6px}
.fld{display:block;margin-bottom:14px}
.fld>span{display:block;font-size:16px;font-weight:600;margin-bottom:6px}.fld>span i{color:#dc2626;font-style:normal}
.fld .txt{width:100%;font:inherit;font-size:17px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#111827}
.fld .txt:focus{outline:2px solid #bfdbfe;border-color:#3b82f6}
.chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.chip{display:flex;gap:8px;align-items:flex-start;border:1px solid #e5e7eb;border-radius:12px;padding:9px 11px;cursor:pointer;font-size:16px;line-height:1.35}
.chip:has(input:checked){border-color:#16a34a;background:#f0fdf4}
.chip input{margin:3px 0 0;flex:none;width:16px;height:16px;accent-color:#16a34a}
.chip small{display:block;color:#6b7280;font-size:13px;margin-top:2px}
canvas{width:100%;height:170px;border:2px dashed #d1d5db;border-radius:14px;background:#fff;touch-action:none;display:block}
.sigwrap{position:relative}
.sigph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:17px;pointer-events:none}
.sigrow{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
.link{font:inherit;font-size:14px;background:none;border:0;color:#2563eb;cursor:pointer;padding:0}
.approve{display:flex;gap:10px;align-items:flex-start;font-size:16px;margin:4px 0 8px;cursor:pointer}
.approve input{margin-top:5px;width:18px;height:18px;accent-color:#16a34a;flex:none}
.dlg-f{display:flex;gap:10px;padding:12px 20px 16px;position:sticky;bottom:0;background:#fff;border-top:1px solid #f1f5f9}
.dlg-f>*{flex:1}
.next{border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin-top:14px;background:#fff}
.next h3{margin:0 0 8px;font-size:19px}
.next ul{margin:0;padding:0;list-style:none}.next li{display:flex;gap:10px;align-items:flex-start;margin:6px 0}.next li i{font-style:normal;flex:none}
.note{background:#eff6ff;border:1px solid #dbeafe;color:#1e3a8a;border-radius:12px;padding:10px 14px;font-size:16px;margin-top:12px}
.drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed #d1d5db;border-radius:14px;padding:22px 14px;text-align:center;cursor:pointer;background:#f9fafb;margin-top:8px}
.drop:hover{border-color:#16a34a;background:#f0fdf4}.drop input{display:none}.drop .ic{font-size:34px}
.prev{display:flex;gap:12px;align-items:center;margin-top:10px;border:1px solid #e5e7eb;border-radius:12px;padding:8px 10px;flex-wrap:wrap}
.prev img{width:72px;height:72px;object-fit:cover;border-radius:8px;flex:none}.prev .pdf{font-size:40px}
.tbl{width:100%;border-collapse:collapse;font-size:16px;margin-top:6px}
.tbl th{text-align:right;color:#6b7280;font-weight:600;font-size:14px;padding:8px;border-bottom:1px solid #e5e7eb}
.tbl td{padding:9px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.st{display:inline-block;border-radius:999px;padding:2px 10px;font-size:14px;font-weight:600}
.st.pending{background:#fef3c7;color:#92400e}.st.paid{background:#dcfce7;color:#166534}.st.rejected{background:#fee2e2;color:#991b1b}
@media(max-width:640px){.tbl{font-size:14px}.tbl th,.tbl td{padding:6px 4px}.card{padding:20px 14px}.contract{font-size:17px}.btn{padding:12px 28px}
.facts{grid-template-columns:1fr 1fr;gap:8px}.fact{padding:8px;gap:6px}.fact .ic{font-size:18px}.fact b{font-size:15px}
.money{gap:6px}.money div{padding:9px 4px}.money b{font-size:17px}.money span{font-size:12px}}
`;

const SHIELD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
const CLOCK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
const dmy = (v) => (v ? new Date(v).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');
const longDate = (v) => (v ? new Date(v).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const weekday = (v) => (v ? new Date(v).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long' }) : '');
const errText = (e) => {
    const m = String(e?.message || e || 'שגיאה');
    const tagged = m.match(/(?:VALIDATION|NOT_FOUND|STATE|PAYMENT|UNKNOWN_ACTION):([^"\n]+)/);
    return tagged ? tagged[1].trim() : m;
};
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '');
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

class QuoteContract extends HTMLElement {
    static get observedAttributes() { return ['quote-data', 'action-result', 'action-progress']; }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.pending = new Map();
        this.seq = 0;
        this.data = null;
        this.busy = false;
        this.error = '';
        this.ink = 0;
        this.signOpen = false;
        this.form = null;
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        ensureFont();
        this.root.innerHTML = `<style>${CSS}</style><div id="app"></div>`;
        this.root.addEventListener('click', (e) => this.onClick(e));
        this.root.addEventListener('input', (e) => this.onInput(e));
        this.root.addEventListener('change', (e) => this.onInput(e));
        const mock = this.getAttribute('mock');
        if (mock) this.data = this.mockData(mock);
        this.render();
    }

    attributeChangedCallback(name, _o, val) {
        if (!val) return;
        try {
            const msg = JSON.parse(val);
            if (name === 'quote-data') { this.data = msg; this.error = ''; if (msg.viewState !== 'ready_to_sign') this.signOpen = false; this.render(); return; }
            if (name === 'action-progress') {
                if (this.pending.has(msg.requestId) && msg.msg) {
                    this.busyMsg = msg.msg;
                    const n = this.root.querySelector('.procmsg');
                    if (n) n.textContent = msg.msg;
                }
                return;
            }
            const p = this.pending.get(msg.requestId);
            if (!p) return;
            this.pending.delete(msg.requestId);
            clearTimeout(p.timer);
            if (msg.ok) p.resolve(); else p.reject(new Error(msg.error || 'שגיאה'));
        } catch (err) { console.error('[quote-contract] bad attribute', err); }
    }

    req(type, payload = {}) {
        if (this.getAttribute('mock')) return new Promise((r) => setTimeout(r, type === 'pay' ? 2500 : 900));
        const requestId = `${Date.now()}-${++this.seq}`;
        const limit = type === 'pay' ? 15 * 60 * 1000 : 60000; // pay waits for the customer to finish in the card window
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('הבקשה נכשלה (פג זמן). נסו שוב.')); }, limit);
            this.pending.set(requestId, { resolve, reject, timer });
            this.dispatchEvent(new CustomEvent('quote-action', { detail: { type, payload, requestId }, bubbles: true, composed: true }));
        });
    }

    mockData(state) {
        const day = 24 * 3600 * 1000;
        return {
            viewState: state, quoteNumber: 1001, customerName: 'דנה כהן', customerEmail: 'dana@example.com', customerPhone: '052-1234567',
            eventType: 'birthday', eventDate: new Date(Date.now() + 20 * day).toISOString(), eventStartTime: '16:00', eventEndTime: '18:30',
            requestedWorkshop: 'קרמיקה, נרות', participants: 14, adults: 2, extras: [{ title: 'ברד', price: 200 }],
            totalAmount: 2500, depositAmount: 750, balanceAmount: 1750, balanceDueDate: new Date(Date.now() + 18 * day).toISOString(),
            expiresAt: new Date(Date.now() + 7 * day).toISOString(), paidAmount: 0, allowOnlinePayment: true, allowBankTransfer: true,
            selectedPaymentPlan: 'deposit', selectedPaymentMethod: 'online', bankDetailsText: 'בנק לדוגמה\nחשבון 123456',
            contractHtml: '<h3>פרטי הסדנה</h3><p>סוג הפעילות: <strong class="dyn">יום הולדת</strong> ב-Studio Happy</p><ul><li>מספר משתתפים: התחייבות ל-<strong class="dyn">14</strong> משתתפים</li></ul><h3>עלויות</h3><p>מחיר למשתתף: <strong class="dyn">₪164</strong></p>',
        };
    }

    // ---------- form state ----------
    initForm(d) {
        if (this.form) return;
        const hasDep = Number(d.depositAmount) > 0 && Number(d.balanceAmount) > 0;
        const methods = [d.allowOnlinePayment && 'online', d.allowBankTransfer && 'bank_transfer'].filter(Boolean);
        this.form = {
            name: d.customerName || '', email: d.customerEmail || '', phone: d.customerPhone || '',
            plan: hasDep ? '' : 'full', method: methods.length === 1 ? methods[0] : '', approve: false,
        };
    }

    onInput(e) {
        const t = e.target;
        if (t.id === 'proofFile' && e.type === 'change') return this.pickProof(t.files?.[0]);
        if (!this.form || !t.dataset.k) return;
        this.form[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
    }

    // ---------- interactions ----------
    onClick(e) {
        const el = e.target.closest('[data-act]');
        if (!el || this.busy) return;
        const a = el.dataset.act;
        if (a === 'openSign') { this.initForm(this.data); this.signOpen = true; this.error = ''; return this.render(); }
        if (a === 'closeSign') { this.signOpen = false; this.error = ''; return this.render(); }
        if (a === 'clear') return this.clearSig();
        if (a === 'sign') return this.sign();
        if (a === 'pay') return this.action('pay', { stage: el.dataset.stage }, 'מכינים תשלום מאובטח...');
        if (a === 'reload') return this.action('refresh', {}, 'טוענים את ההצעה...');
        if (a === 'upload') return this.upload();
    }

    // The input is re-created on every render, so the chosen file lives on the instance.
    pickProof(file) {
        if (this.proofPreview) URL.revokeObjectURL(this.proofPreview);
        this.proofFile = file || null;
        this.proofPreview = file && /^image\//.test(file.type) ? URL.createObjectURL(file) : '';
        this.error = '';
        this.render();
    }

    async upload() {
        const file = this.proofFile;
        if (!file) { this.error = 'יש לבחור צילום מסך או קובץ של האסמכתא.'; return this.render(); }
        this.busy = true; this.busyMsg = 'מעלים את האסמכתא...'; this.error = ''; this.render();
        try {
            const dataUrl = await this.prepareProof(file);
            await this.req('proof', { dataUrl, fileName: file.name });
            this.pickProof(null);
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

    async action(type, payload, msg = 'מעבדים...') {
        this.busy = true; this.busyMsg = msg; this.error = ''; this.render();
        try { await this.req(type, payload); } catch (err) { this.error = errText(err); }
        this.busy = false; this.render();
    }

    validate() {
        const f = this.form;
        if (String(f.name).trim().length < 2) return 'יש להזין שם מלא.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email).trim())) return 'יש להזין כתובת אימייל תקינה.';
        if (String(f.phone).replace(/\D/g, '').length < 9) return 'יש להזין מספר טלפון תקין.';
        if (!f.plan) return 'יש לבחור מסלול תשלום.';
        if (!f.method) return 'יש לבחור אמצעי תשלום.';
        if (this.ink < 25) return 'יש לחתום בתיבת החתימה.';
        if (!f.approve) return 'יש לאשר את תנאי ההסכם.';
        return '';
    }

    async sign() {
        const f = this.form;
        this.error = this.validate();
        if (this.error) return this.render();
        const png = this.canvas.toDataURL('image/png');
        this.busy = true; this.busyMsg = 'שומרים את החתימה...'; this.render();
        let signed = false;
        try {
            await this.req('sign', {
                signaturePngDataUrl: png, selectedPaymentPlan: f.plan, selectedPaymentMethod: f.method, approved: true,
                signerName: f.name.trim(), signerEmail: f.email.trim(), signerPhone: f.phone.trim(), userAgent: navigator.userAgent,
            });
            signed = true;
            if (f.method === 'online') {
                // Payment continues in the same flow: the secure card window opens right after signing.
                this.busyMsg = 'החתימה נשמרה. מכינים תשלום מאובטח...'; this.render();
                await this.req('pay', { stage: f.plan === 'deposit' ? 'deposit' : 'full' });
                if (this.getAttribute('mock')) this.data = { ...this.data, viewState: 'balance_due', thanks: true, inline: true, paidAmount: 750, lastPayment: { stage: 'deposit', amount: 750, status: 'paid' } };
            }
            this.signOpen = false;
        } catch (err) {
            this.error = errText(err);
            if (signed) this.signOpen = false; // already signed: the page now shows the pay screen with this error
        }
        this.busy = false; this.render();
    }

    // ---------- signature canvas ----------
    initCanvas(restoreUrl, restoreInk) {
        const c = this.root.querySelector('#sig');
        if (!c) { this.canvas = null; return; }
        this.canvas = c;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = c.clientWidth || 480; const h = 170;
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        const ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
        const ph = this.root.querySelector('.sigph');
        let drawing = false; let last = null;
        const pos = (ev) => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
        c.onpointerdown = (ev) => {
            if (this.busy) return;
            drawing = true; last = pos(ev); c.setPointerCapture(ev.pointerId);
            if (ph) ph.style.display = 'none';
            ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(last.x + 0.1, last.y + 0.1); ctx.stroke();
        };
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
        if (restoreUrl) {
            const img = new Image();
            img.onload = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(img, 0, 0); ctx.restore(); this.ink = restoreInk; if (ph) ph.style.display = 'none'; };
            img.src = restoreUrl;
        }
    }

    clearSig() {
        if (!this.canvas) return;
        this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ink = 0;
        const ph = this.root.querySelector('.sigph');
        if (ph) ph.style.display = '';
    }

    // ---------- render ----------
    render() {
        const app = this.root.getElementById('app');
        if (!app) return;
        const d = this.data;
        const brand = safeColor(d?.brandColor);
        if (brand) this.style.setProperty('--brand', brand);
        const keepSig = this.canvas && this.ink > 0 && this.signOpen ? { url: this.canvas.toDataURL(), ink: this.ink } : null;
        const proc = this.busy && this.busyMsg
            ? `<div class="procmask"></div><div class="procbox" role="status" aria-live="polite"><div class="spin"></div><b class="procmsg">${esc(this.busyMsg)}</b><div class="sub">נא לא לסגור את החלון</div></div>` : '';
        app.innerHTML = this.screen(d) + proc;
        this.initCanvas(keepSig?.url, keepSig?.ink);
        if (this.signOpen && this.error) this.root.querySelector('.dlg .err')?.scrollIntoView({ block: 'nearest' });
    }

    topBar(d, title) {
        const exp = d?.viewState === 'ready_to_sign' && d?.expiresAt ? `<div class="exp">${CLOCK} בתוקף עד: ${esc(longDate(d.expiresAt))}</div>` : '';
        return `<div class="top"><h1>${esc(title)}</h1>${exp}</div>`;
    }

    logo(d) {
        return `<img class="logo" src="${esc(safeUrl(d?.logo) || DEFAULT_LOGO)}" alt="Studio Happy">`;
    }

    frame(d, title, inner) {
        return `${this.topBar(d, title)}<div class="wrap">${inner}</div>`;
    }

    screen(d) {
        if (!d) return this.frame(null, 'חוזה התקשרות', `<div class="card"><div class="loading" role="status"><div class="spin"></div><b>טוענים את ההצעה שלך...</b><div class="sub">רק רגע</div></div><div class="sk" style="width:40%"></div><div class="sk"></div><div class="sk" style="width:70%"></div></div>`);
        const vs = d.viewState;
        if (d.thanks && !MSG[vs]) return this.thanksScreen(d);
        if (vs === 'paid_full') return this.paidLinkScreen(d);
        if (MSG[vs]) return this.frame(d, 'חוזה התקשרות', `<div class="card">${this.logo(d)}<div class="msg"><div class="ic">${vs === 'expired' ? '⏰' : vs === 'cancelled' ? '🚫' : '🔎'}</div><h2>${MSG[vs][0]}</h2><p class="sub">${MSG[vs][1]}</p></div></div>`);
        if (vs === 'ready_to_sign') return this.signScreen(d);
        return this.postSignScreen(d);
    }

    summary(d) {
        const time = [d.eventStartTime, d.eventEndTime].filter(Boolean).join(' עד ');
        const place = [d.eventLocation, d.eventAddress].filter(Boolean).join(', ');
        const kids = Math.max(0, parseInt(d.participants, 10) || 0);
        const full = Number(d.totalAmount) || 0;
        const perChild = kids > 0 ? Math.round((full / kids) * 100) / 100 : 0;
        const extras = (d.extras || []).map((x) => `${x.title}${x.price ? ` (${money(x.price)} לילד)` : ''}`).join(', ');
        const fact = (ic, label, val) => (val ? `<div class="fact"><div class="ic">${ic}</div><div><span>${label}</span><b>${esc(val)}</b></div></div>` : '');
        const paid = Number(d.paidAmount) || 0;
        const third = paid > 0
            ? `<div><span>שולם</span><b>${money(paid)}</b></div>`
            : `<div><span>יתרה${d.balanceDueDate ? ` עד ${esc(dmy(d.balanceDueDate))}` : ''}</span><b>${money(d.balanceAmount)}</b></div>`;
        return `<div class="card"><h2 class="sumh">📋 סיכום ההצעה${d.quoteNumber ? ` <span class="sub">#${esc(d.quoteNumber)}</span>` : ''}</h2>
            <div class="facts">
              ${fact('🎉', 'סוג האירוע', EVENT_TYPE[d.eventType] || d.eventType)}
              ${fact('🎨', 'סדנה', d.requestedWorkshop)}
              ${fact('📅', 'תאריך', d.eventDate ? `${weekday(d.eventDate)}, ${longDate(d.eventDate)}` : '')}
              ${fact('🕐', 'שעות', time)}
              ${fact('👥', 'ילדים', kids > 0 ? `${kids} ילדים` : '')}
              ${fact('🧑‍🤝‍🧑', 'מלווים', Number(d.adults) > 0 ? `${d.adults}` : '')}
              ${fact('📍', 'מיקום', place)}
              ${fact('✨', 'תוספות', extras)}
              ${fact('👤', 'שם המזמין', d.customerName)}
              ${fact('⏳', 'ההצעה בתוקף עד', d.viewState === 'ready_to_sign' ? longDate(d.expiresAt) : '')}
            </div>
            <div class="money">
              <div class="total"><span>סה"כ לתשלום</span><b>${money(full)}</b>${kids > 0 ? `<span>${kids} ילדים × ${money(perChild)}</span>` : ''}</div>
              <div><span>מקדמה</span><b>${money(d.depositAmount)}</b></div>
              ${third}
            </div></div>`;
    }

    signScreen(d) {
        return this.frame(d, 'חוזה התקשרות', `<div class="card">${this.logo(d)}<div class="contract">${d.contractHtml || ''}</div></div>
            ${this.summary(d)}
            <div class="cta"><button class="btn" data-act="openSign">לאישור וחתימה</button></div>
            ${this.signOpen ? this.signDialog(d) : ''}`);
    }

    signDialog(d) {
        const f = this.form;
        const dis = this.busy ? ' disabled' : '';
        const hasDep = Number(d.depositAmount) > 0 && Number(d.balanceAmount) > 0;
        const radio = (name, value, title, hint) => `<label class="chip"><input type="radio" name="${name}" data-k="${name}" value="${value}"${f[name] === value ? ' checked' : ''}${dis}><span><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
        const plans = `${radio('plan', 'full', `תשלום מלא — ${money(d.totalAmount)}`, '')}
            ${hasDep ? radio('plan', 'deposit', `מקדמה ${money(d.depositAmount)} כעת`, `והשלמת ${money(d.balanceAmount)} עד ${esc(dmy(d.balanceDueDate))}`) : ''}`;
        const methods = `${d.allowOnlinePayment ? radio('method', 'online', 'תשלום מקוון', 'ביט / כרטיס אשראי / Apple Pay') : ''}
            ${d.allowBankTransfer ? radio('method', 'bank_transfer', 'העברה בנקאית', 'פרטי החשבון יוצגו לאחר החתימה') : ''}`;
        const field = (k, label, type, ph) => `<label class="fld"><span>${label} <i>*</i></span><input class="txt" type="${type}" data-k="${k}" value="${esc(f[k])}" placeholder="${ph}"${dis}></label>`;
        return `<div class="mask" data-act="closeSign"></div>
            <div class="dlg" role="dialog" aria-modal="true">
              <div class="dlg-h"><div class="shield">${SHIELD}</div><div><b>אישור וחתימה</b><span>נא למלא את הפרטים ולחתום לסיום</span></div></div>
              <div class="dlg-b">
                ${field('name', 'שם מלא', 'text', 'ישראל ישראלי')}
                ${field('email', 'אימייל', 'email', 'name@example.com')}
                ${field('phone', 'טלפון', 'tel', '050-0000000')}
                <div class="fld"><span>מסלול תשלום <i>*</i></span><div class="chips">${plans}</div></div>
                <div class="fld"><span>אמצעי תשלום <i>*</i></span><div class="chips">${methods}</div></div>
                <div class="fld"><span>חתימה דיגיטלית <i>*</i></span>
                  <div class="sigwrap"><canvas id="sig"></canvas><div class="sigph">חתום כאן באמצעות העכבר או המגע</div></div>
                  <div class="sigrow"><span class="sub">החתימה תישמר כחתימה דיגיטלית מאושרת</span><button class="link" data-act="clear"${dis}>נקה חתימה</button></div>
                </div>
                <label class="approve"><input type="checkbox" data-k="approve"${f.approve ? ' checked' : ''}${dis}><span>קראתי ואני מאשר/ת את תנאי ההסכם</span></label>
                ${this.error ? `<div class="err">${esc(this.error)}</div>` : ''}
              </div>
              <div class="dlg-f"><button class="ghost" data-act="closeSign"${dis}>ביטול</button><button class="btn dark" data-act="sign"${dis}>${this.busy ? 'שולח...' : 'אישור סופי'}</button></div>
            </div>`;
    }

    payButton(stage, amount) {
        return `<div class="cta" style="margin-top:14px"><button class="btn" data-act="pay" data-stage="${stage}" ${this.busy ? 'disabled' : ''}>${this.busy ? 'מעבד...' : `לתשלום מאובטח ${money(amount)}`}</button><div class="sub" style="margin-top:6px">ביט / כרטיס אשראי / Apple Pay</div></div>`;
    }

    uploadBox(d, err) {
        const f = this.proofFile;
        const dis = this.busy ? ' disabled' : '';
        const prev = f ? `<div class="prev">${this.proofPreview ? `<img src="${esc(this.proofPreview)}" alt="">` : '<span class="pdf">📄</span>'}
            <div><b>${esc(f.name)}</b><div class="sub">${Math.max(1, Math.round(f.size / 1024))} KB</div></div></div>` : '';
        const rejected = (d.proofs || [])[0]?.status === 'rejected'
            ? '<div class="err" style="margin:0 0 10px">האסמכתא הקודמת נדחתה. נא להעלות אסמכתא תקינה.</div>' : '';
        return `<h3 class="t">📤 העלאת אסמכתא</h3>${rejected}
            <p class="sub" style="margin:0">לאחר ביצוע ההעברה, צרפו צילום מסך של האישור (תמונה או PDF).</p>
            <label class="drop"><input type="file" id="proofFile" accept="image/*,application/pdf"${dis}>
              <span class="ic">🖼️</span><b>${f ? 'החלפת קובץ' : 'לחצו לבחירת צילום מסך'}</b><span class="sub">JPG / PNG / PDF</span></label>
            ${prev}${err}
            <div class="cta" style="margin-top:14px"><button class="btn" data-act="upload"${f ? dis : ' disabled'}>${this.busy ? 'מעלה...' : 'שליחה לאישור'}</button></div>`;
    }

    statusNote(d) {
        const email = d.signerEmail || d.customerEmail;
        return `<div class="note">🔗 ניתן לחזור לקישור זה בכל עת כדי לצפות בסטטוס ההזמנה.<br>📧 לאחר אישור ההעברה תישלח אליכם חשבונית${email ? ` לכתובת <b>${esc(email)}</b>` : ' למייל'}.</div>`;
    }

    proofsTable(d) {
        const rows = d.proofs || [];
        if (!rows.length) return '';
        const ST = { pending: 'ממתין לאישור', paid: 'אושר', rejected: 'נדחה' };
        const STAGE = { deposit: 'מקדמה', full: 'תשלום מלא', balance: 'יתרה' };
        const cards = rows.map((p) => `<div class="prev" style="margin-top:8px">
            <div style="flex:1"><b>${esc(STAGE[p.stage] || p.stage)} · ${money(p.amount)}</b><div class="sub">${esc(dmy(p.at))}</div></div>
            <span class="st ${esc(p.status)}">${esc(ST[p.status] || p.status)}</span>
            ${safeUrl(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">צפייה</a>` : ''}</div>`).join('');
        return `<h3 class="t">🧾 אסמכתאות שנשלחו</h3>${cards}`;
    }

    signedNote(d) {
        const img = safeUrl(d.signatureUrl) ? `<img class="sigimg" src="${esc(d.signatureUrl)}" alt="חתימה">` : '';
        return `<div class="note" style="margin-top:12px"><b>✅ החוזה נחתם${d.signerName ? ` ע"י ${esc(d.signerName)}` : ''}${d.signedAt ? ` בתאריך ${esc(dmy(d.signedAt))}` : ''}</b>${img}</div>`;
    }

    paidLinkScreen(d) {
        const s = d.support || {};
        const rows = [
            s.address ? `<div class="fact"><div class="ic">📍</div><div><span>הסטודיו</span><b>${esc(s.address)}</b></div></div>` : '',
            safeUrl(s.site) ? `<div class="fact"><div class="ic">🌐</div><div><span>אתר</span><b><a href="${esc(s.site)}" target="_blank" rel="noopener">studiohappy.art</a></b></div></div>` : '',
        ].join('');
        return this.frame(d, 'החוזה החתום', `<div class="card">${this.logo(d)}<div class="contract">${d.contractHtml || ''}</div>${this.signedNote(d)}</div>
            ${this.summary(d)}
            <div class="card"><h3 class="t">שירות לקוחות</h3>
            <div class="facts">${rows}</div>
            <p class="sub" style="margin-top:10px">לכל שאלה אפשר לפנות אלינו גם דרך כפתור "שירות לקוחות" באתר.</p></div>`);
    }

    thanksScreen(d) {
        const p = d.lastPayment;
        const back = d.inline
            ? '<div class="cta" style="margin-top:14px"><button class="btn" data-act="reload">לצפייה בהצעה</button></div>'
            : /^\/[^/]/.test(d.backUrl || '') ? `<p style="text-align:center"><a href="${esc(d.backUrl)}">חזרה להצעה</a></p>` : '';
        const stage = { deposit: 'מקדמה', full: 'תשלום מלא', balance: 'יתרה' }[p?.stage] || '';
        const remaining = Math.max(0, (Number(d.totalAmount) || 0) - (Number(d.paidAmount) || 0));
        const email = d.signerEmail || d.customerEmail;
        let body;
        if (p?.status === 'paid') {
            const steps = remaining > 0
                ? [['💳', `נותרה יתרה של <b>${money(remaining)}</b> לתשלום${d.balanceDueDate ? ` עד <b>${esc(longDate(d.balanceDueDate))}</b>` : ''}.`],
                    ['🔗', 'את היתרה ניתן לשלם בכל עת דרך הקישור להצעה (נשלח אליכם בוואטסאפ / במייל).']]
                : [['🎉', 'ההצעה שולמה במלואה — אין צורך בפעולה נוספת.']];
            steps.push(['📧', `חשבונית על התשלום תישלח אליכם${email ? ` לכתובת <b>${esc(email)}</b>` : ' למייל'}.`]);
            if (d.eventDate) steps.push(['📅', `נתראה ב<b>${esc(weekday(d.eventDate))}, ${esc(longDate(d.eventDate))}</b>${d.eventStartTime ? ` בשעה <b>${esc(d.eventStartTime)}</b>` : ''}!`]);
            body = `<div class="msg" style="padding-bottom:6px"><div class="ic">✅</div><h2>התשלום התקבל, תודה!</h2><p>${esc(stage)} על סך <b>${money(p.amount)}</b></p></div>
                <div class="next"><h3>מה הלאה?</h3><ul>${steps.map(([ic, t]) => `<li><i>${ic}</i><span>${t}</span></li>`).join('')}</ul></div>
                ${remaining > 0 && !d.inline && back ? `<div class="cta"><a class="btn" style="text-decoration:none;display:inline-block" href="${esc(d.backUrl)}">לתשלום היתרה</a></div>` : ''}`;
            return this.frame(d, 'תודה!', `<div class="card">${this.logo(d)}${body}</div>${this.summary(d)}${d.inline ? back : ''}`);
        } else if (p?.status === 'failed' || p?.status === 'refunded') {
            body = '<div class="msg"><div class="ic">⚠️</div><h2>התשלום לא הושלם</h2><p class="sub">ניתן לחזור להצעה ולנסות שוב.</p></div>';
        } else if (d.timedOut) {
            body = '<div class="msg"><div class="ic">⏳</div><h2>התשלום בעיבוד</h2><p class="sub">האישור מחברת האשראי מתעכב. אם חויבתם, התשלום יופיע בהצעה בתוך דקות ונעדכן אתכם. אין צורך לשלם שוב.</p></div>';
        } else {
            body = '<div class="loading" role="status"><div class="spin"></div><b>מאמתים את התשלום...</b></div>';
        }
        return this.frame(d, 'תודה!', `<div class="card">${this.logo(d)}${body}</div>${back}`);
    }

    postSignScreen(d) {
        const vs = d.viewState;
        const err = this.error ? `<div class="err">${esc(this.error)}</div>` : '';
        const bank = d.bankDetailsText ? `<h3 class="t">פרטי העברה בנקאית</h3><div class="bank">${esc(d.bankDetailsText)}</div>` : '';
        const pdf = safeUrl(d.signedPdf) ? `<p><a href="${esc(safeUrl(d.signedPdf))}" target="_blank" rel="noopener">הורדת ההצעה החתומה (PDF)</a></p>` : '';
        let body = '';
        if (vs === 'signed_choose_payment') {
            const stage = d.selectedPaymentPlan === 'deposit' ? 'deposit' : 'full';
            const amount = stage === 'deposit' ? d.depositAmount : d.totalAmount;
            body = `<div class="ok">תודה! ההצעה נחתמה בהצלחה.</div>${d.selectedPaymentMethod === 'online' ? this.payButton(stage, amount) : ''}${err}`;
        } else if (vs === 'awaiting_transfer_proof') {
            const amount = d.selectedPaymentPlan === 'deposit' ? d.depositAmount : Math.max(0, (Number(d.totalAmount) || 0) - (Number(d.paidAmount) || 0));
            body = `<div class="ok">תודה! ההצעה נחתמה. נותר לבצע העברה בנקאית על סך ${money(amount)}.</div>${bank}${this.uploadBox(d, err)}${this.statusNote(d)}`;
        } else if (vs === 'awaiting_transfer_approval') {
            body = `<div class="msg" style="padding:8px"><div class="ic">⏳</div><h2>האסמכתא נשלחה לאישור</h2><p class="sub">נעדכן אותך ברגע שההעברה תאושר.</p></div>${this.statusNote(d)}${err}`;
        } else if (vs === 'balance_due') {
            const byBank = d.selectedPaymentMethod === 'bank_transfer';
            body = `<div class="ok">שולמה מקדמה ${money(d.paidAmount)}.</div><p>יתרה לתשלום <b>${money(d.balanceAmount)}</b> עד ${esc(dmy(d.balanceDueDate))}</p>${byBank ? bank + this.uploadBox(d, err) + this.statusNote(d) : this.payButton('balance', d.balanceAmount) + err}`;
        } else if (vs === 'paid_full') {
            body = `<div class="ok">ההצעה שולמה במלואה, תודה! 🎉</div>${pdf}`;
        }
        body += this.proofsTable(d);
        return this.frame(d, 'חוזה התקשרות', `<div class="card">${this.logo(d)}${body}</div>${this.summary(d)}
            <details class="card"><summary>צפייה בהסכם</summary><div class="contract" style="margin-top:12px">${d.contractHtml || ''}</div>${d.signedAt ? this.signedNote(d) : ''}</details>`);
    }
}

if (!customElements.get(TAG)) customElements.define(TAG, QuoteContract);
