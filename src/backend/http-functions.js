import { ok, badRequest, serverError, response } from 'wix-http-functions';
import { availabilityCalendar } from 'wix-bookings.v2';
import wixSecretsBackend from 'wix-secrets-backend';
import { checkRateLimit, checkGuardrails, detectHandoff, HANDOFF_REPLY_DEFAULT } from 'backend/aiGuardrails.js';
import { tagHandoff } from 'backend/manychatService.jsw';
import { createConversation, createResponse, extractReplyText } from 'backend/openaiService.jsw';
import { getUserConversation, upsertUserConversation } from 'backend/userConversationsStore.js';

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
// Response: { status, reply, needs_handoff, show_handoff_button }
// ManyChat: branch on show_handoff_button → message + Quick Reply button → handoff flow.
// ============================================================

const AI_DEFAULT_FALLBACK_TEXT = 'מצטערים, לא הצלחנו לענות כרגע 🙏';

function aiOkBody({ reply, needsHandoff = false, guardrail = false } = {}) {
  const handoff = !!needsHandoff;
  return {
    status: 'ok',
    reply: String(reply || '').trim(),
    needs_handoff: handoff,
    show_handoff_button: handoff,
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
async function handleAiTurn({ subscriberId, userMessage, workshopName }) {
  try {
    const conversationRecord = await resolveConversation(subscriberId);
    const input = `[Current workshop context: "${workshopName}"]\nUser message: ${userMessage}`;
    const aiResponse = await createResponse({ conversationId: conversationRecord.conversationId, input });
    const rawReply = extractReplyText(aiResponse);

    if (!rawReply) {
      console.warn('[http-functions] Empty AI reply. subscriberId:', subscriberId);
      await upsertUserConversation(subscriberId, { lastActive: new Date(), lastWorkshop: workshopName });
      await tagHandoff(subscriberId, 'empty_ai_reply');
      return { reply: HANDOFF_REPLY_DEFAULT, needsHandoff: true };
    }

    const { needsHandoff, cleanedReply, reason } = detectHandoff(rawReply, userMessage);
    const finalReply = needsHandoff
      ? (cleanedReply || HANDOFF_REPLY_DEFAULT)
      : (cleanedReply || AI_DEFAULT_FALLBACK_TEXT);

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

    return { reply: finalReply, needsHandoff };
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
      return ok({
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'rate_limited', reply: '', needs_handoff: false },
      });
    }

    // Guardrails — before any OpenAI call (PRD §5 step 3, §9).
    const guard = await checkGuardrails(userMessage);
    if (guard.triggered) {
      return ok({
        headers: { 'Content-Type': 'application/json' },
        body: aiOkBody({ reply: guard.fallbackMessage, guardrail: true }),
      });
    }

    const result = await handleAiTurn({ subscriberId, userMessage, workshopName });

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: aiOkBody({ reply: result.reply, needsHandoff: result.needsHandoff }),
    });
  } catch (err) {
    console.error('[http-functions] post_manychatMessage failed:', err?.message || err);
    return serverError({ body: { status: 'error', error: String(err?.message || err) } });
  }
}
