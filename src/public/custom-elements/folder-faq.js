const DEFAULT_FAQ_ITEMS = [
  {
    question: "מה כוללת הסדנה?",
    answer:
      "כל סדנה כוללת הדרכה צמודה, חומרים, ציוד וכל מה שצריך כדי לצאת עם יצירה מהממת שהכנתם בעצמכם.",
  },
  {
    question: "האם צריך ניסיון קודם?",
    answer:
      "ממש לא. הסדנאות מתאימות גם למתחילים, והצוות מלווה אתכם צעד אחר צעד בקצב נעים וידידותי.",
  },
  {
    question: "האם אפשר להגיע כקבוצה?",
    answer:
      "כן. אפשר לתאם הגעה של זוגות, משפחות, ימי הולדת, קבוצות חברים ואירועי חברה.",
  },
  {
    question: "כמה זמן נמשכת הפעילות?",
    answer:
      "משך הפעילות משתנה בין הסדנאות, אבל ברוב המקרים מדובר על שעה וחצי עד שלוש שעות, בהתאם לאופי היצירה.",
  },
  {
    question: "מאיזה גיל הפעילות מתאימה?",
    answer:
      "יש סדנאות שמתאימות לילדים קטנים לצד סדנאות לבני נוער ומבוגרים. מומלץ לציין את גיל המשתתפים לפני ההזמנה.",
  },
];

class FolderFaq extends HTMLElement {
  static get observedAttributes() {
    return ["items", "max-visible", "more-label", "less-label"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.activeIndex = null;
    this.isExpanded = false;
    this._itemsProp = null;
    this._resizeObserver = null;
    this._boundUpdateLayout = () => this.updateLayout();
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
    this.setupObservers();
    this.updateLayout();
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._boundUpdateLayout);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  attributeChangedCallback(oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    this.activeIndex = null;
    this.isExpanded = false;
    this.render();
    this.bindEvents();
    this.setupObservers();
    this.updateLayout();
  }

  set items(value) {
    this._itemsProp = Array.isArray(value) ? value : null;
    this.activeIndex = null;
    this.isExpanded = false;
    if (!this.isConnected) return;
    this.render();
    this.bindEvents();
    this.setupObservers();
    this.updateLayout();
  }

  get items() {
    if (Array.isArray(this._itemsProp) && this._itemsProp.length) {
      return this.normalizeItems(this._itemsProp);
    }

    const raw = this.getAttribute("items");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return this.normalizeItems(parsed);
      } catch (error) {
        console.warn("Invalid FAQ items attribute. Falling back to defaults.", error);
      }
    }

    return DEFAULT_FAQ_ITEMS;
  }

  get maxVisible() {
    const value = Number.parseInt(this.getAttribute("max-visible") || "7", 10);
    return Number.isFinite(value) && value > 0 ? value : 7;
  }

  get moreLabel() {
    return this.getAttribute("more-label") || "הצג עוד שאלות";
  }

  get lessLabel() {
    return this.getAttribute("less-label") || "הצג פחות";
  }

  get hasOverflow() {
    return this.items.length > this.maxVisible;
  }

  normalizeItems(items) {
    return items
      .map((item) => ({
        ...item,
        question: item.question || item.title || "",
        answer: item.answer || item.plainText || item.description || "",
      }))
      .filter((item) => item.question && (item.answer || item.answerHtml));
  }

  render() {
    const itemsMarkup = this.items
      .map((item, index) => {
        const question = this.escapeHtml(item.question || `שאלה ${index + 1}`);
        const answerMarkup = this.buildAnswerMarkup(item);
        const offset = this.getOffsetForIndex(index);
        const answerId = `faq-answer-${index}`;
        const buttonId = `faq-button-${index}`;
        const isOpen = this.activeIndex === index;

        return `
          <article class="faq-item ${isOpen ? "is-open" : ""}" style="--faq-offset:${offset}px">
            <div class="faq-folder">
              <div class="faq-answer-shell">
                <div class="faq-answer-inner" id="${answerId}" role="region" aria-labelledby="${buttonId}">
                  ${answerMarkup}
                </div>
              </div>
              <button
                id="${buttonId}"
                class="faq-trigger"
                type="button"
                aria-expanded="${isOpen ? "true" : "false"}"
                aria-controls="${answerId}"
                data-index="${index}"
              >
                <span class="faq-label">${question}</span>
                <span class="faq-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 12H20" />
                    <path d="M12 4V20" />
                  </svg>
                </span>
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <style>
        @import url("https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=swap");

        :host {
          --faq-ink: #151515;
          --faq-gold: #f2ab12;
          --faq-paper: #fffdf8;
          --faq-outline: 2.5px solid var(--faq-ink);
          --faq-shadow: 0 4px 0 rgba(21, 21, 21, 0.88);
          --faq-radius: 22px;
          display: block;
          width: 100%;
          direction: rtl;
          color: var(--faq-ink);
          font-family: "Assistant", system-ui, sans-serif;
          background: transparent;
          overflow: visible;
        }

        *, *::before, *::after {
          box-sizing: border-box;
          font-family: inherit;
        }

        /* ── Root wrapper ── */
        .faq-root {
          position: relative;
          width: 100%;
          padding: 50px 150px 40px;
          background: transparent;
        }

        .faq-clip {
          position: relative;
          overflow: hidden;
          transition: max-height 560ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .faq-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-bottom: 20px;
        }

        /* ── Each FAQ item ── */
        .faq-item {
          position: relative;
          padding-top: 22px; /* room for the folder tab above */
        }

        /* ── Orange folder ── */
        .faq-folder {
          position: relative;
          background: var(--faq-gold);
          border: var(--faq-outline);
          border-top-right-radius: 0;     /* RTL: tab connects here → flat corner */
          border-top-left-radius: 22px;
          border-bottom-right-radius: 22px;
          border-bottom-left-radius: 22px;
          box-shadow: var(--faq-shadow);
          transform: translateX(var(--faq-offset, 0px));
          transition: transform 260ms ease, box-shadow 260ms ease;
        }

        /* ── Folder tab – top-right (RTL) ── */
        .faq-folder::before {
          content: "";
          position: absolute;
          /* sits above the folder; overlaps border by border-width to seal junction */
          bottom: calc(100% - 2.5px);
          right: -2.5px;
          width: clamp(80px, 18vw, 110px);
          height: 22px;
          background: var(--faq-gold);
          border: var(--faq-outline);
          border-bottom: none;
          border-right: none; /* folder's right border is shared */
          border-top-left-radius: 14px;
          border-top-right-radius: 0;
          pointer-events: none;
          z-index: 1;
        }

        /* Subtle press on hover / open */
        .faq-item:hover .faq-folder,
        .faq-item.is-open .faq-folder {
          transform: translateX(var(--faq-offset, 0px)) translateY(2px);
          box-shadow: 0 2px 0 rgba(21, 21, 21, 0.95);
        }

        /* ── Answer shell – clips expanding content ── */
        .faq-answer-shell {
          overflow: hidden;
          max-height: 0;
          transition: max-height 560ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* Peek of white on hover (closed items only) */
        .faq-item:hover:not(.is-open) .faq-answer-shell {
          max-height: 30px;
        }

        /* Full expand when open */
        .faq-item.is-open .faq-answer-shell {
          max-height: calc(var(--answer-height, 0px) + 28px);
        }

        /* ── White answer card inside the folder ── */
        .faq-answer-inner {
          margin: 14px 14px 4px;
          padding: 18px 22px 22px;
          background: var(--faq-paper);
          border: var(--faq-outline);
          border-radius: 16px;
          font-size: clamp(16px, 1.8vw, 20px);
          line-height: 1.6;
        }

        /* Text content fades in after card appears */
        .faq-answer-copy {
          opacity: 0;
          transform: translateY(-8px);
          transition: opacity 260ms 60ms ease, transform 380ms 60ms cubic-bezier(0.2, 0.8, 0.2, 1);
          white-space: pre-line;
        }

        .faq-item.is-open .faq-answer-copy {
          opacity: 1;
          transform: translateY(0);
        }

        .faq-answer-copy p { margin: 0; }
        .faq-answer-copy p + p { margin-top: 12px; }

        /* ── Trigger bar ── */
        .faq-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 22px 28px;
          background: transparent;
          border: none;
          color: var(--faq-ink);
          text-align: right;
          cursor: pointer;
        }

        /* ── Question label ── */
        .faq-label {
          flex: 1;
          font-size: clamp(20px, 2vw, 30px);
          font-weight: 700;
          letter-spacing: 0.01em;
          line-height: 1.2;
        }

        /* ── Plus / X icon ── */
        .faq-icon {
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          transition: transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
          transform-origin: center;
        }

        .faq-icon svg {
          width: 22px;
          height: 22px;
          stroke: currentColor;
          stroke-width: 2.5;
          stroke-linecap: round;
        }

        /* Rotate on hover (not yet open) */
        .faq-item:hover:not(.is-open) .faq-icon {
          transform: rotate(90deg) scale(1.06);
        }

        /* Rotate to × when open */
        .faq-item.is-open .faq-icon {
          transform: rotate(135deg) scale(1.08);
        }

        /* ── Fade overlay (overflow hidden more-items) ── */
        .faq-fade {
          position: absolute;
          right: 0;
          bottom: 60px;
          left: 0;
          height: 120px;
          background: linear-gradient(180deg,
            rgba(255, 253, 248, 0) 0%,
            rgba(255, 253, 248, 0.88) 55%,
            rgba(255, 253, 248, 1) 100%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 240ms ease;
        }

        .faq-root.has-overflow:not(.is-expanded) .faq-fade {
          opacity: 1;
        }

        /* ── Show-more button ── */
        .faq-actions {
          display: flex;
          justify-content: center;
          margin-top: 8px;
        }

        .faq-more-btn {
          min-width: 180px;
          padding: 12px 24px;
          border: var(--faq-outline);
          border-radius: 999px;
          background: var(--faq-paper);
          color: var(--faq-ink);
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 3px 0 rgba(21, 21, 21, 0.9);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .faq-more-btn:hover {
          transform: translateY(2px);
          box-shadow: 0 1px 0 rgba(21, 21, 21, 0.95);
        }

        .faq-more-btn[hidden] { display: none; }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .faq-root { padding-inline: 80px; }
        }

        @media (max-width: 768px) {
          .faq-root { padding: 30px 20px 24px; }

          .faq-list { gap: 12px; }

          .faq-folder::before {
            width: 72px;
            height: 18px;
          }

          .faq-trigger {
            padding: 18px 16px;
            gap: 10px;
          }

          .faq-label { font-size: clamp(17px, 5.2vw, 22px); }

          .faq-icon { width: 30px; height: 30px; }
          .faq-icon svg { width: 18px; height: 18px; }

          .faq-answer-inner {
            margin: 10px 10px 4px;
            padding: 14px 14px 18px;
            font-size: 15px;
          }

          .faq-more-btn { width: 100%; font-size: 16px; }
        }
      </style>

      ${
        this.items.length
          ? `
            <section class="faq-root ${this.hasOverflow ? "has-overflow" : ""} ${this.isExpanded ? "is-expanded" : ""}" dir="rtl">
              <div class="faq-clip">
                <div class="faq-list">
                  ${itemsMarkup}
                </div>
                <div class="faq-fade" aria-hidden="true"></div>
              </div>

              <div class="faq-actions">
                <button
                  class="faq-more-btn"
                  type="button"
                  data-expand-toggle
                  ${this.hasOverflow ? "" : "hidden"}
                  aria-expanded="${this.isExpanded ? "true" : "false"}"
                >
                  ${this.isExpanded ? this.escapeHtml(this.lessLabel) : this.escapeHtml(this.moreLabel)}
                </button>
              </div>
            </section>
          `
          : `<div style="min-height:20px" aria-hidden="true"></div>`
      }
    `;
  }

  bindEvents() {
    this.clipEl = this.shadowRoot.querySelector(".faq-clip");
    this.rootEl = this.shadowRoot.querySelector(".faq-root");
    this.itemEls = Array.from(this.shadowRoot.querySelectorAll(".faq-item"));
    this.answerEls = Array.from(this.shadowRoot.querySelectorAll(".faq-answer-inner"));
    this.toggleButtons = Array.from(this.shadowRoot.querySelectorAll(".faq-trigger"));
    this.expandButton = this.shadowRoot.querySelector("[data-expand-toggle]");

    this.toggleButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.dataset.index || "-1", 10);
        this.toggleItem(index);
      });
    });

    if (this.expandButton) {
      this.expandButton.addEventListener("click", () => {
        this.isExpanded = !this.isExpanded;
        this.render();
        this.bindEvents();
        this.setupObservers();
        this.updateLayout();
      });
    }
  }

  setupObservers() {
    window.removeEventListener("resize", this._boundUpdateLayout);
    window.addEventListener("resize", this._boundUpdateLayout);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }

    this._resizeObserver = new ResizeObserver(() => this.updateLayout());
    this.answerEls.forEach((answerEl) => this._resizeObserver.observe(answerEl));
    if (this.clipEl) this._resizeObserver.observe(this.clipEl);
  }

  toggleItem(index) {
    if (index < 0 || index >= this.items.length) return;

    this.activeIndex = this.activeIndex === index ? null : index;

    if (this.activeIndex !== null && !this.isExpanded && this.activeIndex >= this.maxVisible && this.expandButton) {
      this.isExpanded = true;
    }

    this.render();
    this.bindEvents();
    this.setupObservers();
    this.updateLayout();
  }

  updateLayout() {
    if (!this.clipEl || !this.itemEls?.length) return;

    this.answerEls.forEach((answerEl) => {
      // answerEl = .faq-answer-inner, parentElement = .faq-answer-shell → set CSS var there
      const shell = answerEl.closest(".faq-answer-shell") || answerEl.parentElement;
      if (shell) shell.style.setProperty("--answer-height", `${answerEl.scrollHeight}px`);
    });

    window.requestAnimationFrame(() => {
      if (!this.hasOverflow || this.isExpanded) {
        this.clipEl.style.maxHeight = `${this.clipEl.scrollHeight}px`;
        return;
      }

      const lastVisibleItem = this.itemEls[Math.min(this.maxVisible, this.itemEls.length) - 1];
      if (!lastVisibleItem) return;

      const collapsedHeight = lastVisibleItem.offsetTop + lastVisibleItem.offsetHeight + 12;
      this.clipEl.style.maxHeight = `${collapsedHeight}px`;
    });
  }

  buildAnswerMarkup(item) {
    if (typeof item.answerHtml === "string" && item.answerHtml.trim()) {
      return `<div class="faq-answer-copy">${item.answerHtml}</div>`;
    }

    const answer = this.escapeHtml(item.answer || "");
    const paragraphs = answer
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${paragraph}</p>`)
      .join("");

    return `<div class="faq-answer-copy">${paragraphs || "<p></p>"}</div>`;
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  getOffsetForIndex(index) {
    const offsets = [0, -10, 8, -14, 6, -8, 10, -12, 6, -6];
    return offsets[index % offsets.length];
  }
}

customElements.define("folder-faq", FolderFaq);
