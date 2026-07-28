/* ─────────────────────────────────────────────
   Studio Happy – Drop Stripes
   Custom Element: <drop-stripes>

   4 פסים של 60px כל אחד, גדלים כלפי מטה לפי scroll.
   מוצג מאחורי האלמנט הרפרנס, ממורכז מולו.
   אנימציה רכה עם spring interpolation.
   ──────────────────────────────────────────── */

const STRIPE_COLORS = [
    "#E4C1F9",
    "#A9DEF9",
    "#D0F4DE",
    "#FCF6BD",
];

// הפס הימני ביותר (index 3) גדל ראשון, ואז שמאלה
const DROP_ORDER = [3, 2, 1, 0];

// רוחב כל פס בפיקסלים
const STRIPE_WIDTH_PX = 60;
const BORDER_PX = 2;

// כל פס מתחיל 80px גלילה אחרי הקודם
// כל פס מגיע לגובה מלא תוך 600px גלילה
const STAGGER_PX = 80;
const FALL_DURATION_PX = 600;

// מהירות ה-spring: ערך בין 0-1, ככל שנמוך יותר — רך יותר
const SPRING = 0.07;

// האלמנט הרפרנס שמאחוריו הפסים מוצגים
const ANCHOR_SELECTOR = "#comp-mn6d51qx";
const SECTION_SELECTOR = ".hero-grid-section";

const TOTAL_WIDTH = STRIPE_COLORS.length * STRIPE_WIDTH_PX;

const TEMPLATE = document.createElement("template");
TEMPLATE.innerHTML = `
  <style>
    :host {
      display: block;
      position: fixed;
      top: 0;
      min-height: 0;
      width: ${TOTAL_WIDTH}px;
      pointer-events: none;
      z-index: 0;
    }

    .drop-stripes {
      position: relative;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .stripe {
      position: absolute;
      top: 0;
      width: ${STRIPE_WIDTH_PX}px;
      height: 0;
      box-sizing: border-box;
      border: ${BORDER_PX}px solid #000;
      border-top: none;
      overflow: hidden;
    }

    ${STRIPE_COLORS.map((color, i) => `
    .stripe-${i} {
      left: ${i * STRIPE_WIDTH_PX}px;
      background: ${color};
    }`).join("")}
  </style>

  <div class="drop-stripes" aria-hidden="true">
    ${STRIPE_COLORS.map((_, i) => `<div class="stripe stripe-${i}" data-index="${i}"></div>`).join("")}
  </div>
`;

class DropStripes extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

        this._divs = [];
        this._anchor = null;
        this._scrollY = 0;
        this._raf = null;

        // גובה נוכחי (spring) לכל פס — מתחיל ב-0
        this._currentH = new Array(STRIPE_COLORS.length).fill(0);

        this._onScroll = this._onScroll.bind(this);
        this._onResize = this._onResize.bind(this);
        this._tick = this._tick.bind(this);
    }

    connectedCallback() {
        this._divs = Array.from(this.shadowRoot.querySelectorAll(".stripe"));
        this._anchor = document.querySelector(ANCHOR_SELECTOR)
            || document.querySelector(SECTION_SELECTOR);

        // כל הפסים מתחילים עם גובה 0
        this._divs.forEach(d => d.style.height = "0px");

        this._updateScrollY();
        this._syncLayout();
        this._startLoop();

        try {
            window.top.addEventListener("scroll", this._onScroll, { passive: true });
        } catch (_) {
            window.addEventListener("scroll", this._onScroll, { passive: true });
        }
        window.addEventListener("resize", this._onResize, { passive: true });
    }

    disconnectedCallback() {
        try { window.top.removeEventListener("scroll", this._onScroll); } catch (_) { }
        window.removeEventListener("scroll", this._onScroll);
        window.removeEventListener("resize", this._onResize);
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    _onScroll() {
        this._updateScrollY();
    }

    _onResize() {
        this._syncLayout();
    }

    _updateScrollY() {
        try {
            this._scrollY = window.top.scrollY ?? window.top.pageYOffset ?? 0;
        } catch (_) {
            this._scrollY = window.scrollY ?? 0;
        }
    }

    _getViewportHeight() {
        try {
            return window.top.innerHeight || window.innerHeight || 0;
        } catch (_) {
            return window.innerHeight || 0;
        }
    }

    _getViewportWidth() {
        try {
            return window.top.innerWidth || window.innerWidth || 0;
        } catch (_) {
            return window.innerWidth || 0;
        }
    }

    _syncLayout() {
        const viewportHeight = this._getViewportHeight();
        const viewportWidth = this._getViewportWidth();
        const viewportMid = viewportHeight / 2;
        const hostLeft = Math.max(0, (viewportWidth - TOTAL_WIDTH) / 2);

        // האלמנט נשאר קבוע במרכז המסך, והפסים מתחילים מאמצע הגובה
        this.style.left = `${hostLeft}px`;
        this.style.top = `${viewportMid}px`;
        this.style.height = `${viewportMid}px`;
        this.style.display = "block";
    }

    _computeTargetH(orderIndex) {
        // הפסים מתחילים לגדול מהגלילה הראשונה (scrollY > 0)
        const scrolled = Math.max(0, this._scrollY);
        const stripeStart = orderIndex * STAGGER_PX;
        const localScrolled = Math.max(0, scrolled - stripeStart);
        const localProgress = Math.min(1, localScrolled / FALL_DURATION_PX);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - localProgress, 3);
        const fullHeight = this._getViewportHeight() / 2;
        return fullHeight * eased;
    }

    _startLoop() {
        const loop = () => {
            this._raf = requestAnimationFrame(loop);
            this._tick();
        };
        this._raf = requestAnimationFrame(loop);
    }

    _tick() {
        let needsRender = false;

        DROP_ORDER.forEach((stripeIndex, orderIndex) => {
            const targetH = this._computeTargetH(orderIndex);
            const current = this._currentH[stripeIndex];
            const delta = targetH - current;

            // spring: מתקרב ל-target בקצב SPRING בכל frame
            if (Math.abs(delta) > 0.01) {
                this._currentH[stripeIndex] = current + delta * SPRING;
                needsRender = true;
            } else if (this._currentH[stripeIndex] !== targetH) {
                this._currentH[stripeIndex] = targetH;
                needsRender = true;
            }
        });

        if (needsRender) {
            this._divs.forEach((div, i) => {
                div.style.height = `${this._currentH[i]}px`;
            });
        }
    }
}

customElements.define("drop-stripes", DropStripes);
