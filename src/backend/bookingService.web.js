import { addOns, bookings, services, extendedBookings, serviceOptionsAndVariants } from "@wix/bookings";
import { availabilityCalendar } from 'wix-bookings.v2';
import { auth } from "@wix/essentials";
import wixData from 'wix-data';
import wixPayBackend from 'wix-pay-backend'; // DEPRECATED — used only by createWorkshopPayment (legacy Wix Pay flow)
import { checkout } from '@wix/ecom';
import { Permissions, webMethod } from 'wix-web-module';
import wixSecretsBackend from 'wix-secrets-backend';
import { fetch } from 'wix-fetch';
import { createHmac, randomBytes } from 'crypto';
import { mediaManager } from 'wix-media-backend';
import { sendGreenApiWhatsApp, sendSelectionNotification } from 'backend/whatsappService.jsw';
import { SKETCH_STATUS, normalizeSketchStatus, isLockedStatus, wouldViolateLockedMinimum } from 'backend/sketchStatus.js';
import { getItemWithRetry } from 'backend/wixDataRetry.js';
import {
    checkEditingWindow,
    computeSketchEditingDeadline,
    enrichOrderEditingFields,
    FORTY_EIGHT_HOURS_MS,
    isTuftingServiceId,
} from 'backend/sketchEditingPolicy.js';
import { normalizeIsraeliPhone, getPhoneLookupVariants, extractBookingIdsFromEcomOrder } from 'backend/orderUtils.js';
import * as orderReconciliation from 'backend/orderReconciliation.js';

const WORKSHOP_ACCESS_TOKEN_SECRET_NAME = 'WorkshopAccessTokens';

// SERVICE_ID של הקורס/CLASS (legacy - for backward compatibility)
const SERVICE_ID = '63aed094-a433-4e35-ad3b-71705335ca0c';

// Tufting Workshop Service IDs
const TUFTING_SERVICE_IDS = {
    weekday: '3406e74d-949b-44b0-a5cc-064548129c08', // Tufting Workshop (רגיל)
    friday: '22e86498-525e-4580-9c83-a4470b0c874d', // Tufting Friday
    weekend: 'c1c1e799-84a9-4847-adf6-2a34480c5bfe', // Tufting Weekend
};

// Candles Workshop ("סדנת נרות") Service IDs — see src/pages/candels.js
const CANDLES_SERVICE_IDS = {
    a: 'eb8fec0e-5d04-48a3-a795-e3e8051d07da',
    b: 'f0f6e447-02d8-4808-80ba-3c380ce9eae8',
};
const CANDLES_ID_SET = new Set(Object.values(CANDLES_SERVICE_IDS));

/** True if serviceId belongs to the candles ("סדנת נרות") workshop. */
function isCandlesServiceId(serviceId) {
    return !!serviceId && CANDLES_ID_SET.has(serviceId);
}

/** Resolve the full sibling-service-id group (used for multi-service availability/pricing) for a given serviceId. */
function getServiceIdsGroupFor(serviceId) {
    if (isCandlesServiceId(serviceId)) return Object.values(CANDLES_SERVICE_IDS);
    return Object.values(TUFTING_SERVICE_IDS);
}

// A parent can accompany up to 2 children (first child = shared "הורה+ילד"
// candle/ticket, additional children up to this cap = "תוספת ילד").
const CANDLES_MAX_CHILDREN_PER_ADULT = 5;

// "נר נוסף" — a candles-only add-on. Carries its own price (independent of
// the "יחיד"/"ילד"/"תוספת ילד" ticket prices) and never occupies a Wix
// Bookings seat. Run `listCandlesAddOns` from backend/TEST.web.js to find
// the real addOnId/groupId per service, then fill them in below.
const EXTRA_CANDLE_ADDON_BY_SERVICE = {
    'eb8fec0e-5d04-48a3-a795-e3e8051d07da': { addOnId: '84fd7faa-aeee-4ea2-8b14-e966bf3f1848', groupId: '', price: 210 }, // נרות אמצע שבוע
    'f0f6e447-02d8-4808-80ba-3c380ce9eae8': { addOnId: '08b64e92-6b95-46b0-9e83-9d3762a98584', groupId: '', price: 250 }, // נרות סופ"ש
};

const FIRST_ORDER_MIN_TICKETS = 2;

/** Booked headcount for a specific session (0 = no prior orders on this slot). */
async function getSlotBookedParticipants(sessionId, serviceId, slotStartIso) {
    if (!sessionId || !serviceId) return null;

    const start = slotStartIso ? new Date(slotStartIso) : new Date();
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    try {
        const availability = await availabilityCalendar.queryAvailability({
            filter: {
                serviceId,
                startDate: dayStart.toISOString(),
                endDate: dayEnd.toISOString(),
            },
        }, { slotsPerDay: 50 });

        const entry = (availability.availabilityEntries || []).find((e) => {
            const sid = e.slot?.sessionId || e.slot?.eventId;
            return sid === sessionId;
        });
        if (!entry) return null;
        return Math.max(0, (entry.totalSpots || 0) - (entry.openSpots || 0));
    } catch (err) {
        console.warn('[getSlotBookedParticipants] Failed to query availability:', err?.message || err);
        return null;
    }
}

// Cache for service pricing fetched from Wix Bookings variants API.
// Keyed by the sorted, joined list of serviceIds so Tufting and Candles
// (and any future workshop) can be cached independently.
const _servicePricingCache = new Map();
const PRICING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Strip characters that break Wix Pay internal JSON handling (e.g. ס"מ). */
function sanitizePayItemName(text) {
    return String(text || '')
        .replace(/"/g, "'")
        .replace(/[\r\n\t\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
}

// GROUP_ID של קבוצת ה-Add-Ons בשירות
const ADDON_GROUP_ID = '91cbd277-61f5-4a2b-a285-546685c2b310';

/**
 * נרמול מספר טלפון ישראלי לפורמט +972XXXXXXXXX
 * - מסיר תווים שאינם ספרות
 * - מסיר 0 מוביל (אם קיים)
 * - מוסיף קידומת 972 ואת '+'
 */
const ISRAEL_TZ = 'Asia/Jerusalem';

function toIsraelLocalDateTime(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: ISRAEL_TZ,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    }).formatToParts(dateObj);
    const get = (type) => parts.find(p => p.type === type)?.value;
    return {
        year: Number(get('year')),
        monthOfYear: Number(get('month')),
        dayOfMonth: Number(get('day')),
        hourOfDay: Number(get('hour')),
        minutesOfHour: Number(get('minute')),
    };
}

/**
 * המרת wix:image:// לכתובת CDN ציבורית (https) לשימוש חיצוני (OpenAI וכו')
 */
function wixMediaToPublicUrl(wixUrl) {
    if (!wixUrl) return null;
    if (wixUrl.startsWith('http')) return wixUrl;

    const match = wixUrl.match(/wix:image:\/\/v1\/([^/#]+)/);
    if (match && match[1]) {
        return `https://static.wixstatic.com/media/${match[1]}`;
    }
    return null;
}

/** Derive wix:image:// file URL from a Wix CDN public URL (skip re-import). */
function wixFileUrlFromPublicUrl(publicUrl) {
    if (!publicUrl || typeof publicUrl !== 'string') return null;
    if (publicUrl.startsWith('wix:image://')) return publicUrl;
    const match = publicUrl.match(/static\.wixstatic\.com\/media\/([^/]+)/i);
    if (match?.[1]) return `wix:image://v1/${match[1]}`;
    return null;
}

function isTemporarySketchUrl(url) {
    return /replicate\.(delivery|com)/i.test(url || '');
}

function isWixHostedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('wix:image://')) return true;
    return /static\.wixstatic\.com\/media\//i.test(url);
}

function isSketchPersistedOnWix(sketchMediaUrl, sketchWixFileUrl) {
    if (sketchWixFileUrl?.startsWith('wix:image://')) return true;
    if (isWixHostedUrl(sketchMediaUrl)) return true;
    return !!wixFileUrlFromPublicUrl(sketchMediaUrl);
}

function inferImageMimeType(filename, fallback = 'image/png') {
    if (/\.jpe?g$/i.test(filename || '')) return 'image/jpeg';
    if (/\.webp$/i.test(filename || '')) return 'image/webp';
    if (/\.png$/i.test(filename || '')) return 'image/png';
    return fallback;
}

/** Build upload options per Wix mediaManager.upload documentation. */
function buildMediaUploadOptions(filename, mimeType) {
    const resolvedMime = mimeType || inferImageMimeType(filename);
    return {
        mediaOptions: {
            mimeType: resolvedMime,
            mediaType: 'image',
        },
        metadataOptions: {
            isPrivate: false,
            isVisitorUpload: false,
            context: {
                source: 'ai-sketch',
            },
        },
    };
}

/**
 * Normalize mediaManager.upload() result — fileUrl is the canonical Wix media reference.
 */
function normalizeWixMediaUploadResult(upload) {
    if (!upload || typeof upload !== 'object') {
        throw new Error('העלאת התמונה לשרת לא החזירה תשובה תקינה.');
    }
    const fileUrl = typeof upload.fileUrl === 'string' ? upload.fileUrl : null;
    if (!fileUrl || !fileUrl.startsWith('wix:')) {
        console.error('[normalizeWixMediaUploadResult] Missing fileUrl:', upload);
        throw new Error('העלאת התמונה לשרת לא החזירה כתובת קובץ (fileUrl).');
    }
    const publicUrl = wixMediaToPublicUrl(fileUrl);
    return {
        fileUrl,
        publicUrl,
        mimeType: upload.mimeType || null,
        width: upload.width || null,
        height: upload.height || null,
    };
}

/**
 * wix-fetch's backend Response does NOT implement the browser-only .arrayBuffer()
 * method — it's closer to node-fetch, which exposes .buffer() instead. Try every
 * known method so this keeps working regardless of the underlying implementation.
 */
async function fetchResponseToBuffer(response) {
    if (typeof response.arrayBuffer === 'function') {
        console.warn('[SketchUpload] fetchResponseToBuffer using response.arrayBuffer()');
        return Buffer.from(await response.arrayBuffer());
    }
    if (typeof response.buffer === 'function') {
        console.warn('[SketchUpload] fetchResponseToBuffer using response.buffer()');
        return await response.buffer();
    }
    if (typeof response.blob === 'function') {
        console.warn('[SketchUpload] fetchResponseToBuffer using response.blob()');
        const blob = await response.blob();
        if (typeof blob.arrayBuffer === 'function') {
            return Buffer.from(await blob.arrayBuffer());
        }
    }
    console.warn('[SketchUpload] fetchResponseToBuffer FAIL — no known method on response', Object.keys(response || {}));
    throw new Error('שגיאה בקריאת תוכן הסקיצה שהורדה מהשרת החיצוני.');
}

async function uploadBufferToWixMedia(buffer, folder, filename, mimeType) {
    console.warn('[SketchUpload] uploadBufferToWixMedia start', { folder, filename, mimeType, bytes: buffer?.byteLength });
    if (!buffer || !buffer.byteLength) {
        console.warn('[SketchUpload] uploadBufferToWixMedia abort — empty buffer');
        throw new Error('לא התקבל תוכן תקין להעלאה לשרת.');
    }
    const upload = await mediaManager.upload(
        folder,
        buffer,
        filename,
        buildMediaUploadOptions(filename, mimeType),
    );
    console.warn('[SketchUpload] uploadBufferToWixMedia mediaManager.upload done', { fileUrl: upload?.fileUrl, mimeType: upload?.mimeType });
    const result = normalizeWixMediaUploadResult(upload);
    console.warn('[SketchUpload] uploadBufferToWixMedia done', { fileUrl: result.fileUrl, publicUrl: result.publicUrl });
    return result;
}

async function uploadBase64ToWixMedia(base64, folder, filename) {
    console.warn('[SketchUpload] uploadBase64ToWixMedia start', { folder, filename, base64Len: base64?.length });
    if (!base64 || !base64.startsWith('data:')) {
        console.warn('[SketchUpload] uploadBase64ToWixMedia abort — invalid base64');
        return null;
    }
    const mimeMatch = base64.match(/^data:(image\/[^;]+);base64,/);
    const mimeType = mimeMatch?.[1] || inferImageMimeType(filename);
    const raw = base64.replace(/^data:image\/[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    const result = await uploadBufferToWixMedia(buffer, folder, filename, mimeType);
    console.warn('[SketchUpload] uploadBase64ToWixMedia done', { wixUrl: result.fileUrl, publicUrl: result.publicUrl });
    return { wixUrl: result.fileUrl, publicUrl: result.publicUrl };
}

async function resolveSketchWixFileUrlForSave({ productId, productSnapshot }) {
    const snapshotWix = String(productSnapshot?.wixFileUrl || '').trim();
    if (snapshotWix.startsWith('wix:image://')) return snapshotWix;

    const snapshotImage = String(productSnapshot?.image || '').trim();
    if (snapshotImage.startsWith('wix:image://')) return snapshotImage;

    if (!productId) return null;
    try {
        const product = await wixData.get('bookingProducts', productId, SA);
        const productImage = String(product?.image || '').trim();
        if (productImage.startsWith('wix:image://')) return productImage;
    } catch (err) {
        console.warn('[bookingService] resolveSketchWixFileUrlForSave failed:', productId, err?.message || err);
    }
    return null;
}

/**
 * המרת URL תמונה של Wix לכתובת ציבורית (עם resize לקטלוג)
 */
function convertWixImageUrl(wixUrl, width = 400, height = 400, quality = 80) {
    if (!wixUrl) return null;

    if (wixUrl.startsWith('http')) {
        return wixUrl;
    }

    const match = wixUrl.match(/wix:image:\/\/v1\/([^/]+)/);
    if (match && match[1]) {
        return `https://static.wixstatic.com/media/${match[1]}/v1/fill/w_${width},h_${height},q_${quality}/${match[1]}`;
    }

    return wixUrl;
}

function parseDifficultyTags(raw) {
    if (raw == null || raw === '') return '';
    if (Array.isArray(raw)) {
        const first = raw[0];
        return typeof first === 'string' ? first.trim() : String(first ?? '').trim();
    }
    if (typeof raw !== 'string') return String(raw).trim();
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const tryParseArray = (value) => {
        if (typeof value !== 'string' || !value.startsWith('[')) return '';
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return String(parsed[0]).trim();
            }
        } catch {}
        return '';
    };
    const fromJson = tryParseArray(trimmed);
    if (fromJson) return fromJson;
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            const unquoted = JSON.parse(trimmed);
            if (typeof unquoted === 'string') {
                const nested = tryParseArray(unquoted);
                if (nested) return nested;
                return unquoted.trim();
            }
        } catch {}
    }
    return trimmed;
}

function mapCatalogProduct(product, options = {}) {
    const diffTag = parseDifficultyTags(product.difficulty);
    const mapped = {
        _id: product._id,
        title: product.productName || '',
        image: convertWixImageUrl(product.image, 400, 400, 75),
        difficulty: diffTag || '',
        favorites: !!product.favorites
    };
    if (options.isCandles) {
        // Candles catalog ("bookingProducts"): productName holds the cup's
        // extra price in NIS (0 = included in the base ticket price), not a
        // display name — cups are shown by image + price only.
        const price = parseFloat(product.productName);
        mapped.title = '';
        mapped.price = Number.isFinite(price) ? price : 0;
    }
    return mapped;
}

// --- פונקציה: שליפת קטלוג מוצרים עם המרת תמונות ---
export const getProductsCatalog = webMethod(Permissions.Anyone, async (serviceId) => {
    try {
        let query = wixData.query('bookingProducts');
        const isCandles = isCandlesServiceId(serviceId);
        if (isTuftingServiceId(serviceId)) {
            query = query.hasSome('relatedService', ['טאפטינג']);
        } else if (isCandles) {
            query = query.hasSome('relatedService', ['נרות']);
        }
        const productsResult = await query.find({ suppressAuth: true, omitTotalCount: true });
        return productsResult.items.map((product) => mapCatalogProduct(product, { isCandles }));
    } catch (error) {
        console.error("Error fetching products catalog:", error);
        throw error;
    }
});

// --- פונקציה קיימת: קבלת פרטי השירות ---
export const getServiceDetails = webMethod(Permissions.Anyone, async () => {
    const elevatedGetService = auth.elevate(services.getService);
    try {
        const service = await elevatedGetService(SERVICE_ID);
        return service;
    } catch (error) {
        console.error("Error fetching service:", error);
        throw error;
    }
});

let _cachedAccessTokenSecret = null;

async function getWorkshopAccessTokenSecret() {
    if (_cachedAccessTokenSecret) return _cachedAccessTokenSecret;
    const secret = await wixSecretsBackend.getSecret(WORKSHOP_ACCESS_TOKEN_SECRET_NAME);
    if (!secret) {
        throw new Error(`Secret "${WORKSHOP_ACCESS_TOKEN_SECRET_NAME}" is not configured in Wix Secrets Manager`);
    }
    _cachedAccessTokenSecret = secret;
    return secret;
}

/** Normalize legacy/unpaid 90cm rows + sketch status for customer-facing APIs. */
function normalizeUpgradeSelection(sel) {
    if (!sel) return sel;
    let result = sel;
    if (sel.upgradePaymentStatus !== 'paid' && sel.canvasSize === '90x90') {
        result = {
            ...sel,
            canvasSize: sel.previousCanvasSize || '60x60',
            requestedCanvasSize: sel.requestedCanvasSize || '90x90',
            upgradePaymentStatus: sel.upgradePaymentStatus || 'pending-upgrade',
        };
    }
    return {
        ...result,
        sketchStatus: normalizeSketchStatus(result.sketchStatus),
        isStatusLocked: isLockedStatus(result.sketchStatus),
    };
}

function buildUnpaidUpgradeFields(prev, requestedSize) {
    const wants90 = requestedSize === '90x90';
    if (!wants90) {
        return {
            requestedCanvasSize: null,
            upgradePaymentStatus: null,
            upgradePaymentId: null,
            upgradePaymentRequestedAt: null,
        };
    }
    const paymentInFlight = prev?.upgradePaymentStatus === 'pending-payment-approval';
    return {
        requestedCanvasSize: '90x90',
        previousCanvasSize: '60x60',
        upgradePaymentStatus: paymentInFlight ? 'pending-payment-approval' : 'pending-upgrade',
        upgradePaymentRequestedAt: paymentInFlight ?
            (prev.upgradePaymentRequestedAt || new Date()) :
            null,
        ...(paymentInFlight ? {} : { upgradePaymentId: null }),
    };
}

// Physical capacity limit for 90x90 sketches per workshop session (shared
// across ALL orders/organizers booked into that same session — not just one
// order). Enforced both on the direct sketch save and on the paid-upgrade
// flow.
const SESSION_SKETCH_90_LIMIT = 5;

/**
 * Counts how many SketchSelections currently "hold" a 90x90 slot for the
 * given Bookings session — i.e. across every WorkshopOrder tied to that
 * session, not just the current order. A slot is held when canvasSize or
 * requestedCanvasSize is '90x90' and the upgrade payment hasn't failed
 * (failed upgrades are reset back to 60x60 by buildFailedUpgradeFields, but
 * we exclude them explicitly for safety).
 * @param {string} sessionId
 * @param {string} [excludeSelectionId] - selection to ignore (e.g. the one being edited)
 */
async function countSessionSketch90Reserved(sessionId, excludeSelectionId) {
    if (!sessionId) return 0;
    const ordersInSession = await wixData.query('WorkshopOrders')
        .eq('sessionId', sessionId)
        .find(SA);
    const orderIds = ordersInSession.items.map((o) => o._id);
    if (orderIds.length === 0) return 0;

    const result = await wixData.query('SketchSelections')
        .hasSome('orderId', orderIds)
        .find(SA);

    return result.items.filter((sel) => {
        if (excludeSelectionId && sel._id === excludeSelectionId) return false;
        const holds90 = sel.canvasSize === '90x90' || sel.requestedCanvasSize === '90x90';
        return holds90 && sel.upgradePaymentStatus !== 'failed';
    }).length;
}

function buildFailedUpgradeFields(sel) {
    return {
        upgradePaymentStatus: 'failed',
        requestedCanvasSize: null,
        upgradePaymentId: null,
        upgradePaymentRequestedAt: null,
        canvasSize: '60x60',
        previousCanvasSize: sel.previousCanvasSize || '60x60',
    };
}

/** Random URL-safe token (plain text — only sent to user, never stored as-is in CMS) */
function generateToken(byteLength = 32) {
    return randomBytes(byteLength).toString('base64url');
}

/** UUID-format _id, so bulk-inserted records can be tracked without re-querying. */
function generateItemId() {
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Throw if a wix-data bulk result reports per-item errors. */
function assertBulkSuccess(result, actionLabel) {
    if (result?.errors?.length) {
        const first = result.errors[0];
        console.error(`[${actionLabel}] bulk operation had ${result.errors.length} error(s):`, JSON.stringify(result.errors));
        throw new Error(`BULK_${actionLabel.toUpperCase()}_FAILED:${first?.error?.message || first?.message || 'unknown'}`);
    }
}

/** HMAC-SHA256 hash for participant access tokens (stored on WorkshopParticipants) */
async function hashAccessToken(token) {
    const secret = await getWorkshopAccessTokenSecret();
    return createHmac('sha256', secret).update(token).digest('hex');
}

// --- פונקציה 1b: תהליך eCommerce Checkout — יצירת הזמנות ומעבר ל-checkout של Wix ---
// סדנת טאפטינג: createBooking (הזמנה בודדת) + WorkshopOrders CMS + eCommerce checkout
export const createAndCheckout = webMethod(Permissions.Anyone, async (orderData) => {
    console.log('[createAndCheckout] orderData received:', JSON.stringify(orderData, null, 2));

    const { adults, children, extraCandles: rawExtraCandles, slots: rawSlots, userDetails: rawUser, products: rawProducts } = orderData;
    const userDetails = rawUser || orderData.customerInfo || {};
    const numAdults = Number(adults) || 1;
    const numChildren = Number(children) || 0;
    const slotsList = Array.isArray(rawSlots) ? rawSlots : [];

    if (slotsList.length === 0) {
        throw new Error('No slots provided for booking');
    }

    // --- חישוב מחיר מ-Wix Variants API (טאפטינג / נרות) ---
    const serviceId = slotsList[0].serviceId;
    const isCandles = isCandlesServiceId(serviceId);
    const allPricing = await getServicePricingCached(getServiceIdsGroupFor(serviceId));
    const servicePricing = allPricing[serviceId];
    if (!servicePricing || !servicePricing.solo) {
        throw new Error(`No pricing found for service: ${serviceId}. Make sure Wix Bookings variants are configured.`);
    }

    if (isCandles && numChildren > numAdults * CANDLES_MAX_CHILDREN_PER_ADULT) {
        throw new Error('CHILDREN_NEED_ADULT');
    }

    // נרות — מודל מחיר-לפי-נר / מושב-לפי-אדם:
    // · מבוגר יחיד (בלי ילד) = מושב "יחיד" אחד, נר אחד, מחיר יחיד.
    // · הורה+ילד (הילד הראשון תחת מבוגר מלווה) = 2 מושבים ("יחיד"+"ילד"),
    //   נר אחד משותף, מחיר "ילד". מבוגר יכול ללוות עד CANDLES_MAX_CHILDREN_PER_ADULT ילדים.
    // · ילד נוסף תחת אותו מבוגר = מושב "תוספת ילד" אחד, נר משלו, מחיר כמו יחיד.
    // · "נר נוסף" (add-on נפרד, בלי מושב) — עד נר נוסף אחד לכל נר בסיס.
    // טאפטינג: הורה+ילד = זוג אחד (לוגיקה קיימת ללא שינוי).
    let parentChildPairs, extraChildren, soloAdults, rugCount, baseCandles = 0, extraCandles = 0, extraCandlePrice = 0, extraCandleAddOnId = null, extraCandleGroupId = null;
    if (isCandles) {
        const parentChildPairsCalc = Math.min(numAdults, numChildren);
        const remainingChildren = numChildren - parentChildPairsCalc;
        const maxExtraPerPairedAdult = CANDLES_MAX_CHILDREN_PER_ADULT - 1;
        parentChildPairs = parentChildPairsCalc;
        extraChildren = Math.min(remainingChildren, parentChildPairs * maxExtraPerPairedAdult);
        soloAdults = numAdults - parentChildPairs;
        baseCandles = soloAdults + numChildren; // מספר נרות בסיס

        const extraCandleConfig = EXTRA_CANDLE_ADDON_BY_SERVICE[serviceId] || null;
        extraCandlePrice = extraCandleConfig?.price || 0;
        extraCandleAddOnId = extraCandleConfig?.addOnId || null;
        extraCandleGroupId = extraCandleConfig?.groupId || null;
        extraCandles = Math.max(0, Math.min(Number(rawExtraCandles) || 0, baseCandles));

        rugCount = baseCandles + extraCandles; // מספר נרות כולל (למכסת כוסות/דשבורד)
    } else {
        parentChildPairs = Math.min(numAdults, numChildren);
        extraChildren = 0;
        soloAdults = numAdults - parentChildPairs;
        rugCount = numAdults;
    }
    const pricePerAdult = servicePricing.solo;
    // מחיר כרטיס "ילד" (זוג הורה+ילד) — נופל חזרה למחיר יחיד אם לא הוגדר.
    const childTicketPrice = servicePricing.parentChild || pricePerAdult;
    // מחיר "תוספת ילד" — כרטיס בפני עצמו, מתומחר כמו יחיד (לא כמו חבילת הורה+ילד).
    const extraChildTicketPrice = servicePricing.extraChild || pricePerAdult;
    const basePrice = (soloAdults * pricePerAdult) + (parentChildPairs * childTicketPrice) + (extraChildren * extraChildTicketPrice) + (extraCandles * extraCandlePrice);

    // --- נרמול פרטי משתמש ---
    const fullName = (userDetails?.name || userDetails?.full_name || '').trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const rawPhone = userDetails?.phone ? String(userDetails.phone).trim() : '';
    const phone = rawPhone;
    const email = userDetails?.email ? String(userDetails.email).trim() : '';

    // הנחה מיוחדת: אם מספר הטלפון הוא 0523813929 המחיר יהיה 1 ש"ח
    const effectivePrice = rawPhone === '0523813929' ? 1 : basePrice;

    // --- הודעת תיאור לבעל האתר ---
    const unitWordPlural = isCandles ? 'נרות' : 'שטיחים';
    const unitWordSingular = isCandles ? 'נר' : 'שטיח';
    const unitWord = rugCount === 1 ? unitWordSingular : unitWordPlural;
    const workshopLabel = isCandles ? 'סדנת נרות' : 'סדנת טאפטינג';
    const notificationMessage = `${workshopLabel}: ${numAdults} מבוגרים${numChildren > 0 ? `, ${numChildren} ילדים` : ''}, ${rugCount} ${unitWordPlural}`;

    // --- שלב 1: createBooking (הזמנה אחת בלבד) ---
    const slot = slotsList[0];
    const sessionId = slot.sessionId || slot._id || slot.id || slot.slot_id;
    if (!sessionId) {
        throw new Error('Slot is missing sessionId');
    }

    // מושבי Wix בפועל — לפי אנשים, לא לפי נרות (הורה+ילד = 2 מושבים, נר אחד).
    const seatsUsed = isCandles ? (numAdults + numChildren) : numAdults;
    if (isCandles && typeof slot.openSpots === 'number' && seatsUsed > slot.openSpots) {
        throw new Error('CAPACITY_EXCEEDED');
    }

    const slotStartIso = slot.date || slot.startDate || slot.start?.timestamp || slot.start;
    const bookedParticipants = await getSlotBookedParticipants(sessionId, serviceId, slotStartIso);
    // מינימום הזמנה ראשונה נשאר לפי נרות בסיס — הורה+ילד לבד עדיין לא פותח סשן,
    // ונר נוסף לא "עוזר" לעבור את הסף.
    const firstOrderTicketCount = isCandles ? baseCandles : rugCount;
    if (bookedParticipants === 0 && firstOrderTicketCount < FIRST_ORDER_MIN_TICKETS) {
        throw new Error('FIRST_ORDER_MIN_TICKETS');
    }

    // Build participantsChoices when we have variant info, otherwise fall back to totalParticipants
    let participantField;
    if (isCandles && servicePricing.soloOptionId && numChildren > 0) {
        // נרות: 3 וריאנטים נפרדים — "יחיד" (כולל המבוגר בכל זוג הורה+ילד),
        // "ילד" (חלקו של הילד בזוג), ו"תוספת ילד" (ילד נוסף, מושב משלו).
        const soloSeats = soloAdults + parentChildPairs;
        const serviceChoices = [];
        if (soloSeats > 0) {
            serviceChoices.push({
                numberOfParticipants: soloSeats,
                choices: [{ custom: servicePricing.soloChoice, optionId: servicePricing.soloOptionId }]
            });
        }
        if (parentChildPairs > 0 && servicePricing.parentChildOptionId) {
            serviceChoices.push({
                numberOfParticipants: parentChildPairs,
                choices: [{ custom: servicePricing.parentChildChoice, optionId: servicePricing.parentChildOptionId }]
            });
        }
        if (extraChildren > 0 && servicePricing.extraChildOptionId) {
            serviceChoices.push({
                numberOfParticipants: extraChildren,
                choices: [{ custom: servicePricing.extraChildChoice, optionId: servicePricing.extraChildOptionId }]
            });
        }
        participantField = { participantsChoices: { serviceChoices } };
    } else if (!isCandles && servicePricing.soloOptionId && numChildren > 0) {
        // טאפטינג — לוגיקה קיימת ללא שינוי: זוג הורה+ילד = מושב אחד.
        const serviceChoices = [];
        if (soloAdults > 0) {
            serviceChoices.push({
                numberOfParticipants: soloAdults,
                choices: [{ custom: servicePricing.soloChoice, optionId: servicePricing.soloOptionId }]
            });
        }
        if (parentChildPairs > 0) {
            serviceChoices.push({
                numberOfParticipants: parentChildPairs,
                choices: [{ custom: servicePricing.parentChildChoice, optionId: servicePricing.parentChildOptionId }]
            });
        }
        participantField = { participantsChoices: { serviceChoices } };
    } else {
        // rugCount = number of candles (candles: base + extra); seatsUsed = actual Wix seats.
        participantField = { totalParticipants: isCandles ? seatsUsed : rugCount };
    }

    const bookingPayload = {
        bookedEntity: {
            slot: { sessionId, timezone: 'Asia/Jerusalem' }
        },
        // Default booking form field keys per Wix Forms integration
        // (https://dev.wix.com/docs/api-reference/business-solutions/bookings/wix-forms-integration):
        // firstName / lastName / email / phone — must be camelCase to map to
        // the booking's contactDetails and show up in the Wix dashboard.
        formSubmission: {
            firstName,
            lastName,
            email,
            phone,
        },
        ...participantField,
        sendSmsReminder: true,
        participantNotification: {
            notifyParticipants: true,
            message: notificationMessage,
            metadata: { channels: 'EMAIL, SMS' }
        }
    };

    // "נר נוסף" — add-on בלבד, בלי מושב נוסף.
    if (isCandles && extraCandles > 0 && extraCandleAddOnId) {
        bookingPayload.bookedAddOns = [{
            _id: extraCandleAddOnId,
            ...(extraCandleGroupId ? { groupId: extraCandleGroupId } : {}),
            quantity: extraCandles,
        }];
    }

    console.log('[createAndCheckout] createBooking payload:', JSON.stringify(bookingPayload, null, 2));
    const elevatedCreateBooking = auth.elevate(bookings.createBooking);
    const bookingResult = await elevatedCreateBooking(bookingPayload, {
        flowControlSettings: {
            skipAvailabilityValidation: false,
            skipBusinessConfirmation: false,
            skipAddOnValidation: true
        }
    });

    // SDK returns { booking: Booking } — unwrap either format
    const createdBooking = bookingResult?.booking ?? bookingResult;

    if (!createdBooking?._id) {
        console.error('[createAndCheckout] Unexpected createBooking response:', JSON.stringify(bookingResult, null, 2));
        throw new Error('Booking creation failed — no booking ID returned');
    }

    const bookingIds = [createdBooking._id];
    console.log('[createAndCheckout] Booking created:', createdBooking._id, 'status:', createdBooking.status);

    // --- שלב 2: יצירת רשומת WorkshopOrders ב-CMS ---
    const orderToken = generateToken();
    const slotDate = slotsList[0].date || slotsList[0].startDate;
    const workshopStart = slotDate ? new Date(slotDate) : new Date();

    const msUntilWorkshop = workshopStart.getTime() - Date.now();
    if (isTuftingServiceId(serviceId)) {
        if (msUntilWorkshop <= FORTY_EIGHT_HOURS_MS) {
            throw new Error('BOOKING_TOO_CLOSE: online booking is closed within 48 hours of the workshop');
        }
    } else if (isCandlesServiceId(serviceId)) {
        if (msUntilWorkshop <= 60 * 60 * 1000) {
            throw new Error('BOOKING_TOO_CLOSE: online booking is closed within 1 hour of the workshop');
        }
    }

    const orderCreatedAt = new Date();
    const { deadline: deadlineAt } = computeSketchEditingDeadline(workshopStart, orderCreatedAt);

    // --- מוצרים נבחרים (כוסות לנרות) — נטענים מה-CMS לפי id בלבד, כדי שהמחיר/התמונה יגיעו מהשרת ולא מהלקוח ---
    // NOTE: any id the client sent that isn't found in the CMS throws
    // (INVALID_PRODUCT) instead of being silently dropped — a silent drop
    // here is exactly how a customer's real cup selection used to vanish
    // from the order without anyone (customer or staff) ever finding out.
    const selectedProductSelections = Array.isArray(rawProducts) ? rawProducts.filter((p) => p && (p.id || p._id)) : [];
    let cupCustomLineItems = [];
    let selectedCupsForOrder = [];
    if (selectedProductSelections.length > 0) {
        const productIds = selectedProductSelections.map((p) => p.id || p._id);
        const productsResult = await wixData.query('bookingProducts')
            .hasSome('_id', productIds)
            .find({ suppressAuth: true, omitTotalCount: true });
        const productsById = new Map(productsResult.items.map((p) => [p._id, p]));

        const missingProductIds = productIds.filter((id) => !productsById.has(id));
        if (missingProductIds.length > 0) {
            console.error('[createAndCheckout] INVALID_PRODUCT: unknown bookingProducts id(s):', missingProductIds);
            throw new Error('INVALID_PRODUCT: one or more selected cups are no longer available. Please reselect and try again.');
        }

        cupCustomLineItems = selectedProductSelections.map((sel) => {
            const productId = sel.id || sel._id;
            const product = productsById.get(productId);
            const quantity = Math.max(1, Number(sel.quantity) || 1);
            const price = parseFloat(product.productName) || 0;
            return {
                quantity,
                price: price.toFixed(2),
                productName: { original: 'כוס לנר' },
                itemType: { preset: 'PHYSICAL' },
                media: product.image || undefined,
                // Preserves the CMS productId on the eCom order itself (max 40
                // chars — Wix Data ids are 36-char UUIDs) so a post-payment
                // reconciliation pass can reconstruct selectedProducts even if
                // the pre-payment CMS write below never happened.
                physicalProperties: { sku: productId },
                _productId: productId,
                _price: price,
                _product: product,
            };
        });

        selectedCupsForOrder = cupCustomLineItems.map((item) => ({
            productId: item._productId,
            quantity: item.quantity,
            price: item._price,
            image: item._product?.image || null,
            imageUrl: item._product?.image ?
                convertWixImageUrl(item._product.image, 400, 400, 75) :
                null,
        }));
    }

    const workshopOrder = await wixData.insert('WorkshopOrders', {
        orderToken,
        bookingIds,
        serviceId,
        sessionId: slotsList[0].sessionId || slotsList[0]._id,
        workshopStart,
        adults: numAdults,
        children: numChildren,
        rugCount,
        extraCandleCount: isCandles ? extraCandles : 0,
        basePrice: effectivePrice,
        organizerName: fullName,
        organizerEmail: email,
        organizerPhone: rawPhone,
        status: 'pending_payment',
        deadlineAt,
        showPriceToParticipants: false,
        notifyOnSelection: false,
        selectionMode: null,
        workshopType: isCandles ? 'candles' : 'tufting',
        // Always written (even as []) so "no cups selected" is explicit in the
        // CMS row rather than looking identical to "cups field never written".
        selectedProducts: selectedCupsForOrder,
    }, { suppressAuth: true });

    console.log('[createAndCheckout] WorkshopOrder created:', workshopOrder._id);

    // --- שלב 3: יצירת eCommerce checkout ---
    const WIX_BOOKINGS_APP_ID = '13d21c63-b5ec-5912-8397-c3a5ddb27a97';
    const pricePerItem = (effectivePrice / bookingIds.length).toFixed(2);

    const participantDescription = [
        `${numAdults} ${numAdults === 1 ? 'מבוגר' : 'מבוגרים'}`,
        numChildren > 0 ? `${numChildren} ${numChildren === 1 ? 'ילד' : 'ילדים'}` : null,
        `${rugCount} ${unitWord}`,
    ].filter(Boolean).join(', ');

    const lineItems = bookingIds.map(id => ({
        quantity: 1,
        catalogReference: {
            appId: WIX_BOOKINGS_APP_ID,
            catalogItemId: id
        },
        catalogOverrideFields: {
            price: pricePerItem,
            description: participantDescription,
        }
    }));

    // Strip internal bookkeeping fields before sending to the eCom API.
    const customLineItems = cupCustomLineItems.map(({ _productId, _price, _product, ...item }) => item);

    const checkoutOptions = {
        lineItems,
        ...(customLineItems.length > 0 ? { customLineItems } : {}),
        channelType: 'WEB',
    };

    console.log('[createAndCheckout] Creating eCommerce checkout...', checkoutOptions);
    const elevatedCreateCheckout = auth.elevate(checkout.createCheckout);
    const newCheckout = await elevatedCreateCheckout(checkoutOptions);
    console.log('[createAndCheckout] Checkout created:', newCheckout?._id);

    // --- שלב 4: עדכון WorkshopOrders עם checkoutId ---
    await wixData.update('WorkshopOrders', {
        ...workshopOrder,
        checkoutId: newCheckout._id,
        status: 'checkout_created',
    }, { suppressAuth: true });

    return {
        checkoutId: newCheckout._id,
        bookingIds,
        orderToken,
        workshopOrderId: workshopOrder._id
    };
});

// --- פונקציה 1 (LEGACY): חישוב מחיר ויצירת תשלום דרך Wix Pay ---
// @deprecated — השתמש ב-createAndCheckout עם eCommerce checkout במקום זה
export const createWorkshopPayment = webMethod(Permissions.Anyone, async (orderData) => {
    // לוג קלט לדיבאג
    console.log('[createWorkshopPayment] orderData received:', JSON.stringify(orderData, null, 2));

    const { participants, products, totalSessions, woodType, userDetails: rawUser } = orderData;
    // תמיכה גם ב-customerInfo (מהדף) וגם ב-userDetails
    const userDetails = rawUser || orderData.customerInfo;

    // וידוא ש-totalSessions תקין
    const sessions = Number(totalSessions) || 1;

    // 1. שליפת מחיר הבסיס מהשירות ב-Wix
    const elevatedGetService = auth.elevate(services.getService);
    const service = await elevatedGetService(SERVICE_ID);

    let basePriceSingle = 340;
    // בדיקה אם קיים מחיר קבוע או משתנה
    if (service.payment?.rateType === 'FIXED' && service.payment.fixed?.price) {
        basePriceSingle = parseFloat(service.payment.fixed.price.value);
    } else if (service.payment?.rateType === 'VARIED' && service.payment.varied?.defaultPrice) {
        basePriceSingle = parseFloat(service.payment.varied.defaultPrice.value);
    }

    // לוגיקת מחירים
    let ticketPricePerGroup;
    switch (parseInt(participants)) {
    case 1:
        ticketPricePerGroup = basePriceSingle;
        break;
    case 2:
        ticketPricePerGroup = 600;
        break;
    case 3:
        ticketPricePerGroup = 795;
        break;
    case 4:
        ticketPricePerGroup = 980;
        break;
    default:
        ticketPricePerGroup = basePriceSingle * participants;
    }

    const totalTicketPrice = ticketPricePerGroup * sessions;

    // 2. חישוב מחיר מוצרים (שליפה מה-DB לאבטחה)
    // עץ ממוחזר = מוצרים כלולים במחיר (1 ש"ח סמלי שמופחת מהכרטיס), עץ חדש = +20% על מחיר המוצר
    let totalProductsPrice = 0;
    const validatedProducts = [];
    const productsList = Array.isArray(products) ? products : [];
    const isRecycledWood = woodType === 'recycled';
    let totalRecycledUnits = 0; // סה"כ יחידות של מוצרים בעץ ממוחזר

    for (const prod of productsList) {
        const productId = prod._id ?? prod.product_id ?? prod.id;
        if (!productId || typeof productId !== 'string') continue;
        const productInDb = await wixData.get('bookingProducts', productId);
        if (productInDb) {
            const quantity = prod.quantity || 1;

            if (isRecycledWood) {
                // עץ ממוחזר: מחיר סמלי 1 ש"ח ליחידה (Wix Pay דורש מחיר > 0)
                // הסכום הזה יופחת ממחיר הכרטיסים
                const productPrice = 1; // 1 ש"ח סמלי ליחידה
                totalProductsPrice += productPrice * quantity;
                totalRecycledUnits += quantity;
                validatedProducts.push({
                    ...productInDb,
                    finalPrice: productPrice,
                    quantity: quantity,
                    requestedWoodType: woodType
                });
            } else {
                // עץ חדש: מחיר + 20%
                const productPrice = Math.round(productInDb.price * 1.2);
                totalProductsPrice += productPrice * quantity;
                validatedProducts.push({
                    ...productInDb,
                    finalPrice: productPrice,
                    quantity: quantity,
                    requestedWoodType: woodType
                });
            }
        }
    }

    // עבור עץ ממוחזר: מפחיתים את הסכום הסמלי של המוצרים ממחיר הכרטיסים
    // כך שסה"כ התשלום נשאר אותו דבר (המוצרים "כלולים במחיר")
    let adjustedTicketPrice = totalTicketPrice;
    if (isRecycledWood && totalRecycledUnits > 0) {
        // מפחיתים 1 ש"ח לכל יחידה ממחיר הכרטיסים
        adjustedTicketPrice = Math.max(1, totalTicketPrice - totalRecycledUnits);
        console.log(`[createWorkshopPayment] Recycled wood: reducing ticket price by ${totalRecycledUnits} NIS (${totalRecycledUnits} units)`);
    }

    const finalAmount = adjustedTicketPrice + totalProductsPrice;

    // מיפוי פרטי משתמש לפורמט Wix Pay – רק שדות לא ריקים (Wix דוחה ערכים ריקים)
    const fullName = (userDetails?.name || userDetails?.full_name || '').trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const rawPhone = userDetails?.phone ? String(userDetails.phone).trim() : '';
    const phone = normalizeIsraeliPhone(rawPhone);
    const email = userDetails?.email ? String(userDetails.email).trim() : '';

    const userInfo = {};
    if (firstName) userInfo.firstName = firstName;
    if (lastName) userInfo.lastName = lastName;
    if (phone) userInfo.phone = phone;
    if (email) userInfo.email = email;
    // countryCode - ברירת מחדל ISR (ישראל) אם לא הועבר
    const countryCode = userDetails?.countryCode ? String(userDetails.countryCode).trim() : 'ISR';
    if (countryCode) userInfo.countryCode = countryCode;

    // הנחה מיוחדת: אם מספר הטלפון הוא 0523813929 (כפי שהוזן בטופס), המחיר הכולל יהיה 1 ש"ח
    const isSpecialPhone = rawPhone === '0523813929';
    const effectiveFinalAmount = isSpecialPhone ? 1 : finalAmount;
    const effectiveTicketPrice = isSpecialPhone ? 1 : adjustedTicketPrice;
    const effectiveValidatedProducts = isSpecialPhone ? [] : validatedProducts;

    // 3. יצירת אובייקט תשלום (Wix דורש name בכל item)
    const serviceName = service?.name || 'סדנת נגרות';
    const safeAmount = Number(effectiveFinalAmount) || 0;
    const safeTicketPrice = Number(effectiveTicketPrice) || 0; // משתמשים במחיר המותאם

    // בניית רשימת פריטים – עבור עץ ממוחזר מחיר 1 ש"ח (Wix Pay דורש > 0)
    const productItems = effectiveValidatedProducts.map(p => ({
        name: (p.title || p.productName || p.name || 'מוצר').toString().trim() || 'מוצר',
        price: p.finalPrice, // 1 ש"ח לעץ ממוחזר, מחיר מלא לעץ חדש
        quantity: p.quantity || 1
    }));

    const paymentOptions = {
        amount: safeAmount,
        items: [{
                name: `סדנת נגריה פתוחה (${participants} משתתפים) - ${serviceName}`,
                price: safeTicketPrice,
                quantity: 1
            },
            ...productItems
        ]
    };
    if (Object.keys(userInfo).length > 0) {
        paymentOptions.userInfo = userInfo;
    }

    // לוג לדיבאג – מה נשלח ל-createPayment
    console.log('[createWorkshopPayment] paymentOptions:', JSON.stringify(paymentOptions, null, 2));

    try {
        const payment = await wixPayBackend.createPayment(paymentOptions);
        console.log('[createWorkshopPayment] Payment created successfully:', payment?.id);
        return payment;
    } catch (payError) {
        console.error('[createWorkshopPayment] createPayment failed:', payError?.message || payError);
        console.error('[createWorkshopPayment] Full error:', JSON.stringify(payError, Object.getOwnPropertyNames(payError), 2));
        throw payError;
    }
});

// --- פונקציה 2: ביצוע הזמנה ---
// export const executeBooking = webMethod(Permissions.Anyone, async (bookingRequest) => {
//     console.log('[executeBooking] Received:', JSON.stringify(bookingRequest, null, 2));

//     const { slots, formFields, participants, paymentStatus, selectedProductAddOns, selectedProductAddOnIds } = bookingRequest;

//     // בדיקת תקינות
//     const slotsList = Array.isArray(slots) ? slots : [];

//     // תמיכה בפורמט חדש (עם quantities) ובפורמט ישן (מערך IDs בלבד)
//     let addOnsList;
//     if (Array.isArray(selectedProductAddOns) && selectedProductAddOns.length > 0) {
//         // פורמט חדש: [{ addOnId, quantity }]
//         addOnsList = selectedProductAddOns;
//     } else if (Array.isArray(selectedProductAddOnIds) && selectedProductAddOnIds.length > 0) {
//         // פורמט ישן: [addOnId, addOnId, ...]
//         addOnsList = selectedProductAddOnIds.map(id => ({ addOnId: id, quantity: 1 }));
//     } else {
//         addOnsList = [];
//     }

//     if (slotsList.length === 0) {
//         console.error('[executeBooking] No slots provided');
//         return { success: false, error: 'No slots provided for booking' };
//     }

//     // חילוץ פרטי קשר מ-formFields
//     const nameParts = (formFields?.full_name || '').split(/\s+/).filter(Boolean);
//     const firstName = nameParts[0] || 'אורח';
//     const lastName = nameParts.slice(1).join(' ') || '';
//     const rawPhone = formFields?.phone || '';
//     const phone = normalizeIsraeliPhone(rawPhone);
//     const email = formFields?.email || '';

//     // קביעת סטטוס ההזמנה והתשלום לפי תוצאת Wix Pay
//     // Successful = תשלום אונליין מאושר -> CONFIRMED + PAID + ONLINE
//     // Offline = תשלום במקום -> CONFIRMED + NOT_PAID + OFFLINE
//     // Pending = כרטיס אשראי טרם אושר סופית -> PENDING + NOT_PAID + ONLINE
//     const isOnlinePaid = paymentStatus === 'Successful';
//     const isOffline = paymentStatus === 'Offline';
//     const bookingStatus = (isOnlinePaid || isOffline) ? 'CONFIRMED' : 'PENDING';
//     const bookingPaymentStatus = isOnlinePaid ? 'PAID' : 'NOT_PAID';
//     const bookingPaymentOption = isOffline ? 'OFFLINE' : 'ONLINE';

//     console.log(`[executeBooking] Payment: ${paymentStatus} -> Booking status: ${bookingStatus}, Payment status: ${bookingPaymentStatus}`);

//     // בניית bookedAddOns מה-Add-On IDs שנבחרו (עם כמויות)
//     // לפי ה-API: כל bookedAddOn צריך לכלול _id (מזהה ה-Add-On), groupId ו-quantity
//     const bookedAddOns = addOnsList.length > 0 ? addOnsList.map(addOn => ({
//         _id: addOn.addOnId,
//         groupId: ADDON_GROUP_ID,
//         quantity: addOn.quantity || 1
//     })) : undefined;

//     if (bookedAddOns) {
//         console.log('[executeBooking] Including add-ons:', bookedAddOns);
//     }

//     // לוג ה-slots שמגיעים כדי לאבחן בעיית sessionId
//     console.log('[executeBooking] Raw slots:', JSON.stringify(slotsList, null, 2));

//     // כמות משתתפים
//     const numParticipants = parseInt(participants) || 1;

//     // optionId לסוג משתתפים (השאלה "כמה תהיו?")
//     const PARTICIPANTS_OPTION_ID = '0c5590ec-bf2b-4c78-9839-8a6f7f6ffe0b';

//     // מידע מלא לכל סוג משתתפים (מתוך serviceOptionsAndVariants של השירות)
//     // כל variant כולל: id (choice id), custom (שם הבחירה), variantId (id של ה-variant)
//     const PARTICIPANT_CHOICES = {
//         1: { id: 'd8ab598e-f32a-43f8-a688-fe35feb28c0a', custom: 'יחיד' },
//         2: { id: '499cbaf0-da94-4422-b873-c6b33383cfe7', custom: 'זוג' },
//         3: { id: 'c0da9126-f6c1-43e4-8db2-0863fd085eb9', custom: 'שלישייה' }
//     };
//     const selectedChoice = PARTICIPANT_CHOICES[numParticipants] || PARTICIPANT_CHOICES[1];

//     // בניית מבנה נכון עבור bulkCreateBooking לפי Wix SDK
//     // עבור CLASS - לפי הדוקומנטציה, מספיק לשלוח רק sessionId + timezone
//     // המערכת מחשבת אוטומטית את scheduleId, serviceId, startDate, endDate
//     const createBookingsInfo = slotsList.map((slot, index) => {
//         const sessionId = slot.sessionId || slot._id || slot.id || slot.slot_id;

//         console.log(`[executeBooking] Slot ${index}: sessionId=${sessionId}`);

//         // אם אין sessionId, לא ניתן ליצור הזמנה
//         if (!sessionId) {
//             console.error(`[executeBooking] Slot ${index} missing sessionId!`);
//         }

//         // bookedEntity.slot - רק sessionId + timezone (שאר השדות מחושבים אוטומטית)
//         const slotData = {
//             sessionId: sessionId,
//             timezone: 'Asia/Jerusalem'
//         };

//         const booking = {
//             bookedEntity: {
//                 slot: slotData
//             },
//             contactDetails: {
//                 firstName: firstName,
//                 lastName: lastName,
//                 email: email,
//                 phone: phone,
//                 countryCode: 'IL',
//                 fullAddress: {
//                     streetAddress: {
//                         number: '19',
//                         name: 'Shalma Rd'
//                     },
//                     city: 'Tel-Aviv',
//                     subdivision: 'IL',
//                     country: 'IL',
//                     postalCode: '0000000',
//                     formattedAddress: '19 Shalma Rd, Tel-Aviv, Israel'
//                 }
//             },
//             // formSubmission - מקשר את ההזמנה לטופס הייעודי של הנגריה הפתוחה
//             // Wix Bookings מאכלס אוטומטית את contactDetails לפי נתוני הטופס
//             formSubmission: {
//                 formId: '711d8d3e-23da-4874-985b-b32b6704bbb7',
//                 firstName: firstName,
//                 lastName: lastName,
//                 email: email,
//                 phone: phone
//             },
//             // בחירת סוג משתתפים (variant) — participantsChoices ו-totalParticipants הם oneOf
//             participantsChoices: {
//                 serviceChoices: [{
//                     choices: [{
//                         optionId: PARTICIPANTS_OPTION_ID,  // מזהה השאלה "כמה תהיו?"
//                         custom: selectedChoice.custom      // "יחיד" / "זוג" / "שלישייה"
//                     }],
//                     numberOfParticipants: numParticipants
//                 }]
//             },
//             // status: CONFIRMED - ציון מפורש; Wix Pay הוא custom payment flow ולכן
//             // אין auto-confirm מ-eCommerce, ולכן מציינים ישירות CONFIRMED
//             status: 'CONFIRMED',
//             // selectedPaymentOption - לא נדרש ב-custom checkout (Wix Pay)
//             // לפי הדוקומנטציה: "For custom checkouts, you don't have to specify this field"
//             // paymentStatus יוגדר לאחר יצירת ההזמנה דרך confirmOrDeclineBooking
//             // שליחת תזכורת SMS 24 שעות לפני המפגש
//             sendSmsReminder: true,
//             // התראה למשתתף (SMS + EMAIL)
//             participantNotification: {
//                 notifyParticipants: true,
//                 message: '',
//                 metadata: { channels: "EMAIL, SMS" }
//             }
//         };

//         // הוספת Add-Ons אם קיימים
//         if (bookedAddOns && bookedAddOns.length > 0) {
//             booking.bookedAddOns = bookedAddOns;
//         }

//         return {
//             booking: booking,
//             flowControlSettings: {
//                 skipAvailabilityValidation: false,
//                 skipBusinessConfirmation: true,
//                 // עוקפים ולידציית Add-Ons כך שאפשר להשתמש ב-Add-Ons שלא משויכים לקבוצה / חורגים מגבולותיה
//                 skipAddOnValidation: true
//             }
//         };
//     });

//     console.log('[executeBooking] ========== FULL BOOKING REQUEST ==========');
//     console.log('[executeBooking] Contact Details:', JSON.stringify({
//         firstName,
//         lastName,
//         email,
//         phone,
//         countryCode: 'IL'
//     }, null, 2));
//     console.log('[executeBooking] Participants:', numParticipants, '-> choice:', JSON.stringify(selectedChoice));
//     console.log('[executeBooking] Booking Status: CONFIRMED (explicit) | paymentStatus after confirm:', bookingPaymentStatus);
//     console.log('[executeBooking] createBookingsInfo:', JSON.stringify(createBookingsInfo, null, 2));
//     console.log('[executeBooking] ==========================================');

//     const elevatedBulkCreateBooking = auth.elevate(bookings.bulkCreateBooking);
//     const elevatedConfirmOrDecline = auth.elevate(bookings.confirmOrDeclineBooking);

//     try {
//         // שלב 1: יצירת ההזמנות עם status=CONFIRMED מפורש (Wix Pay = custom flow)
//         // paymentStatus יוגדר בשלב 2 דרך confirmOrDeclineBooking
//         const result = await elevatedBulkCreateBooking(createBookingsInfo, { returnFullEntity: true });

//         console.log('[executeBooking] ========== BULK CREATE RESULT ==========');
//         console.log('[executeBooking] Result:', JSON.stringify(result, null, 2));

//         // שלב 2: עדכון paymentStatus דרך confirmOrDeclineBooking
//         // מדלגים על הזמנות שכבר CONFIRMED (כי שלחנו status=CONFIRMED ביצירה)
//         // ומשתמשים ב-confirm רק לעדכון paymentStatus
//         const confirmResults = [];
//         if (result?.results) {
//             for (const res of result.results) {
//                 if (res.itemMetadata?.success && res.itemMetadata?._id) {
//                     const bookingId = res.itemMetadata._id;

//                     // לוג מפורט של ה-booking שנוצר
//                     const createdBooking = res.item?.booking || res.item;
//                     console.log(`[executeBooking] Created booking ${bookingId} details:`, JSON.stringify({
//                         status: createdBooking?.status,
//                         paymentStatus: createdBooking?.paymentStatus,
//                         selectedPaymentOption: createdBooking?.selectedPaymentOption,
//                         participantsChoices: createdBooking?.participantsChoices,
//                         contactDetails: createdBooking?.contactDetails
//                     }, null, 2));

//                     // אם ההזמנה כבר CONFIRMED — רק מעדכנים paymentStatus ישירות
//                     // confirmOrDeclineBooking על CONFIRMED booking יכשל עם INVALID_BOOKING_STATUS
//                     const createdStatus = createdBooking?.status;
//                     console.log(`[executeBooking] Booking ${bookingId} created with status="${createdStatus}", will attempt confirmOrDecline with paymentStatus="${bookingPaymentStatus}"`);

//                     try {
//                         const confirmed = await elevatedConfirmOrDecline(bookingId, {
//                             paymentStatus: bookingPaymentStatus  // PAID / NOT_PAID
//                         });
//                         console.log(`[executeBooking] Booking ${bookingId} confirmOrDecline succeeded:`, JSON.stringify({
//                             status: confirmed?.booking?.status,
//                             paymentStatus: confirmed?.booking?.paymentStatus
//                         }, null, 2));
//                         confirmResults.push({ bookingId, success: true, confirmed });
//                     } catch (confirmErr) {
//                         const errDetails = confirmErr?.details?.applicationError?.code || confirmErr?.message || confirmErr;
//                         console.error(`[executeBooking] confirmOrDecline failed for ${bookingId} (createdStatus="${createdStatus}"):`, JSON.stringify(confirmErr, Object.getOwnPropertyNames(confirmErr), 2));

//                         // אם הסטטוס שנוצר הוא CONFIRMED וה-API מסרב — ההזמנה עצמה כבר תקינה
//                         if (createdStatus === 'CONFIRMED') {
//                             console.log(`[executeBooking] Booking ${bookingId} is already CONFIRMED — skipping confirmOrDecline, treating as success`);
//                             confirmResults.push({ bookingId, success: true, skippedConfirm: true, note: 'already CONFIRMED at creation' });
//                         } else {
//                             console.error(`[executeBooking] Booking ${bookingId} NOT confirmed, error code: ${errDetails}`);
//                             confirmResults.push({ bookingId, success: false, error: errDetails });
//                         }
//                     }
//                 }
//             }
//         }

//         console.log('[executeBooking] ========== CONFIRMATION SUMMARY ==========');
//         console.log(`[executeBooking] Total created: ${result?.bulkActionMetadata?.totalSuccesses || 0}`);
//         console.log(`[executeBooking] Total confirmed (or already CONFIRMED): ${confirmResults.filter(r => r.success).length}`);
//         console.log(`[executeBooking] Total failed: ${confirmResults.filter(r => !r.success).length}`);
//         console.log('[executeBooking] Confirm results:', JSON.stringify(confirmResults.map(r => ({
//             bookingId: r.bookingId,
//             success: r.success,
//             skippedConfirm: r.skippedConfirm || false,
//             note: r.note || null,
//             error: r.error || null
//         })), null, 2));
//         console.log('[executeBooking] ==========================================');

//         return { 
//             success: true, 
//             result,
//             confirmResults,
//             paymentStatus: paymentStatus || 'Successful'
//         };
//     } catch (error) {
//         console.error("[executeBooking] ========== ERROR ==========");
//         console.error("[executeBooking] Error message:", error.message);
//         console.error("[executeBooking] Error details:", JSON.stringify(error, null, 2));
//         console.error("[executeBooking] ===========================");
//         return { success: false, error: error.message };
//     }
// });

// --- פונקציה 3: סנכרון מוצרים ל-AddOns ---
export const syncCmsProductToAddOn = webMethod(Permissions.Admin, async (productData) => {
    let addOnId = productData.addOnId;
    const addOnInfo = {
        name: `${productData.title} (${productData.woodType || 'כללי'})`,
        mandatory: false,
        price: 0
    };

    const elevatedUpdateAddOn = auth.elevate(addOns.updateAddOn);
    const elevatedCreateAddOn = auth.elevate(addOns.createAddOn);

    try {
        if (addOnId) {
            await elevatedUpdateAddOn(addOnId, addOnInfo);
        } else {
            const newAddOn = await elevatedCreateAddOn(addOnInfo);
            addOnId = newAddOn._id;
            const toUpdate = { ...productData, addOnId: addOnId };
            await wixData.update('bookingProducts', toUpdate);

            // עדכון קבוצת ה-Add-Ons בשירות אחרי יצירת add-on חדש
            await refreshAddOnsGroup();
            console.log(`[syncCmsProductToAddOn] Add-ons group updated successfully`);
        }
        return addOnId;
    } catch (err) {
        console.error("Sync Error", err);
        throw err;
    }
});

// --- פונקציה עזר: המרת מחיר לפורמט Money ---
function formatPrice(price) {
    const value = Number(price) || 0;
    return {
        currency: "ILS",
        value: value.toFixed(2) // עד 2 ספרות עשרוניות
    };
}

/**
 * פונקציה פנימית: רענון רשימת ה-Add-Ons בקבוצת השירות.
 * שולפת את כל ה-addOnId מה-CMS ומעדכנת את ה-group בקריאת SET.
 */
async function refreshAddOnsGroup() {
    try {
        // שליפת כל המוצרים שיש להם addOnId
        const productsWithAddOns = await wixData.query('bookingProducts')
            .isNotEmpty('addOnId')
            .find();

        const allAddOnIds = productsWithAddOns.items
            .map(p => p.addOnId)
            .filter(id => id && typeof id === 'string' && id.trim() !== '');

        console.log(`[refreshAddOnsGroup] Found ${allAddOnIds.length} add-on IDs to assign to group`);

        if (allAddOnIds.length === 0) {
            console.log('[refreshAddOnsGroup] No add-on IDs found, skipping group update');
            return;
        }

        if (allAddOnIds.length > 7) {
            console.warn(`[refreshAddOnsGroup] WARNING: ${allAddOnIds.length} add-ons exceed the maxItems limit of 7. Only the first 7 will be assigned.`);
        }

        const elevatedSetAddOnsForGroup = auth.elevate(services.setAddOnsForGroup);
        await elevatedSetAddOnsForGroup(SERVICE_ID, {
            addOnIds: allAddOnIds.slice(0, 7),
            groupId: ADDON_GROUP_ID
        });

        console.log(`[refreshAddOnsGroup] Successfully updated group ${ADDON_GROUP_ID} with ${Math.min(allAddOnIds.length, 7)} add-ons`);
    } catch (error) {
        console.error('[refreshAddOnsGroup] Error updating add-ons group:', error);
        throw error;
    }
}

// --- פונקציה 4: סנכרון חד-פעמי של כל המוצרים ל-Add-Ons ---
export const bulkSyncProductsToAddOns = webMethod(Permissions.Admin, async () => {
    try {
        console.log('[bulkSyncProductsToAddOns] Starting bulk sync...');

        // 1. שאילתה למוצרים עם תג "סדנה פתוחה" שאין להם addOnId
        const productsQuery = await wixData.query('bookingProducts')
            .hasSome('tags', ['סדנה פתוחה'])
            .find();

        // סינון ידני - רק מוצרים שאין להם addOnId
        const productsToSync = productsQuery.items.filter(p => !p.addOnId || p.addOnId === null || p.addOnId === '');

        if (productsToSync.length === 0) {
            console.log('[bulkSyncProductsToAddOns] No products to sync');
            return {
                success: true,
                created: 0,
                updated: 0,
                errors: []
            };
        }

        console.log(`[bulkSyncProductsToAddOns] Found ${productsToSync.length} products to sync`);

        // 2. המרת מוצרים למבנה Add-On
        const addOnsToCreate = productsToSync.map(product => {
            const productName = product.productName || product.title || 'מוצר ללא שם';
            return {
                name: productName,
                price: formatPrice(product.price),
                maxQuantity: 5
            };
        });

        // 3. יצירת Add-Ons ב-bulk עם returnEntity: true כדי לקבל את ה-Add-Ons בחזרה
        const elevatedBulkCreateAddOns = auth.elevate(addOns.bulkCreateAddOns);
        const result = await elevatedBulkCreateAddOns(addOnsToCreate, { returnEntity: true });

        console.log('[bulkSyncProductsToAddOns] Bulk create result:', JSON.stringify(result, null, 2));
        console.log(`[bulkSyncProductsToAddOns] Total results: ${(result.results || []).length}`);
        console.log(`[bulkSyncProductsToAddOns] Results with items: ${(result.results || []).filter(r => r.item).length}`);

        // טיפול בשגיאות מה-bulkActionMetadata
        const errors = [];
        if (result.bulkActionMetadata?.totalFailures > 0) {
            console.error(`[bulkSyncProductsToAddOns] ${result.bulkActionMetadata.totalFailures} add-ons failed to create`);
            // הוספת שגיאות מה-bulkActionMetadata
            const failedResults = (result.results || []).filter(r => !r.item || r.itemMetadata?.success === false);
            failedResults.forEach((failedItem, index) => {
                const originalIndex = failedItem.itemMetadata?.originalIndex ?? index;
                const product = originalIndex !== undefined && originalIndex >= 0 && originalIndex < productsToSync.length ?
                    productsToSync[originalIndex] :
                    null;
                errors.push({
                    productId: product?._id || null,
                    originalIndex: originalIndex,
                    error: failedItem.itemMetadata?.error?.message || failedItem.itemMetadata?.error || 'Failed to create add-on'
                });
            });
        }

        // פילטר תוצאות מוצלחות - אם יש item, זה אומר שהתוצאה הצליחה
        // אם יש itemMetadata, נבדוק את success, אחרת נניח שהתוצאה הצליחה אם יש item
        const successfulResults = (result.results || []).filter(r => {
            if (!r.item) return false; // אין item = כשלון
            if (r.itemMetadata && r.itemMetadata.success === false) return false; // יש itemMetadata עם success=false = כשלון
            return true; // יש item ו-(אין itemMetadata או success !== false) = הצלחה
        });
        console.log(`[bulkSyncProductsToAddOns] Created ${successfulResults.length} add-ons successfully (out of ${(result.results || []).length} total results)`);

        // 4. עדכון רשומות ב-CMS עם addOnId - התאמה לפי name ו-originalIndex
        const updatePromises = [];
        let updatedCount = 0;

        for (let i = 0; i < successfulResults.length; i++) {
            const resultItem = successfulResults[i];
            const createdAddOn = resultItem.item;
            // שימוש ב-originalIndex מ-itemMetadata אם קיים, אחרת נחפש לפי אינדקס ב-result.results
            let originalIndex = resultItem.itemMetadata?.originalIndex;
            if (originalIndex === undefined) {
                // אם אין originalIndex ב-itemMetadata, נשתמש באינדקס של resultItem בתוך result.results
                const indexInResults = result.results.findIndex(r => r === resultItem);
                originalIndex = indexInResults >= 0 ? indexInResults : undefined;
            }

            // לוג לניפוי באגים
            console.log(`[bulkSyncProductsToAddOns] Processing result item ${i}:`, {
                originalIndex,
                addOnId: createdAddOn._id || createdAddOn.id,
                addOnName: createdAddOn.name,
                addOnObject: JSON.stringify(createdAddOn, null, 2)
            });

            // מציאת המוצר המתאים לפי אינדקס מקורי או לפי שם
            let matchingProduct;
            if (originalIndex !== undefined && originalIndex >= 0 && originalIndex < productsToSync.length) {
                matchingProduct = productsToSync[originalIndex];
            } else {
                // fallback - חיפוש לפי שם
                matchingProduct = productsToSync.find(p => {
                    const productName = p.productName || p.title || '';
                    return productName === createdAddOn.name;
                });
            }

            // בדיקה גם של _id וגם של id (תלוי בפורמט שהחזיר ה-API)
            const addOnId = createdAddOn._id || createdAddOn.id;

            if (matchingProduct && addOnId) {
                try {
                    console.log(`[bulkSyncProductsToAddOns] Updating product ${matchingProduct._id} with addOnId: ${addOnId}`);
                    // שליפת הרשומה המלאה לפני עדכון כדי לא לאבד מידע
                    const fullProduct = await wixData.get('bookingProducts', matchingProduct._id);
                    await wixData.update('bookingProducts', {
                        ...fullProduct,
                        addOnId: addOnId
                    });
                    updatedCount++;
                    updatePromises.push(matchingProduct._id);
                    console.log(`[bulkSyncProductsToAddOns] Successfully updated product ${matchingProduct._id}`);
                } catch (updateError) {
                    console.error(`[bulkSyncProductsToAddOns] Failed to update product ${matchingProduct._id}:`, updateError);
                    errors.push({
                        productId: matchingProduct._id,
                        addOnId: addOnId,
                        error: updateError.message || 'Failed to update CMS'
                    });
                }
            } else {
                const missingInfo = {
                    hasMatchingProduct: !!matchingProduct,
                    hasAddOnId: !!addOnId,
                    addOnId: addOnId,
                    productId: matchingProduct?._id || null
                };
                console.warn(`[bulkSyncProductsToAddOns] No matching product or addOnId missing:`, missingInfo);
                errors.push({
                    productId: matchingProduct?._id || null,
                    addOnId: addOnId || null,
                    originalIndex: originalIndex,
                    error: `No matching product found or missing addOnId for add-on: ${createdAddOn.name}`
                });
            }
        }

        // 5. עדכון קבוצת ה-Add-Ons בשירות
        try {
            await refreshAddOnsGroup();
            console.log('[bulkSyncProductsToAddOns] Add-ons group updated successfully');
        } catch (groupError) {
            console.error('[bulkSyncProductsToAddOns] Failed to update add-ons group:', groupError);
            errors.push({
                productId: null,
                error: `Failed to update add-ons group: ${groupError.message || 'Unknown error'}`
            });
        }

        const finalResult = {
            success: true,
            created: successfulResults.length,
            updated: updatedCount,
            errors: errors
        };

        console.log('[bulkSyncProductsToAddOns] Final result:', JSON.stringify(finalResult, null, 2));

        return finalResult;

    } catch (error) {
        console.error('[bulkSyncProductsToAddOns] Error:', error);
        return {
            success: false,
            created: 0,
            updated: 0,
            errors: [{ error: error.message || 'Unknown error' }]
        };
    }
});

// --- פונקציה 5: סנכרון מוצר בודד ל-Add-On ---
export const syncNewProductToAddOn = webMethod(Permissions.Admin, async (productId) => {
    try {
        console.log(`[syncNewProductToAddOn] Syncing product ${productId}...`);

        // 1. שליפת המוצר מ-CMS
        const product = await wixData.get('bookingProducts', productId);

        if (!product) {
            throw new Error(`Product ${productId} not found`);
        }

        // 2. בדיקה שיש תג "סדנה פתוחה" ואין addOnId
        const hasTag = product.tags && Array.isArray(product.tags) && product.tags.includes('סדנה פתוחה');

        if (!hasTag) {
            throw new Error('Product does not have "סדנה פתוחה" tag');
        }

        if (product.addOnId) {
            console.log(`[syncNewProductToAddOn] Product ${productId} already has addOnId: ${product.addOnId}`);
            return product.addOnId;
        }

        // 3. יצירת Add-On בודד
        const productName = product.productName || product.title || 'מוצר ללא שם';
        const addOnInfo = {
            name: productName,
            price: formatPrice(product.price),
            maxQuantity: 5
        };

        const elevatedCreateAddOn = auth.elevate(addOns.createAddOn);
        const newAddOn = await elevatedCreateAddOn(addOnInfo);

        console.log(`[syncNewProductToAddOn] Created add-on ${newAddOn._id} for product ${productId}`);

        // 4. עדכון הרשומה ב-CMS עם addOnId (שימוש ב-spread כדי לא לאבד מידע)
        await wixData.update('bookingProducts', {
            ...product,
            addOnId: newAddOn._id
        });

        // 5. עדכון קבוצת ה-Add-Ons בשירות
        await refreshAddOnsGroup();
        console.log(`[syncNewProductToAddOn] Add-ons group updated successfully`);

        return newAddOn._id;

    } catch (error) {
        console.error(`[syncNewProductToAddOn] Error for product ${productId}:`, error);
        throw error;
    }
});

// --- פונקציה 6: עדכון Add-On כשמחיר/שם משתנים ---
export const updateProductAddOn = webMethod(Permissions.Admin, async (productId) => {
    try {
        console.log(`[updateProductAddOn] Updating add-on for product ${productId}...`);

        // 1. שליפת המוצר מ-CMS
        const product = await wixData.get('bookingProducts', productId);

        if (!product) {
            throw new Error(`Product ${productId} not found`);
        }

        // 2. בדיקה שיש addOnId
        if (!product.addOnId) {
            throw new Error(`Product ${productId} does not have addOnId. Use syncNewProductToAddOn instead.`);
        }

        // 3. עדכון Add-On עם הנתונים המעודכנים
        const productName = product.productName || product.title || 'מוצר ללא שם';
        const addOnInfo = {
            name: productName,
            price: formatPrice(product.price),
            maxQuantity: 5
        };

        const elevatedUpdateAddOn = auth.elevate(addOns.updateAddOn);
        await elevatedUpdateAddOn(product.addOnId, addOnInfo);

        console.log(`[updateProductAddOn] Updated add-on ${product.addOnId} for product ${productId}`);

        return product.addOnId;

    } catch (error) {
        console.error(`[updateProductAddOn] Error for product ${productId}:`, error);
        throw error;
    }
});

// --- פונקציה 7: מחיקת Add-On ---
export const deleteProductAddOn = webMethod(Permissions.Admin, async (productId) => {
    try {
        console.log(`[deleteProductAddOn] Deleting add-on for product ${productId}...`);

        // 1. שליפת המוצר מ-CMS
        const product = await wixData.get('bookingProducts', productId);

        if (!product) {
            throw new Error(`Product ${productId} not found`);
        }

        // 2. בדיקה שיש addOnId
        if (!product.addOnId) {
            console.log(`[deleteProductAddOn] Product ${productId} does not have addOnId, nothing to delete`);
            return null;
        }

        // 3. מחיקת Add-On
        const elevatedDeleteAddOn = auth.elevate(addOns.deleteAddOn);
        await elevatedDeleteAddOn(product.addOnId);

        console.log(`[deleteProductAddOn] Deleted add-on ${product.addOnId} for product ${productId}`);

        // 4. עדכון הרשומה ב-CMS להסרת addOnId (שימוש ב-spread כדי לא לאבד מידע)
        await wixData.update('bookingProducts', {
            ...product,
            addOnId: null
        });

        // 5. עדכון קבוצת ה-Add-Ons בשירות (ה-add-on שנמחק לא יופיע ברשימה)
        await refreshAddOnsGroup();
        console.log(`[deleteProductAddOn] Add-ons group updated successfully`);

        return product.addOnId;

    } catch (error) {
        console.error(`[deleteProductAddOn] Error for product ${productId}:`, error);
        throw error;
    }
});

// --- פונקציה חד-פעמית: עדכון קבוצת Add-Ons עם add-ons חדשים (חוץ מ-7 קיימים) ---
export const updateAddOnsGroupWithNewOnes = webMethod(Permissions.Admin, async () => {
    try {
        console.log('[updateAddOnsGroupWithNewOnes] Starting to update group with new add-ons...');

        // רשימת ה-7 add-ons שכבר נמצאים בקבוצה (לא נוסיף אותם שוב)
        const existingAddOnIds = [
            "031d2bd9-47f7-479f-bb29-0eef82b655db",
            "0a08b33d-d1da-4cd3-9622-966ab45f73a0",
            "0af52b26-e9c2-4327-964c-2ed5f9a449bd",
            "129454d4-a8ee-4572-b294-c146ee7e6819",
            "1306660c-28ad-4975-bd66-663bfc157ab9",
            "148e18d7-c0f9-425a-a6e2-0c80b8b8f3eb",
            "20c68e8c-15b6-4986-817b-427a8d45a72a"
        ];

        // 1. שליפת כל המוצרים שיש להם addOnId
        const productsWithAddOns = await wixData.query('bookingProducts')
            .isNotEmpty('addOnId')
            .find();

        const allAddOnIds = productsWithAddOns.items
            .map(p => p.addOnId)
            .filter(id => id && typeof id === 'string' && id.trim() !== '');

        console.log(`[updateAddOnsGroupWithNewOnes] Found ${allAddOnIds.length} total add-on IDs in CMS`);

        // 2. סינון - רק add-ons שלא נמצאים ב-7 הקיימים
        const newAddOnIds = allAddOnIds.filter(id => !existingAddOnIds.includes(id));

        console.log(`[updateAddOnsGroupWithNewOnes] Found ${newAddOnIds.length} new add-ons (excluding ${existingAddOnIds.length} existing ones)`);

        if (newAddOnIds.length === 0) {
            console.log('[updateAddOnsGroupWithNewOnes] No new add-ons to add');
            return {
                success: true,
                message: 'No new add-ons to add',
                existingCount: existingAddOnIds.length,
                newCount: 0,
                totalCount: allAddOnIds.length
            };
        }

        // 3. בגלל מגבלה של 7 פר קבוצה, ניקח את ה-7 הראשונים מה-newAddOnIds
        const addOnIdsToAdd = newAddOnIds.slice(0, 7);

        if (newAddOnIds.length > 7) {
            console.warn(`[updateAddOnsGroupWithNewOnes] WARNING: ${newAddOnIds.length} new add-ons exceed the maxItems limit of 7. Only the first 7 will be added.`);
        }

        // 4. עדכון הקבוצה עם ה-add-ons החדשים
        const elevatedSetAddOnsForGroup = auth.elevate(services.setAddOnsForGroup);
        await elevatedSetAddOnsForGroup(SERVICE_ID, {
            addOnIds: addOnIdsToAdd,
            groupId: ADDON_GROUP_ID
        });

        console.log(`[updateAddOnsGroupWithNewOnes] Successfully updated group ${ADDON_GROUP_ID} with ${addOnIdsToAdd.length} new add-ons`);

        return {
            success: true,
            message: `Updated group with ${addOnIdsToAdd.length} new add-ons`,
            existingCount: existingAddOnIds.length,
            newCount: addOnIdsToAdd.length,
            totalNewAvailable: newAddOnIds.length,
            addedAddOnIds: addOnIdsToAdd,
            skippedAddOnIds: newAddOnIds.length > 7 ? newAddOnIds.slice(7) : []
        };

    } catch (error) {
        console.error('[updateAddOnsGroupWithNewOnes] Error:', error);
        throw error;
    }
});

// --- פונקציה 8: קבלת זמינות קורס ---
// עבור קורסים ב-Wix Bookings, ה-availability API לא עובד
// יש לחשב ידנית את הזמינות על סמך הקיבולת והזמנות קיימות

export const getCourseAvailability = webMethod(Permissions.Anyone, async () => {
    try {
        // 1. שליפת פרטי השירות כדי לקבל defaultCapacity ו-scheduleId
        const elevatedGetService = auth.elevate(services.getService);
        const service = await elevatedGetService(SERVICE_ID);

        const defaultCapacity = service.onlineBooking?.numberOfParticipants?.defaultCapacity || 10;
        const scheduleId = service.schedule?.id;

        if (!scheduleId) {
            return {
                remainingSpots: defaultCapacity,
                defaultCapacity,
                totalBookedParticipants: 0,
                isAvailable: true
            };
        }

        // 2. שליפת כל ה-bookings הקיימים של הקורס
        const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);

        const queryResult = await elevatedQuery({
            filter: {
                "bookedEntity.item.schedule.serviceId": SERVICE_ID,
                "status": { $in: ["CONFIRMED", "PENDING"] }
            }
        });

        // 3. חישוב סה"כ המשתתפים שכבר נרשמו
        const currentBookings = queryResult.items || [];
        const totalBookedParticipants = currentBookings.reduce((acc, booking) => {
            // לבדוק במספר מיקומים אפשריים לפי המבנה של ה-API
            const participants =
                booking.booking?.bookedEntity?.numberOfParticipants ||
                booking.bookedEntity?.numberOfParticipants ||
                booking.attendance?.numberOfAttendees ||
                1;
            return acc + participants;
        }, 0);

        // 4. חישוב המקומות הפנויים
        const remainingSpots = defaultCapacity - totalBookedParticipants;
        const isAvailable = remainingSpots > 0;

        return {
            remainingSpots,
            defaultCapacity,
            totalBookedParticipants,
            isAvailable,
            currentBookings: currentBookings.length
        };
    } catch (error) {
        // במקרה של שגיאה, נחזיר זמינות ברירת מחדל
        return {
            remainingSpots: 0,
            defaultCapacity: 0,
            totalBookedParticipants: 0,
            isAvailable: false,
            error: error.message
        };
    }
});

// --- פונקציה 5: שליפת Slots זמינים של CLASS ---
// משתמש ב-availabilityCalendar.queryAvailability מ-wix-bookings.v2
// מסנן לפי: bookable, locked, tooLateToBook
// מחזיר openSpots כדי שהפרונטנד יוכל לסנן לפי כמות משתתפים

export const getCourseSessions = webMethod(Permissions.Anyone, async (dateRangeStart, dateRangeEnd, serviceIds) => {
    try {
        const startDate = new Date(dateRangeStart);
        const endDate = new Date(dateRangeEnd);

        const options = {
            slotsPerDay: 50
        };

        // קריאה לכל השירותים הרלוונטיים במקביל (טאפטינג כברירת מחדל, או serviceIds חלופי כמו נרות)
        const targetServiceIds = Array.isArray(serviceIds) && serviceIds.length > 0 ?
            serviceIds :
            Object.values(TUFTING_SERVICE_IDS);
        const allResults = await Promise.all(
            targetServiceIds.map(async (serviceId) => {
                try {
                    const query = {
                        filter: {
                            serviceId: serviceId,
                            startDate: startDate.toISOString(),
                            endDate: endDate.toISOString()
                        }
                    };
                    const availability = await availabilityCalendar.queryAvailability(query, options);
                    return { serviceId, entries: availability.availabilityEntries || [] };
                } catch (err) {
                    console.error(`Error fetching availability for service ${serviceId}:`, err);
                    return { serviceId, entries: [] };
                }
            })
        );

        // איחוד כל התוצאות
        const allEntries = [];
        for (const result of allResults) {
            for (const entry of result.entries) {
                allEntries.push({ ...entry, _serviceId: result.serviceId });
            }
        }

        // סינון לפי הקריטריונים
        const filteredEntries = allEntries.filter(entry => {
            if (!entry.bookable) return false;
            if (entry.locked) return false;
            if (entry.bookingPolicyViolations?.tooLateToBook) return false;
            if (!entry.openSpots || entry.openSpots <= 0) return false;
            return true;
        });

        // המרת המבנה לפורמט שהפרונטנד מצפה לו
        const availableSlots = filteredEntries.map(entry => {
            const slot = entry.slot || {};
            const serviceId = slot.serviceId || entry._serviceId;

            const startDateObj = slot.startDate ? new Date(slot.startDate) : null;
            const endDateObj = slot.endDate ? new Date(slot.endDate) : null;

            return {
                _id: slot.sessionId || slot.eventId,
                sessionId: slot.sessionId,
                start: startDateObj ? {
                    timestamp: slot.startDate,
                    localDateTime: toIsraelLocalDateTime(startDateObj)
                } : null,
                end: endDateObj ? {
                    timestamp: slot.endDate,
                    localDateTime: toIsraelLocalDateTime(endDateObj)
                } : null,
                scheduleId: slot.scheduleId,
                serviceId: serviceId,
                totalSpots: entry.totalSpots || 0,
                openSpots: entry.openSpots || 0,
                bookedParticipants: (entry.totalSpots || 0) - (entry.openSpots || 0),
                remainingSpots: entry.openSpots || 0,
                isAvailable: true,
                resource: slot.resource,
                location: slot.location,
                originalSlot: {
                    sessionId: slot.sessionId,
                    serviceId: serviceId,
                    scheduleId: slot.scheduleId,
                    startDate: slot.startDate,
                    endDate: slot.endDate,
                    resource: slot.resource,
                    location: slot.location
                }
            };
        });

        return availableSlots;
    } catch (error) {
        console.error("Error fetching class availability:", error);
        return [];
    }
});

/**
 * שליפת מחירי כרטיסים (יחיד / הורה+ילד) מ-Wix Bookings Variants API.
 * מחזיר:
 * {
 *   [serviceId]: {
 *     solo: number,          // מחיר כרטיס "יחיד"
 *     parentChild: number,   // מחיר כרטיס "הורה וילד"
 *     extraChild: number,    // מחיר "תוספת ילד על הורה וילד" (נרות בלבד; נופל חזרה למחיר parentChild אם לא הוגדר)
 *     minPrice: number,
 *     maxPrice: number,
 *     currency: string
 *   }
 * }
 */
async function _fetchServicePricingInternal(serviceIds) {
    const targetServiceIds = Array.isArray(serviceIds) && serviceIds.length > 0 ?
        serviceIds :
        Object.values(TUFTING_SERVICE_IDS);

    const query = {
        filter: { "serviceId": { "$in": targetServiceIds } }
    };

    const response = await serviceOptionsAndVariants.queryServiceOptionsAndVariants(query);
    const list = response?.serviceOptionsAndVariantsList || [];

    const result = {};
    // NOTE: EXTRA_CHILD_KEYWORDS must be checked before CHILD_KEYWORDS since
    // "תוספת ילד" also contains "ילד" and would otherwise be misclassified
    // as a regular parent+child variant.
    const EXTRA_CHILD_KEYWORDS = ['תוספת ילד'];
    const CHILD_KEYWORDS = ['הורה וילד', 'וילד', 'ילד'];
    const SOLO_KEYWORDS = ['יחיד'];

    for (const item of list) {
        if (!item?.serviceId) continue;

        const variants = item.variants?.values || [];
        let soloPrice = null;
        let parentChildPrice = null;
        let extraChildPrice = null;
        let soloChoice = null;
        let soloOptionId = null;
        let parentChildChoice = null;
        let parentChildOptionId = null;
        let extraChildChoice = null;
        let extraChildOptionId = null;

        for (const variant of variants) {
            const choiceLabel = variant.choices?.[0]?.custom || '';
            const optionId = variant.choices?.[0]?.optionId || null;
            const price = parseFloat(variant.price?.value);
            if (isNaN(price)) continue;

            const isExtraChild = EXTRA_CHILD_KEYWORDS.some(kw => choiceLabel.includes(kw));
            const isChild = !isExtraChild && CHILD_KEYWORDS.some(kw => choiceLabel.includes(kw));
            const isSolo = SOLO_KEYWORDS.some(kw => choiceLabel.includes(kw));

            if (isExtraChild && (extraChildPrice === null || price < extraChildPrice)) {
                extraChildPrice = price;
                extraChildChoice = choiceLabel;
                extraChildOptionId = optionId;
            }
            if (isChild && (parentChildPrice === null || price < parentChildPrice)) {
                parentChildPrice = price;
                parentChildChoice = choiceLabel;
                parentChildOptionId = optionId;
            }
            if (isSolo && (soloPrice === null || price < soloPrice)) {
                soloPrice = price;
                soloChoice = choiceLabel;
                soloOptionId = optionId;
            }
        }

        const minPrice = parseFloat(item.minPrice?.value) || soloPrice || 0;
        const maxPrice = parseFloat(item.maxPrice?.value) || parentChildPrice || minPrice;

        // Fallback: if only one variant type found, use it for both
        if (soloPrice === null && parentChildPrice !== null) soloPrice = parentChildPrice;
        if (parentChildPrice === null && soloPrice !== null) parentChildPrice = soloPrice;
        if (!soloChoice && parentChildChoice) {
            soloChoice = parentChildChoice;
            soloOptionId = parentChildOptionId;
        }
        if (!parentChildChoice && soloChoice) {
            parentChildChoice = soloChoice;
            parentChildOptionId = soloOptionId;
        }
        // No dedicated "extra child" ("תוספת ילד") variant configured for this
        // service — fall back to the solo price. "תוספת ילד" is priced like a
        // solo ticket (its own candle), never like the parent+child package.
        if (extraChildPrice === null) {
            extraChildPrice = soloPrice;
            extraChildChoice = soloChoice;
            extraChildOptionId = soloOptionId;
        }

        result[item.serviceId] = {
            solo: soloPrice || 0,
            parentChild: parentChildPrice || 0,
            extraChild: extraChildPrice || 0,
            soloChoice,
            soloOptionId,
            parentChildChoice,
            parentChildOptionId,
            extraChildChoice,
            extraChildOptionId,
            minPrice,
            maxPrice,
            currency: item.minPrice?.currency || 'ILS',
        };
    }

    console.log('[ServicePricing] Fetched variant pricing:', JSON.stringify(result));
    return result;
}

/** Internal: get cached or fresh pricing for a given group of serviceIds (defaults to Tufting). */
async function getServicePricingCached(serviceIds) {
    const targetServiceIds = Array.isArray(serviceIds) && serviceIds.length > 0 ?
        serviceIds :
        Object.values(TUFTING_SERVICE_IDS);
    const cacheKey = [...targetServiceIds].sort().join(',');

    const now = Date.now();
    const cached = _servicePricingCache.get(cacheKey);
    if (cached && (now - cached.at) < PRICING_CACHE_TTL_MS) {
        return cached.data;
    }
    const pricing = await _fetchServicePricingInternal(targetServiceIds);
    _servicePricingCache.set(cacheKey, { data: pricing, at: now });
    return pricing;
}

/**
 * Public API — שליפת מחירי כרטיסים לפי שירות.
 * מחזיר { [serviceId]: { solo, parentChild, minPrice, maxPrice, currency } }
 * @param {string[]} [serviceIds] - optional list of service IDs (e.g. CANDLES_SERVICE_IDS values); defaults to Tufting.
 */
export const getServicePricing = webMethod(Permissions.Anyone, async (serviceIds) => {
    try {
        const pricing = await getServicePricingCached(serviceIds);
        // "נר נוסף" — candles-only add-on price, not a Wix Bookings ticket
        // variant, so it doesn't come from _fetchServicePricingInternal.
        for (const [svcId, entry] of Object.entries(pricing)) {
            const extraCandleConfig = EXTRA_CANDLE_ADDON_BY_SERVICE[svcId];
            if (extraCandleConfig) {
                entry.extraCandle = extraCandleConfig.price || 0;
            }
        }
        return pricing;
    } catch (error) {
        console.error('[ServicePricing] Error:', error?.message || error);
        return {};
    }
});

// =====================================================================
// Workshop Orders & Participants API
// =====================================================================

const SA = { suppressAuth: true };
const SA_CONSISTENT = { suppressAuth: true, consistentRead: true };

/**
 * Fetches a WorkshopOrder by id via getItemWithRetry (see wixDataRetry.js):
 * normalizes missing items to null (instead of the raw Wix Data "Item [...]
 * does not exist" rejection), tags failures with the calling flow so they're
 * traceable in the logs, and retries once after 4s with consistentRead:true
 * before giving up.
 *
 * Delegates to orderReconciliation.js, which is also called directly (no
 * webMethod/RPC hop) from events.js and jobs.js — see that module for the
 * full backend-first reconciliation design.
 */
async function getWorkshopOrderSafe(orderId, callerLabel = 'getWorkshopOrderSafe') {
    return orderReconciliation.getWorkshopOrderSafe(orderId, callerLabel);
}

export const getOrderByToken = webMethod(Permissions.Anyone, async (token) => {
    return orderReconciliation.getOrderByToken(token);
});

export const getOrderByCheckoutId = webMethod(Permissions.Anyone, async (checkoutId) => {
    if (!checkoutId) throw new Error('checkoutId is required');
    return orderReconciliation.getOrderByCheckoutId(checkoutId);
});

export const getOrderByEcomOrderId = webMethod(Permissions.Anyone, async (ecomOrderId) => {
    return orderReconciliation.getOrderByEcomOrderId(ecomOrderId);
});

function phonesMatch(storedPhone, inputPhone) {
    if (!inputPhone) return true;
    if (!storedPhone) return true;
    const storedVariants = new Set(
        getPhoneLookupVariants(storedPhone).flatMap((v) => [v, normalizeIsraeliPhone(v)].filter(Boolean))
    );
    return getPhoneLookupVariants(inputPhone).some(
        (v) => storedVariants.has(v) || storedVariants.has(normalizeIsraeliPhone(v))
    );
}

export const getWorkshopOrderByBookingId = webMethod(Permissions.Anyone, async (bookingId) => {
    return orderReconciliation.getWorkshopOrderByBookingId(bookingId);
});

/**
 * Return every PAID order placed by this buyer (matched by phone and/or email),
 * newest first — used to power the "my orders" switcher on the Thank You page.
 * `excludeOrderId` omits the order currently being viewed.
 */
export const getOrderHistoryForBuyer = webMethod(Permissions.Anyone, async (phone, email, excludeOrderId) => {
    if (!phone && !email) return [];

    const byId = new Map();

    if (phone) {
        for (const variant of getPhoneLookupVariants(phone)) {
            const result = await wixData.query('WorkshopOrders')
                .eq('organizerPhone', variant)
                .eq('status', 'paid')
                .descending('_createdDate')
                .limit(50)
                .find(SA_CONSISTENT);
            result.items.forEach((item) => byId.set(item._id, item));
        }
    }

    if (email) {
        const result = await wixData.query('WorkshopOrders')
            .eq('organizerEmail', email)
            .eq('status', 'paid')
            .descending('_createdDate')
            .limit(50)
            .find(SA_CONSISTENT);
        result.items.forEach((item) => byId.set(item._id, item));
    }

    if (excludeOrderId) byId.delete(excludeOrderId);

    return [...byId.values()]
        .sort((a, b) => new Date(b._createdDate).getTime() - new Date(a._createdDate).getTime())
        .map((order) => ({
            _id: order._id,
            orderNumber: order.ecomOrderNumber || null,
            workshopStart: order.workshopStart || null,
            paidTotal: order.paidTotal || order.basePrice || 0,
            organizerName: order.organizerName || '',
            createdDate: order._createdDate,
        }));
});

// Last-resort match for the race condition where checkoutId/ecomOrderId
// hasn't been written to the WorkshopOrder yet by the time the Thank You
// page loads. MUST be restricted to orders not yet linked to ANY ecom order
// (isEmpty('ecomOrderId')) — otherwise a returning buyer who checks out for
// something unrelated (a different product/service, no WorkshopOrder of
// their own) gets wrongly matched to their OLD already-paid workshop order
// by phone/email alone, incorrectly showing them the post-payment iframe hub.
export const getWorkshopOrderByBuyerInfo = webMethod(Permissions.Anyone, async (phone, email) => {
    return orderReconciliation.getWorkshopOrderByBuyerInfo(phone, email);
});

/**
 * Kept as a webMethod purely for the Thank You page's optimistic UI path —
 * the actual authoritative write now happens in orderReconciliation.js,
 * triggered independently by the eCom payment event (events.js) and the
 * scheduled sweep job (jobs.js). This call is best-effort acceleration
 * only: if the customer never reaches the Thank You page (refresh, dropped
 * connection, closed tab), the order is still reconciled server-side.
 */
export const resolveWorkshopOrderFromEcom = webMethod(Permissions.Anyone, async (ecomOrder) => {
    const result = await orderReconciliation.reconcileEcomOrder(ecomOrder, { requirePaid: false });
    return {
        workshopOrder: result.workshopOrder,
        matchedBy: result.matchedBy,
        bookingIds: result.bookingIds || [],
    };
});

/**
 * Also best-effort/UI-acceleration only (see resolveWorkshopOrderFromEcom
 * above) — never trusts field values on a client-supplied `ecomOrderHint`
 * object, only its `_id` (as a hint of which order to re-fetch). The actual
 * buyer/paid/cup data always comes from a fresh, elevated, server-side
 * fetch of the real eCom order, and is only applied once verified to
 * actually correlate with this WorkshopOrder (matching checkoutId,
 * ecomOrderId, or a shared bookingId) — this guards against a forged or
 * mismatched orderId/ecomOrder pairing from the client.
 */
export const confirmOrderPayment = webMethod(Permissions.Anyone, async (orderId, ecomOrderHint) => {
    const order = await getWorkshopOrderSafe(orderId, 'confirmOrderPayment');
    if (!order) throw new Error('Order not found');

    const candidateEcomOrderId = order.ecomOrderId || ecomOrderHint?._id || null;
    let fullEcomOrder = candidateEcomOrderId ?
        await orderReconciliation.fetchFullEcomOrder(candidateEcomOrderId) :
        null;

    // Safety net: ecomOrderId was never written (e.g. an interrupted
    // checkout) but we do know the checkoutId — look the eCom order up by
    // that instead.
    if (!fullEcomOrder && order.checkoutId) {
        fullEcomOrder = await orderReconciliation.fetchEcomOrderByCheckoutId(order.checkoutId);
    }

    const correlated = !!fullEcomOrder && (
        fullEcomOrder.checkoutId === order.checkoutId ||
        fullEcomOrder._id === order.ecomOrderId ||
        (order.bookingIds || []).some((id) => extractBookingIdsFromEcomOrder(fullEcomOrder).includes(id))
    );

    const updated = correlated ?
        await orderReconciliation.linkWorkshopOrderToEcom(order, fullEcomOrder) :
        await wixData.update('WorkshopOrders', {
            ...order,
            status: 'paid',
            ecomOrderId: order.ecomOrderId || candidateEcomOrderId || null,
        }, SA);

    // WhatsApp is now sent automatically by the WorkshopOrders_afterUpdate
    // data hook in data.js when status changes to 'paid'.
    console.log('[confirmOrderPayment] order updated to paid. orderId:', orderId, 'source:', correlated ? 'ecom-verified' : 'degraded-fallback');

    return updated;
});

export const saveParticipants = webMethod(Permissions.Anyone, async (orderId, participants) => {
    const order = await getWorkshopOrderSafe(orderId, 'saveParticipants');
    if (!order) throw new Error('Order not found');

    const saved = [];
    for (const p of participants) {
        const normalizedPhone = normalizeIsraeliPhone(p.phone);
        const record = await wixData.insert('WorkshopParticipants', {
            orderId,
            name: p.name,
            phone: normalizedPhone || '',
            rawPhone: p.phone || '',
            rugAllowance: p.rugAllowance || 1,
            hasChildren: !!p.hasChildren,
            childrenCount: p.childrenCount || 0,
            duplicateApproved: false,
        }, SA);
        saved.push(record);
    }

    await wixData.update('WorkshopOrders', {
        ...order,
        selectionMode: 'participants',
    }, SA);

    return saved;
});

export const getParticipants = webMethod(Permissions.Anyone, async (orderId) => {
    const result = await wixData.query('WorkshopParticipants')
        .eq('orderId', orderId)
        .ascending('_createdDate')
        .find(SA);
    return result.items;
});

/**
 * Update a single participant/group record (name, rug allowance, children count).
 * Used by the organizer to freely adjust the group allocation.
 */
export const updateParticipant = webMethod(Permissions.Anyone, async (participantId, updates) => {
    if (!participantId) throw new Error('participantId is required');
    const participant = await wixData.get('WorkshopParticipants', participantId, SA);
    if (!participant) throw new Error('Participant not found');

    const order = await getWorkshopOrderSafe(participant.orderId, 'updateParticipant');
    if (order) {
        const editCheck = checkEditingWindow(order);
        if (!editCheck.allowed) {
            throw new Error(`EDITING_WINDOW_CLOSED:${editCheck.deadline?.toISOString() || ''}`);
        }
    }

    const patch = { ...participant };
    if (updates?.name !== undefined) patch.name = updates.name;
    if (updates?.rugAllowance !== undefined) patch.rugAllowance = Math.max(0, Number(updates.rugAllowance) || 0);
    if (updates?.childrenCount !== undefined) {
        const c = Math.max(0, Number(updates.childrenCount) || 0);
        const effectiveRugAllowance = updates?.rugAllowance !== undefined ?
            Math.max(0, Number(updates.rugAllowance) || 0) :
            participant.rugAllowance;
        if (c > effectiveRugAllowance) {
            throw new Error('CHILDREN_EXCEED_ADULTS');
        }
        patch.childrenCount = c;
        patch.hasChildren = c > 0;
    }
    return await wixData.update('WorkshopParticipants', patch, SA);
});

export const generateParticipantLinks = webMethod(Permissions.Anyone, async (orderId, baseUrl) => {
    const participants = await wixData.query('WorkshopParticipants')
        .eq('orderId', orderId)
        .find(SA);

    const links = [];
    for (const participant of participants.items) {
        let token = participant.shareToken;
        let shortRef = participant.shortRef;
        let needsUpdate = false;
        if (!token) {
            token = generateToken(32);
            const tokenHash = await hashAccessToken(token);
            participant.accessTokenHash = tokenHash;
            participant.shareToken = token;
            needsUpdate = true;
        }
        if (!shortRef) {
            shortRef = randomBytes(4).toString('hex');
            participant.shortRef = shortRef;
            needsUpdate = true;
        }
        if (needsUpdate) {
            await wixData.update('WorkshopParticipants', participant, SA);
        }
        const link = `${baseUrl}?ref=${shortRef}`;
        links.push({ participantId: participant._id, name: participant.name, link, token, shortRef });
    }

    return links;
});

/**
 * Create a single participant "group" with server-side allocation validation.
 * Enforces that the new group never pushes the order beyond its booked rugs
 * (== adults/seats) or children. Mints a stable share token immediately.
 */
export const createParticipantGroup = webMethod(Permissions.Anyone, async (orderId, group, baseUrl) => {
    const order = await getWorkshopOrderSafe(orderId, 'createParticipantGroup');
    if (!order) throw new Error('Order not found');

    const name = (group?.name || '').trim();
    if (!name) throw new Error('GROUP_NAME_REQUIRED');

    const editCheck = checkEditingWindow(order);
    if (!editCheck.allowed) {
        throw new Error(`EDITING_WINDOW_CLOSED:${editCheck.deadline?.toISOString() || ''}`);
    }

    // In this product 1 rug maps to 1 adult/seat, so "participants" === rugs.
    const seats = Math.max(1, Number(group?.participants) || 1);
    const childrenCount = Math.max(0, Number(group?.children) || 0);
    const rugAllowance = seats;

    if (childrenCount > seats) {
        throw new Error('CHILDREN_EXCEED_ADULTS');
    }

    const existing = await wixData.query('WorkshopParticipants')
        .eq('orderId', orderId)
        .find(SA);
    const usedRugs = existing.items.reduce((s, p) => s + (p.rugAllowance || 0), 0);
    const usedChildren = existing.items.reduce((s, p) => s + (p.childrenCount || 0), 0);

    const maxRugs = order.rugCount || 0;
    const maxChildren = order.children || 0;

    if (usedRugs + rugAllowance > maxRugs) {
        throw new Error(`RUG_LIMIT_EXCEEDED:${Math.max(0, maxRugs - usedRugs)}`);
    }
    if (usedChildren + childrenCount > maxChildren) {
        throw new Error(`CHILDREN_LIMIT_EXCEEDED:${Math.max(0, maxChildren - usedChildren)}`);
    }

    const token = generateToken(32);
    const tokenHash = await hashAccessToken(token);
    const shortRef = randomBytes(4).toString('hex');

    const record = await wixData.insert('WorkshopParticipants', {
        orderId,
        name,
        phone: '',
        rawPhone: '',
        rugAllowance,
        hasChildren: childrenCount > 0,
        childrenCount,
        duplicateApproved: false,
        accessTokenHash: tokenHash,
        shareToken: token,
        shortRef,
    }, SA);

    // Note: selectionMode is set explicitly by the organizer via setOrderSelectionMode
    // (SET_SELECTION_MODE) when they pick a mode, before any group-creation UI is
    // reachable. Writing it again here previously caused a race where creating an
    // "organizer" self-selection group could clobber the mode back to 'participants'
    // (this method's old unconditional default), flipping the UI on refresh.

    const link = baseUrl ? `${baseUrl}?ref=${shortRef}` : null;
    return { participant: record, link, token };
});

/**
 * Return info for the deletion confirmation modal (sketch count, group name)
 * without actually deleting anything.
 */
function findLockedSketchInList(selections) {
    return (selections || []).find((sel) => isLockedStatus(sel.sketchStatus)) || null;
}

/**
 * @typedef {Object} GroupSelectionFilterOpts
 * @property {string} [participantId]
 * @property {string} [participantName]
 * @property {number[]} [rugIndexes]
 */

/**
 * @param {any[]} allSelections
 * @param {GroupSelectionFilterOpts} [filterOpts]
 */
function filterOrganizerGroupSelections(allSelections, filterOpts = {}) {
    const participantId = filterOpts.participantId;
    const participantName = filterOpts.participantName;
    const rugIndexes = filterOpts.rugIndexes;
    const normalizedName = (participantName || '').trim();
    const rugIndexSet = new Set(Array.isArray(rugIndexes) ? rugIndexes : []);
    return (allSelections || []).filter((s) => {
        const matchesParticipant = participantId && s.participantId === participantId;
        const matchesName = normalizedName && s.participantName === normalizedName;
        const matchesRug = rugIndexSet.size > 0 && rugIndexSet.has(s.rugIndex);
        return matchesParticipant || matchesName || matchesRug;
    });
}

/**
 * @typedef {Object} QueryGroupOpts
 * @property {string} [participantId]
 * @property {string} [orderId]
 * @property {string} [participantName]
 * @property {number[]} [rugIndexes]
 */

/**
 * @param {QueryGroupOpts} [opts]
 * @param {object} [readOptions]
 */
async function queryGroupSelections(opts = {}, readOptions = SA) {
    const participantId = opts.participantId;
    const orderId = opts.orderId;
    const participantName = opts.participantName;
    const rugIndexes = opts.rugIndexes;

    if (participantId) {
        const result = await wixData.query('SketchSelections')
            .eq('participantId', participantId)
            .find(readOptions);
        return result.items;
    }

    if (!orderId) throw new Error('participantId or orderId is required');

    const normalizedName = (participantName || '').trim();
    const rugIndexList = (Array.isArray(rugIndexes) ? rugIndexes : []).filter((i) => i != null);

    if (normalizedName) {
        const result = await wixData.query('SketchSelections')
            .eq('orderId', orderId)
            .eq('participantName', normalizedName)
            .find(readOptions);
        return filterOrganizerGroupSelections(result.items, opts);
    }

    if (rugIndexList.length > 0) {
        try {
            const result = await wixData.query('SketchSelections')
                .eq('orderId', orderId)
                .hasSome('rugIndex', rugIndexList)
                .find(readOptions);
            return filterOrganizerGroupSelections(result.items, opts);
        } catch (err) {
            console.warn('[queryGroupSelections] hasSome rugIndex failed, falling back:', err?.message);
        }
    }

    const result = await wixData.query('SketchSelections')
        .eq('orderId', orderId)
        .find(readOptions);
    return filterOrganizerGroupSelections(result.items, opts);
}

export const getGroupDeletionPreview = webMethod(Permissions.Anyone, async (participantId) => {
    if (!participantId) throw new Error('participantId is required');
    const participant = await wixData.get('WorkshopParticipants', participantId, SA);
    if (!participant) throw new Error('Participant not found');

    const sels = await wixData.query('SketchSelections')
        .eq('participantId', participantId)
        .find(SA_CONSISTENT);
    const locked = findLockedSketchInList(sels.items);

    return {
        participantId,
        groupName: participant.name,
        rugAllowance: participant.rugAllowance,
        sketchCount: sels.items.length,
        canDelete: !locked,
        lockedSketchStatus: locked ? normalizeSketchStatus(locked.sketchStatus) : null,
    };
});

/**
 * Fast pre-delete check — narrow query, eventual consistency (SA).
 * Authoritative guard remains on deleteParticipantGroup / deleteOrganizerSelectionGroup.
 */
export const checkGroupDeletable = webMethod(Permissions.Anyone, async (opts = {}) => {
    const selections = await queryGroupSelections(opts, SA);
    const locked = findLockedSketchInList(selections);
    return {
        canDelete: !locked,
        lockedSketchStatus: locked ? normalizeSketchStatus(locked.sketchStatus) : null,
        sketchCount: selections.length,
    };
});

/**
 * Permanently delete a participant "group":
 *  - Server-side 48h-before-workshop guard (cannot be bypassed by the client clock).
 *  - Cascading delete of all SketchSelections that belong to the group.
 *  - Removes the participant record, invalidating its dynamic share link.
 */
export const deleteParticipantGroup = webMethod(Permissions.Anyone, async (participantId) => {
    if (!participantId) throw new Error('participantId is required');

    const participant = await wixData.get('WorkshopParticipants', participantId, SA);
    if (!participant) throw new Error('Participant not found');

    const order = await getWorkshopOrderSafe(participant.orderId, 'deleteParticipantGroup');
    if (order?.workshopStart) {
        const msUntilWorkshop = new Date(order.workshopStart).getTime() - Date.now();
        if (msUntilWorkshop <= 48 * 60 * 60 * 1000) {
            throw new Error('DELETE_LOCKED_48H');
        }
    }

    const sels = await wixData.query('SketchSelections')
        .eq('participantId', participantId)
        .find(SA_CONSISTENT);
    const locked = findLockedSketchInList(sels.items);
    if (locked) {
        throw new Error(`DELETE_LOCKED_SKETCH_STATUS:${normalizeSketchStatus(locked.sketchStatus)}`);
    }

    // Cascade: remove every sketch selection tied to this group (single bulk call).
    let deletedSelections = 0;
    if (sels.items.length > 0) {
        const removeResult = await wixData.bulkRemove('SketchSelections', sels.items.map(s => s._id), SA);
        assertBulkSuccess(removeResult, 'deleteGroupSelections');
        deletedSelections = removeResult?.removed ?? sels.items.length;
    }

    await wixData.remove('WorkshopParticipants', participantId, SA);

    const verify = await wixData.query('WorkshopParticipants')
        .eq('orderId', participant.orderId)
        .find(SA);
    if (verify.items.some(p => p._id === participantId)) {
        throw new Error('DELETE_FAILED');
    }

    return { success: true, deletedSelections };
});

/**
 * Delete an organizer self-selection "group" (card) and its sketch selections.
 * Groups in organizer mode are stored as SketchSelections keyed by participantName / rugIndex.
 */
export const deleteOrganizerSelectionGroup = webMethod(Permissions.Anyone, async (orderId, participantName, rugIndexes = [], participantId = null) => {
    if (!orderId) throw new Error('orderId is required');

    const order = await getWorkshopOrderSafe(orderId, 'deleteOrganizerSelectionGroup');
    if (!order) throw new Error('Order not found');

    const editCheck = checkEditingWindow(order);
    if (!editCheck.allowed) {
        throw new Error(`EDITING_WINDOW_CLOSED:${editCheck.deadline?.toISOString() || ''}`);
    }

    const normalizedName = (participantName || '').trim();
    const rugIndexSet = new Set(Array.isArray(rugIndexes) ? rugIndexes : []);

    const matching = await queryGroupSelections({
        participantId,
        orderId,
        participantName: normalizedName,
        rugIndexes: [...rugIndexSet],
    }, SA_CONSISTENT);
    const locked = findLockedSketchInList(matching);
    if (locked) {
        throw new Error(`DELETE_LOCKED_SKETCH_STATUS:${normalizeSketchStatus(locked.sketchStatus)}`);
    }

    let deletedSelections = 0;
    if (matching.length > 0) {
        const removeResult = await wixData.bulkRemove('SketchSelections', matching.map(s => s._id), SA);
        assertBulkSuccess(removeResult, 'deleteOrganizerSelections');
        deletedSelections = removeResult?.removed ?? matching.length;
    }

    // Organizer groups persisted as WorkshopParticipants records (created via
    // createParticipantGroup with mode='organizer') need to be removed too,
    // otherwise the empty group would reappear on the next context reload.
    if (participantId) {
        try {
            await wixData.remove('WorkshopParticipants', participantId, SA);
        } catch (e) {
            // Already removed or never existed as a persisted record — ignore.
        }
    }

    return { success: true, deletedSelections };
});

/**
 * Delete a single editable sketch selection (organizer review confirm).
 */
export const deleteEditableSketchSelection = webMethod(Permissions.Anyone, async (opts = {}) => {
    const { orderId, rugIndex, participantId, participantName } = opts;
    if (!orderId || rugIndex == null) throw new Error('orderId and rugIndex are required');

    const order = await getWorkshopOrderSafe(orderId, 'deleteEditableSketchSelection');
    if (!order) throw new Error('Order not found');

    const editCheck = checkEditingWindow(order);
    if (!editCheck.allowed) {
        throw new Error(`EDITING_WINDOW_CLOSED:${editCheck.deadline?.toISOString() || ''}`);
    }

    let query = wixData.query('SketchSelections')
        .eq('orderId', orderId)
        .eq('rugIndex', rugIndex);
    if (participantId) {
        query = query.eq('participantId', participantId);
    } else if (participantName) {
        query = query.eq('participantName', (participantName || '').trim());
    }
    const result = await query.limit(1).find(SA_CONSISTENT);

    if (!result.items.length) {
        return { success: true, deleted: false };
    }

    const sel = result.items[0];
    const status = normalizeSketchStatus(sel.sketchStatus);
    if (isLockedStatus(status)) {
        throw new Error(`DELETE_LOCKED_SKETCH_STATUS:${status}`);
    }
    if (sel.selectionStatus === 'preparing' || sel.selectionStatus === 'ready') {
        throw new Error('Cannot delete a sketch that is already being prepared');
    }

    await wixData.remove('SketchSelections', sel._id, SA);
    return { success: true, deleted: true, rugIndex };
});

/**
 * Resolve a short reference code to the participant's token and order.
 * Used by the /user-selections page when accessed via ?ref=<shortRef>.
 */
export const resolveShortRef = webMethod(Permissions.Anyone, async (ref) => {
    if (!ref) throw new Error('ref is required');
    const result = await wixData.query('WorkshopParticipants')
        .eq('shortRef', ref)
        .limit(1)
        .find(SA);
    if (!result.items.length) return null;
    const participant = result.items[0];
    return {
        token: participant.shareToken,
        orderId: participant.orderId,
        participantId: participant._id,
        name: participant.name,
        rugAllowance: participant.rugAllowance,
        childrenCount: participant.childrenCount || 0,
    };
});

export const generateOrganizerToken = webMethod(Permissions.Anyone, async (orderId) => {
    const order = await getWorkshopOrderSafe(orderId, 'generateOrganizerToken');
    if (!order) throw new Error('Order not found');
    if (order.orderToken) return order.orderToken;

    const token = generateToken(32);
    await wixData.update('WorkshopOrders', { ...order, orderToken: token }, SA);
    return token;
});

export const verifyAccessToken = webMethod(Permissions.Anyone, async (token, rawPhone) => {
    if (!token) throw new Error('Token is required');

    const organizerResult = await wixData.query('WorkshopOrders')
        .eq('orderToken', token)
        .limit(1)
        .find(SA);

    if (organizerResult.items.length > 0) {
        const order = organizerResult.items[0];
        if (!phonesMatch(order.organizerPhone, rawPhone)) {
            return { valid: false, reason: 'phone_mismatch' };
        }
        const participants = await wixData.query('WorkshopParticipants')
            .eq('orderId', order._id)
            .find(SA);
        const selections = await wixData.query('SketchSelections')
            .eq('orderId', order._id)
            .find(SA);
        const enrichedOrder = enrichOrderEditingFields(order);
        const session90Used = await countSessionSketch90Reserved(order.sessionId, null);
        return {
            valid: true,
            role: 'organizer',
            order: enrichedOrder,
            participants: participants.items,
            selections: selections.items.map(normalizeUpgradeSelection),
            session90: {
                limit: SESSION_SKETCH_90_LIMIT,
                used: session90Used,
                remaining: Math.max(0, SESSION_SKETCH_90_LIMIT - session90Used),
                soldOut: session90Used >= SESSION_SKETCH_90_LIMIT,
            },
        };
    }

    const tokenHash = await hashAccessToken(token);
    let participantResult = await wixData.query('WorkshopParticipants')
        .eq('accessTokenHash', tokenHash)
        .find(SA);

    if (participantResult.items.length === 0) {
        participantResult = await wixData.query('WorkshopParticipants')
            .eq('accessTokenHash', token)
            .find(SA);
    }

    if (participantResult.items.length === 0) {
        return { valid: false, reason: 'invalid_token' };
    }

    const participant = participantResult.items[0];
    if (!phonesMatch(participant.phone, rawPhone)) {
        return { valid: false, reason: 'phone_mismatch' };
    }

    const order = await getWorkshopOrderSafe(participant.orderId, 'verifyAccessToken(participant)');
    if (!order) {
        return { valid: false, reason: 'order_not_found' };
    }

    // Selections are keyed by orderId + rugIndex (participantId removed).
    const selections = await wixData.query('SketchSelections')
        .eq('orderId', participant.orderId)
        .find(SA);

    // Legacy rows with no participantId at all predate multi-group support —
    // safe to hand to a participant only when their order still has a single
    // group (i.e. participantId was genuinely never needed). With more than
    // one group, exposing a legacy row to every group would leak it into
    // multiple participants' UIs at once, so drop it from this response.
    const orderParticipants = await wixData.query('WorkshopParticipants')
        .eq('orderId', participant.orderId)
        .find(SA);
    const isSingleGroupOrder = orderParticipants.items.length <= 1;
    const scopedSelections = isSingleGroupOrder ?
        selections.items :
        selections.items.filter((s) => !!s.participantId);

    const enrichedOrder = enrichOrderEditingFields(order);
    const session90UsedForParticipant = await countSessionSketch90Reserved(order.sessionId, null);
    return {
        valid: true,
        role: 'participant',
        session90: {
            limit: SESSION_SKETCH_90_LIMIT,
            used: session90UsedForParticipant,
            remaining: Math.max(0, SESSION_SKETCH_90_LIMIT - session90UsedForParticipant),
            soldOut: session90UsedForParticipant >= SESSION_SKETCH_90_LIMIT,
        },
        order: {
            _id: enrichedOrder._id,
            workshopStart: enrichedOrder.workshopStart,
            _createdDate: enrichedOrder._createdDate,
            deadlineAt: enrichedOrder.deadlineAt,
            editingWindowAllowed: enrichedOrder.editingWindowAllowed,
            editingWindowPolicy: enrichedOrder.editingWindowPolicy,
            serviceId: enrichedOrder.serviceId,
            rugCount: enrichedOrder.rugCount,
            adults: enrichedOrder.adults,
            children: enrichedOrder.children,
            basePrice: enrichedOrder.basePrice,
            showPriceToParticipants: enrichedOrder.showPriceToParticipants,
            organizerName: enrichedOrder.organizerName,
            organizerEmail: enrichedOrder.organizerEmail,
            organizerPhone: enrichedOrder.organizerPhone,
            organizerNotes: enrichedOrder.customerNotes || enrichedOrder.organizerNotes,
        },
        // Participants always see the organizer's contact info + workshop
        // schedule/address, regardless of any share/price settings — this
        // covers only buyer identity fields, never pricing/coupon data.
        ecomSummary: buildEcomSummaryFromOrder(order),
        participant,
        selections: scopedSelections.map(normalizeUpgradeSelection),
    };
});

export const saveSketchSelection = webMethod(Permissions.Anyone, async (selectionData) => {
    const {
        orderId,
        rugIndex,
        participantId,
        productId,
        productSnapshot,
        canvasSize,
        participantName,
        phoneNumber,
        source,
        aiOriginalImage,
        aiColors,
        aiTaskId,
        frameType,
        aiCroppedImage,
        expectedUpdatedDate,
    } = selectionData;

    const aiFields = source === 'ai' ? {
        source: 'ai',
        aiOriginalImage: aiOriginalImage || null,
        aiColors: Array.isArray(aiColors) ? aiColors.join(',') : (aiColors || null),
        aiTaskId: aiTaskId || null,
        frameType: ['square', 'circle', 'custom'].includes(frameType) ? frameType : null,
        aiCroppedImage: aiCroppedImage || null,
    } : {};

    const order = await getWorkshopOrderSafe(orderId, 'saveSketchSelection');
    if (!order) throw new Error('Order not found');

    // consistentRead: this is a check-then-write upsert, so we must read the
    // latest CMS state right before deciding insert-vs-update — a stale/
    // eventually-consistent read here is exactly what causes duplicate rows
    // when two saves for the same rug land close together.
    let existingQuery = wixData.query('SketchSelections').eq('rugIndex', rugIndex);
    existingQuery = participantId ?
        existingQuery.eq('participantId', participantId) :
        existingQuery.eq('orderId', orderId);
    const existing = await existingQuery.find(SA_CONSISTENT);

    // Duplicate rows can exist from earlier races. Always treat the most 
    // recently updated row as the one we edit, and clean up any older
    // siblings for the same key so they stop accumulating.
    if (existing.items.length > 1) {
        existing.items.sort((a, b) =>
            new Date(b._updatedDate || b._createdDate).getTime() - new Date(a._updatedDate || a._createdDate).getTime()
        );
    }
    const duplicateIds = existing.items.slice(1).map((d) => d._id);

    if (existing.items.length > 0) {
        const prev = existing.items[0];

        // Optional conflict guard: if the caller last loaded this sketch at
        // a known _updatedDate (e.g. staff changed its status, or another
        // tab/device saved it) and it has since changed, reject instead of
        // silently overwriting with stale local state.
        if (expectedUpdatedDate && prev._updatedDate) {
            const expected = new Date(expectedUpdatedDate).getTime();
            const actual = new Date(prev._updatedDate).getTime();
            if (expected !== actual) {
                throw new Error('CONFLICT:Sketch was modified elsewhere — please refresh.');
            }
        }

        const status = normalizeSketchStatus(prev.sketchStatus);
        if (isLockedStatus(status)) {
            throw new Error(status === SKETCH_STATUS.READY ? 'SKETCH_READY_LOCKED' : `SKETCH_STATUS_LOCKED:${status}`);
        }
        if (prev.selectionStatus === 'preparing' || prev.selectionStatus === 'ready') {
            throw new Error('Cannot change a sketch that is already being prepared');
        }

        const pendingCheck = {
            rugIndex,
            productId: productId ?? prev.productId,
            source: source || prev.source || 'catalog',
            aiTaskId: aiTaskId || prev.aiTaskId || null,
            sketchStatus: status,
        };
        let scopeQuery = participantId ?
            wixData.query('SketchSelections').eq('participantId', participantId) :
            wixData.query('SketchSelections').eq('orderId', orderId);
        const scopeSelections = await scopeQuery.find(SA_CONSISTENT);
        const minimumCheck = wouldViolateLockedMinimum(scopeSelections.items, {
            rugIndex,
            replacement: pendingCheck,
        });
        if (minimumCheck.violated) {
            throw new Error(`LOCKED_DESIGN_MINIMUM:${minimumCheck.designKey}:${minimumCheck.minimum}`);
        }
    }

    const editCheck = checkEditingWindow(order);
    if (!editCheck.allowed) {
        throw new Error(`EDITING_WINDOW_CLOSED:${editCheck.deadline?.toISOString() || ''}`);
    }

    // Session-wide 90x90 capacity: only 5 slots exist per workshop session,
    // shared across every order booked into that session (not just this one).
    // Skip the check if this selection already holds a reserved 90 slot
    // (re-saving the same size, or a paid upgrade) — it isn't claiming a NEW one.
    {
        const prevForSize = existing.items[0];
        const wantsNew90 = (canvasSize || '60x60') === '90x90';
        const alreadyReserved90 = prevForSize && prevForSize.upgradePaymentStatus !== 'failed' &&
            (prevForSize.canvasSize === '90x90' || prevForSize.requestedCanvasSize === '90x90');
        if (wantsNew90 && !alreadyReserved90) {
            const reserved = await countSessionSketch90Reserved(order.sessionId, prevForSize?._id || null);
            if (reserved >= SESSION_SKETCH_90_LIMIT) {
                throw new Error(`SESSION_SKETCH_90_SOLD_OUT:${SESSION_SKETCH_90_LIMIT}`);
            }
        }
    }

    // Quota: rugIndex is local per participant/group (0..rugAllowance-1).
    // Legacy selections without participantId fall back to order rugCount.
    if (participantId) {
        const participant = await wixData.get('WorkshopParticipants', participantId, SA);
        if (participant && rugIndex >= participant.rugAllowance) {
            throw new Error(`QUOTA_EXCEEDED:${participant.rugAllowance}`);
        }
    } else if (rugIndex >= (order.rugCount || 0)) {
        throw new Error(`QUOTA_EXCEEDED:${order.rugCount || 0}`);
    }

    let savedSelection;
    const sketchWixFileUrl = await resolveSketchWixFileUrlForSave({ productId, productSnapshot });
    const enrichedProductSnapshot = productSnapshot ?
        {
            ...productSnapshot,
            ...(sketchWixFileUrl ? { wixFileUrl: sketchWixFileUrl } : {}),
        } :
        productSnapshot;

    if (existing.items.length > 0) {
        const prev = existing.items[0];

        // Size lock: paid 90cm upgrade cannot be changed
        if (prev.upgradePaymentStatus === 'paid' && canvasSize && canvasSize !== prev.canvasSize) {
            throw new Error('SIZE_LOCKED_PAID_UPGRADE');
        }

        const requestedSize = canvasSize || '60x60';
        const isPaid = prev.upgradePaymentStatus === 'paid';
        // Stored size stays 60x60 until Wix Pay confirms the upgrade (events.js).
        const storedCanvasSize = isPaid ? (prev.canvasSize || '60x60') : '60x60';
        const upgradeFields = isPaid ? {} : buildUnpaidUpgradeFields(prev, requestedSize);

        const status = normalizeSketchStatus(prev.sketchStatus);

        savedSelection = await wixData.update('SketchSelections', {
            ...prev,
            workshopOrder: orderId,
            productId,
            productSnapshot: enrichedProductSnapshot,
            sketchImage: productSnapshot?.image || null,
            sketchWixFileUrl: sketchWixFileUrl || prev.sketchWixFileUrl || null,
            canvasSize: storedCanvasSize,
            selectionStatus: 'selected',
            sketchStatus: status,
            participantId: participantId || prev.participantId || null,
            participantName: participantName || prev.participantName || null,
            phoneNumber: phoneNumber || prev.phoneNumber || null,
            confirmedAt: new Date(),
            ...upgradeFields,
            ...aiFields,
        }, SA);
    } else {
        const requestedSize = canvasSize || '60x60';
        const wants90 = requestedSize === '90x90';
        savedSelection = await wixData.insert('SketchSelections', {
            orderId,
            workshopOrder: orderId,
            rugIndex,
            participantId: participantId || null,
            productId,
            productSnapshot: enrichedProductSnapshot,
            sketchImage: productSnapshot?.image || null,
            sketchWixFileUrl: sketchWixFileUrl || null,
            canvasSize: '60x60',
            requestedCanvasSize: wants90 ? '90x90' : null,
            previousCanvasSize: '60x60',
            upgradePaymentId: null,
            upgradePaymentStatus: wants90 ? 'pending-upgrade' : null,
            upgradePaymentRequestedAt: null,
            selectionStatus: 'selected',
            sketchStatus: SKETCH_STATUS.OPEN,
            participantName: participantName || null,
            phoneNumber: phoneNumber || null,
            confirmedAt: new Date(),
            ...aiFields,
        }, SA);
    }

    if (duplicateIds.length > 0) {
        // Non-fatal cleanup: a failure here must not fail the save itself.
        try {
            const dupResult = await wixData.bulkRemove('SketchSelections', duplicateIds, SA);
            if (dupResult?.errors?.length) {
                console.warn(`[saveSketchSelection] ${dupResult.errors.length} duplicate row(s) failed cleanup:`, JSON.stringify(dupResult.errors));
            }
        } catch (removeErr) {
            console.warn('[saveSketchSelection] Failed to clean up duplicate rows:', removeErr?.message);
        }
    }

    if (participantId) {
        try {
            await sendSelectionNotification(order, participantName);
        } catch (notifErr) {
            console.warn(`[saveSketchSelection] Could not send selection notification for order ${orderId}:`, notifErr?.message);
        }
    }

    return normalizeUpgradeSelection(savedSelection);
});

export const getSketchSelections = webMethod(Permissions.Anyone, async (orderId) => {
    const result = await wixData.query('SketchSelections')
        .eq('orderId', orderId)
        .find(SA);
    return result.items;
});

export const createCanvasUpgradePayment = webMethod(Permissions.Anyone, async (upgradeData) => {
    if (!upgradeData) throw new Error('upgradeData is required');
    const { orderId, selections: rawUpgradeSelections, orderNumber, buyerName, buyerPhone, buyerEmail } = upgradeData;
    if (!Array.isArray(rawUpgradeSelections) || rawUpgradeSelections.length === 0) {
        throw new Error('No upgrades to process');
    }

    const order = await getWorkshopOrderSafe(orderId, 'createCanvasUpgradePayment');
    if (!order) throw new Error('Order not found');

    const editCheck = checkEditingWindow(order);
    if (!editCheck.allowed) {
        throw new Error(`EDITING_WINDOW_CLOSED:${editCheck.deadline?.toISOString() || ''}`);
    }

    const UPGRADE_PRICE_PER_ITEM = 299;

    const rawPhone = buyerPhone ? String(buyerPhone).replace(/\D/g, '') : '';
    const isSpecialPhone = rawPhone === '0523813929' || rawPhone === '523813929' || rawPhone === '972523813929';

    // Dedupe by scope+rugIndex (last wins) — with per-item queries a duplicate
    // entry would have updated the record just written by its twin; with batched
    // writes it would create two rows instead, so it must be collapsed up-front.
    const dedupedByKey = new Map();
    for (const sel of rawUpgradeSelections) {
        dedupedByKey.set(`${sel.participantId || 'order'}:${sel.rugIndex}`, sel);
    }
    const upgradeSelections = [...dedupedByKey.values()];

    // --- Single fetch of all candidate selections (replaces one query per rug) ---
    // Candidates: every selection on this order, plus (for safety) any selection
    // tied to one of the requested participantIds, matching the scoping rules of
    // the previous per-item queries.
    const upgradeParticipantIds = [...new Set(upgradeSelections.map(s => s.participantId).filter(Boolean))];
    const byOrderResult = await wixData.query('SketchSelections')
        .eq('orderId', orderId)
        .limit(1000)
        .find(SA);
    const candidateItems = [...byOrderResult.items];
    if (upgradeParticipantIds.length > 0) {
        const byParticipantResult = await wixData.query('SketchSelections')
            .hasSome('participantId', upgradeParticipantIds)
            .limit(1000)
            .find(SA);
        const seenIds = new Set(candidateItems.map(i => i._id));
        for (const item of byParticipantResult.items) {
            if (!seenIds.has(item._id)) candidateItems.push(item);
        }
    }
    // Same matching rule as before: participantId scope when provided, otherwise order scope.
    const findExistingSelection = (sel) => candidateItems.find(item =>
        item.rugIndex === sel.rugIndex &&
        (sel.participantId ? item.participantId === sel.participantId : item.orderId === orderId)
    );

    // Session-wide 90x90 capacity: pre-validate the WHOLE batch up-front
    // (before writing anything) so a request that would exceed the
    // session-wide limit of 5 is rejected atomically instead of leaving a
    // partial write with no payment created for it.
    let newReservationsNeeded = 0;
    for (const sel of upgradeSelections) {
        const prevForCheck = findExistingSelection(sel);
        if (prevForCheck?.upgradePaymentStatus === 'paid') continue;
        const alreadyReserved90 = prevForCheck && prevForCheck.upgradePaymentStatus !== 'failed' &&
            (prevForCheck.canvasSize === '90x90' || prevForCheck.requestedCanvasSize === '90x90');
        if (!alreadyReserved90) newReservationsNeeded++;
    }
    if (newReservationsNeeded > 0) {
        const reserved = await countSessionSketch90Reserved(order.sessionId, null);
        if (reserved + newReservationsNeeded > SESSION_SKETCH_90_LIMIT) {
            throw new Error(`SESSION_SKETCH_90_SOLD_OUT:${SESSION_SKETCH_90_LIMIT}`);
        }
    }

    // --- Build all records in memory, then persist with ONE bulkUpdate + ONE bulkInsert ---
    // (Previously: query + update/insert per sketch, which serialized N round-trips.)
    const sketchWixFileUrls = await Promise.all(upgradeSelections.map((sel) =>
        resolveSketchWixFileUrlForSave({
            productId: sel.productId,
            productSnapshot: sel.productSnapshot,
        })
    ));

    const toUpdate = [];
    const toInsert = [];

    upgradeSelections.forEach((sel, i) => {
        const sketchWixFileUrl = sketchWixFileUrls[i];
        const enrichedProductSnapshot = sel.productSnapshot ?
            {
                ...sel.productSnapshot,
                ...(sketchWixFileUrl ? { wixFileUrl: sketchWixFileUrl } : {}),
            } :
            sel.productSnapshot;

        const prev = findExistingSelection(sel);
        if (prev) {
            if (prev.upgradePaymentStatus === 'paid') return;
            toUpdate.push({
                ...prev,
                workshopOrder: orderId,
                productId: sel.productId,
                productSnapshot: enrichedProductSnapshot,
                sketchImage: sel.productSnapshot?.image || null,
                sketchWixFileUrl: sketchWixFileUrl || prev.sketchWixFileUrl || null,
                canvasSize: '60x60',
                requestedCanvasSize: '90x90',
                previousCanvasSize: '60x60',
                selectionStatus: 'selected',
                sketchStatus: prev.sketchStatus || 'Changeable',
                confirmedAt: new Date(),
                participantId: sel.participantId || prev.participantId || null,
                participantName: sel.participantName || prev.participantName || null,
                phoneNumber: sel.phoneNumber || prev.phoneNumber || null,
            });
        } else {
            toInsert.push({
                _id: generateItemId(), // pre-assigned so the full record is known without re-querying
                orderId,
                workshopOrder: orderId,
                rugIndex: sel.rugIndex,
                participantId: sel.participantId || null,
                productId: sel.productId,
                productSnapshot: enrichedProductSnapshot,
                sketchImage: sel.productSnapshot?.image || null,
                sketchWixFileUrl: sketchWixFileUrl || null,
                canvasSize: '60x60',
                requestedCanvasSize: '90x90',
                previousCanvasSize: '60x60',
                upgradePaymentId: null,
                upgradePaymentStatus: 'pending-upgrade',
                selectionStatus: 'selected',
                sketchStatus: 'Changeable',
                confirmedAt: new Date(),
                participantName: sel.participantName || null,
                phoneNumber: sel.phoneNumber || null,
            });
        }
    });

    if (toUpdate.length === 0 && toInsert.length === 0) throw new Error('No upgrades to process');

    const [updateResult, insertResult] = await Promise.all([
        toUpdate.length ? wixData.bulkUpdate('SketchSelections', toUpdate, SA) : Promise.resolve(null),
        toInsert.length ? wixData.bulkInsert('SketchSelections', toInsert, SA) : Promise.resolve(null),
    ]);
    assertBulkSuccess(updateResult, 'upgradeSave');
    assertBulkSuccess(insertResult, 'upgradeSave');

    const savedSelections = [...toUpdate, ...toInsert];

    const perItemPrice = isSpecialPhone ? 1 : UPGRADE_PRICE_PER_ITEM;
    const totalAmount = savedSelections.length * perItemPrice;
    const participantNamesList = savedSelections.map(s => s.participantName).filter(Boolean).join(', ');
    const itemDescription = sanitizePayItemName(
        `שדרוג 90x90 סמ | הזמנה ${orderNumber || orderId}${participantNamesList ? ` | ${participantNamesList}` : ''}`
    );

    const payment = await wixPayBackend.createPayment({
        amount: totalAmount,
        items: savedSelections.map((s) => ({
            name: sanitizePayItemName(`${itemDescription} - שטיח ${s.rugIndex + 1}`),
            price: perItemPrice,
            quantity: 1,
        })),
        userInfo: {
            firstName: buyerName ? buyerName.split(' ')[0] || '' : '',
            lastName: buyerName ? buyerName.split(' ').slice(1).join(' ') || '' : '',
            phone: buyerPhone || '',
            email: buyerEmail || '',
            countryCode: 'ISR',
        },
    });

    const chargeAttemptedAt = new Date();
    const paymentPatchResult = await wixData.bulkUpdate('SketchSelections', savedSelections.map((s) => ({
        ...s,
        upgradePaymentId: payment.id,
        // Awaiting asynchronous confirmation from the Wix Pay backend event.
        upgradePaymentStatus: 'pending-payment-approval',
        upgradePaymentRequestedAt: chargeAttemptedAt,
    })), SA);
    assertBulkSuccess(paymentPatchResult, 'upgradePaymentPatch');

    return { payment, selectionIds: savedSelections.map(s => s._id) };
});

/**
 * Authoritatively resolve an upgrade payment by its paymentId.
 * Called from the secure Wix Pay backend event (events.js) — NOT from the
 * client-side promise, which is unreliable if the user closes the window.
 *
 * @param {string} paymentId
 * @param {string} paymentStatus - Wix payment status (Successful/Charged/Declined/Refunded/...)
 */
export const completeCanvasUpgradePayment = webMethod(Permissions.Anyone, async (paymentId, paymentStatus) => {
    const isPaid = paymentStatus === 'Successful' || paymentStatus === 'Charged';
    const result = await wixData.query('SketchSelections')
        .eq('upgradePaymentId', paymentId)
        .find(SA);

    const updated = [];
    for (const sel of result.items) {
        // Never downgrade an already-confirmed paid record.
        if (sel.upgradePaymentStatus === 'paid' && !isPaid) {
            updated.push(sel);
            continue;
        }
        const patch = { ...sel };
        if (isPaid) {
            patch.upgradePaymentStatus = 'paid';
            patch.canvasSize = '90x90';
            patch.requestedCanvasSize = null;
        } else {
            Object.assign(patch, buildFailedUpgradeFields(sel));
        }
        const u = await wixData.update('SketchSelections', patch, SA);
        updated.push(u);
    }
    return updated;
});

/**
 * Build a display-ready buyer/coupon summary from the CMS-stored order fields.
 * Used whenever we don't have the live eCom order object at hand (e.g. loading
 * a past order from history, or the /user-selections page) — mirrors the shape
 * produced from the live eCom order on the Thank You page.
 */
function buildEcomSummaryFromOrder(order) {
    if (!order) return null;
    return {
        orderId: order.ecomOrderId || null,
        orderNumber: order.ecomOrderNumber || null,
        buyerName: order.organizerName || '',
        buyerEmail: order.organizerEmail || '',
        buyerPhone: order.organizerPhone || '',
        total: order.paidTotal || order.basePrice || 0,
        discount: order.paidDiscount || 0,
        subtotal: (order.paidTotal || order.basePrice || 0) + (order.paidDiscount || 0),
        coupon: order.couponCode ? { code: order.couponCode, name: order.couponName } : null,
        currency: 'ILS',
        organizerNotes: order.customerNotes || order.organizerNotes || '',
    };
}

/** Normalize order.selectedProducts for display — prefers image/price saved on the CMS row at checkout time, falls back to bookingProducts for legacy orders. */
async function enrichSelectedProducts(order) {
    const rawSelected = Array.isArray(order?.selectedProducts) ? order.selectedProducts : [];
    if (rawSelected.length === 0) return [];

    const needsLookup = rawSelected.some((p) => p.productId && !p.image && !p.imageUrl);
    let productsById = new Map();
    if (needsLookup) {
        const productIds = [...new Set(rawSelected.map((p) => p.productId).filter(Boolean))];
        if (productIds.length > 0) {
            const productsResult = await wixData.query('bookingProducts')
                .hasSome('_id', productIds)
                .find({ suppressAuth: true, omitTotalCount: true });
            productsById = new Map(productsResult.items.map((p) => [p._id, p]));
        }
    }

    return rawSelected.map((sel) => {
        const product = productsById.get(sel.productId);
        const wixImage = sel.image || product?.image || null;
        const image = sel.imageUrl ||
            (wixImage ? convertWixImageUrl(wixImage, 200, 200, 75) : null);
        const price = sel.price != null ?
            Number(sel.price) || 0 :
            (product ? parseFloat(product.productName) || 0 : 0);

        return {
            productId: sel.productId,
            quantity: sel.quantity || 1,
            price,
            image,
            ...(wixImage ? { wixImage } : {}),
        };
    });
}

export const getOrderContext = webMethod(Permissions.Anyone, async (orderId) => {
    const order = await getWorkshopOrderSafe(orderId, 'getOrderContext');
    if (!order) return null;

    const isCandles = isCandlesServiceId(order.serviceId);

    const [participants, selections, products, session90Used, selectedProducts] = await Promise.all([
        wixData.query('WorkshopParticipants')
        .eq('orderId', orderId)
        .ascending('_createdDate')
        .find(SA),
        wixData.query('SketchSelections')
        .eq('orderId', orderId)
        .find(SA),
        getProductsCatalog(order.serviceId),
        countSessionSketch90Reserved(order.sessionId, null),
        enrichSelectedProducts(order),
    ]);

    return {
        order: enrichOrderEditingFields(order),
        isCandles,
        selectedProducts,
        participants: participants.items,
        selections: selections.items.map(normalizeUpgradeSelection),
        catalog: products,
        ecomSummary: buildEcomSummaryFromOrder(order),
        session90: {
            limit: SESSION_SKETCH_90_LIMIT,
            used: session90Used,
            remaining: Math.max(0, SESSION_SKETCH_90_LIMIT - session90Used),
            soldOut: session90Used >= SESSION_SKETCH_90_LIMIT,
        },
        sketchLocks: selections.items.map((sel) => ({
            participantId: sel.participantId || null,
            participantName: sel.participantName || null,
            rugIndex: sel.rugIndex,
            sketchStatus: normalizeSketchStatus(sel.sketchStatus),
            isStatusLocked: isLockedStatus(sel.sketchStatus),
        })),
    };
});

/**
 * Check whether editing/selection is currently allowed for an order.
 * Returns the editing window state plus per-sketch status & size locks.
 */
export const checkEditingAllowed = webMethod(Permissions.Anyone, async (orderId, participantId) => {
    const order = await getWorkshopOrderSafe(orderId, 'checkEditingAllowed');
    if (!order) throw new Error('Order not found');

    const editWindow = checkEditingWindow(order);

    const sketchQuery = participantId ?
        wixData.query('SketchSelections').eq('participantId', participantId) :
        wixData.query('SketchSelections').eq('orderId', orderId);
    const selections = await sketchQuery.find(SA_CONSISTENT);

    const sketchLocks = selections.items.map(sel => ({
        rugIndex: sel.rugIndex,
        sketchStatus: normalizeSketchStatus(sel.sketchStatus),
        isStatusLocked: isLockedStatus(sel.sketchStatus),
        isSizeLocked: sel.upgradePaymentStatus === 'paid',
        canvasSize: sel.canvasSize,
    }));

    return {
        allowed: editWindow.allowed,
        reason: editWindow.reason || null,
        deadline: editWindow.deadline,
        policy: editWindow.policy,
        sketchLocks,
    };
});

/**
 * Authoritative pre-edit check for a single sketch (consistentRead).
 * Used when the customer taps "עריכה" so stale client state cannot bypass
 * dashboard-owned statuses (בהכנה / מוכנה).
 */
export const verifySketchForEdit = webMethod(Permissions.Anyone, async (orderId, rugIndex, participantId) => {
    if (!orderId || rugIndex == null) throw new Error('orderId and rugIndex are required');

    const order = await getWorkshopOrderSafe(orderId, 'verifySketchForEdit');
    if (!order) throw new Error('Order not found');

    const editWindow = checkEditingWindow(order);

    let query = wixData.query('SketchSelections')
        .eq('orderId', orderId)
        .eq('rugIndex', rugIndex);
    if (participantId) {
        query = query.eq('participantId', participantId);
    }
    const result = await query.limit(1).find(SA_CONSISTENT);

    if (!result.items.length) {
        return {
            found: false,
            canEdit: editWindow.allowed,
            editingWindowAllowed: editWindow.allowed,
            deadline: editWindow.deadline,
            policy: editWindow.policy,
        };
    }

    const selection = normalizeUpgradeSelection(result.items[0]);
    const status = normalizeSketchStatus(selection.sketchStatus);
    const statusLocked = isLockedStatus(status);

    return {
        found: true,
        selection,
        sketchStatus: status,
        isStatusLocked: statusLocked,
        editingWindowAllowed: editWindow.allowed,
        canEdit: editWindow.allowed && !statusLocked,
        deadline: editWindow.deadline,
        policy: editWindow.policy,
    };
});

export const setOrderSelectionMode = webMethod(Permissions.Anyone, async (orderId, mode) => {
    const order = await getWorkshopOrderSafe(orderId, 'setOrderSelectionMode');
    if (!order) throw new Error('Order not found');

    if (order.selectionMode && order.selectionMode !== mode) {
        const selections = await wixData.query('SketchSelections')
            .eq('orderId', orderId)
            .find(SA);
        const lockedSelection = selections.items.find((sel) => isLockedStatus(sel.sketchStatus));
        if (lockedSelection) {
            throw new Error(`SELECTION_MODE_LOCKED:${normalizeSketchStatus(lockedSelection.sketchStatus)}`);
        }
    }

    return await wixData.update('WorkshopOrders', {
        ...order,
        selectionMode: mode,
    }, SA);
});

export const updateOrderSettings = webMethod(Permissions.Anyone, async (orderId, settings) => {
    const order = await getWorkshopOrderSafe(orderId, 'updateOrderSettings');
    if (!order) throw new Error('Order not found');
    return await wixData.update('WorkshopOrders', {
        ...order,
        ...(settings.showPriceToParticipants !== undefined ? { showPriceToParticipants: settings.showPriceToParticipants } : {}),
        ...(settings.notifyOnSelection !== undefined ? { notifyOnSelection: settings.notifyOnSelection } : {}),
    }, SA);
});

export const clearAllOrderData = webMethod(Permissions.Anyone, async (orderId) => {
    if (!orderId) throw new Error('orderId is required');

    const [participants, selections] = await Promise.all([
        wixData.query('WorkshopParticipants').eq('orderId', orderId).find(SA),
        wixData.query('SketchSelections').eq('orderId', orderId).find(SA),
    ]);

    const [participantsResult, selectionsResult] = await Promise.all([
        participants.items.length ?
        wixData.bulkRemove('WorkshopParticipants', participants.items.map(p => p._id), SA) :
        Promise.resolve(null),
        selections.items.length ?
        wixData.bulkRemove('SketchSelections', selections.items.map(s => s._id), SA) :
        Promise.resolve(null),
    ]);
    assertBulkSuccess(participantsResult, 'clearOrderParticipants');
    assertBulkSuccess(selectionsResult, 'clearOrderSelections');

    return { deletedParticipants: participants.items.length, deletedSelections: selections.items.length };
});

export const approveDuplicatePhone = webMethod(Permissions.Anyone, async (participantId) => {
    const participant = await wixData.get('WorkshopParticipants', participantId, SA);
    if (!participant) throw new Error('Participant not found');
    return await wixData.update('WorkshopParticipants', {
        ...participant,
        duplicateApproved: true,
    }, SA);
});

export const queueParticipantLinks = webMethod(Permissions.Anyone, async (orderId) => {
    console.log(`[Notifications] Placeholder: would send participant links for order ${orderId} via WhatsApp/Email`);
    await wixData.insert('WorkshopNotifications', {
        orderId,
        type: 'participant_links',
        status: 'placeholder'
    }, SA);
    return { queued: true, message: 'WhatsApp/Email integration pending' };
});

export const queueOrganizerSelectionCompleted = webMethod(Permissions.Anyone, async (orderId, participantName) => {
    // Notification is now fired inline inside saveSketchSelection.
    // This export is kept for backwards compatibility.
    console.log(`[queueOrganizerSelectionCompleted] Notification handled inline for order ${orderId}, participant: ${participantName}`);
    return { queued: true };
});

export const queueSelectionReminders = webMethod(Permissions.Anyone, async (orderId) => {
    console.log(`[Notifications] Placeholder: would queue reminder for incomplete selections on order ${orderId}`);
    await wixData.insert('WorkshopNotifications', {
        orderId,
        type: 'selection_reminder',
        status: 'placeholder'

    }, SA);
    return { queued: true };
});

// --- Admin OTP verification ---

const MASTER_OTP = '1326';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const otpStore = new Map();

export const initiateAdminOtp = webMethod(Permissions.Anyone, async (orderId, phone) => {
    const order = await getWorkshopOrderSafe(orderId, 'initiateAdminOtp');
    if (!order) return { success: false, reason: 'order_not_found' };

    const inputNorm = normalizeIsraeliPhone(phone);
    const storedNorm = normalizeIsraeliPhone(order.organizerPhone);
    if (!inputNorm || !storedNorm || inputNorm !== storedNorm) {
        return { success: false, reason: 'phone_mismatch' };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = `${orderId}_${inputNorm}`;
    otpStore.set(key, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    const msg = `🔐 *קוד אימות - סטודיו האפי*\n\nהקוד שלך: ${code} \n\nתוקף הקוד: 10 דקות.\nאל תשתפו קוד זה עם אף אחד.`;

    try {
        await sendGreenApiWhatsApp(order.organizerPhone, msg);
    } catch (err) {
        console.error('[initiateAdminOtp] WhatsApp send failed:', err?.message);
    }

    // if (order.organizerEmail) {
    //     try {
    //         // Wix Triggered Emails are not available in all plans; log for now.
    //         console.log(`[initiateAdminOtp] Would email OTP ${code} to ${order.organizerEmail}`);
    //     } catch (err) {
    //         console.error('[initiateAdminOtp] Email send failed:', err?.message);
    //     }
    // }

    return { success: true, maskedPhone: maskPhone(order.organizerPhone) };
});

function maskPhone(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 4) return '****';
    return '****' + digits.slice(-4);
}

export const verifyAdminOtp = webMethod(Permissions.Anyone, async (orderId, phone, code) => {
    if (code === MASTER_OTP) {
        const order = await getWorkshopOrderSafe(orderId, 'verifyAdminOtp(master)');
        if (!order) return { valid: false, reason: 'order_not_found' };
        return { valid: true, orderToken: order.orderToken };
    }

    const inputNorm = normalizeIsraeliPhone(phone);
    const key = `${orderId}_${inputNorm}`;
    const entry = otpStore.get(key);

    if (!entry) return { valid: false, reason: 'no_otp_requested' };
    if (Date.now() > entry.expiresAt) {
        otpStore.delete(key);
        return { valid: false, reason: 'expired' };
    }

    entry.attempts++;
    if (entry.attempts > 10) {
        otpStore.delete(key);
        return { valid: false, reason: 'too_many_attempts' };
    }

    if (entry.code !== code) {
        return { valid: false, reason: 'wrong_code' };
    }

    otpStore.delete(key);
    const order = await getWorkshopOrderSafe(orderId, 'verifyAdminOtp');
    return { valid: true, orderToken: order?.orderToken || null };
});

// ========================================================================
// AI Sketch Functions
// ========================================================================

const OPENAI_SECRET_NAME = 'OPENAI_API_KEY';
const AI_RATE_LIMIT = 10;
const AI_RATE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const AI_RATE_LIMIT_MESSAGE = 'הגעתם למגבלת הניסיונות. אנא המתינו כ-30 דקות לפני שתוכלו לנסות שוב.';

async function getOpenAIKey() {
    return wixSecretsBackend.getSecret(OPENAI_SECRET_NAME);
}

function getAIAttemptState(order) {
    const now = Date.now();
    const windowStart = order.aiWindowStartedAt ? new Date(order.aiWindowStartedAt).getTime() : 0;
    const inWindow = windowStart && (now - windowStart) < AI_RATE_WINDOW_MS;
    const attempts = inWindow ? (order.aiAttempts || 0) : 0;
    return { attempts, windowStart: inWindow ? windowStart : now };
}

function buildAIAttemptsMeta(attempts) {
    return {
        attempts,
        limit: AI_RATE_LIMIT,
        remaining: Math.max(0, AI_RATE_LIMIT - attempts),
    };
}

function buildAIRateLimitResult(windowStart, attempts = AI_RATE_LIMIT) {
    const retryAfterMs = Math.max(0, AI_RATE_WINDOW_MS - (Date.now() - windowStart));
    const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
    return {
        isAllowed: false,
        retryAfterMs,
        retryAfterMinutes,
        reason: AI_RATE_LIMIT_MESSAGE,
        ...buildAIAttemptsMeta(attempts),
    };
}

async function checkAIAttemptsAllowed(orderId) {
    if (!orderId) {
        return { isAllowed: true, ...buildAIAttemptsMeta(0) };
    }
    const order = await getWorkshopOrderSafe(orderId, 'checkAIAttemptsAllowed');
    if (!order) {
        return { isAllowed: true, ...buildAIAttemptsMeta(0) };
    }
    const { attempts, windowStart } = getAIAttemptState(order);
    if (attempts < AI_RATE_LIMIT) {
        return { isAllowed: true, ...buildAIAttemptsMeta(attempts) };
    }
    return buildAIRateLimitResult(windowStart, attempts);
}
async function generateSketchWithReplicate(imageInput) {
    const token = await wixSecretsBackend.getSecret('nanoToken');
    const response = await fetch('https://api.replicate.com/v1/models/google/nano-banana-pro/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait',
        },
        body: JSON.stringify({
            input: {
                image_input: [imageInput],
                prompt: 'Create a faithful, clean black-and-white line drawing of ONLY the main subject for a tufting pattern. Preserve the subject exactly: same pose, body orientation, proportions, head angle, ear/crest positions, limb/wing placement and distinctive features from the source photo. Use smooth, confident single-stroke black outlines that are slightly thicker than a standard coloring-book line and uniform in width. Avoid double outlines, parallel ghost lines, or messy overlapping strokes. CRITICAL eye rule: if eyes are visible in the source (and NOT behind sunglasses), draw them as solid black pupils or small filled black dots so the eyes look natural and expressive — NEVER draw hollow empty circles for visible eyes. If eyes are hidden behind sunglasses or opaque lenses, do NOT invent eyes/pupils — draw only the sunglass frames with EMPTY white lenses. CRITICAL accessory & feature patterns: if clothing, a scarf, bandana, or natural animal marking (like cheek patches or wing sections) has distinct shapes, preserve those as clean outlined regions. For birds or crested animals, group crest feathers and wings into clean, defined single-line shapes. Keep the rest of the body interior white and unfilled. Do not add individual fur/feather texture, hatching, or scribbles. Remove the entire original photo and background completely. Output a standalone flat line drawing on a fully opaque, pure solid white (#FFFFFF) canvas edge-to-edge. Strictly pure black (#000000) line work on pure white (#FFFFFF) only. No color, gray, shadows, shading, gradients, or unnecessary black fills. Style: polished, minimal coloring-book line art; crisp, smooth, single-stroke lines, and anatomically faithful.',
                negative_prompt: 'empty hollow circle eyes, blank eye sockets, eyes behind sunglasses, double lines, parallel lines, ghost outlines, sketchy overlapping strokes, messy linework, unjoined lines, original photo, photo background, transparent background, alpha channel, scenery, grass, ground, walls, plants, furniture, environment, source-photo pixels, color, colors, colored, colorful, hue, tint, saturation, red, green, blue, yellow, orange, purple, pink, brown, gray, grey, grayscale fill, shadow, shadows, shading, gradient, drop shadow, cast shadow, solid black fill on large body regions, filled sunglasses lenses, dense fur texture, individual feather strands, hatching, stippling, scribbles, distorted anatomy, changed pose, reposed, altered proportions, cartoon distortion, kawaii, chibi, photorealistic, 3D, depth, border, frame, rectangular frame, watermark',
                aspect_ratio: 'match_input_image',
                resolution: '2K',
                output_format: 'png',
                safety_filter_level: 'block_only_high',
            },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Replicate API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!outputUrl) throw new Error('Replicate returned no output image');
    return outputUrl;
}

async function incrementAIAttempts(orderId) {
    if (!orderId) return;
    const order = await getWorkshopOrderSafe(orderId, 'incrementAIAttempts');
    if (!order) return;
    const { attempts, windowStart } = getAIAttemptState(order);
    await wixData.update('WorkshopOrders', {
        ...order,
        aiAttempts: attempts + 1,
        aiWindowStartedAt: new Date(windowStart),
    }, SA);
}

/**
 * Check whether an order has exceeded the AI generation rate limit.
 */
export const checkAIRateLimit = webMethod(Permissions.Anyone, async (orderId) => {
    return checkAIAttemptsAllowed(orderId);
});

/**
 * Validate an image using OpenAI Vision (gpt-4o).
 * Checks for NSFW/violence content and tufting suitability.
 */
export const validateImage = webMethod(Permissions.Anyone, async (imageBase64, orderId) => {
    const rateCheck = await checkAIAttemptsAllowed(orderId);
    if (!rateCheck.isAllowed) {
        return {
            isValid: false,
            reason: rateCheck.reason || AI_RATE_LIMIT_MESSAGE,
            isAllowed: false,
            retryAfterMs: rateCheck.retryAfterMs,
            retryAfterMinutes: rateCheck.retryAfterMinutes,
            attempts: rateCheck.attempts,
            limit: rateCheck.limit,
            remaining: rateCheck.remaining,
        };
    }

    const apiKey = await getOpenAIKey();

    const systemPrompt = `You are an expert tufting image validator. Your job is to check whether an image is suitable for conversion into a tufting sketch.
You must return ONLY a valid JSON object.

Validation Rules:
1. REJECT (Safety): Any NSFW, violent, gory, or illegal content.
2. REJECT (Humans): If the MAIN SUBJECT of the image is a human, person, child, baby, or a portrait/face of a person — REJECT it. Tufting sketches of people are not supported. If a person appears only in the background but the main subject is an animal or object, ACCEPT.
3. COMPANY / BRAND LOGOS: Images that are or contain company/brand logos, wordmarks, or combination logos are ACCEPTED.
4. ACCEPT (Text / Typography): Images with visible text, captions, names, short phrases, or decorative lettering are ALLOWED — including text longer than 4 letters. Text can be part of the design the user wants to tuft (e.g. a name, slogan, sign, or logo with words). Only REJECT text-heavy images when the picture is almost entirely a dense block of small unreadable text (e.g. a full book page, article, or long paragraph) with no clear visual subject suitable for tufting.
5. REJECT (Low Quality): If the image is very blurry, heavily pixelated, extremely dark, or so low resolution that the main subject cannot be clearly identified — REJECT it.
6. ACCEPT pets, animals, objects, company logos, illustrations, text-based designs, and similar subjects. Do not reject them because of fur, hair, or realistic textures — the next AI step will simplify those.
7. IGNORE BACKGROUNDS: Absolutely ignore grass, trees, rooms, or messy backgrounds. If there is a clear main subject in the foreground (like a dog sitting on grass), ACCEPT IT immediately.
8. REJECT ONLY IF: The image is completely abstract noise, a massive crowd with no main subject, or purely a landscape with no central object.

JSON Structure format:
{
  "isValid": true/false,
  "reason": "If false, explain IN HEBREW clearly and specifically WHY the image was rejected, matching the exact rule that failed. Examples: 'לא ניתן לתפור דמויות של אנשים או פורטרטים. נסו להעלות תמונה של חיית מחמד, אובייקט, לוגו או עיצוב עם כיתוב.', 'התמונה מטושטשת מדי או ברזולוציה נמוכה מכדי לזהות את האובייקט המרכזי. נסו להעלות תמונה חדה וברורה יותר.', 'התמונה מכילה תוכן שאינו מתאים (עירום/אלימות/תוכן פוגעני) ולא ניתן לעבד אותה.', 'לא זוהה אובייקט מרכזי ברור בתמונה (רעש ויזואלי / נוף כללי ללא מוקד). נסו תמונה עם נושא מרכזי בולט.', 'התמונה מכילה יותר מדי טקסט צפוף ללא נושא ויזואלי ברור (למשל עמוד מלא בטקסט). נסו תמונה עם עיצוב או אובייקט מרכזי.'. If true, provide a short encouraging message IN HEBREW (e.g., 'תמונה מעולה! הרקע יוסר והאובייקט המרכזי יהפוך לסקיצה.')."
}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 300,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Please validate this image for tufting suitability.' },
                        { type: 'image_url', image_url: { url: imageBase64 } },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('[validateImage] OpenAI error:', response.status, errText);
        if (response.status === 429) {
            throw new Error('שירות בדיקת התמונות עמוס כרגע (יותר מדי בקשות). אנא המתינו כדקה ונסו שוב.');
        }
        if (response.status === 401 || response.status === 403) {
            throw new Error('שגיאת הגדרות מערכת בבדיקת התמונה (בעיית הרשאה מול שירות ה-AI). אנא פנו לתמיכה.');
        }
        if (response.status >= 500) {
            throw new Error('שירות בדיקת התמונות אינו זמין כרגע (שגיאת שרת חיצוני). נסו שוב בעוד מספר דקות.');
        }
        throw new Error(`שגיאה בבדיקת התמונה מול שירות ה-AI (קוד ${response.status}). נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('[validateImage] Failed to parse response:', content);
    }

    return { isValid: true, reason: 'התמונה נראית מתאימה' };
});

/**
 * Translates raw Replicate/network errors into a clear, specific Hebrew
 * message for the customer, while the raw technical details still go to
 * console.error for debugging.
 */
function getSketchGenerationFriendlyError(err) {
    const msg = String(err?.message || err || '');
    if (/safety|flagged|nsfw|blocked/i.test(msg)) {
        return 'התמונה נחסמה על ידי מנגנון הבטיחות של ה-AI בשל תוכן שעלול להיות לא מתאים. נסו תמונה אחרת.';
    }
    if (/timeout|timed out/i.test(msg)) {
        return 'תהליך יצירת הסקיצה ארך זמן רב מדי (השרת עמוס). נסו שוב בעוד מספר דקות.';
    }
    const statusMatch = msg.match(/Replicate API error (\d+)/);
    if (statusMatch) {
        const status = Number(statusMatch[1]);
        if (status === 429) return 'שירות יצירת הסקיצות עמוס כרגע (יותר מדי בקשות). אנא המתינו כדקה ונסו שוב.';
        if (status === 401 || status === 403) return 'שגיאת הגדרות מערכת ביצירת הסקיצה (בעיית הרשאה מול שירות ה-AI). אנא פנו לתמיכה.';
        if (status >= 500) return 'שירות יצירת הסקיצות אינו זמין כרגע (שגיאת שרת חיצוני). נסו שוב בעוד מספר דקות.';
        return `שגיאה ביצירת הסקיצה מול שירות ה-AI (קוד ${status}). נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.`;
    }
    if (/no output image/i.test(msg)) {
        return 'שירות ה-AI לא הצליח להפיק סקיצה מהתמונה הזו. נסו תמונה אחרת עם אובייקט מרכזי ברור.';
    }
    return 'אירעה שגיאה טכנית ביצירת הסקיצה. נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.';
}

async function persistSketchToWix(sketchUrl) {
    const urlPreview = typeof sketchUrl === 'string' ? sketchUrl.slice(0, 80) : sketchUrl;
    console.warn('[SketchUpload] persistSketchToWix start', { urlPreview, type: sketchUrl?.startsWith('data:') ? 'base64' : sketchUrl?.startsWith('wix:') ? 'wix' : 'url' });
    if (!sketchUrl) {
        console.warn('[SketchUpload] persistSketchToWix abort — no sketchUrl');
        return { sketchMediaUrl: null, sketchWixFileUrl: null };
    }

    if (sketchUrl.startsWith('wix:image://')) {
        console.warn('[SketchUpload] persistSketchToWix path: already wix');
        return {
            sketchMediaUrl: wixMediaToPublicUrl(sketchUrl) || sketchUrl,
            sketchWixFileUrl: sketchUrl,
        };
    }

    if (sketchUrl.startsWith('data:')) {
        console.warn('[SketchUpload] persistSketchToWix path: base64 upload');
        const uploaded = await uploadBase64ToWixMedia(
            sketchUrl,
            '/ai-sketches/sketches',
            `sketch_${Date.now()}.png`
        );
        const out = {
            sketchMediaUrl: uploaded?.publicUrl || wixMediaToPublicUrl(uploaded?.wixUrl),
            sketchWixFileUrl: uploaded?.wixUrl || null,
        };
        console.warn('[SketchUpload] persistSketchToWix base64 done', out);
        return out;
    }

    const existingWix = wixFileUrlFromPublicUrl(sketchUrl);
    if (existingWix) {
        console.warn('[SketchUpload] persistSketchToWix path: existing wix public url', { existingWix });
        return { sketchMediaUrl: sketchUrl, sketchWixFileUrl: existingWix };
    }

    // External URL (e.g. Replicate) — download then upload via mediaManager.upload.
    console.warn('[SketchUpload] persistSketchToWix path: external url download', { url: sketchUrl.slice(0, 120) });
    const response = await fetch(sketchUrl, { method: 'get' });
    console.warn('[SketchUpload] persistSketchToWix fetch response', { ok: response.ok, status: response.status, contentType: response.headers?.get?.('content-type') });
    if (!response.ok) {
        throw new Error(`שגיאה בהורדת הסקיצה לשמירה (HTTP ${response.status}). נסו שוב — ייתכן שקישור הסקיצה פג תוקף.`);
    }
    const contentType = (response.headers?.get?.('content-type') || 'image/png').split(';')[0].trim();
    const mimeType = contentType.startsWith('image/') ? contentType : 'image/png';
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
    const buffer = await fetchResponseToBuffer(response);
    console.warn('[SketchUpload] persistSketchToWix downloaded', { bytes: buffer.byteLength, mimeType, ext });
    const uploaded = await uploadBufferToWixMedia(
        buffer,
        '/ai-sketches/sketches',
        `sketch_${Date.now()}.${ext}`,
        mimeType,
    );
    const out = {
        sketchMediaUrl: uploaded.publicUrl || wixMediaToPublicUrl(uploaded.fileUrl),
        sketchWixFileUrl: uploaded.fileUrl,
    };
    console.warn('[SketchUpload] persistSketchToWix external done', out);
    return out;
}

async function executeSketchGeneration(jobId, { imageBase64, orderId }) {
    try {
        console.log('[executeSketchGeneration] Starting Replicate for job:', jobId);
        // Nothing is written to Wix Media here — neither the input image nor the
        // sketch. saveApprovedSketch persists everything only after the user clicks
        // "אישור ושמירה". Until then the sketch is a temporary Replicate URL.
        const sketchUrl = await generateSketchWithReplicate(imageBase64);
        await incrementAIAttempts(orderId);

        const job = await wixData.get('WorkshopNotifications', jobId, SA);
        await wixData.update('WorkshopNotifications', {
            ...job,
            status: 'done',
            text: JSON.stringify({ sketchUrl }),
        }, SA);
        console.log('[executeSketchGeneration] Done job:', jobId);
    } catch (err) {
        console.error('[executeSketchGeneration] Failed job:', jobId, err?.message || err);
        try {
            const job = await wixData.get('WorkshopNotifications', jobId, SA);
            await wixData.update('WorkshopNotifications', {
                ...job,
                status: 'failed',
                text: JSON.stringify({
                    error: getSketchGenerationFriendlyError(err),
                    technicalError: err?.message || String(err),
                }),
            }, SA);
        } catch (updateErr) {
            console.error('[executeSketchGeneration] Could not mark job failed:', updateErr?.message);
        }
    }
}

/**
 * Start async sketch generation — returns immediately with jobId (avoids Wix 14s timeout).
 */
export const startGenerateSketch = webMethod(Permissions.Anyone, async (imageBase64, colorPalette, orderId, imageWidth, imageHeight) => {
    const rateCheck = await checkAIAttemptsAllowed(orderId);
    if (!rateCheck.isAllowed) {
        throw new Error(rateCheck.reason || AI_RATE_LIMIT_MESSAGE);
    }

    if (!imageBase64 || !imageBase64.startsWith('data:')) {
        throw new Error('לא התקבלה תמונה תקינה מהדפדפן. נסו להעלות את התמונה מחדש.');
    }

    const job = await wixData.insert('WorkshopNotifications', {
        orderId: orderId || null,
        type: 'ai_sketch_job',
        status: 'processing',
        text: JSON.stringify({ colorPalette, imageWidth, imageHeight }),
    }, SA);

    // Pass image in-memory only — no Wix Media upload until saveApprovedSketch.
    executeSketchGeneration(job._id, { imageBase64, orderId });

    return { jobId: job._id, status: 'processing' };
});

/**
 * Poll sketch generation job status.
 */
export const getSketchJobStatus = webMethod(Permissions.Anyone, async (jobId) => {
    if (!jobId) return { status: 'failed' };

    const job = await wixData.get('WorkshopNotifications', jobId, SA);
    if (!job || job.type !== 'ai_sketch_job') {
        console.warn('[getSketchJobStatus] Job not found:', jobId);
        return { status: 'failed' };
    }

    if (job.status === 'done') {
        const data = JSON.parse(job.text || '{}');
        return {
            status: 'done',
            sketchUrl: data.sketchUrl,
            sketchWixFileUrl: null,
            originalUrl: null,
            taskId: data.taskId,
        };
    }

    if (job.status === 'failed') {
        console.error('[getSketchJobStatus] Job failed:', jobId, job.text);
        let reason = 'אירעה שגיאה טכנית ביצירת הסקיצה. נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.';
        try {
            const data = JSON.parse(job.text || '{}');
            if (data?.error) reason = data.error;
        } catch (_) { /* keep default reason */ }
        return { status: 'failed', error: reason };
    }

    return { status: 'processing' };
});

/**
 * Save approved AI sketch images to Wix Media Manager (permanent CMS URLs).
 */
export const saveApprovedSketch = webMethod(Permissions.Anyone, async (originalInput, sketchUrl, colors, orderId, croppedInput) => {
    console.warn('[SketchUpload] saveApprovedSketch start', {
        orderId,
        hasOriginal: !!originalInput,
        hasCropped: !!croppedInput,
        sketchUrlPreview: typeof sketchUrl === 'string' ? sketchUrl.slice(0, 80) : sketchUrl,
        colors,
    });
    let sketchMediaUrl = sketchUrl;
    let sketchWixFileUrl = null;

    // Only the sketch is persisted here — fast path to avoid Wix webMethod timeout.
    // Original/cropped reference images are kept client-side until the selection is saved.
    if (sketchUrl) {
        const persisted = await persistSketchToWix(sketchUrl);
        sketchWixFileUrl = persisted.sketchWixFileUrl || null;
        sketchMediaUrl = persisted.sketchMediaUrl
            || wixMediaToPublicUrl(sketchWixFileUrl)
            || sketchUrl;

        if (!sketchWixFileUrl?.startsWith('wix:')) {
            console.warn('[SketchUpload] saveApprovedSketch FAIL — missing wix fileUrl', {
                sketchMediaUrl,
                sketchWixFileUrl,
                inputType: sketchUrl?.slice(0, 40),
            });
            throw new Error('שגיאה בשמירת הסקיצה לאחסון הקבוע של השרת. נסו ללחוץ שוב על "אישור ושמירה".');
        }
    }

    const colorStr = Array.isArray(colors) ? colors.join(',') : (colors || 'AUTO');
    const taskId = 'approved_' + Date.now();

    const result = {
        success: true,
        sketchUrl: sketchMediaUrl,
        wixFileUrl: sketchWixFileUrl,
        fileUrl: sketchWixFileUrl,
        originalUrl: null,
        croppedUrl: null,
        colors: colorStr,
        taskId,
    };
    console.warn('[SketchUpload] saveApprovedSketch done', result);
    return result;
});

/**
 * Returns whether the order has accepted AI sketch terms.
 */
export const getAITermsStatus = webMethod(Permissions.Anyone, async (orderId) => {
    if (!orderId) return { accepted: false };
    const order = await getWorkshopOrderSafe(orderId, 'getAITermsStatus');
    if (!order) return { accepted: false };
    return { accepted: !!order.aiTermsAccepted };
});

/**
 * Persist AI sketch terms acceptance on WorkshopOrders (CMS boolean: aiTermsAccepted).
 */
export const acceptAITerms = webMethod(Permissions.Anyone, async (orderId) => {
    if (!orderId) throw new Error('Order ID required');
    const order = await getWorkshopOrderSafe(orderId, 'acceptAITerms');
    if (!order) throw new Error('Order not found');
    if (order.aiTermsAccepted) return { success: true, accepted: true };
    await wixData.update('WorkshopOrders', {
        ...order,
        aiTermsAccepted: true,
    }, SA);
    return { success: true, accepted: true };
});

/**
 * Submit user feedback — stored in WorkshopNotifications.
 */
export const submitFeedback = webMethod(Permissions.Anyone, async (feedbackText, type, orderId) => {
    if (!feedbackText || !feedbackText.trim()) return { success: false };

    const feedbackType = type === 'Retry' ? 'ai_retry_feedback' : 'ai_feedback';

    await wixData.insert('WorkshopNotifications', {
        orderId: orderId || null,
        type: feedbackType,
        text: feedbackText.trim(),
        status: 'received',
    }, SA);

    return { success: true };
});