import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, Recycle, TreeDeciduous } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function WoodTypeSection({ woodType, setWoodType, onContinue }) {
  const options = [
    {
      id: 'recycled',
      title: 'עץ ממוחזר',
      subtitle: 'כלול במחיר',
      icon: Recycle,
      description: 'עץ שעבר חיים קודמים - ייחודי ומיוחד'
    },
    {
      id: 'new',
      title: 'עץ חדש',
      subtitle: 'בתוספת תשלום',
      icon: TreeDeciduous,
      description: 'עץ חדש באיכות גבוהה'
    }
  ];

  return (
    <div className="py-4" dir="rtl">
      {/* הנחייה */}
      <div className="text-right mb-2">
        <p className="text-sm text-[#464646]/70">בחרו סוג עץ</p>
      </div>

      {/* הסבר על ההבדלים */}
      <div className="mb-4 p-3 bg-[#f5f5f5] rounded-lg md:mb-6 md:p-4 md:rounded-xl">
        <h3 className="text-sm font-semibold text-[#581E83] mb-2 md:text-base md:mb-3">מה ההבדל בין סוגי העצים?</h3>
        <div className="space-y-2 text-xs text-[#464646] md:text-sm">
          <div>
            <span className="font-medium text-[#581E83]">עץ ממוחזר:</span>
            <p className="mt-0.5 leading-snug">עצים מפורקים ממשטחי העמסה (פלטות). עלותו העץ נמוכה אך הוא מחייב זמן עבודה נוסף של הכנה ושיוף.</p>
          </div>
          <div>
            <span className="font-medium text-[#581E83]">עץ חדש:</span>
            <p className="mt-0.5 leading-snug">עץ מוכן לעבודה, המאפשר הספקים מהירים. עלות העץ היא בתוספת לתשלום על הסדנה.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
        {options.map((option) => {
          const isSelected = woodType === option.id;
          const Icon = option.icon;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setWoodType(option.id)}
              className={cn(
                "relative rounded-xl border-2 text-right",
                "p-3 md:p-6",
                isSelected
                  ? "border-[#5E2F88] bg-[#5E2F88]/5"
                  : "border-[#e8e8e8] hover:border-[#5E2F88]/50 bg-white"
              )}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 left-2 md:top-3 md:left-3 w-5 h-5 md:w-6 md:h-6 rounded-full bg-[#5E2F88] flex items-center justify-center"
                >
                  <Check className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                </motion.div>
              )}

              {/* מובייל: שורה אחת — אייקון מימין, טקסטים משמאל; דסקטופ: מרכז */}
              <div className="flex w-full flex-row items-center gap-3 text-right md:flex-col md:items-center md:text-center md:gap-3">
                <div className={cn(
                  "shrink-0 rounded-full flex items-center justify-center transition-colors",
                  "h-11 w-11 md:h-14 md:w-14",
                  isSelected ? "bg-[#5E2F88] text-white" : "bg-[#f5f5f5] text-[#581E83]"
                )}>
                  <Icon className="h-6 w-6 md:h-7 md:w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-tight text-[#581E83] md:text-lg">{option.title}</h3>
                  <p
                    className={cn(
                      "mt-0.5 text-xs font-medium leading-none md:mt-1 md:text-sm",
                      option.id === 'recycled' ? "text-[#5E2F88]" : "text-[#464646]",
                      "whitespace-nowrap"
                    )}
                  >
                    {option.subtitle}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-[#464646]/70 md:mt-2 md:text-sm">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-center md:mt-8">
        <div>
          <Button
            onClick={onContinue}
            disabled={!woodType}
            className="shadow-none animate-none bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8 py-3 rounded-lg
                       transition-colors duration-150 text-lg disabled:opacity-50"
          >
            המשך לבחירת מוצרים
          </Button>
        </div>
      </div>
    </div>
  );
}