import React from 'react';
import { Check, Star, StarHalf } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

function DifficultyStars({ difficulty }) {
  const stars = [];
  const fullStars = Math.floor(difficulty);
  const hasHalf = difficulty % 1 >= 0.5;
  
  for (let i = 0; i < fullStars; i++) {
    stars.push(
      <Star key={`full-${i}`} className="w-3.5 h-3.5 fill-[#5E2F88] text-[#5E2F88]" />
    );
  }
  
  if (hasHalf) {
    stars.push(
      <StarHalf key="half" className="w-3.5 h-3.5 fill-[#5E2F88] text-[#5E2F88]" />
    );
  }
  
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  for (let i = 0; i < emptyStars; i++) {
    stars.push(
      <Star key={`empty-${i}`} className="w-3.5 h-3.5 text-[#e8e8e8]" />
    );
  }
  
  return <div className="flex gap-0.5">{stars}</div>;
}

export default function ProductCard({ product, isSelected, onClick, meetings }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative bg-white rounded-xl overflow-hidden border-2 text-right",
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
      
      <div className="aspect-[4/3] overflow-hidden bg-[#f5f5f5]">
        <img
          src={product.image || "https://images.unsplash.com/photo-1588117472556-1ddf8c5c3c68?w=400"}
          alt={product.title}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
        />
      </div>
      
      <div className="p-4">
        <h3 className="font-semibold text-[#581E83] text-base mb-2">{product.title}</h3>
        
        <div className="flex items-center justify-between mb-2">
          <DifficultyStars difficulty={product.difficulty || 3} />
          <span className="text-xs text-[#464646]/70">{meetings} מפגשים</span>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-[#e8e8e8]">
          <span className="text-lg font-bold text-[#5E2F88]">₪{product.price}</span>
        </div>
      </div>
    </button>
  );
}