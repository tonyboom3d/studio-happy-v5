import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Users, Baby, MessageCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateFirstOrderMinimum, FIRST_ORDER_MIN_TICKETS_MESSAGE } from '@/lib/firstOrderMinimum';
import { computeCeramicsPrice, getMaxExtraItems, resolveCeramicsDayPricing } from '@/lib/ceramicsPricing';

// Ceramics workshop ("סדנת קרמיקה") participants step. Two ticket types:
// "יחיד" (9+) — one seat, one ceramic piece; "הורה וילד" (3-8) — one ticket
// covers a parent+child pair (2 seats, one shared piece). Each ticket
// (either type) may add up to one "כלי קרמיקה נוסף" — a surcharge-only
// extra item, no additional Wix Bookings seat.
export default function CeramicsParticipantsSection({
  soloTickets,
  setSoloTickets,
  parentChildTickets,
  setParentChildTickets,
  extraItems,
  setExtraItems,
  maxParticipants = 10,
  servicePricing,
  selectedSlot,
  onContinue
}) {
  const [validationError, setValidationError] = useState(null);

  // מקומות תפוסים ב-Wix Bookings: "יחיד" = מושב אחד, "הורה וילד" = 2 מושבים.
  const seatsUsed = soloTickets + parentChildTickets * 2;
  const totalTickets = soloTickets + parentChildTickets;
  const isGroupTooLarge = seatsUsed > 9;
  const spotsExceeded = seatsUsed > maxParticipants;

  const slotPricing = useMemo(
    () => resolveCeramicsDayPricing(servicePricing?.[selectedSlot?.serviceId], selectedSlot),
    [selectedSlot, servicePricing]
  );

  const {
    soloUnitPrice, parentChildUnitPrice, extraItemUnitPrice,
    soloTotal, parentChildTotal, extraItemsTotal, totalPrice,
  } = useMemo(
    () => computeCeramicsPrice({ soloTickets, parentChildTickets, extraItems }, slotPricing),
    [slotPricing, soloTickets, parentChildTickets, extraItems]
  );

  // "כלי קרמיקה נוסף" — עד יחידה אחת נוספת לכל כרטיס (יחיד או הורה+ילד).
  const maxExtraItems = getMaxExtraItems(soloTickets, parentChildTickets);

  // כשמספר הכרטיסים יורד, חותכים את הכלים הנוספים בהתאם.
  useEffect(() => {
    if (extraItems > maxExtraItems) {
      setExtraItems(maxExtraItems);
    }
  }, [extraItems, maxExtraItems, setExtraItems]);

  const handleExtraItemsDecrease = () => {
    if (extraItems > 0) setExtraItems(extraItems - 1);
  };
  const handleExtraItemsIncrease = () => {
    if (extraItems < maxExtraItems) setExtraItems(extraItems + 1);
  };

  const handleSoloDecrease = () => {
    if (soloTickets > 0) {
      setSoloTickets(soloTickets - 1);
      setValidationError(null);
    }
  };
  const handleSoloIncrease = () => {
    if (seatsUsed >= maxParticipants) return;
    setSoloTickets(soloTickets + 1);
    setValidationError(null);
  };
  const handleParentChildDecrease = () => {
    if (parentChildTickets > 0) {
      setParentChildTickets(parentChildTickets - 1);
      setValidationError(null);
    }
  };
  const handleParentChildIncrease = () => {
    if (seatsUsed + 2 > maxParticipants) return;
    setParentChildTickets(parentChildTickets + 1);
    setValidationError(null);
  };

  const handleContinue = () => {
    if (totalTickets <= 0) {
      setValidationError('יש לבחור לפחות כרטיס אחד');
      return;
    }
    if (spotsExceeded) {
      setValidationError(`נותרו ${maxParticipants} מקומות בלבד בתאריך שנבחר`);
      return;
    }
    const firstOrderError = validateFirstOrderMinimum(totalTickets + extraItems, selectedSlot);
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

      {/* יחיד + הורה וילד */}
      <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-2">
        {/* יחיד */}
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Users className="w-5 h-5 text-[#581E83]" />
            <span className="text-[20px] font-medium text-[#581E83]">יחיד</span>
            <span className="text-[16px] text-[#464646]/50">(9+)</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleSoloDecrease}
              disabled={soloTickets <= 0}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
            >
              <Minus className="w-3 h-3" />
            </button>
            <motion.div
              key={soloTickets}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-3xl font-bold text-[#581E83] w-9 text-center"
            >
              {soloTickets}
            </motion.div>
            <button
              type="button"
              onClick={handleSoloIncrease}
              disabled={seatsUsed >= maxParticipants}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* הורה וילד */}
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Baby className="w-5 h-5 text-[#581E83]" />
            <span className="text-[20px] font-medium text-[#581E83]">הורה וילד</span>
            <span className="text-[16px] text-[#464646]/50">(3-8)</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleParentChildDecrease}
              disabled={parentChildTickets <= 0}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
            >
              <Minus className="w-3 h-3" />
            </button>
            <motion.div
              key={parentChildTickets}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-3xl font-bold text-[#581E83] w-9 text-center"
            >
              {parentChildTickets}
            </motion.div>
            <button
              type="button"
              onClick={handleParentChildIncrease}
              disabled={seatsUsed + 2 > maxParticipants}
              className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                         text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* אין עוד מקומות פנויים */}
      {!isGroupTooLarge && !spotsExceeded && seatsUsed >= maxParticipants && (
        <div className="w-full max-w-md mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs font-medium text-amber-800">אין עוד מקומות פנויים לסדנה בתאריך שנבחר</p>
          </div>
        </div>
      )}

      {/* כלי קרמיקה נוסף */}
      {!isGroupTooLarge && maxExtraItems > 0 && (
        <div className="w-full max-w-md rounded-xl border border-[#e8e8e8] bg-white p-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-5 h-5 text-[#581E83]" />
              <div>
                <p className="text-[16px] font-medium text-[#581E83]">כלי קרמיקה נוסף</p>
                <p className="text-[12px] text-[#464646]/60">
                  לכל מי שרוצה להכין {maxExtraItems === 1 ? 'כלי שני' : 'כלים נוספים'} (עד {maxExtraItems})
                  {extraItemUnitPrice > 0 && ` · ₪${extraItemUnitPrice} לכלי`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExtraItemsDecrease}
                disabled={extraItems <= 0}
                className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                           text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
              >
                <Minus className="w-3 h-3" />
              </button>
              <motion.div
                key={extraItems}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-2xl font-bold text-[#581E83] w-7 text-center"
              >
                {extraItems}
              </motion.div>
              <button
                type="button"
                onClick={handleExtraItemsIncrease}
                disabled={extraItems >= maxExtraItems}
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

      {/* סיכום ויזואלי */}
      {!isGroupTooLarge && totalTickets > 0 && (
        <div className="w-full max-w-md rounded-xl border border-[#e8e8e8] bg-[#fafafa] p-3 mb-3">
          <div className="flex items-start justify-around text-center">
            <div className="flex flex-col items-center gap-1">
              <Users className="w-5 h-5 text-[#581E83]" />
              <span className="text-[20px] font-bold text-[#581E83]">{seatsUsed}</span>
              <span className="text-[16px] text-[#464646]/60">{seatsUsed === 1 ? 'משתתף' : 'משתתפים'}</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <Sparkles className="w-5 h-5 text-[#581E83]" />
              <span className="text-[20px] font-bold text-[#581E83]">{totalTickets + extraItems}</span>
              <span className="text-[16px] text-[#464646]/60">{(totalTickets + extraItems) === 1 ? 'כלי' : 'כלים'}</span>
            </div>
          </div>

          {totalPrice > 0 && (
            <div className="mt-3 pt-3 border-t border-[#e8e8e8] space-y-1.5 text-[14px] text-[#464646]">
              {soloTickets > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {soloTickets} × כרטיס יחיד
                  </span>
                  <span className="font-medium tabular-nums">₪{soloTotal}</span>
                </div>
              )}
              {parentChildTickets > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <Baby className="w-3.5 h-3.5" />
                    {parentChildTickets} × הורה + ילד
                  </span>
                  <span className="font-medium tabular-nums">₪{parentChildTotal}</span>
                </div>
              )}
              {extraItems > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {extraItems} × כלי קרמיקה נוסף
                  </span>
                  <span className="font-medium tabular-nums">₪{extraItemsTotal}</span>
                </div>
              )}
            </div>
          )}

          {totalPrice > 0 && (
            <div className="mt-3 pt-3 border-t-2 border-[#5E2F88]/25">
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-bold text-[#581E83]">סה״כ עלות כרטיסים:</span>
                <span className="text-[20px] font-bold text-[#5E2F88] tabular-nums">₪{totalPrice}</span>
              </div>
              <p className="text-[12px] text-[#464646]/60 text-left mt-0.5">כולל מע״מ 18%</p>
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
            המשך לסיכום הזמנה
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
      {!isGroupTooLarge && seatsUsed >= 5 && (
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
