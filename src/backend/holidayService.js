/**
 * Jewish-holiday sync (Hebcal) — internal module, no web methods.
 *
 * No dedicated CMS collection: holidays live in the `holidays` JSON field
 * that already exists on the AvailabilitySettings row (see
 * staffAdminService.updateHolidays / schedulingEngine.loadSettings). Each
 * entry: { date, name, hebcalId, mode, shortStart, shortEnd }.
 * `mode` ('' | 'CLOSED' | 'SHORT') and the short-day hours are manager-set
 * and are always preserved across re-syncs — only `name`/`hebcalId` for a
 * given date get refreshed from Hebcal.
 *
 * Hebcal's JSON endpoint (hebcal.com/hebcal) is public, free and needs no
 * API key.
 */
import wixData from 'wix-data';
import { fetch } from 'wix-fetch';
import { publishSchedulingUpdate } from 'backend/schedulingEngine.js';

const SA = { suppressAuth: true };
const HEBCAL_URL = (year) =>
    `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&mod=off&nx=off&year=${year}&lg=he`;

async function loadSettingsRow() {
    const result = await wixData.query('AvailabilitySettings')
        .eq('settingKey', 'default').limit(1).find(SA).catch(() => ({ items: [] }));
    return result.items?.[0] || null;
}

function parseHolidaysField(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
        try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
    }
    return [];
}

/**
 * Fetches Hebcal's major holidays for `year` and merges them into
 * AvailabilitySettings.holidays: new dates are added (mode ''), existing
 * dates keep their manager-set mode/shortStart/shortEnd — only name/hebcalId
 * are refreshed.
 */
export async function syncHebcalHolidays(year) {
    const y = Number(year) || new Date().getFullYear();
    const response = await fetch(HEBCAL_URL(y), { method: 'GET' });
    if (!response.ok) throw new Error(`HEBCAL_FETCH_FAILED: status ${response.status}`);
    const data = await response.json();

    const fetched = (data?.items || [])
        .filter(item => item.category === 'holiday' && item.date)
        .map(item => ({ date: String(item.date).slice(0, 10), name: item.title || item.hebrew || 'חג', hebcalId: item.hebrew || item.title || '' }));

    const row = await loadSettingsRow();
    if (!row) throw new Error('NOT_FOUND: שורת AvailabilitySettings לא נמצאה.');

    const existing = parseHolidaysField(row.holidays);
    const byDate = {};
    for (const h of existing) if (h?.date) byDate[h.date] = h;

    let added = 0, refreshed = 0;
    for (const h of fetched) {
        if (byDate[h.date]) {
            byDate[h.date] = { ...byDate[h.date], name: h.name, hebcalId: h.hebcalId };
            refreshed++;
        } else {
            byDate[h.date] = { date: h.date, name: h.name, hebcalId: h.hebcalId, mode: '', shortStart: '', shortEnd: '' };
            added++;
        }
    }

    const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    await wixData.update('AvailabilitySettings', { ...row, holidays: JSON.stringify(merged) }, SA);
    await publishSchedulingUpdate('holidays-updated', { source: 'hebcal', year: y });
    console.log(`[holidayService] syncHebcalHolidays: year=${y} added=${added} refreshed=${refreshed} total=${merged.length}`);
    return { ok: true, year: y, added, refreshed, total: merged.length };
}

/** Auto-syncs the current + next year the first time either is missing (called from the daily job). */
export async function ensureHolidaysSynced(now = new Date()) {
    const row = await loadSettingsRow();
    const existing = parseHolidaysField(row?.holidays);
    const years = [now.getFullYear(), now.getFullYear() + 1];
    const results = [];
    for (const y of years) {
        const hasYear = existing.some(h => String(h.date || '').startsWith(String(y)));
        if (hasYear) continue;
        const r = await syncHebcalHolidays(y).catch(err => {
            console.error(`[holidayService] ensureHolidaysSynced: sync failed for ${y}:`, err?.message || err);
            return null;
        });
        if (r) results.push(r);
    }
    return { synced: results };
}
