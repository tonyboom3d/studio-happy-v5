/**
 * Readable source copy for the promo popup.
 * Wix Custom Code limit: 15,000 chars — paste promo-popup-standalone.html (minified, ~10k).
 * Edit CONFIG here, then sync changes into the minified .html before pasting into Wix.
 */
(function () {
    'use strict';

    // --- CONFIG (edit here in Custom Code, or mirror promoCampaignConfig.js) ---
    var CONFIG = {
        enabled: true,
        endsAt: '2026-11-01T00:00:00+03:00',
        previewToken: 'studio-happy-tufting-promo',
        logoUrl: 'https://static.wixstatic.com/media/6b73e9_6e7c52763bb24ba6812aaac51ecb4296~mv2.png',
        title: '🔥 מבצע חד פעמי - לזמן מוגבל!',
        subtitle: 'על כל שטיח שקונים בסדנת הטאפטינג — מקבלים סדנת צביעת קרמיקה בחינם! המבצע מסתיים בסוף אוקטובר ומספר המקומות מוגבל.',
        ctaText: '← להזמנה עכשיו לפני שייגמר!',
        cdLabel: '⏰ המבצע נסגר בסוף השבוע — נותרו:',
        ctaUrl: 'https://www.studiohappy.art/booking-flow-tufting',
        termsText: [
            '• סדנת צביעת הקרמיקה במתנה הינה באורך של עד שעה.',
            '• עבור כל שטיח שמוזמן במסגרת סדנת הטאפטינג, מקבלים כלי קרמיקה אחד לצביעה במתנה.',
            '• המבצע תקף למימוש בימים א׳–ה׳ בלבד, כולל ימי חול המועד סוכות.',
            '• לאחר הזמנת סדנת הטאפטינג יישלח ללקוח קוד קופון אישי במייל וב-WhatsApp.',
            '• הקופון הינו אישי, חד-פעמי ואינו ניתן להעברה.',
            '• ניתן לממש את הקופון עד 6 חודשים ממועד הזמנת סדנת הטאפטינג.',
            '• הקופון ניתן למימוש רק לאחר ההשתתפות בפועל בסדנת הטאפטינג.',
            '• במקרה של ביטול סדנת הטאפטינג או אי-הגעה, הקופון יבוטל.',
            '• במקרה של שינוי מועד סדנת הטאפטינג, מועד המימוש יתעדכן לתאריך הסדנה החדש.',
            '• מימוש ההטבה כפוף לזמינות המקומות בסדנאות ולביצוע הזמנה מראש.',
            '• הקופון אינו ניתן להמרה לכסף או לזיכוי.',
            '• כלי הצביעה הינם מתוך מבחר משתנה שנבחר על ידי צוות הסטודיו והמלאי הקיים.',
            '• הסטודיו רשאי להפסיק את המבצע בכל עת.',
            'ט.ל.ח',
        ].join('\n'),
    };

    var SEEN_KEY_PREFIX = 'sh_promo_seen_';
    var STYLE_ID = 'sh-promo-popup-styles';
    var FONT_ID = 'sh-promo-rubik-font';
    var ROOT_ID = 'sh-promo-popup-root';
    var countdownTimer = null;

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function getQueryParam(name) {
        try {
            return new URLSearchParams(window.location.search).get(name) || '';
        } catch (_) {
            return '';
        }
    }

    function isTruthyParam(name) {
        var v = String(getQueryParam(name) || '').trim().toLowerCase();
        return v === '1' || v === 'true' || v === 'yes';
    }

    function isCampaignExpired() {
        if (!CONFIG.endsAt) return false;
        return Date.now() >= new Date(CONFIG.endsAt).getTime();
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    var ISRAEL_TZ = 'Asia/Jerusalem';
    var DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    function getIsraelParts(ms) {
        var d = new Date(ms);
        var wd = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, weekday: 'short' }).format(d);
        var time = new Intl.DateTimeFormat('en-GB', {
            timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(d).split(':');
        return { dow: DOW_MAP[wd], hour: +time[0], minute: +time[1] };
    }

    /** Next Sunday 00:00 Israel — weekly reset anchor. */
    function getNextSundayMidnightIsraelMs(fromMs) {
        var now = fromMs || Date.now();
        var parts = getIsraelParts(now);
        var daysToAdd = parts.dow ? 7 - parts.dow : 7;
        var ymd = new Intl.DateTimeFormat('en-CA', {
            timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(now)).split('-');
        var guess = Date.UTC(+ymd[0], +ymd[1] - 1, +ymd[2] + daysToAdd, 21, 0, 0);
        for (var offset = -6; offset <= 6; offset++) {
            var cand = guess + offset * 3600000;
            var p = getIsraelParts(cand);
            if (p.dow === 0 && p.hour === 0 && p.minute === 0) return cand;
        }
        return guess;
    }

    /** Countdown target = earlier of campaign end or next Sunday 00:00 Israel. */
    function getCountdownTargetMs() {
        var campEnd = new Date(CONFIG.endsAt).getTime();
        var now = Date.now();
        if (now >= campEnd) return campEnd;
        var weekEnd = getNextSundayMidnightIsraelMs(now);
        if (weekEnd <= now) weekEnd = getNextSundayMidnightIsraelMs(now + 3600000);
        return Math.min(campEnd, weekEnd);
    }

    function getCountdownParts() {
        var diff = Math.max(0, getCountdownTargetMs() - Date.now());
        var totalSec = Math.floor(diff / 1000);
        return {
            days: Math.floor(totalSec / 86400),
            hours: Math.floor((totalSec % 86400) / 3600),
            minutes: Math.floor((totalSec % 3600) / 60),
            seconds: totalSec % 60,
        };
    }

    function stopCountdownTimer() {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }

    function updateCountdownDom(root) {
        var parts = getCountdownParts();
        var map = { days: parts.days, hours: parts.hours, minutes: parts.minutes, seconds: parts.seconds };
        Object.keys(map).forEach(function (unit) {
            var el = root.querySelector('[data-countdown="' + unit + '"]');
            if (el) el.textContent = pad2(map[unit]);
        });
    }

    function startCountdownTimer(root, state) {
        stopCountdownTimer();
        if (!CONFIG.endsAt || isCampaignExpired()) return;
        updateCountdownDom(root);
        countdownTimer = setInterval(function () {
            if (isCampaignExpired()) {
                stopCountdownTimer();
                closePopup(root);
                return;
            }
            updateCountdownDom(root);
        }, 1000);
    }

    function resolveCampaign() {
        var content = {
            title: CONFIG.title,
            subtitle: CONFIG.subtitle,
            ctaText: CONFIG.ctaText,
            ctaUrl: CONFIG.ctaUrl,
            termsText: CONFIG.termsText,
        };
        var token = String(getQueryParam('promo') || '').trim();
        var tokenMatch = !!(token && CONFIG.previewToken && token === CONFIG.previewToken);
        var termsParam = isTruthyParam('terms');

        // Share link: ?promo=<token>&terms=1 — terms-only popup, ignores campaign end date.
        if (termsParam && tokenMatch && content.termsText) {
            return {
                show: true,
                content: content,
                termsOnly: true,
                termsOpen: false,
                forceShow: true,
            };
        }

        if (isCampaignExpired()) {
            return { show: false, content: content, termsOpen: false, termsOnly: false, forceShow: false };
        }
        var deepLink = termsParam && (CONFIG.enabled || tokenMatch);

        if (CONFIG.enabled) {
            return {
                show: true,
                preview: false,
                content: content,
                termsOpen: termsParam,
                termsOnly: false,
                forceShow: deepLink,
            };
        }
        if (tokenMatch) {
            return {
                show: true,
                preview: true,
                content: content,
                termsOpen: termsParam,
                termsOnly: false,
                forceShow: true,
            };
        }
        return { show: false, content: content, termsOpen: false, termsOnly: false, forceShow: false };
    }

    function seenKey(c) {
        return (SEEN_KEY_PREFIX + (c.title || '') + (c.ctaUrl || '')).slice(0, 200);
    }

    function wasShownThisVisit(c) {
        try {
            return sessionStorage.getItem(seenKey(c)) === '1';
        } catch (_) {
            return false;
        }
    }

    function markShownThisVisit(c) {
        try {
            sessionStorage.setItem(seenKey(c), '1');
        } catch (_) { /* ignore */ }
    }

    function injectFonts() {
        if (document.getElementById(FONT_ID)) return;
        var link = document.createElement('link');
        link.id = FONT_ID;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700;800&display=swap';
        document.head.appendChild(link);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '#sh-promo-popup-root, #sh-promo-popup-root * {',
            '  font-family: "Rubik", Arial, Helvetica, sans-serif;',
            '}',
            '#sh-promo-popup-root .pp-overlay {',
            '  position: fixed; inset: 0; z-index: 99999;',
            '  background: rgba(15, 25, 40, 0.45); backdrop-filter: blur(4px);',
            '  display: flex; align-items: center; justify-content: center;',
            '  padding: 20px;',
            '  animation: sh-pp-overlay-in .45s cubic-bezier(.22, 1, .36, 1) both;',
            '}',
            '#sh-promo-popup-root .pp-overlay-exit { animation: sh-pp-overlay-out .38s cubic-bezier(.4, 0, .2, 1) forwards; }',
            '@keyframes sh-pp-overlay-in { from { opacity: 0; backdrop-filter: blur(0); } to { opacity: 1; backdrop-filter: blur(4px); } }',
            '@keyframes sh-pp-overlay-out { from { opacity: 1; backdrop-filter: blur(4px); } to { opacity: 0; backdrop-filter: blur(0); } }',
            '#sh-promo-popup-root .pp-card {',
            '  position: relative;',
            '  background: linear-gradient(165deg, #ffffff 0%, #ffffff 62%, #eef9fd 100%);',
            '  border: 1px solid rgba(120, 200, 230, 0.22); border-radius: 20px;',
            '  max-width: 440px; width: 100%; max-height: 90vh; overflow-y: auto;',
            '  padding: 32px 28px 26px; box-shadow: 0 24px 60px rgba(30, 80, 120, .18);',
            '  text-align: center; direction: rtl;',
            '  animation: sh-pp-card-in .55s cubic-bezier(.22, 1.15, .36, 1) both;',
            '}',
            '#sh-promo-popup-root .pp-card-exit { animation: sh-pp-card-out .38s cubic-bezier(.4, 0, .2, 1) forwards; }',
            '@keyframes sh-pp-card-in {',
            '  from { opacity: 0; transform: translateY(48px) scale(0.82) rotate(-2deg); }',
            '  70% { transform: translateY(-6px) scale(1.02) rotate(0.5deg); }',
            '  to { opacity: 1; transform: translateY(0) scale(1) rotate(0); }',
            '}',
            '@keyframes sh-pp-card-out {',
            '  from { opacity: 1; transform: translateY(0) scale(1); }',
            '  to { opacity: 0; transform: translateY(-36px) scale(0.88); }',
            '}',
            '#sh-promo-popup-root .pp-close {',
            '  position: absolute; top: 12px; inset-inline-end: 12px;',
            '  width: 34px; height: 34px; border-radius: 50%; border: none;',
            '  background: rgba(0,0,0,.06); color: #6b5b4d; font-size: 18px; line-height: 1; cursor: pointer;',
            '}',
            '#sh-promo-popup-root .pp-close:hover { background: rgba(0,0,0,.12); }',
            '#sh-promo-popup-root .pp-logo { width: 72px; height: 72px; margin: 0 auto 10px; display: block; object-fit: contain; }',
            '#sh-promo-popup-root .pp-fomo-badge { display: inline-block; background: linear-gradient(90deg, #e84393, #ff6b6b); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 10px; letter-spacing: .03em; }',
            '#sh-promo-popup-root .pp-title { font-size: 22px; font-weight: 800; color: #3d2b1f; margin: 0 0 8px; line-height: 1.3; }',
            '#sh-promo-popup-root .pp-subtitle { font-size: 15px; color: #6b5b4d; margin: 0 0 18px; line-height: 1.6; white-space: pre-wrap; }',
            '#sh-promo-popup-root .pp-countdown-wrap { margin: 0 0 20px; }',
            '#sh-promo-popup-root .pp-countdown-label { font-size: 13px; color: #8a7462; margin: 0 0 10px; font-weight: 600; letter-spacing: .02em; }',
            '#sh-promo-popup-root .pp-countdown { display: flex; justify-content: center; gap: 8px; direction: ltr; }',
            '#sh-promo-popup-root .pp-countdown-unit { background: linear-gradient(180deg, #fff 0%, #f4fcff 100%); border: 1px solid rgba(120, 200, 230, .25); border-radius: 12px; min-width: 56px; padding: 10px 6px 8px; box-shadow: 0 2px 10px rgba(120, 200, 230, .12); }',
            '#sh-promo-popup-root .pp-countdown-num { display: block; font-size: 22px; font-weight: 800; color: #e84393; line-height: 1.1; font-variant-numeric: tabular-nums; }',
            '#sh-promo-popup-root .pp-countdown-cap { display: block; font-size: 11px; color: #8a7462; margin-top: 4px; font-weight: 600; }',
            '#sh-promo-popup-root .pp-cta {',
            '  position: relative; display: inline-flex; align-items: center; justify-content: center;',
            '  width: 100%; box-sizing: border-box; min-height: 50px;',
            '  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);',
            '  color: #fff; font-weight: 700; font-size: 16px;',
            '  border: none; border-radius: 12px; padding: 14px 20px; cursor: pointer; text-decoration: none;',
            '  box-shadow: 0 8px 22px rgba(109, 40, 217, .28);',
            '  animation: sh-pp-cta-pulse 2s ease-in-out infinite;',
            '}',
            '@keyframes sh-pp-cta-pulse {',
            '  0%, 100% { box-shadow: 0 8px 22px rgba(109, 40, 217, .28); transform: scale(1); }',
            '  50% { box-shadow: 0 10px 32px rgba(109, 40, 217, .45), 0 0 0 5px rgba(109, 40, 217, .12); transform: scale(1.02); }',
            '}',
            '#sh-promo-popup-root .pp-cta:hover { transform: translateY(-1px) scale(1.02); }',
            '#sh-promo-popup-root .pp-cta-loading { pointer-events: none; opacity: .92; transform: none; animation: none !important; }',
            '#sh-promo-popup-root .pp-cta-label { transition: opacity .2s ease; }',
            '#sh-promo-popup-root .pp-cta-loading .pp-cta-label { opacity: 0; }',
            '#sh-promo-popup-root .pp-cta-spinner {',
            '  position: absolute; width: 24px; height: 24px;',
            '  border: 3px solid rgba(255,255,255,.35); border-top-color: #fff;',
            '  border-radius: 50%; animation: sh-pp-spin .75s linear infinite;',
            '}',
            '@keyframes sh-pp-spin { to { transform: rotate(360deg); } }',
            '#sh-promo-popup-root .pp-terms-toggle {',
            '  margin-top: 16px; background: none; border: none; color: #8a7462;',
            '  font-size: 13px; text-decoration: underline; cursor: pointer; padding: 4px;',
            '}',
            '#sh-promo-popup-root .pp-terms {',
            '  margin-top: 10px; text-align: right; font-size: 12px; color: #8a7462;',
            '  white-space: pre-wrap; line-height: 1.6; max-height: 220px; overflow-y: auto;',
            '  background: rgba(0,0,0,.03); border-radius: 10px; padding: 12px;',
            '}',
            '#sh-promo-popup-root .pp-card.pp-terms-only .pp-terms {',
            '  margin-top: 14px; max-height: min(65vh, 480px); font-size: 13px;',
            '}',
            '#sh-promo-popup-root .pp-hidden { display: none !important; }',
        ].join('\n');
        document.head.appendChild(style);
    }

    function ensureRoot() {
        var root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        return root;
    }

    function closePopup(root, onDone) {
        var overlay = root.querySelector('.pp-overlay');
        if (!overlay) {
            stopCountdownTimer();
            root.innerHTML = '';
            if (onDone) onDone();
            return;
        }
        overlay.classList.add('pp-overlay-exit');
        var card = overlay.querySelector('.pp-card');
        if (card) card.classList.add('pp-card-exit');
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            stopCountdownTimer();
            root.innerHTML = '';
            if (onDone) onDone();
        }
        overlay.addEventListener('animationend', finish, { once: true });
        setTimeout(finish, 450);
    }

    function renderTermsOnly(root, c) {
        if (!c.termsText) {
            closePopup(root);
            return;
        }
        root.innerHTML =
            '<div class="pp-overlay" data-action="overlay">' +
            '  <div class="pp-card pp-terms-only" role="dialog" aria-modal="true" aria-labelledby="sh-pp-terms-title">' +
            '    <button type="button" class="pp-close" data-action="close" aria-label="סגירה">×</button>' +
            '    <img class="pp-logo" src="' + escapeHtml(CONFIG.logoUrl) + '" alt="Studio Happy">' +
            '    <h2 class="pp-title" id="sh-pp-terms-title">תנאי המבצע</h2>' +
            '    <div class="pp-terms">' + escapeHtml(c.termsText) + '</div>' +
            '  </div>' +
            '</div>';

        root.querySelector('[data-action="close"]')?.addEventListener('click', function () {
            closePopup(root);
        });
        root.querySelector('[data-action="overlay"]')?.addEventListener('click', function (e) {
            if (e.target === e.currentTarget) closePopup(root);
        });
    }

    function render(state) {
        var root = ensureRoot();
        var c = state.content;
        if (!state.show || (!state.forceShow && wasShownThisVisit(c))) {
            closePopup(root);
            return;
        }

        if (state.termsOnly) {
            renderTermsOnly(root, c);
            return;
        }

        var termsOpen = !!state.termsOpen;
        var countdownHtml = CONFIG.endsAt && !isCampaignExpired()
            ? '<div class="pp-countdown-wrap"><p class="pp-countdown-label">' + escapeHtml(CONFIG.cdLabel || '⏰ נותרו:') + '</p><div class="pp-countdown" aria-live="polite">' +
              '<div class="pp-countdown-unit"><span class="pp-countdown-num" data-countdown="days">00</span><span class="pp-countdown-cap">ימים</span></div>' +
              '<div class="pp-countdown-unit"><span class="pp-countdown-num" data-countdown="hours">00</span><span class="pp-countdown-cap">שעות</span></div>' +
              '<div class="pp-countdown-unit"><span class="pp-countdown-num" data-countdown="minutes">00</span><span class="pp-countdown-cap">דקות</span></div>' +
              '<div class="pp-countdown-unit"><span class="pp-countdown-num" data-countdown="seconds">00</span><span class="pp-countdown-cap">שניות</span></div>' +
              '</div></div>'
            : '';
        var termsHtml = c.termsText
            ? '<button type="button" class="pp-terms-toggle" data-action="terms">' +
              (termsOpen ? 'הסתרת תנאי המבצע' : 'תנאי המבצע') +
              '</button>' +
              '<div class="pp-terms ' + (termsOpen ? '' : 'pp-hidden') + '">' +
              escapeHtml(c.termsText) + '</div>'
            : '';

        root.innerHTML =
            '<div class="pp-overlay" data-action="overlay">' +
            '  <div class="pp-card" role="dialog" aria-modal="true">' +
            '    <button type="button" class="pp-close" data-action="close" aria-label="סגירה">×</button>' +
            '    <img class="pp-logo" src="' + escapeHtml(CONFIG.logoUrl) + '" alt="Studio Happy">' +
            '    <span class="pp-fomo-badge">מוגבל בזמן · מקומות אחרונים</span>' +
            '    <h2 class="pp-title">' + escapeHtml(c.title || 'מבצע מיוחד') + '</h2>' +
            '    <p class="pp-subtitle">' + escapeHtml(c.subtitle || '') + '</p>' +
            countdownHtml +
            '    <a href="' + escapeHtml(c.ctaUrl || '#') + '" class="pp-cta" data-action="cta">' +
            '      <span class="pp-cta-label">' + escapeHtml(c.ctaText || 'להזמנה') + '</span>' +
            '      <span class="pp-cta-spinner pp-hidden" aria-hidden="true"></span>' +
            '    </a>' +
            termsHtml +
            '  </div>' +
            '</div>';

        markShownThisVisit(c);

        root.querySelector('[data-action="close"]')?.addEventListener('click', function () {
            closePopup(root);
        });
        root.querySelector('[data-action="overlay"]')?.addEventListener('click', function (e) {
            if (e.target === e.currentTarget) closePopup(root);
        });
        root.querySelector('[data-action="cta"]')?.addEventListener('click', function (e) {
            e.preventDefault();
            var cta = root.querySelector('[data-action="cta"]');
            if (!cta || cta.classList.contains('pp-cta-loading')) return;
            cta.classList.add('pp-cta-loading');
            cta.querySelector('.pp-cta-spinner')?.classList.remove('pp-hidden');
            var url = c.ctaUrl || '#';
            setTimeout(function () {
                closePopup(root, function () {
                    if (url && url !== '#') window.location.href = url;
                });
            }, 3000);
        });
        root.querySelector('[data-action="terms"]')?.addEventListener('click', function () {
            var termsEl = root.querySelector('.pp-terms');
            var btn = root.querySelector('[data-action="terms"]');
            if (!termsEl || !btn) return;
            var open = termsEl.classList.contains('pp-hidden');
            termsEl.classList.toggle('pp-hidden', !open);
            btn.textContent = open ? 'הסתרת תנאי המבצע' : 'תנאי המבצע';
        });

        startCountdownTimer(root, state);
    }

    function boot() {
        injectFonts();
        injectStyles();
        var resolved = resolveCampaign();
        render({
            show: resolved.show,
            preview: resolved.preview,
            content: resolved.content,
            termsOpen: !!resolved.termsOpen,
            termsOnly: !!resolved.termsOnly,
            forceShow: !!resolved.forceShow,
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
