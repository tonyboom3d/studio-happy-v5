/**
 * studioUpsell/printQueue.js — writes a PrintQueue CMS row once an in-person
 * add-on order is paid, so a (future) printer-side worker can pick it up.
 * Printer hardware execution is out of scope here — this only prepares the
 * database schema/creation logic per the plan.
 *
 * PrintQueue fields: addOnOrderId, status (pending/printing/printed/failed),
 * payload (object snapshot for the receipt), attempts, printedAt, errorMessage.
 */
import wixData from 'wix-data';

const SA = { suppressAuth: true };

export async function enqueuePrintJob(addOnOrder) {
    if (!addOnOrder?._id) return null;

    try {
        const existing = await wixData.query('PrintQueue').eq('addOnOrderId', addOnOrder._id).find(SA);
        if (existing.items?.length) return existing.items[0];

        return await wixData.insert('PrintQueue', {
            addOnOrderId: addOnOrder._id,
            status: 'pending',
            payload: {
                customerName: addOnOrder.customerName || '',
                customerPhone: addOnOrder.customerPhone || '',
                workshopTitle: addOnOrder.workshopTitle || '',
                items: addOnOrder.items || [],
                openAmount: addOnOrder.openAmount || 0,
                total: addOnOrder.total || 0,
                staffCode: addOnOrder.staffCode || null,
                paidAt: addOnOrder.paidAt || new Date().toISOString(),
            },
            attempts: 0,
            printedAt: null,
            errorMessage: null,
        }, SA);
    } catch (err) {
        console.error('[studioUpsell/printQueue] enqueuePrintJob failed:', err?.message || err);
        return null;
    }
}
