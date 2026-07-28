/* ─────────────────────────────────────────────
   Studio Happy – Photo Stack Gallery
   Custom Element: <photo-stack>

   תמונות: ערוך את מערך PHOTOS למטה
   ──────────────────────────────────────────── */

/* ── הכנס כאן את כתובות התמונות שלך ── */
const PHOTOS = [
  "https://static.wixstatic.com/media/PHOTO_1.jpg",
  "https://static.wixstatic.com/media/PHOTO_2.jpg",
  "https://static.wixstatic.com/media/PHOTO_3.jpg",
  "https://static.wixstatic.com/media/PHOTO_4.jpg",
  "https://static.wixstatic.com/media/PHOTO_5.jpg",
];

const AUTO_INTERVAL_MS = 4500;

/* ── Styles ── */
const STYLES = `
  :host {
    display: flex;
    flex-direction: column;
    align-items: center;
    user-select: none;
    -webkit-user-select: none;
  }

  .ps-stack {
    position: relative;
    width: 300px;
    height: 380px;
    display: grid;
    place-content: center;
    touch-action: none;
    transform-style: preserve-3d;
  }

  .ps-card {
    position: absolute;
    place-self: center;
    width: calc(100% - 2rem);
    height: calc(100% - 2rem);
    border-radius: 22px;
    overflow: hidden;
    background: #e0d4f5;
    border: 2px solid #111;
    cursor: grab;
    will-change: transform;
    backface-visibility: hidden;
    box-shadow: 2px 3px 0px 0px rgba(0,0,0,0.75);

    /* position driven by CSS variable --i (overridden per-card via JS) */
    z-index: calc(100 - var(--i));
    transform:
      translateX(var(--swipe-x, 0px))
      rotateZ(var(--card-rotate, 0deg))
      translate(var(--card-tx, 0px), var(--card-ty, 0px))
      rotateY(var(--swipe-rotate, 0deg));
    transition: transform 0.3s ease;
  }

  .ps-card:active { cursor: grabbing; }

  .ps-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }

  /* Shuffle button */
  .ps-btn {
    position: absolute;
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 20px;
    border-radius: 9999px;
    background: #fff;
    border: 2px solid #111;
    box-shadow: 2px 2px 0px 0px rgba(0,0,0,0.80);
    font-family: 'Assistant', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: #333;
    cursor: pointer;
    outline: none;
    direction: ltr;
    white-space: nowrap;
    overflow: hidden;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .ps-btn:hover {
    transform: translateX(-50%) scale(1.05);
  }
  .ps-btn:active {
    transform: translateX(-50%) scale(0.97);
    box-shadow: 1px 1px 0px 0px rgba(0,0,0,0.75);
  }

  /* Progress fill layer */
  .ps-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    right: auto;
    width: 0%;
    background: #A9DEF9;
    border-radius: inherit;
    z-index: 0;
    transition: width 0.18s ease;
  }
  .ps-btn.ps-filling::before {
    width: 100%;
    transition: width ${AUTO_INTERVAL_MS}ms linear;
  }

  /* keep icon + text above fill layer */
  .ps-btn > * {
    position: relative;
    z-index: 1;
  }
  .ps-btn-icon { flex-shrink: 0; }
`;

/* ── Template ── */
const TEMPLATE = `
  <div class="ps-stack" id="stack">
  </div>
`;

/* ── Refresh/Shuffle icon SVG (circular arrows) ── */
const SHUFFLE_ICON = `<svg class="ps-btn-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

/* ═══════════════════════════════════════════
   PhotoStack – Custom Element
   ═══════════════════════════════════════════ */
class PhotoStack extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cards   = [];   /* DOM nodes in original order */
    this._order   = [];   /* index array: [0] = top card */
    this._timer   = null;
    this._locked  = false;
    this._drag    = { active: false, startX: 0, currentX: 0 };
    this._isSwiping = false;
    this._animFrameId = null;
  }

  connectedCallback() {
    this._render();
    this._buildCards();
    this._updatePositions();
    this._bindDrag();
    this._startAuto();
  }

  disconnectedCallback() {
    this._stopAuto();
  }

  /* ── Render shadow DOM ── */
  _render() {
    const sr = this.shadowRoot;
    const style = document.createElement("style");
    style.textContent = STYLES;
    sr.innerHTML = TEMPLATE;
    sr.prepend(style);
  }

  /* ── Build card elements ── */
  _buildCards() {
    const stack = this.shadowRoot.getElementById("stack");

    PHOTOS.forEach((src, idx) => {
      const card = document.createElement("article");
      card.className = "ps-card";

      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      card.appendChild(img);

      stack.appendChild(card);
      this._cards.push(card);
      this._order.push(idx);
    });

    /* Shuffle button inside the stack */
    const btn = document.createElement("button");
    btn.className = "ps-btn";
    btn.type = "button";
    btn.innerHTML = `${SHUFFLE_ICON}<span>ריענון</span>`;
    btn.addEventListener("click", () => this._advance());
    stack.appendChild(btn);
  }

  /*
   * Visual offsets for each position in the stack.
   * pos=0 → top card (centered, straight)
   * pos=1 → slightly right + clockwise tilt
   * pos=2 → slightly left + counter-clockwise tilt, behind
   * pos=3+ → deep background, minimal offset
   */
  /*
   * pos=0 — קדמי, ישר
   * pos=1 — נוטה ימינה
   * pos=2 — נוטה שמאלה
   * pos=3 — נוטה קצת פחות ימינה
   * pos=4 — כמעט ישר, הכי עמוק
   */
  static OFFSETS = [
    { rotate:  0,   tx:  0,   ty:  0,   shadow: "2px 3px 0px 0px rgba(0,0,0,0.75)" },
    { rotate:  6,   tx: 18,   ty:  8,   shadow: "2px 2px 0px 0px rgba(0,0,0,0.60)" },
    { rotate: -5,   tx: -14,  ty: 14,   shadow: "2px 2px 0px 0px rgba(0,0,0,0.50)" },
    { rotate:  3,   tx: 10,   ty: 20,   shadow: "1px 2px 0px 0px rgba(0,0,0,0.38)" },
    { rotate: -1.5, tx: -6,   ty: 26,   shadow: "1px 1px 0px 0px rgba(0,0,0,0.28)" },
  ];

  /* ── Update positions for all cards ── */
  _updatePositions() {
    const offsets = PhotoStack.OFFSETS;
    this._order.forEach((cardIdx, pos) => {
      const card = this._cards[cardIdx];
      const o    = offsets[Math.min(pos, offsets.length - 1)];

      card.style.setProperty("--i",           pos);
      card.style.setProperty("--card-rotate", `${o.rotate}deg`);
      card.style.setProperty("--card-tx",     `${o.tx}px`);
      card.style.setProperty("--card-ty",     `${o.ty}px`);
      card.style.setProperty("--swipe-x",     "0px");
      card.style.setProperty("--swipe-rotate","0deg");
      card.style.boxShadow  = o.shadow;
      /* restore transition if it was removed during drag */
      card.style.transition = "";
    });
  }

  /* ── Advance: send top card to back ── */
  _advance() {
    if (this._locked) return;
    this._locked = true;
    this._stopAuto();
    this._stopFill();

    const topCardIdx = this._order[0];
    const topCard    = this._cards[topCardIdx];
    const swapDuration = 300; /* matches --card-swap-duration: 0.3s */

    /* restore transition for the fly-out animation */
    topCard.style.transition = `transform ${swapDuration}ms ease`;

    /* fly off to one side with rotation */
    const direction = this._dir > 0 ? 1 : -1;
    this._dir = -direction; /* alternate direction */

    topCard.style.setProperty("--swipe-x", `${direction * 350}px`);
    topCard.style.setProperty("--swipe-rotate", `${direction * 20}deg`);

    /* halfway through: flip rotation so it "wraps around" going to the back */
    setTimeout(() => {
      topCard.style.setProperty("--swipe-rotate", `${-direction * 20}deg`);
    }, swapDuration * 0.5);

    /* after fly-out: move to back of order array and refresh all positions */
    setTimeout(() => {
      this._order = [...this._order.slice(1), topCardIdx];
      this._updatePositions();
      this._locked = false;
      this._startAuto();
    }, swapDuration);
  }

  /* direction alternates between advances */
  _dir = 1;

  /* ── Button fill progress ── */
  _startFill() {
    const btn = this.shadowRoot.querySelector(".ps-btn");
    if (!btn) return;
    btn.classList.remove("ps-filling");
    void btn.offsetWidth; /* force reflow */
    btn.classList.add("ps-filling");
  }
  _stopFill() {
    const btn = this.shadowRoot.querySelector(".ps-btn");
    if (btn) btn.classList.remove("ps-filling");
  }

  /* ── Auto timer ── */
  _startAuto() {
    this._stopAuto();
    this._startFill();
    this._timer = setInterval(() => this._advance(), AUTO_INTERVAL_MS);
  }
  _stopAuto() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /* ── Drag / swipe on top card ── */
  _bindDrag() {
    const stack = this.shadowRoot.getElementById("stack");

    const getTopCard = () => this._cards[this._order[0]];

    const handleStart = (clientX) => {
      if (this._locked || this._isSwiping) return;
      this._isSwiping = true;
      this._drag.startX = this._drag.currentX = clientX;

      const card = getTopCard();
      if (card) {
        card.style.transition = "none"; /* instant follow while dragging */
        card.style.cursor = "grabbing";
      }
      this._stopAuto();
    };

    const handleMove = (clientX) => {
      if (!this._isSwiping) return;
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = requestAnimationFrame(() => {
        this._drag.currentX = clientX;
        const dx = clientX - this._drag.startX;
        const card = getTopCard();
        if (!card) return;

        card.style.setProperty("--swipe-x", `${dx}px`);
        card.style.setProperty("--swipe-rotate", `${dx * 0.2}deg`);

        /* auto-commit if dragged far enough */
        if (Math.abs(dx) > 120) handleEnd();
      });
    };

    const handleEnd = () => {
      if (!this._isSwiping) return;
      cancelAnimationFrame(this._animFrameId);
      this._isSwiping = false;

      const dx   = this._drag.currentX - this._drag.startX;
      const card = getTopCard();
      if (!card) return;

      card.style.cursor = "";
      const threshold = 80;
      const swapDuration = 300;

      if (Math.abs(dx) > threshold) {
        /* commit swipe — fly to side then move to back */
        this._locked = true;
        const topCardIdx = this._order[0];
        const direction  = Math.sign(dx);

        card.style.transition = `transform ${swapDuration}ms ease`;
        card.style.setProperty("--swipe-x", `${direction * 350}px`);
        card.style.setProperty("--swipe-rotate", `${direction * 20}deg`);

        setTimeout(() => {
          card.style.setProperty("--swipe-rotate", `${-direction * 20}deg`);
        }, swapDuration * 0.5);

        setTimeout(() => {
          this._order = [...this._order.slice(1), topCardIdx];
          this._updatePositions();
          this._locked = false;
          this._startAuto();
        }, swapDuration);
      } else {
        /* snap back */
        card.style.transition = "transform 0.3s ease";
        card.style.setProperty("--swipe-x", "0px");
        card.style.setProperty("--swipe-rotate", "0deg");
        this._startAuto();
      }

      this._drag.startX = this._drag.currentX = 0;
    };

    stack.addEventListener("pointerdown", (e) => handleStart(e.clientX));
    stack.addEventListener("pointermove", (e) => handleMove(e.clientX));
    stack.addEventListener("pointerup",   () => handleEnd());
    stack.addEventListener("pointercancel", () => handleEnd());
  }
}

customElements.define("photo-stack", PhotoStack);
