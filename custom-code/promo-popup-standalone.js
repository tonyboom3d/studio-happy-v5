/**
 * @deprecated Use promo-popup-standalone.html for Wix Custom Code (HTML + script).
 * This .js file is kept as a readable source copy only.
 */
(function () {
    'use strict';

    // --- CONFIG (edit here in Custom Code, or mirror promoCampaignConfig.js) ---
    var CONFIG = {
        enabled: false,
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

    var DISMISS_KEY_PREFIX = 'sh_promo_dismissed_';
    var STYLE_ID = 'sh-promo-popup-styles';
    var ROOT_ID = 'sh-promo-popup-root';

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

    function resolveCampaign() {
        var content = {
            title: CONFIG.title,
            subtitle: CONFIG.subtitle,
            ctaText: CONFIG.ctaText,
            ctaUrl: CONFIG.ctaUrl,
            termsText: CONFIG.termsText,
        };
        if (CONFIG.enabled) {
            return { show: true, preview: false, content: content };
        }
        var token = String(getQueryParam('promo') || '').trim();
        if (token && CONFIG.previewToken && token === CONFIG.previewToken) {
            return { show: true, preview: true, content: content };
        }
        return { show: false, content: content };
    }

    function dismissKey(c) {
        return (DISMISS_KEY_PREFIX + (c.title || '') + (c.ctaUrl || '')).slice(0, 200);
    }

    function isDismissed(c) {
        try {
            return localStorage.getItem(dismissKey(c)) === '1';
        } catch (_) {
            return false;
        }
    }

    function markDismissed(c) {
        try {
            localStorage.setItem(dismissKey(c), '1');
        } catch (_) { /* ignore */ }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '#sh-promo-popup-root .pp-overlay {',
            '  position: fixed; inset: 0; z-index: 99999;',
            '  background: rgba(20, 12, 8, 0.55);',
            '  display: flex; align-items: center; justify-content: center;',
            '  padding: 20px; font-family: Arial, Helvetica, sans-serif;',
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
            '#sh-promo-popup-root .pp-subtitle { font-size: 15px; color: #6b5b4d; margin: 0 0 22px; line-height: 1.6; white-space: pre-wrap; }',
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
        if (!state.show || isDismissed(c)) {
            root.innerHTML = '';
            return;
        }

        var termsOpen = !!state.termsOpen;
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
            '    <a href="' + escapeHtml(c.ctaUrl || '#') + '" class="pp-cta" data-action="cta">' +
            escapeHtml(c.ctaText || 'להזמנה') + '</a>' +
            termsHtml +
            '  </div>' +
            '</div>';

        root.querySelector('[data-action="close"]')?.addEventListener('click', function () {
            markDismissed(c);
            render({ show: false, content: c });
        });
        root.querySelector('[data-action="overlay"]')?.addEventListener('click', function (e) {
            if (e.target === e.currentTarget) {
                markDismissed(c);
                render({ show: false, content: c });
            }
        });
        root.querySelector('[data-action="cta"]')?.addEventListener('click', function () {
            markDismissed(c);
        });
        root.querySelector('[data-action="terms"]')?.addEventListener('click', function () {
            state.termsOpen = !termsOpen;
            render(state);
        });
    }

    function boot() {
        injectStyles();
        var resolved = resolveCampaign();
        render({ show: resolved.show, preview: resolved.preview, content: resolved.content, termsOpen: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
