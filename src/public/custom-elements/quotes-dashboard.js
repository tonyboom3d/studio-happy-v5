// <quotes-dashboard> — admin UI for quotes. UI only: no Wix APIs, no price math.
// Bridge: dispatches 'quotes-action' {type, payload, requestId}; page answers via the
// 'action-result' attribute: JSON {requestId, ok, data, error}. Add attribute mock="true" for local dev.

const TAG = 'quotes-dashboard';
const T0 = performance.now();
const dbg = (msg, extra) => console.log(`[quotes-FE +${Math.round(performance.now() - T0)}ms] ${msg}`, extra !== undefined ? extra : '');

const L = {
    status: { lead: 'ליד', draft: 'טיוטה', sent: 'נשלחה', viewed: 'נצפתה', signed: 'נחתמה', expired: 'פגה', cancelled: 'בוטלה' },
    sig: { pending: 'ממתין', signed: 'נחתם' },
    pay: { unpaid: 'לא שולם', deposit_paid: 'שולמה מקדמה', paid_full: 'שולם במלואו', awaiting_transfer_approval: 'אסמכתא לאישור' },
    type: { birthday: 'יום הולדת', event: 'אירוע' },
    method: { online: 'אונליין', bank_transfer: 'העברה בנקאית' },
    action: {
        created: 'נוצר', edited: 'נערך', price_changed: 'מחיר שונה', sent_whatsapp: 'נשלח בוואטסאפ', link_copied: 'קישור הועתק',
        viewed: 'נצפה', signed: 'נחתם', pdf_generated: 'PDF נוצר', email_sent: 'מייל נשלח', payment_started: 'תשלום התחיל',
        payment_succeeded: 'תשלום הצליח', payment_failed: 'תשלום נכשל', transfer_reported: 'דווחה העברה',
        transfer_approved: 'העברה אושרה', transfer_proof_uploaded: 'הועלתה אסמכתא', calendar_blocked: 'יומן נחסם',
        calendar_released: 'יומן שוחרר', conflict_detected: 'התגלתה התנגשות', conflict_alert_sent: 'נשלחה התראת התנגשות',
        payment_refunded: 'תשלום הוחזר', transfer_rejected: 'העברה נדחתה', quote_prepared: 'הוכנה לשליחה', quote_reprepared: 'הוכנה מחדש',
        quote_updated: 'עדכונים להצעה', staff_assigned: 'שובץ עובד', expired: 'פג תוקף', cancelled: 'בוטל',
        calendar_block_failed: 'חסימת יומן נכשלה', paid_email_sent: 'נשלח מייל אישור תשלום', paid_whatsapp_sent: 'נשלח וואטסאפ אישור תשלום',
        staff_notified: 'נשלחה הודעה לצוות',
    },
    actor: { admin: '👤', customer: '🙋', system: '⚙️' },
};
const BADGE = {
    status: { lead: 'gray', draft: 'gray', sent: 'blue', viewed: 'blue', signed: 'green', expired: 'amber', cancelled: 'red' },
    sig: { pending: 'amber', signed: 'green' },
    pay: { unpaid: 'gray', deposit_paid: 'blue', paid_full: 'green', awaiting_transfer_approval: 'red' },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap');
:host{display:block;direction:rtl;font-family:Rubik,Arial,sans-serif;color:#0f172a;background:#f1f5f9;min-height:600px;font-size:14px}
*{box-sizing:border-box}
.wrap{padding:16px}
.top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
h1{margin:0;font-size:22px;flex:1}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px}
.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
.filters label{display:flex;flex-direction:column;font-size:12px;color:#475569;gap:3px}
input,select,textarea{font:inherit;padding:7px 9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#0f172a;min-width:0}
select option{color:#0f172a;background:#fff}
input:focus,select:focus,textarea:focus{outline:2px solid #bfdbfe;border-color:#2563eb}
input:disabled,select:disabled,textarea:disabled{background:#f1f5f9;color:#64748b}
button{font:inherit;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:7px;padding:7px 12px}
button:hover{background:#f8fafc}button:disabled{opacity:.5;cursor:not-allowed}
.btn-p{background:#2563eb;border-color:#2563eb;color:#fff}.btn-p:hover{background:#1d4ed8}
.btn-d{background:#dc2626;border-color:#dc2626;color:#fff}.btn-d:hover{background:#b91c1c}
.tablewrap{overflow:auto;max-height:68vh}
table{border-collapse:collapse;width:100%;min-width:1500px}
th,td{padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;white-space:nowrap;vertical-align:middle}
th{position:sticky;top:0;background:#f8fafc;font-size:12px;color:#475569;z-index:1}
th.s{cursor:pointer}th.s:hover{color:#2563eb}
tr.row{cursor:pointer}tr.row:hover td{background:#eff6ff}
td.wrapc{white-space:normal;max-width:220px}
.sub{color:#64748b;font-size:12px}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600}
.gray{background:#e2e8f0;color:#334155}.blue{background:#dbeafe;color:#1d4ed8}.green{background:#dcfce7;color:#15803d}
.amber{background:#fef3c7;color:#b45309}.red{background:#fee2e2;color:#b91c1c}.purple{background:#ede9fe;color:#6d28d9}
@keyframes ping{0%{box-shadow:0 0 0 0 rgba(220,38,38,.7)}70%{box-shadow:0 0 0 8px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}}
.ping{display:inline-block;width:10px;height:10px;border-radius:50%;background:#dc2626;margin-inline-end:6px;vertical-align:middle;animation:ping 1.2s ease-out infinite;flex:none}
tr.row.alert td{background:#fff1f2}tr.row.alert:hover td{background:#ffe4e6}
.alertbar{display:flex;align-items:center;gap:8px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-weight:700}
.proof{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-top:8px;background:#f8fafc;overflow-wrap:anywhere}
.proof.wait{border-color:#fecaca;background:#fff7f7}
.proof.ok{border-color:#bbf7d0;background:#f0fdf4}
.proof-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.proof-top b{font-size:15px}
.proof-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
.proof-acts a{font-weight:600}
.conflict{color:#dc2626;font-weight:700}
.pager{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:10px}
.empty,.loading{padding:40px;text-align:center;color:#64748b}
.err{background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;padding:10px;border-radius:8px;margin-bottom:10px}
.toast{position:fixed;bottom:18px;left:18px;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;z-index:50}
.dlgmask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:70}
.dlg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(440px,92%);background:#fff;color:#0f172a;border-radius:12px;z-index:71;padding:18px;box-shadow:0 16px 40px rgba(0,0,0,.28)}
.dlg h2{margin:0 0 8px;font-size:18px}
.dlg p{margin:0 0 16px;font-size:16px;line-height:1.5}
.dlg .row{display:flex;gap:8px;justify-content:flex-end}
.dlg input{width:100%;margin:0 0 14px}
.mask{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:20}
.drawer{position:fixed;top:0;bottom:0;left:0;width:min(720px,100%);background:#f8fafc;z-index:21;overflow:auto;box-shadow:4px 0 24px rgba(0,0,0,.2);font-size:16px}
.drawer input,.drawer select,.drawer textarea{font-size:17px;padding:10px 12px}
.drawer .grid label{font-size:15px}
.drawer .chk{font-size:16px!important}
.drawer .sub,.drawer .tl .chg,.drawer .lockmsg{font-size:15px}
.drawer .badge{font-size:14px}
.drawer .sec h3{font-size:18px}
.drawer .pay-row b,.drawer .sum b{font-size:17px}
.dh{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;z-index:2}
.dh h2{margin:0;font-size:22px;flex:1}
.db{padding:14px}
.sec{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px}
.tl .chg{margin:4px 0 0;padding:0 16px 0 0;font-size:12px;color:#334155;list-style:disc}.tl .chg li{display:list-item;padding:1px 0;border:0}
.staffList{display:flex;flex-direction:column;gap:8px}
.staffRow{padding:6px 0;border-bottom:1px solid #f1f5f9}
.sec h3{margin:0 0 10px;font-size:14px;color:#1d4ed8;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none}
.sec h3:after{content:"▾";font-size:12px}
.sec.col h3{margin:0}.sec.col h3:after{content:"◂"}
.sec.col>*:not(h3){display:none}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.grid label{display:flex;flex-direction:column;font-size:12px;color:#475569;gap:3px}
.grid .full{grid-column:1/-1}
.chk{flex-direction:row!important;align-items:center;gap:8px!important;font-size:14px!important;color:#0f172a!important}
.addon-add{display:flex;gap:8px;align-items:center;margin-top:8px}.addon-add select{flex:1;min-width:180px;width:100%}
.pay-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9}
.pay-row b{display:block;font-size:14px;color:#0f172a}.pay-row .sub{margin:0}
.switch{position:relative;width:46px;height:26px;flex:none}
.switch input{position:absolute;opacity:0;width:0;height:0}
.switch .knob{position:absolute;inset:0;background:#cbd5e1;border-radius:999px;cursor:pointer;transition:.15s}
.switch .knob:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}
.switch input:checked+.knob{background:#2563eb}
.switch input:checked+.knob:before{transform:translateX(20px)}
.switch input:disabled+.knob{opacity:.5;cursor:not-allowed}
.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.sum div{background:#f1f5f9;border-radius:8px;padding:8px;text-align:center}.sum b{display:block;font-size:16px}
.extra{display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px dashed #e2e8f0}.extra span{flex:1}
.price-top{display:grid;grid-template-columns:1fr 1fr minmax(150px,1.15fr);gap:8px}
.price-top>*{min-width:0}
.price-top label,.price .dates label{display:flex;flex-direction:column;gap:3px;font-size:13px;color:#475569}
.seg button.on:hover{background:#1d4ed8;color:#fff}
.dep-row{display:inline-flex;align-items:stretch;max-width:100%}
.dep-row input{width:78px;flex:none;min-width:0;border-start-end-radius:0;border-end-end-radius:0}
.seg{display:flex;flex:none}
.seg button{border-radius:0;margin-inline-start:-1px;padding:0 8px;min-width:30px;font-size:14px;font-weight:700}
.seg button:last-child{border-start-end-radius:7px;border-end-end-radius:7px}
.seg button.on{background:#2563eb;border-color:#2563eb;color:#fff}
.price .dates{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.price .extras{margin-top:8px}
.price .extras-h{font-size:14px;font-weight:700;margin-bottom:2px}
.price .extra{padding:2px 0;gap:6px}
.price .extra b{font-variant-numeric:tabular-nums}
.price .x{border:0;background:transparent;color:#94a3b8;padding:0 4px;line-height:1}
.price .x:hover{color:#dc2626;background:transparent}
.price .addon-add{margin-top:6px}
.price .addon-add input[type=number]{width:84px;flex:none}
.price .sum{gap:6px;margin-top:8px}
.price .sum div{padding:6px 4px}
.price .hint{margin-top:4px;font-size:12px}
.drawer .price input,.drawer .price select{font-size:15px;padding:6px 8px}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tag{display:inline-flex;align-items:center;gap:4px;background:#dbeafe;color:#1e40af;border-radius:999px;padding:5px 8px 5px 12px;font-size:15px;font-weight:600}
.tag button{border:0;background:transparent;color:#1e40af;padding:0 2px;font-size:16px;line-height:1}
.ws-btn{width:100%;text-align:right;background:#fff}
.ws-drop{margin-top:6px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;max-height:220px;overflow:auto}
.ws-opt{display:flex;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;font-size:16px;color:#0f172a}
.ws-opt:hover{background:#eff6ff}
.ws-opt input{width:16px;height:16px;padding:0}
.tl{list-style:none;margin:0;padding:0}.tl li{padding:7px 0;border-bottom:1px solid #f1f5f9;display:flex;gap:8px}
.foot{position:sticky;bottom:0;background:#fff;border-top:1px solid #e2e8f0;padding:10px 16px;display:flex;gap:8px;justify-content:space-between}
.modal{position:fixed;top:4vh;left:50%;transform:translateX(-50%);width:min(1180px,96%);max-height:92vh;overflow:auto;background:#f8fafc;border-radius:12px;z-index:30;box-shadow:0 12px 40px rgba(0,0,0,.3);font-size:17px}
.modal .sec h3{font-size:20px}
.modal :where(input:not([type=checkbox]),select,textarea),.modal .rte{font-size:17px;padding:10px 12px}
.modal .chk,.modal .sub,.modal .grid label,.modal .rteHead b,.modal .full>b{font-size:16px}
.modal .extra{font-size:17px}
.rte{min-height:90px;max-height:60vh;overflow:auto;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#0f172a;white-space:pre-wrap;line-height:1.8;margin-top:4px}
.rte.tall{min-height:340px}
.rte:focus{outline:2px solid #bfdbfe;border-color:#2563eb}
.ph{display:inline-block;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:6px;padding:0 7px;margin:0 2px;font-weight:600;font-size:.9em;line-height:1.6;user-select:all;cursor:default}
.ph.opt{background:#f3e8ff;color:#7e22ce;border-color:#d8b4fe}
.optg{display:inline-flex;align-items:center;gap:5px;background:#faf5ff;border:1.5px dashed #a855f7;border-radius:8px;padding:0 6px;margin:0 2px;cursor:pointer;user-select:all;font-size:.95em}
.optg:hover{background:#f3e8ff;border-style:solid}
.optg .ph{margin:0}
.optt{color:#6b21a8}
.segpop{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center}
.segbox{background:#fff;border-radius:12px;padding:18px 20px;width:min(560px,94%);box-shadow:0 20px 50px rgba(0,0,0,.25);font-size:17px;display:grid;gap:10px}
.segbox h3{margin:0;font-size:19px}
.segbox label{display:grid;gap:4px;font-size:16px}
.segbox i{color:#dc2626;font-style:normal}
.segbox .sub{font-size:15px;margin:0}
.segbox input{font-size:17px;padding:9px 11px;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px}
.segprev{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}
.segerr{color:#dc2626;font-size:15px}
.segerr:empty{display:none}
.phLegend{font-size:15px;color:#475569;background:#fff;border:1px dashed #cbd5e1;border-radius:8px;padding:8px 10px}
.rteHead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.rteHead select{width:auto;min-width:220px}
.lockmsg{background:#fef3c7;color:#92400e;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:13px}
@media(max-width:700px){.grid,.price-top,.price .dates{grid-template-columns:1fr}.sum{grid-template-columns:repeat(2,1fr)}}
.drawer{display:flex;flex-direction:column;overflow:hidden;background:#f8fafc}
.drawer .db{flex:1;overflow:auto;padding:16px}
.tabs{display:flex;gap:4px;padding:8px 10px 0;background:#fff;border-bottom:1px solid #e2e8f0;overflow-x:auto;flex:none}
.tab{border:0;border-bottom:3px solid transparent;border-radius:8px 8px 0 0;background:transparent;padding:9px 12px;font-size:15px;font-weight:600;color:#64748b;white-space:nowrap;position:relative}
.tab:hover{background:#f1f5f9;color:#0f172a}
.tab.on{color:#2563eb;border-bottom-color:#2563eb;background:#eff6ff}
.tab .dot{position:absolute;top:6px;left:5px;width:8px;height:8px;border-radius:50%;background:#f59e0b}
.pane{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:12px}
.pane-h{margin:0 0 12px;font-size:17px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px}
.drawer .grid{gap:12px 14px}
.drawer .grid label,.fl{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:600;color:#334155}
.drawer :where(input:not([type=checkbox]):not([type=radio]),select,textarea){font-size:16px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;transition:border-color .15s,box-shadow .15s;width:100%;font-weight:400;color:#0f172a}
.drawer .ws-btn{border-radius:10px;padding:10px 12px;border-color:#e2e8f0;font-size:16px}
.drawer :where(input:not([type=checkbox]):not([type=radio]),select,textarea):hover{border-color:#cbd5e1}
.drawer :where(input,select,textarea):focus{outline:0;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.18)}
.drawer :where(input,select,textarea):disabled{background:#f8fafc;color:#64748b}
.drawer .ex-custom #customTitle{flex:1;min-width:0}
.foot{flex:none;position:static;flex-direction:column;gap:8px;padding:10px 14px}
.stepnav{display:flex;align-items:center;justify-content:space-between;gap:8px}
.stepnav .sub{font-size:14px}
.stepnav button{min-width:96px;font-weight:600}
.acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:space-between;border-top:1px solid #f1f5f9;padding-top:8px}
.acts span{display:flex;gap:6px;flex-wrap:wrap}
.exw{position:relative;margin-top:10px}
.ex-btn{width:100%;text-align:right;display:flex;justify-content:space-between;align-items:center;border:1px dashed #94a3b8;border-radius:10px;padding:10px 12px;font-weight:600;color:#1d4ed8;background:#f8fafc}
.ex-pop{position:absolute;inset-inline:0;top:calc(100% + 4px);background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 30px rgba(15,23,42,.15);z-index:5;overflow:hidden}
.ex-list{max-height:220px;overflow:auto}
.ex-opt{display:flex;justify-content:space-between;width:100%;border:0;border-radius:0;border-bottom:1px solid #f1f5f9;padding:10px 12px;text-align:right;font-size:15px}
.ex-opt:hover{background:#eff6ff}.ex-opt:disabled{opacity:.55}
.ex-custom{display:flex;gap:6px;padding:10px;background:#f8fafc;border-top:1px solid #e2e8f0}
.drawer .ex-custom input{padding:8px 10px;font-size:15px}
.ex-custom input[type=number]{width:96px;flex:none}
.xrow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9}
.xrow .nm{flex:1;font-size:15px}.xrow .nm small{display:block;color:#94a3b8;font-size:12px}
.xprice{display:flex;align-items:center;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;width:120px;flex:none;background:#fff}
.xprice span{padding:0 8px;color:#64748b;background:#f8fafc;align-self:stretch;display:flex;align-items:center}
.drawer .xprice input{border:0;border-radius:0;padding:7px 8px;font-size:15px;box-shadow:none}
.xrow .x{border:0;background:transparent;color:#94a3b8;font-size:16px;padding:4px}.xrow .x:hover{color:#dc2626}
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dep{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;margin-top:12px}
.dep b{font-size:15px}.dep .sub{font-size:13px}
.depv{display:flex;align-items:center;gap:8px;margin-top:10px}
.drawer .depv input{width:110px;flex:none;border-start-end-radius:0;border-end-end-radius:0}
.depv .seg button:last-child{border-start-end-radius:10px;border-end-end-radius:10px}
.depv .fl{white-space:nowrap}
.depv .seg button{padding:8px 12px}
.psum{border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-top:4px}
.psum .ln{display:flex;justify-content:space-between;padding:8px 14px;font-size:15px;color:#334155}
.psum .ln s{color:#94a3b8;margin-inline-end:6px}
.psum .tot{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#0f172a;color:#fff;font-size:16px}
.psum .tot b{font-size:22px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px}
.split.one{grid-template-columns:1fr}
.split div{border-radius:10px;padding:10px 12px;background:#f0fdf4;border:1px solid #dcfce7}
.split div.bal{background:#fffbeb;border-color:#fde68a}
.split span{display:block;font-size:13px;color:#475569}.split b{display:block;font-size:19px}.split small{color:#64748b;font-size:12px}
.psum .paid{padding:0 14px 10px;font-size:14px;color:#15803d;font-weight:600}
.cal-t{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}
.ct{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:right;border:2px solid #e2e8f0;border-radius:12px;padding:8px 10px;background:#fff;position:relative}
.ct.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 8%,#fff)}
.ct span{font-size:13px;color:#64748b}.ct b{font-size:15px}
.ct .clr{position:absolute;top:4px;left:6px;border:0;background:transparent;color:#94a3b8;padding:0 2px;font-size:14px}
.ct .clr:hover{color:#dc2626}
.ev{--c:#7c3aed}.bal{--c:#d97706}.exp{--c:#2563eb}
.cal{border:1px solid #e2e8f0;border-radius:14px;padding:10px}
.cal-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.cal-h b{font-size:16px}.cal-h button{border:0;font-size:18px;padding:4px 10px}
.cal-g{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cal-g .wd{text-align:center;font-size:12px;color:#94a3b8;font-weight:600;padding:4px 0}
.day{position:relative;height:40px;border:1px solid transparent;border-radius:10px;background:#fff;font-size:15px;padding:0;display:flex;align-items:center;justify-content:center;flex-direction:column}
.day:hover:not(:disabled){background:#eff6ff;border-color:#bfdbfe}
.day:disabled{color:#cbd5e1;background:transparent;text-decoration:line-through}
.day.today{border-color:#94a3b8;font-weight:700}
.day.m-ev{background:#7c3aed;color:#fff}.day.m-bal{background:#d97706;color:#fff}.day.m-exp{background:#2563eb;color:#fff}
.day.sel{box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 40%,transparent)}
.day .dots{display:flex;gap:2px;position:absolute;bottom:3px}
.day .dots i{width:5px;height:5px;border-radius:50%;background:var(--c)}
.day.m-ev .dots i,.day.m-bal .dots i,.day.m-exp .dots i{background:#fff}
.legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:#475569}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--c);margin-inline-end:4px;vertical-align:middle}
.tline{list-style:none;margin:0;padding:0}
.tline li{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px dashed #e2e8f0}
.tline li:last-child{border-bottom:0}
.tline .ic{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;flex:none}
.tline span{display:block;font-size:13px;color:#64748b}.tline b{font-size:15px}
@media(max-width:700px){.pgrid,.split{grid-template-columns:1fr}.tab{padding:8px 9px;font-size:14px}}
`;

const STEPS = [
    ['customer', 'פרטי לקוח', '👤'], ['event', 'האירוע', '🎨'], ['dates', 'תאריכים', '📅'],
    ['pricing', 'תמחור', '💰'], ['payment', 'תשלום', '💳'], ['activity', 'מעקב', '🕘'],
];
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
/** Display-only preview; the server recomputes amounts on save. */
const previewAmounts = (d) => {
    const extras = round2((d.extras || []).reduce((s, x) => s + (Number(x.price) || 0), 0));
    const base = Number(d.basePrice) || 0;
    const ov = d.priceOverride === '' || d.priceOverride === null || d.priceOverride === undefined ? null : Number(d.priceOverride);
    const total = round2(ov ?? base + extras);
    const v = d.hasDeposit ? Number(d.depositValue) || 0 : 0;
    const dep = round2(d.depositType === 'fixed' ? Math.min(v, total) : (total * v) / 100);
    return { base, extras, ov, total, dep, bal: round2(total - dep) };
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (v) => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
const dmy = (v) => { const s = ymd(v); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'; };
const dmyTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
};
const money = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
const ilToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const splitWs = (v) => [...new Set(String(v || '').split(',').map((s) => s.trim()).filter(Boolean))];
const phoneDisp = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? `0${d.slice(3, 5)}-${d.slice(5)}` : (p || '—'); };
const badge = (map, group, key) => `<span class="badge ${BADGE[group]?.[key] || 'gray'}">${esc(map[key] || key || '—')}</span>`;
const paySwitch = (key, title, hint, draft, dis) => `<div class="pay-row"><div><b>${title}</b><div class="sub">${hint}</div></div><label class="switch"><input type="checkbox" data-f="${key}"${draft[key] ? ' checked' : ''}${dis}><span class="knob"></span></label></div>`;
const errText = (e) => {
    const blobs = [];
    const push = (v) => { if (v == null || v === '') return; blobs.push(typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch (_) { return String(v); } })()); };
    push(e?.message); push(e?.errorDescription); push(e?.details); push(e);
    const blob = blobs.join('\n');
    const tagged = blob.match(/(?:VALIDATION|NOT_FOUND|ACCESS_DENIED|STATE|PAYMENT|UNKNOWN_ACTION):([^"\n]+)/);
    if (tagged) return tagged[1].trim();
    const m = String(e?.message || e || 'שגיאה');
    const i = m.indexOf(':');
    return /^[A-Z_]+$/.test(m.slice(0, i)) ? m.slice(i + 1).trim() : m;
};

const MOCK_ROWS = [
    { _id: 'm1', _createdDate: new Date().toISOString(), customerName: 'דנה כהן', customerPhone: '972521234567', eventType: 'birthday', status: 'lead', signatureStatus: 'pending', paymentStatus: 'unpaid', totalAmount: 2500, depositAmount: 750, balanceAmount: 1750, participants: 12, requestedWorkshop: 'קרמיקה, נרות', extras: [{ title: 'ברד', price: 200 }], conflicts: [] },
    { _id: 'm2', _createdDate: new Date().toISOString(), customerName: 'חברת אלפא', customerPhone: '972501112233', eventType: 'event', status: 'signed', signatureStatus: 'signed', paymentStatus: 'deposit_paid', totalAmount: 9000, depositAmount: 3000, balanceAmount: 6000, workshopClosed: true, requiredInstructors: 2, conflicts: [{ key: 'x' }], extras: [] },
    { _id: 'm3', _createdDate: new Date().toISOString(), customerName: 'נועה לוי', customerPhone: '972541112233', eventType: 'birthday', status: 'signed', signatureStatus: 'signed', paymentStatus: 'awaiting_transfer_approval', totalAmount: 2300, depositAmount: 690, balanceAmount: 1610, participants: 10, extras: [], conflicts: [] },
];

class QuotesDashboard extends HTMLElement {
    static get observedAttributes() { return ['action-result', 'bridge-ready']; }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.pending = new Map();
        this.seq = 0;
        this.s = {
            items: [], total: 0, loading: true, error: '', search: '', filters: {}, sort: { field: '_createdDate', dir: 'desc' },
            skip: 0, limit: 25, actors: [], addons: [], workshops: [], actorId: '', detail: null, open: { customer: true }, modal: null, detailLoading: false, saving: false, toast: '', wsOpen: false,
        };
    }

    connectedCallback() {
        this.setAttribute('dir', 'rtl');
        try { this.s.actorId = localStorage.getItem('quotesActorId') || ''; } catch (_) { /* storage blocked */ }
        this.root.innerHTML = `<style>${CSS}</style><div id="app"></div>`;
        this.root.addEventListener('click', (e) => this.onClick(e));
        this.root.addEventListener('input', (e) => this.onInput(e));
        this.root.addEventListener('change', (e) => this.onChange(e));
        ['keyup', 'mouseup'].forEach((ev) => this.root.addEventListener(ev, (e) => { if (e.target.closest?.('.rte')) this.saveRteRange(); }));
        this.root.addEventListener('paste', (e) => {
            if (!e.target.closest?.('.rte')) return;
            e.preventDefault();
            document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '');
        });
        this.paintCache();
        dbg('connected', { cachedItems: this.s.items.length, bridgeReady: this.hasAttribute('bridge-ready') });
        this.render();
        this.startBoot();
    }

    attributeChangedCallback(name, _old, val) {
        if (name === 'bridge-ready' && val) dbg('bridge-ready received');
        if (name === 'bridge-ready' && val && this.isConnected && !this.bootStarted) { this.boot(); return; }
        if (name !== 'action-result' || !val) return;
        try {
            const msg = JSON.parse(val);
            const p = this.pending.get(msg.requestId);
            if (!p) { dbg(`reply for unknown request ${msg.requestId} (late/duplicate)`); return; }
            this.pending.delete(msg.requestId);
            clearTimeout(p.timer);
            dbg(`← ${p.type} ${msg.ok ? 'ok' : 'ERROR'} in ${Math.round(performance.now() - p.t0)}ms`, msg.ok ? (msg.data?.items ? { items: msg.data.items.length, total: msg.data.total } : undefined) : msg.error);
            if (msg.ok) p.resolve(msg.data); else p.reject(new Error(msg.error || 'שגיאה'));
        } catch (err) { console.error('[quotes-dashboard] bad action-result', err); }
    }

    // ---------- bridge ----------
    req(type, payload = {}, timeoutMs = 60000) {
        if (this.getAttribute('mock') === 'true') return this.mockReq(type, payload);
        const requestId = `${Date.now()}-${++this.seq}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(requestId); if (type !== 'ping') dbg(`✖ ${type} TIMEOUT (no reply from page: listener missing?)`); reject(new Error('הבקשה נכשלה (פג זמן)')); }, timeoutMs);
            this.pending.set(requestId, { resolve, reject, timer, type, t0: performance.now() });
            if (type !== 'ping') dbg(`→ ${type}`, requestId);
            this.dispatchEvent(new CustomEvent('quotes-action', { detail: { type, payload: { ...payload, actorName: this.actorName() }, requestId }, bubbles: true, composed: true }));
        });
    }

    mockReq(type, payload) {
        const ok = (d) => new Promise((r) => setTimeout(() => r(d), 150));
        if (type === 'boot' || type === 'init') return ok({ actors: [{ id: 'a1', name: 'מנהל בדיקה' }], addons: [{ id: 'x1', title: 'ברד', price: 200 }], workshops: ['קרמיקה', 'נרות', 'טאפטינג', "צ'ארמס"], items: MOCK_ROWS, total: MOCK_ROWS.length });
        if (type === 'list') return ok({ items: MOCK_ROWS, total: MOCK_ROWS.length });
        if (type === 'get') {
            const quote = MOCK_ROWS.find((r) => r._id === payload.id) || MOCK_ROWS[0];
            const proofs = quote.paymentStatus === 'awaiting_transfer_approval'
                ? [{ at: new Date().toISOString(), stage: 'deposit', amount: quote.depositAmount, status: 'pending', url: 'https://static.wixstatic.com/media/6b73e9_3d8054d68ecb422a82c328f8c4c163f3~mv2.png', isPdf: false }]
                : [];
            return ok({ quote, log: [], payments: [], proofs });
        }
        if (type === 'staff') return ok({ actors: [{ id: 'a1', name: 'מנהל בדיקה', trainings: [{ id: 'x1', title: 'ברד' }] }], busyStaff: {} });
        if (type === 'templates') return ok({ templates: [], placeholders: ['customerName', 'totalAmount', 'depositAmount'], fieldOptions: [{ key: 'customerName', label: 'שם הלקוח' }, { key: 'totalAmount', label: 'סה"כ לתשלום' }, { key: 'depositAmount', label: 'מקדמה' }], defaultFields: ['customerName'], optionalFields: ['depositAmount'] });
        if (type === 'preview') return ok({ html: '<h1>תצוגה לדוגמה</h1>' });
        if (type === 'update') return ok({ quote: { ...MOCK_ROWS[0], ...payload.patch } });
        return ok({ summary: { scanned: 0, created: 0, skipped: 0 } });
    }

    actorName() { return (this.s.actors.find((a) => a.id === this.s.actorId) || {}).name || ''; }

    // Stale-while-revalidate: last snapshot paints at once, refresh runs in the background.
    paintCache() {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem('quotesBootCache') || 'null'); } catch (_) { /* ignore */ }
        if (cached?.items) {
            this.s.addons = cached.addons || [];
            this.s.workshops = cached.workshops || [];
            this.s.items = cached.items; this.s.total = cached.total || 0;
            this.s.loading = false;
            this.cached = true;
        }
    }

    // Wait for the page's 'bridge-ready' (listener attached) so the first request is not lost; fallback after 3s.
    startBoot() {
        if (this.getAttribute('mock') === 'true' || this.hasAttribute('bridge-ready')) { this.boot(); return; }
        dbg('waiting for bridge-ready (fallback 3s)');
        this.bootTimer = setTimeout(() => { dbg('bridge-ready fallback fired'); this.boot(); }, 3000);
    }

    // Velo binds the element's event listener asynchronously; early events are dropped. Ping until the page answers.
    async waitBridge() {
        if (this.getAttribute('mock') === 'true') return;
        for (let i = 1; i <= 40; i++) {
            const ok = await new Promise((resolve) => {
                let done = false;
                const finish = (v) => { if (!done) { done = true; resolve(v); } };
                this.req('ping', {}, 700).then(() => finish(true), () => finish(false));
            });
            if (ok) { dbg(`bridge answered ping (attempt ${i})`); return; }
        }
        dbg('bridge never answered ping; sending boot anyway');
    }

    async boot() {
        if (this.bootStarted) return;
        this.bootStarted = true;
        clearTimeout(this.bootTimer);
        const cached = this.cached;
        await this.waitBridge();
        try {
            const res = await this.req('boot', {
                search: this.s.search, sort: this.s.sort, paging: { limit: this.s.limit, skip: 0 }, filters: {},
            });
            this.s.actors = res.actors || [];
            this.s.addons = res.addons || [];
            this.s.workshops = res.workshops || [];
            this.s.items = res.items || [];
            this.s.total = res.total || 0;
            try { localStorage.setItem('quotesBootCache', JSON.stringify({ actors: this.s.actors, addons: this.s.addons, workshops: this.s.workshops, items: this.s.items, total: this.s.total })); } catch (_) { /* quota */ }
        } catch (err) { if (!cached) this.s.error = errText(err); }
        this.s.loading = false;
        this.render();
    }

    async load() {
        this.s.loading = true; this.s.error = ''; this.render();
        try {
            const f = this.s.filters;
            const res = await this.req('list', {
                search: this.s.search, sort: this.s.sort, paging: { limit: this.s.limit, skip: this.s.skip },
                filters: { ...f, workshopClosed: f.workshopClosed === '' || f.workshopClosed === undefined ? undefined : f.workshopClosed === 'true' },
            });
            this.s.items = res.items || []; this.s.total = res.total || 0;
        } catch (err) { this.s.error = errText(err); }
        this.s.loading = false; this.render();
    }

    toast(msg) {
        clearTimeout(this.toastTimer);
        this.s.toast = msg; this.render();
        this.toastTimer = setTimeout(() => { if (this.s.toast === msg) { this.s.toast = ''; this.render(); } }, 3200);
    }

    ask(opts) {
        this._dialogResolve?.(false);
        return new Promise((resolve) => {
            this._dialogResolve = resolve;
            this.s.dialog = opts;
            this.render();
        });
    }

    closeDialog(ok) {
        const resolve = this._dialogResolve;
        this._dialogResolve = null;
        this.s.dialog = null;
        this.render();
        resolve?.(!!ok);
    }

    fail(err) {
        const body = errText(err);
        if (this.s.detail && !this.s.detail.loading) this.s.detail.banner = body;
        return this.ask({ kind: 'alert', title: 'לא ניתן להמשיך', body, ok: 'הבנתי' });
    }

    // ---------- events ----------
    onInput(e) {
        const t = e.target;
        if (t.dataset.xp !== undefined && this.s.detail?.draft && !this.isLocked()) {
            const x = this.s.detail.draft.extras[Number(t.dataset.xp)];
            if (x) { x.price = Math.max(0, Number(t.value) || 0); this.refreshSum(); }
            return;
        }
        if (t.dataset.f && this.s.detail?.draft) this.readField(t);
        if (t.dataset.t && this.s.modal?.tpl) this.s.modal.tpl[t.dataset.t] = t.type === 'checkbox' ? t.checked : t.value;
        if (t.dataset.c && this.s.modal?.tpl) this.s.modal.tpl.config[t.dataset.c] = t.value;
        if (t.dataset?.rc && this.s.modal?.tpl) { this.s.modal.tpl.config[t.dataset.rc] = this.rteText(t); this.saveRteRange(); }
        if (t.id === 'search') { clearTimeout(this.st); this.st = setTimeout(() => { this.s.search = t.value; this.s.skip = 0; this.load(); }, 400); }
    }

    onChange(e) {
        const t = e.target;
        if (t.dataset.filter) { this.s.filters[t.dataset.filter] = t.value || undefined; if (t.dataset.filter === 'workshopClosed') this.s.filters.workshopClosed = t.value; this.s.skip = 0; this.load(); }
        else if (t.id === 'staffPick' && t.value && this.s.detail?.draft) { this.toggleStaff(t.value, true); this.render(); }
        else if (t.dataset.ws && this.s.detail?.draft && !this.isLocked()) {
            const set = new Set(this.s.detail.draft.workshops || []);
            t.checked ? set.add(t.value) : set.delete(t.value);
            this.s.detail.draft.workshops = [...set];
            this.s.wsOpen = true;
            this.render();
        } else if (t.dataset.f && this.s.detail) { this.readField(t); }
        else if (t.dataset.ins && this.s.modal?.tpl) { this.insertPh(t.dataset.ins, t.value); t.value = ''; }
        else if (t.dataset.t && this.s.modal?.tpl) { this.s.modal.tpl[t.dataset.t] = t.type === 'checkbox' ? t.checked : t.value; }
    }

    toggleStaff(id, checked) {
        const d = this.s.detail.draft;
        const ids = new Set(d.assignedStaffIds || []);
        checked ? ids.add(id) : ids.delete(id);
        d.assignedStaffIds = [...ids];
    }

    readField(t) {
        const q = this.s.detail.draft;
        const pay = t.dataset.f === 'allowOnlinePayment' || t.dataset.f === 'allowBankTransfer';
        if (pay && t.type === 'checkbox') {
            const other = t.dataset.f === 'allowOnlinePayment' ? 'allowBankTransfer' : 'allowOnlinePayment';
            if (!t.checked && !q[other]) { t.checked = true; this.fail('חייב להישאר אמצעי תשלום אחד פעיל'); return; }
        }
        if (t.dataset.f === 'eventDate' && t.value && t.value < ilToday()) {
            t.value = q.eventDate && q.eventDate >= ilToday() ? q.eventDate : '';
            this.fail('לא ניתן לבחור תאריך שעבר');
            return;
        }
        q[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
        if (t.dataset.f === 'hasDeposit') {
            if (q.hasDeposit && !(Number(q.depositValue) > 0)) { q.depositType = 'percent'; q.depositValue = 30; }
            return this.render();
        }
        if (['basePrice', 'priceOverride', 'depositValue'].includes(t.dataset.f)) this.refreshSum();
    }

    refreshSum() {
        const box = this.root.getElementById('sumBox');
        if (box) box.innerHTML = this.priceSummary(this.s.detail.draft, this.s.detail.quote);
    }

    onClick(e) {
        const segBtn = e.target.closest('[data-segact]');
        if (segBtn) return this.segAction(segBtn.dataset.segact);
        if (e.target.closest('.segpop')) return;
        const segChip = e.target.closest('.rte .optg');
        if (segChip) return this.openSeg(segChip, false);
        const el0 = e.target.closest('[data-act]');
        if (el0?.dataset.act === 'dlgOk') return this.closeDialog(true);
        if (el0?.dataset.act === 'dlgNo') return this.closeDialog(false);
        if (el0?.dataset.act === 'dlgCopy') return this.copyDlg();
        if (this.s.dialog) return;
        const outsideWs = this.s.wsOpen && !e.target.closest('.ws');
        if (outsideWs) this.s.wsOpen = false;
        const outsideEx = this.s.exOpen && !e.target.closest('.exw');
        if (outsideEx) this.s.exOpen = false;
        const el = e.target.closest('[data-act]');
        if (!el) { if (outsideWs || outsideEx) this.render(); return; }
        const a = el.dataset.act;
        if (a === 'tab') { this.s.tab = el.dataset.k; return this.renderDrawerTop(); }
        if (a === 'stepPrev' || a === 'stepNext') {
            const i = STEPS.findIndex(([k]) => k === (this.s.tab || 'customer')) + (a === 'stepNext' ? 1 : -1);
            if (STEPS[i]) this.s.tab = STEPS[i][0];
            return this.renderDrawerTop();
        }
        if (a === 'exToggle') { if (this.isLocked()) return; this.s.exOpen = !this.s.exOpen; return this.render(); }
        if (a === 'addCatalog') return this.addCatalogExtra(el.dataset.id);
        if (a === 'calTarget') { this.calState().target = el.dataset.k; return this.render(); }
        if (a === 'calClear') { if (this.isLocked()) return; this.s.detail.draft[el.dataset.k] = ''; return this.render(); }
        if (a === 'calMonth') { this.calState().month = el.dataset.m; return this.render(); }
        if (a === 'calDay') return this.pickDay(el.dataset.d);
        if (a === 'row') return this.openDetail(el.dataset.id);
        if (a === 'sort') { const f = el.dataset.field; this.s.sort = { field: f, dir: this.s.sort.field === f && this.s.sort.dir === 'desc' ? 'asc' : 'desc' }; this.s.skip = 0; return this.load(); }
        if (a === 'prev') { this.s.skip = Math.max(0, this.s.skip - this.s.limit); return this.load(); }
        if (a === 'next') { this.s.skip += this.s.limit; return this.load(); }
        if (a === 'refresh') return this.load();
        if (a === 'sync') return this.sync();
        if (a === 'close') { this.s.detail = null; this.s.wsOpen = false; return this.render(); }
        if (a === 'wsToggle') { if (this.isLocked()) return; this.s.wsOpen = !this.s.wsOpen; return this.render(); }
        if (a === 'wsRemove') {
            if (this.isLocked()) return;
            this.s.detail.draft.workshops = (this.s.detail.draft.workshops || []).filter((n) => n !== el.dataset.name);
            return this.render();
        }
        if (a === 'depType') {
            if (this.isLocked()) return;
            this.s.detail.draft.depositType = el.dataset.v === 'fixed' ? 'fixed' : 'percent';
            return this.render();
        }
        if (a === 'save') return this.save();
        if (a === 'cancel') return this.cancelQuote();
        if (a === 'addCatalogExtra') return this.addCatalogExtra();
        if (a === 'addCustomExtra') return this.addCustomExtra();
        if (a === 'delExtra') { this.s.detail.draft.extras.splice(Number(el.dataset.i), 1); return this.render(); }
        if (a === 'delStaff') { this.toggleStaff(el.dataset.id, false); return this.render(); }
        if (a === 'approveTransfer' || a === 'rejectTransfer') return this.reviewTransfer(a === 'approveTransfer');
        if (a === 'sendEmail' || a === 'sendWhatsapp') return this.sendQuote(a === 'sendEmail' ? 'email' : 'whatsapp');
        if (a === 'prepare') return this.prepare();
        if (a === 'preview') return this.preview();
        if (a === 'copyLink') return this.copyLink();
        if (a === 'closeModal') { this.s.modal = null; return this.render(); }
        if (a === 'tplOpen') return this.openTemplates();
        if (a === 'tplNew') { this.s.modal.tpl = { name: '', eventType: 'birthday', isDefault: false, config: this.blankConfig() }; return this.render(); }
        if (a === 'tplEdit') {
            const x = this.s.modal.templates.find((t) => t._id === el.dataset.id);
            this.s.modal.tpl = { _id: x._id, name: x.name, eventType: x.eventType, isDefault: !!x.isDefault, legacy: !x.config, config: x.config ? { ...this.blankConfig(), ...x.config, fields: [...(x.config.fields || [])] } : { ...this.blankConfig(), title: x.name } };
            return this.render();
        }
        if (a === 'tplSave') return this.saveTpl();
        if (a === 'tplDel') return this.delTpl(el.dataset.id);
        if (a === 'clearFilters') { this.s.filters = {}; this.s.search = ''; this.s.skip = 0; return this.load(); }
    }

    async sync() {
        this.toast('מסנכרן לידים...');
        try {
            const r = await this.req('sync');
            const s = r.summary || {};
            this.toast(`סנכרון הסתיים: ${s.created || 0} חדשים, ${s.skipped || 0} קיימים`);
            this.load();
        } catch (err) { await this.fail(err); }
    }

    async openDetail(id) {
        if (this.s.detail?.id !== id) { this.s.tab = 'customer'; this.s.cal = null; this.s.exOpen = false; }
        this.s.detail = { id, loading: true }; this.render();
        try {
            const d = await this.req('get', { id });
            const q = d.quote;
            this.s.detail = {
                id, quote: q, log: d.log || [], payments: d.payments || [], proofs: d.proofs || [], busyStaff: {}, staff: [], staffLoading: true,
                draft: { ...q, extras: (q.extras || []).map((x) => ({ ...x })), assignedStaffIds: [...(q.assignedStaffIds || [])], workshops: splitWs(q.requestedWorkshop), eventDate: ymd(q.eventDate), expiresAt: ymd(q.expiresAt), balanceDueDate: ymd(q.balanceDueDate), hasDeposit: Number(q.depositValue) > 0 },
            };
            this.render();
            this.loadStaff(id, q.eventDate);
            return;
        } catch (err) { this.s.detail = null; await this.fail(err); }
        this.render();
    }

    async loadStaff(id, eventDate) {
        try {
            const r = await this.req('staff', { id, eventDate });
            if (this.s.detail?.id !== id) return;
            this.s.detail.staff = r.actors || [];
            this.s.detail.busyStaff = r.busyStaff || {};
        } catch (_) { /* drawer stays usable without the picker */ }
        if (this.s.detail?.id === id) { this.s.detail.staffLoading = false; this.render(); }
    }

    isLocked() { return ['signed', 'expired', 'cancelled'].includes(this.s.detail?.quote?.status); }

    addCatalogExtra(id) {
        const a = this.s.addons.find((x) => x.id === id);
        if (!a || this.isLocked()) return;
        this.s.detail.draft.extras.push({ id: a.id, title: a.title || a.name, price: a.price, source: 'catalog' });
        this.s.exOpen = false;
        this.render();
    }

    addCustomExtra() {
        const title = this.root.getElementById('customTitle')?.value.trim();
        const raw = this.root.getElementById('customPrice')?.value;
        const price = Number(raw);
        if (!title || raw === '' || !(price >= 0)) return this.fail('יש להזין שם ומחיר לתוספת');
        this.s.detail.draft.extras.push({ id: `custom-${Date.now()}`, title, price, source: 'custom' });
        this.s.exOpen = false;
        this.render();
    }

    // Swaps the drawer body only, so the tab bar keeps its scroll position.
    renderDrawerTop() {
        this.s.exOpen = false;
        this.render();
        this.root.querySelector('.drawer .db')?.scrollTo(0, 0);
    }

    calState() {
        const d = this.s.detail.draft;
        if (!this.s.cal) this.s.cal = { month: (d.eventDate || ilToday()).slice(0, 7), target: 'eventDate' };
        return this.s.cal;
    }

    pickDay(day) {
        if (this.isLocked() || !day || day < ilToday()) return;
        const d = this.s.detail.draft;
        const c = this.calState();
        if (c.target !== 'eventDate' && d.eventDate && day > d.eventDate) return this.fail('התאריך חייב להיות עד יום האירוע');
        d[c.target] = day;
        if (c.target === 'eventDate') {
            const reset = ['balanceDueDate', 'expiresAt'].filter((k) => d[k] && d[k] > day);
            reset.forEach((k) => { d[k] = ''; });
            if (reset.length) this.toast('תאריכים שחלו אחרי יום האירוע אופסו');
            this.loadStaff(this.s.detail.id, day);
        }
        this.render();
    }

    async save() {
        if (this.s.saving) return;
        const d = this.s.detail.draft;
        const locked = this.isLocked();
        const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
        const originalDate = ymd(this.s.detail.quote.eventDate);
        if (!locked && d.eventDate && d.eventDate < ilToday() && d.eventDate !== originalDate) { await this.fail('לא ניתן לבחור תאריך שעבר'); return false; }
        if (!locked && d.hasDeposit && !(Number(d.depositValue) > 0)) { this.s.tab = 'pricing'; await this.fail('יש להזין סכום מקדמה, או לכבות את המקדמה'); return false; }
        const patch = locked
            ? { notes: d.notes || '' }
            : {
                customerName: d.customerName, customerEmail: d.customerEmail, customerPhone: d.customerPhone, companyName: d.companyName,
                requestedWorkshop: (d.workshops || []).join(', '),
                participants: num(d.participants) ?? 0, adults: num(d.adults) ?? 0, eventDate: d.eventDate || null,
                eventStartTime: d.eventStartTime || '', eventEndTime: d.eventEndTime || '', workshopClosed: !!d.workshopClosed,
                requiredInstructors: num(d.requiredInstructors) ?? 0, extras: d.extras, basePrice: num(d.basePrice) ?? 0,
                priceOverride: num(d.priceOverride), depositType: d.depositType, depositValue: d.hasDeposit ? num(d.depositValue) ?? 0 : 0,
                balanceDueDate: d.balanceDueDate || null, expiresAt: d.expiresAt || null,
                allowOnlinePayment: !!d.allowOnlinePayment, allowBankTransfer: !!d.allowBankTransfer, notes: d.notes || '',
                assignedStaffIds: d.assignedStaffIds || [],
            };
        if (locked && this.s.detail.quote.status !== 'cancelled') patch.assignedStaffIds = d.assignedStaffIds || [];
        this.s.saving = true; this.render();
        try {
            await this.req('update', { id: this.s.detail.id, patch });
            this.toast('נשמר');
            await this.openDetail(this.s.detail.id);
            this.load();
        } catch (err) { this.s.saving = false; await this.fail(err); return false; }
        this.s.saving = false; this.render();
        return true;
    }

    async cancelQuote() {
        if (!(await this.ask({ title: 'ביטול הצעה', body: 'לבטל את ההצעה? הפעולה אינה הפיכה.', ok: 'בטל הצעה', cancel: 'חזרה', danger: true }))) return;
        try {
            await this.req('cancel', { id: this.s.detail.id });
            this.toast('ההצעה בוטלה');
            await this.openDetail(this.s.detail.id);
            this.load();
        } catch (err) { await this.fail(err); }
    }

    // ---------- builder / templates ----------
    async prepare() {
        if (this.s.saving) return;
        if (!(await this.ask({ title: 'הכנה לשליחה', body: 'לשמור את השינויים ולהכין את ההצעה לשליחה? ייווצר קישור ללקוח.', ok: 'הכן לשליחה', cancel: 'ביטול' }))) return;
        if (!(await this.save())) return;
        try {
            const r = await this.req('prepare', { id: this.s.detail.id, templateId: this.s.detail.quote.templateId });
            this.toast(`ההצעה הוכנה. קישור: ${r.url}`);
            await this.openDetail(this.s.detail.id);
            this.load();
        } catch (err) { await this.fail(err); }
    }

    async sendQuote(channel) {
        const label = channel === 'email' ? 'במייל' : 'בוואטסאפ';
        if (!(await this.ask({ title: 'שליחת הצעה', body: `לשלוח את ההצעה ללקוח ${label}?`, ok: 'שלח', cancel: 'ביטול' }))) return;
        try {
            const r = await this.req('send', { id: this.s.detail.id, channels: [channel] });
            const res = r.results?.[channel];
            if (res?.sent) this.toast(`נשלח ${label}`); else await this.fail(res?.reason || 'השליחה נכשלה');
            await this.openDetail(this.s.detail.id);
            this.load();
        } catch (err) { await this.fail(err); }
    }

    proofsTable(rows = []) {
        if (!rows.length) return '';
        const ST = { pending: ['אסמכתא לאישור', 'red'], paid: ['אושר', 'green'], rejected: ['נדחה', 'red'] };
        const STAGE = { deposit: 'מקדמה', full: 'תשלום מלא', balance: 'יתרה' };
        const firstPending = rows.find((p) => p.status === 'pending');
        const cards = rows.map((p) => {
            const [label, color] = ST[p.status] || [p.status, 'amber'];
            const waiting = p.status === 'pending';
            const view = /^https?:\/\//.test(p.url || '') ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${p.isPdf ? '📄 צפייה בקובץ' : '🖼️ צפייה באסמכתא'}</a>` : '<span class="sub">אין קובץ</span>';
            const acts = p === firstPending ? `<button class="btn-p" data-act="approveTransfer">אשר</button><button class="btn-d" data-act="rejectTransfer">דחה</button>` : '';
            return `<div class="proof${waiting ? ' wait' : p.status === 'paid' ? ' ok' : ''}">
                <div class="proof-top"><b>${esc(STAGE[p.stage] || p.stage)} · ${money(p.amount)}</b><span class="badge ${color}">${waiting ? '<i class="ping"></i>' : ''}${esc(label)}</span></div>
                <div class="sub">${dmyTime(p.at)}</div>
                <div class="proof-acts">${view}${acts}</div></div>`;
        }).join('');
        return `<div class="extras-h" style="margin-top:12px">אסמכתאות העברה</div>${cards}`;
    }

    async reviewTransfer(approve) {
        const ok = await this.ask(approve
            ? { title: 'אישור העברה', body: 'לאשר את ההעברה הבנקאית? התשלום יירשם כשולם.', ok: 'אשר', cancel: 'ביטול' }
            : { title: 'דחיית אסמכתא', body: 'לדחות את האסמכתא? הלקוח יתבקש להעלות מחדש.', ok: 'דחה', cancel: 'ביטול', danger: true });
        if (!ok) return;
        try {
            await this.req(approve ? 'approveTransfer' : 'rejectTransfer', { id: this.s.detail.id });
            this.toast(approve ? 'ההעברה אושרה' : 'האסמכתא נדחתה');
            await this.openDetail(this.s.detail.id);
            this.load();
        } catch (err) { await this.fail(err); }
    }

    async preview() {
        try {
            const r = await this.req('preview', { id: this.s.detail.id, templateId: this.s.detail.quote.templateId });
            this.s.modal = { kind: 'preview', html: r.html };
            this.render();
        } catch (err) { await this.fail(err); }
    }

    async copyDlg() {
        const url = this.s.dialog?.url || '';
        try { await navigator.clipboard.writeText(url); this.toast('הקישור הועתק'); } catch (_) { /* shown in the dialog */ }
        this.closeDialog(true);
    }

    async copyLink() {
        try {
            const { url } = await this.req('link', { id: this.s.detail.id });
            try { await navigator.clipboard.writeText(url); this.toast('הקישור הועתק'); }
            catch (_) { await this.ask({ kind: 'link', title: 'קישור ללקוח', url }); }
        } catch (err) { await this.fail(err); }
    }

    async openTemplates() {
        try {
            const r = await this.req('templates');
            this.s.modal = { kind: 'templates', templates: r.templates || [], placeholders: r.placeholders || [], fieldOptions: r.fieldOptions || [], defaultFields: r.defaultFields || [], optionalFields: r.optionalFields || [], tpl: null };
            this.render();
        } catch (err) { await this.fail(err); }
    }

    async saveTpl() {
        try {
            await this.req('saveTemplate', { tpl: this.s.modal.tpl });
            const r = await this.req('templates');
            this.s.modal.templates = r.templates || []; this.s.modal.tpl = null;
            this.toast('התבנית נשמרה');
        } catch (err) { await this.fail(err); }
    }

    async delTpl(id) {
        if (!(await this.ask({ title: 'מחיקת תבנית', body: 'למחוק את התבנית?', ok: 'מחק', cancel: 'ביטול', danger: true }))) return;
        try {
            await this.req('deleteTemplate', { id });
            this.s.modal.templates = this.s.modal.templates.filter((t) => t._id !== id); this.s.modal.tpl = null;
            this.render();
        } catch (err) { await this.fail(err); }
    }

    dialogHtml() {
        const d = this.s.dialog;
        if (!d) return '';
        if (d.kind === 'link') {
            return `<div class="dlgmask" data-act="dlgNo"></div><div class="dlg" role="dialog"><h2>${esc(d.title)}</h2>
                <input id="dlgUrl" readonly value="${esc(d.url || '')}">
                <div class="row"><button class="btn-p" data-act="dlgCopy">העתק</button><button data-act="dlgNo">סגור</button></div></div>`;
        }
        const alert = d.kind === 'alert';
        return `<div class="dlgmask" data-act="${alert ? 'dlgOk' : 'dlgNo'}"></div><div class="dlg" role="dialog">
            <h2>${esc(d.title || 'אישור')}</h2><p>${esc(d.body || '')}</p>
            <div class="row"><button class="${d.danger ? 'btn-d' : 'btn-p'}" data-act="dlgOk">${esc(d.ok || 'אישור')}</button>${alert ? '' : `<button data-act="dlgNo">${esc(d.cancel || 'ביטול')}</button>`}</div></div>`;
    }

    phLabel(key) {
        return (this.s.modal?.fieldOptions || []).find((o) => o.key === key)?.label || key;
    }

    isOptionalPh(key) {
        return (this.s.modal?.optionalFields || []).includes(key);
    }

    phTag(key) {
        const opt = this.isOptionalPh(key);
        return `<span class="ph${opt ? ' opt' : ''}" contenteditable="false" data-ph="${esc(key)}"${opt ? ' title="אופציונלי: אם אין ערך בהצעה, השורה כולה לא תוצג ללקוח"' : ''}>${esc(this.phLabel(key))}</span>`;
    }

    /** Purple linked block: text + field shown together; stored as {{?key|pre|suf}} and hidden as one unit when empty. */
    segTag(key, pre, suf) {
        const part = (s) => (s ? `<span class="optt">${esc(s)}</span>` : '');
        return `<span class="optg" contenteditable="false" data-seg="${esc(key)}" data-pre="${esc(pre)}" data-suf="${esc(suf)}" title="לחצו לעריכה · מוצג ללקוח רק כשיש ערך">🔗${part(pre)}<span class="ph opt">${esc(this.phLabel(key))}</span>${part(suf)}</span>`;
    }

    /** Stored text keeps {{key}} / {{?key|pre|suf}}; the editor shows them as non-editable tags. */
    rteHtml(field, title, text, cls) {
        const keys = this.s.modal?.placeholders || [];
        const src = String(text || '');
        const re = /\{\{\?(\w+)\|([^|{}]*)\|([^|{}]*)\}\}|\{\{\s*(\w+)\s*\}\}/g;
        let body = '';
        let last = 0;
        const plain = (s) => esc(s).replace(/\n/g, '<br>');
        for (const m of src.matchAll(re)) {
            body += plain(src.slice(last, m.index)) + (m[1] ? this.segTag(m[1], m[2], m[3]) : this.phTag(m[4]));
            last = m.index + m[0].length;
        }
        body += plain(src.slice(last));
        const opts = keys.map((k) => `<option value="${esc(k)}">${esc(this.phLabel(k))}${this.isOptionalPh(k) ? ' (אופציונלי)' : ''}</option>`).join('');
        return `<div class="full"><div class="rteHead"><b>${title}</b><select data-ins="${field}"><option value="">+ הוספת שדה דינאמי</option>${opts}</select></div>
            <div class="rte${cls}" contenteditable="true" data-rc="${field}">${body}</div></div>`;
    }

    rteText(ed) {
        let out = '';
        const walk = (node) => {
            node.childNodes.forEach((n, i) => {
                if (n.nodeType === 3) out += n.nodeValue.replace(/\u00A0/g, ' ');
                else if (n.dataset?.seg) out += `{{?${n.dataset.seg}|${n.dataset.pre || ''}|${n.dataset.suf || ''}}}`;
                else if (n.dataset?.ph) out += `{{${n.dataset.ph}}}`;
                else if (n.nodeName === 'BR') { if (!(node !== ed && i === node.childNodes.length - 1)) out += '\n'; }
                else if (/^(DIV|P)$/.test(n.nodeName)) { if (out && !out.endsWith('\n')) out += '\n'; walk(n); if (!out.endsWith('\n')) out += '\n'; }
                else walk(n);
            });
        };
        walk(ed);
        return out.replace(/\n$/, '');
    }

    saveRteRange() {
        const sel = this.root.getSelection ? this.root.getSelection() : document.getSelection();
        if (!sel?.rangeCount) return;
        const r = sel.getRangeAt(0);
        const ed = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest?.('.rte');
        if (ed) this.rteSel = { field: ed.dataset.rc, range: r.cloneRange() };
    }

    insertPh(field, key) {
        const ed = this.root.querySelector(`.rte[data-rc="${field}"]`);
        if (!ed || !key) return;
        let r = this.rteSel?.field === field && ed.contains(this.rteSel.range.startContainer) ? this.rteSel.range : null;
        if (!r) { r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); }
        const opt = this.isOptionalPh(key);
        const tmp = document.createElement('span');
        tmp.innerHTML = opt ? this.segTag(key, '', '') : this.phTag(key);
        const chip = tmp.firstChild;
        const space = document.createTextNode(' ');
        r.deleteContents();
        r.insertNode(space);
        r.insertNode(chip);
        const after = document.createRange();
        after.setStartAfter(space); after.collapse(true);
        ed.focus();
        const sel = this.root.getSelection ? this.root.getSelection() : document.getSelection();
        sel?.removeAllRanges(); sel?.addRange(after);
        this.rteSel = { field, range: after.cloneRange() };
        this.syncRte(ed);
        if (opt) this.openSeg(chip, true);
    }

    syncRte(ed) {
        if (ed && this.s.modal?.tpl) this.s.modal.tpl.config[ed.dataset.rc] = this.rteText(ed);
    }

    /** Popup for a linked block's text. Appended outside #app so the editor DOM survives. */
    openSeg(chip, isNew) {
        this.closeSeg();
        const pop = document.createElement('div');
        pop.className = 'segpop';
        pop.innerHTML = `<div class="segbox" role="dialog">
            <h3>טקסט מחובר לשדה <span class="ph opt">${esc(this.phLabel(chip.dataset.seg))}</span></h3>
            <p class="sub">הטקסט והשדה יוצגו ללקוח יחד, ורק כשיש לשדה ערך בהצעה. אם אין ערך, שניהם לא יוצגו.</p>
            <label><span>טקסט לפני השדה <i>*</i></span><input class="segpre" value="${esc(chip.dataset.pre || '')}" placeholder="למשל: מקדמה בסך"></label>
            <label>טקסט אחרי השדה (לא חובה)<input class="segsuf" value="${esc(chip.dataset.suf || '')}" placeholder="למשל: ישולם עם החתימה."></label>
            <div class="segprev"></div><div class="segerr"></div>
            <div class="row"><button class="btn-p" data-segact="ok">אישור</button>${isNew ? '' : '<button class="btn-d" data-segact="del">הסרה</button>'}<button data-segact="cancel">ביטול</button></div></div>`;
        this.root.appendChild(pop);
        this.seg = { chip, isNew, pop };
        const upd = () => {
            const pre = pop.querySelector('.segpre').value.trim();
            const suf = pop.querySelector('.segsuf').value.trim();
            pop.querySelector('.segprev').innerHTML = `<span class="sub">ללקוח יוצג:</span> ${esc(pre)} <b>[${esc(this.phLabel(chip.dataset.seg))}]</b> ${esc(suf)}`;
        };
        pop.addEventListener('input', upd);
        pop.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.segAction('ok'); } if (e.key === 'Escape') this.segAction('cancel'); });
        upd();
        pop.querySelector('.segpre').focus();
    }

    closeSeg() {
        this.seg?.pop?.remove();
        this.seg = null;
    }

    segAction(act) {
        const s = this.seg;
        if (!s) return;
        const ed = s.chip.closest('.rte');
        const clean = (v) => String(v || '').replace(/[|{}\r\n]/g, '').trim().slice(0, 300);
        if (act === 'ok') {
            const pre = clean(s.pop.querySelector('.segpre').value);
            const suf = clean(s.pop.querySelector('.segsuf').value);
            if (!pre) { s.pop.querySelector('.segerr').textContent = 'יש להזין טקסט לפני השדה.'; return; }
            const tmp = document.createElement('span');
            tmp.innerHTML = this.segTag(s.chip.dataset.seg, pre, suf);
            s.chip.replaceWith(tmp.firstChild);
        } else if (act === 'del' || (act === 'cancel' && s.isNew)) {
            s.chip.remove();
        }
        this.closeSeg();
        this.syncRte(ed);
    }

    blankConfig() {
        return { title: 'הצעת מחיר', intro: '', terms: '', footer: '', fields: [...(this.s.modal?.defaultFields || [])] };
    }

    modalHtml() {
        const m = this.s.modal;
        if (!m) return '';
        if (m.kind === 'preview') {
            return `<div class="mask" data-act="closeModal"></div><div class="modal"><div class="dh"><h2>תצוגה מקדימה</h2><button data-act="closeModal">✕</button></div>
                <iframe sandbox="" style="width:100%;height:70vh;border:0;background:#fff" srcdoc="${esc(`<html dir="rtl"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700&display=swap"></head><body style="font-family:Rubik,Arial,sans-serif;padding:16px">${m.html}</body></html>`)}"></iframe></div>`;
        }
        const t = m.tpl;
        const list = m.templates.map((x) => `<div class="extra"><span>${esc(x.name)} <span class="sub">${esc(L.type[x.eventType] || '')}</span> ${x.isDefault ? '<span class="badge green">ברירת מחדל</span>' : ''}</span>
            <button data-act="tplEdit" data-id="${esc(x._id)}">עריכה</button><button data-act="tplDel" data-id="${esc(x._id)}">מחיקה</button></div>`).join('') || '<div class="sub">אין תבניות</div>';
        const form = t ? `<div class="sec"><h3>${t._id ? 'עריכת תבנית' : 'תבנית חדשה'}</h3><div class="grid">
              <label>שם<input data-t="name" value="${esc(t.name)}"></label>
              <label>סוג אירוע<select data-t="eventType"><option value="birthday"${t.eventType === 'birthday' ? ' selected' : ''}>יום הולדת</option><option value="event"${t.eventType === 'event' ? ' selected' : ''}>אירוע חברה / פרטי</option></select></label>
              <label class="chk full"><input type="checkbox" data-t="isDefault"${t.isDefault ? ' checked' : ''}> ברירת מחדל לסוג האירוע</label>
              <label class="full">כותרת<input data-c="title" value="${esc(t.config.title)}"></label>
              ${this.rteHtml('intro', 'פתיחה', t.config.intro, '')}
              ${this.rteHtml('terms', 'תנאים', t.config.terms, ' tall')}
              <div class="full phLegend"><span class="ph">כחול</span> שדה שתמיד מוצג · <span class="optg">🔗<span class="optt">טקסט</span><span class="ph opt">סגול</span></span> שדה אופציונלי עם טקסט מחובר: אם בהצעה אין לו ערך (למשל אין מקדמה), הטקסט המחובר והשדה לא יוצגו ללקוח, ושאר השורה נשארת. לחיצה על הבלוק לעריכה.</div>
              <label class="full">שורת סיום<input data-c="footer" value="${esc(t.config.footer)}"></label>
              ${t.legacy ? '<div class="full lockmsg">תבנית ישנה (HTML חופשי): שמירה תחליף אותה במבנה האחיד.</div>' : ''}</div>
              <div style="margin-top:10px"><button class="btn-p" data-act="tplSave">שמור תבנית</button></div></div>` : '';
        return `<div class="mask" data-act="closeModal"></div><div class="modal"><div class="dh"><h2>תבניות חוזה</h2><button data-act="tplNew">+ תבנית חדשה</button><button data-act="closeModal">✕</button></div>
            <div class="db">${list}${form}</div></div>`;
    }

    // ---------- render ----------
    render() {
        const app = this.root.getElementById('app');
        if (!app) return;
        this.closeSeg();
        if (this.lastRows !== `${this.s.items.length}|${this.s.loading}`) { this.lastRows = `${this.s.items.length}|${this.s.loading}`; dbg('render', { rows: this.s.items.length, loading: this.s.loading, error: this.s.error || undefined }); }
        const keep = this.root.activeElement?.id;
        app.innerHTML = `<div class="wrap">${this.topHtml()}${this.filtersHtml()}${this.s.error ? `<div class="err">${esc(this.s.error)}</div>` : ''}${this.tableHtml()}</div>${this.drawerHtml()}${this.modalHtml()}${this.dialogHtml()}${this.s.toast ? `<div class="toast">${esc(this.s.toast)}</div>` : ''}`;
        if (keep === 'search') { const i = this.root.getElementById('search'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
    }

    topHtml() {
        return `<div class="top"><h1>הצעות מחיר</h1>
            <button data-act="tplOpen">תבניות</button><button data-act="sync">סנכרון לידים</button><button data-act="refresh">רענון</button></div>`;
    }

    filtersHtml() {
        const f = this.s.filters;
        const sel = (key, map, label) => `<label>${label}<select data-filter="${key}"><option value="">הכל</option>${Object.entries(map).map(([k, v]) => `<option value="${k}"${f[key] === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
        return `<div class="card filters">
            <label>חיפוש<input id="search" placeholder="שם, טלפון, מייל, חברה" value="${esc(this.s.search)}"></label>
            ${sel('eventType', L.type, 'סוג אירוע')}${sel('status', L.status, 'סטטוס')}${sel('signatureStatus', L.sig, 'חתימה')}${sel('paymentStatus', L.pay, 'תשלום')}
            <label>סדנה<select data-filter="workshopClosed"><option value="">הכל</option><option value="true"${f.workshopClosed === 'true' ? ' selected' : ''}>סגורה</option><option value="false"${f.workshopClosed === 'false' ? ' selected' : ''}>פתוחה</option></select></label>
            <label>מתאריך<input type="date" data-filter="dateFrom" value="${esc(f.dateFrom || '')}"></label>
            <label>עד תאריך<input type="date" data-filter="dateTo" value="${esc(f.dateTo || '')}"></label>
            <button data-act="clearFilters">נקה</button></div>`;
    }

    tableHtml() {
        if (this.s.loading) return '<div class="card loading">טוען הצעות...</div>';
        if (!this.s.items.length) return '<div class="card empty">לא נמצאו הצעות</div>';
        const th = (label, field) => field ? `<th class="s" data-act="sort" data-field="${field}">${label}${this.s.sort.field === field ? (this.s.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>` : `<th>${label}</th>`;
        const waiting = this.s.items.filter((q) => q.paymentStatus === 'awaiting_transfer_approval').length;
        const rows = this.s.items.map((q) => {
            const extras = (q.extras || []).map((x) => x.title).join(', ');
            const assigned = (q.assignedStaffIds || []).length;
            const proof = q.paymentStatus === 'awaiting_transfer_approval';
            return `<tr class="row${proof ? ' alert' : ''}" data-act="row" data-id="${esc(q._id)}">
                <td>${proof ? '<i class="ping" title="אסמכתא ממתינה לאישור"></i>' : ''}${(q.conflicts || []).length ? '<span class="conflict" title="התנגשות ביומן">🔴 </span>' : ''}<b>${esc(q.customerName || '—')}</b><div class="sub">${esc(phoneDisp(q.customerPhone))}</div></td>
                <td><span class="badge purple">${esc(L.type[q.eventType] || q.eventType || '—')}</span></td>
                <td>${badge(L.sig, 'sig', q.signatureStatus)}</td><td>${badge(L.pay, 'pay', q.paymentStatus)}</td>
                <td>${q.totalAmount != null ? money(q.totalAmount) : '-'}</td><td>${money(q.depositAmount)}</td><td>${money(q.balanceAmount)}</td><td>${esc(L.method[q.selectedPaymentMethod] || '—')}</td>
                <td>${dmy(q._createdDate)}</td><td>${dmy(q.expiresAt)}</td><td>${dmy(q.eventDate)}${q.eventStartTime ? `<div class="sub">${esc(q.eventStartTime)}</div>` : ''}</td>
                <td>${q.workshopClosed ? 'סגורה' : 'פתוחה'}</td><td>${q.requiredInstructors || 0} / ${assigned}</td>
                <td class="wrapc" title="${esc(extras)}">${esc(extras || '—')}</td><td class="wrapc">${esc((q.notes || '').slice(0, 60) || '—')}</td>
                <td>${badge(L.status, 'status', q.status)}</td></tr>`;
        }).join('');
        const from = this.s.skip + 1; const to = Math.min(this.s.skip + this.s.limit, this.s.total);
        return `${waiting ? `<div class="alertbar"><i class="ping"></i>בעמוד זה ${waiting === 1 ? 'אסמכתא ממתינה' : `${waiting} אסמכתאות ממתינות`} לאישור</div>` : ''}<div class="card"><div class="tablewrap"><table><thead><tr>
            ${th('לקוח')}${th('סוג')}${th('חתימה')}${th('תשלום')}${th('סה"כ', 'totalAmount')}${th('מקדמה')}${th('יתרה')}${th('אמצעי תשלום')}${th('נוצרה', '_createdDate')}${th('תוקף', 'expiresAt')}${th('תאריך אירוע', 'eventDate')}${th('סדנה')}${th('מדריכים (נדרש/משובץ)')}${th('תוספות')}${th('הערות')}${th('סטטוס')}
            </tr></thead><tbody>${rows}</tbody></table></div>
            <div class="pager"><span class="sub">${from}-${to} מתוך ${this.s.total}</span><span><button data-act="prev"${this.s.skip === 0 ? ' disabled' : ''}>הקודם</button> <button data-act="next"${to >= this.s.total ? ' disabled' : ''}>הבא</button></span></div></div>`;
    }

    workshopPicker(d, locked) {
        const selected = d.workshops || [];
        const chosen = new Set(selected);
        const options = [...new Set([...(this.s.workshops || []), ...selected])];
        const tags = selected.map((n) => `<span class="tag">${esc(n)}${locked ? '' : `<button type="button" data-act="wsRemove" data-name="${esc(n)}" aria-label="הסר">✕</button>`}</span>`).join('');
        const box = this.s.wsOpen ? `<div class="ws-drop">${options.map((n) => `<label class="ws-opt"><input type="checkbox" data-ws="${esc(n)}" value="${esc(n)}"${chosen.has(n) ? ' checked' : ''}>${esc(n)}</label>`).join('') || '<div class="sub" style="padding:8px">אין סדנאות ברשימה</div>'}</div>` : '';
        return `<div class="ws"><button type="button" class="ws-btn" data-act="wsToggle"${locked ? ' disabled' : ''}>${selected.length ? `${selected.length} נבחרו` : 'בחירת סדנאות'} ${this.s.wsOpen ? '▲' : '▼'}</button>
            ${box}<div class="tags">${tags || '<span class="sub">לא נבחרו סדנאות</span>'}</div></div>`;
    }

    staffPicker(dt, d, blocked) {
        if (dt.staffLoading) return '<div class="sub">טוען עובדים...</div>';
        if (!dt.staff.length) return '<div class="sub">אין עובדים פעילים</div>';
        const chosen = new Set(d.assignedStaffIds || []);
        const card = (a) => {
            const have = new Set((a.trainings || []).map((t) => t.id));
            const missing = (d.extras || []).filter((x) => x.source === 'catalog' && !have.has(x.id));
            const need = (d.extras || []).some((x) => x.source === 'catalog');
            const trainedBadge = !need ? '' : missing.length ? ` <span class="badge amber" title="${esc(`חסרה הכשרה: ${missing.map((x) => x.title).join(', ')}`)}">חסרה הכשרה</span>` : ' <span class="badge green">מוכשר/ת לתוספות</span>';
            const trainTxt = (a.trainings || []).length ? `<div class="sub">הכשרות: ${esc(a.trainings.map((t) => t.title).join(', '))}</div>` : '<div class="sub">אין הכשרות רשומות</div>';
            const busyList = dt.busyStaff[a.id] || [];
            const busyTitle = busyList.map((b) => `${b.label}${b.start ? ` ${b.start}–${b.end || '?'}` : ''}`).join(' | ');
            const busyNote = busyList.length ? `<div class="sub">⚠️ <span class="badge amber" style="cursor:help" title="${esc(busyTitle)}">${busyList.some((b) => b.kind !== 'availability') ? 'משובץ/ת באותו יום' : 'הגיש/ה זמינות באותו יום'}</span></div>` : '';
            return `<div class="staffRow"><div><b>${esc(a.name)}</b>${trainedBadge}${blocked ? '' : ` <button data-act="delStaff" data-id="${esc(a.id)}">✕</button>`}</div>${trainTxt}${busyNote}</div>`;
        };
        const selected = dt.staff.filter((a) => chosen.has(a.id)).map(card).join('') || '<div class="sub">לא שובץ עובד</div>';
        const opts = dt.staff.filter((a) => !chosen.has(a.id)).map((a) => {
            const trains = (a.trainings || []).map((t) => t.title).join(', ');
            const busy = (dt.busyStaff[a.id] || []).length ? ' · תפוס/ה באותו יום' : '';
            return `<option value="${esc(a.id)}">${esc(a.name)}${trains ? ` — ${esc(trains)}` : ''}${busy}</option>`;
        }).join('');
        const pick = blocked ? '' : `<select id="staffPick" style="width:100%;margin-bottom:8px"><option value="">בחרו עובד/ת</option>${opts}</select>`;
        return `${pick}<div class="staffList">${selected}</div>`;
    }

    // ---------- drawer ----------
    tabIssues(d) {
        return {
            customer: !d.customerName || (!d.customerPhone && !d.customerEmail),
            event: !d.eventStartTime || !d.eventEndTime || !(Number(d.participants) > 0),
            dates: !d.eventDate,
            pricing: !(previewAmounts(d).total > 0),
        };
    }

    priceSummary(d, q) {
        const a = previewAmounts(d);
        const n = (d.extras || []).length;
        const depLabel = d.depositType === 'fixed' ? 'סכום קבוע' : `${Number(d.depositValue) || 0}%`;
        const balDate = d.balanceDueDate ? dmy(d.balanceDueDate) : 'יוגדר אוטומטית';
        const lines = `<div class="ln"><span>מחיר בסיס</span><span>${a.ov !== null ? `<s>${money(a.base)}</s>` : money(a.base)}</span></div>
            <div class="ln"><span>תוספות${n ? ` (${n})` : ''}</span><span>${a.ov !== null ? `<s>${money(a.extras)}</s>` : money(a.extras)}</span></div>
            ${a.ov !== null ? `<div class="ln"><span>מחיר מותאם (עוקף את החישוב)</span><b>${money(a.ov)}</b></div>` : ''}`;
        const split = d.hasDeposit && a.dep > 0 && a.bal > 0
            ? `<div class="split"><div><span>💳 מקדמה — בחתימה</span><b>${money(a.dep)}</b><small>${esc(depLabel)}</small></div>
                <div class="bal"><span>⏳ יתרה לתשלום</span><b>${money(a.bal)}</b><small>עד ${esc(balDate)}</small></div></div>`
            : `<div class="split one"><div><span>✅ תשלום מלא בחתימה</span><b>${money(a.total)}</b><small>${d.hasDeposit ? 'המקדמה מכסה את כל הסכום' : 'ללא מקדמה'}</small></div></div>`;
        const paid = Number(q.paidAmount) > 0 ? `<div class="paid">שולם עד כה: ${money(q.paidAmount)}</div>` : '';
        return `${lines}<div class="tot"><span>סה"כ לתשלום</span><b>${money(a.total)}</b></div>${split}${paid}`;
    }

    extrasEditor(d, locked) {
        const rows = (d.extras || []).map((x, i) => `<div class="xrow"><div class="nm">${esc(x.title)}<small>${x.source === 'custom' ? 'תוספת מותאמת' : 'מהקטלוג'}</small></div>
            <label class="xprice"><span>₪</span><input type="number" min="0" data-xp="${i}" value="${esc(x.price ?? 0)}"${locked ? ' disabled' : ''} aria-label="מחיר ${esc(x.title)}"></label>
            ${locked ? '' : `<button type="button" class="x" data-act="delExtra" data-i="${i}" aria-label="הסר">✕</button>`}</div>`).join('') || '<div class="sub">לא נוספו תוספות</div>';
        if (locked) return rows;
        const added = new Set((d.extras || []).filter((x) => x.source === 'catalog').map((x) => x.id));
        const opts = this.s.addons.map((a) => `<button type="button" class="ex-opt" data-act="addCatalog" data-id="${esc(a.id)}"${added.has(a.id) ? ' disabled' : ''}>
            <span>${added.has(a.id) ? '✓ ' : ''}${esc(a.title || a.name || '')}</span><b>${money(a.price)}</b></button>`).join('') || '<div class="sub" style="padding:10px">אין תוספות בקטלוג</div>';
        const pop = this.s.exOpen ? `<div class="ex-pop"><div class="ex-list">${opts}</div>
            <div class="ex-custom"><input id="customTitle" placeholder="תוספת מותאמת"><input id="customPrice" type="number" min="0" placeholder="₪ מחיר"><button type="button" class="btn-p" data-act="addCustomExtra">הוסף</button></div></div>` : '';
        return `${rows}<div class="exw"><button type="button" class="ex-btn" data-act="exToggle"><span>＋ הוספת תוספת</span><span>${this.s.exOpen ? '▲' : '▼'}</span></button>${pop}</div>`;
    }

    calendarHtml(d, locked) {
        const today = ilToday();
        const c = this.calState();
        const targets = [
            ['eventDate', '🎨', 'תאריך הסדנה', 'ev', false],
            ...(d.hasDeposit ? [['balanceDueDate', '💳', 'תשלום יתרה עד', 'bal', true]] : []),
            ['expiresAt', '⏳', 'תוקף ההצעה (אופציונלי)', 'exp', true],
        ];
        if (!targets.some(([k]) => k === c.target)) c.target = 'eventDate';
        const chips = targets.map(([k, ic, label, cls, optional]) => `<button type="button" class="ct ${cls}${c.target === k ? ' on' : ''}" data-act="calTarget" data-k="${k}">
            <span>${ic} ${label}</span><b>${d[k] ? dmy(d[k]) : 'לא נבחר'}</b>
            ${optional && d[k] && !locked ? `<span class="clr" data-act="calClear" data-k="${k}" title="ניקוי">✕</span>` : ''}</button>`).join('');
        const [y, m] = c.month.split('-').map(Number);
        const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
        const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const monthKey = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}`;
        const prev = m === 1 ? monthKey(y - 1, 12) : monthKey(y, m - 1);
        const next = m === 12 ? monthKey(y + 1, 1) : monthKey(y, m + 1);
        const marks = targets.filter(([k]) => d[k]).map(([k, , , cls]) => [d[k], cls]);
        const active = targets.find(([k]) => k === c.target);
        let cells = WEEKDAYS.map((w) => `<div class="wd">${w}</div>`).join('') + '<div></div>'.repeat(first);
        for (let i = 1; i <= days; i++) {
            const key = `${c.month}-${String(i).padStart(2, '0')}`;
            const on = marks.filter(([v]) => v === key).map(([, cls]) => cls);
            const off = locked || key < today || (c.target !== 'eventDate' && d.eventDate && key > d.eventDate);
            const sel = d[c.target] === key;
            const cls = ['day', key === today ? 'today' : '', on[0] ? `m-${on[0]} ${on[0]}` : '', sel ? `sel ${active[3]}` : ''].filter(Boolean).join(' ');
            const dots = on.length > 1 ? `<span class="dots">${on.slice(1).map((x) => `<i class="${x}"></i>`).join('')}</span>` : '';
            cells += `<button type="button" class="${cls}" data-act="calDay" data-d="${key}"${off ? ' disabled' : ''}>${i}${dots}</button>`;
        }
        const label = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
        const legend = targets.map(([, , l, cls]) => `<span class="${cls}"><i></i>${l.replace(' (אופציונלי)', '')}</span>`).join('');
        return `<div class="cal-t">${chips}</div>
            <div class="cal"><div class="cal-h"><button type="button" data-act="calMonth" data-m="${prev}"${prev < today.slice(0, 7) ? ' disabled' : ''} aria-label="חודש קודם">›</button><b>${label}</b><button type="button" data-act="calMonth" data-m="${next}" aria-label="חודש הבא">‹</button></div>
            <div class="cal-g">${cells}</div>
            <div class="legend">${legend}<span class="sub">ימים שחלפו חסומים${d.eventDate ? ' · תוקף ותשלום — עד יום האירוע' : ''}</span></div></div>
            <div class="sub" style="margin-top:6px">בוחרים למעלה איזה תאריך לקבוע, ואז לוחצים על יום בלוח.</div>`;
    }

    datesTimeline(d, q) {
        const items = [
            ['📝', 'תחילת ההסכם', q.signedAt ? `נחתם ב-${dmy(q.signedAt)}` : 'ביום חתימת הלקוח'],
            ['⏳', 'ההצעה בתוקף עד', d.expiresAt ? dmy(d.expiresAt) : 'ברירת מחדל (מחושב בהכנה לשליחה)'],
            ...(d.hasDeposit ? [['💳', 'מקדמה', 'משולמת בחתימה'], ['💰', 'תשלום יתרה עד', d.balanceDueDate ? dmy(d.balanceDueDate) : 'ברירת מחדל לפי ההגדרות']] : [['💳', 'תשלום', 'מלא, בחתימה']]),
            ['🎨', 'יום הסדנה', d.eventDate ? `${dmy(d.eventDate)}${d.eventStartTime ? ` · ${d.eventStartTime}${d.eventEndTime ? `–${d.eventEndTime}` : ''}` : ''}` : 'טרם נקבע'],
        ];
        return `<ul class="tline">${items.map(([ic, t, v]) => `<li><span class="ic">${ic}</span><div><span>${t}</span><b>${esc(v)}</b></div></li>`).join('')}</ul>`;
    }

    paneHtml(tab, dt) {
        const q = dt.quote; const d = dt.draft; const locked = this.isLocked(); const dis = locked ? ' disabled' : '';
        const f = (key, label, type = 'text', extra = '') => `<label>${label}<input type="${type}" data-f="${key}" value="${esc(d[key] ?? '')}"${dis} ${extra}></label>`;
        const chk = (key, label) => `<label class="chk"><input type="checkbox" data-f="${key}"${d[key] ? ' checked' : ''}${dis}> ${label}</label>`;
        const pane = (title, body) => `<div class="pane"><h3 class="pane-h">${title}</h3>${body}</div>`;
        if (tab === 'customer') {
            return pane('👤 פרטי לקוח', `<div class="grid">${f('customerName', 'שם מלא')}${f('customerPhone', 'טלפון', 'tel')}${f('customerEmail', 'אימייל', 'email')}${f('companyName', 'חברה')}</div>`)
                + pane('🎨 סדנאות', this.workshopPicker(d, locked))
                + (q.customerNotes ? pane('💬 הערות הלקוח', `<div class="lockmsg" style="background:#f8fafc;color:#334155;margin:0">${esc(q.customerNotes)}</div>`) : '');
        }
        if (tab === 'event') {
            return pane('🎨 פרטי האירוע', `<div class="grid">${f('eventStartTime', 'שעת התחלה', 'time')}${f('eventEndTime', 'שעת סיום', 'time')}${f('participants', 'משתתפים', 'number', 'min="0"')}${f('adults', 'מלווים', 'number', 'min="0"')}${f('requiredInstructors', 'מדריכים נדרשים', 'number', 'min="0"')}
                <div style="display:flex;align-items:end">${chk('workshopClosed', 'סדנה סגורה (פרטית)')}</div></div>
                <div class="sub" style="margin-top:10px">📅 תאריך האירוע נקבע בלשונית "תאריכים"${d.eventDate ? `: <b>${dmy(d.eventDate)}</b>` : ''}.</div>`)
                + pane('👥 צוות משובץ', this.staffPicker(dt, d, q.status === 'cancelled'));
        }
        if (tab === 'dates') {
            return pane('📅 לוח תאריכים', this.calendarHtml(d, locked)) + pane('🗓️ ציר זמנים', this.datesTimeline(d, q));
        }
        if (tab === 'pricing') {
            const depFixed = d.depositType === 'fixed';
            const depSeg = (v, icon, title) => `<button type="button" class="${(v === 'fixed' ? depFixed : !depFixed) ? 'on' : ''}" data-act="depType" data-v="${v}" title="${title}"${dis}>${icon}</button>`;
            const dep = `<div class="dep"><div><b>יש מקדמה בעסקה</b><div class="sub">${d.hasDeposit ? 'הלקוח משלם מקדמה בחתימה ואת היתרה עד מועד שנקבע' : 'הלקוח ישלם את כל הסכום בחתימה'}</div></div>
                <label class="switch"><input type="checkbox" data-f="hasDeposit"${d.hasDeposit ? ' checked' : ''}${dis}><span class="knob"></span></label></div>
                ${d.hasDeposit ? `<div class="depv"><span class="fl" style="flex-direction:row;align-items:center">גובה המקדמה</span><input type="number" min="0" data-f="depositValue" value="${esc(d.depositValue ?? '')}"${dis}><span class="seg">${depSeg('percent', '%', 'אחוז מהסכום')}${depSeg('fixed', '₪', 'סכום קבוע')}</span></div>` : ''}`;
            return pane('💰 מחיר', `<div class="pgrid">${f('basePrice', 'מחיר בסיס (₪)', 'number', 'min="0"')}${f('priceOverride', 'מחיר מותאם (₪, אופציונלי)', 'number', 'min="0" placeholder="ללא"')}</div>
                    <div class="sub" style="margin-top:6px">מחיר מותאם מחליף את החישוב של בסיס + תוספות.</div>${dep}`)
                + pane('✨ תוספות', this.extrasEditor(d, locked))
                + pane('🧾 סיכום', `<div class="psum" id="sumBox">${this.priceSummary(d, q)}</div><div class="sub" style="margin-top:6px">תצוגה מקדימה — הסכומים הסופיים נשמרים בלחיצה על "שמור".</div>`);
        }
        if (tab === 'payment') {
            const pays = dt.payments.map((p) => `<li><div><b>${money(p.amount)}</b> · ${esc(p.stage)} · ${esc(L.method[p.method] || p.method)} · <span class="badge ${p.status === 'paid' ? 'green' : p.status === 'failed' ? 'red' : 'amber'}">${esc(p.status)}</span> <span class="sub">${dmyTime(p.paidAt || p._createdDate)}</span></div></li>`).join('') || '<li class="sub">אין תשלומים</li>';
            return pane('💳 אמצעי תשלום מותרים', `${paySwitch('allowOnlinePayment', 'תשלום מקוון', 'ביט / אשראי / Apple Pay', d, dis)}${paySwitch('allowBankTransfer', 'העברה בנקאית', 'הלקוח מעלה אסמכתא לאישור', d, dis)}
                    <div class="sub" style="margin-top:8px">נבחר ע"י הלקוח: ${esc(L.method[q.selectedPaymentMethod] || '—')} · ${badge(L.pay, 'pay', q.paymentStatus)} · חתימה: ${badge(L.sig, 'sig', q.signatureStatus)}</div>`)
                + pane('🧾 תשלומים ואסמכתאות', `<ul class="tl">${pays}</ul>${this.proofsTable(dt.proofs)}`);
        }
        const logDetail = (l) => {
            const ch = l.details?.changes;
            if (!Array.isArray(ch) || !ch.length) return '';
            return `<ul class="chg">${ch.map((c) => `<li><b>${esc(c.label)}:</b> ${c.text ? esc(c.text) : `מ-${esc(c.from)} ל-${esc(c.to)}`}</li>`).join('')}</ul>`;
        };
        const log = dt.log.map((l) => `<li><span>${L.actor[l.actorType] || ''}</span><div><b>${esc(L.action[l.action] || l.action)}</b> <span class="sub">${esc(l.actorName || '')} · ${dmyTime(l._createdDate)}</span>${logDetail(l)}</div></li>`).join('') || '<li class="sub">אין פעולות</li>';
        return pane('📝 הערות פנימיות', `<textarea rows="4" data-f="notes" placeholder="הערות לצוות (לא מוצגות ללקוח)">${esc(d.notes || '')}</textarea>`)
            + pane('🕘 היסטוריית פעולות', `<ul class="tl">${log}</ul>`);
    }

    drawerHtml() {
        const dt = this.s.detail;
        if (!dt) return '';
        if (dt.loading) return '<div class="mask" data-act="close"></div><div class="drawer"><div class="loading">טוען...</div></div>';
        const q = dt.quote; const locked = this.isLocked();
        const tab = STEPS.some(([k]) => k === this.s.tab) ? this.s.tab : 'customer';
        const idx = STEPS.findIndex(([k]) => k === tab);
        const issues = locked ? {} : this.tabIssues(dt.draft);
        const proofWait = q.paymentStatus === 'awaiting_transfer_approval' || (dt.proofs || []).some((p) => p.status === 'pending');
        const tabs = STEPS.map(([k, label, ic]) => `<button type="button" class="tab${k === tab ? ' on' : ''}" data-act="tab" data-k="${k}">${k === 'payment' && proofWait ? '<i class="ping" title="אסמכתא ממתינה"></i>' : ''}${ic} ${label}${issues[k] ? '<i class="dot" title="חסרים פרטים"></i>' : ''}</button>`).join('');
        const prev = STEPS[idx - 1]; const next = STEPS[idx + 1];
        return `<div class="mask" data-act="close"></div><div class="drawer">
            <div class="dh"><h2>${esc(q.customerName || 'הצעה')} ${q.quoteNumber ? `<span class="sub">#${q.quoteNumber}</span>` : ''}</h2>${badge(L.status, 'status', q.status)}${proofWait ? badge(L.pay, 'pay', 'awaiting_transfer_approval') : ''}<button data-act="close">✕</button></div>
            <div class="tabs">${tabs}</div>
            <div class="db">
              ${locked ? '<div class="lockmsg">ההצעה נעולה לעריכה (נחתמה / פגה / בוטלה). ניתן לערוך הערות בלבד.</div>' : ''}
              ${dt.banner ? `<div class="err">${esc(dt.banner)}</div>` : ''}
              ${(q.conflicts || []).length ? `<div class="err">🔴 התנגשות ביומן: ${esc(q.conflicts.map((c) => c.summary || c.key).join(' | '))}</div>` : ''}
              ${this.paneHtml(tab, dt)}
            </div>
            <div class="foot">
              <div class="stepnav"><button type="button" data-act="stepPrev"${prev ? '' : ' disabled'}>→ ${prev ? esc(prev[1]) : 'הקודם'}</button><span class="sub">שלב ${idx + 1} מתוך ${STEPS.length} · ${STEPS[idx][1]}</span><button type="button" class="btn-p" data-act="stepNext"${next ? '' : ' disabled'}>${next ? esc(next[1]) : 'הבא'} ←</button></div>
              <div class="acts"><button class="btn-d" data-act="cancel"${q.status === 'cancelled' ? ' disabled' : ''}>בטל הצעה</button><span><button data-act="preview">תצוגה מקדימה</button><button data-act="copyLink"${q.publicToken ? '' : ' disabled'}>העתק קישור</button>${q.publicToken && ['draft', 'sent', 'viewed'].includes(q.status) ? '<button data-act="sendEmail">שלח במייל</button><button data-act="sendWhatsapp">שלח בוואטסאפ</button>' : ''}${['lead', 'draft'].includes(q.status) ? '<button data-act="prepare">הכן לשליחה</button>' : ''}<button class="btn-p" data-act="save"${this.s.saving ? ' disabled' : ''}>${this.s.saving ? 'שומר...' : 'שמור'}</button></span></div>
            </div>
          </div>`;
    }
}

if (!customElements.get(TAG)) customElements.define(TAG, QuotesDashboard);
