import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Crop as CropIcon, Loader2, Square, Shapes, RotateCcw } from 'lucide-react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const MAX_OUTPUT_DIMENSION = 2048;
const MIN_OUTPUT_DIMENSION = 600;
// Wix web methods hard-cap the request payload at ~512KB. Budget well under
// that (data-URL string length ≈ bytes sent, since base64 chars need no
// JSON escaping) so VALIDATE_IMAGE / GENERATE_SKETCH calls never 413.
const TARGET_MAX_DATAURL_LENGTH = 430 * 1024;
const JPEG_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

/**
 * Renders via `renderFn(width, height)` and re-encodes as JPEG, stepping
 * down quality then dimensions until the payload fits TARGET_MAX_DATAURL_LENGTH
 * (or the size/quality floor is hit — that result is returned regardless).
 */
function encodeCanvasWithBudget(renderFn, initialWidth, initialHeight) {
  let width = initialWidth;
  let height = initialHeight;

  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = renderFn(width, height);
    const atSizeFloor = width <= MIN_OUTPUT_DIMENSION || height <= MIN_OUTPUT_DIMENSION;

    for (let qi = 0; qi < JPEG_QUALITY_STEPS.length; qi++) {
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY_STEPS[qi]);
      const isLastOption = atSizeFloor && qi === JPEG_QUALITY_STEPS.length - 1;
      if (dataUrl.length <= TARGET_MAX_DATAURL_LENGTH || isLastOption) {
        return dataUrl;
      }
    }

    const scale = Math.max(
      MIN_OUTPUT_DIMENSION / Math.max(width, height),
      0.75,
    );
    width = Math.max(MIN_OUTPUT_DIMENSION, Math.round(width * scale));
    height = Math.max(MIN_OUTPUT_DIMENSION, Math.round(height * scale));
  }
  return renderFn(MIN_OUTPUT_DIMENSION, MIN_OUTPUT_DIMENSION).toDataURL('image/jpeg', 0.4);
}

function renderRectCanvas(imageEl, crop, scaleX, scaleY, outWidth, outHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outWidth, outHeight);
  ctx.drawImage(
    imageEl,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    outWidth,
    outHeight,
  );
  return canvas;
}

function getCroppedBase64(imageEl, crop) {
  const scaleX = imageEl.naturalWidth / imageEl.width;
  const scaleY = imageEl.naturalHeight / imageEl.height;

  let outWidth = Math.round(crop.width * scaleX);
  let outHeight = Math.round(crop.height * scaleY);
  if (outWidth < 1 || outHeight < 1) return null;

  // Cap output size so the base64 payload stays postMessage/webMethod-friendly
  const scaleDown = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(outWidth, outHeight));
  outWidth = Math.round(outWidth * scaleDown);
  outHeight = Math.round(outHeight * scaleDown);

  return encodeCanvasWithBudget(
    (w, h) => renderRectCanvas(imageEl, crop, scaleX, scaleY, w, h),
    outWidth,
    outHeight,
  );
}

function renderFreeShapeCanvas(imageEl, natural, minX, minY, cropW, cropH, outWidth, outHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');

  // White background everywhere (outside the drawn shape stays white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outWidth, outHeight);

  const scaleDown = outWidth / cropW;
  ctx.save();
  ctx.beginPath();
  natural.forEach((p, i) => {
    const x = (p.x - minX) * scaleDown;
    const y = (p.y - minY) * scaleDown;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(imageEl, minX, minY, cropW, cropH, 0, 0, outWidth, outHeight);
  ctx.restore();

  return canvas;
}

function getFreeShapeCroppedBase64(imageEl, points) {
  if (!points || points.length < 3) return null;

  const scaleX = imageEl.naturalWidth / imageEl.width;
  const scaleY = imageEl.naturalHeight / imageEl.height;
  const natural = points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));

  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  natural.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(imageEl.naturalWidth, Math.ceil(maxX));
  maxY = Math.min(imageEl.naturalHeight, Math.ceil(maxY));

  const cropW = maxX - minX;
  const cropH = maxY - minY;
  if (cropW < 4 || cropH < 4) return null;

  const scaleDown = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(cropW, cropH));
  const outWidth = Math.round(cropW * scaleDown);
  const outHeight = Math.round(cropH * scaleDown);

  return encodeCanvasWithBudget(
    (w, h) => renderFreeShapeCanvas(imageEl, natural, minX, minY, cropW, cropH, w, h),
    outWidth,
    outHeight,
  );
}

/**
 * Freehand lasso overlay: the user draws around the area they want to keep.
 */
function FreeShapeCanvas({ imageUrl, imgRef, points, setPoints, isClosed, setIsClosed }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const drawingRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const syncCanvasSize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setCanvasSize({ w: img.width, h: img.height });
  }, [imgRef]);

  useEffect(() => {
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // Redraw overlay whenever points change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize.w) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points.length === 0) return;

    // Dim everything, then punch out the selected shape
    if (isClosed && points.length >= 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (isClosed) ctx.closePath();
    ctx.strokeStyle = '#5E2F88';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [points, isClosed, canvasSize]);

  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    return { x, y };
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    setIsClosed(false);
    const p = getPoint(e);
    if (p) setPoints([p]);
  }, [getPoint, setPoints, setIsClosed]);

  const onPointerMove = useCallback((e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = getPoint(e);
    if (!p) return;
    setPoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.x - p.x) < 3 && Math.abs(last.y - p.y) < 3) return prev;
      return [...prev, p];
    });
  }, [getPoint, setPoints]);

  const onPointerUp = useCallback((e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    setPoints((prev) => {
      if (prev.length >= 3) {
        setIsClosed(true);
        return prev;
      }
      setIsClosed(false);
      return [];
    });
  }, [setPoints, setIsClosed]);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Crop"
        draggable={false}
        onLoad={syncCanvasSize}
        style={{ maxHeight: '48dvh', maxWidth: '100%', display: 'block' }}
      />
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="absolute inset-0 touch-none cursor-crosshair"
        style={{ width: canvasSize.w, height: canvasSize.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

/**
 * Crop modal with two modes:
 *  - 'rect' (default): rectangular / square drag crop
 *  - 'free': freehand lasso — the user draws the exact area to keep
 * Returns a white-flattened PNG base64 via onConfirm(base64, mode).
 */
export default function ImageCropModal({ isOpen, imageUrl, onCancel, onConfirm }) {
  const [mode, setMode] = useState('rect');
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [freePoints, setFreePoints] = useState([]);
  const [freeClosed, setFreeClosed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef(null);
  const freeImgRef = useRef(null);

  // Reset state each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('rect');
      setCrop(null);
      setCompletedCrop(null);
      setFreePoints([]);
      setFreeClosed(false);
      setProcessing(false);
    }
  }, [isOpen, imageUrl]);

  const onImageLoad = useCallback((e) => {
    const { width, height } = e.currentTarget;
    const initial = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, width / height, width, height),
      width,
      height,
    );
    setCrop(initial);
  }, []);

  const canConfirm = mode === 'rect'
    ? !!(completedCrop?.width && completedCrop?.height)
    : (freeClosed && freePoints.length >= 3);

  const handleConfirm = useCallback(() => {
    setProcessing(true);
    try {
      let base64 = null;
      if (mode === 'rect') {
        if (imgRef.current && completedCrop?.width && completedCrop?.height) {
          base64 = getCroppedBase64(imgRef.current, completedCrop);
        }
      } else if (freeImgRef.current && freeClosed && freePoints.length >= 3) {
        base64 = getFreeShapeCroppedBase64(freeImgRef.current, freePoints);
      }
      if (base64) onConfirm(base64, mode);
      else onCancel();
    } finally {
      setProcessing(false);
    }
  }, [mode, completedCrop, freePoints, freeClosed, onConfirm, onCancel]);

  if (!isOpen || !imageUrl) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b bg-[#fafafa] flex justify-between items-center shrink-0">
          <h3 className="font-bold text-[14px] text-[#581E83] flex items-center gap-2">
            <CropIcon className="w-4 h-4" /> חיתוך התמונה
          </h3>
          <button type="button" onClick={onCancel} className="text-[#464646]/50 hover:text-[#464646]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-3 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('rect')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-[13px] font-bold transition-all ${
                mode === 'rect'
                  ? 'border-[#5E2F88] bg-[#f5f0fa] text-[#5E2F88]'
                  : 'border-[#e8e8e8] bg-white text-[#464646]/60'
              }`}
            >
              <Square className="w-4 h-4" /> ריבוע / מלבן
            </button>
            <button
              type="button"
              onClick={() => setMode('free')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-[13px] font-bold transition-all ${
                mode === 'free'
                  ? 'border-[#5E2F88] bg-[#f5f0fa] text-[#5E2F88]'
                  : 'border-[#e8e8e8] bg-white text-[#464646]/60'
              }`}
            >
              <Shapes className="w-4 h-4" /> צורה חופשית
            </button>
          </div>
        </div>

        <div className="p-3 overflow-y-auto">
          <p className="text-[12px] text-[#464646]/60 mb-2 text-center">
            {mode === 'rect'
              ? 'גררו את המסגרת כדי למקד את האזור שיהפוך לסקיצה'
              : 'ציירו עם האצבע סביב האזור המדויק שתרצו לשמור'}
          </p>
          <div className="flex justify-center bg-[#f5f5f5] rounded-xl p-2 overflow-hidden">
            {mode === 'rect' ? (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Crop"
                  onLoad={onImageLoad}
                  style={{ maxHeight: '48dvh', maxWidth: '100%' }}
                />
              </ReactCrop>
            ) : (
              <FreeShapeCanvas
                imageUrl={imageUrl}
                imgRef={freeImgRef}
                points={freePoints}
                setPoints={setFreePoints}
                isClosed={freeClosed}
                setIsClosed={setFreeClosed}
              />
            )}
          </div>
          {mode === 'free' && freePoints.length > 0 && (
            <button
              type="button"
              onClick={() => { setFreePoints([]); setFreeClosed(false); }}
              className="mt-2 mx-auto flex items-center gap-1.5 text-[12px] font-semibold text-[#5E2F88] hover:underline"
            >
              <RotateCcw className="w-3.5 h-3.5" /> ניקוי וציור מחדש
            </button>
          )}
        </div>

        <div className="p-3 pt-0 flex gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing || !canConfirm}
            className="flex-1 bg-[#5E2F88] hover:bg-[#7B3DB0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            אישור חיתוך
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-[#f5f5f5] hover:bg-[#e8e8e8] text-[#464646] font-bold py-2.5 rounded-xl transition-colors"
          >
            ביטול
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
