import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PostPaymentHub from '@/components/booking/post-payment/PostPaymentHub';
import {
  subscribeToWix,
  sendWithCallback,
  verifyParticipantAccess,
  getWixData,
  notifyIframeReady,
  isInWix,
} from '@/api/wixBridge';
import { readCatalogCache, writeCatalogCache } from '@/lib/utils';

export default function OrderPage() {
  const { token } = useParams();
  const [role, setRole] = useState(token ? 'participant' : 'organizer');
  const [orderContext, setOrderContext] = useState(null);
  const [ecomSummary, setEcomSummary] = useState(null);
  const [orderHistory, setOrderHistory] = useState(null);
  const [participantContext, setParticipantContext] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orderError, setOrderError] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null);
  const [adminOtpRequired, setAdminOtpRequired] = useState(false);
  const [adminOrderId, setAdminOrderId] = useState(null);
  const [isSlowLoading, setIsSlowLoading] = useState(false);

  useEffect(() => {
    const cached = getWixData();
    const cachedCatalog = cached.products
      || cached.orderContext?.catalog
      || readCatalogCache();
    if (cachedCatalog?.length) setCatalog(cachedCatalog);
    if (cached.orderContext) {
      setOrderContext(cached.orderContext);
      setRole(cached.orderRole || 'organizer');
      if (cached.ecomSummary) setEcomSummary(cached.ecomSummary);
      if (cached.orderHistory) setOrderHistory(cached.orderHistory);
      setIsLoading(false);
    }
    if (cached.participantContext) {
      setParticipantContext(cached.participantContext);
      setRole('participant');
      if (cached.participantContext.ecomSummary) {
        setEcomSummary(cached.participantContext.ecomSummary);
      } else if (cached.ecomSummary) {
        setEcomSummary(cached.ecomSummary);
      }
      setIsLoading(false);
    }

    const unsubscribe = subscribeToWix((data) => {
      if (data.orderContext || data.participantContext || data.orderError || data.tokenAccess) {
        setIsSlowLoading(false);
      }
      if (data.products?.length) {
        setCatalog(data.products);
        writeCatalogCache(data.products);
      }

      if (data.orderError) {
        setOrderError(true);
        setIsLoading(false);
        return;
      }

      if (data.orderContext) {
        setOrderError(false);
        setOrderContext(data.orderContext);
        setRole(data.role || 'organizer');
        if (data.ecomSummary) setEcomSummary(data.ecomSummary);
        if (data.orderHistory) setOrderHistory(data.orderHistory);
        if (data.orderContext.catalog?.length) {
          setCatalog(data.orderContext.catalog);
          writeCatalogCache(data.orderContext.catalog);
        }
        setIsLoading(false);
        if (data.orderContext?.order?._id) {
          try { sessionStorage.setItem('workshop_order_id', data.orderContext.order._id); } catch (e) {}
        }
      }

      if (data.participantContext) {
        if (data.participantContext.valid === false) {
          setIsLoading(false);
          return;
        }
        setParticipantContext(data.participantContext);
        setRole('participant');
        if (data.participantContext.ecomSummary) {
          setEcomSummary(data.participantContext.ecomSummary);
        } else if (data.ecomSummary) {
          setEcomSummary(data.ecomSummary);
        }
        setIsLoading(false);
      }

      if (data.adminOtpRequired) {
        setAdminOtpRequired(true);
        setAdminOrderId(data.adminOrderId);
        setIsLoading(false);
      }

      if (data.tokenAccess) {
        if (data.groupInfo) setGroupInfo(data.groupInfo);
        setIsLoading(false);
      }
    });

    if (token) {
      verifyParticipantAccess(token, '');
    }
    // Note: the organizer/order path no longer calls requestOrderContext()
    // directly here — notifyIframeReady() below already sends the cached
    // sessionStorage orderId as part of IFRAME_READY, and Velo's IFRAME_READY
    // handler uses that same id as its fallback if it doesn't already have a
    // pending payload in flight. Calling both caused two parallel
    // getOrderContext() CMS fetches on every revisit.

    if (isInWix()) {
      notifyIframeReady();
    }

    // At 10s, keep the loading state but surface a "still working" hint with
    // a retry action instead of dropping straight into an invalid/blank
    // state — Velo's CMS resolve retries (up to ~4.5s) plus network latency
    // can occasionally exceed 10s under load. Only give up and clear the
    // loading state at 20s if truly nothing arrived by then.
    const slowTimeout = setTimeout(() => {
      setIsSlowLoading(true);
    }, 10000);
    const hardTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 20000);

    return () => {
      unsubscribe();
      clearTimeout(slowTimeout);
      clearTimeout(hardTimeout);
    };
  }, [token]);

  const handleRetryLoad = useCallback(() => {
    setIsSlowLoading(false);
    if (isInWix()) {
      notifyIframeReady();
    }
  }, []);

  const handleSendMessage = useCallback((type, data, callback) => {
    if (callback) {
      const longRunning = type === 'GENERATE_SKETCH' || type === 'VALIDATE_IMAGE' || type === 'SAVE_APPROVED_SKETCH';
      const timeoutMs = longRunning ? 120000 : 30000;
      sendWithCallback(type, data, callback, timeoutMs);
    } else {
      try {
        window.parent.postMessage({ type, data }, '*');
      } catch (e) {}
    }
  }, []);

  return (
    <div className="min-h-screen bg-transparent" dir="rtl">
      <PostPaymentHub
        orderContext={orderContext}
        ecomSummary={ecomSummary}
        orderHistory={orderHistory}
        participantContext={participantContext}
        role={role}
        catalog={catalog || []}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        isSlowLoading={isSlowLoading}
        onRetryLoad={handleRetryLoad}
        orderError={orderError}
        groupInfo={groupInfo}
        adminOtpRequired={adminOtpRequired}
        adminOrderId={adminOrderId}
        onAdminVerified={(ctx) => {
          setAdminOtpRequired(false);
          setOrderContext(ctx);
          setRole('organizer');
        }}
      />
    </div>
  );
}
