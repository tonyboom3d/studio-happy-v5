import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Palette, Users, Clock, Info } from 'lucide-react';
import { getPreBookingPolicyHighlight } from '@/lib/sketchEditingPolicy';

export default function SketchInfoSection({ onContinue, selectedSlot }) {
  const policyHighlight = useMemo(
    () => getPreBookingPolicyHighlight(selectedSlot?.start?.timestamp),
    [selectedSlot?.start?.timestamp]
  );

  return (
    <div className="flex flex-col py-6 px-2" dir="rtl">
      <div className="max-w-sm mx-auto w-full space-y-5">
        {/* אייקון ראשי */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-[#f5f0fa] flex items-center justify-center">
            <Palette className="w-7 h-7 text-[#5E2F88]" />
          </div>
        </div>

        <p className="text-sm text-[#464646] text-center leading-relaxed">
          לאחר התשלום תוכלו לבחור סקיצה ממגוון הסקיצות שלנו או להעלות סקיצה משלכם.
        </p>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex items-start gap-3 bg-[#f5f0fa] rounded-xl p-3">
              <Users className="w-5 h-5 text-[#5E2F88] mt-0.5 shrink-0" />
              <p className="text-sm text-[#464646] leading-relaxed">
                מגיעים כקבוצה? תוכלו לשלוח <strong className="text-[#581E83]">קישור אישי</strong> לכל
                משתתף כדי שיבחר את הסקיצה שלו בעצמו.
              </p>
            </div>

            <div className="flex-1 flex items-start gap-3 bg-[#f5f0fa] rounded-xl p-3">
              <Info className="w-5 h-5 text-[#5E2F88] mt-0.5 shrink-0" />
              <p className="text-sm text-[#464646] leading-relaxed">
                בתור מזמין הסדנה, באפשרותכם גם לבחור סקיצות עבור שאר המשתתפים.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[#fff8e1] rounded-xl p-3">
            <Clock className="w-5 h-5 text-[#F59E0B] mt-0.5 shrink-0" />
            <p className="text-sm text-[#464646] leading-relaxed">
              {policyHighlight ? (
                <>
                  ניתן לבחור ולשנות סקיצות{' '}
                  <strong className="text-[#581E83]">{policyHighlight}</strong>.
                </>
              ) : (
                'ניתן לבחור ולשנות סקיצות לאחר התשלום בהתאם למדיניות הזמנים שלנו.'
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-8">
        <Button
          type="button"
          onClick={onContinue}
          className="bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8 py-3 text-base rounded-lg transition-all"
        >
          המשך
        </Button>
      </div>
    </div>
  );
}
