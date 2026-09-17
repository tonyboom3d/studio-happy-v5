/**
 * @deprecated Use promo-popup-standalone.html for Wix Custom Code (HTML + script).
 * This .js file is kept as a readable source copy only.
 */
(function () {
    'use strict';

    // --- CONFIG (edit here in Custom Code, or mirror promoCampaignConfig.js) ---
    var CONFIG = {
        enabled: false,
        endsAt: '2026-11-01T00:00:00+03:00',
        previewToken: 'studio-happy-tufting-promo',
        title: 'מבצע מיוחד 🎁 מזמינים סדנת טאפטינג – ומקבלים סדנת צביעת קרמיקה במתנה!',
        subtitle: 'עבור כל שטיח שמוזמן במסגרת סדנת הטאפטינג, מקבלים כלי קרמיקה אחד לצביעה במתנה.',
        ctaText: 'להזמנת סדנת טאפטינג',
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

    function getCountdownParts() {
        var end = new Date(CONFIG.endsAt).getTime();
        var diff = Math.max(0, end - Date.now());
        var totalSec = Math.floor(diff / 1000);
        return {
            days: Math.floor(totalSec / 86400),
            hours: Math.floor((totalSec % 86400) / 3600),
            minutes: Math.floor((totalSec % 3600) / 60),
            seconds: totalSec % 60,
            expired: diff <= 0,
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
        return parts.expired;
    }

    function startCountdownTimer(root, state) {
        stopCountdownTimer();
        if (!CONFIG.endsAt || isCampaignExpired()) return;
        updateCountdownDom(root);
        countdownTimer = setInterval(function () {
            if (updateCountdownDom(root)) {
                stopCountdownTimer();
                render({ show: false, content: state.content });
            }
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
        if (isCampaignExpired()) {
            return { show: false, content: content, termsOpen: false, forceShow: false };
        }
        var token = String(getQueryParam('promo') || '').trim();
        var tokenMatch = !!(token && CONFIG.previewToken && token === CONFIG.previewToken);
        var termsOpen = isTruthyParam('terms');
        var deepLink = termsOpen && (CONFIG.enabled || tokenMatch);

        if (CONFIG.enabled) {
            return {
                show: true,
                preview: false,
                content: content,
                termsOpen: termsOpen,
                forceShow: deepLink,
            };
        }
        if (tokenMatch) {
            return {
                show: true,
                preview: true,
                content: content,
                termsOpen: termsOpen,
                forceShow: true,
            };
        }
        return { show: false, content: content, termsOpen: false, forceShow: false };
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
            '  background: rgba(20, 12, 8, 0.55);',
            '  display: flex; align-items: center; justify-content: center;',
            '  padding: 20px;',
            '  animation: sh-pp-fade-in .25s ease-out;',
            '}',
            '@keyframes sh-pp-fade-in { from { opacity: 0; } to { opacity: 1; } }',
            '#sh-promo-popup-root .pp-card {',
            '  position: relative; background: #fffaf3; border-radius: 20px;',
            '  max-width: 440px; width: 100%; max-height: 90vh; overflow-y: auto;',
            '  padding: 32px 28px 26px; box-shadow: 0 24px 60px rgba(0,0,0,.35);',
            '  text-align: center; direction: rtl;',
            '  animation: sh-pp-pop-in .3s cubic-bezier(.2,.9,.3,1.2);',
            '}',
            '@keyframes sh-pp-pop-in { from { transform: scale(.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }',
            '#sh-promo-popup-root .pp-close {',
            '  position: absolute; top: 12px; inset-inline-end: 12px;',
            '  width: 34px; height: 34px; border-radius: 50%; border: none;',
            '  background: rgba(0,0,0,.06); color: #6b5b4d; font-size: 18px; line-height: 1; cursor: pointer;',
            '}',
            '#sh-promo-popup-root .pp-close:hover { background: rgba(0,0,0,.12); }',
            '#sh-promo-popup-root .pp-emoji { font-size: 40px; margin-bottom: 6px; }',
            '#sh-promo-popup-root .pp-title { font-size: 22px; font-weight: 800; color: #3d2b1f; margin: 0 0 8px; line-height: 1.3; }',
            '#sh-promo-popup-root .pp-subtitle { font-size: 15px; color: #6b5b4d; margin: 0 0 18px; line-height: 1.6; white-space: pre-wrap; }',
            '#sh-promo-popup-root .pp-countdown-wrap { margin: 0 0 20px; }',
            '#sh-promo-popup-root .pp-countdown-label { font-size: 13px; color: #8a7462; margin: 0 0 10px; font-weight: 600; letter-spacing: .02em; }',
            '#sh-promo-popup-root .pp-countdown { display: flex; justify-content: center; gap: 8px; direction: ltr; }',
            '#sh-promo-popup-root .pp-countdown-unit { background: linear-gradient(180deg, #fff 0%, #f5ebe0 100%); border: 1px solid rgba(198, 93, 46, .18); border-radius: 12px; min-width: 56px; padding: 10px 6px 8px; box-shadow: 0 2px 10px rgba(198, 93, 46, .1); }',
            '#sh-promo-popup-root .pp-countdown-num { display: block; font-size: 22px; font-weight: 800; color: #c65d2e; line-height: 1.1; font-variant-numeric: tabular-nums; }',
            '#sh-promo-popup-root .pp-countdown-cap { display: block; font-size: 11px; color: #8a7462; margin-top: 4px; font-weight: 600; }',
            '#sh-promo-popup-root .pp-cta {',
            '  display: inline-block; width: 100%; box-sizing: border-box;',
            '  background: #c65d2e; color: #fff; font-weight: 700; font-size: 16px;',
            '  border: none; border-radius: 12px; padding: 14px 20px; cursor: pointer; text-decoration: none;',
            '}',
            '#sh-promo-popup-root .pp-cta:hover { background: #b04f24; }',
            '#sh-promo-popup-root .pp-terms-toggle {',
            '  margin-top: 16px; background: none; border: none; color: #8a7462;',
            '  font-size: 13px; text-decoration: underline; cursor: pointer; padding: 4px;',
            '}',
            '#sh-promo-popup-root .pp-terms {',
            '  margin-top: 10px; text-align: right; font-size: 12px; color: #8a7462;',
            '  white-space: pre-wrap; line-height: 1.6; max-height: 220px; overflow-y: auto;',
            '  background: rgba(0,0,0,.03); border-radius: 10px; padding: 12px;',
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

    function render(state) {
        var root = ensureRoot();
        var c = state.content;
        if (!state.show || (!state.forceShow && wasShownThisVisit(c))) {
            stopCountdownTimer();
            root.innerHTML = '';
            return;
        }

        var termsOpen = !!state.termsOpen;
        var countdownHtml = CONFIG.endsAt && !isCampaignExpired()
            ? '<div class="pp-countdown-wrap"><p class="pp-countdown-label">⏳ המבצע מסתיים בעוד</p><div class="pp-countdown" aria-live="polite">' +
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
            '    <div class="pp-emoji">🎁</div>' +
            '    <h2 class="pp-title">' + escapeHtml(c.title || 'מבצע מיוחד') + '</h2>' +
            '    <p class="pp-subtitle">' + escapeHtml(c.subtitle || '') + '</p>' +
            countdownHtml +
            '    <a href="' + escapeHtml(c.ctaUrl || '#') + '" class="pp-cta" data-action="cta">' +
            escapeHtml(c.ctaText || 'להזמנה') + '</a>' +
            termsHtml +
            '  </div>' +
            '</div>';

        markShownThisVisit(c);

        root.querySelector('[data-action="close"]')?.addEventListener('click', function () {
            render({ show: false, content: c });
        });
        root.querySelector('[data-action="overlay"]')?.addEventListener('click', function (e) {
            if (e.target === e.currentTarget) {
                render({ show: false, content: c });
            }
        });
        root.querySelector('[data-action="terms"]')?.addEventListener('click', function () {
            state.termsOpen = !termsOpen;
            render(state);
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
            forceShow: !!resolved.forceShow,
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
