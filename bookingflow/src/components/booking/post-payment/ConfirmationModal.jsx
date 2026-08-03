import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, AlertCircle, Loader2 } from 'lucide-react';

const DELAY_KEY = 'sketch_confirm_delay_done';

export default function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  sketchTitle,
  deadlineAt,
  requireName,
  existingName,
  isFinal = false,
  skipNameStep = false,
  initialStep = 'size',
  size90Disabled = false,
}) {
  const [step, setStep] = useState(initialStep);
  const [selectedSize, setSelectedSize] = useState(null);
  const [participantName, setParticipantName] = useState(existingName || '');
  const [countdown, setCountdown] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState('');
  const [deadlineError, setDeadlineError] = useState(false);
  const hasDelayedRef = useRef(false);

  useEffect(() => {
    try { hasDelayedRef.current = sessionStorage.getItem(DELAY_KEY) === '1'; } catch (_) {}
  }, []);

  useEffect(() => {
    if (!open) {
      setStep(initialStep);
      setSelectedSize(null);
      setParticipantName(existingName || '');
      setCountdown(0);
      setConfirmed(false);
      setSaving(false);
      setSaveError(false);
      setSaveErrorMessage('');
      setDeadlineError(false);
    }
  }, [open, existingName, initialStep]);

  useEffect(() => {
    if (step !== 'confirm') return;
    setCountdown(hasDelayedRef.current ? 0 : 3);
  }, [step]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const isExpired = deadlineAt && new Date(deadlineAt) < new Date();
  const nameValid = !requireName || participantName.trim().length >= 2;

  const handleSizeSelect = (size) => {
    if (size === '90x90' && size90Disabled) return;
    setSelectedSize(size);
    setStep((requireName && !skipNameStep) ? 'name' : 'confirm');
  };

  const handleNameNext = () => {
    if (nameValid) setStep('confirm');
  };

  const handleConfirm = async () => {
    if (isExpired) { setDeadlineError(true); return; }
    if (saving) return;
    setSaveError(false);
    setSaveErrorMessage('');
    setSaving(true);
    try {
      await onConfirm(
        selectedSize,
        (requireName && !skipNameStep) ? participantName.trim() : null
      );
      setConfirmed(true);
      if (!hasDelayedRef.current) {
        hasDelayedRef.current = true;
        try { sessionStorage.setItem(DELAY_KEY, '1'); } catch (_) {}
      }
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.startsWith('SESSION_SKETCH_90_SOLD_OUT')) {
        setSaveErrorMessage('כל הסקיצות בגודל 90×90 לסדנה זו נתפסו. ניתן לבחור בגודל 60×60.');
      }
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto" dir="rtl">
        <div className="flex flex-col items-center text-center p-2">
          {deadlineError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 w-full mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 text-right">המועד האחרון חלף. לא ניתן לשמור.</p>
            </div>
          )}

          {saving && (
            <>
              <div className="w-12 h-12 rounded-full bg-[#f5f0fa] flex items-center justify-center mb-3">
                <Loader2 className="w-6 h-6 text-[#5E2F88] animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-[#581E83] mb-2">שומר את הבחירה...</h3>
              <p className="text-sm text-[#464646]/70">אנא המתינו עד שהשמירה תושלם</p>
            </>
          )}

          {saveError && !saving && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 w-full mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 text-right">{saveErrorMessage || 'השמירה נכשלה. נסו שוב.'}</p>
            </div>
          )}

          {confirmed && !saving && (
            <>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-[#581E83] mb-2">
                {selectedSize === '90x90' ? 'הבחירה נרשמה' : 'הבחירה נשמרה!'}
              </h3>
              <p className="text-sm text-[#464646]/70">
                {selectedSize === '90x90'
                  ? 'הסקיצה נרשמה — יש להשלים תשלום כדי לשמור את הבחירה.'
                  : 'הסקיצה נבחרה בהצלחה. ניתן לסגור חלון זה.'}
              </p>
            </>
          )}

          {!confirmed && !saving && step === 'size' && (
            <>
              <h3 className="text-lg font-bold text-[#581E83] mb-1">בחירת גודל שטיח</h3>
              <p className="text-sm text-[#464646]/70 mb-4">{sketchTitle}</p>
              <div className="w-full space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleSizeSelect('60x60')}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-[#e8e8e8] bg-white hover:border-[#5E2F88] hover:bg-[#f5f0fa] transition-all text-right"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#f5f0fa] flex items-center justify-center shrink-0 text-sm font-bold text-[#5E2F88]">60</div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-[#581E83]">60×60 ס״מ</p>
                    <p className="text-xs text-green-600 font-medium">כלול במחיר</p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={size90Disabled}
                  onClick={() => handleSizeSelect('90x90')}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-right ${
                    size90Disabled
                      ? 'border-[#e8e8e8] bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-[#e8e8e8] bg-white hover:border-orange-400 hover:bg-orange-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 text-sm font-bold text-orange-700">90</div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-[#581E83]">90×90 ס״מ</p>
                    <p className="text-xs text-orange-600 font-medium">
                      {size90Disabled ? 'אין מקום פנוי בסדנה זו' : 'תוספת ₪299'}
                    </p>
                  </div>
                </button>
              </div>
            </>
          )}

          {!confirmed && !saving && step === 'name' && (
            <>
              <h3 className="text-lg font-bold text-[#581E83] mb-1">שם המשתתף/קבוצה</h3>
              <p className="text-sm text-[#464646]/70 mb-4">הזינו שם לזיהוי בחירה זו</p>
              <input
                type="text"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="שם (לפחות 2 תווים)"
                className="w-full border-2 border-[#e8e8e8] focus:border-[#5E2F88] rounded-xl px-4 py-3 text-sm text-[#464646] outline-none transition-colors mb-4"
                autoFocus
              />
              <div className="flex gap-3 w-full">
                <Button variant="outline" onClick={() => setStep('size')} className="flex-1 border-[#e8e8e8]">חזרה</Button>
                <Button onClick={handleNameNext} disabled={!nameValid} className="flex-1 bg-[#5E2F88] hover:bg-[#7B3DB0] text-white">המשך</Button>
              </div>
            </>
          )}

          {!confirmed && !saving && step === 'confirm' && (
            <>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isFinal ? 'bg-orange-100' : 'bg-[#f5f0fa]'}`}>
                {isFinal ? <AlertTriangle className="w-6 h-6 text-orange-600" /> : <Check className="w-6 h-6 text-[#5E2F88]" />}
              </div>
              <h3 className="text-lg font-bold text-[#581E83] mb-2">אישור בחירת סקיצה</h3>
              <div className="bg-[#fafafa] rounded-xl p-3 w-full mb-3">
                <p className="text-sm font-medium text-[#581E83]">{sketchTitle}</p>
                <p className="text-xs text-[#464646]/60 mt-1" dir="rtl">
                  {selectedSize === '90x90' ? 'גודל: 90*90 ס"מ | תוספת: 299 ש"ח' : 'גודל: 60*60 ס"מ'}
                </p>
                {requireName && participantName && (
                  <p className="text-xs text-[#464646]/60 mt-0.5">משתתף: {participantName}</p>
                )}
              </div>
              {isFinal ? (
                <p className="text-sm text-orange-700 mb-4">המועד האחרון לשינוי בחירה מתקרב. לאחר האישור הבחירה תהיה <strong>סופית ולא ניתנת לשינוי</strong>.</p>
              ) : (
                <p className="text-sm text-[#464646]/70 mb-4">
                  {selectedSize === '90x90' ? 'הבחירה תישמר רק לאחר השלמת תשלום התוספת.' : 'ניתן לשנות את בחירתכם עד למועד האחרון שנקבע לעריכה.'}
                </p>
              )}
              <div className="flex gap-3 w-full">
                <Button variant="outline" onClick={onClose} className="flex-1 border-[#e8e8e8]">ביטול</Button>
                <Button onClick={handleConfirm} disabled={countdown > 0 || saving} className="flex-1 bg-[#5E2F88] hover:bg-[#7B3DB0] text-white">
                  {countdown > 0 ? `אישור (${countdown})` : 'אישור'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
