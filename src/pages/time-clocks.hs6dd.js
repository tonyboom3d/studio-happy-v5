
import wixLocation from 'wix-location';
import { getClockStatus, clockAction } from 'backend/timeClockService.web.js';

const ELEMENT_ID = '#timeClock1';

$w.onReady(async function () {
    console.log('[time-clock] $w.onReady fired');

    const el = $w(ELEMENT_ID);
    if (!el) {
        console.error(`[time-clock] ELEMENT NOT FOUND: ${ELEMENT_ID}`);
        return;
    }

    const stationKey = wixLocation.query?.station || null;
    console.log('[time-clock] station:', stationKey || '(none)');

    el.on('clock-action', async (event) => {
        const taskType = event.detail?.taskType || null;
        console.log('[time-clock] page ← clock-action', taskType || '(out)');
        try {
            const result = await clockAction(taskType);
            console.log('[time-clock] clockAction result', result.action);
            el.setAttribute('clock-result', JSON.stringify({ ...result, __ts: Date.now() }));
            await loadStatus(el, stationKey);
        } catch (err) {
            const message = err?.message || String(err);
            console.error('[time-clock] clockAction failed:', message);
            const parts = message.split(':');
            const friendly = parts.length > 1 && /[\u0590-\u05FF]/.test(parts.slice(1).join(':')) ?
                parts.slice(1).join(':').trim() :
                'אירעה שגיאה. נסו שוב.';
            el.setAttribute('clock-result', JSON.stringify({ error: true, message: friendly, __ts: Date.now() }));
        }
    });

    await loadStatus(el, stationKey);
});

async function loadStatus(el, stationKey) {
    try {
        console.log('[time-clock] calling getClockStatus()…');
        const data = await getClockStatus(stationKey);
        console.log('[time-clock] status loaded', { open: !!data.openEntry });
        el.setAttribute('clock-data', JSON.stringify({ ...data, __ts: Date.now() }));
    } catch (err) {
        const message = err?.message || String(err);
        console.error('[time-clock] getClockStatus failed:', message);
        el.setAttribute('clock-data', JSON.stringify({
            error: true,
            message: message.startsWith('ACCESS_DENIED') || message.startsWith('PERMISSION_DENIED') ?
                'אין הרשאה — יש להתחבר עם חשבון עובד/ת.' :
                'שגיאה בטעינת השעון. נסו לרענן.',
            __ts: Date.now(),
        }));
    }
}