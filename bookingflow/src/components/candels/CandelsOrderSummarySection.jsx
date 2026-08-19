import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, Clock, Users, Baby, Flame, CupSoda, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { getSlotLocalDate, getSlotTimeRange } from '@/lib/slotTime';

// Order summary for the candles workshop — ticket lines (identical to
// Tufting's solo / parent+child breakdown) plus the "נר נוסף" add-on line
// and the selected cups line (only shown if any cup carries an extra price
// beyond the base ticket).
export default function CandelsOrderSummarySection({
  adults,
  children,
  soloAdults,
  parentChildPairs,
  extraChildren = 0,
  extraCandles = 0,
  extraCandlesTotal = 0,
  selectedSlot,
  servicePricing,
  selectedCups = [],
  cupsExtraTotal = 0,
  totalCups = 0,
  totalPrice,
  onPay,
  isProcessing
}) {
  const selectedCupCount = selectedCups.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const cupsIncomplete = totalCups > 0 && selectedCupCount < totalCups;
  const cupsMissingMessage = 'יש לבחור כוסות בשלב 3 לנרות לפני המשך לתשלום';
  const [cupSelectionError, setCupSelectionError] = useState(null);

  useEffect(() => {
    if (!cupsIncomplete) setCupSelectionError(null);
  }, [cupsIncomplete]);

  const handlePayClick = () => {
    if (cupsIncomplete) {
      setCupSelectionError(cupsMissingMessage);
      return;
    }
    setCupSelectionError(null);
    onPay();
  };
  const dateTimeInfo = useMemo(() => {
    if (!selectedSlot?.start?.timestamp) return null;
    const ld = getSlotLocalDate(selectedSlot);
    if (!ld) return null;
    const date = new Date(ld.year, ld.monthOfYear - 1, ld.dayOfMonth);
    return {
      date: format(date, 'EEEE, d בMMMM', { locale: he }),
      time: getSlotTimeRange(selectedSlot),
    };
  }, [selectedSlot]);

  const pricing = servicePricing?.[selectedSlot?.serviceId];
  const soloUnitPrice = pricing?.solo || 0;
  const parentChildUnitPrice = pricing?.parentChild || soloUnitPrice;
  // "תוספת ילד" is priced like a solo ticket (own candle), not like the
  // parent+child package.
  const extraChildUnitPrice = pricing?.extraChild || soloUnitPrice;
  const seatsUsed = adults + children;
  const hasTicketLines =
    soloAdults > 0 ||
    parentChildPairs > 0 ||
    extraChildren > 0 ||
    extraCandles > 0 ||
    selectedCups.length > 0;

  return (
    <div className="flex flex-col py-3 px-1 space-y-3" dir="rtl">
      {/* שורת תאריך + משתתפים */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-base text-[#464646]">
        {dateTimeInfo && (
          <>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#5E2F88]" />
              {dateTimeInfo.date}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#5E2F88]" />
              {dateTimeInfo.time}
            </span>
          </>
        )}
        <span className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-[#5E2F88]" />
          סה״כ {seatsUsed} {seatsUsed === 1 ? 'משתתף' : 'משתתפים'}
          ({adults} {adults === 1 ? 'מבוגר' : 'מבוגרים'}
          {children > 0 && ` + ${children} ${children === 1 ? 'ילד' : 'ילדים'}`})
        </span>
      </div>

      {/* פירוט מחיר */}
      <div className="border-t border-[#e8e8e8] pt-3 space-y-2 text-base text-[#464646]">
        {soloAdults > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {soloAdults} × {soloAdults === 1 ? 'כרטיס מבוגר' : 'כרטיסי מבוגרים'}
            </span>
            <span className="font-medium tabular-nums">₪{soloAdults * soloUnitPrice}</span>
          </div>
        )}
        {parentChildPairs > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Baby className="w-4 h-4" />
              {parentChildPairs} × הורה + ילד
            </span>
            <span className="font-medium tabular-nums">₪{parentChildPairs * parentChildUnitPrice}</span>
          </div>
        )}
        {extraChildren > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Baby className="w-4 h-4" />
              {extraChildren} × תוספת ילד
            </span>
            <span className="font-medium tabular-nums">₪{extraChildren * extraChildUnitPrice}</span>
          </div>
        )}
        {extraCandles > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4" />
              {extraCandles} × נר נוסף
            </span>
            <span className="font-medium tabular-nums">₪{extraCandlesTotal}</span>
          </div>
        )}
        {selectedCups.length > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <CupSoda className="w-4 h-4" />
              {selectedCups.reduce((sum, c) => sum + (c.quantity || 1), 0)} × כוס לנר
            </span>
            <span className="font-medium tabular-nums">
              {cupsExtraTotal > 0 ? `₪${cupsExtraTotal}` : 'כלול במחיר'}
            </span>
          </div>
        )}
        {hasTicketLines && (
          <div className="mt-2 pt-2 border-t border-[#e8e8e8]">
            <p className="text-[13px] text-[#464646]/75 leading-relaxed">
              מקומות הישיבה מוגבלים — לא ניתן להביא מלווים מעבר למשתתפים שנרשמו.
            </p>
          </div>
        )}
      </div>

      {/* סה"כ */}
      <div className="border-t-2 border-[#5E2F88]/30 pt-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg text-[#581E83]">סה״כ לתשלום</span>
          <span className="text-2xl font-bold text-[#581E83] tabular-nums">₪{Math.round(totalPrice)}</span>
        </div>
        <p className="text-sm text-[#464646]/60 text-left">כולל מע״מ 18%</p>
      </div>

      {/* כפתור מעבר לתשלום */}
      <div className="pt-3">
        {cupSelectionError && (
          <p className="mb-2 text-center text-sm font-medium text-red-600">
            {cupSelectionError}
          </p>
        )}
        <motion.button
          type="button"
          onClick={handlePayClick}
          disabled={isProcessing || totalPrice <= 0 || cupsIncomplete}
          animate={isProcessing || cupsIncomplete ? {} : {
            scale: [1, 1.02, 1],
            boxShadow: [
              '0 0 0 0 rgba(94,47,136,0)',
              '0 0 12px 4px rgba(94,47,136,0.25)',
              '0 0 0 0 rgba(94,47,136,0)',
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatDelay: 6.5,
            ease: 'easeInOut',
          }}
          className="w-full flex items-center justify-center gap-2 bg-[#5E2F88] hover:bg-[#7B3DB0]
                     text-white font-semibold py-4 rounded-xl text-base md:text-lg
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              מעביר לדף התשלום...
            </>
          ) : cupsIncomplete ? (
            cupsMissingMessage
          ) : (
            <>
              המשך להשלמת פרטים ותשלום
              <ArrowLeft className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
