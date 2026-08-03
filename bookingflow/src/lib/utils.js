import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

/** True when URL contains test=true (search or hash query, e.g. #/order?test=true). */
export function isAiTestModeEnabled() {
  if (typeof window === 'undefined') return false;
  const hasTest = (params) => params.get('test') === 'true';
  if (hasTest(new URLSearchParams(window.location.search))) return true;
  const hash = window.location.hash || '';
  const qIdx = hash.indexOf('?');
  if (qIdx >= 0) return hasTest(new URLSearchParams(hash.slice(qIdx + 1)));
  return false;
}

export function isAiFeatureEnabled() {
  return true;
}

const CATALOG_CACHE_KEY = 'studio_happy_catalog_v1';

export function readCatalogCache() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCatalogCache(products) {
  if (typeof window === 'undefined' || !products?.length) return;
  try {
    sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(products));
  } catch {}
}

/** Parse Wix CMS tags / multi-select values that may arrive as array, JSON string, or double-encoded string. */
export function parseCmsTagsField(raw) {
  if (raw == null || raw === '') return '';

  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first.trim() : String(first ?? '').trim();
  }

  if (typeof raw !== 'string') return String(raw).trim();

  const trimmed = raw.trim();
  if (!trimmed) return '';

  const tryParseArray = (value) => {
    if (typeof value !== 'string' || !value.startsWith('[')) return '';
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return String(parsed[0]).trim();
      }
    } catch {}
    return '';
  };

  const fromJson = tryParseArray(trimmed);
  if (fromJson) return fromJson;

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const unquoted = JSON.parse(trimmed);
      if (typeof unquoted === 'string') {
        const nested = tryParseArray(unquoted);
        if (nested) return nested;
        return unquoted.trim();
      }
    } catch {}
  }

  return trimmed;
}

export function getDifficultyLabel(product) {
  return parseCmsTagsField(product?.difficulty);
}

export function getDifficultyTextClass(label) {
  if (!label) return 'text-[#464646]/70';
  const l = label.toLowerCase().trim();
  if (l === 'קל' || l === 'easy') return 'text-green-600';
  if (l === 'בינוני' || l === 'medium') return 'text-orange-500';
  if (l === 'קשה' || l === 'hard' || l === 'מאתגר') return 'text-red-600';
  return 'text-[#464646]/70';
}

export function isHardDifficulty(label) {
  if (!label) return false;
  const l = label.toLowerCase();
  return l === 'קשה' || l === 'hard' || l === 'מאתגר';
}

const HARD_SKETCH_WARNING_KEY = 'studio_happy_hard_sketch_warning_ack';

export function isHardSketchWarningDismissed() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(HARD_SKETCH_WARNING_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissHardSketchWarning() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HARD_SKETCH_WARNING_KEY, '1');
  } catch {}
}

/** Authoritative stored size in CMS — 60x60 until upgrade is paid. */
export function getSelectionStoredSize(sel) {
  return sel?.canvasSize || '60x60';
}

/** UI/reporting size — shows 90 intent while upgrade is unpaid. */
export function getSelectionDisplaySize(sel) {
  if (!sel) return '60x60';
  if (sel.upgradePaymentStatus === 'paid') return sel.canvasSize || '90x90';
  if (sel.requestedCanvasSize === '90x90') return '90x90';
  if (sel.upgradePaymentStatus === 'pending-upgrade' || sel.upgradePaymentStatus === 'pending-payment-approval') {
    return '90x90';
  }
  // Legacy records may still store 90x90 before payment
  if (sel.canvasSize === '90x90' && sel.upgradePaymentStatus !== 'failed') return '90x90';
  return sel.canvasSize || '60x60';
}

export function selectionWants90Upgrade(sel) {
  if (!sel || sel.upgradePaymentStatus === 'paid' || sel.upgradePaymentStatus === 'failed') return false;
  if (sel.requestedCanvasSize === '90x90') return true;
  if (sel.upgradePaymentStatus === 'pending-upgrade' || sel.upgradePaymentStatus === 'pending-payment-approval') {
    return true;
  }
  return sel.canvasSize === '90x90';
}
