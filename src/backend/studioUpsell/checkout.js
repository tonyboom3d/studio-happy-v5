/**
 * studioUpsell/checkout.js — builds and creates the @wix/ecom checkout for
 * an in-person add-on purchase, and logs a StudioAddOnOrders CMS row.
 *
 * Line items use itemType.preset = 'PHYSICAL' + shippable: false (matches the
 * proven pattern in bookingService.web.js's cup line items) instead of
 * 'DIGITAL' — DIGITAL requires a real digitalFile.fileId on order creation
 * (MISSING_DIGITAL_FILE), which we don't have since these aren't downloadable
 * files. shippable: false is what actually skips the shipping step/cost, not
 * the DIGITAL preset.
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
import { getPurchasedQuantityForCustomer } from './inventory.js';

const SA = { suppressAuth: true };
const elevatedCreateCheckout = auth.elevate(checkout.createCheckout);

function generateToken() {
    return randomBytes(16).toString('hex');
}

/**
 * Re-validates stock + "per customer" caps server-side (source of truth) right
 * before checkout creation. The perCustomer cap counts only what this customer
 * already bought for THIS workshop session (see inventory.js).
 */
async function assertItemsAvailable(items, customerPhone, scope) {
    const withQty = (items || []).filter((i) => i?.id && Number(i.quantity) > 0);
    for (const item of withQty) {
        const addOn = await wixData.get('StudioAddOns', item.id, SA).catch(() => null);
        if (!addOn) continue;

        if (addOn.inventoryManaged) {
            const stock = Number(addOn.stockQuantity) || 0;
            if (Number(item.quantity) > stock) {
                throw new Error(`אין מלאי מספיק עבור "${addOn.title || item.title}" (במלאי: ${stock}).`);
            }
        }

        if (addOn.maxQuantityMode === 'perCustomer') {
            const max = Number(addOn.maxQuantity) || 0;
            const purchased = await getPurchasedQuantityForCustomer(addOn._id, customerPhone, scope);
            if (purchased + Number(item.quantity) > max) {
                if (purchased >= max) {
                    throw new Error(`"${addOn.title || item.title}" נרכש כבר עבור סדנה זו ואינו זמין לרכישה נוספת.`);
                }
                const remaining = Math.max(0, max - purchased);
                throw new Error(`ניתן לרכוש עד ${max} יחידות של "${addOn.title || item.title}" לכל מזמין בסדנה זו (נותרו ${remaining}).`);
            }
        }
    }
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

    await assertItemsAvailable(items, customerPhone, { sessionId, workshopOrderId, workshopTypeId, workshopStart });

    const descriptionLines = buildDescriptionLines(workshopTitle);

    const customLineItems = (items || [])
        .filter((i) => Number(i.quantity) > 0 && Number(i.price) >= 0)
        .map((i) => ({
            quantity: Number(i.quantity),
            price: Number(i.price).toFixed(2),
            productName: { original: i.title },
            itemType: { preset: 'PHYSICAL' },
            shippable: false,
            ...(i.image ? { media: i.image } : {}),
            ...(descriptionLines.length ? { descriptionLines } : {}),
        }));

    const cleanOpenAmount = Math.max(0, Number(openAmount) || 0);
    if (cleanOpenAmount > 0) {
        customLineItems.push({
            quantity: 1,
            price: cleanOpenAmount.toFixed(2),
            productName: { original: openAmountLabel || 'סכום פתוח' },
            itemType: { preset: 'PHYSICAL' },
            shippable: false,
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
        staffApprovalRequired: false,
        staffApprovedAt: null,
        paidAt: null,
    }, SA);

    return {
        checkoutId: newCheckout._id,
        confirmationToken,
        addOnOrderId: addOnOrder._id,
        total,
    };
}
