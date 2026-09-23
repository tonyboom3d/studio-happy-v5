import { ok, badRequest, serverError, response } from 'wix-http-functions';
import { availabilityCalendar } from 'wix-bookings.v2';
import wixSecretsBackend from 'wix-secrets-backend';
import { checkRateLimit, checkGuardrails, detectHandoff, HANDOFF_REPLY_DEFAULT } from 'backend/aiGuardrails.js';
import {
  tagHandoff,
  syncAiResponseFields,
  syncOrderLookupFields,
  incrementOrderLookupAttempts,
  syncRescheduleLink,
} from 'backend/manychatService.jsw';
import { createConversation, createResponse, extractReplyText } from 'backend/openaiService.jsw';
import { getUserConversation, upsertUserConversation } from 'backend/userConversationsStore.js';
import { detectSuggestedAction, finalizeRoutedReply } from 'backend/aiRouting.js';
import { buildWorkshopPolicyReply, isGeneralWorkshopSelection } from 'backend/policyContent.js';
import {
  WORKSHOP_SERVICE_IDS,
  WORKSHOP_TYPE_LABELS_HE as WORKSHOP_TYPE_LABELS_MAP,
  resolveWorkshopType,
  expandCandlesServiceIds,
  isCandlesLimitedSlotAllowed,
  CANDLES_LIMITED_SERVICE_ID,
} from 'backend/workshopServiceIds.js';
import {
  findOrdersByPhone,
  formatOrderMessage,
  filterActiveOrders,
  selectActiveOrder,
  NO_ACTIVE_ORDER_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  NO_MORE_ORDERS_MESSAGE,
  getRescheduleEligibility,
  isRescheduleBlockedWithin48h,
  hasCustomerRescheduleUsed,
  hasOpenRescheduleRequest,
  resolveCmsOrderWorkshopTypeKey,
} from 'backend/orderLookupService.js';
import { formatIsraeliPhoneLocal } from 'backend/orderUtils.js';
import {
  sendOrderLookupOtp,
  verifyOrderLookupOtp,
  buildVerificationCheckResponse,
} from 'backend/orderLookupOtpService.js';
import wixData from 'wix-data';
import { issueRescheduleToken, confirmRescheduleRequest } from 'backend/rescheduleService.web.js';

// ============================================================
// ManyChat availability endpoint
// GET /_functions/availableDates?workshopType=tufting&offset=0
// ============================================================

const ISRAEL_TZ = 'Asia/Jerusalem';
const PAGE_SIZE = 10;
const QUERY_CHUNK_DAYS = 45;
const MAX_LOOKAHEAD_DAYS = 365;

const WORKSHOP_TYPE_LABELS_HE = ['טאפטינג', 'נרות', 'תכשיטים', "צ'ארמס", 'קרמיקה'];

function israelDateKey(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatDateIL(d) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

function formatTimeIL(d) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

async function fetchAvailabilityChunk(serviceIds, startDate, endDate) {
  const options = { slotsPerDay: 100 };
  const results = await Promise.all(serviceIds.map(async (serviceId) => {
    try {
      const availability = await availabilityCalendar.queryAvailability({
        filter: {
          serviceId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      }, options);
      return availability.availabilityEntries || [];
    } catch (err) {
      console.warn(`[availableDates] availability error for service ${serviceId}:`, err?.message || err);
      return [];
    }
  }));
  return results.flat();
}

function isBookableEntry(entry, now) {
  if (!entry.bookable) return false;
  if (entry.locked) return false;
  if (entry.bookingPolicyViolations?.tooLateToBook) return false;
  if (!entry.openSpots || entry.openSpots <= 0) return false;
  const startDate = entry.slot?.startDate;
  if (!startDate) return false;
  return new Date(startDate).getTime() >= now.getTime();
}

/** Scans forward in date-range chunks until `neededCount` distinct future
 * bookable calendar dates are found (or MAX_LOOKAHEAD_DAYS is hit). */
async function collectAvailableDates(serviceIds, neededCount) {
  const now = new Date();
  const byDate = new Map(); // dateKey -> { dateObj, times: Set<string> }
  let chunkStart = new Date(now);
  let daysScanned = 0;

  while (byDate.size < neededCount && daysScanned < MAX_LOOKAHEAD_DAYS) {
    const chunkEnd = new Date(chunkStart.getTime() + QUERY_CHUNK_DAYS * 24 * 60 * 60 * 1000);
    const entries = await fetchAvailabilityChunk(serviceIds, chunkStart, chunkEnd);

    for (const entry of entries) {
      if (!isBookableEntry(entry, now)) continue;
      const startDateObj = new Date(entry.slot.startDate);
      const entryServiceId = entry.slot?.serviceId;
      if (entryServiceId === CANDLES_LIMITED_SERVICE_ID && !isCandlesLimitedSlotAllowed(startDateObj)) continue;
      const dateKey = israelDateKey(startDateObj);

      if (!byDate.has(dateKey)) byDate.set(dateKey, { dateObj: startDateObj, times: new Set() });
      const bucket = byDate.get(dateKey);
      bucket.times.add(formatTimeIL(startDateObj));
      if (startDateObj < bucket.dateObj) bucket.dateObj = startDateObj;
    }

    daysScanned += QUERY_CHUNK_DAYS;
    chunkStart = chunkEnd;
  }

  return byDate;
}

function buildNextPageUrl(request, workshopType, nextOffset) {
  try {
    const u = new URL(request.url);
    u.searchParams.set('workshopType', workshopType);
    u.searchParams.set('offset', String(nextOffset));
    return u.toString();
  } catch (_) {
    return null;
  }
}

function parseOffset(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value === 'null' || value === 'undefined') return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

// GET https://www.studiohappy.art/_functions/availableDates?workshopType=טאפטינג&offset=0
export async function get_availableDates(request) {
  try {
    const workshopTypeRaw = String(request.query.workshopType || '').trim();
    const workshopKey = resolveWorkshopType(workshopTypeRaw);
    const serviceIds = workshopKey
      ? (workshopKey === 'candles'
        ? expandCandlesServiceIds(WORKSHOP_SERVICE_IDS.candles, new Date())
        : WORKSHOP_SERVICE_IDS[workshopKey])
      : null;

    if (!serviceIds) {
      return badRequest({
        headers: { 'Content-Type': 'application/json' },
        body: {
          version: 'v2',
          content: {
            messages: [{
              type: 'text',
              text: `סוג סדנה לא תקין. השתמש באחד מהערכים: ${WORKSHOP_TYPE_LABELS_HE.join(' | ')}`,
            }],
          },
          error: 'invalid_workshopType',
        },
      });
    }

    const offset = parseOffset(request.query.offset);

    const neededCount = offset + PAGE_SIZE + 1;
    const byDate = await collectAvailableDates(serviceIds, neededCount);

    const sortedDates = [...byDate.values()].sort((a, b) => a.dateObj - b.dateObj);
    const pageSlice = sortedDates.slice(offset, offset + PAGE_SIZE);

    const dates = pageSlice.map(({ dateObj, times }) => {
      const sortedTimes = [...times].sort();
      return `${formatDateIL(dateObj)}: ${sortedTimes.join(' | ')}`;
    });

    const hasMore = sortedDates.length > offset + PAGE_SIZE;
    const nextOffset = hasMore ? offset + PAGE_SIZE : null;
    const nextPageUrl = hasMore ? buildNextPageUrl(request, workshopTypeRaw, nextOffset) : null;
    const datesText = dates.length ? dates.join('\n') : 'לא נמצאו תאריכים פנויים.';

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: {
        version: 'v2',
        content: { messages: [{ type: 'text', text: datesText }] },
        workshopType: workshopTypeRaw,
        offset,
        count: dates.length,
        dates,
        datesText,
        hasMore,
        nextOffset,
        nextPageUrl,
      },
    });
  } catch (err) {
    return serverError({ body: { error: String(err) } });
  }
}

// ============================================================
// AI Assistant for Workshops — ManyChat message endpoint (PRD §5)
// POST https://www.studiohappy.art/_functions/manychatMessage
// Body: { subscriber_id, user_message, current_workshop }
// Header: X-API-KEY (validated against "manychat_webhook_apiKey" secret)
//
// Response: { status, reply, needs_handoff, show_handoff_button,
//   show_action_button, ai_show_action (boolean), action_type, action_target, button_label }
// Booleans are also set via syncAiResponseFields() — External Request mapping is unreliable for Boolean CFs.
// ============================================================

const AI_DEFAULT_FALLBACK_TEXT = 'מצטערים, לא הצלחנו לענות כרגע 🙏';

function aiOkBody({ reply, needsHandoff = false, guardrail = false, action = null } = {}) {
  const text = String(reply || '').trim();
  if (action) {
    return {
      status: 'ok',
      reply: text,
      needs_handoff: false,
      show_handoff_button: false,
      show_action_button: true,
      ai_show_action: true,
      action_type: action.action_type,
      action_target: action.action_target,
      button_label: action.button_label,
      suggested_route: action.route,
      ...(guardrail ? { guardrail: true } : {}),
    };
  }
  const handoff = !!needsHandoff;
  return {
    status: 'ok',
    reply: text,
    needs_handoff: handoff,
    show_handoff_button: handoff,
    show_action_button: false,
    ai_show_action: false,
    action_type: '',
    action_target: '',
    button_label: '',
    suggested_route: '',
    ...(guardrail ? { guardrail: true } : {}),
  };
}

function getHeader(request, name) {
  const headers = request?.headers || {};
  const lower = String(name).toLowerCase();
  const key = Object.keys(headers).find((k) => k.toLowerCase() === lower);
  return key ? headers[key] : undefined;
}

/**
 * Finds-or-creates the UserConversations record + OpenAI Conversation for
 * this subscriber. checkRateLimit() may have already inserted a bare record
 * (rateWindowStart/rateCount only) — this fills in conversationId.
 */
async function resolveConversation(subscriberId) {
  let record = await getUserConversation(subscriberId);
  if (record?.conversationId) return record;

  const conversationId = await createConversation();
  record = await upsertUserConversation(subscriberId, { conversationId });
  return record || { _id: subscriberId, subscriberId, conversationId };
}

/**
 * Runs the OpenAI turn and returns reply text for ManyChat flow delivery.
 * Never throws — returns fallback reply on failure.
 */
function resolveWorkshopContext(workshopName, conversationRecord) {
  const current = String(workshopName || '').trim() || 'כללי';
  if (current !== 'כללי' && current !== 'General') return current;
  return String(conversationRecord?.lastWorkshop || '').trim() || current;
}

function buildAiInput({ userMessage, workshopName, conversationRecord, action }) {
  const contextWorkshop = resolveWorkshopContext(workshopName, conversationRecord);
  const intentLine = action ? `[Detected intent: ${action.route}]` : '';
  return [
    intentLine,
    `[Current workshop context: "${contextWorkshop}"]`,
    '[Note: follow-ups like "ומה לגבי" refer to prior messages — use conversation history.]',
    `User message: ${userMessage}`,
  ].filter(Boolean).join('\n');
}

async function handleAiTurn({ subscriberId, userMessage, workshopName, action = null }) {
  try {
    const conversationRecord = await resolveConversation(subscriberId);
    const routingAction = action || detectSuggestedAction(userMessage, workshopName);
    const input = buildAiInput({ userMessage, workshopName, conversationRecord, action: routingAction });
    const aiResponse = await createResponse({ conversationId: conversationRecord.conversationId, input });
    const rawReply = extractReplyText(aiResponse);

    if (!rawReply) {
      console.warn('[http-functions] Empty AI reply. subscriberId:', subscriberId);
      await upsertUserConversation(subscriberId, { lastActive: new Date(), lastWorkshop: workshopName });
      await tagHandoff(subscriberId, 'empty_ai_reply');
      return { reply: HANDOFF_REPLY_DEFAULT, needsHandoff: true };
    }

    const { needsHandoff, cleanedReply, reason } = detectHandoff(rawReply, userMessage);
    let finalReply = needsHandoff
      ? (cleanedReply || HANDOFF_REPLY_DEFAULT)
      : (cleanedReply || AI_DEFAULT_FALLBACK_TEXT);
    finalReply = finalizeRoutedReply(routingAction, finalReply);

    if (needsHandoff) {
      // console.log('[http-functions] Handoff triggered. subscriberId:', subscriberId, 'reason:', reason || 'unknown');
      await tagHandoff(subscriberId, reason || 'ai_or_keyword_trigger');
      await upsertUserConversation(subscriberId, {
        needsHumanReview: true,
        needsReviewAt: new Date(),
        lastActive: new Date(),
        lastWorkshop: workshopName,
      });
    } else {
      await upsertUserConversation(subscriberId, { lastActive: new Date(), lastWorkshop: workshopName });
    }

    if (routingAction) {
      // console.log('[http-functions] Route suggested. subscriberId:', subscriberId, 'route:', routingAction.route, 'target:', routingAction.action_target);
    }

    return { reply: finalReply, needsHandoff: routingAction ? false : needsHandoff, action: routingAction };
  } catch (err) {
    console.error('[http-functions] handleAiTurn failed. subscriberId:', subscriberId, 'error:', err?.message || err);
    await tagHandoff(subscriberId, 'ai_error').catch(() => {});
    return { reply: HANDOFF_REPLY_DEFAULT, needsHandoff: true, error: true };
  }
}

export async function post_manychatMessage(request) {
  try {
    const apiKeyHeader = getHeader(request, 'X-API-KEY');
    const expectedApiKey = await wixSecretsBackend.getSecret('manychat_webhook_apiKey').catch(() => null);
    if (!expectedApiKey || apiKeyHeader !== expectedApiKey) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    let payload;
    try {
      payload = await request.body.json();
    } catch (_) {
      return badRequest({ body: { status: 'error', error: 'invalid_json' } });
    }

    const subscriberId = String(payload?.subscriber_id || '').trim();
    const userMessage = String(payload?.user_message || '').trim();
    const workshopName = String(payload?.current_workshop || '').trim() || 'כללי';

    if (!subscriberId || !userMessage) {
      return badRequest({ body: { status: 'error', error: 'missing_subscriber_id_or_user_message' } });
    }

    // Rate limit — runs before guardrails/OpenAI (PRD §5 step 2, §9).
    const rate = await checkRateLimit(subscriberId);
    if (!rate.allowed) {
      console.warn('[http-functions] post_manychatMessage rate-limited. subscriberId:', subscriberId);
      const rateBody = aiOkBody({ reply: '', needsHandoff: false });
      await syncAiResponseFields(subscriberId, rateBody);
      return ok({
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'rate_limited', ...rateBody },
      });
    }

    const routingAction = detectSuggestedAction(userMessage, workshopName);

    // Guardrails — skip for known business routes (birthdays, orders, schedule).
    if (!routingAction) {
      const guard = await checkGuardrails(userMessage);
      if (guard.triggered) {
        const guardBody = aiOkBody({ reply: guard.fallbackMessage, guardrail: true });
        await syncAiResponseFields(subscriberId, guardBody);
        return ok({
          headers: { 'Content-Type': 'application/json' },
          body: guardBody,
        });
      }
    }

    const result = await handleAiTurn({ subscriberId, userMessage, workshopName, action: routingAction });

    const responseBody = aiOkBody({
      reply: result.reply,
      needsHandoff: result.needsHandoff,
      action: result.action || null,
    });
    await syncAiResponseFields(subscriberId, responseBody);

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: responseBody,
    });
  } catch (err) {
    console.error('[http-functions] post_manychatMessage failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

// ============================================================
// Workshop cancellation policy — CMS collection `Policys`
// GET https://www.studiohappy.art/_functions/workshopPolicy?current_workshop=...
// ManyChat External Request often sends POST → routes to use_workshopPolicy (same logic).
// Header: X-API-KEY (manychat_webhook_apiKey)
// Response: { status, ai_reply, current_workshop, mode }
// ============================================================

async function authorizeManyChatWebhook(request) {
  const apiKeyHeader = getHeader(request, 'X-API-KEY');
  const expectedApiKey = await wixSecretsBackend.getSecret('manychat_webhook_apiKey').catch(() => null);
  return !!(expectedApiKey && apiKeyHeader === expectedApiKey);
}

async function buildWorkshopPolicyResponse(workshopName) {
  const currentWorkshop = String(workshopName || '').trim() || 'כללי';
  const aiReply = await buildWorkshopPolicyReply(currentWorkshop);
  return {
    status: 'ok',
    ai_reply: aiReply,
    current_workshop: currentWorkshop,
    mode: isGeneralWorkshopSelection(currentWorkshop) ? 'all' : 'single',
  };
}

async function resolveWorkshopFromPolicyRequest(request) {
  const fromQuery = String(request.query?.current_workshop || '').trim();
  if (fromQuery) return fromQuery;

  try {
    const payload = await request.body.json();
    const fromBody = String(payload?.current_workshop || '').trim();
    if (fromBody) return fromBody;
  } catch (_) {
    // GET has no body — expected
  }

  return 'כללי';
}

async function runWorkshopPolicyEndpoint(request, label) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const workshopName = await resolveWorkshopFromPolicyRequest(request);
    const body = await buildWorkshopPolicyResponse(workshopName);

    return ok({ headers: { 'Content-Type': 'application/json' }, body });
  } catch (err) {
    console.error(`[http-functions] ${label} failed:`, err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

/** GET — browser / ManyChat GET External Request */
export async function get_workshopPolicy(request) {
  return runWorkshopPolicyEndpoint(request, 'get_workshopPolicy');
}

/** POST/PUT/etc. — ManyChat External Request (default method) */
export async function use_workshopPolicy(request) {
  return runWorkshopPolicyEndpoint(request, 'use_workshopPolicy');
}

// ============================================================
// Existing-order identification — ManyChat process 1 (PRD: "זיהוי הזמנה קיימת")
// GET .../identifyOrder?phone=...&subscriber_id=...&attempts={{order_lookup_attempts}}
// Next order: add &exclude_order_id={{order_lookup_order_id}} (does not increment attempts)
// Header: X-API-KEY (manychat_webhook_apiKey)
//
// phone: the ManyChat WhatsApp-ID phone field for the subscriber messaging the bot.
// subscriber_id: ManyChat subscriber id — used to write back order_lookup_* custom fields.
//
// Response: { status, found, has_more, order_id, ai_reply, content: { messages: [{ type: 'text', text }] } }
// ai_reply mirrors content.messages[0].text — map to ManyChat ai_reply custom field (same as workshopPolicy).
// ============================================================

/** Ignore unresolved ManyChat merge tags / wrong cuf_* ids sent as exclude_order_id. */
function sanitizeExcludeOrderId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/\{\{|\}\}/.test(s)) return '';
  if (/^cuf_\d+$/i.test(s)) return '';
  return s;
}

export async function get_identifyOrder(request) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const rawQuery = request.query || {};
    const phone = String(rawQuery.phone || '').trim();
    const subscriberId = String(rawQuery.subscriber_id || '').trim();
    const passedAttempts = rawQuery.attempts;
    const excludeOrderIdRaw = String(rawQuery.exclude_order_id || '').trim();
    const excludeOrderId = sanitizeExcludeOrderId(excludeOrderIdRaw);
    const isNextOrderRequest = !!excludeOrderId;

    console.log('[get_identifyOrder] REQUEST', JSON.stringify({
      phone,
      subscriber_id: subscriberId || null,
      attempts: passedAttempts ?? null,
      exclude_order_id_raw: excludeOrderIdRaw || null,
      exclude_order_id: excludeOrderId || null,
      is_next_order: isNextOrderRequest,
      query_param_keys: Object.keys(rawQuery),
      raw_query: rawQuery,
    }));

    if (!phone) {
      const missingPhoneBody = { status: 'error', error: 'missing_phone' };
      console.log('[get_identifyOrder] RESPONSE', JSON.stringify(missingPhoneBody));
      return badRequest({
        headers: { 'Content-Type': 'application/json' },
        body: missingPhoneBody,
      });
    }

    const allOrders = await findOrdersByPhone(phone).catch((err) => {
      console.error('[http-functions] get_identifyOrder findOrdersByPhone failed:', err?.message || err);
      return [];
    });

    const activeOrders = filterActiveOrders(allOrders);
    const hadUnavailableOnly = allOrders.length > 0 && activeOrders.length === 0;
    const orderLookupUnavailable = hadUnavailableOnly && !isNextOrderRequest;
    const selection = selectActiveOrder(activeOrders, excludeOrderId);
    const { primary, hasMore } = selection;
    const found = !!primary;
    const rescheduleEligibility = found ? getRescheduleEligibility(primary) : {
      reschedule_blocked_48h: false,
      reschedule_already_used: false,
    };

    let text;
    if (orderLookupUnavailable) {
      text = NO_ACTIVE_ORDER_MESSAGE;
    } else if (isNextOrderRequest && !found) {
      text = activeOrders.length > 0 ? NO_MORE_ORDERS_MESSAGE : ORDER_NOT_FOUND_MESSAGE;
    } else if (found) {
      text = formatOrderMessage(primary);
    } else {
      text = ORDER_NOT_FOUND_MESSAGE;
    }

    let lookupAttempts = 0;
    let lookupHandoff = false;

    if (subscriberId) {
      if (isNextOrderRequest) {
        const parsed = parseInt(String(passedAttempts ?? '').trim(), 10);
        lookupAttempts = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        lookupHandoff = lookupAttempts >= 3;
      } else {
        const attemptResult = await incrementOrderLookupAttempts(subscriberId, passedAttempts).catch((err) => {
          console.warn('[http-functions] incrementOrderLookupAttempts failed:', err?.message || err);
          return { attempts: 0, handoffRecommended: false };
        });
        lookupAttempts = attemptResult.attempts;
        lookupHandoff = attemptResult.handoffRecommended;
      }

      await syncOrderLookupFields(subscriberId, {
        status: found ? 'found' : 'not_found',
        hasMore,
        unavailable: orderLookupUnavailable ? true : false,
        orderId: found ? (primary?.id || '') : '',
        source: found ? (primary?.source || '') : '',
        orderUrl: found ? (primary?.orderUrl || '') : '',
        attempts: lookupAttempts,
        rescheduleBlocked48h: rescheduleEligibility.reschedule_blocked_48h,
        rescheduleAlreadyUsed: rescheduleEligibility.reschedule_already_used,
      }).catch(() => {});
    } else {
      console.warn('[get_identifyOrder] no subscriber_id — skipping ManyChat field sync');
    }

    console.log('[get_identifyOrder] LOOKUP', JSON.stringify({
      all_orders_count: allOrders.length,
      active_orders_count: activeOrders.length,
      orders_summary: allOrders.map((o) => ({
        id: o.id,
        source: o.source,
        workshopType: o.workshopType,
        workshopStart: o.workshopStart instanceof Date ? o.workshopStart.toISOString() : o.workshopStart,
        bookingsCancelled: !!o.bookingsCancelled,
        cancelledAt: !!o.cancelledAt,
      })),
      had_unavailable_only: hadUnavailableOnly,
      order_lookup_unavailable: orderLookupUnavailable,
      found,
      primary_order_id: primary?.id || null,
      reschedule: rescheduleEligibility,
      manychat_sync: subscriberId
        ? {
          status: found ? 'found' : 'not_found',
          unavailable: orderLookupUnavailable,
          lookup_attempts: lookupAttempts,
          ...rescheduleEligibility,
        }
        : null,
    }));

    const responseBody = {
      status: 'ok',
      found,
      has_more: hasMore,
      is_next_order: isNextOrderRequest,
      order_id: found ? (primary?.id || null) : null,
      order_source: found ? (primary?.source || null) : null,
      order_url: found ? (primary?.orderUrl || null) : null,
      order_lookup_unavailable: orderLookupUnavailable,
      ...rescheduleEligibility,
      lookup_attempts: lookupAttempts,
      lookup_handoff: lookupHandoff,
      ai_reply: text,
      content: { messages: [{ type: 'text', text }] },
    };

    console.log('[get_identifyOrder] RESPONSE', JSON.stringify(responseBody));

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: responseBody,
    });
  } catch (err) {
    console.error('[http-functions] get_identifyOrder failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

// ============================================================
// Existing-order identification — ManyChat process 2 (alternate phone + SMS OTP)
// Header: X-API-KEY (manychat_webhook_apiKey)
//
// GET .../checkOrderLookupVerification?verified_at={{order_lookup_verified_at}}
//   → { verification_valid, skip_otp, verified_at }
//
// GET .../sendOrderLookupOtp?phone=...&subscriber_id=...&attempts={{order_lookup_attempts}}
//   → sends 5-digit SMS; increments order_lookup_attempts on order-not-found / SMS failure
//
// GET .../verifyOrderLookupOtp?phone=...&code=...&subscriber_id=...&attempts={{order_lookup_attempts}}
//   → on success sets order_lookup_verified_at (valid 24h) + order fields
// ============================================================

async function resolveLookupAttempts(subscriberId, passedAttempts, shouldIncrement) {
  if (!subscriberId) return { lookupAttempts: 0, lookupHandoff: false };
  if (!shouldIncrement) {
    const parsed = parseInt(String(passedAttempts ?? '').trim(), 10);
    const lookupAttempts = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    return { lookupAttempts, lookupHandoff: lookupAttempts >= 3 };
  }
  const attemptResult = await incrementOrderLookupAttempts(subscriberId, passedAttempts).catch((err) => {
    console.warn('[http-functions] incrementOrderLookupAttempts failed:', err?.message || err);
    return { attempts: 0, handoffRecommended: false };
  });
  return { lookupAttempts: attemptResult.attempts, lookupHandoff: attemptResult.handoffRecommended };
}

export async function get_checkOrderLookupVerification(request) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const verifiedAtRaw = String(request.query?.verified_at || '').trim();
    const check = buildVerificationCheckResponse(verifiedAtRaw || null);

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: { status: 'ok', ...check },
    });
  } catch (err) {
    console.error('[http-functions] get_checkOrderLookupVerification failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

export async function get_sendOrderLookupOtp(request) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const phone = String(request.query?.phone || '').trim();
    const subscriberId = String(request.query?.subscriber_id || '').trim();
    const passedAttempts = request.query?.attempts;

    if (!phone) {
      return badRequest({
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'missing_phone' },
      });
    }

    const result = await sendOrderLookupOtp(phone);
    const { lookupAttempts, lookupHandoff } = await resolveLookupAttempts(
      subscriberId,
      passedAttempts,
      !!result.incrementAttempts,
    );

    if (subscriberId) {
      await syncOrderLookupFields(subscriberId, {
        status: result.success ? 'pending_otp' : 'not_found',
        hasMore: result.has_more || false,
        unavailable: result.order_lookup_unavailable || false,
        orderId: result.order_id || '',
        source: result.order_source || '',
        attempts: lookupAttempts,
      }).catch(() => {});
    }

    const text = result.ai_reply || '';
    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: {
        status: 'ok',
        success: result.success,
        reason: result.reason,
        masked_phone: result.masked_phone || null,
        order_id: result.order_id || null,
        order_source: result.order_source || null,
        has_more: result.has_more || false,
        order_lookup_unavailable: result.order_lookup_unavailable || false,
        lookup_attempts: lookupAttempts,
        lookup_handoff: lookupHandoff,
        ai_reply: text,
        content: { messages: [{ type: 'text', text }] },
      },
    });
  } catch (err) {
    console.error('[http-functions] get_sendOrderLookupOtp failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

export async function get_verifyOrderLookupOtp(request) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const phone = String(request.query?.phone || '').trim();
    const code = String(request.query?.code || '').trim();
    const subscriberId = String(request.query?.subscriber_id || '').trim();
    const passedAttempts = request.query?.attempts;

    if (!phone || !code) {
      return badRequest({
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'missing_phone_or_code' },
      });
    }

    const result = await verifyOrderLookupOtp(phone, code);
    const { lookupAttempts, lookupHandoff } = await resolveLookupAttempts(
      subscriberId,
      passedAttempts,
      !!result.incrementAttempts,
    );

    if (subscriberId) {
      await syncOrderLookupFields(subscriberId, {
        status: result.valid ? 'found' : 'not_found',
        hasMore: result.has_more || false,
        unavailable: result.order_lookup_unavailable || false,
        orderId: result.order_id || '',
        source: result.order_source || '',
        orderUrl: result.order_url || '',
        attempts: lookupAttempts,
        verifiedAt: result.valid ? (result.verified_at || '') : undefined,
      }).catch(() => {});
    }

    const text = result.ai_reply || '';
    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: {
        status: 'ok',
        valid: result.valid,
        found: result.valid && result.found,
        reason: result.reason,
        verified_at: result.verified_at || null,
        verification_valid: result.verification_valid || false,
        has_more: result.has_more || false,
        order_id: result.order_id || null,
        order_source: result.order_source || null,
        order_url: result.order_url || null,
        order_lookup_unavailable: result.order_lookup_unavailable || false,
        attempts_remaining: result.attempts_remaining ?? null,
        lookup_attempts: lookupAttempts,
        lookup_handoff: lookupHandoff,
        ai_reply: text,
        content: text ? { messages: [{ type: 'text', text }] } : undefined,
      },
    });
  } catch (err) {
    console.error('[http-functions] get_verifyOrderLookupOtp failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

// ============================================================
// Reschedule-workshop flow — "עדכון מועד סדנה" page
// GET https://www.studiohappy.art/_functions/startReschedule?order_id=...&subscriber_id=...
// GET https://www.studiohappy.art/_functions/confirmReschedule?order_id=...&subscriber_id=...
// Header: X-API-KEY (manychat_webhook_apiKey)
// ============================================================

const RESCHEDULE_PAGE_URL = 'https://www.studiohappy.art/change-date';

export async function get_startReschedule(request) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const orderId = String(request.query?.order_id || '').trim();
    const subscriberId = String(request.query?.subscriber_id || '').trim();
    if (!orderId) {
      return badRequest({ headers: { 'Content-Type': 'application/json' }, body: { status: 'error', error: 'missing_order_id' } });
    }

    const order = await wixData.get('WorkshopOrders', orderId, { suppressAuth: true, consistentRead: true }).catch(() => null);
    if (!order) {
      return ok({ headers: { 'Content-Type': 'application/json' }, body: { status: 'error', ai_reply: 'לא מצאנו את ההזמנה 🔍' } });
    }

    const rescheduleBlocked48h = isRescheduleBlockedWithin48h(order);
    const rescheduleAlreadyUsed = hasCustomerRescheduleUsed(order);
    const rescheduleAlreadyPending = hasOpenRescheduleRequest(order);

    if (rescheduleBlocked48h || rescheduleAlreadyUsed || rescheduleAlreadyPending) {
      const ai_reply = rescheduleAlreadyPending
        ? 'יש כבר בקשת שינוי מועד ממתינה לטיפול הצוות שלנו 🙏'
        : rescheduleBlocked48h
          ? 'הסדנה מתקיימת בעוד פחות מ-48 שעות ולכן לא ניתן לדחות אותה באופן עצמאי. אנא פני/ה לשירות הלקוחות שלנו 💬'
          : 'כבר נעשה שינוי מועד חד-פעמי להזמנה הזו בעבר. אנא פני/ה לשירות הלקוחות שלנו 💬';

      return ok({
        headers: { 'Content-Type': 'application/json' },
        body: {
          status: 'ok',
          reschedule_blocked_48h: rescheduleBlocked48h,
          reschedule_already_used: rescheduleAlreadyUsed,
          reschedule_already_pending: rescheduleAlreadyPending,
          ai_reply,
        },
      });
    }

    const { token, expiresAt } = await issueRescheduleToken(orderId);
    const workshopTypeKey = await resolveCmsOrderWorkshopTypeKey(order);
    const datesWorkshop = workshopTypeKey ? (WORKSHOP_TYPE_LABELS_MAP[workshopTypeKey] || workshopTypeKey) : '';
    let link = `${RESCHEDULE_PAGE_URL}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}&sid=${encodeURIComponent(subscriberId)}`;
    if (datesWorkshop) {
      link += `&datesWorkshop=${encodeURIComponent(datesWorkshop)}`;
    }

    if (subscriberId) {
      await syncRescheduleLink(subscriberId, link).catch(() => {});
    }

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: {
        status: 'ok',
        reschedule_link: link,
        expires_at: expiresAt.toISOString(),
        ai_reply: 'הנה קישור לבחירת מועד חדש לסדנה שלך — הקישור בתוקף ל-10 דקות ⏱️',
      },
    });
  } catch (err) {
    console.error('[http-functions] get_startReschedule failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

export async function get_confirmReschedule(request) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const orderId = String(request.query?.order_id || '').trim();
    if (!orderId) {
      return badRequest({ headers: { 'Content-Type': 'application/json' }, body: { status: 'error', error: 'missing_order_id' } });
    }

    const { chosenDateLabel } = await confirmRescheduleRequest(orderId);

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: {
        status: 'ok',
        ai_reply: `בקשתך לשינוי מועד ל-${chosenDateLabel || 'המועד שנבחר'} התקבלה ✅ נציג שלנו יאשר את השינוי בבוקינגס ויחזור אליך במידת הצורך.`,
      },
    });
  } catch (err) {
    console.error('[http-functions] get_confirmReschedule failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

// ============================================================
// Phone normalization — ManyChat helper
// GET https://www.studiohappy.art/_functions/normalizePhone?phone=972523813929
// Header: X-API-KEY (manychat_webhook_apiKey)
// Response: { status, valid, phone_input, phone_local } — phone_local always 05XXXXXXXX when valid
// ============================================================

export async function get_normalizePhone(request) {
  try {
    if (!(await authorizeManyChatWebhook(request))) {
      return response({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'unauthorized' },
      });
    }

    const phoneInput = String(request.query?.phone || '').trim();
    if (!phoneInput) {
      return badRequest({
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'error', error: 'missing_phone' },
      });
    }

    const phoneLocal = formatIsraeliPhoneLocal(phoneInput);
    const valid = phoneLocal.length >= 9 && phoneLocal.startsWith('0');

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: {
        status: 'ok',
        valid,
        phone_input: phoneInput,
        phone_local: phoneLocal,
      },
    });
  } catch (err) {
    console.error('[http-functions] get_normalizePhone failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}

