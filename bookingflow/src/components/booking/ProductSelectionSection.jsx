import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Wrench, X, Minus, Plus, Sparkles, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ProductCatalogDrawer from './ProductCatalogDrawer';

export default function ProductSelectionSection({
  cart,
  setCart,
  adults,
  children,
  carpetSizes = {},
  onContinue,
  wixProducts,
  updateQuantity
}) {
  const [showCatalog, setShowCatalog] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [pendingLightbox, setPendingLightbox] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const pendingTimerRef = useRef(null);

  // חישוב מספר שטיחים (הורה+ילד = שטיח אחד)
  const totalCarpets = adults;

  // חישוב גדלי שטיחים שנבחרו
  const carpetSizesList = useMemo(() => {
    const sizes = [];
    for (let i = 0; i < totalCarpets; i++) {
      sizes.push(carpetSizes[i] || '60x60');
    }
    return sizes;
  }, [carpetSizes, totalCarpets]);

  // האם יש רק מידה אחת או יותר
  const uniqueSizes = useMemo(() => {
    return [...new Set(carpetSizesList)];
  }, [carpetSizesList]);

  // ספירת כמות כל גודל
  const sizeCountsAvailable = useMemo(() => {
    const counts = {};
    carpetSizesList.forEach(size => {
      counts[size] = (counts[size] || 0) + 1;
    });
    return counts;
  }, [carpetSizesList]);

  // עדכון גודל שטיח עבור יחידה מסוימת של מוצר
  const updateProductSize = (productId, unitIndex, newSize) => {
    setCart(prevCart => prevCart.map(p => {
      if ((p._id || p.id) !== productId) return p;
      const assignments = [...(p.sizeAssignments || [])];
      assignments[unitIndex] = newSize;
      return { ...p, sizeAssignments: assignments };
    }));
  };

  // חישוב כמה מכל גודל כבר מוקצה
  const usedSizeCounts = useMemo(() => {
    const counts = {};
    cart.forEach(product => {
      const qty = product.quantity || 1;
      const assignments = product.sizeAssignments || [];
      for (let i = 0; i < qty; i++) {
        const size = assignments[i] || uniqueSizes[0] || '60x60';
        counts[size] = (counts[size] || 0) + 1;
      }
    });
    return counts;
  }, [cart, uniqueSizes]);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  const getMeetings = (product) => {
    return 1;
  };

  const handleOptionClick = (optionId) => {
    if (pendingLightbox) return;

    setSelectedOption(optionId);

    if (optionId === 'catalog') {
      setShowCatalog(true);
      return;
    }

    if (optionId === 'custom') {
      setPendingLightbox(optionId);
      pendingTimerRef.current = setTimeout(() => {
        window.parent.postMessage({ type: 'OPEN_LIGHTBOX', lightboxId: 'byMySelf' }, '*');
        setPendingLightbox(null);
        pendingTimerRef.current = null;
      }, 2000);
    }
  };

  const options = [
    {
      id: 'catalog',
      title: 'בחירה מהקטלוג',
      description: 'בחרו מתוך מגוון עיצובים',
      icon: ShoppingBag,
      recommended: true
    },
    {
      id: 'custom',
      title: 'לתפור משהו משלי',
      description: 'יש לכם רעיון משלכם? ספרו לנו!',
      icon: Wrench,
      recommended: false
    }
  ];

  const totalItems = cart.reduce((sum, p) => sum + (p.quantity || 1), 0);

  const removeProduct = (productId) => {
    setCart(cart.filter(p => (p._id || p.id) !== productId));
  };

  const handleContinue = () => {
    if (totalItems < totalCarpets) {
      setValidationError(`יש לבחור עוד ${totalCarpets - totalItems} ${totalCarpets - totalItems === 1 ? 'עיצוב' : 'עיצובים'} (סה״כ ${totalCarpets} שטיחים)`);
      return;
    }
    if (totalItems > totalCarpets) {
      setValidationError(`בחרתם יותר מדי עיצובים. יש להפחית ${totalItems - totalCarpets}`);
      return;
    }
    setValidationError(null);
    onContinue();
  };

  return (
    <div className="py-4" dir="rtl">
      {/* כותרת משנה */}
      <div className="mb-6 text-center">
        <p className="text-sm text-[#464646]/80 leading-relaxed">
          בוחרים את העיצוב שאתם רוצים והוא יחכה לכם לתפירה בסדנה
        </p>
      </div>

      {/* אפשרויות בחירה - רק 2 */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:mb-6 md:grid-cols-2 md:gap-4 max-w-lg mx-auto">
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedOption === option.id;
          const isPending = pendingLightbox === option.id;
          const disableWhilePending = Boolean(pendingLightbox) && !isPending;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleOptionClick(option.id)}
              disabled={disableWhilePending || isPending}
              className={cn(
                "relative rounded-xl border-2 text-right",
                "p-4 md:p-5",
                isSelected
                  ? "border-[#5E2F88] bg-[#5E2F88]/5 shadow-lg"
                  : "border-[#e8e8e8] hover:border-[#5E2F88] bg-white hover:shadow-lg",
                (disableWhilePending || isPending) && "disabled:opacity-70 disabled:cursor-not-allowed"
              )}
            >
              {option.recommended && (
                <div className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-[#5E2F88] px-2 py-0.5 text-[10px] font-medium text-white md:px-3 md:text-xs">
                  <Sparkles className="h-2.5 w-2.5 md:h-3 md:w-3" />
                  מומלץ
                </div>
              )}

              <div className="flex w-full flex-row items-center gap-3 text-right md:flex-col md:items-center md:text-center md:gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] text-[#581E83] md:h-12 md:w-12">
                  <Icon className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-tight text-[#581E83] md:text-base">{option.title}</h3>
                  <p className="mt-0.5 text-xs leading-snug text-[#464646]/70 md:mt-1 md:text-sm">{option.description}</p>
                </div>
              </div>

              {isPending && (
                <div className="absolute inset-0 rounded-xl bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                  <div className="flex items-center gap-2 text-[#581E83]">
                    <span className="h-4 w-4 rounded-full border-2 border-[#581E83]/25 border-t-[#581E83] animate-spin" />
                    <span className="text-xs font-medium">טוען…</span>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* מוצרים נבחרים */}
      {cart.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h4 className="font-medium text-[#581E83] mb-3">
            העיצובים שנבחרו: ({totalItems}/{totalCarpets} שטיחים)
            {uniqueSizes.length === 1 && (
              <span className="text-[14px] font-normal text-[#464646]/60 mr-2">
                • גודל: {uniqueSizes[0]}
              </span>
            )}
          </h4>
          <div className="space-y-2">
            {cart.map((product) => {
              const pid = product._id || product.id;
              const qty = product.quantity || 1;
              const assignments = product.sizeAssignments || [];
              const showSizeDropdowns = uniqueSizes.length > 1;
              
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
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center flex-nowrap gap-1.5 sm:gap-2">
                        <h5 className="flex-1 min-w-0 font-medium text-[#581E83] text-xs sm:text-sm leading-tight truncate">
                          {product.title}
                        </h5>
                        {product.difficulty && (
                          <span className="text-[10px] sm:text-xs text-[#464646]/60 whitespace-nowrap">
                            {product.difficulty}
                          </span>
                        )}
                      </div>
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
                          disabled={totalItems >= totalCarpets}
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

                  {/* בחירת גודל שטיח לכל יחידה */}
                  {showSizeDropdowns && (
                    <div className="mt-2 pt-2 border-t border-[#e8e8e8] flex flex-wrap gap-2">
                      {Array.from({ length: qty }).map((_, unitIdx) => {
                        const currentSize = assignments[unitIdx] || uniqueSizes[0] || '60x60';
                        return (
                          <div key={unitIdx} className="relative">
                            <select
                              value={currentSize}
                              onChange={(e) => updateProductSize(pid, unitIdx, e.target.value)}
                              className="appearance-none h-7 pl-6 pr-2 rounded border border-[#5E2F88]/30 text-[14px] text-[#581E83] bg-[#5E2F88]/5 focus:outline-none focus:border-[#5E2F88] cursor-pointer"
                              dir="rtl"
                            >
                              {uniqueSizes.map(size => (
                                <option key={size} value={size}>{size}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5E2F88] pointer-events-none" />
                          </div>
                        );
                      })}
                    </div>
                  )}
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

      {/* קטלוג שטיחים */}
      <ProductCatalogDrawer
        isOpen={showCatalog}
        onClose={() => setShowCatalog(false)}
        cart={cart}
        setCart={setCart}
        getMeetings={getMeetings}
        totalCarpets={totalCarpets}
        wixProducts={wixProducts}
        updateQuantity={updateQuantity}
      />
    </div>
  );
}
