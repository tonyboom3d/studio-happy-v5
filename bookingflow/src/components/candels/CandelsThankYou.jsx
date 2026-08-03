import React, { useState, useMemo } from 'react';
import {
  Check, Calendar, MapPin, UserCheck, CreditCard, Tag, CalendarPlus,
  HelpCircle, X, ExternalLink, MessageCircle, Flame, ListOrdered, ChevronDown, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

// Summary-only Thank You view for candles ("סדנת נרות") orders — order
// details + selected cups + total, WhatsApp confirmation note, and a
// contact/support popup. No sketch selection, no group/self-selection.
export default function CandelsThankYou({
  order,
  ecomSummary,
  orderHistory,
  selectedProducts = [],
  onSwitchOrder,
  isSwitchingOrder,
}) {
  const [contactOpen, setContactOpen] = useState(false);
  const [orderSwitcherOpen, setOrderSwitcherOpen] = useState(false);

  const workshopDate = order?.workshopStart
    ? format(new Date(order.workshopStart), 'EEEE, d בMMMM yyyy', { locale: he })
    : null;
  const workshopStartTime = order?.workshopStart
    ? format(new Date(order.workshopStart), 'HH:mm')
    : null;
  const workshopEndTime = order?.workshopStart
    ? format(new Date(new Date(order.workshopStart).getTime() + 2 * 60 * 60 * 1000), 'HH:mm')
    : null;

  const displayAddress = 'הדובדבן 7, קריית אונו - קומה 3';

  const organizerPhone = order?.organizerPhone || ecomSummary?.buyerPhone || '';
  const formatPhone = (phone) => {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return phone;
  };

  const whatsappText = encodeURIComponent(
    `שלום! ביצעתי הרגע הזמנה לסדנת נרות על שם ${ecomSummary?.buyerName || ''}, מספר ההזמנה שלי הוא ${ecomSummary?.orderNumber || ''}`
  );
  const whatsappUrl = `https://api.whatsapp.com/send?phone=972522272270&text=${whatsappText}`;

  const calendarUrl = useMemo(() => {
    if (!order?.workshopStart) return null;
    const start = new Date(order.workshopStart);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const title = encodeURIComponent(ecomSummary?.workshopName || 'סדנת נרות - סטודיו האפי');
    const location = encodeURIComponent(displayAddress);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${location}`;
  }, [order, ecomSummary]);

  const hasCoupon = !!ecomSummary?.coupon;
  const hasDiscount = ecomSummary?.discount > 0;

  const rugCount = order?.rugCount || 0;
  const totalCupsQty = selectedProducts.reduce((sum, c) => sum + (Number(c.quantity) || 1), 0);

  if (!order) return null;

  return (
    <div className="py-3 space-y-3" dir="rtl">
      {/* Order header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center gap-2.5 text-center"
      >
        <div className="w-9 h-9 rounded-full bg-[#5E2F88] flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-white" />
        </div>
        <div className="text-right">
          <h1 className="text-[22px] font-bold text-[#581E83] leading-tight">ההזמנה בוצעה בהצלחה!</h1>
          <p className="text-[15px] text-[#464646]/60 leading-tight">
            סדנת נרות
            {ecomSummary?.orderNumber && ` · הזמנה ${ecomSummary.orderNumber}`}
          </p>
          {organizerPhone && (
            <p className="text-[13px] text-green-700 flex items-center gap-1 mt-1">
              <MessageCircle className="w-3.5 h-3.5 shrink-0 text-green-600" />
              <span className="truncate">
                פרטי ההזמנה נשלחו אליך בוואטסאפ ל-
                <span className="font-semibold" dir="ltr">{formatPhone(organizerPhone)}</span>
              </span>
            </p>
          )}
        </div>
      </motion.div>

      {/* "My orders" switcher — only shown when the buyer has other paid orders */}
      {orderHistory?.length > 0 && (
        <div className="relative flex justify-center">
          <button
            type="button"
            onClick={() => setOrderSwitcherOpen((v) => !v)}
            disabled={isSwitchingOrder}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#5E2F88] hover:text-[#7B3DB0] bg-[#f5f0fa] border border-[#5E2F88]/20 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            {isSwitchingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListOrdered className="w-3.5 h-3.5" />}
            ההזמנות שלי ({orderHistory.length + 1})
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${orderSwitcherOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {orderSwitcherOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-full mt-2 z-30 w-72 bg-white rounded-xl border border-[#e8e8e8] shadow-lg overflow-hidden"
              >
                <div className="px-3 py-2 bg-[#5E2F88] text-white text-[13px] font-semibold flex items-center justify-between">
                  <span>הזמנה נוכחית</span>
                  {ecomSummary?.orderNumber && <span dir="ltr">#{ecomSummary.orderNumber}</span>}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-[#e8e8e8]">
                  {orderHistory.map((h) => (
                    <button
                      key={h._id}
                      type="button"
                      onClick={() => { setOrderSwitcherOpen(false); onSwitchOrder && onSwitchOrder(h._id); }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right hover:bg-[#f5f0fa] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[#581E83] truncate">
                          {h.orderNumber ? `הזמנה #${h.orderNumber}` : 'הזמנה'}
                        </p>
                        <p className="text-[12px] text-[#464646]/60">
                          {h.workshopStart ? format(new Date(h.workshopStart), 'd בMMMM yyyy', { locale: he }) : ''}
                        </p>
                      </div>
                      {h.paidTotal > 0 && (
                        <span className="text-[13px] font-semibold text-[#5E2F88] shrink-0">₪{h.paidTotal}</span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Order details card */}
      <div className="bg-white rounded-2xl border border-[#e8e8e8] p-3.5 shadow-sm space-y-2.5">
        <h3 className="text-lg font-bold text-[#581E83] leading-snug">
          {ecomSummary?.workshopName || 'סדנת נרות'}
        </h3>
        {workshopDate && (
          <div className="flex items-start gap-1.5 text-[15px] text-[#464646]">
            <Calendar className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
            <span>
              {workshopDate}
              {workshopStartTime && (
                <span className="text-[#5E2F88] font-medium mr-1.5">
                  בשעה {workshopStartTime}{workshopEndTime && ` - ${workshopEndTime}`}
                </span>
              )}
            </span>
          </div>
        )}
        <div className="flex items-start gap-1.5 text-[15px] text-[#464646]">
          <MapPin className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
          <span>{displayAddress}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[15px] text-[#464646]">
          <UserCheck className="w-4 h-4 text-[#5E2F88] shrink-0" />
          <span>
            {order.adults || 0} {order.adults === 1 ? 'מבוגר' : 'מבוגרים'}
            {order.children > 0 && ` + ${order.children} ${order.children === 1 ? 'ילד' : 'ילדים'}`}
            {' · '}
            <Flame className="w-3.5 h-3.5 inline-block text-[#5E2F88] -translate-y-0.5" /> {rugCount} {rugCount === 1 ? 'נר' : 'נרות'}
          </span>
        </div>

        {/* Selected cups */}
        {selectedProducts.length > 0 && (
          <div className="border-t border-[#e8e8e8] pt-2.5">
            <p className="text-[14px] font-semibold text-[#581E83] mb-2">
              {totalCupsQty === 1 ? 'הכוס שנבחרה' : 'הכוסות שנבחרו'} ({totalCupsQty})
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedProducts.map((cup, idx) => (
                <div
                  key={`${cup.productId}-${idx}`}
                  className="flex items-center gap-2 bg-[#f5f0fa] rounded-xl p-1.5 pr-2.5"
                >
                  {cup.image && (
                    <img
                      src={cup.image}
                      alt="כוס לנר"
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="text-[13px] text-[#464646]">
                    {(cup.quantity || 1) > 1 && <span className="font-medium">×{cup.quantity} </span>}
                    <span>{cup.price > 0 ? `+₪${cup.price}` : 'כלול במחיר'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Price — total only, with discount inline */}
        {ecomSummary && (
          <div className="border-t border-[#e8e8e8] pt-2 mt-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[15px] text-[#464646]">
              <CreditCard className="w-4 h-4 text-[#5E2F88]" />
              סה״כ שולם
              {(hasCoupon || hasDiscount) && (
                <span className="text-green-700 flex items-center gap-0.5">
                  <Tag className="w-3.5 h-3.5" />
                  {hasCoupon ? ecomSummary.coupon.code : 'הנחה'} -₪{ecomSummary.discount}
                </span>
              )}
            </span>
            <span className="text-xl font-bold text-[#581E83] tabular-nums">₪{ecomSummary.total}</span>
          </div>
        )}
      </div>

      {/* Calendar + Contact buttons side by side */}
      <div className="grid grid-cols-2 gap-2">
        {calendarUrl && (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-[#5E2F88] hover:bg-[#7B3DB0] text-white font-medium py-2.5 rounded-xl text-[14px] transition-colors"
          >
            <CalendarPlus className="w-4 h-4" />
            הוספה ליומן
          </a>
        )}
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="flex items-center justify-center gap-2 border-2 border-[#5E2F88] text-[#5E2F88] hover:bg-[#f5f0fa] font-medium py-2.5 rounded-xl text-[14px] transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          יש שאלה? צרו קשר
        </button>
      </div>

      {/* Contact popup */}
      <AnimatePresence>
        {contactOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setContactOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                className="absolute top-3 left-3 text-[#464646]/50 hover:text-[#464646] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center">
                <HelpCircle className="w-10 h-10 text-[#5E2F88] mx-auto mb-2" />
                <h3 className="text-[19px] font-bold text-[#581E83]">איך נוכל לעזור?</h3>
                <p className="text-[15px] text-[#464646]/70 mt-1">בחרו את הדרך הנוחה לכם</p>
              </div>

              <div className="space-y-3">
                <a
                  href="/faq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-[#5E2F88] bg-[#f5f0fa] hover:bg-[#ebe0f5] transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-full bg-[#5E2F88] flex items-center justify-center shrink-0">
                    <HelpCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[17px] font-semibold text-[#581E83]">שאלות נפוצות</span>
                      <span className="text-[11px] font-bold bg-[#5E2F88] text-white px-2 py-0.5 rounded-full">מומלץ</span>
                    </div>
                    <p className="text-[14px] text-[#464646]/60 mt-0.5">מצאו תשובות מהירות</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#5E2F88] shrink-0" />
                </a>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-[#e8e8e8] bg-white hover:border-green-400 hover:bg-green-50 transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[17px] font-semibold text-[#464646]">WhatsApp</span>
                    <p className="text-[14px] text-[#464646]/60 mt-0.5">שלחו לנו הודעה</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#464646]/40 shrink-0" />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
