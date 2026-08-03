import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';

const SUPPORT_WHATSAPP = 'https://api.whatsapp.com/send?phone=972522272270';

export default function OrderLoadError() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center px-6 py-10 text-center"
      dir="rtl"
    >
      <div className="w-14 h-14 rounded-full bg-[#fef3cd] flex items-center justify-center mb-3">
        <AlertTriangle className="w-7 h-7 text-[#856404]" />
      </div>

      <h2 className="text-lg font-bold text-[#581E83] mb-2">
        לא הצלחנו לטעון את פרטי ההזמנה
      </h2>
      <p className="text-sm text-[#464646]/75 max-w-sm leading-relaxed mb-1">
        ייתכן שאירעה שגיאה זמנית או שהקישור פג תוקף.
      </p>
      <p className="text-sm text-[#464646]/75 max-w-sm leading-relaxed mb-5">
        אל דאגה — פרטי ההזמנה המלאים נשלחו אליך בוואטסאפ.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3 mb-3">
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
    </motion.div>
  );
}
