import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, AlertTriangle, Users, Baby, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 && digits.startsWith('05');
}

function Stepper({ value, min, max, onChange, disabled }) {
  const canDec = value > min && !disabled;
  const canInc = value < max && !disabled;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => canDec && onChange(value - 1)}
        disabled={!canDec}
        className="w-7 h-7 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center text-[#581E83] hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="min-w-[28px] text-center text-sm font-bold text-[#581E83] tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => canInc && onChange(value + 1)}
        disabled={!canInc}
        className="w-7 h-7 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center text-[#581E83] hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ParticipantSetupForm({
  rugCount,
  childrenCount = 0,
  onSave,
  isSaving,
}) {
  const [participants, setParticipants] = useState(() => {
    const initial = [{ name: '', phone: '', rugAllowance: 1, childrenCount: 0 }];
    if (childrenCount > 0) {
      initial[0].childrenCount = Math.min(childrenCount, childrenCount);
    }
    return initial;
  });
  const [errors, setErrors] = useState({});
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const [duplicatesApproved, setDuplicatesApproved] = useState(false);

  const totalRugs = participants.reduce((sum, p) => sum + (p.rugAllowance || 1), 0);
  const rugsRemaining = rugCount - totalRugs;
  const totalChildrenAssigned = participants.reduce((sum, p) => sum + (p.childrenCount || 0), 0);
  const childrenRemaining = childrenCount - totalChildrenAssigned;
  const showChildren = childrenCount > 0;

  const addParticipant = () => {
    if (totalRugs >= rugCount) return;
    setParticipants(prev => [
      ...prev,
      { name: '', phone: '', rugAllowance: 1, childrenCount: 0 },
    ]);
  };

  const removeParticipant = (index) => {
    if (participants.length <= 1) return;
    setParticipants(prev => prev.filter((_, i) => i !== index));
    setErrors(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const updateField = (index, field, value) => {
    setParticipants(prev => prev.map((p, i) => {
      if (i !== index) return p;
      if (field === 'phone') {
        return { ...p, phone: value.replace(/\D/g, '').slice(0, 10) };
      }
      return { ...p, [field]: value };
    }));
    setErrors(prev => ({ ...prev, [index]: undefined }));
    setDuplicatesApproved(false);
  };

  const setRugAllowance = (index, next) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? { ...p, rugAllowance: next } : p)));
  };

  const setChildrenCount = (index, newCount) => {
    if (newCount < 0) return;
    const current = participants[index].childrenCount || 0;
    const diff = newCount - current;
    if (diff > 0 && childrenRemaining < diff) return;
    setParticipants(prev => prev.map((p, i) => (i === index ? { ...p, childrenCount: newCount } : p)));
  };

  const duplicatePhones = useMemo(() => {
    const phones = participants.map(p => p.phone).filter(p => p.length >= 10);
    const seen = {};
    const dups = [];
    phones.forEach((phone, i) => {
      if (seen[phone] !== undefined) {
        dups.push({ indices: [seen[phone], i], phone });
      } else {
        seen[phone] = i;
      }
    });
    return dups;
  }, [participants]);

  const validate = () => {
    const newErrors = {};
    participants.forEach((p, i) => {
      const errs = [];
      if (!p.name.trim()) errs.push('שם הוא שדה חובה');
      if (!validatePhone(p.phone)) errs.push('מספר טלפון לא תקין');
      if (errs.length > 0) newErrors[i] = errs;
    });

    if (totalRugs !== rugCount) {
      newErrors._global = [`סה"כ שטיחים חייב להיות ${rugCount} (כרגע: ${totalRugs})`];
    }

    setErrors(newErrors);

    if (duplicatePhones.length > 0 && !duplicatesApproved) {
      setDuplicateWarnings(duplicatePhones);
      return false;
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSave(participants.map(p => ({
        ...p,
        hasChildren: (p.childrenCount || 0) > 0,
      })));
    }
  };

  return (
    <div className="py-3 space-y-3" dir="rtl">
      <div className="text-center">
        <h3 className="text-base font-bold text-[#581E83]">הגדרת משתתפים</h3>
        <p className="text-xs text-[#464646]/70">
          חלקו את {rugCount} השטיחים בין המשתתפים
        </p>
      </div>

      {/* Allocation status bar */}
      <div className="flex items-center justify-between bg-[#f5f0fa] rounded-lg px-3 py-2 text-xs">
        <span className="text-[#581E83] font-medium flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {participants.length} משתתפים
        </span>
        <span className={`font-medium ${rugsRemaining === 0 ? 'text-green-600' : 'text-orange-600'}`}>
          {rugsRemaining === 0 ? 'כל השטיחים חולקו' : `נותרו ${rugsRemaining} שטיחים לחלוקה`}
        </span>
      </div>

      {errors._global && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          {errors._global.join(', ')}
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {participants.map((p, index) => {
          const maxForThis = (p.rugAllowance || 1) + rugsRemaining;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border border-[#e8e8e8] rounded-xl p-3 space-y-2.5 bg-white"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#581E83]">
                  משתתף {index + 1}
                </span>
                {participants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(index)}
                    className="text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updateField(index, 'name', e.target.value)}
                  placeholder="שם מלא"
                  className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm focus:border-[#5E2F88] focus:outline-none"
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={p.phone}
                  onChange={(e) => updateField(index, 'phone', e.target.value)}
                  placeholder="05X-XXXXXXX"
                  dir="ltr"
                  className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm text-left focus:border-[#5E2F88] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#464646]/70">שטיחים:</span>
                  <Stepper
                    value={p.rugAllowance || 1}
                    min={1}
                    max={maxForThis}
                    onChange={(v) => setRugAllowance(index, v)}
                  />
                </div>

                {showChildren && (
                  <div className="flex items-center gap-1.5 text-xs text-[#464646]/70">
                    <Baby className="w-3.5 h-3.5 text-[#5E2F88]" />
                    <span>ילדים:</span>
                    <button
                      type="button"
                      onClick={() => setChildrenCount(index, (p.childrenCount || 0) - 1)}
                      disabled={!(p.childrenCount > 0)}
                      className="w-6 h-6 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center text-[#581E83] hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="min-w-[18px] text-center text-xs font-bold text-[#581E83] tabular-nums">{p.childrenCount || 0}</span>
                    <button
                      type="button"
                      onClick={() => setChildrenCount(index, (p.childrenCount || 0) + 1)}
                      disabled={childrenRemaining <= 0}
                      className="w-6 h-6 rounded-full border border-[#e8e8e8] bg-white flex items-center justify-center text-[#581E83] hover:border-[#5E2F88] hover:bg-[#5E2F88]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {errors[index] && (
                <div className="text-[11px] text-red-500 space-y-0.5">
                  {errors[index].map((err, ei) => <p key={ei}>{err}</p>)}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {showChildren && childrenRemaining > 0 && (
        <p className="text-[11px] text-center text-[#464646]/50">
          נותר לשייך {childrenRemaining} {childrenRemaining === 1 ? 'ילד' : 'ילדים'}
        </p>
      )}

      {duplicateWarnings.length > 0 && !duplicatesApproved && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-orange-700 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            <span>נמצאו מספרי טלפון כפולים</span>
          </div>
          <p className="text-xs text-orange-600">
            המספרים הבאים הוזנו יותר מפעם אחת. אם זה מכוון, לחץ אישור.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDuplicateWarnings([])}
              className="text-xs"
            >
              תיקון
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDuplicatesApproved(true);
                setDuplicateWarnings([]);
              }}
              className="text-xs bg-orange-500 hover:bg-orange-600 text-white"
            >
              אישור - ההזנה תקינה
            </Button>
          </div>
        </div>
      )}

      {rugsRemaining > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={addParticipant}
          className="w-full border-dashed border-[#5E2F88]/30 text-[#5E2F88] py-2 text-sm"
        >
          <Plus className="w-4 h-4 ml-1" />
          הוסף משתתף
        </Button>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isSaving || totalRugs !== rugCount}
        className="w-full bg-[#5E2F88] hover:bg-[#7B3DB0] text-white py-3"
      >
        {isSaving ? 'שומר...' : 'שמור ושלח קישורים'}
      </Button>
    </div>
  );
}
