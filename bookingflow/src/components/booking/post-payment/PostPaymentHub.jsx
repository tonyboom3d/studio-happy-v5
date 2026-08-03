import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Baby, CreditCard, Calendar, MapPin, UserCheck, User, Mail, Phone, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { readCatalogCache, writeCatalogCache } from '@/lib/utils';
import { findLockedInGroup, groupDeletableCacheKey } from '@/lib/sketchStatus';
import OrganizerOrderHub from './OrganizerOrderHub';
import CandelsThankYou from '../../candels/CandelsThankYou';
import SketchSelectionView from './SketchSelectionView';
import InvalidLinkMessage from './InvalidLinkMessage';
import OrderLoadError from './OrderLoadError';
import DeadlineCountdown from './DeadlineCountdown';
import AdminOtpVerification from './AdminOtpVerification';

export default function PostPaymentHub({
  orderContext,
  ecomSummary: ecomSummaryProp,
  orderHistory: orderHistoryProp,
  participantContext,
  role,
  catalog: initialCatalog,
  onSendMessage,
  isLoading,
  isSlowLoading,
  onRetryLoad,
  orderError,
  groupInfo,
  adminOtpRequired,
  adminOrderId,
  onAdminVerified,
}) {
  const [localOrder, setLocalOrder] = useState(
    orderContext?.order || participantContext?.order || null
  );
  const [localParticipants, setLocalParticipants] = useState(orderContext?.participants || []);
  const [localSelections, setLocalSelections] = useState(orderContext?.selections || []);
  const [ecomSummary, setEcomSummary] = useState(
    ecomSummaryProp || participantContext?.ecomSummary || null
  );
  const [orderHistory, setOrderHistory] = useState(orderHistoryProp || []);
  const [switchingOrder, setSwitchingOrder] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Session-wide 90x90 sketch capacity (shared across every order booked into
  // the same workshop session — max 5 slots total, physically constrained).
  const [session90, setSession90] = useState(
    orderContext?.session90 || participantContext?.session90 || null
  );
  // Candles ("סדנת נרות") orders render a summary-only Thank You view instead
  // of the full Tufting organizer hub (no sketch/group features).
  const [isCandles, setIsCandles] = useState(!!orderContext?.isCandles);
  const [selectedProducts, setSelectedProducts] = useState(orderContext?.selectedProducts || []);

  // Share links are derived directly from each group's stable plaintext token so
  // they survive refreshes and never get re-minted (which would break shared links).
  const participantLinks = useMemo(
    () => (localParticipants || [])
      .filter((p) => p.shareToken)
      .map((p) => ({ participantId: p._id, name: p.name, token: p.shareToken, link: p.shareToken })),
    [localParticipants]
  );
  const [verifiedParticipant, setVerifiedParticipant] = useState(participantContext?.participant || null);
  const [catalog, setCatalog] = useState(() => {
    if (initialCatalog?.length) return initialCatalog;
    return readCatalogCache() || [];
  });
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState('');
  const catalogCacheRef = useRef(catalog?.length ? catalog : readCatalogCache());
  const catalogFetchPromiseRef = useRef(null);
  const paymentListenerRef = useRef(false);
  const sketchSavePromisesRef = useRef(new Map());
  const activeSketchSavesRef = useRef(0);
  const groupDeletableCacheRef = useRef(new Map());
  const GROUP_DELETABLE_CACHE_MS = 60_000;

  const mergeSketchLocks = useCallback((locks) => {
    if (!locks?.length) return;
    const lockMap = new Map();
    locks.forEach((lock) => {
      const key = lock.participantId
        ? `p:${lock.participantId}:${lock.rugIndex}`
        : `n:${lock.participantName || ''}:${lock.rugIndex}`;
      lockMap.set(key, lock.sketchStatus);
    });
    setLocalSelections((prev) => prev.map((sel) => {
      const key = sel.participantId
        ? `p:${sel.participantId}:${sel.rugIndex}`
        : `n:${sel.participantName || ''}:${sel.rugIndex}`;
      const status = lockMap.get(key);
      return status ? { ...sel, sketchStatus: status } : sel;
    }));
  }, []);

  const applyCatalog = useCallback((products) => {
    if (!products?.length) return;
    catalogCacheRef.current = products;
    writeCatalogCache(products);
    setCatalog(products);
  }, []);

  useEffect(() => {
    if (orderContext?.order) setLocalOrder(orderContext.order);
    if (orderContext?.participants) setLocalParticipants(orderContext.participants);
    if (orderContext?.selections) setLocalSelections(orderContext.selections);
    if (orderContext?.catalog?.length) applyCatalog(orderContext.catalog);
    if (orderContext?.sketchLocks?.length) mergeSketchLocks(orderContext.sketchLocks);
    if (orderContext?.session90) setSession90(orderContext.session90);
    if (orderContext?.isCandles !== undefined) setIsCandles(!!orderContext.isCandles);
    if (orderContext?.selectedProducts) setSelectedProducts(orderContext.selectedProducts);
  }, [orderContext, applyCatalog, mergeSketchLocks]);

  useEffect(() => {
    if (ecomSummaryProp) setEcomSummary(ecomSummaryProp);
  }, [ecomSummaryProp]);

  useEffect(() => {
    if (orderHistoryProp) setOrderHistory(orderHistoryProp);
  }, [orderHistoryProp]);

  useEffect(() => {
    if (participantContext?.participant) setVerifiedParticipant(participantContext.participant);
    if (participantContext?.selections) setLocalSelections(participantContext.selections);
    if (participantContext?.order) {
      setLocalOrder((prev) => (prev ? { ...prev, ...participantContext.order } : participantContext.order));
    }
    if (participantContext?.ecomSummary) setEcomSummary(participantContext.ecomSummary);
    if (participantContext?.session90) setSession90(participantContext.session90);
  }, [participantContext]);

  // Optimistically bump the session-wide 90x90 usage count right after a
  // successful reservation, so the UI reflects "sold out" immediately
  // instead of waiting for the next periodic ORDER_CONTEXT refresh.
  const bumpSession90Used = useCallback((count = 1) => {
    setSession90((prev) => {
      if (!prev) return prev;
      const used = prev.used + count;
      return {
        ...prev,
        used,
        remaining: Math.max(0, prev.limit - used),
        soldOut: used >= prev.limit,
      };
    });
  }, []);

  const mergeFreshSelection = useCallback((freshSelection) => {
    if (!freshSelection) return;
    setLocalSelections((prev) => {
      const filtered = prev.filter((s) => !(
        s.rugIndex === freshSelection.rugIndex
        && (s.participantId || null) === (freshSelection.participantId || null)
      ));
      return [...filtered, freshSelection];
    });
  }, []);

  useEffect(() => {
    if (initialCatalog?.length) applyCatalog(initialCatalog);
  }, [initialCatalog, applyCatalog]);

  const sendAndWait = useCallback((type, data) => {
    return new Promise((resolve) => {
      const handler = (response) => {
        resolve(response);
      };
      onSendMessage(type, data, handler);
    });
  }, [onSendMessage]);

  const fetchCatalogFromServer = useCallback(async (serviceId) => {
    if (catalogFetchPromiseRef.current) {
      return catalogFetchPromiseRef.current;
    }

    catalogFetchPromiseRef.current = (async () => {
      try {
        const result = await sendAndWait('FETCH_CATALOG', { serviceId });
        if (result?.products?.length) {
          applyCatalog(result.products);
          return result.products;
        }
      } catch (e) {
        console.error('Failed to fetch catalog:', e);
      }
      return catalogCacheRef.current || null;
    })();

    try {
      return await catalogFetchPromiseRef.current;
    } finally {
      catalogFetchPromiseRef.current = null;
    }
  }, [sendAndWait, applyCatalog]);

  const handleFetchCatalog = useCallback(async () => {
    if (catalog?.length) return catalog;
    if (catalogCacheRef.current?.length) {
      setCatalog(catalogCacheRef.current);
      return catalogCacheRef.current;
    }
    const cached = readCatalogCache();
    if (cached?.length) {
      applyCatalog(cached);
      return cached;
    }
    return fetchCatalogFromServer(localOrder?.serviceId);
  }, [catalog, applyCatalog, fetchCatalogFromServer, localOrder?.serviceId]);

  useEffect(() => {
    if (isLoading || orderError) return;
    if (catalog?.length || catalogCacheRef.current?.length) return;
    const hasOrder = localOrder?._id || verifiedParticipant?.orderId;
    if (!hasOrder) return;
    fetchCatalogFromServer(localOrder?.serviceId);
  }, [isLoading, orderError, localOrder, verifiedParticipant, catalog?.length, fetchCatalogFromServer]);

  // --- AI Sketch handlers ---
  const orderId = localOrder?._id;

  const handleValidateImage = useCallback(async (imageBase64) => {
    const result = await sendAndWait('VALIDATE_IMAGE', { imageBase64, orderId });
    if (result?.error) throw new Error(result.error);
    return result;
  }, [sendAndWait, orderId]);

  const handleGenerateSketch = useCallback(async (imageBase64, colorPalette, imageDimensions) => {
    const start = await sendAndWait('GENERATE_SKETCH', {
      imageBase64,
      colorPalette,
      orderId,
      imageWidth: imageDimensions?.width,
      imageHeight: imageDimensions?.height,
    });
    if (start?.error) {
      console.error('[PostPaymentHub] GENERATE_SKETCH start error:', start.error);
      throw new Error(start.error);
    }
    if (!start?.jobId) {
      console.error('[PostPaymentHub] GENERATE_SKETCH missing jobId:', start);
      throw new Error('שגיאה ביצירת הסקיצה: השרת לא החזיר מזהה עבודה. נסו שוב.');
    }

    const jobId = start.jobId;
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      const status = await sendAndWait('GET_SKETCH_JOB', { jobId });
      if (status?.error) {
        console.error('[PostPaymentHub] GET_SKETCH_JOB error:', status.error);
        throw new Error(status.error);
      }
      if (status?.status === 'done') {
        return {
          sketchUrl: status.sketchUrl,
          sketchWixFileUrl: status.sketchWixFileUrl || null,
          originalUrl: status.originalUrl,
          taskId: status.taskId,
        };
      }
      if (status?.status === 'failed') {
        console.error('[PostPaymentHub] Sketch job failed:', jobId);
        throw new Error(status.error || 'אירעה שגיאה טכנית ביצירת הסקיצה. נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.');
      }
    }

    console.error('[PostPaymentHub] Sketch job timed out:', jobId);
    throw new Error('יצירת הסקיצה ארכה זמן רב מדי (מעל דקה). ייתכן שהשרת עמוס — נסו שוב בעוד מספר דקות.');
  }, [sendAndWait, orderId]);

  const handleSaveApprovedSketch = useCallback(async (originalInput, sketchUrl, colors, croppedInput) => {
    const result = await sendAndWait('SAVE_APPROVED_SKETCH', { originalInput, sketchUrl, colors, orderId, croppedInput: croppedInput || null });
    if (result?.error) throw new Error(result.error);
    return result;
  }, [sendAndWait, orderId]);

  const handleSubmitFeedback = useCallback(async (feedbackText, type) => {
    const result = await sendAndWait('SUBMIT_FEEDBACK', { feedbackText, type, orderId });
    return result;
  }, [sendAndWait, orderId]);

  const handleCheckRateLimit = useCallback(async () => {
    const result = await sendAndWait('CHECK_RATE_LIMIT', { orderId });
    return result;
  }, [sendAndWait, orderId]);

  const handleGetAITermsStatus = useCallback(async () => {
    const result = await sendAndWait('GET_AI_TERMS_STATUS', { orderId });
    if (result?.error) throw new Error(result.error);
    return result;
  }, [sendAndWait, orderId]);

  const handleAcceptAITerms = useCallback(async () => {
    const result = await sendAndWait('ACCEPT_AI_TERMS', { orderId });
    if (result?.error) throw new Error(result.error);
    setLocalOrder((prev) => (prev ? { ...prev, aiTermsAccepted: true } : prev));
    return result;
  }, [sendAndWait, orderId]);

  const handleChooseMode = useCallback(async (mode) => {
    // Groups are now created explicitly by the organizer (no auto-generation).
    setLocalOrder(prev => ({ ...prev, selectionMode: mode }));
    try {
      await sendAndWait('SET_SELECTION_MODE', { orderId: localOrder._id, mode });
    } catch {
      setLocalOrder(prev => ({ ...prev, selectionMode: null }));
    }
  }, [localOrder?._id, sendAndWait]);

  // Create a single group. Returns the created participant so the hub can
  // immediately open the share modal for it. Used both by "participants"
  // (send-to-group links) and "organizer" (self-selection cards) modes —
  // persisting organizer groups the same way ensures they survive a page
  // refresh even before any sketch has been picked for them. The order's
  // selectionMode itself is set separately via onChooseMode, not here.
  const handleCreateGroup = useCallback(async (group) => {
    setIsSaving(true);
    try {
      const result = await sendAndWait('CREATE_PARTICIPANT_GROUP', {
        orderId: localOrder._id,
        group,
      });
      if (result?.error) throw new Error(result.error);
      if (result?.participant) {
        setLocalParticipants(prev => [...prev, result.participant]);
        return result.participant;
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [localOrder?._id, sendAndWait]);

  // Delete a participant group (cascades sketch selections + invalidates link server-side).
  const handleDeleteGroup = useCallback(async (participantId) => {
    const result = await sendAndWait('DELETE_PARTICIPANT_GROUP', { participantId });
    if (result?.error) throw new Error(result.error);
    if (!result?.success) throw new Error('Delete failed');
    groupDeletableCacheRef.current.delete(groupDeletableCacheKey({ participantId }));
    setLocalParticipants(prev => prev.filter(p => p._id !== participantId));
    setLocalSelections(prev => prev.filter(s => s.participantId !== participantId));
    return result;
  }, [sendAndWait]);

  // Delete an organizer self-selection card + its saved sketch selections in CMS.
  const handleDeleteOrganizerGroup = useCallback(async ({ participantName, rugIndexes, participantId }) => {
    const orderId = localOrder?._id;
    if (!orderId) throw new Error('Order not loaded');
    const result = await sendAndWait('DELETE_ORGANIZER_GROUP', { orderId, participantName, rugIndexes, participantId });
    if (result?.error) throw new Error(result.error);
    if (!result?.success) throw new Error('Delete failed');
    groupDeletableCacheRef.current.delete(groupDeletableCacheKey({
      orderId,
      participantName,
      rugIndexes,
      participantId,
    }));
    const rugSet = new Set(rugIndexes || []);
    setLocalSelections(prev => prev.filter(s => {
      if (participantId && s.participantId === participantId) return false;
      if (participantName && s.participantName === participantName) return false;
      if (rugSet.size > 0 && rugSet.has(s.rugIndex)) return false;
      return true;
    }));
    if (participantId) {
      setLocalParticipants(prev => prev.filter(p => p._id !== participantId));
    }
    return result;
  }, [localOrder?._id, sendAndWait]);

  const handleCheckGroupDeletable = useCallback(async (opts, { selections: selectionsOverride } = {}) => {
    const selections = selectionsOverride || localSelections;
    const localLocked = findLockedInGroup(selections, opts || {});
    if (localLocked) {
      return { canDelete: false, lockedSketchStatus: localLocked, source: 'local' };
    }

    const cacheKey = groupDeletableCacheKey(opts || {});
    const cached = groupDeletableCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < GROUP_DELETABLE_CACHE_MS) {
      return cached.result;
    }

    try {
      const result = await sendAndWait('CHECK_GROUP_DELETABLE', opts || {});
      groupDeletableCacheRef.current.set(cacheKey, { result, ts: Date.now() });
      return result;
    } catch (e) {
      return { canDelete: false, error: e?.message || 'CHECK_FAILED' };
    }
  }, [localSelections, sendAndWait]);

  // Background refresh of sketch lock statuses (dashboard may have updated CMS).
  useEffect(() => {
    const orderId = localOrder?._id;
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await sendAndWait('CHECK_EDITING_ALLOWED', {
          orderId,
          participantId: verifiedParticipant?._id || null,
        });
        if (!cancelled && result?.sketchLocks?.length) mergeSketchLocks(result.sketchLocks);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [localOrder?._id, verifiedParticipant?._id, sendAndWait, mergeSketchLocks]);

  // Legacy fallback: backfill share tokens for any groups created before tokens
  // were stored on the record (so their links can be rebuilt).
  useEffect(() => {
    if (role !== 'organizer') return;
    if (localOrder?.selectionMode !== 'participants') return;
    if (!localParticipants?.length) return;
    if (!localParticipants.some(p => !p.shareToken)) return;
    (async () => {
      const linkResult = await sendAndWait('GENERATE_PARTICIPANT_LINKS', { orderId: localOrder._id });
      if (linkResult?.links) {
        setLocalParticipants(prev => prev.map(p => {
          if (p.shareToken) return p;
          const l = linkResult.links.find(x => x.participantId === p._id);
          return l ? { ...p, shareToken: l.token } : p;
        }));
      }
    })();
  }, [role, localOrder?.selectionMode, localOrder?._id, localParticipants, sendAndWait]);

  const handleSwitchModeWithClear = useCallback(async (newMode) => {
    await sendAndWait('CLEAR_ALL_ORDER_DATA', { orderId: localOrder._id });
    setLocalParticipants([]);
    setLocalSelections([]);
    await handleChooseMode(newMode);
  }, [localOrder?._id, sendAndWait, handleChooseMode]);

  const handleUpdateParticipant = useCallback(async (participantId, updates) => {
    setLocalParticipants(prev => prev.map(p => {
      if (p._id !== participantId) return p;
      const next = { ...p, ...updates };
      if (updates.childrenCount !== undefined) next.hasChildren = updates.childrenCount > 0;
      return next;
    }));
    try {
      await sendAndWait('UPDATE_PARTICIPANT', { participantId, updates });
    } catch (e) {
      console.error('Failed to update participant:', e);
    }
  }, [sendAndWait]);

  const handleSaveParticipants = async (participants) => {
    setIsSaving(true);
    try {
      const result = await sendAndWait('SAVE_PARTICIPANTS', {
        orderId: localOrder._id,
        participants,
      });
      if (result?.participants) {
        setLocalParticipants(result.participants);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSketch = useCallback(async (selection) => {
    const participantId = selection.participantId || verifiedParticipant?._id || null;
    const saveKey = `${localOrder?._id || ''}:${participantId || ''}:${selection.rugIndex}`;
    const inFlight = sketchSavePromisesRef.current.get(saveKey);
    if (inFlight) return inFlight;

    const savePromise = (async () => {
      activeSketchSavesRef.current += 1;
      setIsSaving(true);
      try {
        const phoneNumber = selection.phoneNumber
          || verifiedParticipant?.phone
          || verifiedParticipant?.rawPhone
          || ecomSummary?.buyerPhone
          || null;
        const prevSel = localSelections.find(s => (
          s.rugIndex === selection.rugIndex && (s.participantId || null) === (participantId || null)
        ));
        const alreadyReserved90 = prevSel && (prevSel.canvasSize === '90x90' || prevSel.requestedCanvasSize === '90x90');
        const result = await sendAndWait('SAVE_SKETCH_SELECTION', {
          orderId: localOrder._id,
          ...selection,
          participantId,
          phoneNumber,
          expectedUpdatedDate: prevSel?._updatedDate || null,
        });
        if (result?.error) {
          // Someone else (staff status change, another tab) changed this
          // sketch since we last loaded it — pull the fresh row instead of
          // silently failing on stale data.
          if (String(result.error).startsWith('CONFLICT')) {
            try {
              const fresh = await sendAndWait('VERIFY_SKETCH_FOR_EDIT', {
                orderId: localOrder._id,
                rugIndex: selection.rugIndex,
                participantId,
              });
              if (fresh?.selection) mergeFreshSelection(fresh.selection);
            } catch (_) {}
          }
          throw new Error(result.error);
        }
        if (!result?.selection) throw new Error('Save failed');
        if (result?.selection) {
          setLocalSelections(prev => {
            const filtered = prev.filter(s => !(
              s.rugIndex === result.selection.rugIndex &&
              (s.participantId || null) === (result.selection.participantId || null)
            ));
            return [...filtered, result.selection];
          });
        }
        // A brand-new 90x90 reservation just claimed a session-wide slot —
        // reflect it immediately without waiting for the next context refresh.
        if (selection.canvasSize === '90x90' && !alreadyReserved90) {
          bumpSession90Used(1);
        }
        return result;
      } finally {
        sketchSavePromisesRef.current.delete(saveKey);
        activeSketchSavesRef.current = Math.max(0, activeSketchSavesRef.current - 1);
        if (activeSketchSavesRef.current === 0) setIsSaving(false);
      }
    })();

    sketchSavePromisesRef.current.set(saveKey, savePromise);
    return savePromise;
  }, [localOrder?._id, verifiedParticipant, ecomSummary, sendAndWait, localSelections, bumpSession90Used, mergeFreshSelection]);

  const handleDeleteSketchSelection = useCallback(async ({ rugIndex, participantId, participantName }) => {
    const result = await sendAndWait('DELETE_SKETCH_SELECTION', {
      orderId: localOrder._id,
      rugIndex,
      participantId: participantId || null,
      participantName: participantName || null,
    });
    if (result?.error) throw new Error(result.error);
    setLocalSelections((prev) => prev.filter((s) => !(
      s.rugIndex === rugIndex
      && (s.participantId || null) === (participantId || null)
    )));
    return result;
  }, [localOrder?._id, sendAndWait]);

  const handleVerifySketchForEdit = useCallback(async (rugIndex, participantId = null) => {
    if (!localOrder?._id) return { canEdit: false, error: 'NO_ORDER' };
    const pid = participantId ?? verifiedParticipant?._id ?? null;
    try {
      const result = await sendAndWait('VERIFY_SKETCH_FOR_EDIT', {
        orderId: localOrder._id,
        rugIndex,
        participantId: pid,
      });
      if (result?.selection) mergeFreshSelection(result.selection);
      return result;
    } catch (e) {
      return { canEdit: false, error: e?.message || 'VERIFY_FAILED' };
    }
  }, [localOrder?._id, verifiedParticipant?._id, sendAndWait, mergeFreshSelection]);

  useEffect(() => {
    if (paymentListenerRef.current) return;
    paymentListenerRef.current = true;

    const handler = (event) => {
      const msg = event.data;
      if (!msg?.type) return;

      if (msg.type === 'UPGRADE_PAYMENT_STATUS') {
        setPaymentStatus(msg.status);
      }
      if (msg.type === 'UPGRADE_PAYMENT_RESULT') {
        if (msg.success) {
          if (msg.selections) setLocalSelections(msg.selections);
          setPaymentStatus('success');
          setTimeout(() => setPaymentStatus(null), 2500);
        } else if (msg.pending) {
          setPaymentStatus('pending');
          setTimeout(() => setPaymentStatus(null), 4000);
        } else {
          const msgText = String(msg.error || '');
          setPaymentErrorMessage(
            msgText.startsWith('SESSION_SKETCH_90_SOLD_OUT')
              ? 'כל הסקיצות בגודל 90×90 לסדנה זו נתפסו. ניתן לבחור בגודל 60×60.'
              : ''
          );
          setPaymentStatus('failed');
          setTimeout(() => { setPaymentStatus(null); setPaymentErrorMessage(''); }, 4000);
        }
        setIsSaving(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleRequestUpgrade = useCallback((upgradeSelections) => {
    const sels = Array.isArray(upgradeSelections) ? upgradeSelections : [upgradeSelections];
    if (!sels.length) return;
    const phoneNumber = verifiedParticipant?.phone || verifiedParticipant?.rawPhone || ecomSummary?.buyerPhone || null;
    const enriched = sels.map(s => ({
      ...s,
      phoneNumber: s.phoneNumber || phoneNumber,
      participantId: s.participantId || verifiedParticipant?._id || null,
    }));
    setIsSaving(true);
    setPaymentStatus('creating');
    onSendMessage('REQUEST_UPGRADE_PAYMENT', {
      orderId: localOrder._id,
      selections: enriched,
      orderNumber: ecomSummary?.orderNumber,
      buyerName: ecomSummary?.buyerName,
      buyerPhone: ecomSummary?.buyerPhone,
      buyerEmail: ecomSummary?.buyerEmail,
    });
  }, [localOrder?._id, ecomSummary, verifiedParticipant, onSendMessage]);

  const handleCopyToClipboard = useCallback((text) => {
    return sendAndWait('COPY_TO_CLIPBOARD', { text });
  }, [sendAndWait]);

  // Participant cost — computed at component level to satisfy Rules of Hooks.
  const participantRugQty = verifiedParticipant?.rugAllowance || groupInfo?.rugs || 1;
  const participantChildrenQty = verifiedParticipant?.childrenCount ?? groupInfo?.children ?? 0;
  const participantGroupCost = useMemo(() => {
    if (!localOrder?.showPriceToParticipants || !localOrder?.basePrice) return null;
    const totalAdults = localOrder.adults || 1;
    const totalChildren = localOrder.children || 0;
    const totalPeople = totalAdults + totalChildren;
    const pricePerPerson = totalPeople > 0 ? localOrder.basePrice / totalPeople : 0;
    const adultCost = participantRugQty * pricePerPerson;
    const childCost = participantChildrenQty * pricePerPerson;
    return Math.round(adultCost + childCost);
  }, [
    localOrder?.showPriceToParticipants,
    localOrder?.basePrice,
    localOrder?.adults,
    localOrder?.children,
    participantRugQty,
    participantChildrenQty,
  ]);

  // Organizer contact — always resolved for participant view (ecomSummary or order fields).
  const organizerInfo = useMemo(() => ({
    buyerName: ecomSummary?.buyerName || localOrder?.organizerName || '',
    buyerEmail: ecomSummary?.buyerEmail || localOrder?.organizerEmail || '',
    buyerPhone: ecomSummary?.buyerPhone || localOrder?.organizerPhone || '',
    organizerNotes: ecomSummary?.organizerNotes || localOrder?.organizerNotes || '',
  }), [
    ecomSummary?.buyerName,
    ecomSummary?.buyerEmail,
    ecomSummary?.buyerPhone,
    ecomSummary?.organizerNotes,
    localOrder?.organizerName,
    localOrder?.organizerEmail,
    localOrder?.organizerPhone,
    localOrder?.organizerNotes,
  ]);

  // Switch to viewing a different (past) order of the same buyer, chosen via
  // the "my orders" switcher. Replaces local state in place without a page reload.
  const handleSwitchOrder = useCallback(async (targetOrderId) => {
    if (!targetOrderId || targetOrderId === localOrder?._id) return;
    setSwitchingOrder(true);
    try {
      const result = await sendAndWait('SWITCH_ORDER', { orderId: targetOrderId });
      if (result?.error) throw new Error(result.error);
      if (result?.orderContext?.order) setLocalOrder(result.orderContext.order);
      if (result?.orderContext?.participants) setLocalParticipants(result.orderContext.participants);
      if (result?.orderContext?.selections) setLocalSelections(result.orderContext.selections);
      if (result?.ecomSummary) setEcomSummary(result.ecomSummary);
      if (result?.orderHistory) setOrderHistory(result.orderHistory);
    } catch (e) {
      console.error('[PostPaymentHub] Failed to switch order:', e?.message);
    } finally {
      setSwitchingOrder(false);
    }
  }, [localOrder?._id, sendAndWait]);

  const handleUpdateSettings = async (settings) => {
    try {
      await sendAndWait('UPDATE_ORDER_SETTINGS', {
        orderId: localOrder._id,
        settings,
      });
      setLocalOrder(prev => ({ ...prev, ...settings }));
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  };


  if (adminOtpRequired && !localOrder) {
    return (
      <AdminOtpVerification
        orderId={adminOrderId}
        onSendMessage={onSendMessage}
        onVerified={(ctx) => {
          if (ctx?.order) setLocalOrder(ctx.order);
          if (ctx?.participants) setLocalParticipants(ctx.participants);
          if (ctx?.selections) setLocalSelections(ctx.selections);
          if (onAdminVerified) onAdminVerified(ctx);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] w-full max-w-2xl mx-auto px-4 py-8" dir="rtl">
        <div className="flex flex-col items-center justify-center mb-6">
          <Loader2 className="w-9 h-9 text-[#5E2F88] animate-spin" />
          <p className="mt-3 text-sm font-medium text-[#581E83]">טוען פרטי הזמנה...</p>
          {isSlowLoading && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <p className="text-xs text-[#581E83]/70">הטעינה מתעכבת מהצפוי...</p>
              {onRetryLoad && (
                <button
                  type="button"
                  onClick={onRetryLoad}
                  className="text-xs font-semibold text-[#5E2F88] underline underline-offset-2"
                >
                  נסו לרענן
                </button>
              )}
            </div>
          )}
        </div>
        <div className="space-y-4 animate-pulse">
          <div className="h-24 rounded-2xl bg-[#5E2F88]/10" />
          <div className="h-4 w-2/3 rounded bg-[#5E2F88]/10" />
          <div className="h-4 w-1/2 rounded bg-[#5E2F88]/10" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="h-20 rounded-xl bg-[#5E2F88]/10" />
            <div className="h-20 rounded-xl bg-[#5E2F88]/10" />
          </div>
        </div>
      </div>
    );
  }

  // Only non-participants need a loaded order to render; participants receive
  // their data through participantContext after token resolution.
  if (role !== 'participant') {
    if (orderError && !localOrder) {
      return <OrderLoadError />;
    }
    if (!localOrder) {
      return <InvalidLinkMessage />;
    }
  }

  const paymentOverlay = (
    <AnimatePresence>
      {paymentStatus && paymentStatus !== 'success' && paymentStatus !== 'failed' && paymentStatus !== 'pending' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/95"
          dir="rtl"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          >
            <Loader2 className="w-12 h-12 text-[#5E2F88]" />
          </motion.div>
          <p className="mt-4 text-lg font-bold text-[#581E83]">
            {paymentStatus === 'creating' ? 'מכין תשלום...' : 'מעבד תשלום...'}
          </p>
          <p className="mt-2 text-sm text-[#464646]/70">אנא אל תסגרו את החלון</p>
        </motion.div>
      )}
      {paymentStatus === 'success' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/95"
          dir="rtl"
        >
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-lg font-bold text-green-700">התשלום בוצע בהצלחה!</p>
          <p className="mt-1 text-sm text-[#464646]/70">הבחירות נשמרו</p>
        </motion.div>
      )}
      {paymentStatus === 'pending' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/95"
          dir="rtl"
        >
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
          <p className="mt-4 text-lg font-bold text-orange-700">ממתין לאישור תשלום...</p>
          <p className="mt-1 text-sm text-[#464646]/70">הבחירות יישמרו עם אישור התשלום</p>
        </motion.div>
      )}
      {paymentStatus === 'failed' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/95"
          dir="rtl"
        >
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <p className="text-lg font-bold text-red-700">{paymentErrorMessage ? 'לא ניתן להשלים את הבחירה' : 'התשלום לא הושלם'}</p>
          <p className="mt-1 text-sm text-[#464646]/70">{paymentErrorMessage || 'ניתן לנסות שוב'}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Organizer view — candles orders get a summary-only Thank You view (no sketch/group features)
  if (role === 'organizer' && isCandles) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        {paymentOverlay}
        <CandelsThankYou
          order={localOrder}
          ecomSummary={ecomSummary}
          orderHistory={orderHistory}
          selectedProducts={selectedProducts}
          onSwitchOrder={handleSwitchOrder}
          isSwitchingOrder={switchingOrder}
        />
      </div>
    );
  }

  // Organizer view
  if (role === 'organizer') {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        {paymentOverlay}
        <OrganizerOrderHub
          order={localOrder}
          ecomSummary={ecomSummary}
          orderHistory={orderHistory}
          onSwitchOrder={handleSwitchOrder}
          isSwitchingOrder={switchingOrder}
          catalog={catalog || []}
          participants={localParticipants}
          selections={localSelections}
          participantLinks={participantLinks}
          onChooseMode={handleChooseMode}
          onSaveParticipants={handleSaveParticipants}
          onCreateGroup={handleCreateGroup}
          onDeleteGroup={handleDeleteGroup}
          onDeleteOrganizerGroup={handleDeleteOrganizerGroup}
          onSelectSketch={handleSelectSketch}
          onDeleteSketchSelection={handleDeleteSketchSelection}
          onRequestUpgrade={handleRequestUpgrade}
          onUpdateSettings={handleUpdateSettings}
          onUpdateParticipant={handleUpdateParticipant}
          onCopyToClipboard={handleCopyToClipboard}
          onFetchCatalog={handleFetchCatalog}
          onSwitchModeWithClear={handleSwitchModeWithClear}
          isSaving={isSaving}
          onValidateImage={handleValidateImage}
          onGenerateSketch={handleGenerateSketch}
          onSaveApprovedSketch={handleSaveApprovedSketch}
          onSubmitFeedback={handleSubmitFeedback}
          onCheckRateLimit={handleCheckRateLimit}
          onGetAITermsStatus={handleGetAITermsStatus}
          onAcceptAITerms={handleAcceptAITerms}
          onVerifySketchForEdit={handleVerifySketchForEdit}
          onCheckGroupDeletable={handleCheckGroupDeletable}
          session90={session90}
        />
      </div>
    );
  }

  // Participant view — waiting for context to arrive (no phone step needed)
  if (role === 'participant' && !verifiedParticipant) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#5E2F88] animate-spin" />
        <p className="mt-3 text-sm text-[#581E83]">טוען...</p>
      </div>
    );
  }

  // Participant with verified access
  if (role === 'participant' && verifiedParticipant) {
    const groupName = verifiedParticipant.name || groupInfo?.name;
    const rugQty = participantRugQty;
    const childrenQty = participantChildrenQty;
    const rugSlots = Array.from(
      { length: rugQty },
      (_, i) => ({
        rugIndex: i,
        participantName: verifiedParticipant.name,
      })
    );

    // Only this group's own selections (keyed by participantId) feed the view.
    // The backend (verifyAccessToken) already excludes legacy no-participantId
    // rows from multi-group orders, so this fallback only ever applies to
    // genuinely single-group legacy orders.
    const mySelections = (localSelections || []).filter(
      s => !s.participantId || s.participantId === verifiedParticipant._id
    );

    // Workshop schedule, address, and organizer contact info must always be
    // visible to any participant with a valid link — independent of any
    // organizer-controlled share/price setting.
    const displayAddress = 'הדובדבן 7, קריית אונו - קומה 3';
    const workshopDate = localOrder?.workshopStart
      ? format(new Date(localOrder.workshopStart), 'EEEE, d בMMMM yyyy', { locale: he })
      : null;
    const workshopStartTime = localOrder?.workshopStart
      ? format(new Date(localOrder.workshopStart), 'HH:mm')
      : null;
    const workshopEndTime = localOrder?.workshopStart
      ? format(new Date(new Date(localOrder.workshopStart).getTime() + 4 * 60 * 60 * 1000), 'HH:mm')
      : null;
    const formatPhone = (phone) => {
      const digits = String(phone).replace(/\D/g, '');
      return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : phone;
    };

    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6" dir="rtl">
        {paymentOverlay}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4"
        >
          <h2 className="text-xl font-bold text-[#581E83]">
            היי {groupName}!
          </h2>
          <p className="text-sm text-[#464646]/70 mt-1">
            בחר/י את הסקיצה לשטיח שלך
          </p>
          <div className="flex items-center justify-center gap-3 mt-1.5">
            <span className="text-[13px] text-[#5E2F88] font-medium">
              {rugQty} {rugQty === 1 ? 'שטיח' : 'שטיחים'}
            </span>
            {childrenQty > 0 && (
              <span className="text-[13px] text-[#5E2F88] font-medium flex items-center gap-1">
                <Baby className="w-3.5 h-3.5" />
                {childrenQty} {childrenQty === 1 ? 'ילד' : 'ילדים'}
              </span>
            )}
          </div>
          {localOrder?.showPriceToParticipants && participantGroupCost != null && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-[#f5f0fa] border border-[#5E2F88]/15 rounded-lg px-3 py-1.5">
              <CreditCard className="w-3.5 h-3.5 text-[#5E2F88]" />
              <span className="text-[13px] font-medium text-[#581E83]">עלות הקבוצה: ₪{participantGroupCost}</span>
            </div>
          )}
        </motion.div>

        {/* Workshop schedule + organizer details — always shown to participants */}
        <div className="bg-white rounded-2xl border border-[#e8e8e8] p-3.5 shadow-sm space-y-2.5 mb-4">
          <div className="sm:grid sm:grid-cols-2 sm:gap-4">
            <div className="space-y-2">
              {workshopDate && (
                <div className="flex items-start gap-1.5 text-[15px] text-[#464646]">
                  <Calendar className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
                  <span>
                    {workshopDate}
                    {workshopStartTime && (
                      <span className="text-[#5E2F88] font-medium mr-1.5">
                        בשעה {workshopStartTime}{workshopEndTime && ` - ${workshopEndTime}`}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-1.5 text-[15px] text-[#464646]">
                <MapPin className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
                <span>{displayAddress}</span>
              </div>
              {(localOrder?.adults != null || localOrder?.rugCount != null) && (
                <div className="flex items-center gap-1.5 text-[15px] text-[#464646]">
                  <UserCheck className="w-4 h-4 text-[#5E2F88] shrink-0" />
                  <span className="truncate">
                    {localOrder.adults} {localOrder.adults === 1 ? 'מבוגר' : 'מבוגרים'}
                    {localOrder.children > 0 && ` + ${localOrder.children} ${localOrder.children === 1 ? 'ילד' : 'ילדים'}`}
                    {' · '}{localOrder.rugCount} {localOrder.rugCount === 1 ? 'שטיח' : 'שטיחים'}
                  </span>
                </div>
              )}
            </div>

            <div className="sm:border-r sm:border-[#e8e8e8] sm:pr-4 mt-2.5 sm:mt-0 space-y-1.5">
              <h4 className="text-[15px] font-semibold text-[#581E83] mb-1">פרטי המזמין</h4>
              {organizerInfo.buyerName && (
                <div className="flex items-center gap-2 text-[15px] text-[#464646]">
                  <User className="w-4 h-4 text-[#5E2F88] shrink-0" />
                  <span className="font-medium">{organizerInfo.buyerName}</span>
                </div>
              )}
              {organizerInfo.buyerEmail && (
                <div className="flex items-center gap-2 text-[15px] text-[#464646]">
                  <Mail className="w-4 h-4 text-[#5E2F88] shrink-0" />
                  <span dir="ltr" className="text-left truncate">{organizerInfo.buyerEmail}</span>
                </div>
              )}
              {organizerInfo.buyerPhone && (
                <div className="flex items-center gap-2 text-[15px] text-[#464646]">
                  <Phone className="w-4 h-4 text-[#5E2F88] shrink-0" />
                  <span dir="ltr" className="font-medium">{formatPhone(organizerInfo.buyerPhone)}</span>
                </div>
              )}
              {organizerInfo.organizerNotes && (
                <div className="flex items-start gap-2 text-[15px] text-[#464646]">
                  <MessageSquare className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{organizerInfo.organizerNotes}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <DeadlineCountdown
          deadlineAt={localOrder.deadlineAt}
          workshopStart={localOrder.workshopStart}
          rugCount={rugQty}
          participantCount={1}
        />

        <SketchSelectionView
          rugSlots={rugSlots}
          catalog={catalog || []}
          workshopStart={localOrder.workshopStart}
          deadlineAt={localOrder.deadlineAt}
          totalRugCount={localOrder.rugCount}
          buyerName={organizerInfo.buyerName}
          orderNumber={ecomSummary?.orderNumber}
          onSelectSketch={(sel) => handleSelectSketch({ ...sel, participantId: verifiedParticipant._id })}
          onRequestUpgrade={handleRequestUpgrade}
          onFetchCatalog={handleFetchCatalog}
          existingSelections={mySelections}
          onValidateImage={handleValidateImage}
          onGenerateSketch={handleGenerateSketch}
          onSaveApprovedSketch={handleSaveApprovedSketch}
          onSubmitFeedback={handleSubmitFeedback}
          onCheckRateLimit={handleCheckRateLimit}
          onGetAITermsStatus={handleGetAITermsStatus}
          onAcceptAITerms={handleAcceptAITerms}
          onVerifySketchForEdit={(rugIndex) => handleVerifySketchForEdit(rugIndex, verifiedParticipant._id)}
          session90={session90}
        />
      </div>
    );
  }

  return <InvalidLinkMessage />;
}
