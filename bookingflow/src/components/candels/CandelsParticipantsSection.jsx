import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Users, Baby, MessageCircle, AlertTriangle, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateFirstOrderMinimum, FIRST_ORDER_MIN_TICKETS_MESSAGE } from '@/lib/firstOrderMinimum';
import {
  MAX_CHILDREN_PER_ADULT,
  computeCandlesCounts,
  computeCandlesPrice,
  getMaxExtraCandles,
  computeExtraCandlesPrice,
} from '@/lib/candlesPricing';

// Candles workshop ("סדנת נרות") participants step.
// Minimum age is 4. The first child grouped under an accompanying adult
// books a "הורה+ילד" ticket (one candle, priced as "ילד"); every additional
// child under that same adult (up to MAX_CHILDREN_PER_ADULT) books a
// "תוספת ילד" ticket (own candle, priced like a solo ticket). Adults not
// accompanying children get a solo ticket (one candle). "נר נוסף" is a
// separate add-on — extra candle, no extra Wix Bookings seat.
export default function CandelsParticipantsSection({
  adults,
  setAdults,
  children,
  setChildren,
  extraCandles,
  setExtraCandles,
  maxParticipants = 10,
  servicePricing,
  selectedSlot,
  onContinue
}) {
  const [validationError, setValidationError] = useState(null);

  const { soloAdults, parentChildPairs, extraChildren, totalCandles, seatsUsed } = useMemo(
    () => computeCandlesCounts({ adults, children }),
    [adults, children]
  );
  // מקומות תפוסים ב-Wix Bookings: כל אדם (מבוגר או ילד) = מקום אחד, בלי קשר
  // לכמה נרות/כרטיסים הם חולקים.
  const spotsUsed = seatsUsed;
  const totalParticipants = adults + children;
  const isGroupTooLarge = totalParticipants > 9;

  // ילדים בלי מספיק מבוגרים מלווים (מבוגר אחד עד MAX_CHILDREN_PER_ADULT ילדים)
  const childrenNeedAdult = children > adults * MAX_CHILDREN_PER_ADULT;
  const missingAdults = childrenNeedAdult ? Math.ceil(children / MAX_CHILDREN_PER_ADULT) - adults : 0;

  // חריגה מהמקומות הפנויים
  const spotsExceeded = spotsUsed > maxParticipants;

  const maxChildren = adults * MAX_CHILDREN_PER_ADULT;
  const childrenAtMax = children >= maxChildren;
  const childrenIncreaseBlockedBySeats = seatsUsed >= maxParticipants;

  const slotPricing = useMemo(() => {
    if (!selectedSlot?.serviceId || !servicePricing) return null;
    return servicePricing[selectedSlot.serviceId] || null;
  }, [selectedSlot, servicePricing]);

  const { totalPrice: ticketsPrice, soloUnitPrice, parentChildUnitPrice, extraChildUnitPrice } = useMemo(
    () => computeCandlesPrice(slotPricing, { soloAdults, parentChildPairs, extraChildren }),
    [slotPricing, soloAdults, parentChildPairs, extraChildren]
  );

  // "נר נוסף" — עד נר אחד נוסף לכל נר בסיס שהוזמן.
  const maxExtraCandles = getMaxExtraCandles(totalCandles);
  const extraCandlePrice = slotPricing?.extraCandle || 0;

  // כשמספר הנרות הבסיסי יורד (הפחתת מבוגרים/ילדים), חותכים את נרות הנוספים בהתאם.
  useEffect(() => {
    if (extraCandles > maxExtraCandles) {
      setExtraCandles(maxExtraCandles);
    }
  }, [extraCandles, maxExtraCandles, setExtraCandles]);

  const extraCandlesTotal = computeExtraCandlesPrice(extraCandlePrice, extraCandles);
  const totalPrice = ticketsPrice + extraCandlesTotal;
  const displayCandleCount = totalCandles + extraCandles;

  const handleExtraCandlesDecrease = () => {
    if (extraCandles > 0) setExtraCandles(extraCandles - 1);
  };
  const handleExtraCandlesIncrease = () => {
    if (extraCandles < maxExtraCandles) setExtraCandles(extraCandles + 1);
  };

  const handleAdultsDecrease = () => {
    if (adults > 1) {
      const nextAdults = adults - 1;
      setAdults(nextAdults);
      const nextMaxChildren = nextAdults * MAX_CHILDREN_PER_ADULT;
      if (children > nextMaxChildren) {
        setChildren(nextMaxChildren);
      }
      setValidationError(null);
    }
  };
  const handleAdultsIncrease = () => {
    if (seatsUsed >= maxParticipants) return;
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
    if (childrenAtMax || childrenIncreaseBlockedBySeats) return;
    setChildren(children + 1);
    setValidationError(null);
  };

  const handleContinue = () => {
    if (childrenNeedAdult) {
      setValidationError(`יש להוסיף ${missingAdults} ${missingAdults === 1 ? 'מבוגר מלווה' : 'מבוגרים מלווים'} — כל מבוגר יכול ללוות עד ${MAX_CHILDREN_PER_ADULT} ילדים בגילאי 4-10`);
      return;
    }
    if (spotsExceeded) {
      setValidationError(`נותרו ${maxParticipants} מקומות בלבד בתאריך שנבחר`);
      return;
    }
    const firstOrderError = validateFirstOrderMinimum(totalCandles, selectedSlot);
    if (firstOrderError) {
      setValidationError(FIRST_ORDER_MIN_TICKETS_MESSAGE);
      return;
    }
    setValidationError(null);
    onContinue();
  };

  return (
    <div className="flex flex-col items-center py-4">
      <p className="text-[16px] text-[#464646]/70 mb-1">כמה משתתפים יהיו בסדנה?</p>
      <p className="text-[13px] text-[#464646]/50 mb-1">גיל מינימלי להשתתפות בסדנה: 4</p>
      <p className="text-[17px] text-[#5E2F88] mb-4 font-semibold">כל מבוגר יכול ללוות עד {MAX_CHILDREN_PER_ADULT} ילדים בהזמנה</p>

      {/* מבוגרים + ילדים בשורה אחת */}
      <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-2">
        {/* מבוגרים */}
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Users className="w-5 h-5 text-[#581E83]" />
            <span className="text-[20px] font-medium text-[#581E83]">מבוגרים</span>
            <span className="text-[16px] text-[#464646]/50">(11+)</span>
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
              disabled={seatsUsed >= maxParticipants}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
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
            <span className="text-[16px] text-[#464646]/50">(4-10)</span>
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
              disabled={childrenAtMax || childrenIncreaseBlockedBySeats}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* נר נוסף — מתחת לבחירת כמות הכרטיסים */}
      {!isGroupTooLarge && maxExtraCandles > 0 && (
        <div className="w-full max-w-md rounded-xl border border-[#e8e8e8] bg-white p-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Flame className="w-5 h-5 text-[#581E83]" />
              <div>
                <p className="text-[16px] font-medium text-[#581E83]">נר נוסף</p>
                <p className="text-[12px] text-[#464646]/60">
                  לכל מי שרוצה להכין {maxExtraCandles === 1 ? 'נר שני' : 'נרות נוספים'} (עד {maxExtraCandles})
                  {extraCandlePrice > 0 && ` · ₪${extraCandlePrice} לנר`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExtraCandlesDecrease}
                disabled={extraCandles <= 0}
                className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                           text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
              >
                <Minus className="w-3 h-3" />
              </button>
              <motion.div
                key={extraCandles}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-2xl font-bold text-[#581E83] w-7 text-center"
              >
                {extraCandles}
              </motion.div>
              <button
                type="button"
                onClick={handleExtraCandlesIncrease}
                disabled={extraCandles >= maxExtraCandles}
                className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                           text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* סיכום ויזואלי עם אייקונים — סדר: מבוגר | נר | ילד */}
      {!isGroupTooLarge && (
        <div className="w-full max-w-md rounded-xl border border-[#e8e8e8] bg-[#fafafa] p-3 mb-3">
          <div className="flex items-start justify-around text-center">
            {/* מבוגרים */}
            <div className="flex flex-col items-center gap-1">
              <Users className="w-5 h-5 text-[#581E83]" />
              <span className="text-[20px] font-bold text-[#581E83]">{adults}</span>
              <span className="text-[16px] text-[#464646]/60">{adults === 1 ? 'מבוגר' : 'מבוגרים'}</span>
            </div>

            {/* נרות (בסיס + נוספים) */}
            <div className="flex flex-col items-center gap-1">
              <Flame className="w-5 h-5 text-[#581E83]" />
              <span className="text-[20px] font-bold text-[#581E83]">{displayCandleCount}</span>
              <span className="text-[16px] text-[#464646]/60">{displayCandleCount === 1 ? 'נר' : 'נרות'}</span>
            </div>

            {/* ילדים */}
            <div className="flex flex-col items-center gap-1">
              <Baby className="w-5 h-5 text-[#581E83]" />
              <span className="text-[20px] font-bold text-[#581E83]">{children}</span>
              <span className="text-[16px] text-[#464646]/60">{children === 1 ? 'ילד' : 'ילדים'}</span>
            </div>
          </div>

          {totalPrice > 0 && (soloAdults > 0 || parentChildPairs > 0 || extraChildren > 0 || extraCandles > 0) && (
            <div className="mt-3 pt-3 border-t border-[#e8e8e8] space-y-1.5 text-[14px] text-[#464646]">
              {soloAdults > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {soloAdults} × כרטיס יחיד
                  </span>
                  <span className="font-medium tabular-nums">₪{soloAdults * soloUnitPrice}</span>
                </div>
              )}
              {parentChildPairs > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <Baby className="w-3.5 h-3.5" />
                    {parentChildPairs} × הורה + ילד
                  </span>
                  <span className="font-medium tabular-nums">₪{parentChildPairs * parentChildUnitPrice}</span>
                </div>
              )}
              {extraChildren > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <Baby className="w-3.5 h-3.5" />
                    {extraChildren} × תוספת ילד
                  </span>
                  <span className="font-medium tabular-nums">₪{extraChildren * extraChildUnitPrice}</span>
                </div>
              )}
              {extraCandles > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5" />
                    {extraCandles} × נר נוסף
                  </span>
                  <span className="font-medium tabular-nums">₪{extraCandlesTotal}</span>
                </div>
              )}
            </div>
          )}

          {seatsUsed > 0 && (
            <div className="mt-3 pt-3 border-t border-[#e8e8e8] space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-[#581E83] text-[14px]">
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>
                  סה״כ {seatsUsed} {seatsUsed === 1 ? 'משתתף' : 'משתתפים'} מגיעים לסדנה
                  ({adults} {adults === 1 ? 'מבוגר' : 'מבוגרים'}
                  {children > 0 && ` + ${children} ${children === 1 ? 'ילד' : 'ילדים'}`})
                </span>
              </div>
              <p className="text-[12px] text-[#464646]/75 leading-relaxed pr-0.5">
                מקומות הישיבה מוגבלים — לא ניתן להביא מלווים מעבר למשתתפים שנרשמו; מלווה נוסף יוכל להישאר רק אם יישאר מקום פנוי.
              </p>
            </div>
          )}

          {totalPrice > 0 && (
            <div className="mt-3 pt-3 border-t-2 border-[#5E2F88]/25 flex items-center justify-between">
              <span className="text-[16px] font-bold text-[#581E83]">סה״כ עלות כרטיסים:</span>
              <span className="text-[20px] font-bold text-[#5E2F88] tabular-nums">₪{totalPrice}</span>
            </div>
          )}
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
        <div className="w-full max-w-md flex flex-col gap-2">
          <Button
            onClick={handleContinue}
            className="w-full bg-[#5E2F88] hover:bg-[#7B3DB0] text-white py-2.5 rounded-lg text-base"
          >
            המשך לבחירת כוסות
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
