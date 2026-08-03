import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, Loader2, Check, ChevronLeft, ChevronRight,
  RotateCcw, Image as ImageIcon, Info, AlertTriangle, MessageSquare,
  Sparkles, Star, GripHorizontal, Plus, Trash2, ZoomIn,
  Square, Circle, Shapes, Crop as CropIcon,
} from 'lucide-react';
import ImageCropModal from './ImageCropModal';

const FRAME_OPTIONS = [
  { id: 'square', label: 'ריבוע', Icon: Square },
  { id: 'circle', label: 'עיגול', Icon: Circle },
  { id: 'custom', label: 'צורה חופשית', Icon: Shapes },
];

export const FRAME_TYPE_LABELS = {
  square: 'ריבוע',
  circle: 'עיגול',
  custom: 'צורה חופשית',
};

const STEPS = ['העלאה', 'אישור', 'סקיצה'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — the cropped image is compressed before it's ever sent to the server
const MAX_ATTEMPTS = 10;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function validateImageFile(file) {
  if (!file) return 'לא נבחר קובץ';
  if (file.size > MAX_FILE_SIZE) return 'הקובץ גדול מדי. גודל מקסימלי: 10MB';

  const extOk = ALLOWED_IMAGE_EXT.test(file.name || '');
  const typeOk = ALLOWED_IMAGE_TYPES.has(file.type) || (!file.type && extOk);

  if (!typeOk) {
    if (file.type === 'image/heic' || file.type === 'image/heif' || /\.heic$/i.test(file.name)) {
      return 'פורמט HEIC לא נתמך. יש להמיר את התמונה ל-JPG או PNG';
    }
    if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) {
      return 'GIF לא נתמך. יש להעלות JPG, PNG או WEBP';
    }
    if (file.type.startsWith('image/')) {
      return `פורמט ${file.type.replace('image/', '').toUpperCase()} לא נתמך. יש להעלות JPG, PNG או WEBP`;
    }
    return 'פורמט לא נתמך. יש להעלות קובץ JPG, PNG או WEBP בלבד';
  }
  return null;
}

const LOADING_SUBTITLES_VALIDATE = [
  'בודק איכות וחדות...',
  'מוודא התאמה לתפירה בטאפטינג...',
  'סורק למניעת תוכן לא הולם...',
  'מכין את הבד הווירטואלי...',
];

const LOADING_SUBTITLES_GENERATE = [
  'מפעיל קסמי AI...',
  'מפשט קווים וצורות...',
  'מסיר רקע ומבודד את האובייקט...',
  'מכין קובץ סופי...',
];

const AI_RATE_LIMIT_MESSAGE = 'הגעתם למגבלת הניסיונות. אנא המתינו כ-30 דקות לפני שתוכלו לנסות שוב.';
const SKETCH_PROGRESS_DURATION_MS = 40000;
const RESULT_BUFFER_MS = 5000;
const STARS_DURATION_MS = 2500;

const AI_TERMS_SECTIONS = [
  {
    title: 'תנאי שימוש – שירות יצירת סקיצות אוטומטי לסדנאות',
    body: 'ברוכים הבאים לשירות הסקציות האוטומטי שלנו. השימוש במערכת, לרבות העלאת תמונות והפקת סקיצות באמצעות בינה מלאכותית (AI) לצורך הכנת העבודות בסדנאות, כפוף לתנאים המפורטים להלן. עצם השימוש במערכת והעלאת תמונה מהווים הסכמה מלאה לתנאים אלו.',
  },
  {
    title: '1. אחריות בלעדית של המשתמש על התוכן',
    body: 'המשתמש מצהיר ומתחייב כי כל תמונה או קובץ חזותי המועלים על ידיו למערכת נמצאים בבעלותו הבלעדית, או שניתנה לו הרשאה מפורשת וחוקית כדין מבעל הזכויות לעשות בהם שימוש, ליצור מהם יצירות נגזרות (כגון סקיצות לעבודה) ולהשתמש בהם במסגרת הסדנא.\nחלה אסור מוחלט להעלות תמונות המוגנות בזכויות יוצרים של צדדים שלישיים ללא אישור (לרבות דמויות מסחריות, יצירות אמנות של אחרים, לוגואים מסחריים, צילומים מקצועיים מוגנים וכדומה).',
  },
  {
    title: '2. אופי פעילות המערכת (עיבוד אוטומטי)',
    body: 'המערכת מבצעת עיבוד טכנולוגי ואוטומטי לחלוטין של התמונה המועלית לצורך הפקת סקיצה אמנותית בלבד.\nהעסק אינו בודק, עורך, מאמת או מפקח מראש על זכויות היוצרים בתמונות המועלות על ידי המשתמשים, והאחריות הבלעדית והמלאה בגין כל הפרה של זכויות יוצרים, קניין רוחני או חוק אחר חלה על המשתמש בלבד.',
  },
  {
    title: '3. שיפוי והסרת אחריות',
    body: 'המשתמש מתחייב לשפות ולפצות את העסק, מנהליו, עובדיו ומי מטעמו, בגין כל נזק, הפסד, תשלום, הוצאה או תביעה (לרבות שכר טרחת עורך דין והוצאות משפט) שיגרמו עקב הפרת תנאים אלו, או עקב טענה או דרישה של צד שלישי כלשהו בגין הפרת זכויות יוצרים או זכויות קניין רוחני הקשורות לתמונה שהעלה המשתמש.',
  },
  {
    title: '4. זכות העסק לסירוב ולביטול',
    body: 'העסק שומר לעצמו את הזכות המלאה (אך אינו מחויב) לסרב לקבל, לעבד או לאשר עבודה על סקיצה המעוררת חשש להפרת זכויות יוצרים או שאינה עומדת ברוח המותג והחוק, גם לאחר שהועלתה למערכת או במהלך הסדנא עצמה.',
  },
];

function isRateLimitResponse(result) {
  if (!result) return false;
  if (result.isAllowed === false) return true;
  const text = result.reason || result.message || '';
  return text.includes('מגבלת') && text.includes('ניסיונות');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensionsFromFile(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1, height: 1 });
    };
    img.src = url;
  });
}

function getImageDimensionsFromUrl(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = src;
  });
}

function friendlyAiTransportError(err) {
  const msg = String(err?.message || err || '');
  if (/\b413\b|Payload Too Large|too large|entity too large/i.test(msg)) {
    return 'התמונה גדולה מדי לשליחה לשרת. נסו לחתוך אזור קטן יותר או להעלות תמונה באיכות נמוכה יותר.';
  }
  return msg || null;
}

function getImageFrameStyle(aspectRatio, maxHeight = 360) {
  const ratio = aspectRatio && aspectRatio > 0 ? aspectRatio : 1;
  return {
    aspectRatio: String(ratio),
    width: '100%',
    maxHeight: `${maxHeight}px`,
  };
}

function Stepper({ step }) {
  const pct = step === 0 ? 0 : step === 1 ? 50 : 100;
  return (
    <div className="px-4 pt-2.5 pb-0.5 md:px-6 md:pt-3">
      <div className="flex items-center justify-between relative max-w-[260px] mx-auto">
        <div className="absolute right-0 top-3 -translate-y-1/2 w-full h-1 bg-[#e8e8e8] -z-10 rounded-full" />
        <div
          className="absolute right-0 top-3 -translate-y-1/2 h-1 bg-[#5E2F88] -z-10 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
        {STEPS.map((label, i) => (
          <div key={i} className="flex flex-col items-center relative bg-white px-1.5">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] shadow transition-colors z-10 ${
                i < step
                  ? 'bg-[#5E2F88] text-white'
                  : i === step
                  ? 'bg-[#5E2F88] text-white ring-[3px] ring-[#f5f0fa]'
                  : 'bg-[#e8e8e8] text-[#464646]/50'
              }`}
            >
              {i < step ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={`text-[10px] mt-1 ${
              i <= step ? 'text-[#5E2F88] font-bold' : 'text-[#464646]/50'
            }`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingView({ title, subtitles, progress }) {
  const [subIdx, setSubIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setSubIdx(prev => (prev + 1) % subtitles.length);
        setFade(true);
      }, 250);
    }, 1400);
    return () => clearInterval(iv);
  }, [subtitles]);

  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="w-20 h-20 mb-5 relative">
        <Loader2 className="w-full h-full text-[#5E2F88] animate-spin" />
        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-[#5E2F88]" />
      </div>
      <h2 className="text-lg font-bold text-[#581E83] mb-1.5">{title}</h2>
      <p className={`text-sm text-[#464646]/70 h-5 transition-opacity duration-250 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        {subtitles[subIdx]}
      </p>
      <div className="w-full max-w-[240px] bg-[#e8e8e8] rounded-full h-2 mt-5">
        <div
          className="bg-[#5E2F88] h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function StarsBurst() {
  const stars = useMemo(
    () => Array.from({ length: 16 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      size: 12 + Math.random() * 18,
      dur: 1.5 + Math.random() * 0.9,
      drift: (Math.random() - 0.5) * 60,
    })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-2xl">
      {stars.map((s) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, y: 20, x: 0 }}
          animate={{ opacity: [0, 0.7, 0.7, 0], y: -340, x: s.drift }}
          transition={{ duration: s.dur, delay: s.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', bottom: 0, left: `${s.left}%` }}
        >
          <Star style={{ width: s.size, height: s.size, color: '#facc15', opacity: 0.6 }} fill="#facc15" strokeWidth={0} />
        </motion.div>
      ))}
    </div>
  );
}

function CompareSlider({ originalUrl, sketchUrl, aspectRatio = 1, hintTrigger = 0 }) {
  const containerRef = useRef(null);
  const [pct, setPct] = useState(50);
  const dragging = useRef(false);
  const [lightbox, setLightbox] = useState(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [hinting, setHinting] = useState(false);
  const frameStyle = getImageFrameStyle(aspectRatio, 360);

  useEffect(() => {
    if (!sketchUrl || !originalUrl) return;
    setImagesLoaded(false);
    let loaded = 0;
    const check = () => { loaded++; if (loaded >= 2) setImagesLoaded(true); };
    const img1 = new Image();
    img1.onload = check;
    img1.onerror = check;
    img1.src = sketchUrl;
    const img2 = new Image();
    img2.onload = check;
    img2.onerror = check;
    img2.src = originalUrl;
  }, [sketchUrl, originalUrl]);

  const update = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let p = ((clientX - rect.left) / rect.width) * 100;
    p = Math.max(0, Math.min(100, p));
    setPct(p);
  }, []);

  const startDrag = useCallback((e) => {
    dragging.current = true;
    setHinting(false);
    if (e.cancelable) e.preventDefault();
  }, []);
  const stopDrag = useCallback(() => { dragging.current = false; }, []);
  const onMove = useCallback((e) => {
    if (!dragging.current) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    update(x);
  }, [update]);

  useEffect(() => {
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('mouseleave', stopDrag);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('mouseleave', stopDrag);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
    };
  }, [onMove, stopDrag]);

  // Phase C: automated drag-handle hint (center -> right -> left -> center)
  useEffect(() => {
    if (!hintTrigger || !imagesLoaded) return;
    setHinting(true);
    setPct(50);
    const t1 = setTimeout(() => setPct(85), 250);
    const t2 = setTimeout(() => setPct(15), 1100);
    const t3 = setTimeout(() => setPct(50), 1950);
    const t4 = setTimeout(() => setHinting(false), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [hintTrigger, imagesLoaded]);

  if (!imagesLoaded) {
    return (
      <div
        className="relative w-full rounded-2xl shadow-xl border-4 border-white bg-white mx-auto flex items-center justify-center"
        style={frameStyle}
      >
        <Loader2 className="w-10 h-10 text-[#5E2F88] animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl shadow-xl border-4 border-white select-none overflow-hidden touch-none bg-white mx-auto isolate"
      style={frameStyle}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
    >
      {/* Sketch is the white-backed base; transparent pixels never reveal the source photo. */}
      <div className="absolute inset-0 z-0 bg-white">
        <img
          src={sketchUrl}
          alt="Sketch"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain bg-white"
          style={{ backgroundColor: '#ffffff' }}
        />
      </div>

      {/* Original / cropped input — left side only, layered above the sketch. */}
      <div
        className="absolute inset-0 z-10 bg-white"
        style={{
          clipPath: `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`,
          transition: hinting ? 'clip-path 0.7s ease-in-out' : 'none',
        }}
      >
        <img
          src={originalUrl}
          alt="Original"
          draggable={false}
          className="absolute inset-0 z-0 h-full w-full object-contain bg-white"
          style={{ backgroundColor: '#ffffff' }}
        />
      </div>
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-[#5E2F88]/60 flex justify-center items-center -translate-x-1/2 z-20 cursor-ew-resize"
        style={{ left: `${pct}%`, transition: hinting ? 'left 0.7s ease-in-out' : 'none' }}
      >
        <div className="w-7 h-7 bg-white rounded-full shadow-lg flex items-center justify-center text-[#464646]/60 ring-2 ring-[#5E2F88]/30 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5" />
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setLightbox('sketch'); }}
        className="absolute bottom-2 left-2 z-30 rounded-full bg-white/90 p-1.5 shadow-md transition-colors hover:bg-white"
        aria-label="הגדלת סקיצה"
      >
        <ZoomIn className="h-4 w-4 text-[#581E83]" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setLightbox('original'); }}
        className="absolute bottom-2 right-2 z-30 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-[#581E83] shadow-md transition-colors hover:bg-white"
      >
        מקור
      </button>

      {createPortal(
        <AnimatePresence>
          {lightbox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
              onClick={() => setLightbox(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="absolute -top-2 -left-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5" />
                </button>
                <p className="mb-2 text-center text-sm font-semibold text-white">
                  {lightbox === 'sketch' ? 'הסקיצה' : 'התמונה המקורית'}
                </p>
                <div className="overflow-hidden rounded-xl bg-white p-3 shadow-2xl sm:p-5">
                  <div className="mx-auto max-h-[80dvh] w-full bg-white" style={{ backgroundColor: '#ffffff' }}>
                    <img
                      src={lightbox === 'sketch' ? sketchUrl : originalUrl}
                      alt={lightbox === 'sketch' ? 'Sketch' : 'Original'}
                      className="mx-auto max-h-[80dvh] w-full object-contain bg-white"
                      style={{ backgroundColor: '#ffffff' }}
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export default function AISketchModal({
  isOpen,
  onClose,
  onApprove,
  onValidateImage,
  onGenerateSketch,
  onSaveApprovedSketch,
  onSubmitFeedback,
  onCheckRateLimit,
  onGetAITermsStatus,
  onAcceptAITerms,
}) {
  // View: 'intro' | 'loading' | 'config' | 'result'
  const [view, setView] = useState('intro');
  const [step, setStep] = useState(0);

  // Image state
  const [imageFile, setImageFile] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 1, height: 1 });

  // Loading
  const [loadingTitle, setLoadingTitle] = useState('');
  const [loadingSubs, setLoadingSubs] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Config
  const [colorMode, setColorMode] = useState('auto');
  const [manualColors, setManualColors] = useState(['#000000', '#ffffff', '#ff0000']);

  // Frame + crop
  const [frameType, setFrameType] = useState('square');
  const [croppedBase64, setCroppedBase64] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  // true while the post-upload (mandatory) crop is pending — confirm triggers AI validation
  const [pendingInitialCrop, setPendingInitialCrop] = useState(false);

  // Result
  const [sketchUrl, setSketchUrl] = useState(null);
  const [sketchWixFileUrl, setSketchWixFileUrl] = useState(null);
  const [originalMediaUrl, setOriginalMediaUrl] = useState(null);

  // Post-generation reveal sequence: 'hidden' (buffer) -> 'stars' -> 'done'
  const [revealPhase, setRevealPhase] = useState('hidden');
  const [hintTrigger, setHintTrigger] = useState(0);

  // Error
  const [error, setError] = useState(null);
  const [errorCountdown, setErrorCountdown] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const isBlockingClose = view === 'loading' || isSaving;

  useEffect(() => {
    if (!error) {
      setErrorCountdown(0);
      return undefined;
    }
    setErrorCountdown(8);
    const iv = setInterval(() => {
      setErrorCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(iv);
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [error]);

  // Sub-modals
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState(AI_RATE_LIMIT_MESSAGE);

  // Retry form
  const [retryReason, setRetryReason] = useState('');
  const [retryText, setRetryText] = useState('');

  // Feedback form
  const [feedbackText, setFeedbackText] = useState('');

  // AI terms
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsPersisted, setTermsPersisted] = useState(false);
  const [termsSaving, setTermsSaving] = useState(false);

  // Attempts (synced from server)
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [attemptsLimit, setAttemptsLimit] = useState(MAX_ATTEMPTS);

  const applyRateLimitState = useCallback((rl) => {
    if (!rl) return;
    if (typeof rl.attempts === 'number') setAttemptsUsed(rl.attempts);
    if (typeof rl.limit === 'number') setAttemptsLimit(rl.limit);
  }, []);

  const refreshAttempts = useCallback(async () => {
    if (!onCheckRateLimit) return null;
    try {
      const rl = await onCheckRateLimit();
      applyRateLimitState(rl);
      return rl;
    } catch (_) {
      return null;
    }
  }, [onCheckRateLimit, applyRateLimitState]);

  const loadTermsStatus = useCallback(async () => {
    if (!onGetAITermsStatus) return;
    try {
      const status = await onGetAITermsStatus();
      const accepted = !!status?.accepted;
      setTermsAccepted(accepted);
      setTermsPersisted(accepted);
    } catch (_) {
      setTermsAccepted(false);
      setTermsPersisted(false);
    }
  }, [onGetAITermsStatus]);

  const handleTermsChange = useCallback(async (checked) => {
    if (!checked) {
      if (!termsPersisted) setTermsAccepted(false);
      return;
    }
    if (termsPersisted || termsAccepted) {
      setTermsAccepted(true);
      return;
    }
    if (!onAcceptAITerms) {
      setTermsAccepted(true);
      return;
    }
    setTermsSaving(true);
    setError(null);
    try {
      await onAcceptAITerms();
      setTermsAccepted(true);
      setTermsPersisted(true);
    } catch (err) {
      setTermsAccepted(false);
      setError(err?.message || 'שגיאה בשמירת אישור התנאים. נסו שוב.');
    } finally {
      setTermsSaving(false);
    }
  }, [onAcceptAITerms, termsAccepted, termsPersisted]);

  const fileInputRef = useRef(null);

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      setView('intro');
      setStep(0);
      setImageFile(null);
      setImageBase64(null);
      setImagePreviewUrl(null);
      setImageDimensions({ width: 1, height: 1 });
      setColorMode('auto');
      setManualColors(['#000000', '#ffffff', '#ff0000']);
      setFrameType('square');
      setCroppedBase64(null);
      setCropOpen(false);
      setPendingInitialCrop(false);
      setSketchUrl(null);
      setSketchWixFileUrl(null);
      setOriginalMediaUrl(null);
      setRevealPhase('hidden');
      setHintTrigger(0);
      setError(null);
      setIsSaving(false);
      setAttemptsUsed(0);
      setAttemptsLimit(MAX_ATTEMPTS);
      setTermsAccepted(false);
      setTermsPersisted(false);
      setTermsSaving(false);
      setTermsModalOpen(false);
      setRetryReason('');
      setRetryText('');
      setFeedbackText('');
      refreshAttempts();
      loadTermsStatus();
    }
  }, [isOpen, refreshAttempts, loadTermsStatus]);

  const animateProgress = useCallback((durationMs = 4000) => {
    setLoadingProgress(0);
    const start = Date.now();
    const tick = durationMs >= 15000 ? 200 : Math.max(120, durationMs / 12);
    const iv = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(95, (elapsed / durationMs) * 95);
      setLoadingProgress(Math.round(pct * 10) / 10);
    }, tick);
    return () => clearInterval(iv);
  }, []);

  // Drives Phase A (5s buffer) -> Phase B (2.5s stars) -> Phase C (slider hint)
  useEffect(() => {
    if (view !== 'result' || !sketchUrl) return undefined;
    setRevealPhase('hidden');
    const tStars = setTimeout(() => {
      setRevealPhase('stars');
      setHintTrigger((k) => k + 1);
    }, RESULT_BUFFER_MS);
    const tDone = setTimeout(() => {
      setRevealPhase('done');
    }, RESULT_BUFFER_MS + STARS_DURATION_MS);
    return () => { clearTimeout(tStars); clearTimeout(tDone); };
  }, [view, sketchUrl]);

  // Step A: file selected — read it locally and open the crop UI immediately.
  // No AI call happens until the user confirms their crop.
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!termsAccepted) {
      setError('יש לאשר את תנאי השימוש לפני העלאת תמונה.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError(null);
    try {
      const [base64, dimensions] = await Promise.all([
        fileToBase64(file),
        getImageDimensionsFromFile(file),
      ]);
      const previewUrl = URL.createObjectURL(file);

      setImageFile(file);
      setImageBase64(base64);
      setImageDimensions(dimensions);
      setImagePreviewUrl(previewUrl);
      setCroppedBase64(null);
      setPendingInitialCrop(true);
      setCropOpen(true);
    } catch (err) {
      setError('שגיאה בקריאת הקובץ. נסו שוב.');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [termsAccepted]);

  // Step B: crop confirmed — the cropped image is what gets sent to the AI.
  const runValidation = useCallback(async (inputBase64) => {
    setError(null);
    setView('loading');
    setStep(1);
    setLoadingTitle('ה-AI מוודא את התמונה שלך...');
    setLoadingSubs(LOADING_SUBTITLES_VALIDATE);
    const clearProgress = animateProgress(8000);

    try {
      if (onCheckRateLimit) {
        try {
          const rl = await onCheckRateLimit();
          applyRateLimitState(rl);
          if (!rl?.isAllowed) {
            clearProgress();
            setView('intro');
            setStep(0);
            setBlockedMessage(rl.reason || AI_RATE_LIMIT_MESSAGE);
            setBlockedOpen(true);
            return;
          }
        } catch (_) { /* proceed if check fails */ }
      }

      const result = await onValidateImage(inputBase64);
      clearProgress();
      setLoadingProgress(100);

      if (!result?.isValid) {
        if (isRateLimitResponse(result)) {
          applyRateLimitState(result);
          setBlockedMessage(result.reason || AI_RATE_LIMIT_MESSAGE);
          setBlockedOpen(true);
        } else {
          setError(result?.reason || 'התמונה לא מתאימה לטאפטינג. נסו תמונה אחרת.');
        }
        setView('intro');
        setStep(0);
        return;
      }

      setTimeout(() => {
        setView('config');
        setStep(1);
      }, 400);
    } catch (err) {
      clearProgress();
      const friendly = friendlyAiTransportError(err);
      const msg = friendly || err?.message || '';
      if (msg.includes('מגבלת') && msg.includes('ניסיונות')) {
        setBlockedMessage(msg);
        setBlockedOpen(true);
      } else {
        setError(msg || 'שגיאה בבדיקת התמונה. נסו שוב.');
      }
      setView('intro');
      setStep(0);
    }
  }, [onValidateImage, onCheckRateLimit, animateProgress, applyRateLimitState]);

  const handleCropConfirm = useCallback(async (base64) => {
    setCropOpen(false);
    setCroppedBase64(base64);
    const dims = await getImageDimensionsFromUrl(base64);
    setImageDimensions(dims);

    if (pendingInitialCrop) {
      setPendingInitialCrop(false);
      runValidation(base64);
    }
  }, [pendingInitialCrop, runValidation]);

  const handleCropCancel = useCallback(() => {
    setCropOpen(false);
    if (pendingInitialCrop) {
      // Abort the whole upload — back to intro with no image
      setPendingInitialCrop(false);
      setImageFile(null);
      setImageBase64(null);
      setImagePreviewUrl(null);
      setImageDimensions({ width: 1, height: 1 });
      setCroppedBase64(null);
    }
  }, [pendingInitialCrop]);

  const handleStartConversion = useCallback(async () => {
    if (onCheckRateLimit) {
      const rl = await refreshAttempts();
      if (rl && rl.isAllowed === false) {
        setBlockedMessage(rl.reason || AI_RATE_LIMIT_MESSAGE);
        setBlockedOpen(true);
        return;
      }
    }

    setView('loading');
    setStep(2);
    setLoadingTitle('הופך לסקיצה...');
    setLoadingSubs(LOADING_SUBTITLES_GENERATE);
    const clearProgress = animateProgress(SKETCH_PROGRESS_DURATION_MS);

    try {
      // Cropped image (custom shape) becomes the focused AI input when present
      const rawInput = croppedBase64 || imageBase64;
      const result = await onGenerateSketch(rawInput, 'AUTO', imageDimensions);
      clearProgress();
      setLoadingProgress(100);

      if (!result?.sketchUrl) {
        throw new Error('לא התקבלה סקיצה מהשרת (תגובה חסרה). נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.');
      }

      setSketchUrl(result.sketchUrl);
      setSketchWixFileUrl(null);
      await refreshAttempts();

      setTimeout(() => {
        setView('result');
        setStep(2);
      }, 400);
    } catch (err) {
      clearProgress();
      console.error('[AISketchModal] generateSketch failed:', err);
      const friendly = friendlyAiTransportError(err);
      const msg = friendly || err?.message || '';
      if (msg.includes('מגבלת') && msg.includes('ניסיונות')) {
        setBlockedMessage(msg);
        setBlockedOpen(true);
      } else {
        setError(msg || 'אירעה שגיאה טכנית ביצירת הסקיצה. נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.');
      }
      setView('config');
      setStep(1);
    }
  }, [imageBase64, croppedBase64, imageDimensions, onGenerateSketch, animateProgress, onCheckRateLimit, refreshAttempts]);

  const imageAspectRatio = imageDimensions.width / imageDimensions.height;

  // Compare slider "מקור" = cropped input when user cropped, else uploaded preview
  const compareOriginalUrl = croppedBase64 || originalMediaUrl || imagePreviewUrl;

  const handleApprove = useCallback(async () => {
    setError(null);
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (!onSaveApprovedSketch) {
        throw new Error('לא ניתן לשמור את הסקיצה כרגע (שגיאת הגדרות מערכת). אנא פנו לתמיכה.');
      }

      // Send only the sketch URL — no base64 payloads (avoids Wix timeout / 413).
      console.warn('[SketchUpload] AISketchModal handleApprove start', { sketchUrl: sketchUrl?.slice?.(0, 80) });
      const saved = await onSaveApprovedSketch(null, sketchUrl, 'AUTO', null);
      console.warn('[SketchUpload] AISketchModal handleApprove saved', saved);

      onApprove({
        source: 'ai',
        productId: null,
        title: 'עיצוב מותאם אישית (AI)',
        image: saved?.sketchUrl || saved?.fileUrl || sketchUrl,
        wixFileUrl: saved?.fileUrl || saved?.wixFileUrl || null,
        aiOriginalImage: null,
        aiColors: saved?.colors || 'AUTO',
        aiTaskId: saved?.taskId || null,
        canvasSize: '60x60',
        frameType,
        aiCroppedImage: null,
        pendingMediaUpload: false,
      });
      onClose();
    } catch (err) {
      console.error('[AISketchModal] save approved sketch failed:', err);
      setError(err?.message || 'אירעה שגיאה טכנית בשמירת הסקיצה. נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.');
    } finally {
      setIsSaving(false);
    }
  }, [frameType, sketchUrl, onApprove, onClose, onSaveApprovedSketch, isSaving]);

  const handleRetrySubmit = useCallback(async () => {
    if (!retryReason) return;

    const reasonText = retryReason === 'other' ? retryText.trim() : retryReason;
    if (retryReason === 'other' && !reasonText) return;

    if (onCheckRateLimit) {
      const rl = await refreshAttempts();
      if (rl && rl.isAllowed === false) {
        setRetryOpen(false);
        setBlockedMessage(rl.reason || AI_RATE_LIMIT_MESSAGE);
        setBlockedOpen(true);
        return;
      }
    } else if (attemptsUsed >= attemptsLimit) {
      setRetryOpen(false);
      setBlockedMessage(AI_RATE_LIMIT_MESSAGE);
      setBlockedOpen(true);
      return;
    }

    if (onSubmitFeedback) {
      try { await onSubmitFeedback(reasonText, 'Retry'); } catch (_) {}
    }

    setRetryOpen(false);
    setRetryReason('');
    setRetryText('');
    handleStartConversion();
  }, [retryReason, retryText, attemptsUsed, attemptsLimit, onSubmitFeedback, handleStartConversion, onCheckRateLimit, refreshAttempts]);

  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackText.trim()) return;
    if (onSubmitFeedback) {
      try { await onSubmitFeedback(feedbackText, 'Global'); } catch (_) {}
    }
    setFeedbackOpen(false);
    setFeedbackText('');
  }, [feedbackText, onSubmitFeedback]);

  const addColor = () => {
    if (manualColors.length < 6) setManualColors(prev => [...prev, '#cccccc']);
  };

  const removeColor = (idx) => {
    if (manualColors.length > 3) setManualColors(prev => prev.filter((_, i) => i !== idx));
  };

  const updateColor = (idx, val) => {
    setManualColors(prev => prev.map((c, i) => i === idx ? val : c));
  };

  const difficultyInfo = (() => {
    const n = manualColors.length;
    if (n <= 3) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'רמת קושי: קלה', desc: '3 צבעים זה מעולה ומהיר!' };
    if (n === 4) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', label: 'רמת קושי: קל-בינוני', desc: 'ייקח מעט יותר זמן, אבל לגמרי אפשרי.' };
    return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: `רמת קושי: קשה (${n} צבעים)`, desc: 'זמן הצביעה עולה. ייתכן ותצטרכו לרכוש מפגש המשך.' };
  })();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto relative"
          dir="rtl"
        >
          {/* Close (top-right) + Feedback (top-left) */}
          <div className="absolute top-2 right-2 z-20">
            {!isBlockingClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-[#f5f5f5] flex items-center justify-center text-[#464646] hover:bg-[#e8e8e8] transition-colors"
                aria-label="סגור"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {!isBlockingClose && (
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="absolute top-2 left-2 z-20 bg-[#f5f0fa] text-[#5E2F88] px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1.5 text-[11px] font-bold hover:bg-[#ebe0f5] transition-colors ring-1 ring-[#5E2F88]/15"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">פידבק</span>
          </button>
          )}

          {/* Header */}
          <div className="bg-[#f5f0fa] pt-8 pb-1.5 px-4 md:pt-9 md:pb-2 text-center border-b border-[#5E2F88]/10">
            <h1 className="text-[15px] md:text-lg font-bold text-[#581E83]">עיצוב מותאם אישית בעזרת AI</h1>
            <p className="text-[11px] md:text-xs text-[#5E2F88]/70 font-medium tabular-nums mt-0.5">
              ניסיון {Math.min(attemptsUsed, attemptsLimit)} מתוך {attemptsLimit}
            </p>
          </div>

          {/* Stepper */}
          <Stepper step={step} />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={handleFileUpload}
          />

          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-6 mt-3"
              >
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 flex-1">{error}</p>
                  {errorCountdown > 0 && (
                    <span className="text-xs text-red-500 font-medium tabular-nums shrink-0 mt-0.5">
                      {errorCountdown}s
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content area */}
          <div className="p-3.5 md:p-6 min-h-[280px]">

            {/* ---- VIEW: INTRO ---- */}
            {view === 'intro' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 md:space-y-4"
              >
                {/* Steps explanation */}
                <div className="bg-[#fafafa] rounded-xl p-3 space-y-2.5 border border-[#e8e8e8]">
                  {[
                    { n: 1, title: 'מעלים תמונה וחותכים', desc: 'בחרו תמונה ברורה וסמנו את האזור המדויק שיהפוך לסקיצה.' },
                    { n: 2, title: 'ה-AI שלנו בודק', desc: 'המערכת תוודא שהתמונה מתאימה לתפירה בטאפטינג.' },
                    { n: 3, title: 'המרה לסקיצה', desc: 'מאשרים ומקבלים סקיצה בשחור-לבן מוכנה לתפירה!' },
                  ].map(({ n, title, desc }) => (
                    <div key={n} className="flex items-start gap-2.5">
                      <div className="bg-[#f5f0fa] text-[#5E2F88] rounded-full w-6 h-6 flex items-center justify-center font-bold text-[12px] shrink-0">{n}</div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-[#464646] text-[13px] leading-tight">{title}</h3>
                        <p className="text-[12px] text-[#464646]/60 mt-0.5 leading-snug">{desc}</p>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExamplesOpen(true)}
                    className="text-[#5E2F88] text-[12px] font-semibold hover:underline flex items-center gap-1 mr-8"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> צפו בדוגמאות לתמונות טובות
                  </button>
                </div>

                {/* AI terms acceptance */}
                <label className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors ${termsAccepted ? 'border-[#5E2F88]/30 bg-[#faf7fd]' : 'border-[#e8e8e8] bg-white'}`}>
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    disabled={termsSaving || termsPersisted}
                    onChange={(e) => handleTermsChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#5E2F88] disabled:opacity-60"
                  />
                  <span className="text-[12px] text-[#464646] leading-relaxed">
                    אני מאשר/ת שקראתי והסכמתי ל
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setTermsModalOpen(true); }}
                      className="text-[#5E2F88] font-semibold underline underline-offset-2 hover:text-[#581E83] mx-0.5"
                    >
                      תנאי השימוש
                    </button>
                    ב AI ליצירת סקיצות
                    {termsSaving && (
                      <span className="inline-flex items-center gap-1 text-[#5E2F88] mr-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        שומר...
                      </span>
                    )}
                  </span>
                </label>

                {/* Upload area */}
                <button
                  type="button"
                  onClick={() => termsAccepted && fileInputRef.current?.click()}
                  disabled={!termsAccepted || termsSaving}
                  className={`w-full border-2 border-dashed rounded-2xl p-5 md:p-7 text-center transition-colors group ${
                    termsAccepted && !termsSaving
                      ? 'border-[#5E2F88]/40 hover:bg-[#f5f0fa] cursor-pointer'
                      : 'border-[#e8e8e8] bg-[#fafafa] cursor-not-allowed opacity-60'
                  }`}
                >
                  <Upload className={`w-8 h-8 md:w-10 md:h-10 mx-auto mb-1.5 transition-transform ${termsAccepted ? 'text-[#5E2F88] group-hover:scale-110' : 'text-[#464646]/30'}`} />
                  <h3 className="text-[14px] font-bold text-[#464646]">לחצו כאן להעלאת תמונה</h3>
                  <p className="text-[12px] text-[#464646]/50 mt-0.5">
                    {termsAccepted ? 'JPG, PNG, WEBP (עד 10MB)' : 'יש לאשר את תנאי השימוש כדי להמשיך'}
                  </p>
                </button>
              </motion.div>
            )}

            {/* ---- VIEW: LOADING ---- */}
            {view === 'loading' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <LoadingView
                  title={loadingTitle}
                  subtitles={loadingSubs}
                  progress={loadingProgress}
                />
              </motion.div>
            )}

            {/* ---- VIEW: CONFIG ---- */}
            {view === 'config' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 md:space-y-4"
              >
                {/* Single compact approval line (no duplicate headers) */}
                <div className="flex items-center justify-center gap-2 text-center">
                  <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[12px] font-bold">
                    <Check className="w-3.5 h-3.5" /> התמונה אושרה!
                  </span>
                  <span className="text-[12px] text-[#464646]/60">הסקיצה תיווצר בשחור-לבן</span>
                </div>

                <div className="flex flex-col md:flex-row gap-3 md:gap-5 items-start">
                  {/* Image preview (the cropped input that goes to the AI) */}
                  <div className="w-full md:w-1/2 flex flex-col items-center">
                    <div
                      className="relative w-full rounded-xl overflow-hidden shadow-sm border border-[#e8e8e8] bg-white flex items-center justify-center mx-auto"
                      style={getImageFrameStyle(imageAspectRatio, 200)}
                    >
                      {(croppedBase64 || imagePreviewUrl) && (
                        <img
                          src={croppedBase64 || imagePreviewUrl}
                          alt="Preview"
                          className="w-full h-full object-contain bg-white"
                        />
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[12px] font-semibold text-[#464646]/60 hover:text-[#5E2F88] transition-colors flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-[#e8e8e8] shadow-sm hover:border-[#5E2F88]/30"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> החלפת תמונה
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropOpen(true)}
                        className="text-[12px] font-semibold text-[#5E2F88] hover:text-[#581E83] transition-colors flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-[#5E2F88]/30 shadow-sm hover:bg-[#f5f0fa]"
                      >
                        <CropIcon className="w-3.5 h-3.5" /> חיתוך מחדש
                      </button>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="w-full md:w-1/2 space-y-3">
                    {/* Frame selection */}
                    <div>
                      <h3 className="text-[12px] font-bold text-[#464646] mb-1.5">בחירת מסגרת לשטיח:</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {FRAME_OPTIONS.map(({ id, label, Icon }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setFrameType(id)}
                            className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl border-2 transition-all ${
                              frameType === id
                                ? 'border-[#5E2F88] bg-[#f5f0fa] text-[#5E2F88]'
                                : 'border-[#e8e8e8] bg-white text-[#464646]/60 hover:border-[#5E2F88]/30'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <span className="text-[11px] font-semibold">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-blue-50 text-blue-800 p-2 rounded-xl text-[12px] border border-blue-100 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 mt-0.5 opacity-70 shrink-0" />
                      <span>המערכת תהפוך את התמונה לסקיצת קווים בשחור-לבן, תסיר את הרקע ותפשט את הפרטים.</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartConversion}
                      className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:scale-[1.02] transition-all flex justify-center items-center gap-2"
                    >
                      <span>יצירת סקיצה</span>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ---- VIEW: RESULT ---- */}
            {view === 'result' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-3 md:space-y-4"
              >
                <div className="relative">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 flex gap-1 pointer-events-none">
                    {[...Array(5)].map((_, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, y: 8, scale: 0.5 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.15 * i, type: 'spring', stiffness: 200 }}
                      >
                        <Sparkles className="w-4 h-4 text-[#5E2F88]" />
                      </motion.span>
                    ))}
                  </div>
                  <h2 className="text-lg md:text-xl font-bold text-[#581E83]">הסקיצה שלך מוכנה!</h2>
                  <p className="text-[#464646]/60 text-[12px] md:text-sm">ככה בערך יראה השטיח שלכם. מוכנים להתחיל לתפור?</p>
                </div>

                {/* Compare slider */}
                <div className="relative w-full max-w-md mx-auto">
                  <CompareSlider
                    originalUrl={compareOriginalUrl}
                    sketchUrl={sketchUrl}
                    aspectRatio={imageAspectRatio}
                    hintTrigger={hintTrigger}
                  />

                  {/* Phase A: pre-load buffer overlay (image is in DOM but hidden) */}
                  {revealPhase === 'hidden' && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-2xl border-4 border-white bg-white">
                      <Loader2 className="w-10 h-10 text-[#5E2F88] animate-spin" />
                      <p className="text-sm font-semibold text-[#5E2F88]">מכין את הסקיצה שלך...</p>
                    </div>
                  )}

                  {/* Phase B: success stars animation */}
                  {revealPhase === 'stars' && <StarsBurst />}
                </div>

                <p className="text-[11px] md:text-xs text-[#464646]/60 leading-relaxed px-1">
                  אנו עושים את מירב המאמצים כדי להגיע לדיוק מקסימלי, אך ייתכנו הבדלים טבעיים בין סקיצת ה-AI לבין התוצר הסופי.
                </p>

                {/* Action buttons */}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isSaving}
                    className={`w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 text-[14px] ${isSaving ? 'opacity-80 cursor-wait' : ''}`}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {isSaving ? 'שומר...' : 'אישור ושמירה'}
                  </button>
                  <div className="flex flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setRetryOpen(true)}
                      disabled={isSaving}
                      className="bg-white border-2 border-[#e8e8e8] hover:border-[#464646]/30 text-[#464646] font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 flex-1 text-[14px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-4 h-4" /> ניסיון נוסף
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                      className="bg-[#f5f5f5] hover:bg-[#e8e8e8] text-[#464646] font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 flex-1 text-[14px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ImageIcon className="w-4 h-4" /> החלפת תמונה
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Examples modal */}
      {examplesOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setExamplesOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex justify-between items-center bg-[#fafafa]">
              <h3 className="font-bold text-[15px] text-[#581E83]">דוגמאות לתמונות</h3>
              <button type="button" onClick={() => setExamplesOpen(false)} className="text-[#464646]/50 hover:text-[#464646]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Good */}
                <div className="flex-1 border rounded-xl overflow-hidden">
                  <div className="relative">
                    <span className="absolute top-2 right-2 bg-green-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full z-10 flex items-center gap-1">
                      <Check className="w-3 h-3" /> תמונה טובה
                    </span>
                    <div className="h-36 bg-gradient-to-br from-[#f5f0fa] to-[#E4C1F9] flex items-center justify-center">
                      <Sparkles className="w-12 h-12 text-[#5E2F88]/40" />
                    </div>
                  </div>
                  <div className="p-3 text-[13px]">
                    <ul className="text-[#464646]/70 space-y-1 list-disc list-inside">
                      <li>קווים ברורים</li>
                      <li>נושא ברור במרכז</li>
                      <li>ללא רקע עמוס</li>
                    </ul>
                  </div>
                </div>
                {/* Bad */}
                <div className="flex-1 border rounded-xl overflow-hidden">
                  <div className="relative">
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full z-10 flex items-center gap-1">
                      <X className="w-3 h-3" /> לא מתאימה
                    </span>
                    <div className="h-36 bg-gradient-to-br from-[#e8e8e8] to-[#c4c4c4] flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-[#464646]/30" />
                    </div>
                  </div>
                  <div className="p-3 text-[13px]">
                    <ul className="text-[#464646]/70 space-y-1 list-disc list-inside">
                      <li>תמונה ריאליסטית מדי</li>
                      <li>הצללות ואלפי גוונים</li>
                      <li>פרטים קטנים מאוד</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* AI terms modal */}
      {termsModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setTermsModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl w-full max-w-lg max-h-[85dvh] overflow-hidden shadow-2xl flex flex-col"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex justify-between items-center bg-[#fafafa] shrink-0">
              <h3 className="font-bold text-[15px] text-[#581E83]">תנאי שימוש – שירות AI</h3>
              <button type="button" onClick={() => setTermsModalOpen(false)} className="text-[#464646]/50 hover:text-[#464646]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-[13px] text-[#464646]/80 leading-relaxed">
              {AI_TERMS_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h4 className="font-bold text-[#581E83] text-[14px] mb-1.5">{section.title}</h4>
                  {section.body.split('\n').map((paragraph) => (
                    <p key={paragraph} className="mb-2">{paragraph}</p>
                  ))}
                </div>
              ))}
            </div>
            <div className="p-4 border-t bg-[#fafafa] shrink-0">
              <button
                type="button"
                onClick={() => setTermsModalOpen(false)}
                className="w-full bg-[#5E2F88] hover:bg-[#581E83] text-white font-bold py-2.5 rounded-xl transition-colors"
              >
                סגירה
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Retry modal */}
      {retryOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setRetryOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl relative"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setRetryOpen(false)} className="absolute top-3 left-3 text-[#464646]/40 hover:text-[#464646]">
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-lg text-[#581E83] mb-1.5">משהו לא הסתדר?</h3>
            <p className="text-[#464646]/60 text-sm mb-3">ספרו לנו למה תרצו לנסות שוב:</p>

            <select
              value={retryReason}
              onChange={(e) => setRetryReason(e.target.value)}
              className="w-full border border-[#e8e8e8] rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#5E2F88] outline-none mb-3 bg-white cursor-pointer"
            >
              <option value="" disabled>בחרו סיבה...</option>
              <option value="הסקיצה עמוסה מדי בפרטים">הסקיצה עמוסה מדי בפרטים</option>
              <option value="הרקע לא הוסר כראוי">הרקע לא הוסר כראוי</option>
              <option value="חסרים פרטים חשובים">חסרים פרטים חשובים בפנים/רקע</option>
              <option value="הקווים לא מספיק ברורים">הקווים לא מספיק ברורים</option>
              <option value="other">אחר (פירוט חופשי)</option>
            </select>

            {retryReason === 'other' && (
              <div className="mb-3">
                <textarea
                  value={retryText}
                  onChange={(e) => setRetryText(e.target.value)}
                  className="w-full border border-[#e8e8e8] rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#5E2F88] outline-none resize-none h-20"
                  placeholder="פרטו כאן (עד 200 תווים)..."
                  maxLength={200}
                />
                <div className="text-left text-[11px] text-[#464646]/40">{retryText.length} / 200</div>
              </div>
            )}

            <button
              type="button"
              onClick={handleRetrySubmit}
              disabled={!retryReason || (retryReason === 'other' && !retryText.trim())}
              className="w-full bg-[#5E2F88] hover:bg-[#7B3DB0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-colors"
            >
              שליחה וניסיון נוסף
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Global feedback modal */}
      {feedbackOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFeedbackOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl relative"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setFeedbackOpen(false)} className="absolute top-3 left-3 text-[#464646]/40 hover:text-[#464646]">
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-lg text-[#581E83] mb-1.5">יש לכם הערה או הצעה?</h3>
            <p className="text-[#464646]/60 text-sm mb-3">הפיידבק שלכם חשוב לנו ויעזור לנו להשתפר!</p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full border border-[#e8e8e8] rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#5E2F88] outline-none resize-none h-28 mb-3"
              placeholder="שתפו אותנו במחשבות שלכם..."
            />
            <button
              type="button"
              onClick={handleFeedbackSubmit}
              disabled={!feedbackText.trim()}
              className="w-full bg-[#464646] hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-colors"
            >
              שלח פידבק
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Crop modal — opens right after upload (mandatory) and for re-crops */}
      <ImageCropModal
        isOpen={cropOpen}
        imageUrl={imagePreviewUrl}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />

      {/* Blocked (rate limit) modal */}
      {blockedOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBlockedOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center border-t-4 border-red-500"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="font-bold text-lg text-[#581E83] mb-1.5">הגעתם למגבלת הניסיונות</h3>
            <p className="text-[#464646]/60 text-sm mb-5">
              {blockedMessage}
            </p>
            <button
              type="button"
              onClick={() => setBlockedOpen(false)}
              className="w-full bg-[#e8e8e8] hover:bg-[#d5d5d5] text-[#464646] font-bold py-2.5 rounded-xl transition-colors"
            >
              הבנתי
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
