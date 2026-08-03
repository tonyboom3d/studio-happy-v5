import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Filter } from 'lucide-react';
import ProductCard from './ProductCard';

export default function ProductCatalog({ 
  isOpen, 
  onClose, 
  products, 
  cart, 
  toggleProduct, 
  getMeetings 
}) {
  const [meetingsFilter, setMeetingsFilter] = useState([1, 6]);
  const [priceFilter, setPriceFilter] = useState([0, 1000]);
  const [showFilters, setShowFilters] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const meetings = getMeetings(product);
      return (
        meetings >= meetingsFilter[0] &&
        meetings <= meetingsFilter[1] &&
        product.price >= priceFilter[0] &&
        product.price <= priceFilter[1]
      );
    });
  }, [products, meetingsFilter, priceFilter, getMeetings]);

  const totalPrice = cart.reduce((sum, p) => sum + p.price, 0);
  const totalMeetings = cart.reduce((sum, p) => sum + (p.meetings || getMeetings(p)), 0);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-[#e8e8e8] sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold text-[#581E83]">קטלוג מוצרים</DialogTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#e8e8e8] hover:border-[#5E2F88] transition-colors"
              >
                <Filter className="w-4 h-4 text-[#581E83]" />
                <span className="text-sm text-[#464646]">סינון</span>
              </button>
            </div>
          </div>

          {/* פילטרים */}
          {showFilters && (
            <div className="mt-4 p-4 bg-[#fafafa] rounded-xl space-y-4">
              <div>
                <Label className="text-sm text-[#464646]">כמות מפגשים</Label>
                <Slider
                  value={meetingsFilter}
                  onValueChange={setMeetingsFilter}
                  min={1}
                  max={6}
                  step={1}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-[#464646]/70 mt-1">
                  <span>{meetingsFilter[0]}</span>
                  <span>{meetingsFilter[1]}</span>
                </div>
              </div>

              <div>
                <Label className="text-sm text-[#464646]">מחיר (₪)</Label>
                <Slider
                  value={priceFilter}
                  onValueChange={setPriceFilter}
                  min={0}
                  max={1000}
                  step={50}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-[#464646]/70 mt-1">
                  <span>₪{priceFilter[0]}</span>
                  <span>₪{priceFilter[1]}</span>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* גריד מוצרים */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                isSelected={cart.some(p => p.id === product.id)}
                onClick={() => toggleProduct(product)}
                meetings={getMeetings(product)}
              />
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-[#464646]/70">
              לא נמצאו מוצרים התואמים לסינון
            </div>
          )}
        </div>

        {/* סיכום תחתון */}
        <div className="sticky bottom-0 p-4 bg-white border-t border-[#e8e8e8]">
          <div className="flex items-center justify-between">
            <div className="flex gap-6 text-sm text-[#464646]">
              <span>{cart.length} מוצרים</span>
              <span>{totalMeetings} מפגשים</span>
            </div>
            <div className="text-xl font-bold text-[#5E2F88]">₪{totalPrice}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}