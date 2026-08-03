import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function CarpetSizeSection({
  adults,
  children,
  carpetSizes,
  setCarpetSizes,
  onContinue
}) {
  const totalCarpets = adults;
  const [validationError, setValidationError] = useState(null);

  // אתחול: כל השטיחים כ-60x60 בעת כניסה לקומפוננט
  useEffect(() => {
    if (Object.keys(carpetSizes).length === 0 && totalCarpets > 0) {
      const initialSizes = {};
      for (let i = 0; i < totalCarpets; i++) {
        initialSizes[i] = '60x60';
      }
      setCarpetSizes(initialSizes);
    }
  }, [totalCarpets, carpetSizes, setCarpetSizes]);

  // חישוב כמות שטיחים לפי גודל
  const count60 = useMemo(() => {
    return Object.values(carpetSizes).filter(s => s === '60x60').length;
  }, [carpetSizes]);

  const count90 = useMemo(() => {
    return Object.values(carpetSizes).filter(s => s === '90x90').length;
  }, [carpetSizes]);

  const totalSelected = count60 + count90;

  // שינוי כמות שטיחים - איזון אוטומטי (הסכום תמיד שווה ל-totalCarpets)
  const handleQuantityChange = (sizeId, delta) => {
    const currentCount = sizeId === '60x60' ? count60 : count90;
    const otherCount = sizeId === '60x60' ? count90 : count60;
    const newCount = currentCount + delta;

    // לא מאפשרים ערכים שליליים או יותר מהסכום הכולל
    if (newCount < 0 || newCount > totalCarpets) return;

    setValidationError(null);

    // בניית מחדש של carpetSizes - איזון אוטומטי
    const newSizes = {};
    let idx = 0;

    const new60 = sizeId === '60x60' ? newCount : (totalCarpets - newCount);
    const new90 = sizeId === '90x90' ? newCount : (totalCarpets - newCount);

    // קודם שטיחים 60x60
    for (let i = 0; i < new60; i++) {
      newSizes[idx++] = '60x60';
    }

    // אחר כך שטיחים 90x90
    for (let i = 0; i < new90; i++) {
      newSizes[idx++] = '90x90';
    }

    setCarpetSizes(newSizes);
  };

  // תוספת מחיר
  const totalUpgradePrice = count90 * 100;

  // האם נבחרו כל השטיחים (תמיד נכון כי יש איזון אוטומטי)
  const allSelected = totalSelected === totalCarpets;

  const handleContinue = () => {
    setValidationError(null);
    onContinue();
  };

  return (
    <div className="py-3" dir="rtl">
      {/* כותרת */}
      <div className="text-center mb-3">
        <h3 className="text-[20px] font-medium text-[#581E83]">
          בחרו את גודל השטיח ({totalCarpets} {totalCarpets === 1 ? 'שטיח' : 'שטיחים'})
        </h3>
      </div>

      {/* תמונת השוואה והסבר גדלים */}
      <div className="mb-4 rounded-xl border border-[#e8e8e8] bg-white p-3">
        <div className="flex justify-center items-end gap-6">
          {/* 60x60 */}
          <div className="flex flex-col items-center">
            <div 
              className="bg-[#5E2F88]/10 border-2 border-[#5E2F88]/30 rounded-lg flex items-center justify-center"
              style={{ width: '50px', height: '50px' }}
            >
              <span className="text-[10px] font-medium text-[#5E2F88]">60×60</span>
            </div>
            <span className="text-[12px] text-[#581E83] mt-1 font-medium">למתחילים</span>
          </div>

          {/* 90x90 */}
          <div className="flex flex-col items-center">
            <div 
              className="bg-[#5E2F88]/10 border-2 border-[#5E2F88]/30 rounded-lg flex items-center justify-center"
              style={{ width: '75px', height: '75px' }}
            >
              <span className="text-[12px] font-medium text-[#5E2F88]">90×90</span>
            </div>
            <span className="text-[12px] text-[#581E83] mt-1 font-medium">למתקדמים</span>
          </div>
        </div>
      </div>

      {/* בחירת כמויות - שתי האופציות באותה שורה */}
      <div className="grid grid-cols-2 gap-3">
        {/* 60x60 */}
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
          <div className="flex flex-col items-center gap-2">
            <div className="text-center">
              <div className="text-[16px] font-medium text-[#581E83]">60×60</div>
              <div className="text-[12px] text-green-600">כלול במחיר</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuantityChange('60x60', -1)}
                disabled={count60 <= 0}
                className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                           text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
              >
                <Minus className="w-3 h-3" />
              </button>
              <motion.span
                key={count60}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-[22px] font-bold text-[#581E83] w-6 text-center"
              >
                {count60}
              </motion.span>
              <button
                type="button"
                onClick={() => handleQuantityChange('60x60', 1)}
                className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                           text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* 90x90 */}
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
          <div className="flex flex-col items-center gap-2">
            <div className="text-center">
              <div className="text-[16px] font-medium text-[#581E83]">90×90</div>
              <div className="text-[12px] text-[#5E2F88]">+₪100</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuantityChange('90x90', -1)}
                disabled={count90 <= 0}
                className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                           text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5E2F88]"
              >
                <Minus className="w-3 h-3" />
              </button>
              <motion.span
                key={count90}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-[22px] font-bold text-[#581E83] w-6 text-center"
              >
                {count90}
              </motion.span>
              <button
                type="button"
                onClick={() => handleQuantityChange('90x90', 1)}
                className="w-8 h-8 rounded-full border-2 border-[#5E2F88] flex items-center justify-center
                           text-[#5E2F88] hover:bg-[#5E2F88] hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* תוספת מחיר */}
      {totalUpgradePrice > 0 && (
        <div className="mt-3 text-center">
          <p className="text-[16px] font-semibold text-[#5E2F88]">
            תוספת לשטיחים גדולים: +₪{totalUpgradePrice}
          </p>
        </div>
      )}

      {/* כפתור המשך */}
      <div className="flex flex-col items-center gap-2 mt-4">
        <Button
          onClick={handleContinue}
          className="bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8 py-2.5 rounded-lg text-[16px]"
        >
          המשך לבחירת עיצוב
        </Button>
      </div>
    </div>
  );
}
