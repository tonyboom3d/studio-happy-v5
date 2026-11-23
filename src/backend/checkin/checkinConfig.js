/**
 * checkin/checkinConfig.js — feature flag for the self check-in flow.
 * Reads the single `CheckinSettings` CMS row (see wix/src/backend/checkin/README.md
 * for the manual CMS setup). `enabled=false` lets staff test with specific
 * phones (`testPhones`) before going live studio-wide.
 */
import wixData from 'wix-data';
import { getPhoneLookupVariants } from 'backend/orderUtils.js';

const SA = { suppressAuth: true };
const SETTINGS_ID = 'default';
const DEFAULT_WINDOW_BEFORE_MIN = 60;
const CACHE_MS = 30000;

let cached = null;
let cachedAt = 0;

async function loadSettingsRow() {
    if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
    const row = await wixData.get('CheckinSettings', SETTINGS_ID, SA).catch(() => null);
    cached = row || { enabled: false, testPhones: '', windowBeforeMin: DEFAULT_WINDOW_BEFORE_MIN };
    cachedAt = Date.now();
    return cached;
}

function parseTestPhones(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

export async function getCheckinSettings() {
    const row = await loadSettingsRow();
    const windowBeforeMin = Number(row.windowBeforeMin);
    return {
        enabled: !!row.enabled,
        windowBeforeMin: windowBeforeMin > 0 ? windowBeforeMin : DEFAULT_WINDOW_BEFORE_MIN,
    };
}

/** True when the flow is live site-wide, OR this phone is one of the configured test phones. */
export async function isCheckinAllowedForPhone(phone) {
    const row = await loadSettingsRow();
    if (row.enabled) return true;

    const testPhones = parseTestPhones(row.testPhones);
    if (!testPhones.length) return false;

    const variants = new Set(getPhoneLookupVariants(phone));
    return testPhones.some((tp) => getPhoneLookupVariants(tp).some((v) => variants.has(v)));
}
