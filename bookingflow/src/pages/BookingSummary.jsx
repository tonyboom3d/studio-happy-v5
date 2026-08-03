import React, { useState, useEffect } from 'react';
import FloatingSummary from '../components/booking/FloatingSummary';

/**
 * BookingSummary Page - דף נפרד לסיכום ההזמנה
 * דף זה מיועד להיות ב-iframe נפרד שיהיה sticky
 * הוא מקשיב להודעות מה-Wix VELO (parent) כדי לקבל את נתוני ההזמנה
 */
export default function BookingSummary() {
  const [summaryData, setSummaryData] = useState({
    participants: 1,
    woodType: '',
    cart: [],
    selectedSlots: [],
    totalMeetings: 0,
    activeSection: 1,
    isProcessing: false,
    isComplete: false,
    hasPaymentError: false
  });

  useEffect(() => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';

    const handleMessage = (event) => {
      if (event.data?.type === 'SUMMARY_UPDATE') {
        const data = event.data.data;
        setSummaryData({
          participants: data.participants || 1,
          woodType: data.woodType || '',
          cart: data.cart || [],
          selectedSlots: data.selectedSlots || [],
          totalMeetings: data.totalMeetings || 0,
          activeSection: data.activeSection || 1,
          isProcessing: !!data.isProcessing,
          isComplete: !!data.isComplete,
          hasPaymentError: !!data.hasPaymentError
        });
      }
      if (event.data?.type === 'CATALOG_STATE_CHANGE') {
        window.postMessage({
          type: 'CATALOG_STATE_CHANGE',
          data: event.data.data
        }, '*');
      }
    };

    window.addEventListener('message', handleMessage);

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'SUMMARY_IFRAME_READY'
      }, '*');
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <div
      className="hidden md:flex w-full h-screen m-0 p-0 overflow-hidden bg-transparent items-end justify-center"
      style={{ minHeight: '100vh' }}
    >
      <FloatingSummary
        participants={summaryData.participants}
        woodType={summaryData.woodType}
        cart={summaryData.cart}
        selectedSlots={summaryData.selectedSlots}
        totalMeetings={summaryData.totalMeetings}
        activeSection={summaryData.activeSection}
        isSummaryPage={true}
      />
    </div>
  );
}
