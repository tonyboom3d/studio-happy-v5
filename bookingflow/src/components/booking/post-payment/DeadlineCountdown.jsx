import React, { useState, useEffect, useMemo } from 'react';

function pad(n) {
  return String(n).padStart(2, '0');
}

function TimeBox({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-white border border-[#5E2F88]/15 flex items-center justify-center">
        <span className="text-base sm:text-lg font-bold text-[#581E83] tabular-nums">
          {pad(value)}
        </span>
      </div>
      <span className="text-[10px] text-[#464646]/60 font-medium">{label}</span>
    </div>
  );
}

export default function DeadlineCountdown({ deadlineAt, workshopStart, rugCount = 1, participantCount = 1 }) {
  const [remaining, setRemaining] = useState(null);

  const daysUntilWorkshop = useMemo(() => {
    if (!workshopStart) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ws = new Date(workshopStart);
    ws.setHours(0, 0, 0, 0);
    return Math.floor((ws - today) / 86400000);
  }, [workshopStart]);

  useEffect(() => {
    if (!deadlineAt) return;
    const deadline = new Date(deadlineAt);

    function update() {
      const diff = deadline - Date.now();
      if (diff <= 0) {
        setRemaining({ expired: true });
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining({ days, hours, minutes, seconds, expired: false });
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  const isPluralPeople = participantCount > 1;
  const isPluralSketches = rugCount > 1;
  const pronoun = isPluralPeople ? 'לכם' : 'לך';
  const sketchLabel = isPluralSketches ? 'לבחירת סקיצות' : 'לבחירת סקיצה';

  const fallbackMessage = 'במידה ולא תיבחר סקיצה עד המועד האחרון, תחכה לכם סקיצה חלקה מיועדת ליצירה עצמית.';

  const showTimer = daysUntilWorkshop !== null && daysUntilWorkshop <= 15 && remaining;

  let timerBlock = null;
  if (showTimer && remaining.expired) {
    timerBlock = (
      <div className="text-center py-3">
        <p className="text-red-600 text-xs font-medium bg-red-50 rounded-lg px-2.5 py-2">
          המועד האחרון {sketchLabel} חלף
        </p>
      </div>
    );
  } else if (showTimer) {
    const isUrgent = remaining.days === 0 && remaining.hours < 12;
    timerBlock = (
      <div
        className={`rounded-xl px-2.5 py-2.5 text-center ${
          isUrgent ? 'bg-orange-50 border border-orange-200' : 'bg-[#f5f0fa] border border-[#5E2F88]/10'
        }`}
      >
        <p className={`text-xs font-medium mb-1.5 ${isUrgent ? 'text-orange-800' : 'text-[#581E83]'}`}>
          נשארו {pronoun} עוד
        </p>

        <div className="flex items-center justify-center gap-1 sm:gap-1.5" dir="ltr">
          {remaining.days > 0 && <TimeBox value={remaining.days} label="ימים" />}
          <TimeBox value={remaining.hours} label="שעות" />
          <TimeBox value={remaining.minutes} label="דקות" />
          <TimeBox value={remaining.seconds} label="שניות" />
        </div>

        <p className={`text-xs font-medium mt-1.5 ${isUrgent ? 'text-orange-700' : 'text-[#581E83]/80'}`}>
          {sketchLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      {timerBlock}
      <p className="text-center text-[11px] sm:text-xs text-red-600 font-medium leading-relaxed px-1">
        {fallbackMessage}
      </p>
    </div>
  );
}
