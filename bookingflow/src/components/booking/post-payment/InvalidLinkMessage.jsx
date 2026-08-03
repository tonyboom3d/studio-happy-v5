import React from 'react';
import { motion } from 'framer-motion';
import { LinkIcon, Mail, MessageCircle, RefreshCw } from 'lucide-react';

const SUPPORT_WHATSAPP = 'https://api.whatsapp.com/send?phone=972522272270';

export default function InvalidLinkMessage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[60vh] flex flex-col items-center justify-center p-6"
      dir="rtl"
    >
      <div className="w-16 h-16 rounded-full bg-[#fef3cd] flex items-center justify-center mb-4">
        <LinkIcon className="w-8 h-8 text-[#856404]" />
      </div>

      <h2 className="text-xl font-bold text-[#581E83] mb-2">
        הקישור אינו תקף
      </h2>
      <p className="text-sm text-[#464646]/70 text-center max-w-sm mb-6 leading-relaxed">
        נראה שהגעת לקישור הזה בטעות, או שפג תוקפו.
        <br />
        אם הזמנת סדנה, נשלח לך קישור עם סיכום ההזמנה ובחירת הסקיצות דרך:
      </p>

      <div className="flex gap-4 text-sm text-[#464646]/70 mb-6">
        <div className="flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-[#5E2F88]" />
          <span>אימייל</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4 text-[#25D366]" />
          <span>וואטסאפ</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 bg-[#5E2F88] hover:bg-[#4a2570] text-white font-medium py-2.5 px-5 rounded-xl text-sm transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          נסו לרענן את הדף
        </button>
        <a
          href={SUPPORT_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5b] text-white font-medium py-2.5 px-5 rounded-xl text-sm transition-colors shadow-sm"
        >
          <MessageCircle className="w-4 h-4" />
          פנייה לשירות הלקוחות
        </a>
      </div>

      <p className="text-xs text-[#464646]/50 mt-6 text-center max-w-xs">
        אם יש לך שאלות, ניתן ליצור קשר עם סטודיו האפי
      </p>
    </motion.div>
  );
}
