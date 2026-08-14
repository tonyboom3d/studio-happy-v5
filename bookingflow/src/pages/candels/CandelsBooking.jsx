import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CreditCard, RefreshCw } from 'lucide-react';
import AccordionSection from '@/components/booking/AccordionSection';
import TimeSlotsSection from '@/components/booking/TimeSlotsSection';
import CandelsParticipantsSection from '@/components/candels/CandelsParticipantsSection';
import CupSelectionSection from '@/components/candels/CupSelectionSection';
import CandelsOrderSummarySection from '@/components/candels/CandelsOrderSummarySection';
import { submitBooking, subscribeToWix, notifyProgress, isWixEditorOrPreview } from '@/api/wixBridge';
import { addLog } from '@/components/VersionLogger';
import { computeCandlesCounts, computeCandlesPrice, getMaxExtraCandles, computeExtraCandlesPrice } from '@/lib/candlesPricing';

// Candles workshop ("סדנת נרות") booking flow — same 4-step accordion shape
// as Tufting's WorkshopBooking, with a cup-selection step instead of the
// sketch-info step, and cup pricing folded into the order total/checkout
// payload. Kept in its own file/route so the Tufting flow is never touched.
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 דקות

export default function CandelsBooking() {
  const navigate = useNavigate();

  // State ראשי
  const [activeSection, setActiveSection] = useState(1);
  const [completedSections, setCompletedSections] = useState([]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [prevActiveSection, setPrevActiveSection] = useState(1);

  // נתוני ההזמנה
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [extraCandles, setExtraCandles] = useState(0);
  const [cupCart, setCupCart] = useState([]);

  // נתונים מ-Wix
  const [wixProducts, setWixProducts] = useState(null);
  const [wixSlots, setWixSlots] = useState(null);
  const [servicePricing, setServicePricing] = useState(null);

  // guard שמונע קריאה כפולה ל-handleSubmit
  const submittingRef = useRef(false);

  // סטטוס
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // טיימר 8 דקות
  const [sessionExpired, setSessionExpired] = useState(false);
  const [remainingMs, setRemainingMs] = useState(SESSION_TIMEOUT_MS);
  const sessionStartRef = useRef(Date.now());

  const skipInitialLoadingScreen = useMemo(() => isWixEditorOrPreview(), []);

  // --- טיימר 8 דקות ---
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
    addLog('[Candels] Subscribing to Wix data', 'info');
    const unsubscribe = subscribeToWix((data) => {
      if (data.products) {
        setWixProducts(data.products);
        addLog(`[Candels] Loaded ${data.products.length} cups`, 'success');
      }
      if (data.slots) {
        setWixSlots(data.slots);
        addLog(`[Candels] Loaded ${data.slots.length} time slots`, 'success');
      }
      if (data.servicePricing) {
        setServicePricing(data.servicePricing);
        addLog('[Candels] Loaded service pricing', 'success');
      }
      if (data.bookingConfirmed) {
        setIsProcessing(false);
        setIsComplete(true);
        addLog(`[Candels] Booking confirmed!`, 'success');
      }
      if (data.bookingError) {
        setIsProcessing(false);
        submittingRef.current = false;
        setBookingError(data.bookingError);
        addLog(`[Candels] Booking error: ${data.bookingError}`, 'error');
      }
    });

    return unsubscribe;
  }, [navigate]);

  // עדכון Wix על התקדמות
  useEffect(() => {
    addLog(`[Candels] Active section changed to: ${activeSection}`, 'info');
    notifyProgress(activeSection, { adults, children, extraCandles, hasSelectedSlot: !!selectedSlot });
  }, [activeSection, adults, children, extraCandles, selectedSlot]);

  // פתיחה/סגירה אוטומטית של סיכום הזמנה
  useEffect(() => {
    if (activeSection === 4 && prevActiveSection !== 4) {
      setSummaryExpanded(true);
    }
    if (prevActiveSection === 4 && activeSection < 4) {
      setSummaryExpanded(false);
    }
    setPrevActiveSection(activeSection);
  }, [activeSection, prevActiveSection]);

  // חישוב מספר יחידות (נרות): הילד הראשון תחת כל מבוגר מלווה = כרטיס הורה+ילד
  // (נר אחד), כל ילד נוסף תחת אותו מבוגר = "תוספת ילד". מבוגר אחד יכול ללוות
  // עד MAX_CHILDREN_PER_ADULT ילדים למבוגר. מבוגר שלא מלווה ילדים = כרטיס יחיד (נר אחד).
  const { soloAdults, parentChildPairs, extraChildren, totalCandles: baseCandles } = useMemo(
    () => computeCandlesCounts({ adults, children }),
    [adults, children]
  );

  // מכסת כוסות = נרות בסיס + נרות נוספים (כל נר, בסיס או נוסף, צריך כוס).
  const totalCups = baseCandles + extraCandles;

  // מחיר כרטיסים
  const slotPricing = useMemo(
    () => servicePricing?.[selectedSlot?.serviceId] || null,
    [selectedSlot, servicePricing]
  );
  const ticketPrice = useMemo(
    () => computeCandlesPrice(slotPricing, { soloAdults, parentChildPairs, extraChildren }).totalPrice,
    [slotPricing, soloAdults, parentChildPairs, extraChildren]
  );

  // "נר נוסף" — עד נר אחד נוסף לכל נר בסיס; חותכים אוטומטית אם הבסיס יורד.
  const maxExtraCandles = getMaxExtraCandles(baseCandles);
  useEffect(() => {
    if (extraCandles > maxExtraCandles) {
      setExtraCandles(maxExtraCandles);
    }
  }, [extraCandles, maxExtraCandles]);
  const extraCandlesTotal = computeExtraCandlesPrice(slotPricing?.extraCandle, extraCandles);

  // מחיר תוספת כוסות
  const cupsExtraTotal = useMemo(() => {
    return cupCart.reduce((sum, c) => sum + (Number(c.price) || 0) * (c.quantity || 1), 0);
  }, [cupCart]);

  const orderTotalPreview = ticketPrice + extraCandlesTotal + cupsExtraTotal;

  // איפוס בחירת כוסות שחורגת מהמכסה החדשה (למשל אחרי הפחתת נרות נוספים).
  useEffect(() => {
    setCupCart((prevCart) => {
      const totalItems = prevCart.reduce((sum, p) => sum + (p.quantity || 1), 0);
      if (totalItems <= totalCups) return prevCart;
      let remaining = totalCups;
      const next = [];
      for (const p of prevCart) {
        if (remaining <= 0) break;
        const qty = Math.min(p.quantity || 1, remaining);
        next.push({ ...p, quantity: qty });
        remaining -= qty;
      }
      return next;
    });
  }, [totalCups]);

  // עדכון כמות כוס נבחרת (עד למכסת totalCups)
  const updateCupQuantity = (productId, delta) => {
    setCupCart(prevCart => {
      const totalItems = prevCart.reduce((sum, p) => sum + (p.quantity || 1), 0);
      if (delta > 0 && totalItems >= totalCups) return prevCart;
      return prevCart
        .map(p => {
          if ((p._id || p.id) !== productId) return p;
          const newQty = (p.quantity || 1) + delta;
          return { ...p, quantity: newQty };
        })
        .filter(p => (p.quantity || 1) > 0);
    });
  };

  // מעבר לסקשן הבא
  const completeSection = (sectionNum) => {
    if (!completedSections.includes(sectionNum)) {
      setCompletedSections([...completedSections, sectionNum]);
    }
    setActiveSection(sectionNum + 1);
    addLog(`[Candels] Section ${sectionNum} completed, moving to section ${sectionNum + 1}`, 'success');
  };

  const canOpenSection = (sectionNum) => {
    if (sectionNum === 4) return true;
    if (sectionNum <= activeSection) return true;
    if (completedSections.includes(sectionNum - 1)) return true;
    return false;
  };

  const openSection = (sectionNum) => {
    if (!canOpenSection(sectionNum)) return;
    setActiveSection(sectionNum);
  };

  // שליחת ההזמנה (כולל הכוסות שנבחרו)
  const handleSubmit = async () => {
    if (submittingRef.current) return;

    // Defense-in-depth: the pay button is already disabled while cup
    // selection is incomplete, but never allow a submit to reach the
    // backend with missing cups regardless of how it was triggered.
    const selectedCupCount = cupCart.reduce((sum, c) => sum + (c.quantity || 1), 0);
    if (totalCups > 0 && selectedCupCount < totalCups) {
      const cupsWord = totalCups === 1 ? 'כוס' : 'כוסות';
      setBookingError(
        selectedCupCount === 0
          ? `יש לבחור ${cupsWord} לנרות לפני המשך לתשלום`
          : `יש להשלים בחירת הכוסות (${selectedCupCount}/${totalCups} ${cupsWord}) לפני המשך לתשלום`
      );
      addLog('[Candels] Submit blocked — cup selection incomplete', 'error');
      return;
    }

    submittingRef.current = true;
    setBookingError(null);
    addLog('[Candels] Starting booking submission...', 'info');
    setIsProcessing(true);

    const bookingData = {
      adults,
      children,
      extraCandles,
      selectedSlot: selectedSlot ? {
        slot_id: selectedSlot._id || selectedSlot.sessionId,
        date: selectedSlot.start?.timestamp,
        sessionId: selectedSlot.sessionId,
        serviceId: selectedSlot.serviceId,
        openSpots: selectedSlot.openSpots
      } : null,
      total_price: orderTotalPreview,
      products: cupCart.map(c => ({
        id: c._id || c.id,
        quantity: c.quantity || 1,
      })),
    };

    console.log('[Candels][Frontend] bookingData being sent to Wix:', JSON.stringify(bookingData, null, 2));
    addLog('[Candels] Submitting booking', 'info');
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
            חלפו 8 דקות מאז שנכנסת לעמוד ההזמנה.
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
            טוען סדנת נרות
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

  const cupStepTitle = totalCups > 1 ? 'בחירת כוסות לנרות' : 'בחירת כוס לנר';

  const sections = [
    { id: 1, title: 'בחירת תאריך' },
    { id: 2, title: 'כמה תהיו ?' },
    { id: 3, title: cupStepTitle },
    { id: 4, title: 'סיכום הזמנה' }
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
        <p className="text-[#464646]" style={{ marginTop: 0 }}>הזמנת סדנת נרות</p>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="space-y-4">
          {sections.map((section) => {
            const isLocked = isProcessing
              ? section.id !== 4
              : section.id === 4
                ? false
                : section.id > 1 && !completedSections.includes(section.id - 1);
            const isCompleted = completedSections.includes(section.id);
            const isActive = section.id === 4 ? summaryExpanded : activeSection === section.id;

            const headerRight =
              section.id === 4 ? (
                <span className="flex items-center gap-1.5 text-base font-bold tabular-nums text-white">
                  <CreditCard className="h-5 w-5 shrink-0 opacity-95" aria-hidden />
                  ₪{Math.round(orderTotalPreview)}
                </span>
              ) : null;

            const handleSectionClick = () => {
              if (section.id === 4) {
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
                variant={section.id === 4 ? 'summary' : 'default'}
                stepNumber={section.id}
                isActive={isActive}
                isCompleted={isCompleted}
                isLocked={isLocked}
                onClick={handleSectionClick}
              >
                {section.id === 1 && (
                  <TimeSlotsSection
                    selectedSlot={selectedSlot}
                    setSelectedSlot={setSelectedSlot}
                    availableSlots={wixSlots}
                    servicePricing={servicePricing}
                    onContinue={() => completeSection(1)}
                    stackTimeSlots
                    bookingBlockHours={1}
                  />
                )}
                {section.id === 2 && (
                  <CandelsParticipantsSection
                    adults={adults}
                    setAdults={setAdults}
                    children={children}
                    setChildren={setChildren}
                    extraCandles={extraCandles}
                    setExtraCandles={setExtraCandles}
                    maxParticipants={selectedSlot?.openSpots || 10}
                    servicePricing={servicePricing}
                    selectedSlot={selectedSlot}
                    onContinue={() => completeSection(2)}
                  />
                )}
                {section.id === 3 && (
                  <CupSelectionSection
                    cart={cupCart}
                    setCart={setCupCart}
                    totalCups={totalCups}
                    onContinue={() => completeSection(3)}
                    wixProducts={wixProducts}
                    updateQuantity={updateCupQuantity}
                  />
                )}
                {section.id === 4 && (
                  <CandelsOrderSummarySection
                    adults={adults}
                    children={children}
                    soloAdults={soloAdults}
                    parentChildPairs={parentChildPairs}
                    extraChildren={extraChildren}
                    extraCandles={extraCandles}
                    extraCandlesTotal={extraCandlesTotal}
                    selectedSlot={selectedSlot}
                    servicePricing={servicePricing}
                    selectedCups={cupCart}
                    cupsExtraTotal={cupsExtraTotal}
                    totalCups={totalCups}
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
    </div>
  );
}
