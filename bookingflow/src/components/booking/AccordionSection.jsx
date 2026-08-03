import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Lock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AccordionSection({ 
  title,
  /** כותרת חלופית למסכים צרים (מוצגת מתחת ל־md) */
  titleMobile,
  /** תוכן אופציונלי לימין הכותרת (למשל מחיר בשלב סיכום) */
  headerRight,
  /** שלב סיכום הזמנה — כותרת חומה וטקסט לבן */
  variant = 'default',
  stepNumber, 
  isActive, 
  isCompleted, 
  isLocked, 
  onClick, 
  children 
}) {
  const isSummary = variant === 'summary';

  return (
    <div className={cn(
      "border rounded-xl overflow-hidden transition-all duration-300",
      isSummary
        ? isActive
          ? "border-[#e8e8e8] shadow-lg"
          : "border-[#e8e8e8]"
        : isActive
          ? "border-[#5E2F88] shadow-lg"
          : "border-[#e8e8e8]",
      isLocked && "opacity-60"
    )}>
      <button
        type="button"
        onClick={onClick}
        disabled={isLocked}
        className={cn(
          "w-full flex items-center justify-between p-4 md:p-5 text-right transition-colors duration-200",
          isSummary
            ? cn(
                isActive ? "bg-[#581E83] text-white" : "bg-[#581E83] text-white hover:bg-[#581E83]",
                isLocked && "cursor-not-allowed"
              )
            : cn(
                isActive ? "bg-[#fafafa]" : "bg-white hover:bg-[#fafafa]",
                isLocked && "cursor-not-allowed"
              )
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 shrink-0",
            isSummary
              ? isCompleted
                ? "bg-white/25 text-white"
                : isActive
                  ? "bg-white/20 text-white"
                  : "bg-white/15 text-white"
              : isCompleted ? "bg-[#5E2F88] text-white" : 
            isActive ? "bg-[#581E83] text-white" : 
            "bg-[#e8e8e8] text-[#464646]"
          )}>
            {isCompleted ? <Check className="w-4 h-4" /> : 
             isLocked ? <Lock className="w-4 h-4" /> : 
             stepNumber}
          </div>
          <span className={cn(
            "text-lg font-medium min-w-0 truncate",
            isSummary
              ? "text-white"
              : isActive ? "text-[#581E83]" : "text-[#464646]"
          )}>
            {titleMobile ? (
              <>
                <span className="md:hidden">{titleMobile}</span>
                <span className="hidden md:inline">{title}</span>
              </>
            ) : (
              title
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerRight}
          <motion.div
            animate={{ rotate: isActive ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronDown className={cn(
              "w-5 h-5 transition-colors",
              isSummary
                ? "text-white/90"
                : isActive ? "text-[#5E2F88]" : "text-[#464646]"
            )} />
          </motion.div>
        </div>
      </button>
      
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'p-4 pt-0 md:p-6 md:pt-0',
                isSummary ? 'bg-white text-black' : 'bg-white'
              )}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}