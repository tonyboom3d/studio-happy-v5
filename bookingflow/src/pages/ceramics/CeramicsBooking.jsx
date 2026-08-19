import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CreditCard, RefreshCw, AlertTriangle } from 'lucide-react';
import AccordionSection from '@/components/booking/AccordionSection';
import TimeSlotsSection from '@/components/booking/TimeSlotsSection';
import CeramicsParticipantsSection from '@/components/ceramics/CeramicsParticipantsSection';
import CeramicsOrderSummarySection from '@/components/ceramics/CeramicsOrderSummarySection';
import { submitBooking, subscribeToWix, notifyProgress, isWixEditorOrPreview } from '@/api/wixBridge';
import { addLog } from '@/components/VersionLogger';
import { computeCeramicsPrice, getMaxExtraItems, resolveCeramicsDayPricing } from '@/lib/ceramicsPricing';

// Ceramics workshop ("סדנת קרמיקה") booking flow — same accordion shape as
// Candels/WorkshopBooking, but simpler: no adult/child split (single
// "participants" ticket) and no catalog/cup-selection step. Kept in its own
// file/route so the Tufting and Candles flows are never touched.
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 דקות

export default function CeramicsBooking() {
  const navigate = useNavigate();

  // State ראשי
  const [activeSection, setActiveSection] = useState(1);
  const [completedSections, setCompletedSections] = useState([]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [prevActiveSection, setPrevActiveSection] = useState(1);

  // נתוני ההזמנה
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [participants, setParticipants] = useState(1);
  const [extraItems, setExtraItems] = useState(0);

  // אישור איפוס בחירות כשמשנים תאריך/שעה אחרי שכבר התקדמנו הלאה
  const [pendingSlot, setPendingSlot] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // נתונים מ-Wix
  const [wixSlots, setWixSlots] = useState(null);
  const [servicePricing, setServicePricing] = useState(null);

  // guard שמונע קריאה כפולה ל-handleSubmit
  const submittingRef = useRef(false);

  // סטטוס
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // טיימר 10 דקות
  const [sessionExpired, setSessionExpired] = useState(false);
  const [remainingMs, setRemainingMs] = useState(SESSION_TIMEOUT_MS);
  const sessionStartRef = useRef(Date.now());

  const skipInitialLoadingScreen = useMemo(() => isWixEditorOrPreview(), []);

  // --- טיימר 10 דקות ---
  useEffect(() => {
    if (skipInitialLoadingScreen) return;

    const tick = setInterval(() => {
      const elapsed = Date.now() - sessionStartRef.current;
      const remaining = SESSION_TIMEOUT_MS - elapsed;
      if (remaining <= 0) {
        setRemainingMs(0);
        setSessionExpired(true);
        clearInterval(tick);
      } else {
        setRemainingMs(remaining);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [skipInitialLoadingScreen]);

  const timerMinutes = Math.floor(remainingMs / 60000);
  const timerSeconds = Math.floor((remainingMs % 60000) / 1000);
  const timerText = `${timerMinutes}:${String(timerSeconds).padStart(2, '0')}`;

  // טיימר מינימום 3 שניות לטעינה
  useEffect(() => {
    if (skipInitialLoadingScreen) {
      setMinTimeElapsed(true);
      return;
    }
    const timer = setTimeout(() => setMinTimeElapsed(true), 3000);
    return () => clearTimeout(timer);
  }, [skipInitialLoadingScreen]);

  // האזנה לנתונים מ-Wix
  useEffect(() => {
    addLog('[Ceramics] Subscribing to Wix data', 'info');
    const unsubscribe = subscribeToWix((data) => {
      if (data.slots) {
        setWixSlots(data.slots);
        addLog(`[Ceramics] Loaded ${data.slots.length} time slots`, 'success');
      }
      if (data.servicePricing) {
        setServicePricing(data.servicePricing);
        addLog('[Ceramics] Loaded service pricing', 'success');
      }
      if (data.bookingConfirmed) {
        setIsProcessing(false);
        setIsComplete(true);
        addLog(`[Ceramics] Booking confirmed!`, 'success');
      }
      if (data.bookingError) {
        setIsProcessing(false);
        submittingRef.current = false;
        setBookingError(data.bookingError);
        addLog(`[Ceramics] Booking error: ${data.bookingError}`, 'error');
      }
    });

    return unsubscribe;
  }, [navigate]);

  // עדכון Wix על התקדמות
  useEffect(() => {
    addLog(`[Ceramics] Active section changed to: ${activeSection}`, 'info');
    notifyProgress(activeSection, { participants, extraItems, hasSelectedSlot: !!selectedSlot });
  }, [activeSection, participants, extraItems, selectedSlot]);

  // פתיחה/סגירה אוטומטית של סיכום הזמנה
  useEffect(() => {
    if (activeSection === 3 && prevActiveSection !== 3) {
      setSummaryExpanded(true);
    }
    if (prevActiveSection === 3 && activeSection < 3) {
      setSummaryExpanded(false);
    }
    setPrevActiveSection(activeSection);
  }, [activeSection, prevActiveSection]);

  // מחיר: משתתף אחד = כרטיס בסיס אחד; "כלי קרמיקה נוסף" — עד יחידה אחת נוספת לכל משתתף.
  const maxExtraItems = getMaxExtraItems(participants);
  useEffect(() => {
    if (extraItems > maxExtraItems) {
      setExtraItems(maxExtraItems);
    }
  }, [extraItems, maxExtraItems]);

  const slotPricing = useMemo(
    () => resolveCeramicsDayPricing(servicePricing?.[selectedSlot?.serviceId], selectedSlot),
    [selectedSlot, servicePricing]
  );
  const { totalPrice: orderTotalPreview } = useMemo(
    () => computeCeramicsPrice({ participants, extraItems }, slotPricing),
    [slotPricing, participants, extraItems]
  );

  // מעבר לסקשן הבא
  const completeSection = (sectionNum) => {
    if (!completedSections.includes(sectionNum)) {
      setCompletedSections([...completedSections, sectionNum]);
    }
    setActiveSection(sectionNum + 1);
    addLog(`[Ceramics] Section ${sectionNum} completed, moving to section ${sectionNum + 1}`, 'success');
  };

  // בחירת תאריך/שעה חדשים בשלב 1. אם המשתמש כבר התקדם הלאה (עם בחירת
  // משתתפים קיימת) ומנסה לשנות תאריך למועד אחר — מציגים אישור לפני שמאפסים.
  const handleSelectSlot = (slot) => {
    const isDifferentSlot = selectedSlot && slot && selectedSlot.sessionId !== slot.sessionId;
    const hasProgressed = completedSections.length > 0;
    if (isDifferentSlot && hasProgressed) {
      setPendingSlot(slot);
      setShowResetConfirm(true);
      return;
    }
    setSelectedSlot(slot);
  };

  const confirmSlotChange = () => {
    setSelectedSlot(pendingSlot);
    setParticipants(1);
    setExtraItems(0);
    setCompletedSections([]);
    setActiveSection(1);
    setSummaryExpanded(false);
    setPendingSlot(null);
    setShowResetConfirm(false);
    addLog('[Ceramics] Date changed — selections reset', 'info');
  };

  const cancelSlotChange = () => {
    setPendingSlot(null);
    setShowResetConfirm(false);
  };

  const canOpenSection = (sectionNum) => {
    if (sectionNum === 3) return true;
    if (sectionNum <= activeSection) return true;
    if (completedSections.includes(sectionNum - 1)) return true;
    return false;
  };

  const openSection = (sectionNum) => {
    if (!canOpenSection(sectionNum)) return;
    setActiveSection(sectionNum);
  };

  // שליחת ההזמנה
  const handleSubmit = async () => {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setBookingError(null);
    addLog('[Ceramics] Starting booking submission...', 'info');
    setIsProcessing(true);

    const bookingData = {
      participants,
      extraItems,
      selectedSlot: selectedSlot ? {
        slot_id: selectedSlot._id || selectedSlot.sessionId,
        date: selectedSlot.start?.timestamp,
        sessionId: selectedSlot.sessionId,
        serviceId: selectedSlot.serviceId,
        openSpots: selectedSlot.openSpots
      } : null,
      total_price: orderTotalPreview,
      products: [],
    };

    console.log('[Ceramics][Frontend] bookingData being sent to Wix:', JSON.stringify(bookingData, null, 2));
    addLog('[Ceramics] Submitting booking', 'info');
    submitBooking(bookingData);

    setTimeout(() => {
      setIsProcessing(prev => {
        if (!prev) return prev;
        setBookingError(prevError => prevError || 'timeout');
        submittingRef.current = false;
        return false;
      });
    }, 60000);
  };

  // --- חלונית סשן פג תוקף (לא ניתנת לסגירה) ---
  if (sessionExpired) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FEE2E2] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-[#581E83] mb-2">
            פג תוקף ההזמנה
          </h2>
          <p className="text-sm text-[#464646] mb-6 leading-relaxed">
            חלפו 10 דקות מאז שנכנסת לעמוד ההזמנה.
            <br />
            יש לרענן את העמוד ולהתחיל מחדש כדי להבטיח
            <br />
            שהמועדים והמחירים עדכניים.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-[#5E2F88] hover:bg-[#7B3DB0] text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            רענון העמוד
          </button>
        </motion.div>
      </div>
    );
  }

  // מסך טעינה ראשוני
  if (!skipInitialLoadingScreen && (!minTimeElapsed || wixSlots == null)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <div className="relative flex items-center justify-center">
            <div className="w-28 h-28 rounded-full border-4 border-[#e8e8e8] border-t-[#5E2F88] animate-spin absolute" />
            <img
              src="https://static.wixstatic.com/media/6b73e9_6e7c52763bb24ba6812aaac51ecb4296~mv2.png"
              alt="סטודיו האפי"
              className="w-14 h-14 object-contain rounded-full"
            />
          </div>
          <p className="text-lg font-semibold text-[#581E83] tracking-wide mt-8">
            טוען סדנת קרמיקה
          </p>
        </motion.div>
      </div>
    );
  }

  // הזמנה הושלמה — מסך ביניים
  if (isComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <div className="w-20 h-20 rounded-full bg-[#5E2F88] flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-[#581E83]">ההזמנה בוצעה בהצלחה!</p>
        </motion.div>
      </div>
    );
  }

  const sections = [
    { id: 1, title: 'בחירת תאריך' },
    { id: 2, title: 'כמה תהיו ?' },
    { id: 3, title: 'סיכום הזמנה' }
  ];

  return (
    <div className="min-h-screen bg-transparent" dir="rtl">
      {/* Header */}
      <header
        className="py-8 px-8 text-center border-b border-[#e8e8e8] bg-transparent"
        style={{ paddingTop: 10, paddingBottom: 10 }}
      >
        <div className="relative mb-2 min-h-[28px]">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="absolute top-0 start-0 inline-flex items-center gap-2 text-sm font-medium text-[#581E83] hover:text-[#7B3DB0] transition-colors"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
            חזרה לדף הקודם
          </button>
        </div>
        {!skipInitialLoadingScreen && (
          <div className="flex flex-col items-center gap-0.5 mb-2">
            <span className={`text-sm font-mono font-semibold tabular-nums ${remainingMs < 120000 ? 'text-red-500' : 'text-[#5E2F88]'}`}>
              ⏱ {timerText}
            </span>
            <span className="text-[10px] text-[#464646]/60 leading-none">
              *בסיום הדף יתרענן
            </span>
          </div>
        )}
        <h1 className="text-xl md:text-2xl font-bold text-[#581E83]" style={{ opacity: 1, transform: 'none' }}>
          סטודיו האפי
        </h1>
        <p className="text-[#464646]" style={{ marginTop: 0 }}>הזמנת סדנת קרמיקה</p>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="space-y-4">
          {sections.map((section) => {
            const isLocked = isProcessing
              ? section.id !== 3
              : section.id === 3
                ? false
                : section.id > 1 && !completedSections.includes(section.id - 1);
            const isCompleted = completedSections.includes(section.id);
            const isActive = section.id === 3 ? summaryExpanded : activeSection === section.id;

            const headerRight =
              section.id === 3 ? (
                <span className="flex items-center gap-1.5 text-base font-bold tabular-nums text-white">
                  <CreditCard className="h-5 w-5 shrink-0 opacity-95" aria-hidden />
                  ₪{Math.round(orderTotalPreview)}
                </span>
              ) : null;

            const handleSectionClick = () => {
              if (section.id === 3) {
                setSummaryExpanded(!summaryExpanded);
              } else {
                openSection(section.id);
              }
            };

            return (
              <AccordionSection
                key={section.id}
                title={section.title}
                headerRight={headerRight}
                variant={section.id === 3 ? 'summary' : 'default'}
                stepNumber={section.id}
                isActive={isActive}
                isCompleted={isCompleted}
                isLocked={isLocked}
                onClick={handleSectionClick}
              >
                {section.id === 1 && (
                  <TimeSlotsSection
                    selectedSlot={selectedSlot}
                    setSelectedSlot={handleSelectSlot}
                    availableSlots={wixSlots}
                    servicePricing={servicePricing}
                    onContinue={() => completeSection(1)}
                    stackTimeSlots
                    bookingBlockHours={1}
                  />
                )}
                {section.id === 2 && (
                  <CeramicsParticipantsSection
                    participants={participants}
                    setParticipants={setParticipants}
                    extraItems={extraItems}
                    setExtraItems={setExtraItems}
                    maxParticipants={selectedSlot?.openSpots || 10}
                    servicePricing={servicePricing}
                    selectedSlot={selectedSlot}
                    onContinue={() => completeSection(2)}
                  />
                )}
                {section.id === 3 && (
                  <CeramicsOrderSummarySection
                    participants={participants}
                    extraItems={extraItems}
                    selectedSlot={selectedSlot}
                    servicePricing={servicePricing}
                    totalPrice={orderTotalPreview}
                    onPay={handleSubmit}
                    isProcessing={isProcessing}
                  />
                )}
              </AccordionSection>
            );
          })}
        </div>
      </main>

      {/* אישור איפוס בחירות בעת שינוי תאריך */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center"
          >
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-[#581E83] mb-2">שינוי תאריך יאפס את הבחירות שלך</h2>
            <p className="text-sm text-[#464646] mb-6 leading-relaxed">
              בחרתם משתתפים למועד הקודם. שינוי התאריך יאפס את הבחירות הללו והן ייקבעו מחדש.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelSlotChange}
                className="flex-1 border-2 border-[#5E2F88] text-[#5E2F88] font-semibold py-2.5 rounded-xl transition-colors hover:bg-[#5E2F88]/5"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={confirmSlotChange}
                className="flex-1 bg-[#5E2F88] hover:bg-[#7B3DB0] text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                כן, המשך
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
