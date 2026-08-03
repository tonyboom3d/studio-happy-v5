import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const BLOCKED_OUTSIDE_EVENTS = [
  'pointerdown',
  'pointerup',
  'click',
  'touchstart',
  'touchend',
  'mousedown',
  'mouseup',
];

const INTERACTIVE_SELECTOR = '[data-hard-warning-interactive="true"]';

export default function HardSketchWarningModal({ open, onClose, onConfirm, productTitle }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (open) setDontShowAgain(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const blockEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', blockEscape, true);
    return () => document.removeEventListener('keydown', blockEscape, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const blockOutside = (e) => {
      // Only the modal's own checkbox + the two action buttons are allowed
      // to receive interaction — everything else (backdrop, title, body
      // text, and anything behind the modal) is blocked.
      const isAllowed = !!e.target?.closest?.(INTERACTIVE_SELECTOR);
      if (!isAllowed) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
      }
    };

    BLOCKED_OUTSIDE_EVENTS.forEach((type) => {
      document.addEventListener(type, blockOutside, true);
    });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      BLOCKED_OUTSIDE_EVENTS.forEach((type) => {
        document.removeEventListener(type, blockOutside, true);
      });
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 !z-[9998] flex items-center justify-center bg-black/60 p-4 pointer-events-auto"
          style={{ zIndex: 9998 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative !z-[9999] bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4"
            style={{ zIndex: 9999 }}
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hard-sketch-warning-title"
          >
            <div className="flex flex-col items-center text-center pt-1">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
              <h3 id="hard-sketch-warning-title" className="text-[17px] font-bold text-[#581E83] leading-snug">
                המלצה חשובה בבחירת הסקיצה
              </h3>
              {productTitle && (
                <p className="text-xs text-[#464646]/60 mt-1">{productTitle}</p>
              )}
            </div>

            <div className="text-[13px] sm:text-sm text-[#464646] leading-relaxed space-y-3">
              <p>
                אם זו הפעם הראשונה שלכם בסדנה, אנו ממליצים לבחור סקיצה ברמת קושי קלה או בינונית, זאת כדי להגדיל את הסיכוי שתסיימו את השטיח במהלך הסדנה.
              </p>
              <p>
                אם השטיח לא יושלם בזמן הסדנה, הוא יישאר אצלנו להמשך עבודה. זמן ההשלמה הוא בדרך כלל עד כחודש ימים ממועד הסדנה.
              </p>
              <p>
                אנו משלימים עבורכם ללא עלות אם נותר 25% משטח השטיח. אם יישארו יותר מ-25% מהשטח להשלמה, תחול עלות נוספת, שתיקבע בהתאם להיקף העבודה שנותר.
              </p>
            </div>

            <label
              data-hard-warning-interactive="true"
              className="flex items-start gap-2.5 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#e8e8e8] text-[#5E2F88] focus:ring-[#5E2F88]"
              />
              <span className="text-[13px] text-[#464646] leading-snug">
                אוקי הבנתי, אל תציג שוב
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                data-hard-warning-interactive="true"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border-2 border-[#e8e8e8] text-[14px] font-medium text-[#464646] hover:bg-[#fafafa] transition-colors"
              >
                ביטול
              </button>
              <button
                type="button"
                data-hard-warning-interactive="true"
                onClick={() => onConfirm(dontShowAgain)}
                className="flex-1 py-2.5 rounded-xl bg-[#5E2F88] hover:bg-[#7B3DB0] text-white text-[14px] font-semibold transition-colors"
              >
                מאשר/ת את הבחירה
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
