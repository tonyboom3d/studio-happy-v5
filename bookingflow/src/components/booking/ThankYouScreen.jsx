import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, Calendar, MapPin, Phone, Mail, Home, AlertCircle, Users, Package, TreeDeciduous, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

// מחירים לפי סוג כרטיס
const PRICING = {
  1: 340,
  2: 600,
  3: 795,
  4: 980
};

export default function ThankYouScreen({ booking, paymentStatus = 'Successful', onGoHome }) {
  // Pending = התשלום טרם אושר במלואו
  const isPendingPayment = paymentStatus === 'Pending';

  // האם ה-booking הגיע מ-eCommerce checkout (ORDER_CONFIRMED)
  const isFromEcomOrder = booking?._fromOrder === true;
  
  // חישוב פירוט מחירים (רלוונטי רק כשיש נתוני booking מלאים מה-UI)
  const participants = booking?.participants || 1;
  const woodType = booking?.wood_type || 'recycled';
  const totalMeetings = booking?.total_sessions || 1;
  const basePricePerSession = PRICING[participants] || 340;
  const basePriceTotal = basePricePerSession * totalMeetings;
  
  // מחיר מוצרים מהקטלוג — בעץ ממוחזר לא מתווסף לסה"כ (כלול במחיר המפגשים)
  const catalogProductsSum = (booking?.products || []).reduce((sum, p) => {
    const qty = p.quantity || 1;
    return sum + (p.price || 0) * qty;
  }, 0);

  const woodExtra = woodType === 'new' ? Math.round(catalogProductsSum * 0.2) : 0;
  const productsCharged = woodType === 'recycled' ? 0 : catalogProductsSum;
  const totalPrice = isFromEcomOrder
    ? (booking?.orderTotal || 0)
    : (basePriceTotal + productsCharged + woodExtra);
  const addToGoogleCalendar = () => {
    const firstSlot = booking.selected_slots?.[0];
    if (!firstSlot) return;
    
    const date = new Date(firstSlot.date);
    const startDate = format(date, "yyyyMMdd'T'HHmmss");
    const endDate = format(new Date(date.getTime() + 2 * 60 * 60 * 1000), "yyyyMMdd'T'HHmmss");
    
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('סדנת נגרות - הנגריה הפתוחה')}&dates=${startDate}/${endDate}&details=${encodeURIComponent('סדנת נגרות בהנגריה הפתוחה')}&location=${encodeURIComponent('הנגריה הפתוחה, דרך שלמה (סלמה) 19, תל אביב-יפו')}`;
    
    window.open(url, '_blank');
  };

  const generateICS = () => {
    const firstSlot = booking.selected_slots?.[0];
    if (!firstSlot) return;
    
    const date = new Date(firstSlot.date);
    const startDate = format(date, "yyyyMMdd'T'HHmmss");
    const endDate = format(new Date(date.getTime() + 2 * 60 * 60 * 1000), "yyyyMMdd'T'HHmmss");
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:סדנת נגרות - הנגריה הפתוחה
DESCRIPTION:סדנת נגרות בהנגריה הפתוחה
LOCATION:הנגריה הפתוחה, דרך שלמה (סלמה) 19, תל אביב-יפו
END:VEVENT
END:VCALENDAR`;
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workshop.ics';
    a.click();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-white to-[#fafafa]"
    >
      {/* אייקון הצלחה */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="w-24 h-24 rounded-full bg-[#5E2F88] flex items-center justify-center mb-6 shadow-lg"
      >
        <Check className="w-12 h-12 text-white" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-3xl font-bold text-[#581E83] mb-2"
      >
        תודה רבה!
      </motion.h1>
      
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-lg text-[#464646] mb-4 text-center"
      >
        ההזמנה שלך התקבלה בהצלחה. נתראה בנגריה!
      </motion.p>

      {/* הערה כתומה - תשלום ממתין לאישור */}
      {isPendingPayment && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="w-full max-w-md bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-right">
            <p className="text-sm font-medium text-orange-700">
              התשלום טרם אושר במלואו
            </p>
            <p className="text-xs text-orange-600 mt-1">
              ההזמנה נרשמה במערכת. נעדכן אותך ברגע שהתשלום יאושר על ידי חברת האשראי.
            </p>
          </div>
        </motion.div>
      )}

      {/* סיכום הזמנה */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-[#581E83] mb-4 border-b border-[#e8e8e8] pb-2">
          סיכום הזמנה
        </h2>

        {/* מספר הזמנה — מוצג כשיש נתוני eCommerce order */}
        {isFromEcomOrder && booking?.orderNumber && (
          <div className="mb-4 text-sm text-[#464646]/70 text-right">
            מספר הזמנה: <span className="font-medium text-[#581E83]">#{booking.orderNumber}</span>
          </div>
        )}

        {/* כמות משתתפים */}
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-5 h-5 text-[#5E2F88]" />
            <span className="font-medium text-[#464646]">
              {participants === 1 ? 'יחיד' : participants === 2 ? 'זוגי' : participants === 3 ? 'שלישייה' : 'רביעייה'}
            </span>
            <span className="text-[#464646]/60">
              ({participants} {participants === 1 ? 'משתתף' : 'משתתפים'})
            </span>
          </div>
        </div>

        {/* מוצרים */}
        {booking.products?.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-[#464646] mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#5E2F88]" />
              מה נבנה:
            </h3>
            <ul className="space-y-1 mr-6">
              {booking.products.map((product, idx) => (
                <li key={idx} className="text-sm text-[#464646]/80">
                  • {product.title} {product.quantity > 1 && `(×${product.quantity})`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* תאריכים */}
        {booking.selected_slots?.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-[#464646] mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#5E2F88]" />
              מועדים:
            </h3>
            <ul className="space-y-1 mr-6">
              {booking.selected_slots.map((slot, idx) => (
                <li key={idx} className="text-sm text-[#464646]/80">
                  {format(new Date(slot.date), 'EEEE d/M', { locale: he })} בשעה {slot.time}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* פירוט מחיר */}
        <div className="mb-4 pt-4 border-t border-[#e8e8e8]">
          <h3 className="text-sm font-medium text-[#464646] mb-3 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#5E2F88]" />
            פירוט תשלום:
          </h3>
          <div className="space-y-2 mr-6">
            {/* מחיר בסיס */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#464646]/80">
                {totalMeetings > 1 
                  ? `${totalMeetings} מפגשים × ₪${basePricePerSession}`
                  : `מפגש יחיד`
                }
              </span>
              <span className="font-medium text-[#464646]">₪{basePriceTotal}</span>
            </div>
            
            {/* מוצרים */}
            {catalogProductsSum > 0 && (
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-[#464646]/80">מוצרים</span>
                  {woodType === 'recycled' && (
                    <span className="text-xs text-[#5E2F88]">(עץ ממוחזר)</span>
                  )}
                </div>
                <span className="font-medium text-[#464646]">
                  {woodType === 'recycled' ? 'כלול במחיר' : `₪${catalogProductsSum}`}
                </span>
              </div>
            )}
            
            {/* תוספת עץ חדש */}
            {woodExtra > 0 && (
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-1">
                  <TreeDeciduous className="w-3 h-3 text-[#581E83]" />
                  <span className="text-[#464646]/80">תוספת עץ חדש (20%)</span>
                </div>
                <span className="font-medium text-[#464646]">₪{woodExtra.toFixed(0)}</span>
              </div>
            )}
            
            {/* סה"כ */}
            <div className="flex justify-between items-center pt-2 border-t border-[#e8e8e8]">
              <span className="font-semibold text-[#581E83]">סה"כ</span>
              <span className="font-bold text-lg text-[#5E2F88]">₪{totalPrice}</span>
            </div>
          </div>
        </div>

        {/* פרטי קשר */}
        <div className="pt-4 border-t border-[#e8e8e8] space-y-2">
        <div className="flex items-center gap-2 text-sm text-[#464646]">
          <MapPin className="w-4 h-4 text-[#5E2F88]" />
          <span>הנגריה הפתוחה, דרך שלמה (סלמה) 19, תל אביב-יפו</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#464646]">
          <Phone className="w-4 h-4 text-[#5E2F88]" />
          <span dir="ltr">055-721-9327</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#464646]">
          <Mail className="w-4 h-4 text-[#5E2F88]" />
          <span>Noam.r89@gmail.com</span>
        </div>
        </div>
      </motion.div>

      {/* כפתורי פעולה */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap gap-3 justify-center"
      >
        <Button
          variant="outline"
          onClick={addToGoogleCalendar}
          className="flex items-center gap-2 border-[#5E2F88] text-[#581E83]"
        >
          <Calendar className="w-4 h-4" />
          הוספה ל-Google Calendar
        </Button>
        <Button
          variant="outline"
          onClick={generateICS}
          className="flex items-center gap-2 border-[#5E2F88] text-[#581E83]"
        >
          <Calendar className="w-4 h-4" />
          הוספה ל-Apple Calendar
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-8"
      >
        <Button
          onClick={onGoHome}
          className="bg-[#5E2F88] hover:bg-[#7B3DB0] text-white px-8"
        >
          <Home className="w-4 h-4 ml-2" />
          חזרה לדף הבית
        </Button>
      </motion.div>
    </motion.div>
  );
}