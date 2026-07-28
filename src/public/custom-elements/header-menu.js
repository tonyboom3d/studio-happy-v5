/* ─── Data ─── */
const workshopsItems = [
  { label: "קראפטינג", href: "#crafting" },
  { label: "קרמיקה", href: "#ceramics" },
  { label: "הכנת נרות", href: "#candles" },
  { label: "קדרות", href: "#pottery", disabled: true, badge: "(בקרוב)" },
];

const eventsItems = [
  { label: "אירועי חברה", href: "#corporate" },
  { label: "ימי הולדת", href: "#birthdays" },
];

const shopCategories = [
  {
    title: "ערכות DIY",
    image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=300&fit=crop",
    items: [
      { label: "ערכות לילדים", href: "#kids-kits" },
      { label: "ערכות לזוגות", href: "#couples-kits" },
    ],
  },
  {
    title: "מוצרי תפירה",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=300&fit=crop",
    items: [
      { label: "אקדחי תפירה", href: "#glue-guns" },
      { label: "חוטים", href: "#threads" },
    ],
  },
  {
    title: "קרמיקה",
    image: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=300&fit=crop",
    items: [
      { label: "קרמיקות", href: "#ceramics-shop" },
      { label: "צבעים", href: "#paints" },
    ],
  },
  {
    title: "נרות",
    image: "https://images.unsplash.com/photo-1602607616951-3c40e2c6e68a?w=400&h=300&fit=crop",
    items: [],
  },
];

const menuItems = [
  { label: "בית", href: "https://tonyboom3d.wixstudio.com/studio-happy" },
  { label: "הסטודיו", href: "https://tonyboom3d.wixstudio.com/studio-happy/blank" },
  { label: "הסדנאות שלנו", href: "#workshops", highlight: true, hasDropdown: true, dropdownType: "simple" },
  { label: "אירועים", href: "#events", hasDropdown: true, dropdownType: "simple" },
  { label: "חנות", href: "#shop", hasDropdown: true, dropdownType: "mega" },
  { label: "דברו איתנו", href: "#contact" },
];

/* ─── SVG Icons ─── */
const icons = {
  cart: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top:2px;opacity:0.7"><polyline points="6 9 12 15 18 9"/></svg>`,
};

/* ─── Build Simple Dropdown HTML ─── */
function buildSimpleDropdown(items) {
  const links = items
    .map((item) => {
      const badge = item.badge
        ? `<span class="hm-badge">${item.badge}</span>`
        : "";
      if (item.disabled) {
        return `<span class="hm-dd-link hm-dd-link--disabled">${item.label}${badge}</span>`;
      }
      return `<a href="${item.href}" class="hm-dd-link">${item.label}${badge}</a>`;
    })
    .join("");
  return `<div class="hm-simple-dropdown">${links}</div>`;
}

/* ─── Build Mega Menu HTML ─── */
function buildMegaMenu() {
  const categories = shopCategories
    .map((cat, ci) => {
      const subLinks =
        cat.items.length > 0
          ? cat.items.map((i) => `<a href="${i.href}" class="hm-mega-link">${i.label}</a>`).join("")
          : `<a href="#candles-shop" class="hm-mega-link">כל הנרות</a>`;
      return `
        <div class="hm-mega-cat" data-cat-idx="${ci}">
          <h4 class="hm-mega-cat-title">${cat.title}</h4>
          ${subLinks}
        </div>`;
    })
    .join("");

  return `
    <div class="hm-mega-menu" dir="rtl">
      <div class="hm-mega-inner">
        <div class="hm-mega-cats">${categories}</div>
        <div class="hm-mega-img-wrap">
          <img class="hm-mega-img hm-mega-img--active" src="${shopCategories[0].image}" alt="${shopCategories[0].title}" data-img-idx="0" />
          ${shopCategories
            .slice(1)
            .map(
              (cat, i) =>
                `<img class="hm-mega-img" src="${cat.image}" alt="${cat.title}" data-img-idx="${i + 1}" />`
            )
            .join("")}
        </div>
      </div>
    </div>`;
}

/* ─── Styles ─── */
/* Assistant: Bold (700) לתפריט הראשי, Regular (400) לתת-תפריט */
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;700&display=swap');

  :host {
    --hm-font: 'Assistant', system-ui, sans-serif;
    --hm-primary: #5B1985;
    --hm-secondary: #F5922E;
    --hm-tertiary: #FF7DA9;
    --hm-text: #FFFFFF;
    display: block;
    position: fixed !important;
    top: 30px !important;
    left: 50% !important;
    right: auto !important;
    width: max-content;
    transform: translateX(-50%);
    z-index: 100;
    pointer-events: none;
    font-family: var(--hm-font);
    direction: rtl;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .hm-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    width: auto;
    position: relative;
  }

  /* ── Center nav pill ── */
  .hm-nav-wrap {
    position: relative;
    left: auto;
    transform: none;
    pointer-events: auto;
  }

  .hm-nav {
    font-family: var(--hm-font);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    border-radius: 9999px;
    background: rgba(91, 25, 133, 0.72);
    box-shadow: 0 4px 30px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06);
    border: 2px solid #FFF8F0;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    position: relative;
  }

  /* ── Cart button ── */
  .hm-cart {
    position: relative;
    width: 36px;
    height: 36px;
    background: var(--hm-tertiary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease;
    flex-shrink: 0;
    color: var(--hm-text);
    border: none;
    outline: none;
  }
  .hm-cart:hover { transform: scale(1.05); }
  .hm-cart-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--hm-secondary);
    color: var(--hm-text);
    font-size: 9px;
    font-weight: 600;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  /* ── Nav items ── */
  .hm-nav-item {
    position: relative;
  }

  .hm-nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 9999px;
    font-family: var(--hm-font);
    font-size: 15px;
    font-weight: 400;
    white-space: nowrap;
    text-decoration: none;
    color: var(--hm-text);
    transition: color 0.15s ease;
    z-index: 1;
  }
  .hm-nav-link--highlight {
    color: var(--hm-text);
  }

  /* Hover/active background pill */
  .hm-nav-link::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    background: var(--hm-secondary);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.18s ease, transform 0.18s ease;
    z-index: -1;
  }
  .hm-nav-link--highlight::before {
    background: var(--hm-secondary);
  }
  .hm-nav-link:hover::before,
  .hm-nav-link.hm-nav-link--active::before {
    opacity: 1;
    transform: scale(1);
  }

  /* Permanent light pill for highlighted items */
  .hm-nav-link--highlight::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    background: var(--hm-secondary);
    z-index: -2;
  }

  /* ── Simple Dropdown ── */
  .hm-simple-dropdown {
    font-family: var(--hm-font);
    font-weight: 400;
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    left: auto;
    min-width: 180px;
    padding: 8px 0;
    border-radius: 16px;
    background: rgba(91, 25, 133, 0.72);
    box-shadow: 0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
    border: none;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 50;

    opacity: 0;
    transform: translateY(8px) scale(0.96);
    pointer-events: none;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }
  .hm-simple-dropdown.hm-open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .hm-dd-link {
    display: block;
    padding: 10px 20px;
    font-size: 15px;
    font-weight: 400;
    color: var(--hm-text);
    text-decoration: none;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .hm-dd-link:hover {
    background: var(--hm-secondary);
    color: var(--hm-text);
  }
  .hm-dd-link--disabled {
    color: var(--hm-text);
    cursor: not-allowed;
  }

  .hm-badge {
    font-family: var(--hm-font);
    font-weight: 400;
    margin-right: 8px;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 9999px;
    background: var(--hm-tertiary);
    color: var(--hm-text);
  }

  /* ── Mega Menu ── */
  .hm-mega-menu {
    font-family: var(--hm-font);
    font-weight: 400;
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    left: auto;
    width: 620px;
    padding: 20px 24px;
    border-radius: 24px;
    background: rgba(91, 25, 133, 0.72);
    box-shadow: 0 20px 60px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06);
    border: none;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 50;

    opacity: 0;
    transform: translateY(8px) scale(0.96);
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .hm-mega-menu.hm-open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .hm-mega-inner {
    display: flex;
    gap: 20px;
    direction: rtl;
  }

  .hm-mega-cats {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
  }

  .hm-mega-cat {
    margin-bottom: 12px;
  }

  .hm-mega-cat-title {
    font-size: 14px;
    font-weight: 400;
    margin: 0 0 6px 0;
    padding: 4px 8px;
    border-radius: 8px;
    color: var(--hm-text);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .hm-mega-cat-title:hover,
  .hm-mega-cat--active .hm-mega-cat-title {
    background: var(--hm-secondary);
    color: var(--hm-text);
  }

  .hm-mega-link {
    display: block;
    padding: 6px 12px;
    font-size: 15px;
    font-weight: 400;
    color: var(--hm-text);
    text-decoration: none;
    border-radius: 6px;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .hm-mega-link:hover {
    color: var(--hm-text);
    background: var(--hm-secondary);
  }

  /* Mega image panel */
  .hm-mega-img-wrap {
    width: 180px;
    height: 200px;
    border-radius: 16px;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
  }

  .hm-mega-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(1.05);
    transition: opacity 0.25s ease, transform 0.25s ease;
  }
  .hm-mega-img--active {
    opacity: 1;
    transform: scale(1);
  }
`;

/* ─── Page-transition mask styles (injected into document) ─── */
const maskStyles = `
  @keyframes hm-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.045); }
  }

  .hm-page-mask {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: #FF99C1;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    clip-path: circle(0% at var(--ox, 50%) var(--oy, 50%));
    transition: clip-path 0.6s cubic-bezier(0.76, 0, 0.24, 1);
    will-change: clip-path;
  }
  .hm-page-mask.hm-mask-expand {
    clip-path: circle(150% at var(--ox, 50%) var(--oy, 50%));
  }

  .hm-page-mask__logo-shell {
    opacity: 0;
    transform: scale(0.92);
    transition: opacity 0.35s ease 0.35s, transform 0.35s ease 0.35s;
  }
  .hm-page-mask.hm-mask-expand .hm-page-mask__logo-shell {
    opacity: 1;
    transform: scale(1);
  }

  .hm-page-mask__logo {
    display: block;
    width: 140px;
    height: auto;
    animation: hm-breathe 1.8s ease-in-out infinite;
    animation-delay: 0.72s;
  }

  .hm-page-mask__text {
    font-family: 'Assistant', system-ui, sans-serif;
    font-weight: 400;
    font-size: 18px;
    color: #fff;
    direction: rtl;
    text-align: center;
    margin: 0;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.35s ease 0.5s, transform 0.35s ease 0.5s;
  }
  .hm-page-mask.hm-mask-expand .hm-page-mask__text {
    opacity: 1;
    transform: translateY(0);
  }
`;

/** true אם היעד זהה לדף הנוכחי (אין צורך בניווט) */
function isSameDestination(href) {
  if (!href || href === "#") return true;
  try {
    const target = new URL(href, window.location.href);
    const cur = new URL(window.location.href);
    const norm = (u) => {
      const p = u.pathname.replace(/\/+$/, "") || "/";
      return `${u.origin}${p}${u.search}${u.hash}`;
    };
    return norm(target) === norm(cur);
  } catch {
    return false;
  }
}

/** true אם היעד נמצא באותו דף (אותו origin+pathname), גם אם ה-hash שונה */
function isSamePage(href) {
  if (!href || href === "#") return true;
  try {
    const target = new URL(href, window.location.href);
    const cur = new URL(window.location.href);
    const normPage = (u) => {
      const p = u.pathname.replace(/\/+$/, "") || "/";
      return `${u.origin}${p}`;
    };
    return normPage(target) === normPage(cur);
  } catch {
    return false;
  }
}

/* ─── Inject mask styles into document once ─── */
(function injectMaskStyles() {
  if (document.getElementById("hm-mask-styles")) return;
  const tag = document.createElement("style");
  tag.id = "hm-mask-styles";
  tag.textContent = maskStyles;
  document.head.appendChild(tag);
})();

/* ─── Custom Element ─── */
class HeaderMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._openDropdown = null;
    this._closeTimer = null;
    this._hoveredCat = 0;
    this._maskEl = null;
  }

  connectedCallback() {
    this._lockToTopRight();
    this._render();
    this._bindEvents();
  }

  disconnectedCallback() {
    if (this._closeTimer) clearTimeout(this._closeTimer);
    if (this._maskEl) this._maskEl.remove();
  }

  _lockToTopRight() {
    // Wix can inject inline positioning on custom elements; force it to stay centered at the top.
    this.style.setProperty("position", "fixed", "important");
    this.style.setProperty("top", "30px", "important");
    this.style.setProperty("left", "50%", "important");
    this.style.setProperty("right", "auto", "important");
    this.style.setProperty("width", "max-content", "important");
    this.style.setProperty("transform", "translateX(-50%)", "important");
    this.style.setProperty("inset", "30px auto auto 50%", "important");
  }

  /* ── Page transition mask: פתיחה → תוכן → ניווט (המסך החדש מסתיר את המאסק) ── */
  _showMask(originX, originY, navigate) {
    if (this._maskEl) this._maskEl.remove();

    const ox = Math.round((originX / window.innerWidth) * 100);
    const oy = Math.round((originY / window.innerHeight) * 100);

    const mask = document.createElement("div");
    mask.className = "hm-page-mask";
    mask.style.setProperty("--ox", `${ox}%`);
    mask.style.setProperty("--oy", `${oy}%`);
    mask.innerHTML = `
      <div class="hm-page-mask__logo-shell">
        <img class="hm-page-mask__logo"
             src="https://static.wixstatic.com/media/6b73e9_6e7c52763bb24ba6812aaac51ecb4296~mv2.png"
             alt="Studio Happy" />
      </div>
      <p class="hm-page-mask__text">יוצרים את הדף עבורך...</p>
    `;
    document.body.appendChild(mask);
    this._maskEl = mask;

    let didNavigate = false;
    const runNavigate = () => {
      if (didNavigate) return;
      didNavigate = true;
      navigate();
    };

    const afterExpandVisible = () => {
      const delayMsBeforeNavigate = 2000;
      setTimeout(runNavigate, delayMsBeforeNavigate);
    };

    const onTransitionEnd = (e) => {
      if (e.target !== mask || e.propertyName !== "clip-path") return;
      if (!mask.classList.contains("hm-mask-expand")) return;
      mask.removeEventListener("transitionend", onTransitionEnd);
      afterExpandVisible();
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mask.classList.add("hm-mask-expand");
      });
    });

    mask.addEventListener("transitionend", onTransitionEnd);

    setTimeout(() => {
      if (!didNavigate) {
        mask.removeEventListener("transitionend", onTransitionEnd);
        afterExpandVisible();
      }
    }, 1600);
  }

  _render() {
    const navItems = menuItems
      .map((item, i) => {
        let dropdown = "";
        if (item.dropdownType === "simple") {
          const data = item.label === "הסדנאות שלנו" ? workshopsItems : eventsItems;
          dropdown = buildSimpleDropdown(data);
        } else if (item.dropdownType === "mega") {
          dropdown = buildMegaMenu();
        }

        const chevron = item.hasDropdown ? icons.chevronDown : "";
        const highlightClass = item.highlight ? " hm-nav-link--highlight" : "";

        return `
          <div class="hm-nav-item" data-idx="${i}" data-has-dropdown="${!!item.hasDropdown}">
            <a href="${item.href}" class="hm-nav-link${highlightClass}">
              ${item.label}${chevron}
            </a>
            ${dropdown}
          </div>`;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <header class="hm-header" dir="rtl">

        <!-- Center nav pill -->
        <div class="hm-nav-wrap">
          <nav class="hm-nav" dir="rtl">
            <button type="button" class="hm-cart" aria-label="עגלת קניות" data-action="open-cart">
              ${icons.cart}
              <span class="hm-cart-badge">0</span>
            </button>
            ${navItems}
          </nav>
        </div>

      </header>
    `;
  }

  _bindEvents() {
    const sr = this.shadowRoot;

    const cartBtn = sr.querySelector(".hm-cart");
    if (cartBtn) {
      cartBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dispatchEvent(
          new CustomEvent("open-cart", {
            bubbles: true,
            composed: true,
            detail: {},
          })
        );
      });
    }

    /* Nav link click → page transition mask */
    sr.querySelectorAll(".hm-nav-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        if (!href || href === "#") return;
        // מעבר בתוך אותו דף (כולל #section) — בלי מאסק ובלי רילואד
        if (isSamePage(href)) {
          if (isSameDestination(href)) return; // כבר נמצאים בדיוק באותו יעד
          // אם זה hash בלבד או URL שמצביע לאותו דף עם hash — עדכן hash בלבד
          try {
            const target = new URL(href, window.location.href);
            if (target.hash) {
              e.preventDefault();
              window.location.hash = target.hash;
            }
          } catch {
            // fallback: אם זה "#section" לא תקין כ-URL מסיבה כלשהי
            if (href.startsWith("#")) {
              e.preventDefault();
              window.location.hash = href;
            }
          }
          return;
        }
        e.preventDefault();
        const rect = link.getBoundingClientRect();
        const ox = rect.left + rect.width / 2;
        const oy = rect.top + rect.height / 2;
        this._showMask(ox, oy, () => {
          window.location.href = href;
        });
      });
    });

    /* Nav item hover → open/close dropdowns */
    sr.querySelectorAll(".hm-nav-item").forEach((item) => {
      const hasDropdown = item.dataset.hasDropdown === "true";

      item.addEventListener("mouseenter", () => {
        if (this._closeTimer) clearTimeout(this._closeTimer);
        const link = item.querySelector(".hm-nav-link");
        if (link) link.classList.add("hm-nav-link--active");

        if (hasDropdown) {
          this._closeAllDropdowns();
          const dd = item.querySelector(".hm-simple-dropdown, .hm-mega-menu");
          if (dd) dd.classList.add("hm-open");
          this._openDropdown = item;
        }
      });

      item.addEventListener("mouseleave", () => {
        const link = item.querySelector(".hm-nav-link");
        if (link) link.classList.remove("hm-nav-link--active");

        if (hasDropdown) {
          this._closeTimer = setTimeout(() => {
            const dd = item.querySelector(".hm-simple-dropdown, .hm-mega-menu");
            if (dd) dd.classList.remove("hm-open");
            this._openDropdown = null;
          }, 180);
        }
      });

      /* Keep dropdown open when hovering over it */
      const dd = item.querySelector(".hm-simple-dropdown, .hm-mega-menu");
      if (dd) {
        dd.addEventListener("mouseenter", () => {
          if (this._closeTimer) clearTimeout(this._closeTimer);
        });
        dd.addEventListener("mouseleave", () => {
          this._closeTimer = setTimeout(() => {
            dd.classList.remove("hm-open");
            this._openDropdown = null;
          }, 150);
        });
      }
    });

    /* Dropdown links click → page transition mask */
    sr.querySelectorAll(".hm-dd-link, .hm-mega-link").forEach((link) => {
      if (link.tagName.toLowerCase() !== "a") return;
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        if (!href || href === "#") return;
        // מעבר בתוך אותו דף (כולל #section) — בלי מאסק ובלי רילואד
        if (isSamePage(href)) {
          if (isSameDestination(href)) return; // כבר נמצאים בדיוק באותו יעד
          try {
            const target = new URL(href, window.location.href);
            if (target.hash) {
              e.preventDefault();
              window.location.hash = target.hash;
            }
          } catch {
            if (href.startsWith("#")) {
              e.preventDefault();
              window.location.hash = href;
            }
          }
          return;
        }
        e.preventDefault();
        const rect = link.getBoundingClientRect();
        const ox = rect.left + rect.width / 2;
        const oy = rect.top + rect.height / 2;
        this._showMask(ox, oy, () => {
          window.location.href = href;
        });
      });
    });

    /* Mega menu: category hover → swap image */
    sr.querySelectorAll(".hm-mega-cat").forEach((catEl) => {
      catEl.addEventListener("mouseenter", () => {
        const idx = parseInt(catEl.dataset.catIdx, 10);
        this._switchMegaImage(idx);

        sr.querySelectorAll(".hm-mega-cat").forEach((c) => c.classList.remove("hm-mega-cat--active"));
        catEl.classList.add("hm-mega-cat--active");
      });
    });

    /* Set first mega cat as active by default */
    const firstCat = sr.querySelector(".hm-mega-cat");
    if (firstCat) firstCat.classList.add("hm-mega-cat--active");
  }

  _closeAllDropdowns() {
    this.shadowRoot.querySelectorAll(".hm-simple-dropdown, .hm-mega-menu").forEach((dd) => {
      dd.classList.remove("hm-open");
    });
  }

  _switchMegaImage(idx) {
    const imgs = this.shadowRoot.querySelectorAll(".hm-mega-img");
    imgs.forEach((img) => {
      const isTarget = parseInt(img.dataset.imgIdx, 10) === idx;
      img.classList.toggle("hm-mega-img--active", isTarget);
    });
  }
}

customElements.define("header-menu", HeaderMenu);
