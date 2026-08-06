import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { MessageCircle, ChevronDown, ChevronLeft, ChevronRight, Clock, Timer, X, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  getSlotDateStrIsrael,
  getSlotLocalDate,
  getSlotTimeRange,
  sortSlotsByStartTime,
} from '@/lib/slotTime';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isBefore,
  startOfDay,
  addMonths,
  subMonths
} from 'date-fns';
import { he } from 'date-fns/locale';

const DEFAULT_BOOKING_BLOCK_HOURS = 48;
const URGENCY_BUFFER_EXTRA_HOURS = 8;

function getUrgencyBufferHours(bookingBlockHours) {
  return bookingBlockHours >= DEFAULT_BOOKING_BLOCK_HOURS
    ? bookingBlockHours + URGENCY_BUFFER_EXTRA_HOURS
    : bookingBlockHours;
}

function isSlotBlocked(slot, bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS) {
  if (!slot?.start?.timestamp) return false;
  const hoursUntilStart = (new Date(slot.start.timestamp).getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntilStart > 0 && hoursUntilStart < bookingBlockHours;
}

function isSlotInUrgencyBuffer(slot, bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS) {
  if (!slot?.start?.timestamp) return false;
  const urgencyBufferHours = getUrgencyBufferHours(bookingBlockHours);
  if (urgencyBufferHours <= bookingBlockHours) return false;
  const hoursUntilStart = (new Date(slot.start.timestamp).getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntilStart >= bookingBlockHours && hoursUntilStart < urgencyBufferHours;
}

function isDayBlocked(slots, bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS) {
  if (!slots?.length) return false;
  return slots.every((slot) => isSlotBlocked(slot, bookingBlockHours));
}

// חגי ישראל 2024-2027
const ISRAELI_HOLIDAYS = {
  '2024-04-22': 'פסח', '2024-04-23': 'פסח', '2024-04-28': 'פסח', '2024-04-29': 'פסח',
  '2024-05-14': 'יום העצמאות', '2024-06-11': 'שבועות', '2024-06-12': 'שבועות',
  '2024-10-02': 'ראש השנה', '2024-10-03': 'ראש השנה', '2024-10-04': 'ראש השנה',
  '2024-10-11': 'יום כיפור', '2024-10-12': 'יום כיפור',
  '2024-10-16': 'סוכות', '2024-10-17': 'סוכות', '2024-10-23': 'שמחת תורה', '2024-10-24': 'שמחת תורה',
  '2024-12-25': 'חנוכה', '2024-12-26': 'חנוכה',
  '2025-03-13': 'פורים', '2025-03-14': 'פורים',
  '2025-04-12': 'פסח', '2025-04-13': 'פסח', '2025-04-18': 'פסח', '2025-04-19': 'פסח',
  '2025-05-01': 'יום העצמאות', '2025-06-01': 'שבועות', '2025-06-02': 'שבועות',
  '2025-09-22': 'ראש השנה', '2025-09-23': 'ראש השנה', '2025-09-24': 'ראש השנה',
  '2025-10-01': 'יום כיפור', '2025-10-02': 'יום כיפור',
  '2025-10-06': 'סוכות', '2025-10-07': 'סוכות', '2025-10-13': 'שמחת תורה', '2025-10-14': 'שמחת תורה',
  '2025-12-14': 'חנוכה', '2025-12-15': 'חנוכה',
  '2026-03-03': 'פורים', '2026-03-04': 'פורים',
  '2026-04-01': 'פסח', '2026-04-02': 'פסח', '2026-04-07': 'פסח', '2026-04-08': 'פסח',
  '2026-04-22': 'יום העצמאות', '2026-05-21': 'שבועות', '2026-05-22': 'שבועות',
  '2026-09-11': 'ראש השנה', '2026-09-12': 'ראש השנה', '2026-09-13': 'ראש השנה',
  '2026-09-20': 'יום כיפור', '2026-09-21': 'יום כיפור',
  '2026-09-25': 'סוכות', '2026-09-26': 'סוכות', '2026-10-02': 'שמחת תורה', '2026-10-03': 'שמחת תורה',
  '2026-12-04': 'חנוכה', '2026-12-05': 'חנוכה',
  '2027-03-22': 'פורים', '2027-03-23': 'פורים',
  '2027-04-21': 'פסח', '2027-04-22': 'פסח', '2027-04-27': 'פסח', '2027-04-28': 'פסח',
  '2027-05-11': 'יום העצמאות', '2027-06-10': 'שבועות', '2027-06-11': 'שבועות',
};

const CLOSING_SOON_HOURS = 8;

function isSlotClosingSoon(slot) {
  if (!slot?.start?.timestamp) return false;
  const startTime = new Date(slot.start.timestamp).getTime();
  const now = Date.now();
  const hoursUntilStart = (startTime - now) / (1000 * 60 * 60);
  return hoursUntilStart > 0 && hoursUntilStart <= CLOSING_SOON_HOURS;
}

function isSlotApproaching(slot, bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS) {
  return isSlotBlocked(slot, bookingBlockHours)
    || isSlotInUrgencyBuffer(slot, bookingBlockHours)
    || isSlotClosingSoon(slot);
}

function isDayHasRedDot(slots, bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS) {
  if (!slots?.length) return false;
  return slots.some((s) => isSlotApproaching(s, bookingBlockHours));
}

function getBookableSlots(slots, bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS) {
  return slots.filter((s) => !isSlotBlocked(s, bookingBlockHours));
}

function getAvailabilityInfo(availableSlots) {
  const availableDates = new Set();
  const spotsMap = new Map();
  const slotsMap = new Map();

  if (!Array.isArray(availableSlots)) {
    return { availableDates, spotsMap, slotsMap };
  }

  availableSlots.forEach((slot) => {
    const openSpots = slot?.openSpots ?? slot?.remainingSpots ?? 0;
    const start = slot?.start;
    if (!start || openSpots <= 0) return;

    const dateStr = getSlotDateStrIsrael(slot);
    if (!dateStr) return;

    const currentMax = spotsMap.get(dateStr) || 0;
    if (openSpots > currentMax) {
      spotsMap.set(dateStr, openSpots);
    }

    const daySlots = slotsMap.get(dateStr) || [];
    daySlots.push(slot);
    slotsMap.set(dateStr, daySlots);
    availableDates.add(dateStr);
  });

  return { availableDates, spotsMap, slotsMap };
}

function getMinPriceForDate(slots, servicePricing) {
  if (!slots?.length || !servicePricing) return null;

  let minPrice = Infinity;

  slots.forEach(slot => {
    const pricing = servicePricing[slot.serviceId];
    if (pricing?.minPrice && pricing.minPrice < minPrice) {
      minPrice = pricing.minPrice;
    } else if (pricing?.solo && pricing.solo < minPrice) {
      minPrice = pricing.solo;
    }
  });

  return minPrice === Infinity ? null : minPrice;
}

const TOOLTIP_EDGE_MARGIN = 8;

function DayTooltip({
  slots,
  servicePricing,
  holiday,
  allBlocked,
  isVisible,
  isMobile,
  stackTimes = false,
  bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS,
}) {
  const wrapperRef = useRef(null);
  const [offsetX, setOffsetX] = useState(0);

  useLayoutEffect(() => {
    if (!isVisible) return;
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      let shift = 0;
      if (rect.left < TOOLTIP_EDGE_MARGIN) {
        shift = TOOLTIP_EDGE_MARGIN - rect.left;
      } else if (rect.right > window.innerWidth - TOOLTIP_EDGE_MARGIN) {
        shift = (window.innerWidth - TOOLTIP_EDGE_MARGIN) - rect.right;
      }
      setOffsetX(shift);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isVisible, slots]);

  if (!isVisible || !slots?.length) return null;

  const minPrice = getMinPriceForDate(slots, servicePricing);
  const sortedSlots = [...slots].sort(sortSlotsByStartTime);
  const hasMultipleSlots = sortedSlots.length > 1;
  const showStackedTimes = stackTimes || hasMultipleSlots;
  const closingSoonSingle = !hasMultipleSlots && isSlotClosingSoon(sortedSlots[0]);

  return (
    <div
      ref={wrapperRef}
      className="absolute z-[100] bottom-full mb-1.5 left-1/2"
      style={{ pointerEvents: 'none', transform: `translateX(calc(-50% + ${offsetX}px))` }}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.13 }}
        className={cn(
          'bg-white rounded-lg shadow-xl border border-[#5E2F88]/20 text-right',
          isMobile
            ? 'p-3 min-w-[150px] max-w-[min(220px,calc(100vw-1rem))] whitespace-normal'
            : 'p-2.5 whitespace-nowrap'
        )}
      >
        <div className={cn('space-y-2', isMobile ? 'text-[13px]' : 'text-[14px]')}>
          {allBlocked && (
            <div className="flex items-center gap-1.5 text-red-600 font-medium">
              <span>🚫</span>
              <span>הזמנה מקוונת סגורה</span>
            </div>
          )}
          {!allBlocked && closingSoonSingle && (
            <div className="flex items-center gap-1.5 text-red-600 font-medium">
              <span>⏰</span>
              <span>ההרשמה נסגרת בקרוב!</span>
            </div>
          )}
          {holiday && (
            <div className="flex items-center gap-1.5 text-[#7B3DB0] font-medium">
              <span>🎉</span>
              <span>{holiday}</span>
            </div>
          )}
          {minPrice && (
            <div className="flex items-center gap-1.5 text-[#581E83]">
              <span>💰</span>
              <span>החל מ: {minPrice}₪</span>
            </div>
          )}
          <div className="flex items-start gap-1.5 text-[#464646]">
            <Clock className={cn('shrink-0', isMobile ? 'w-4 h-4 mt-0.5' : 'w-4 h-4')} />
            {showStackedTimes ? (
              <div className="flex flex-col gap-0.5">
                {sortedSlots.map((slot) => {
                  const time = getSlotTimeRange(slot);
                  const approaching = isSlotApproaching(slot, bookingBlockHours);
                  return (
                    <span
                      key={slot.sessionId || `${time}-${slot.start?.timestamp}`}
                      className="flex items-center gap-1.5 break-words"
                    >
                      {approaching && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                      )}
                      <span>{time}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="break-words">{getSlotTimeRange(sortedSlots[0])}</span>
            )}
          </div>
        </div>

        <div
          className="absolute top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"
          style={{ left: `calc(50% - ${offsetX}px)`, transform: 'translateX(-50%)' }}
        />
      </motion.div>
    </div>
  );
}

export default function TimeSlotsSection({
  selectedSlot,
  setSelectedSlot,
  availableSlots = [],
  servicePricing,
  onContinue,
  stackTimeSlots = false,
  bookingBlockHours = DEFAULT_BOOKING_BLOCK_HOURS,
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [today] = useState(() => startOfDay(new Date()));
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [blockedPopup, setBlockedPopup] = useState(false);
  const [timePickerDate, setTimePickerDate] = useState(null);
  const [hoveredDate, setHoveredDate] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile || !hoveredDate) return;
    const dismiss = () => setHoveredDate(null);
    const timer = setTimeout(() => {
      document.addEventListener('touchstart', dismiss, { passive: true });
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('touchstart', dismiss);
    };
  }, [isMobile, hoveredDate]);

  const { availableDates, slotsMap } = useMemo(
    () => getAvailabilityInfo(Array.isArray(availableSlots) ? availableSlots : []),
    [availableSlots]
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const handleDateClick = (day) => {
    const sod = startOfDay(day);
    if (isBefore(sod, today)) return;
    const dateStr = format(sod, 'yyyy-MM-dd');
    if (!availableDates.has(dateStr)) return;

    const daySlots = slotsMap.get(dateStr) || [];
    const bookable = getBookableSlots(daySlots, bookingBlockHours);

    if (bookable.length === 0) {
      setBlockedPopup(true);
      return;
    }

    if (bookable.length === 1) {
      setSelectedSlot(bookable[0]);
      setTimePickerDate(null);
    } else {
      setTimePickerDate(dateStr);
    }
  };

  const handleTimeSelect = (slot) => {
    if (isSlotBlocked(slot, bookingBlockHours)) {
      setBlockedPopup(true);
      return;
    }
    setSelectedSlot(slot);
  };

  const isDateSelected = (date) => {
    if (!selectedSlot?.start) return false;
    const selectedDateStr = getSlotDateStrIsrael(selectedSlot);
    return format(startOfDay(date), 'yyyy-MM-dd') === selectedDateStr;
  };

  const selectedInfo = useMemo(() => {
    if (!selectedSlot?.start?.timestamp) return null;
    const ld = getSlotLocalDate(selectedSlot);
    if (!ld) return null;

    const date = new Date(ld.year, ld.monthOfYear - 1, ld.dayOfMonth);
    const dayName = format(date, 'EEEE', { locale: he });
    const dateFormatted = `${String(ld.dayOfMonth).padStart(2, '0')}/${String(ld.monthOfYear).padStart(2, '0')}/${String(ld.year).slice(-2)}`;
    const timeRange = getSlotTimeRange(selectedSlot);

    return { dateFormatted, dayName, timeRange };
  }, [selectedSlot]);

  const timePickerSlots = timePickerDate
    ? (slotsMap.get(timePickerDate) || []).sort(sortSlotsByStartTime)
    : [];

  const timePickerMinPrice = timePickerDate
    ? getMinPriceForDate(slotsMap.get(timePickerDate) || [], servicePricing)
    : null;

  const selectedMinPrice = useMemo(() => {
    if (!selectedSlot?.start?.timestamp) return null;
    const dateStr = getSlotDateStrIsrael(selectedSlot);
    if (!dateStr) return null;
    return getMinPriceForDate(slotsMap.get(dateStr) || [], servicePricing);
  }, [selectedSlot, slotsMap, servicePricing]);

  return (
    <div className="py-2" dir="rtl">
      <div className="rounded-xl border border-[#e8e8e8] bg-white p-1 sm:p-1.5">
        {/* כותרת חודש */}
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-full p-1 transition-colors hover:bg-[#5E2F88]/10"
          >
            <ChevronRight className="w-5 h-5 text-[#581E83]" />
          </button>
          <h3 className="text-xs font-bold text-[#581E83]">
            {format(currentMonth, 'MMMM yyyy', { locale: he })}
          </h3>
          <button
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-full p-1 transition-colors hover:bg-[#5E2F88]/10"
          >
            <ChevronLeft className="w-5 h-5 text-[#581E83]" />
          </button>
        </div>

        {/* ימי השבוע */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-2 mb-0.5">
          {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map(day => (
            <div key={day} className="text-center text-xs sm:text-[20px] font-semibold text-[#581E83] py-0.5">
              {day}
            </div>
          ))}
        </div>

        {/* ימים */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-2">
          {calendarDays.map((day, i) => {
            const sod = startOfDay(day);
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isPast = isBefore(sod, today);
            const dateStr = format(sod, 'yyyy-MM-dd');
            const hasSlot = availableDates.has(dateStr);
            const isSelected = isDateSelected(day);
            const daySlots = slotsMap.get(dateStr) || [];
            const minPrice = hasSlot ? getMinPriceForDate(daySlots, servicePricing) : null;
            const isDisabled = !isCurrentMonth || isPast || !hasSlot;
            const isHoliday = ISRAELI_HOLIDAYS[dateStr];
            const hasMultipleSlots = daySlots.length > 1;
            const showRedDot = hasSlot && isDayHasRedDot(daySlots, bookingBlockHours);
            const allBlocked = hasSlot && isDayBlocked(daySlots, bookingBlockHours);
            const isHovered = hoveredDate === dateStr && hasSlot;

            return (
              <div key={i} className="relative">
                <button
                  type="button"
                  onClick={() => handleDateClick(day)}
                  onMouseEnter={() => !isMobile && hasSlot && setHoveredDate(dateStr)}
                  onMouseLeave={() => !isMobile && setHoveredDate(null)}
                  onTouchStart={() => isMobile && hasSlot && setHoveredDate(dateStr)}
                  disabled={isDisabled}
                  className={cn(
                    'relative flex flex-col items-center justify-center rounded-lg transition-all w-full',
                    isMobile ? 'h-12 text-sm' : 'h-10 text-[18px]',
                    !isCurrentMonth && 'text-[#464646]/15',
                    isCurrentMonth && isDisabled && 'text-[#b0b0b0] cursor-default',
                    isCurrentMonth && !isPast && hasSlot && !isSelected &&
                      'text-[#581E83] hover:bg-[#5E2F88]/15 cursor-pointer border border-[#5E2F88]/30 bg-[#5E2F88]/5',
                    isSelected && 'bg-[#5E2F88] text-white shadow-md cursor-pointer'
                  )}
                >
                  <span className={cn(
                    'font-semibold leading-none',
                    isCurrentMonth && isDisabled && 'line-through decoration-[#b0b0b0]/60'
                  )}>
                    {format(day, 'd')}
                  </span>
                  {isCurrentMonth && !isPast && hasSlot && minPrice && !isMobile && (
                    <span className={cn(
                      'text-[9px] leading-none mt-0.5 whitespace-nowrap',
                      isSelected ? 'text-white/90' : 'text-[#5E2F88]/80'
                    )}>
                      החל מ: {minPrice}₪
                    </span>
                  )}
                  {/* עיגול לחגים */}
                  {isCurrentMonth && isHoliday && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#DA9BFF]" />
                  )}
                  {/* נקודה אדומה — חסום / נסגר בקרוב */}
                  {showRedDot && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {/* עיגול למספר שעות */}
                  {hasMultipleSlots && !isSelected && (
                    <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-[#A9DEF9]" />
                  )}
                </button>

                {/* Tooltip */}
                <AnimatePresence>
                  {isHovered && (
                    <DayTooltip
                      slots={daySlots}
                      servicePricing={servicePricing}
                      holiday={isHoliday}
                      allBlocked={allBlocked}
                      isVisible={true}
                      isMobile={isMobile}
                      stackTimes={stackTimeSlots}
                      bookingBlockHours={bookingBlockHours}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* מקרא */}
        <div className="mt-1.5 flex items-center justify-center gap-3 flex-wrap text-[11px] text-[#464646]/70">
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded border border-[#5E2F88]/30 bg-[#5E2F88]/5"></div>
            <span>זמין</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded bg-[#5E2F88]"></div>
            <span>נבחר</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#A9DEF9]" />
            <span>כמה מועדים</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#DA9BFF]" />
            <span>חג</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>חסום / נסגר בקרוב</span>
          </div>
        </div>
      </div>

      {/* בחירת שעה */}
      <AnimatePresence>
        {timePickerDate && timePickerSlots.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 rounded-xl border border-[#5E2F88]/20 bg-[#5E2F88]/5 overflow-hidden"
          >
            <div className="p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-xs font-medium text-[#581E83]">
                  בחרו שעה:
                  {timePickerMinPrice && (
                    <span className="text-[#5E2F88]">החל מ: {timePickerMinPrice}₪</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setTimePickerDate(null)}
                  className="p-0.5 rounded hover:bg-[#5E2F88]/10"
                >
                  <X className="w-3.5 h-3.5 text-[#581E83]" />
                </button>
              </div>
              <div className={cn('gap-2', stackTimeSlots ? 'flex flex-col' : 'flex flex-wrap')}>
                {timePickerSlots.map((slot, idx) => {
                  const isThisSlotSelected = selectedSlot?.sessionId === slot.sessionId;
                  const blocked = isSlotBlocked(slot, bookingBlockHours);
                  const approaching = isSlotApproaching(slot, bookingBlockHours);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleTimeSelect(slot)}
                      className={cn(
                        "relative px-4 py-2 rounded-lg border font-medium transition-colors",
                        stackTimeSlots && "w-full text-center",
                        blocked
                          ? "border-red-300 bg-red-50 text-red-400 cursor-not-allowed"
                          : isThisSlotSelected
                            ? "bg-[#5E2F88] text-white border-[#5E2F88]"
                            : "border-[#5E2F88]/30 bg-white text-[#581E83] hover:bg-[#5E2F88] hover:text-white hover:border-[#5E2F88]"
                      )}
                    >
                      <span className="text-[18px]">{getSlotTimeRange(slot)}</span>
                      {approaching && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse border border-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* תצוגת תאריך נבחר */}
      {selectedInfo && (
        <div className="mt-3 rounded-xl border border-[#5E2F88]/20 bg-[#5E2F88]/5 p-2.5">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <img 
                src="https://static.wixstatic.com/shapes/6b73e9_730f64536d7c4e65919f5fb531baee7d.svg" 
                alt="" 
                className="w-4 h-4" 
              />
              <span className="text-xs font-medium text-[#581E83]">{selectedInfo.dateFormatted}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <img 
                src="https://static.wixstatic.com/shapes/6b73e9_e859379a99324600ae234a67d9615e62.svg" 
                alt="" 
                className="w-4 h-4" 
              />
              <span className="text-xs text-[#581E83]">{selectedInfo.dayName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-[#581E83]" />
              <span className="text-xs font-medium text-[#581E83]">{selectedInfo.timeRange}</span>
            </div>
            {selectedMinPrice && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💰</span>
                <span className="text-xs font-medium text-[#581E83]">החל מ: {selectedMinPrice}₪</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* כפתור המשך */}
      <div className="flex justify-center mt-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedSlot}
          className="bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          המשך לבחירת משתתפים
        </button>
      </div>

      {/* Blocked slot popup — within bookingBlockHours of workshop start */}
      <AnimatePresence>
        {blockedPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setBlockedPopup(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={() => setBlockedPopup(false)} className="absolute top-3 left-3 text-[#464646]/50 hover:text-[#464646]">
                <X className="w-5 h-5" />
              </button>
              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <h3 className="text-[17px] font-bold text-[#581E83]">ההזמנה המקוונת סגורה</h3>
                <p className="text-sm text-[#464646]/70 mt-2 leading-relaxed">
                  {bookingBlockHours === 1
                    ? 'לא ניתן להזמין באופן מקוון סדנה שמתחילה בעוד פחות מ- 1 שעה.'
                    : `לא ניתן להזמין באופן מקוון סדנה שמתחילה בעוד פחות מ-${bookingBlockHours} שעות.`}
                </p>
                <p className="text-sm text-[#464646]/70 mt-1 leading-relaxed">
                  ניתן להשלים את ההזמנה ישירות מול נציג שלנו בוואטסאפ.
                </p>
              </div>
              <a
                href="https://wa.link/jbfarf"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-medium py-3 rounded-xl text-[14px] transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                הזמנה דרך וואטסאפ
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setBlockedPopup(false)}
                className="w-full text-center text-sm text-[#464646]/60 hover:text-[#464646] py-2 transition-colors"
              >
                חזרה ללוח שנה
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp */}
      <div className="mt-2.5 rounded-lg border border-[#5E2F88]/15 bg-[#5E2F88]/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setWhatsappOpen(!whatsappOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-right"
        >
          <span className="text-[16px] font-medium text-[#581E83]">
            🤔 לא מצאתם מועד שמתאים לכם?
          </span>
          <ChevronDown className={cn(
            'w-4 h-4 text-[#581E83] transition-transform shrink-0',
            whatsappOpen && 'rotate-180'
          )} />
        </button>
        {whatsappOpen && (
          <div className="px-3 pb-3 text-center">
            <p className="text-[14px] text-[#464646]/70 mb-2">
              נשמח למצוא עבורכם זמן שנוח. שלחו לנו הודעת וואטסאפ ונחזור אליכם בהקדם.
            </p>
            <a
              href="https://wa.link/jbfarf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-4 py-1.5 text-sm text-white font-medium hover:bg-[#20bd5a] transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              שלחו הודעה בוואטסאפ
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
