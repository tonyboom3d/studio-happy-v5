import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle, Wrench, ShoppingBag } from 'lucide-react';
import ProductCard from './ProductCard';
import ProductCatalog from './ProductCatalog';
import ConsultationModal from './ConsultationModal';
import CustomBuildModal from './CustomBuildModal';

// נתוני דוגמה
const SAMPLE_PRODUCTS = [
  { id: '1', title: 'שולחן קפה', price: 450, difficulty: 2.5, image: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?w=400', meetings_single_recycled: 3, meetings_couple_recycled: 2, meetings_single_new: 4, meetings_couple_new: 3 },
  { id: '2', title: 'מדף קיר', price: 280, difficulty: 2, image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=400', meetings_single_recycled: 2, meetings_couple_recycled: 1, meetings_single_new: 3, meetings_couple_new: 2 },
  { id: '3', title: 'כיסא בר', price: 520, difficulty: 3.5, image: 'https://images.unsplash.com/photo-1503602642458-232111445657?w=400', meetings_single_recycled: 4, meetings_couple_recycled: 3, meetings_single_new: 5, meetings_couple_new: 4 },
  { id: '4', title: 'ארגז כלים', price: 320, difficulty: 1.5, image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=400', meetings_single_recycled: 2, meetings_couple_recycled: 1, meetings_single_new: 2, meetings_couple_new: 2 },
  { id: '5', title: 'שידת לילה', price: 480, difficulty: 3, image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400', meetings_single_recycled: 3, meetings_couple_recycled: 2, meetings_single_new: 4, meetings_couple_new: 3 },
  { id: '6', title: 'מתלה בגדים', price: 380, difficulty: 2.5, image: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=400', meetings_single_recycled: 3, meetings_couple_recycled: 2, meetings_single_new: 3, meetings_couple_new: 2 },
];

export default function ProductsSection({ 
  cart, 
  setCart, 
  participants, 
  woodType, 
  onContinue 
}) {
  const [showCatalog, setShowCatalog] = useState(false);
  const [showConsultation, setShowConsultation] = useState(false);
  const [showCustomBuild, setShowCustomBuild] = useState(false);

  const getMeetings = (product) => {
    const isCouple = participants >= 2;
    const isRecycled = woodType === 'recycled';
    
    if (isCouple && isRecycled) return product.meetings_couple_recycled || 2;
    if (isCouple && !isRecycled) return product.meetings_couple_new || 3;
    if (!isCouple && isRecycled) return product.meetings_single_recycled || 3;
    return product.meetings_single_new || 4;
  };

  const toggleProduct = (product) => {
    const isSelected = cart.some(p => p.id === product.id);
    if (isSelected) {
      setCart(cart.filter(p => p.id !== product.id));
    } else {
      setCart([...cart, { ...product, meetings: getMeetings(product) }]);
    }
  };

  const totalPrice = cart.reduce((sum, p) => sum + p.price, 0);
  const totalMeetings = cart.reduce((sum, p) => sum + (p.meetings || getMeetings(p)), 0);

  return (
    <div className="py-4">
      {/* כפתורי פעולה */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button
          variant="outline"
          onClick={() => setShowConsultation(true)}
          className="flex items-center gap-2 border-[#5E2F88] text-[#581E83] hover:bg-[#5E2F88]/10"
        >
          <MessageCircle className="w-4 h-4" />
          אשמח להתייעץ לפני
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowCustomBuild(true)}
          className="flex items-center gap-2 border-[#5E2F88] text-[#581E83] hover:bg-[#5E2F88]/10"
        >
          <Wrench className="w-4 h-4" />
          אני רוצה לבנות משהו משלי
        </Button>
      </div>

      {/* גריד מוצרים */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {SAMPLE_PRODUCTS.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            isSelected={cart.some(p => p.id === product.id)}
            onClick={() => toggleProduct(product)}
            meetings={getMeetings(product)}
          />
        ))}
      </div>

      {/* כפתור לקטלוג מלא */}
      <div className="flex justify-center mt-6">
        <Button
          variant="ghost"
          onClick={() => setShowCatalog(true)}
          className="text-[#5E2F88] hover:text-[#7B3DB0] hover:bg-[#5E2F88]/10"
        >
          <ShoppingBag className="w-4 h-4 ml-2" />
          צפייה בקטלוג המלא
        </Button>
      </div>

      {/* סיכום */}
      {cart.length > 0 && (
        <div className="mt-6 p-4 bg-[#fafafa] rounded-xl border border-[#e8e8e8]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[#464646]">{cart.length} מוצרים נבחרו</span>
            <span className="text-[#464646]">{totalMeetings} מפגשים</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-[#581E83]">סה״כ:</span>
            <span className="text-xl font-bold text-[#5E2F88]">₪{totalPrice}</span>
          </div>
        </div>
      )}

      {/* כפתור המשך */}
      <div className="flex justify-center mt-8">
        <Button
          onClick={onContinue}
          disabled={cart.length === 0}
          className="bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8 py-3 rounded-lg
                     transition-all duration-200 text-lg disabled:opacity-50"
        >
          המשך לבחירת תאריכים
        </Button>
      </div>

      {/* מודלים */}
      <ProductCatalog 
        isOpen={showCatalog} 
        onClose={() => setShowCatalog(false)}
        products={SAMPLE_PRODUCTS}
        cart={cart}
        toggleProduct={toggleProduct}
        getMeetings={getMeetings}
      />
      <ConsultationModal 
        isOpen={showConsultation} 
        onClose={() => setShowConsultation(false)} 
      />
      <CustomBuildModal 
        isOpen={showCustomBuild} 
        onClose={() => setShowCustomBuild(false)} 
      />
    </div>
  );
}