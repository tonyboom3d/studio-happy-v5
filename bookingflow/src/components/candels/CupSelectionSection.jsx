import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CupCatalogDrawer from './CupCatalogDrawer';
import { getDifficultyLabel } from '@/lib/utils';

// Step 3 of the candles ("סדנת נרות") booking flow: cup selection. Opens the
// cup catalog and displays the chosen cups (with images + any extra price)
// once the user finishes picking. One cup per candle/ticket (solo adult or
// parent+child pair) — totalCups is computed by the parent to match the
// ticket-pricing logic (each child = its own parent+child ticket, one adult
// covers up to 4 children).
export default function CupSelectionSection({
  cart,
  setCart,
  totalCups,
  onContinue,
  wixProducts,
  updateQuantity
}) {
  const [showCatalog, setShowCatalog] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const totalItems = cart.reduce((sum, p) => sum + (p.quantity || 1), 0);
  const cupsWord = totalCups === 1 ? 'כוס' : 'כוסות';

  const removeProduct = (productId) => {
    setCart(cart.filter(p => (p._id || p.id) !== productId));
  };

  const handleContinue = () => {
    if (totalItems < totalCups) {
      setValidationError(`יש לבחור עוד ${totalCups - totalItems} ${totalCups - totalItems === 1 ? 'כוס' : 'כוסות'} (סה״כ ${totalCups} ${cupsWord})`);
      return;
    }
    if (totalItems > totalCups) {
      setValidationError(`בחרתם יותר מדי כוסות. יש להפחית ${totalItems - totalCups}`);
      return;
    }
    setValidationError(null);
    onContinue();
  };

  return (
    <div className="py-4" dir="rtl">
      {/* כותרת משנה + כמה כוסות נדרשות */}
      <div className="mb-6 text-center space-y-2">
        <p className="text-base font-semibold text-[#581E83]">
          {totalCups === 1
            ? 'יש לבחור כוס אחת לנר שבהזמנה'
            : `יש לבחור ${totalCups} כוסות — אחת לכל נר שבהזמנה`}
        </p>
        <p className="text-sm text-[#464646]/80 leading-relaxed">
          בוחרים את הכוס שתשמש לנר שלכם בסדנה
        </p>
      </div>

      {/* כפתור פתיחת הקטלוג */}
      <div className="mb-4 flex justify-center">
        <Button
          type="button"
          onClick={() => setShowCatalog(true)}
          className="bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8 py-2.5 rounded-lg text-base"
        >
          בחירת {cupsWord} מהקטלוג
        </Button>
      </div>

      {/* כוסות נבחרות */}
      {cart.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h4 className="font-medium text-[#581E83] mb-3">
            הכוסות שנבחרו: ({totalItems}/{totalCups} {cupsWord})
          </h4>
          <div className="space-y-2">
            {cart.map((product) => {
              const pid = product._id || product.id;
              const qty = product.quantity || 1;
              const price = Number(product.price) || 0;
              const cupLabel = getDifficultyLabel(product);

              return (
                <motion.div
                  key={pid}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="bg-white px-2 py-2 sm:p-3 rounded-lg border border-[#e8e8e8] hover:border-[#5E2F88]/50 transition-colors"
                >
                  <div className="flex flex-nowrap items-center gap-2 min-w-0">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg overflow-hidden bg-[#f5f5f5] shrink-0">
                      <img
                        src={product.image || "https://images.unsplash.com/photo-1588117472556-1ddf8c5c3c68?w=100"}
                        alt="כוס לנר"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center flex-nowrap gap-1.5 sm:gap-2">
                        <h5 className="flex-1 min-w-0 font-medium text-[#581E83] text-xs sm:text-sm leading-tight truncate">
                          כוס לנר
                        </h5>
                        <span className={`text-[10px] sm:text-xs whitespace-nowrap ${price > 0 ? 'text-[#5E2F88]' : 'text-green-600'}`}>
                          {price > 0 ? `+${price} ₪` : 'כלול במחיר'}
                        </span>
                      </div>
                      {cupLabel && (
                        <p className="text-[10px] sm:text-xs text-[#464646]/70 leading-snug truncate">
                          {cupLabel}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <div className="flex items-center gap-0.5 sm:gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(pid, -1)}
                          className="w-6 h-6 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors"
                        >
                          <Minus className="w-3 h-3 text-[#581E83]" />
                        </button>
                        <span className="text-xs sm:text-sm font-bold text-[#581E83] min-w-[18px] sm:min-w-[20px] text-center tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(pid, 1)}
                          disabled={totalItems >= totalCups}
                          className="w-6 h-6 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3 h-3 text-[#581E83]" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProduct(pid)}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* כפתור המשך + שגיאת ולידציה */}
      <div className="flex flex-col items-center gap-2 mt-8">
        <Button
          onClick={handleContinue}
          disabled={cart.length === 0}
          className="bg-[#5E2F88] hover:bg-[#7B3DB0] hover:scale-[1.02] text-white px-8 py-3 rounded-lg
                     transition-all duration-200 text-lg disabled:opacity-50"
        >
          המשך לפרטים אישיים
        </Button>

        <AnimatePresence>
          {validationError && (
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

      {/* קטלוג כוסות */}
      <CupCatalogDrawer
        isOpen={showCatalog}
        onClose={() => setShowCatalog(false)}
        cart={cart}
        setCart={setCart}
        totalCups={totalCups}
        wixProducts={wixProducts}
        updateQuantity={updateQuantity}
      />
    </div>
  );
}
