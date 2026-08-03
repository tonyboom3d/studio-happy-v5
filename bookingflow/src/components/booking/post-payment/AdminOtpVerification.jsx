import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, Phone, Loader2, MessageCircle, KeyRound, Send } from 'lucide-react';

const MAX_RESEND_ATTEMPTS = 4;
const COOLDOWN_SECONDS = 60;
const SUPPORT_WHATSAPP = 'https://wa.me/972525550123';

export default function AdminOtpVerification({ orderId, onSendMessage, onVerified }) {
  const [step, setStep] = useState('phone'); // phone | otp
  const [phone, setPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCount, setResendCount] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);
  const inputRefs = useRef([]);

  const sendAndWait = useCallback((type, data) => {
    return new Promise((resolve) => {
      onSendMessage(type, data, resolve);
    });
  }, [onSendMessage]);

  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(cooldownRef.current);
    }
  }, [cooldown]);

  const handleSubmitPhone = async () => {
    if (!phone.trim()) {
      setError('יש להזין מספר טלפון');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await sendAndWait('INITIATE_ADMIN_OTP', { orderId, phone: phone.trim() });
      if (result.success) {
        setMaskedPhone(result.maskedPhone || '');
        setStep('otp');
        setCooldown(COOLDOWN_SECONDS);
      } else if (result.reason === 'phone_mismatch') {
        setError('מספר הטלפון לא תואם את מספר הטלפון של מנהל ההזמנה');
      } else if (result.reason === 'order_not_found') {
        setError('ההזמנה לא נמצאה');
      } else {
        setError('אירעה שגיאה, נסו שוב');
      }
    } catch {
      setError('אירעה שגיאה, נסו שוב');
    }
    setLoading(false);
  };

  const handleVerifyCode = async (codeValue) => {
    const codeToVerify = codeValue || code;
    if (codeToVerify.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const result = await sendAndWait('VERIFY_ADMIN_OTP', { orderId, phone: phone.trim(), code: codeToVerify });
      if (result.valid) {
        onVerified(result.orderContext);
      } else if (result.reason === 'wrong_code') {
        setError('הקוד שהוזן שגוי');
      } else if (result.reason === 'expired') {
        setError('הקוד פג תוקף, שלחו קוד חדש');
      } else if (result.reason === 'too_many_attempts') {
        setError('יותר מדי ניסיונות, שלחו קוד חדש');
      } else {
        setError('אירעה שגיאה, נסו שוב');
      }
    } catch {
      setError('אירעה שגיאה, נסו שוב');
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (cooldown > 0 || resendCount >= MAX_RESEND_ATTEMPTS) return;
    setLoading(true);
    setError('');
    try {
      const result = await sendAndWait('INITIATE_ADMIN_OTP', { orderId, phone: phone.trim() });
      if (result.success) {
        setResendCount((prev) => prev + 1);
        setCooldown(COOLDOWN_SECONDS);
        setCode('');
        setError('');
      } else {
        setError('לא ניתן לשלוח קוד נוסף');
      }
    } catch {
      setError('שגיאה בשליחת קוד');
    }
    setLoading(false);
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const newCode = code.split('');
    while (newCode.length < 6) newCode.push('');
    newCode[index] = value;
    const joined = newCode.join('');
    setCode(joined);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (joined.length === 6 && !joined.includes('')) {
      handleVerifyCode(joined);
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      setCode(pasted);
      const lastIdx = Math.min(pasted.length, 5);
      inputRefs.current[lastIdx]?.focus();
      if (pasted.length === 6) {
        handleVerifyCode(pasted);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-white">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-6 space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7 text-[#5E2F88]" />
            </div>
            <h2 className="text-xl font-bold text-[#581E83]">אימות ניהול הזמנה</h2>
            <p className="text-sm text-[#464646]/60">
              {step === 'phone'
                ? 'הזינו את מספר הטלפון שלכם לצורך אימות'
                : `קוד אימות נשלח ל-${maskedPhone}`
              }
            </p>
          </div>

          {step === 'phone' && (
            <div className="space-y-4">
              <div className="relative">
                <Phone className="w-4 h-4 text-[#5E2F88] absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitPhone()}
                  placeholder="050-1234567"
                  dir="ltr"
                  className="w-full h-11 pr-10 pl-4 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-[#5E2F88] transition-all text-center"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500 text-center">{error}</p>
              )}

              <button
                onClick={handleSubmitPhone}
                disabled={loading || !phone.trim()}
                className="w-full h-11 bg-[#5E2F88] hover:bg-[#4a2570] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    שלחו לי קוד אימות
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-4">
              {/* OTP inputs */}
              <div className="flex justify-center gap-2" dir="ltr" onPaste={handleCodePaste}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={code[i] || ''}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="w-11 h-12 text-center text-lg font-bold border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-[#5E2F88] transition-all"
                  />
                ))}
              </div>

              {error && (
                <p className="text-xs text-red-500 text-center">{error}</p>
              )}

              <button
                onClick={() => handleVerifyCode()}
                disabled={loading || code.length < 4}
                className="w-full h-11 bg-[#5E2F88] hover:bg-[#4a2570] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    אימות
                  </>
                )}
              </button>

              {/* Resend */}
              <div className="text-center">
                {resendCount >= MAX_RESEND_ATTEMPTS ? (
                  <p className="text-xs text-[#464646]/50">הגעתם למקסימום ניסיונות שליחה</p>
                ) : cooldown > 0 ? (
                  <p className="text-xs text-[#464646]/50">
                    שליחה חוזרת בעוד <span className="font-bold text-[#5E2F88]">{cooldown}</span> שניות
                  </p>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    className="text-xs text-[#5E2F88] hover:underline font-medium disabled:opacity-50"
                  >
                    שלחו קוד חדש ({MAX_RESEND_ATTEMPTS - resendCount} ניסיונות נותרו)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Support link */}
          <div className="text-center pt-2 border-t border-gray-100">
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-medium"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              נתקלתם בבעיה? דברו איתנו בוואטסאפ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
