/* ─────────────────────────────────────────────
   Studio Happy – Rainbow Right
   Custom Element: <rainbow-right>

   הקשת נצמדת תמיד לחלק העליון-ימני של המסך (fixed).
   בגלילה — פסים נעלמים אחד-אחד.
   ──────────────────────────────────────────── */

const STRIPE_WIDTH = 55;
const OUTLINE_WIDTH = 59;
const START_X = 0;
const TURN_X = 27.5;
const TURN_Y = 233;
const STRAIGHT_TAPER_STEP = 0;
const INNER_RADIUS = STRIPE_WIDTH;
const WIDTH = 320; // px — רוחב הקשת עם מרווח בטוח
const HEIGHT = 552; // px — גובה הקשת עם מרווח בטוח
const BOTTOM_Y = HEIGHT;

const SCROLL_START = 50;
const SCROLL_END = 600;

const STRIPE_COLORS = ["#EBA937", "#EB3F95", "#393B61", "#E4C1F9"];

const STRIPES = STRIPE_COLORS.map((color, index) => {
    const radius = INNER_RADIUS + STRIPE_WIDTH * (STRIPE_COLORS.length - 1 - index);
    const turnY = TURN_Y + index * STRAIGHT_TAPER_STEP;
    const topY = turnY - radius;
    const rightX = TURN_X + radius;

    return {
        color,
        // Reverse the path direction so the mirrored version animates
        // from the top edge downward before turning inward.
        d: `M ${rightX},${BOTTOM_Y} L ${rightX},${turnY} A ${radius},${radius} 0 0,0 ${TURN_X},${topY} L ${START_X},${topY}`,
    };
});

const TEMPLATE = document.createElement("template");
TEMPLATE.innerHTML = `
  <style>
    :host {
      display: block;
    }

    .rainbow-fixed {
      position: fixed;
      top: 0;
      right: 0;
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      overflow: visible;
      pointer-events: none;
      z-index: 9999;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      transform: scale(-1, -1);
      transform-origin: 50% 50%;
    }

    path {
      fill: none;
      stroke-linecap: butt;
      stroke-linejoin: round;
    }

    .stripe path {
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
    }
  </style>

  <div class="rainbow-fixed">
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none">
      ${STRIPES.map((s, i) => `
        <g class="stripe stripe-${i}">
          <path class="outline" d="${s.d}" stroke="#000"       stroke-width="${OUTLINE_WIDTH}" pathLength="100"/>
          <path class="color"   d="${s.d}" stroke="${s.color}" stroke-width="${STRIPE_WIDTH}" pathLength="100"/>
        </g>
      `).join("")}
    </svg>
  </div>
`;

class RainbowRight extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

        this._paths = [];
        this._introRaf = null;
        this._introStart = null;
        this._introDone = false;
        this._scrollY = 0;
        this._onScroll = this._onScroll.bind(this);
    }

    connectedCallback() {
        this._paths = Array.from(this.shadowRoot.querySelectorAll(".stripe path"));
        this._runIntro();

        try {
            window.top.addEventListener("scroll", this._onScroll, { passive: true });
        } catch (_) {
            window.addEventListener("scroll", this._onScroll, { passive: true });
        }
    }

    disconnectedCallback() {
        try { window.top.removeEventListener("scroll", this._onScroll); } catch (_) { }
        window.removeEventListener("scroll", this._onScroll);
        cancelAnimationFrame(this._introRaf);
    }

    _onScroll() {
        try {
            this._scrollY = window.top.scrollY ?? window.top.pageYOffset ?? 0;
        } catch (_) {
            this._scrollY = window.scrollY ?? 0;
        }
        if (this._introDone) this._applyScroll();
    }

    _applyScroll() {
        const progress = Math.min(1, Math.max(0,
            (this._scrollY - SCROLL_START) / (SCROLL_END - SCROLL_START)
        ));
        const staggerStep = 0.12;
        STRIPES.forEach((_, i) => {
            const start = i * staggerStep;
            const p = progress >= 1
                ? 1
                : Math.min(1, Math.max(0, (progress - start) / (1 - start)));
            const offset = p * 100;
            const outline = this._paths[i * 2];
            const color = this._paths[i * 2 + 1];
            if (outline) outline.style.strokeDashoffset = offset;
            if (color) color.style.strokeDashoffset = offset;
        });
    }

    _runIntro() {
        const STAGGER = 250;

        const animate = (ts) => {
            if (!this._introStart) this._introStart = ts;
            const elapsed = ts - this._introStart;

            STRIPES.forEach((_, i) => {
                const t = Math.min(1, Math.max(0, (elapsed - i * STAGGER) / 1000));
                const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const offset = (1 - eased) * 100;
                const outline = this._paths[i * 2];
                const color = this._paths[i * 2 + 1];
                if (outline) outline.style.strokeDashoffset = offset;
                if (color) color.style.strokeDashoffset = offset;
            });

            const totalDuration = 1000 + STAGGER * (STRIPES.length - 1);
            if (elapsed < totalDuration) {
                this._introRaf = requestAnimationFrame(animate);
            } else {
                this._introDone = true;
                if (this._scrollY > SCROLL_START) this._applyScroll();
            }
        };

        this._introRaf = requestAnimationFrame(animate);
    }
}

customElements.define("rainbow-right", RainbowRight);
