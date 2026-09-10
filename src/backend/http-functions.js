import { ok, badRequest, serverError, response } from 'wix-http-functions';
import { availabilityCalendar } from 'wix-bookings.v2';
import wixSecretsBackend from 'wix-secrets-backend';
import { checkRateLimit, checkGuardrails, detectHandoff, HANDOFF_REPLY_DEFAULT } from 'backend/aiGuardrails.js';
import { tagHandoff, syncAiResponseFields } from 'backend/manychatService.jsw';
import { createConversation, createResponse, extractReplyText } from 'backend/openaiService.jsw';
import { getUserConversation, upsertUserConversation } from 'backend/userConversationsStore.js';
import { detectSuggestedAction, finalizeRoutedReply } from 'backend/aiRouting.js';
import { buildWorkshopPolicyReply, isGeneralWorkshopSelection } from 'backend/policyContent.js';

// ============================================================
// ManyChat availability endpoint
// GET /_functions/availableDates?workshopType=tufting&offset=0
// ============================================================

const ISRAEL_TZ = 'Asia/Jerusalem';
const PAGE_SIZE = 10;
const QUERY_CHUNK_DAYS = 45;
const MAX_LOOKAHEAD_DAYS = 365;

const WORKSHOP_SERVICE_IDS = {
  tufting: [
    '22e86498-525e-4580-9c83-a4470b0c874d',
    '3406e74d-949b-44b0-a5cc-064548129c08',
    'c1c1e799-84a9-4847-adf6-2a34480c5bfe',
  ],
  candles: [
    'eb8fec0e-5d04-48a3-a795-e3e8051d07da',
    'f0f6e447-02d8-4808-80ba-3c380ce9eae8',
  ],
  charms: [
    '06714046-860f-4f2e-a7cd-2d1c118e5385',
    '19261a10-2de0-42dd-a241-ed2bdf960fc6',
  ],
  jewelry: [
    '7e695ead-0363-4ede-9519-c2649674d2d4',
    'e3190974-9abc-4c6f-970f-98dad6032553',
  ],
  ceramics: ['ad89914a-1845-48c6-804d-544cd17f179b'],
};

const WORKSHOP_TYPE_ALIASES = {
  tufting: 'tufting',
  'טאפטינג': 'tufting',
  candles: 'candles',
  'נרות': 'candles',
  charms: 'charms',
  "צ'ארמס": 'charms',
  'צארמס': 'charms',
  jewelry: 'jewelry',
  'תכשיטים': 'jewelry',
  ceramics: 'ceramics',
  'קרמיקה': 'ceramics',
};

const WORKSHOP_TYPE_LABELS_HE = ['טאפטינג', 'נרות', 'תכשיטים', "צ'ארמס", 'קרמיקה'];

function resolveWorkshopType(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  return WORKSHOP_TYPE_ALIASES[trimmed] || WORKSHOP_TYPE_ALIASES[trimmed.toLowerCase()] || null;
}

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
    const serviceIds = workshopKey ? WORKSHOP_SERVICE_IDS[workshopKey] : null;

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
      console.log('[http-functions] Handoff triggered. subscriberId:', subscriberId, 'reason:', reason || 'unknown');
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
      console.log('[http-functions] Route suggested. subscriberId:', subscriberId, 'route:', routingAction.route, 'target:', routingAction.action_target);
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

