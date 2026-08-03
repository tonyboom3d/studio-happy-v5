import React, { useMemo, useState, useEffect } from 'react';
import { addLog } from '@/components/VersionLogger';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Ruler, Calendar, CreditCard, ChevronUp, ChevronDown, Baby } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { getSlotLocalDate } from '@/lib/slotTime';

/** חישוב שורות סיכום + סכום — משותף לחלונית הצפה ולתצוגה inline */
export function computeOrderSummary({
  adults = 1,
  children = 0,
  carpetSizes = {},
  cart = [],
  selectedSlot = null,
  basePrice = 0,
  carpetSizeUpgradePrice = 0,
  totalPrice = 0
}) {
  // חישוב זוגות הורה+ילד ומבוגרים רגילים
  const parentChildPairs = Math.min(adults, children);
  const soloAdults = adults - parentChildPairs;

  // חישוב תוספת שטיח (אם לא הועבר)
  const calculatedCarpetUpgrade = carpetSizeUpgradePrice || 
    Object.values(carpetSizes).filter(s => s === '90x90').length * 100;

  // סכום כולל
  const calculatedTotal = totalPrice || (basePrice + calculatedCarpetUpgrade);

  // פורמט תאריך
  let dateDisplay = null;
  if (selectedSlot?.start?.timestamp) {
    const ld = getSlotLocalDate(selectedSlot);
    if (ld) {
      const date = new Date(ld.year, ld.monthOfYear - 1, ld.dayOfMonth);
      dateDisplay = format(date, 'd בMMMM', { locale: he });
    }
  }

  // ספירת גדלי שטיח
  const size60Count = Object.values(carpetSizes).filter(s => s === '60x60').length;
  const size90Count = Object.values(carpetSizes).filter(s => s === '90x90').length;

  // בניית טקסט משתתפים
  let participantsLabel = '';
  if (parentChildPairs > 0 && soloAdults > 0) {
    participantsLabel = `${soloAdults} ${soloAdults === 1 ? 'מבוגר' : 'מבוגרים'} + ${parentChildPairs} ${parentChildPairs === 1 ? 'זוג' : 'זוגות'} הורה+ילד`;
  } else if (parentChildPairs > 0) {
    participantsLabel = `${parentChildPairs} ${parentChildPairs === 1 ? 'זוג' : 'זוגות'} הורה+ילד`;
  } else {
    participantsLabel = `${adults} ${adults === 1 ? 'מבוגר' : 'מבוגרים'}`;
  }

  const items = [
    {
      show: selectedSlot !== null,
      icon: Calendar,
      label: dateDisplay || 'תאריך לא נבחר',
      value: basePrice > 0 ? `₪${basePrice}` : '',
      active: false
    },
    {
      show: adults > 0,
      icon: parentChildPairs > 0 ? Baby : Users,
      label: participantsLabel,
      value: '',
      active: false
    },
    {
      show: Object.keys(carpetSizes).length > 0,
      icon: Ruler,
      label: size90Count > 0 
        ? `${size60Count > 0 ? `${size60Count}×60 + ` : ''}${size90Count}×90` 
        : `${size60Count}×60`,
      value: calculatedCarpetUpgrade > 0 ? `+₪${calculatedCarpetUpgrade}` : 'כלול',
      active: false
    }
  ].filter(item => item.show);

  const showEmptyState = items.length === 0;

  return {
    items,
    totalPrice: calculatedTotal,
    showEmptyState
  };
}

/**
 * תצוגת סיכום הזמנה (כרטיס) — לשימוש מתחת לכפתור תשלום במובייל או בדף summary
 */
export function OrderSummaryCard({
  adults,
  children,
  carpetSizes,
  cart,
  selectedSlot,
  basePrice,
  carpetSizeUpgradePrice,
  totalPrice,
  /** true: ללא כפתור כותרת מתרחב, תמיד פתוח — מתחת ל"המשך לתשלום" */
  inline = false,
  /** כשלא inline: מצב התחלתי של פירוט השורות (ברירת מחדל פתוח — תואם חלונית צפה) */
  initiallyExpanded = true,
  /**
   * שלב סיכום באקורדיון: כותרת + פירוט תמיד גלויים, ללא כפתור כיווץ,
   * רקע לבן וטקסט כהה (לא משפיע על חלונית צפה / iframe)
   */
  variant = 'default',
  className
}) {
  const isStepVariant = variant === 'step';
  const expandable = !inline && !isStepVariant;

  const { items, totalPrice: computedTotal, showEmptyState } = useMemo(
    () =>
      computeOrderSummary({
        adults,
        children,
        carpetSizes,
        cart,
        selectedSlot,
        basePrice,
        carpetSizeUpgradePrice,
        totalPrice
      }),
    [adults, children, carpetSizes, cart, selectedSlot, basePrice, carpetSizeUpgradePrice, totalPrice]
  );

  const [isOpen, setIsOpen] = useState(isStepVariant ? true : initiallyExpanded);

  const headerInner = (
    <>
      <span
        className={cn(
          'font-semibold text-sm',
          isStepVariant ? 'text-black' : ''
        )}
      >
        סיכום הזמנה
      </span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <CreditCard
            className={cn('w-4 h-4', isStepVariant ? 'text-[#581E83]' : '')}
          />
          <span
            className={cn(
              'font-bold text-base',
              isStepVariant ? 'text-black tabular-nums' : ''
            )}
          >
            ₪{Math.round(computedTotal)}
          </span>
        </div>
        {expandable && (
          <div className="shrink-0">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </div>
        )}
      </div>
    </>
  );

  const body = (
    <div className={cn('p-3 space-y-2', isStepVariant && 'pt-1')}>
      {showEmptyState ? (
        <div
          className={cn(
            'py-2 text-center text-sm',
            isStepVariant ? 'text-gray-600' : 'text-gray-500'
          )}
        >
          ממתין לנתוני הזמנה...
        </div>
      ) : (
        <AnimatePresence>
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className={cn(
                  'flex items-center justify-between rounded-lg p-2 text-sm transition-colors',
                  item.active
                    ? 'bg-[#5E2F88]/20'
                    : 'bg-[#fafafa]'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      'w-4 h-4',
                      item.active ? 'text-[#5E2F88]' : 'text-[#581E83]'
                    )}
                  />
                  <span className="text-[#464646]">{item.label}</span>
                </div>
                {item.value && (
                  <span className="font-semibold text-[#581E83]">{item.value}</span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );

  const headerBarClass = cn(
    'flex w-full items-center justify-between px-4 py-2.5',
    isStepVariant
      ? 'border-b border-[#e8e8e8] bg-white text-black'
      : 'bg-[#581E83] text-white'
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border',
        isStepVariant ? 'border-[#e8e8e8] bg-white' : 'border-[#e8e8e8]',
        className
      )}
      style={{ direction: 'rtl' }}
    >
      {inline ? (
        <>
          <div className={headerBarClass}>{headerInner}</div>
          {body}
        </>
      ) : isStepVariant ? (
        <>
          <div className={headerBarClass}>{headerInner}</div>
          {body}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(headerBarClass, 'cursor-pointer')}
          >
            {headerInner}
          </button>
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                {body}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

export default function FloatingSummary({
  adults,
  children,
  carpetSizes,
  cart,
  selectedSlot,
  basePrice,
  carpetSizeUpgradePrice,
  totalPrice,
  isSummaryPage = false
}) {
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'CATALOG_STATE_CHANGE') {
        setIsCatalogOpen(event.data.data?.isOpen || false);
        addLog(
          `Catalog ${event.data.data?.isOpen ? 'opened' : 'closed'} - summary ${event.data.data?.isOpen ? 'hidden' : 'shown'}`,
          'info'
        );
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (isCatalogOpen) return null;

  const containerClass = isSummaryPage
    ? 'w-full'
    : 'fixed bottom-[10px] left-[5%] right-[5%] w-[90%] md:left-auto md:right-6 md:bottom-6 md:w-[260px] md:max-w-[260px] z-50';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={containerClass}
      style={{ direction: 'rtl' }}
    >
      <OrderSummaryCard
        adults={adults}
        children={children}
        carpetSizes={carpetSizes}
        cart={cart}
        selectedSlot={selectedSlot}
        basePrice={basePrice}
        carpetSizeUpgradePrice={carpetSizeUpgradePrice}
        totalPrice={totalPrice}
        inline={false}
        className={isSummaryPage ? 'bg-white' : 'bg-white/97 backdrop-blur-xl'}
      />
    </motion.div>
  );
}
