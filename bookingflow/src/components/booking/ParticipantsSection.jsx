import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Users, Baby, MessageCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateFirstOrderMinimum, FIRST_ORDER_MIN_TICKETS_MESSAGE } from '@/lib/firstOrderMinimum';

export default function ParticipantsSection({
  adults,
  setAdults,
  children,
  setChildren,
  maxParticipants = 10,
  servicePricing,
  selectedSlot,
  onContinue
}) {
  const [validationError, setValidationError] = useState(null);

  const parentChildPairs = Math.min(adults, children);
  const soloAdults = adults - parentChildPairs;
  // מקומות תפוסים: מבוגר ללא ילד = 1, הורה+ילד = 1
  const spotsUsed = adults;
  const totalParticipants = adults + children;
  const isGroupTooLarge = totalParticipants > 9;
  const totalCarpets = adults; // כל מבוגר = שטיח (ילד מצטרף)

  // ילדים בלי מספיק מבוגרים
  const childrenNeedAdult = children > adults;
  const missingAdults = childrenNeedAdult ? children - adults : 0;

  // חריגה מהמקומות הפנויים
  const spotsExceeded = spotsUsed > maxParticipants;
  const spotsRemaining = maxParticipants - spotsUsed;

  const { totalPrice } = useMemo(() => {
    if (!selectedSlot || !servicePricing) return { totalPrice: 0 };
    const pricing = servicePricing[selectedSlot.serviceId];
    if (!pricing) return { totalPrice: 0 };

    const pricePerAdult = pricing.solo || 0;
    const parentChildTicketPrice = pricing.parentChild || pricePerAdult;

    return { totalPrice: (soloAdults * pricePerAdult) + (parentChildPairs * parentChildTicketPrice) };
  }, [selectedSlot, servicePricing, soloAdults, parentChildPairs]);

  const handleAdultsDecrease = () => {
    if (adults > 1) {
      setAdults(adults - 1);
      setValidationError(null);
    }
  };
  const handleAdultsIncrease = () => {
    setAdults(adults + 1);
    setValidationError(null);
  };
  const handleChildrenDecrease = () => {
    if (children > 0) {
      setChildren(children - 1);
      setValidationError(null);
    }
  };
  const handleChildrenIncrease = () => {
    setChildren(children + 1);
    setValidationError(null);
  };

  const handleContinue = () => {
    if (childrenNeedAdult) {
      setValidationError(`יש להוסיף ${missingAdults} ${missingAdults === 1 ? 'מבוגר מלווה' : 'מבוגרים מלווים'} — כל ילד חייב הורה מלווה`);
      return;
    }
    if (spotsExceeded) {
      setValidationError(`נותרו ${maxParticipants} מקומות בלבד בתאריך שנבחר`);
      return;
    }
    const firstOrderError = validateFirstOrderMinimum(adults, selectedSlot);
    if (firstOrderError) {
      setValidationError(FIRST_ORDER_MIN_TICKETS_MESSAGE);
      return;
    }
    setValidationError(null);
    onContinue();
  };

  return (
    <div className="flex flex-col items-center py-4">
      <p className="text-[16px] text-[#464646]/70 mb-4">כמה משתתפים יהיו בסדנה?</p>

      {/* מבוגרים + ילדים בשורה אחת */}
      <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-2">
        {/* מבוגרים */}
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Users className="w-5 h-5 text-[#581E83]" />
            <span className="text-[20px] font-medium text-[#581E83]">מבוגרים</span>
            <span className="text-[16px] text-[#464646]/50">(14+)</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleAdultsDecrease}
              disabled={adults <= 1}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
            >
              <Minus className="w-3 h-3" />
            </button>
            <motion.div
              key={adults}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-3xl font-bold text-[#581E83] w-9 text-center"
            >
              {adults}
            </motion.div>
            <button
              type="button"
              onClick={handleAdultsIncrease}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ילדים */}
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Baby className="w-5 h-5 text-[#581E83]" />
            <span className="text-[20px] font-medium text-[#581E83]">ילדים</span>
            <span className="text-[16px] text-[#464646]/50">(8-13)</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleChildrenDecrease}
              disabled={children <= 0}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
            >
              <Minus className="w-3 h-3" />
            </button>
            <motion.div
              key={children}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-3xl font-bold text-[#581E83] w-9 text-center"
            >
              {children}
            </motion.div>
            <button
              type="button"
              onClick={handleChildrenIncrease}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>


      {/* סיכום ויזואלי עם אייקונים — סדר: מבוגר | שטיח | ילד */}
      {!isGroupTooLarge && (
        <div className="w-full max-w-md rounded-xl border border-[#e8e8e8] bg-[#fafafa] p-3 mb-3">
          <div className="flex items-start justify-around text-center">
            {/* מבוגרים */}
            <div className="flex flex-col items-center gap-1">
              <Users className="w-5 h-5 text-[#581E83]" />
              <span className="text-[20px] font-bold text-[#581E83]">{adults}</span>
              <span className="text-[16px] text-[#464646]/60">{adults === 1 ? 'מבוגר' : 'מבוגרים'}</span>
            </div>

            {/* שטיחים — באמצע עם הסבר מתחת */}
            <div className="flex flex-col items-center gap-1">
              <img src="https://static.wixstatic.com/shapes/6b73e9_f67847d51b16410cae6da5c70fdcae13.svg" alt="" className="w-5 h-5" />
              <span className="text-[20px] font-bold text-[#581E83]">{totalCarpets}</span>
              <span className="text-[16px] text-[#464646]/60">{totalCarpets === 1 ? 'שטיח' : 'שטיחים'}</span>
              {children > 0 && (
                <span className="text-[14px] text-[#5E2F88]/70 mt-0.5 leading-tight">
                  הורה + ילד = שטיח אחד
                </span>
              )}
            </div>

            {/* ילדים */}
            <div className="flex flex-col items-center gap-1">
              <Baby className="w-5 h-5 text-[#581E83]" />
              <span className="text-[20px] font-bold text-[#581E83]">{children}</span>
              <span className="text-[16px] text-[#464646]/60">{children === 1 ? 'ילד' : 'ילדים'}</span>
            </div>

            {/* קו מפריד */}
            {totalPrice > 0 && <div className="h-12 w-px bg-[#e8e8e8]" />}

            {/* מחיר */}
            {totalPrice > 0 && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[16px] text-[#464646]/60">סה״כ</span>
                <span className="text-[20px] font-bold text-[#5E2F88]">₪{totalPrice}</span>
                <span className="text-[16px] text-[#464646]/60">לסדנה</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* שגיאת חריגה מהמקומות הפנויים */}
      {spotsExceeded && (
        <div className="w-full max-w-md mb-3 rounded-lg border border-red-300 bg-red-50 p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="text-xs text-red-700">
              <p className="font-medium mb-1">אין מספיק מקומות בתאריך שנבחר</p>
              <p>נותרו {maxParticipants} מקומות בלבד. הפחיתו משתתפים, בחרו תאריך אחר, או{' '}
                <a href="https://wa.link/jbfarf" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  צרו קשר בוואטסאפ
                </a> לבירור.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* הודעת מינימום להזמנה ראשונה במועד */}
      {validationError === FIRST_ORDER_MIN_TICKETS_MESSAGE && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="w-full max-w-md mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5"
        >
          <p className="text-xs text-amber-900 text-center leading-relaxed">
            {FIRST_ORDER_MIN_TICKETS_MESSAGE}
          </p>
        </motion.div>
      )}

      {/* כפתור המשך + שגיאת ולידציה */}
      {!isGroupTooLarge && (
        <div className="flex flex-col items-center gap-2">
          <Button
            onClick={handleContinue}
            className="bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8 py-2.5 rounded-lg text-base"
          >
          המשך לשלב הבא
          </Button>

          <AnimatePresence>
            {validationError && validationError !== FIRST_ORDER_MIN_TICKETS_MESSAGE && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-xs text-red-600 text-center max-w-[300px]"
              >
                {validationError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* לינק לקבוצות גדולות — מתחת לכפתור */}
      {!isGroupTooLarge && totalParticipants >= 5 && (
        <div className="mt-3">
          <a
            href="https://wa.link/jbfarf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#5E2F88] underline hover:no-underline"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
            <span>אנחנו קבוצה גדולה - מעל ל 9 משתתפים</span>
          </a>
        </div>
      )}

      {/* קבוצה גדולה מעל 9 */}
      {isGroupTooLarge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex flex-col items-center gap-2 text-center"
        >
          <p className="text-sm text-[#464646]/80 max-w-[280px]">
            לקבוצות מעל 9 משתתפים יש לנו הצעות מיוחדות!
          </p>
          <a
            href="https://wa.link/jbfarf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-5 py-2 text-sm text-white font-medium hover:bg-[#20bd5a] transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            אנחנו קבוצה גדולה - מעל ל 9 משתתפים
          </a>
        </motion.div>
      )}
    </div>
  );
}
