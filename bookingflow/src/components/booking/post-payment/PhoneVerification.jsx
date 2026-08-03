import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 && digits.startsWith('05');
}

export default function PhoneVerification({ onVerified, isVerifying }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);

  const handleChange = (value) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
    setPhone(digitsOnly);
    setError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validatePhone(phone)) {
      setError('הזן מספר ישראלי בן 10 ספרות שמתחיל ב-05');
      return;
    }
    onVerified(phone);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[60vh] flex flex-col items-center justify-center p-6"
      dir="rtl"
    >
      <div className="w-16 h-16 rounded-full bg-[#f5f0fa] flex items-center justify-center mb-4">
        <ShieldCheck className="w-8 h-8 text-[#5E2F88]" />
      </div>

      <h2 className="text-xl font-bold text-[#581E83] mb-2">אימות מספר טלפון</h2>
      <p className="text-sm text-[#464646]/70 mb-6 text-center max-w-sm">
        הזן את מספר הטלפון שהוגדר עבורך בהזמנה כדי לגשת לבחירת הסקיצה
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <div className="relative">
            <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E2F88]" />
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="05X-XXXXXXX"
              dir="ltr"
              className={`w-full rounded-xl border-2 py-3 pr-10 pl-4 text-left text-lg tracking-wider
                ${error ? 'border-red-300 focus:border-red-400' : 'border-[#e8e8e8] focus:border-[#5E2F88]'}
                focus:outline-none transition-colors`}
            />
          </div>
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isVerifying || !phone}
          className="w-full bg-[#5E2F88] hover:bg-[#7B3DB0] text-white py-3 text-base"
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              מאמת...
            </>
          ) : (
            'כניסה'
          )}
        </Button>
      </form>
    </motion.div>
  );
}
