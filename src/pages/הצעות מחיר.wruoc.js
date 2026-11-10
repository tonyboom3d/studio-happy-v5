// Dashboard page bridge: <quotes-dashboard> CE <-> backend/quotesAdmin.web.js. No business logic here.
import { loadQuotesDashboard, listQuotes, getQuote, getQuoteStaff } from 'backend/quotesRead.web.js';
import {
    updateQuote, cancelQuote, syncQuoteLeads, listTemplates, saveTemplate, deleteTemplate,
    previewQuote, prepareQuote, getQuoteLink, approveBankTransfer, rejectBankTransfer, sendQuote,
} from 'backend/quotesAdmin.web.js';

const CE_ID = '#customElement2';

// action type -> backend call (payload.actorName is self-declared by the CE)
const handlers = {
    boot: (p) => loadQuotesDashboard({ search: p.search, filters: p.filters, sort: p.sort, paging: p.paging }),
    list: (p) => listQuotes({ search: p.search, filters: p.filters, sort: p.sort, paging: p.paging }),
    get: (p) => getQuote(p.id),
    staff: (p) => getQuoteStaff(p.id, p.eventDate),
    update: (p) => updateQuote(p.id, p.patch, p.actorName),
    cancel: (p) => cancelQuote(p.id, p.actorName),
    sync: (p) => syncQuoteLeads(p.actorName),
    templates: () => listTemplates(),
    saveTemplate: (p) => saveTemplate(p.tpl, p.actorName),
    deleteTemplate: (p) => deleteTemplate(p.id),
    preview: (p) => previewQuote(p.id, p.templateId),
    prepare: (p) => prepareQuote(p.id, p.templateId, p.actorName),
    approveTransfer: (p) => approveBankTransfer(p.id, p.actorName),
    rejectTransfer: (p) => rejectBankTransfer(p.id, p.actorName),
    send: (p) => sendQuote(p.id, p.channels, p.actorName),
    link: (p) => getQuoteLink(p.id, p.actorName),
};

$w.onReady(() => {
    const ce = $w(CE_ID);
    ce.on('quotes-action', async (event) => {
        const { type, payload, requestId } = event.detail || {};
        const reply = (body) => ce.setAttribute('action-result', JSON.stringify({ requestId, ...body, __ts: Date.now() }));
        try {
            if (!handlers[type]) throw new Error(`UNKNOWN_ACTION:${type}`);
            reply({ ok: true, data: await handlers[type](payload || {}) });
        } catch (err) {
            console.error('[quotes-dashboard-velo]', type, err?.message || err);
            reply({ ok: false, error: err?.message || String(err) });
        }
    });
    ce.setAttribute('bridge-ready', '1'); // CE starts its first load only now
});
