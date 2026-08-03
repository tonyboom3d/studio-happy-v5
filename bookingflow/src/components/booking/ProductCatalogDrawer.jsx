import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { addLog } from '@/components/VersionLogger';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { X, Check, ZoomIn, Minus, Plus, Package, Search, ChevronDown, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { motion, AnimatePresence } from 'framer-motion';
import { cn, getDifficultyLabel, getDifficultyTextClass, isHardDifficulty } from '@/lib/utils';

const FALLBACK_PRODUCTS = [
  { id: 'fallback-1', title: 'טוען שטיחים...', difficulty: '', image: null, favorites: false }
];

function ProductGridCard({ product, isSelected, onClick, onZoom, quantity, onQuantityChange, canIncrease }) {
  const difficultyLabel = getDifficultyLabel(product);
  const hard = isHardDifficulty(difficultyLabel);

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

      <button onClick={onClick} className="w-full text-right">
        <div className="aspect-[4/3] overflow-hidden bg-[#E4C1F9]/30 flex items-center justify-center relative group">
          {product.image ? (
            <>
              <img
                src={product.image}
                alt={product.title}
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
          <h3 className="font-semibold text-[#581E83] text-sm sm:text-base mb-1 leading-snug">{product.title}</h3>
          <div className="flex flex-nowrap items-center justify-between gap-1 pt-1.5 border-t border-[#e8e8e8] min-w-0">
            {difficultyLabel && (
              <div className="flex items-center gap-1">
                <span className={cn('text-xs sm:text-sm font-medium', getDifficultyTextClass(difficultyLabel))}>
                  {difficultyLabel}
                </span>
                {hard && (
                  <span className="text-[10px] text-red-600 flex items-center gap-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    דורש ניסיון
                  </span>
                )}
              </div>
            )}
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
        </div>
      </button>
    </motion.div>
  );
}

function VideoCard({ title, subtitle, videoUrl, onClick, className = '', videoOffsetY = 0 }) {
  const videoRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isHovered) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isHovered]);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "relative rounded-xl overflow-hidden border-2 border-[#e8e8e8] hover:border-[#5E2F88] transition-all h-[220px] w-full bg-[#F3E9F9] flex flex-col",
        className
      )}
      dir="rtl"
    >
      {/* טקסט למעלה */}
      <div className="shrink-0 p-3 pb-1 text-center z-10">
        <h4 className="text-[20px] font-bold text-[#581E83]">{title}</h4>
        <p className="text-[14px] text-[#464646]/80 mt-0.5 leading-snug">{subtitle}</p>
      </div>
      {/* סרטון למטה - ממלא את השטח הנותר */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ 
            objectPosition: `center ${videoOffsetY}px`,
            transform: 'scale(1.1)'
          }}
        />
      </div>
    </button>
  );
}

export default function ProductCatalogDrawer({
  isOpen,
  onClose,
  cart,
  setCart,
  getMeetings,
  totalCarpets,
  wixProducts,
  updateQuantity
}) {
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [showFavorites, setShowFavorites] = useState(false);
  const productsContainerRef = useRef(null);
  const searchTimerRef = useRef(null);

  const products = wixProducts && wixProducts.length > 0 ? wixProducts : FALLBACK_PRODUCTS;

  // Debounce search
  const handleSearchChange = useCallback((value) => {
    setSearchText(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Extract unique difficulty values
  const difficultyOptions = useMemo(() => {
    const set = new Set();
    products.forEach(p => {
      const d = getDifficultyLabel(p);
      if (d) set.add(d);
    });
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (showFavorites) {
      result = result.filter(p => p.favorites === true);
    }

    if (difficultyFilter) {
      result = result.filter(p => getDifficultyLabel(p) === difficultyFilter);
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      result = result.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.productName || '').toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => {
      const ta = (a.title || '').toString();
      const tb = (b.title || '').toString();
      return ta.localeCompare(tb, 'he');
    });
  }, [products, debouncedSearch, difficultyFilter, showFavorites]);

  const totalItems = cart.reduce((sum, p) => sum + (p.quantity || 1), 0);

  const toggleProduct = (product) => {
    const productId = product._id || product.id;
    const isSelected = cart.some(p => (p._id || p.id) === productId);
    if (isSelected) {
      setCart(cart.filter(p => (p._id || p.id) !== productId));
    } else {
      if (totalItems >= totalCarpets) return;
      setCart([...cart, {
        ...product,
        id: productId,
        meetings: getMeetings(product),
        quantity: 1,
        difficulty: getDifficultyLabel(product)
      }]);
    }
  };

  const handleFavoritesClick = () => {
    setShowFavorites(true);
    setSearchText('');
    setDebouncedSearch('');
    setDifficultyFilter('');
  };

  const clearFilters = () => {
    setShowFavorites(false);
    setSearchText('');
    setDebouncedSearch('');
    setDifficultyFilter('');
  };

  useEffect(() => {
    try {
      window.postMessage({ type: 'CATALOG_STATE_CHANGE', data: { isOpen } }, '*');
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CATALOG_STATE_CHANGE', data: { isOpen } }, '*');
      }
      addLog(`Catalog ${isOpen ? 'opened' : 'closed'}`, isOpen ? 'info' : 'success');
    } catch (err) {}
  }, [isOpen]);

  // Reset filters on open
  useEffect(() => {
    if (isOpen) {
      clearFilters();
    }
  }, [isOpen]);

  const noResults = filteredProducts.length === 0;

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
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f5] text-[#581E83] hover:bg-[#e8e8e8] transition-colors"
              aria-label="סגור קטלוג"
            >
              <X className="h-5 w-5" />
            </button>
            <SheetTitle className="text-lg font-bold text-[#581E83]">
              קטלוג העיצובים
            </SheetTitle>
            <div className="w-8" />
          </div>

          {/* חיפוש + סינון */}
          <div className="flex gap-2">
            {/* חיפוש */}
            <div className="flex-1 relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#464646]/50" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="חיפוש עיצוב..."
                className="w-full h-9 pr-8 pl-3 rounded-lg border border-[#e8e8e8] text-sm text-[#464646] placeholder:text-[#464646]/40 focus:outline-none focus:border-[#5E2F88] transition-colors"
                dir="rtl"
              />
            </div>

            {/* סינון קושי */}
            <div className="relative">
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="h-9 pl-7 pr-3 rounded-lg border border-[#e8e8e8] text-sm text-[#464646] bg-white appearance-none focus:outline-none focus:border-[#5E2F88] transition-colors cursor-pointer"
                dir="rtl"
              >
                <option value="">כל הרמות</option>
                {difficultyOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#464646]/50 pointer-events-none" />
            </div>
          </div>

          {/* מועדפים פעיל */}
          {showFavorites && (
            <div className="flex items-center justify-between mt-2 bg-[#5E2F88]/10 rounded-lg px-3 py-1.5">
              <span className="text-xs text-[#581E83] font-medium">מציג הכי WOW!</span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-[#5E2F88] underline hover:no-underline"
              >
                הצג הכל
              </button>
            </div>
          )}
        </SheetHeader>

        {/* מובייל: סיכום + המשך */}
        <div className="shrink-0 border-b border-[#5E2F88]/20 bg-[#E4C1F9] px-2 pb-2 pt-1 sm:hidden">
          <div className="rounded-lg border border-[#5E2F88]/20 bg-white/80 p-2 text-sm text-[#464646]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Package className="h-4 w-4 shrink-0 text-[#5E2F88]" />
                {totalItems}/{totalCarpets} שטיחים נבחרו
              </span>
            </div>
            <Button
              onClick={onClose}
              disabled={cart.length === 0}
              className={`mt-1.5 h-11 w-full text-base font-medium text-white shadow-md ${cart.length > 0
                ? 'bg-[#5E2F88] hover:bg-[#7B3DB0]'
                : 'cursor-not-allowed bg-gray-300'
              }`}
            >
              המשך
            </Button>
          </div>
        </div>

        {/* גריד שטיחים */}
        <div
          ref={productsContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:p-4 sm:pb-4"
        >
          {noResults ? (
            <div className="flex flex-col items-center py-8 px-4" dir="rtl">
              <p className="text-[16px] text-[#464646] mb-6 text-center">
                לא נמצאו עיצובים תואמים לחיפוש שלך
              </p>
              <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                {/* WOW Card */}
                <VideoCard
                  title="!הכי WOW"
                  subtitle="ביחרו ממגון עיצובים מובחרים."
                  videoUrl="https://video.wixstatic.com/video/6b73e9_089ed022593f497f89d40b07a4e725b5/480p/mp4/file.mp4"
                  onClick={handleFavoritesClick}
                  videoOffsetY={40}
                />
                {/* AI Card */}
                <VideoCard
                  title="AI"
                  subtitle="בוחרים תמונה שרוצים לעצב וה AI מרכיב לכם סקיצה."
                  videoUrl="https://video.wixstatic.com/video/6b73e9_d8a10308e73b49419878f964bd024d8f/480p/mp4/file.mp4"
                  onClick={() => {}}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {filteredProducts.map(product => {
                const productId = product._id || product.id;
                const cartItem = cart.find(p => (p._id || p.id) === productId);
                const isSelected = !!cartItem;
                const canAddMore = totalItems < totalCarpets;
                return (
                  <div
                    key={productId}
                    data-product-card
                    onClick={() => {
                      if (!isSelected && !canAddMore) return;
                      toggleProduct(product);
                    }}
                    className={!isSelected && !canAddMore ? 'opacity-40 cursor-not-allowed' : ''}
                    title={!isSelected && !canAddMore ? `כבר בחרת ${totalCarpets} עיצובים` : ''}
                  >
                    <ProductGridCard
                      product={product}
                      isSelected={isSelected}
                      onClick={() => {}}
                      onZoom={setEnlargedImage}
                      quantity={cartItem?.quantity || 1}
                      onQuantityChange={updateQuantity}
                      canIncrease={totalItems < totalCarpets}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* טאבלט ומעלה: סיכום + המשך */}
        <div className="hidden sm:block shrink-0 border-t border-[#5E2F88]/20 bg-[#E4C1F9] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[#464646]">
              <Package className="w-4 h-4 text-[#5E2F88]" />
              <span>{totalItems}/{totalCarpets} שטיחים נבחרו</span>
            </div>
          </div>
          <Button
            onClick={onClose}
            disabled={cart.length === 0}
            className={`h-12 w-full text-base font-medium text-white shadow-md ${cart.length > 0
              ? 'bg-[#5E2F88] hover:bg-[#7B3DB0]'
              : 'cursor-not-allowed bg-gray-300'
            }`}
          >
            המשך
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
