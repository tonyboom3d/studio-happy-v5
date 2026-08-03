import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, X } from 'lucide-react';

export default function EnlargeableSketchImage({
  src,
  alt = '',
  thumbClassName = 'w-12 h-12',
  imageClassName = '',
  title,
}) {
  const [open, setOpen] = useState(false);

  if (!src) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative group shrink-0 rounded-lg overflow-hidden border border-[#e8e8e8] bg-white ${thumbClassName}`}
        aria-label="הגדלת תמונה"
      >
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-contain bg-white ${imageClassName}`}
          style={{ backgroundColor: '#ffffff' }}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
          <ZoomIn className="w-4 h-4 text-white opacity-0 drop-shadow-md transition-opacity group-hover:opacity-100" />
        </span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
              onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
                  className="absolute -top-2 -left-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5" />
                </button>
                {title && (
                  <p className="mb-2 text-center text-sm font-semibold text-white">{title}</p>
                )}
                <div className="overflow-hidden rounded-xl bg-white p-3 shadow-2xl sm:p-5">
                  <img
                    src={src}
                    alt={alt}
                    className="mx-auto max-h-[80dvh] w-full object-contain bg-white"
                    style={{ backgroundColor: '#ffffff' }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
