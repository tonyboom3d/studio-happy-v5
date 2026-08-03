import React, { useEffect, useRef, useState, useMemo } from 'react';
import { addLog } from '@/components/VersionLogger';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { X, Check, ZoomIn, Minus, Plus, Package } from 'lucide-react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { motion, AnimatePresence } from 'framer-motion';
import { cn, getDifficultyLabel } from '@/lib/utils';

// Cup catalog for the candles workshop ("סדנת נרות"). Same visual language
// as the sketches catalog (ProductCatalogDrawer). Shows image, price, and the
// cup description from the CMS difficulty (tags) field below the price.
const FALLBACK_PRODUCTS = [
  { id: 'fallback-1', title: 'טוען כוסות...', image: null, price: 0 }
];

function formatCupPrice(price) {
  const p = Number(price) || 0;
  if (p <= 0) return 'כלול במחיר';
  return `+${p} ₪`;
}

function CupGridCard({ product, isSelected, onZoom, quantity, onQuantityChange, canIncrease, onToggle }) {
  const price = Number(product.price) || 0;
  const cupLabel = getDifficultyLabel(product);

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative bg-white rounded-xl overflow-hidden border-2 transition-all duration-300",
        isSelected
          ? "border-[#5E2F88] shadow-lg"
          : "border-[#e8e8e8] hover:border-[#5E2F88]/50 hover:shadow-md"
      )}
    >
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 left-3 z-10 w-6 h-6 rounded-full bg-[#5E2F88] flex items-center justify-center shadow-md"
        >
          <Check className="w-4 h-4 text-white" />
        </motion.div>
      )}

      <button onClick={onToggle} className="w-full text-right">
        <div className="aspect-[4/3] overflow-hidden bg-[#E4C1F9]/30 flex items-center justify-center relative group">
          {product.image ? (
            <>
              <img
                src={product.image}
                alt={product.title || 'כוס לנר'}
                className="h-full w-full object-contain transition-transform duration-300 hover:scale-105"
                loading="lazy"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onZoom(product.image);
                }}
                className="absolute bottom-2 left-2 rounded-full bg-white/80 p-1.5 transition-colors hover:bg-white"
              >
                <ZoomIn className="h-4 w-4 text-[#581E83]" />
              </button>
            </>
          ) : (
            <span className="px-2 text-center text-xs leading-snug text-[#464646]/60">
              אין תמונה זמינה
            </span>
          )}
        </div>

        <div className="p-2.5 sm:p-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex flex-nowrap items-center justify-between gap-1 min-w-0">
              <span className={cn(
                'text-xs sm:text-sm font-medium',
                price > 0 ? 'text-[#5E2F88]' : 'text-green-600'
              )}>
                {formatCupPrice(price)}
              </span>
              {isSelected && onQuantityChange && (
                <div
                  className="flex items-center gap-0.5 sm:gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onQuantityChange(product._id || product.id, -1); }}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors"
                  >
                    <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#581E83]" />
                  </button>
                  <span className="text-xs sm:text-sm font-bold text-[#581E83] min-w-[18px] sm:min-w-[20px] text-center tabular-nums">{quantity || 1}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (canIncrease) onQuantityChange(product._id || product.id, 1); }}
                    disabled={!canIncrease}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#581E83]" />
                  </button>
                </div>
              )}
            </div>
            {cupLabel && (
              <p className="text-[11px] sm:text-xs text-[#464646]/70 leading-snug">
                {cupLabel}
              </p>
            )}
          </div>
        </div>
      </button>
    </motion.div>
  );
}

export default function CupCatalogDrawer({
  isOpen,
  onClose,
  cart,
  setCart,
  totalCups,
  wixProducts,
  updateQuantity
}) {
  const [enlargedImage, setEnlargedImage] = useState(null);
  const productsContainerRef = useRef(null);

  const products = useMemo(() => {
    const list = wixProducts && wixProducts.length > 0 ? wixProducts : FALLBACK_PRODUCTS;
    return [...list].sort((a, b) => {
      const priceA = Number(a.price) || 0;
      const priceB = Number(b.price) || 0;
      return priceA - priceB;
    });
  }, [wixProducts]);

  const totalItems = cart.reduce((sum, p) => sum + (p.quantity || 1), 0);

  const toggleProduct = (product) => {
    const productId = product._id || product.id;
    const isSelected = cart.some(p => (p._id || p.id) === productId);
    if (isSelected) {
      setCart(cart.filter(p => (p._id || p.id) !== productId));
    } else {
      if (totalItems >= totalCups) return;
      setCart([...cart, {
        ...product,
        id: productId,
        quantity: 1,
      }]);
    }
  };

  useEffect(() => {
    try {
      window.postMessage({ type: 'CUP_CATALOG_STATE_CHANGE', data: { isOpen } }, '*');
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CUP_CATALOG_STATE_CHANGE', data: { isOpen } }, '*');
      }
      addLog(`Cup catalog ${isOpen ? 'opened' : 'closed'}`, isOpen ? 'info' : 'success');
    } catch (err) {}
  }, [isOpen]);

  const noResults = products.length === 0;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        hideCloseButton
        className="flex h-full max-h-[100dvh] w-full flex-col overflow-hidden p-0 sm:max-w-xl"
        style={{ backgroundColor: '#E4C1F9' }}
      >
        {/* Header - לבן */}
        <SheetHeader className="flex flex-col shrink-0 space-y-0 border-b border-[#e8e8e8] bg-white px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f5] text-[#581E83] hover:bg-[#e8e8e8] transition-colors"
              aria-label="סגור קטלוג"
            >
              <X className="h-5 w-5" />
            </button>
            <SheetTitle className="text-lg font-bold text-[#581E83]">
              קטלוג כוסות לנרות
            </SheetTitle>
            <div className="w-8" />
          </div>
        </SheetHeader>

        {/* מובייל: סיכום + סיימתי לבחור */}
        <div className="shrink-0 border-b border-[#5E2F88]/20 bg-[#E4C1F9] px-2 pb-2 pt-1 sm:hidden">
          <div className="rounded-lg border border-[#5E2F88]/20 bg-white/80 p-2 text-sm text-[#464646]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Package className="h-4 w-4 shrink-0 text-[#5E2F88]" />
                {totalItems}/{totalCups} כוסות נבחרו
              </span>
            </div>
            <Button
              onClick={onClose}
              disabled={totalItems !== totalCups}
              className={`mt-1.5 h-11 w-full text-base font-medium text-white shadow-md ${totalItems === totalCups
                ? 'bg-[#5E2F88] hover:bg-[#7B3DB0]'
                : 'cursor-not-allowed bg-gray-300'
              }`}
            >
              זהו, סיימתי לבחור
            </Button>
          </div>
        </div>

        {/* גריד כוסות */}
        <div
          ref={productsContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:p-4 sm:pb-4"
        >
          {noResults ? (
            <div className="flex flex-col items-center py-8 px-4" dir="rtl">
              <p className="text-[16px] text-[#464646] text-center">
                לא נמצאו כוסות זמינות
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 px-1 text-center text-[11px] leading-relaxed text-[#464646]/65 sm:text-xs">
                מלאי הכוסות משתנה, ולכן לא נוכל להתחייב לכוס שבחרתם. התמונות מוצגות להמחשה בלבד.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {products.map(product => {
                const productId = product._id || product.id;
                const cartItem = cart.find(p => (p._id || p.id) === productId);
                const isSelected = !!cartItem;
                const canAddMore = totalItems < totalCups;
                return (
                  <div
                    key={productId}
                    data-product-card
                    onClick={() => {
                      if (!isSelected && !canAddMore) return;
                      toggleProduct(product);
                    }}
                    className={!isSelected && !canAddMore ? 'opacity-40 cursor-not-allowed' : ''}
                    title={!isSelected && !canAddMore ? `כבר בחרת ${totalCups} כוסות` : ''}
                  >
                    <CupGridCard
                      product={product}
                      isSelected={isSelected}
                      onToggle={() => {}}
                      onZoom={setEnlargedImage}
                      quantity={cartItem?.quantity || 1}
                      onQuantityChange={updateQuantity}
                      canIncrease={totalItems < totalCups}
                    />
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>

        {/* טאבלט ומעלה: סיכום + סיימתי לבחור */}
        <div className="hidden sm:block shrink-0 border-t border-[#5E2F88]/20 bg-[#E4C1F9] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[#464646]">
              <Package className="w-4 h-4 text-[#5E2F88]" />
              <span>{totalItems}/{totalCups} כוסות נבחרו</span>
            </div>
          </div>
          <Button
            onClick={onClose}
            disabled={totalItems !== totalCups}
            className={`h-12 w-full text-base font-medium text-white shadow-md ${totalItems === totalCups
              ? 'bg-[#5E2F88] hover:bg-[#7B3DB0]'
              : 'cursor-not-allowed bg-gray-300'
            }`}
          >
            זהו, סיימתי לבחור
          </Button>
        </div>
      </SheetContent>

      {/* מודל להגדלת תמונה */}
      <Dialog
        open={!!enlargedImage}
        onOpenChange={(open) => {
          if (!open) setEnlargedImage(null);
        }}
      >
        <DialogContent
          hideCloseButton
          className={cn(
            "z-[300] w-[calc(100vw-1rem)] max-w-[min(100vw-1rem,42rem)] max-h-[92dvh] p-2 sm:p-4",
            "border-none bg-transparent shadow-none",
            "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
            "flex flex-col items-center justify-center gap-0 overflow-visible"
          )}
        >
          <div className="relative w-full max-h-[88dvh] flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={() => setEnlargedImage(null)}
              className="absolute top-1 right-1 z-20 rounded-full p-2 bg-black/55 text-white hover:bg-black/70 sm:top-2 sm:right-2"
              aria-label="סגור"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <div className="w-full max-h-[min(85dvh,calc(100vw))] flex items-center justify-center rounded-lg bg-white shadow-2xl overflow-hidden p-2 sm:p-4">
              <img
                src={enlargedImage}
                alt=""
                className="max-h-[min(80dvh,calc(100vw-2rem))] w-full max-w-full object-contain"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
