import React, { useMemo } from 'react';
import { Calendar, Clock, Users, Baby, Sparkles, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { getSlotLocalDate, getSlotTimeRange } from '@/lib/slotTime';
import { computeCeramicsPrice, resolveCeramicsDayPricing } from '@/lib/ceramicsPricing';

// Order summary for the ceramics workshop — participant ticket line + the
// "כלי קרמיקה נוסף" surcharge line (if any) and the total, followed by the
// pay button that hands off to Wix eCommerce checkout.
export default function CeramicsOrderSummarySection({
  soloTickets = 0,
  parentChildTickets = 0,
  extraItems = 0,
  selectedSlot,
  servicePricing,
  totalPrice,
  onPay,
  isProcessing
}) {
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

  const pricing = resolveCeramicsDayPricing(servicePricing?.[selectedSlot?.serviceId], selectedSlot);
  const { soloTotal, parentChildTotal, extraItemsTotal } = useMemo(
    () => computeCeramicsPrice({ soloTickets, parentChildTickets, extraItems }, pricing),
    [pricing, soloTickets, parentChildTickets, extraItems]
  );

  const totalParticipants = soloTickets + parentChildTickets * 2;

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
          סה״כ {totalParticipants} {totalParticipants === 1 ? 'משתתף' : 'משתתפים'}
        </span>
      </div>

      {/* פירוט מחיר */}
      <div className="border-t border-[#e8e8e8] pt-3 space-y-2 text-base text-[#464646]">
        {soloTickets > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {soloTickets} × כרטיס יחיד
            </span>
            <span className="font-medium tabular-nums">₪{soloTotal}</span>
          </div>
        )}
        {parentChildTickets > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Baby className="w-4 h-4" />
              {parentChildTickets} × הורה + ילד
            </span>
            <span className="font-medium tabular-nums">₪{parentChildTotal}</span>
          </div>
        )}
        {extraItems > 0 && (
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              {extraItems} × כלי קרמיקה נוסף
            </span>
            <span className="font-medium tabular-nums">₪{extraItemsTotal}</span>
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
        <motion.button
          type="button"
          onClick={onPay}
          disabled={isProcessing || totalPrice <= 0}
          animate={isProcessing ? {} : {
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
          ) : (
            <>
              המשך להשלמת פרטים ותשלום
              <ArrowLeft className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>

      {/* הסבר על בחירת הכלים בסטודיו */}
      <div className="rounded-xl border border-[#e8e8e8] bg-[#f9f6fd] p-3">
        <p className="text-[13px] text-[#464646]/80 leading-relaxed text-center">
          בסדנה תוכלו לבחור מתוך מגוון כלים שימושיים, כגון צלחות, קערות, ספלים ועוד – הכלולים במחיר הסדנה.
          <br />
          בנוסף, בסטודיו מחכה לכם מבחר של כלים מיוחדים ובגדלים שונים, אותם ניתן לבחור במקום בתוספת תשלום
        </p>
      </div>
    </div>
  );
}
