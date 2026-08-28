/**
 * studioUpsell/checkout.js — builds and creates the @wix/ecom checkout for
 * an in-person add-on purchase, and logs a StudioAddOnOrders CMS row.
 *
 * All line items use itemType.preset = 'DIGITAL' so Wix never asks for a
 * shipping address / applies shipping costs during this checkout, per spec.
 *
 * NOTE on redirection: `overrideCheckoutUrl` here only controls where an
 * ABANDONED checkout sends the customer back to (the QR landing page) — it
 * does NOT control the post-payment redirect. The post-payment redirect to
 * the dedicated Thank You page is done on the frontend via
 * `wixEcomFrontend.navigateToCheckoutPage(checkoutId, { overrideThankYouPageUrl })`.
 */
import wixData from 'wix-data';
import { checkout } from '@wix/ecom';
import { auth } from '@wix/essentials';
import { randomBytes } from 'crypto';

const SA = { suppressAuth: true };
const elevatedCreateCheckout = auth.elevate(checkout.createCheckout);

function generateToken() {
    return randomBytes(16).toString('hex');
}

function buildDescriptionLines(workshopTitle) {
    if (!workshopTitle) return [];
    return [{ name: { original: 'סדנה' }, plainText: { original: workshopTitle } }];
}

/**
 * @param {object} params
 * @param {Array<{id?:string, title:string, price:number, quantity:number, image?:string}>} params.items
 * @param {number} [params.openAmount] - optional custom amount line item
 * @param {string} [params.openAmountLabel]
 * @param {string} [params.workshopOrderId] - matching WorkshopOrders._id, if identified via phone
 * @param {string} [params.sessionId]
 * @param {string} [params.serviceId]
 * @param {string} [params.workshopTypeId]
 * @param {string|Date} [params.workshopStart]
 * @param {string} [params.workshopTitle]
 * @param {string} [params.customerName]
 * @param {string} [params.customerPhone]
 * @param {'qr_customer'|'qr_staff'} [params.createdVia]
 * @param {string} [params.staffName]
 * @param {string} [params.resumeUrl] - QR landing page URL used for abandoned-checkout recovery
 */
export async function createAddOnCheckout(params) {
    const {
        items = [],
        openAmount = 0,
        openAmountLabel = 'סכום פתוח',
        workshopOrderId = null,
        sessionId = null,
        serviceId = null,
        workshopTypeId = null,
        workshopStart = null,
        workshopTitle = '',
        customerName = '',
        customerPhone = '',
        createdVia = 'qr_customer',
        staffName = null,
        resumeUrl = null,
    } = params || {};

    const descriptionLines = buildDescriptionLines(workshopTitle);

    const customLineItems = (items || [])
        .filter((i) => Number(i.quantity) > 0 && Number(i.price) >= 0)
        .map((i) => ({
            quantity: Number(i.quantity),
            price: Number(i.price).toFixed(2),
            productName: { original: i.title },
            itemType: { preset: 'DIGITAL' },
            ...(i.image ? { media: i.image } : {}),
            ...(descriptionLines.length ? { descriptionLines } : {}),
        }));

    const cleanOpenAmount = Math.max(0, Number(openAmount) || 0);
    if (cleanOpenAmount > 0) {
        customLineItems.push({
            quantity: 1,
            price: cleanOpenAmount.toFixed(2),
            productName: { original: openAmountLabel || 'סכום פתוח' },
            itemType: { preset: 'DIGITAL' },
            ...(descriptionLines.length ? { descriptionLines } : {}),
        });
    }

    if (!customLineItems.length) {
        throw new Error('לא נבחרו פריטים לתשלום');
    }

    const total = (items || []).reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0) + cleanOpenAmount;

    const checkoutOptions = {
        customLineItems,
        channelType: 'WEB',
        ...(resumeUrl ? { overrideCheckoutUrl: resumeUrl } : {}),
        ...(customerName || customerPhone ? {
            checkoutInfo: {
                billingInfo: {
                    contactDetails: {
                        firstName: customerName || '',
                        phone: customerPhone || '',
                    },
                },
            },
        } : {}),
    };

    const newCheckout = await elevatedCreateCheckout(checkoutOptions);
    const confirmationToken = generateToken();

    const addOnOrder = await wixData.insert('StudioAddOnOrders', {
        confirmationToken,
        checkoutId: newCheckout._id,
        ecomOrderId: null,
        ecomOrderNumber: null,
        status: 'pending_payment',
        createdVia,
        staffName: staffName || null,
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        workshopOrderId: workshopOrderId || null,
        sessionId: sessionId || null,
        serviceId: serviceId || null,
        workshopTypeId: workshopTypeId || null,
        workshopTitle: workshopTitle || '',
        workshopStart: workshopStart ? new Date(workshopStart) : null,
        items: (items || []).filter((i) => Number(i.quantity) > 0),
        openAmount: cleanOpenAmount,
        total,
        staffCode: null,
        paidAt: null,
    }, SA);

    return {
        checkoutId: newCheckout._id,
        confirmationToken,
        addOnOrderId: addOnOrder._id,
        total,
    };
}
