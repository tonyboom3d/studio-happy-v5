class WixReviewCarousel extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.currentIndex = 0;
        this.cards = [];
        this.autoAdvanceTimeout = null;
        this.AUTO_ADVANCE_MS = 6000;
        this.resizeObserver = null;

        this.handleResize = () => {
            this.syncHeightToContainer();
            this.updateCarousel();
        };

        this.defaultReviews = this.buildDefaultData();
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────────

    connectedCallback() {
        this._injectGlobalStyles();
        this.render();
        this.cacheElements();
        this.initCarousel();
        this.bindEvents();
        this.setupHeightTracking();
        this.syncHeightToContainer();

        requestAnimationFrame(() => {
            this.syncHeightToContainer();
            this.updateCarousel();
        });
        setTimeout(() => { this.syncHeightToContainer();
            this.updateCarousel(); }, 100);
        setTimeout(() => { this.syncHeightToContainer();
            this.updateCarousel(); }, 500);

        window.addEventListener('resize', this.handleResize);
    }

    disconnectedCallback() {
        clearTimeout(this.autoAdvanceTimeout);
        this.resizeObserver?.disconnect();
        window.removeEventListener('resize', this.handleResize);
    }

    static get observedAttributes() {
        return ['reviews'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'reviews' && oldValue !== newValue && this.stage) {
            this.currentIndex = 0;
            this.initCarousel();
        }
    }

    // ─── Data ────────────────────────────────────────────────────────────────────

    get reviews() {
        const raw = this.getAttribute('reviews');
        if (!raw) return this.defaultReviews;
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) && parsed.length ? parsed : this.defaultReviews;
        } catch {
            return this.defaultReviews;
        }
    }

    buildDefaultData() {
        // rotation: the card's natural resting tilt in degrees (alternating ±)
        return [{
                reviewerName: 'דנה ישראלי',
                reviewDate: '01.05.26',
                rating: 5,
                rotation: -1.5,
                reviewText: 'פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה....',
                profileImage: ''
            },
            {
                reviewerName: 'אבי כהן',
                reviewDate: '15.04.26',
                rating: 4.5,
                rotation: 1.5,
                reviewText: 'פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה.',
                profileImage: ''
            },
            {
                reviewerName: 'שירן לוי',
                reviewDate: '28.03.26',
                rating: 5,
                rotation: -1,
                reviewText: 'פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה.',
                profileImage: ''
            },
            {
                reviewerName: 'יעל חזן',
                reviewDate: '10.02.26',
                rating: 4,
                rotation: 1,
                reviewText: 'פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה פה יוצג הביקורת עצמה.',
                profileImage: ''
            }
        ];
    }

    // ─── Font / Icon injection ───────────────────────────────────────────────────

    _injectGlobalStyles() {
        const resources = [
            { id: 'wix-review-preconnect-gfonts', tag: 'link', rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            { id: 'wix-review-preconnect-gstatic', tag: 'link', rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: '' },
            { id: 'wix-review-heebo', tag: 'link', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap' }
        ];
        resources.forEach(({ id, tag, rel, href, crossOrigin }) => {
            if (document.getElementById(id)) return;
            const el = document.createElement(tag);
            el.id = id;
            if (rel) el.rel = rel;
            if (href) el.href = href;
            if (crossOrigin !== undefined) el.crossOrigin = crossOrigin;
            document.head.appendChild(el);
        });
    }

    // ─── Render ──────────────────────────────────────────────────────────────────

    render() {
        this.shadowRoot.innerHTML = `
        <style>
            :host {
                --color-gold:          #F5902F;
                --color-purple:        #5A2180;
                --color-purple-mid:    #7B3BAB;
                --color-purple-light:  #D9A8F5;
                --color-surface:       #E4C1F9;
                --color-ink:           #393B61;
                display: block;
                width: 100%;
                height: 100%;
                min-height: 0;
                direction: rtl;
                font-family: 'Heebo', sans-serif;
                font-weight: 500;
                box-sizing: border-box;
                overflow: hidden;
            }

            * { box-sizing: border-box; font-family: inherit; }

            /* ── Progress bar keyframe (same as workshop carousel) ── */
            @keyframes dot-progress {
                from { transform: scaleX(0); }
                to   { transform: scaleX(1); }
            }

            /* ── Root layout ── */
            .root {
                width: 100%;
                height: 100%;
                max-width:  var(--carousel-available-width,  100%);
                max-height: var(--carousel-available-height, 100%);
                min-height: 0;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                justify-content: flex-end;
                padding: 16px clamp(12px, 2.5vw, 24px) 14px;
                position: relative;
                isolation: isolate;
                overflow: hidden;
            }

            /* ── Stage area ── */
            .carousel-wrap {
                position: relative;
                flex: 1 1 0;
                min-height: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 16px;
                overflow: visible;
            }

            #carousel-stage {
                position: relative;
                width: 100%;
                height: var(--carousel-stage-height, 300px);
                overflow: visible;
                cursor: grab;
            }

            #carousel-stage.dragging { cursor: grabbing; user-select: none; }
            #carousel-stage.dragging .card-wrapper { pointer-events: none; }

            /* ── Card wrapper: handles positioning + transition; overflow visible for avatar ── */
            .card-wrapper {
                position: absolute;
                top: 50%;
                left: 50%;
                width: clamp(260px, min(82%, 420px), 420px);
                overflow: visible;
                /*
                 * "Dealing card" physics:
                 *   transform — spring easing (cubic-bezier with slight overshoot)
                 *               so the card accelerates in then gently overshoots and settles,
                 *               exactly like a physical card tossed onto a table.
                 *   opacity   — faster standard ease-out so the card is visible quickly.
                 */
                transition: transform 0.65s cubic-bezier(0.34, 1.12, 0.64, 1),
                            opacity  0.40s cubic-bezier(0.4, 0, 0.2, 1);
            }

            /* ── Card visual: the actual purple bordered box ── */
            .card-visual {
                width: 100%;
                background: var(--color-purple);
                border: 3px solid #ffffff;
                border-radius: 1.5rem;
                overflow: hidden;
                box-shadow: -4px 5px 0 0 rgba(0, 0, 0, 0.30);
                /* Extra top padding gives breathing room for the overhanging avatar */
                padding: 44px 20px 16px 20px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                position: relative;
                min-height: 190px;
            }

            /* ── Decorative quote mark ── */
            .quote-mark {
                position: absolute;
                top: 40px;
                left: 14px;
                font-size: 70px;
                line-height: 1;
                color: rgba(255, 255, 255, 0.12);
                font-family: Georgia, 'Times New Roman', serif;
                font-weight: 900;
                pointer-events: none;
                user-select: none;
                z-index: 0;
                /* Prevent the glyph from affecting layout */
                transform: translateY(8px);
            }

            /* ── Card header: name + date ── */
            .card-header {
                display: flex;
                flex-direction: column;
                align-items: flex-start; /* RTL: flex-start = visual right */
                gap: 2px;
                position: relative;
                z-index: 1;
            }

            .reviewer-name {
                font-size: 1rem;
                font-weight: 700;
                color: #ffffff;
                line-height: 1.2;
                margin: 0;
            }

            .review-date {
                font-size: 0.78rem;
                color: var(--color-purple-light);
                font-weight: 500;
            }

            /* ── Review text with 4-line clamp + bottom fade ── */
            .review-text {
                margin: 0;
                font-size: calc(0.85rem + 2px);
                color: #ffffff;
                line-height: 1.5;
                font-weight: 400;
                display: -webkit-box;
                -webkit-line-clamp: 4;
                -webkit-box-orient: vertical;
                overflow: hidden;
                position: relative;
                z-index: 1;
                /* Fade-out effect over the last ~30% of the text block */
                -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
                mask-image:         linear-gradient(to bottom, black 60%, transparent 100%);
            }

            /* When text fits within 4 lines the fade is invisible — no issue */
            .review-text.no-clamp {
                -webkit-line-clamp: unset;
                -webkit-mask-image: none;
                mask-image: none;
            }

            /* ── Card footer: stars row + "המשך" button below it ── */
            .card-footer {
                display: flex;
                flex-direction: column;
                align-items: flex-start; /* RTL flex-start = visual right */
                gap: 8px;
                margin-top: 6px;
                position: relative;
                z-index: 1;
            }

            /* "המשך" button — pink pill, right-aligned, below the review text */
            .continue-btn {
                background: #FF99C8;
                border: none;
                color: #ffffff;
                border-radius: 9999px;
                padding: 4px 14px;
                font-size: 15px;
                font-weight: 700;
                cursor: pointer;
                font-family: 'Heebo', sans-serif;
                transition: background 0.2s, transform 0.15s;
                white-space: nowrap;
                line-height: 1.4;
                /* Align to the right in RTL (align-self flex-start = visual right) */
                align-self: flex-start;
                order: 2; /* appears after the stars row */
            }

            .continue-btn:hover {
                background: #ff7ab8;
                transform: translateY(-2px);
            }


            .stars {
                display: flex;
                gap: 2px;
                align-items: center;
                flex-shrink: 0;
                order: 1; /* appears before the "המשך" button */
            }

            /* ── Avatar: circular, overlaps top-right of card ── */
            .avatar-wrap {
                position: absolute;
                /* Centered on the top border of the card-visual (3px border + half 72px = 36px) */
                top: -36px;
                right: 18px;
                width: 72px;
                height: 72px;
                border-radius: 50%;
                border: 3px solid #ffffff;
                overflow: hidden;
                background: #C280EB;
                box-shadow: -2px 3px 0 0 rgba(0, 0, 0, 0.22);
                z-index: 3;
                flex-shrink: 0;
            }

            .avatar-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .avatar-placeholder {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #C280EB;
            }

            /* ── Navigation bar ── */
            .nav {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                flex: 0 0 auto;
                margin-top: 0;
            }

            .nav-btn {
                width: 40px;
                height: 40px;
                border-radius: 20px;
                border: 3px solid #ffffff;
                background: #ffffff;
                color: var(--color-purple);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                box-shadow: -2px 3px 0 0 rgba(0, 0, 0, 0.30);
                transition: box-shadow 0.15s, transform 0.15s;
            }

            .nav-btn:active { box-shadow: none; transform: translate(-2px, 3px); }

            /* ── Pagination dots with progress bar ── */
            .dots {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
            }

            .dot {
                position: relative;
                width: 10px;
                height: 10px;
                padding: 0;
                border-radius: 50%;
                border: 1.5px solid rgba(255, 255, 255, 0.5);
                background: #ffffff;
                transition: all 0.3s;
                appearance: none;
                overflow: hidden;
                cursor: pointer;
            }

            .dot::after {
                content: '';
                position: absolute;
                inset: 0;
                background: var(--color-purple);
                transform: scaleX(0);
                /* Fills right-to-left (natural RTL direction) */
                transform-origin: right center;
                border-radius: inherit;
            }

            .dot.active       { width: 32px; border-radius: 9999px; }
            .dot.active::after { transform: scaleX(0); }
            .dot.progressing::after {
                animation: dot-progress 6000ms linear forwards;
            }

            /* ── Full-text modal ── */
            .full-text-modal {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.55);
                z-index: 100;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 16px;
                opacity: 0;
                transition: opacity 0.3s;
                font-family: 'Heebo', sans-serif;
            }

            .full-text-modal.open { display: flex; opacity: 1; }

            .modal-content {
                background: var(--color-surface);
                border-radius: 1.5rem;
                border: 3px solid var(--color-ink);
                box-shadow: -4px 5px 0 0 rgba(0, 0, 0, 0.30);
                padding: 24px 20px 20px;
                max-width: 440px;
                width: 100%;
                max-height: 80vh;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                position: relative;
                transform: scale(0.95) translateY(16px);
                opacity: 0;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            opacity  0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .modal-content::-webkit-scrollbar       { width: 6px; }
            .modal-content::-webkit-scrollbar-track  { background: var(--color-surface); border-radius: 10px; }
            .modal-content::-webkit-scrollbar-thumb  { background: var(--color-purple); border-radius: 10px; }

            .full-text-modal.open .modal-content {
                transform: scale(1) translateY(0);
                opacity: 1;
            }

            .modal-close-btn {
                position: absolute;
                top: 12px;
                left: 12px;
                background: transparent;
                border: none;
                cursor: pointer;
                color: var(--color-ink);
                padding: 4px;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .modal-reviewer-name {
                font-size: 1.1rem;
                font-weight: 700;
                color: var(--color-ink);
                margin: 0;
            }

            .modal-meta {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .modal-date {
                font-size: 0.8rem;
                color: var(--color-purple-mid);
                font-weight: 500;
            }

            .modal-stars { display: flex; gap: 2px; align-items: center; }

            .modal-text {
                font-size: 0.92rem;
                color: var(--color-ink);
                line-height: 1.65;
                margin: 0;
                font-weight: 400;
                border-top: 2px solid rgba(90, 33, 128, 0.18);
                padding-top: 12px;
                white-space: pre-line;
            }

            /* ── Responsive ── */
            @media (max-width: 768px) {
                .root { padding-inline: 8px; padding-bottom: 12px; }
                .carousel-wrap { margin-bottom: 12px; }
                .card-wrapper { width: min(88%, 380px); }
                .card-visual  { padding: 42px 16px 14px; }
                .reviewer-name { font-size: 0.95rem; }
                .review-text   { font-size: calc(0.82rem + 2px); }
                .nav-btn { width: 36px; height: 36px; border-radius: 18px; }
                .dots { gap: 6px; }
            }

            @media (max-width: 480px) {
                .root { padding-inline: 4px; }
                .card-wrapper  { width: min(92%, 340px); }
                .card-visual   { padding: 40px 14px 12px; }
                .reviewer-name { font-size: 0.9rem; }
                .review-text   { font-size: calc(0.79rem + 2px); }
                .avatar-wrap   { width: 62px; height: 62px; top: -30px; right: 14px; }
                .quote-mark    { font-size: 56px; left: 10px; }
                .continue-btn  { font-size: 13px; padding: 3px 12px; }
                .nav-btn { width: 34px; height: 34px; }
            }

            @media (max-width: 360px) {
                .card-wrapper { width: min(94%, 300px); }
                .card-visual  { padding: 38px 12px 10px; min-height: 170px; }
                .nav { gap: 6px; }
                .dot.active { width: 26px; }
            }
        </style>

        <div class="root">
            <div class="carousel-wrap">
                <div id="carousel-stage"></div>
            </div>

            <div class="nav">
                <!-- In RTL "Next" arrow points right (→) and navigates to the previous index -->
                <button id="nextBtn" class="nav-btn" aria-label="הבא">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 448 512" fill="currentColor">
                        <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h306.7L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                    </svg>
                </button>

                <div id="pagination-dots" class="dots"></div>

                <button id="prevBtn" class="nav-btn" aria-label="הקודם">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 448 512" fill="currentColor">
                        <path d="M9.4 278.6c-12.5-12.5-12.5-32.8 0-45.3l160-160c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L109.2 224H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H109.2L214.6 393.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0l-160-160z"/>
                    </svg>
                </button>
            </div>
        </div>

        <!-- Full review text modal -->
        <div id="fullTextModal" class="full-text-modal" role="dialog" aria-modal="true" aria-label="ביקורת מלאה">
            <div class="modal-content">
                <button id="modalCloseBtn" class="modal-close-btn" aria-label="סגור">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 384 512" fill="currentColor">
                        <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
                    </svg>
                </button>
                <h3 id="modalName"  class="modal-reviewer-name"></h3>
                <div class="modal-meta">
                    <div id="modalStars" class="modal-stars"></div>
                    <span id="modalDate" class="modal-date"></span>
                </div>
                <p id="modalText" class="modal-text"></p>
            </div>
        </div>
        `;
    }

    // ─── DOM refs ────────────────────────────────────────────────────────────────

    cacheElements() {
        this.rootEl = this.shadowRoot.querySelector('.root');
        this.carouselWrap = this.shadowRoot.querySelector('.carousel-wrap');
        this.stage = this.shadowRoot.getElementById('carousel-stage');
        this.dotsContainer = this.shadowRoot.getElementById('pagination-dots');
        this.navEl = this.shadowRoot.querySelector('.nav');
        this.fullTextModal = this.shadowRoot.getElementById('fullTextModal');
    }

    // ─── Events ──────────────────────────────────────────────────────────────────

    bindEvents() {
        // Arrow navigation (RTL: right arrow = older review = currentIndex - 1)
        this.shadowRoot.getElementById('nextBtn').addEventListener('click', () => {
            this.currentIndex = (this.currentIndex - 1 + this.cards.length) % this.cards.length;
            this.updateCarousel();
        });

        this.shadowRoot.getElementById('prevBtn').addEventListener('click', () => {
            this.currentIndex = (this.currentIndex + 1) % this.cards.length;
            this.updateCarousel();
        });

        // Modal close
        this.shadowRoot.getElementById('modalCloseBtn').addEventListener('click', () => this.closeModal());
        this.fullTextModal.addEventListener('click', (e) => {
            if (e.target === this.fullTextModal) this.closeModal();
        });
        this.fullTextModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });

        // Touch swipe
        let touchStartX = 0;
        this.stage.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        this.stage.addEventListener('touchend', (e) => {
            const delta = touchStartX - e.changedTouches[0].screenX;
            if (Math.abs(delta) < 50) return;
            this.currentIndex = delta > 0 ?
                (this.currentIndex + 1) % this.cards.length :
                (this.currentIndex - 1 + this.cards.length) % this.cards.length;
            this.updateCarousel();
        }, { passive: true });

        // Mouse drag
        let dragStartX = 0;
        let isDragging = false;
        this.stage.addEventListener('mousedown', (e) => {
            dragStartX = e.clientX;
            isDragging = true;
            this.stage.classList.add('dragging');
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.stage.classList.remove('dragging');
            const delta = dragStartX - e.clientX;
            if (Math.abs(delta) < 50) return;
            this.currentIndex = delta > 0 ?
                (this.currentIndex + 1) % this.cards.length :
                (this.currentIndex - 1 + this.cards.length) % this.cards.length;
            this.updateCarousel();
        });
        this.stage.addEventListener('dragstart', (e) => e.preventDefault());
    }

    // ─── Carousel initialisation ─────────────────────────────────────────────────

    initCarousel() {
        this.cards = [];
        this.stage.innerHTML = '';
        this.dotsContainer.innerHTML = '';

        this.reviews.forEach((review, index) => {
            // Pagination dot
            const dot = document.createElement('button');
            dot.className = `dot ${index === this.currentIndex ? 'active' : ''}`;
            dot.setAttribute('aria-label', `ביקורת ${index + 1}`);
            dot.addEventListener('click', () => {
                this.currentIndex = index;
                this.updateCarousel();
            });
            this.dotsContainer.appendChild(dot);

            // Card DOM
            const card = document.createElement('div');
            card.className = 'card-wrapper';
            // Natural resting tilt for this card (falls back to alternating values if not in data)
            const FALLBACK_ROTATIONS = [-1.5, 1.5, -1, 1];
            card.dataset.rot = review.rotation ?? FALLBACK_ROTATIONS[index % FALLBACK_ROTATIONS.length];

            const avatarContent = review.profileImage ?
                `<img class="avatar-img" src="${review.profileImage}" alt="${this._escAttr(review.reviewerName)}" loading="lazy">` :
                `<div class="avatar-placeholder" aria-hidden="true">${this._avatarSVG()}</div>`;

            card.innerHTML = `
                <div class="card-visual">
                    <div class="quote-mark" aria-hidden="true">\u201D</div>
                    <div class="card-header">
                        <span class="reviewer-name">${this._escHTML(review.reviewerName)}</span>
                        <span class="review-date">${this._escHTML(review.reviewDate)}</span>
                    </div>
                    <p class="review-text">${this._escHTML(review.reviewText)}</p>
                    <div class="card-footer">
                        <button class="continue-btn" aria-label="קרא את הביקורת המלאה">המשך</button>
                        <div class="stars" aria-label="דירוג: ${review.rating} מתוך 5">${this.getStarsHTML(review.rating)}</div>
                    </div>
                </div>
                <div class="avatar-wrap" aria-hidden="true">${avatarContent}</div>
            `;

            // "המשך" opens the full-text modal
            card.querySelector('.continue-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openModal(index);
            });

            // Clicking a non-active card navigates to it
            card.addEventListener('click', () => {
                if (index !== this.currentIndex) {
                    this.currentIndex = index;
                    this.updateCarousel();
                }
            });

            this.stage.appendChild(card);
            this.cards.push(card);
        });

        this.updateCarousel();
    }

    // ─── Carousel positioning ─────────────────────────────────────────────────────

    updateCarousel() {
        this.syncHeightToContainer();

        const dots = Array.from(this.dotsContainer.children);
        const length = this.cards.length;

        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentIndex);
            dot.classList.remove('progressing');
        });

        this.cards.forEach((card, index) => {
            // Each card carries its own natural resting tilt (stored in data-rot)
            const rot = Number(card.dataset.rot || 0);

            if (index === this.currentIndex) {
                /*
                 * Active card: centred on the "table", with the card's natural tilt.
                 * The spring easing on .card-wrapper makes it overshoot slightly and
                 * settle, giving the feel of a physical card landing on a surface.
                 */
                card.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(1)`;
                card.style.opacity = '1';
                card.style.zIndex = '20';
                card.style.pointerEvents = 'auto';
                card.style.visibility = 'visible';

            } else if (index === (this.currentIndex - 1 + length) % length) {
                /*
                 * Incoming card (RTL: arrives from the RIGHT).
                 * Starts above-right, tilted as if being held or thrown from the right —
                 * mimics the moment just before a card is dealt onto the table.
                 * The positive rotation echoes "coming from the right hand side".
                 */
                card.style.transform = `translate(calc(-50% + 140%), calc(-50% - 55px)) rotate(${rot + 13}deg) scale(0.82)`;
                card.style.opacity = '0';
                card.style.zIndex = '10';
                card.style.pointerEvents = 'none';
                card.style.visibility = 'visible'; /* must stay visible so the CSS transition fires */

            } else if (index === (this.currentIndex + 1) % length) {
                /*
                 * Outgoing card (RTL: exits to the LEFT).
                 * Mirrors the incoming position but on the other side — the card continues
                 * the left-ward motion past centre after being displaced by the new card.
                 */
                card.style.transform = `translate(calc(-50% - 140%), calc(-50% - 55px)) rotate(${rot - 13}deg) scale(0.82)`;
                card.style.opacity = '0';
                card.style.zIndex = '10';
                card.style.pointerEvents = 'none';
                card.style.visibility = 'visible';

            } else {
                // All other cards: invisible behind the stack
                card.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(0.7)`;
                card.style.opacity = '0';
                card.style.zIndex = '0';
                card.style.pointerEvents = 'none';
                card.style.visibility = 'hidden';
            }
        });

        this.restartAutoAdvance();
        this.restartDotsProgress();
    }

    // ─── Auto-advance + progress dots ────────────────────────────────────────────

    stopAutoAdvance() {
        clearTimeout(this.autoAdvanceTimeout);
        this.autoAdvanceTimeout = null;
        Array.from(this.dotsContainer?.children || []).forEach(d => d.classList.remove('progressing'));
    }

    restartAutoAdvance() {
        this.stopAutoAdvance();
        if (this.cards.length <= 1 || this.fullTextModal?.classList.contains('open')) return;

        this.autoAdvanceTimeout = setTimeout(() => {
            this.currentIndex = (this.currentIndex + 1) % this.cards.length;
            this.updateCarousel();
        }, this.AUTO_ADVANCE_MS);
    }

    restartDotsProgress() {
        const dots = Array.from(this.dotsContainer?.children || []);
        dots.forEach((dot, i) => {
            dot.classList.remove('progressing');
            if (
                i === this.currentIndex &&
                this.cards.length > 1 &&
                !this.fullTextModal?.classList.contains('open')
            ) {
                // Force reflow to restart the CSS animation
                void dot.offsetWidth;
                dot.classList.add('progressing');
            }
        });
    }

    // ─── Full-text modal ─────────────────────────────────────────────────────────

    openModal(index) {
        const review = this.reviews[index];
        this.stopAutoAdvance();

        this.shadowRoot.getElementById('modalName').textContent = review.reviewerName;
        this.shadowRoot.getElementById('modalDate').textContent = review.reviewDate;
        this.shadowRoot.getElementById('modalStars').innerHTML = this.getStarsHTML(review.rating, 14);
        this.shadowRoot.getElementById('modalText').textContent = review.reviewText;

        this.fullTextModal.classList.add('open');
        this.shadowRoot.getElementById('modalCloseBtn').focus();
    }

    closeModal() {
        this.fullTextModal.classList.remove('open');
        this.restartAutoAdvance();
        this.restartDotsProgress();
    }

    // ─── Star rendering (supports half-stars) ────────────────────────────────────

    getStarsHTML(rating, size = 12) {
        const fill = `#F5902F`;
        const dim = `rgba(255,255,255,0.30)`;

        const fullStar = (color) =>
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 576 512" fill="${color}" style="display:inline-block;vertical-align:middle;flex-shrink:0"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.4 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>`;

        const halfStar = () =>
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 576 512" fill="${fill}" style="display:inline-block;vertical-align:middle;flex-shrink:0"><path d="M288 376.4l.1-.1 26.4 14.1 85.2 45.5-16.5-97.6-4.8-28.7 20.7-20.5 70.1-68.7-96.1-14.2-29.3-4.3-12.9-26.6L288 86.3l-.1 .3V376.4zm175.1 98.4c2 12-3 24.2-12.9 31.3s-23 8-33.8 2.3L288 439.6l-128.3 68.5c-10.8 5.7-23.9 4.4-33.8-2.3s-14.9-19.3-12.9-31.3L137.8 329 33.6 225.9c-8.6-8.5-11.7-21.2-7.9-32.7s13.7-19.9 25.7-21.7L195 150.3 259.4 18c5.4-11 16.5-18 28.8-18s23.4 7 28.8 18l64.3 132.3 143.6 21.2c12 1.8 22 10.2 25.7 21.7s.7 24.2-7.9 32.7L438.5 329l24.6 145.8z"/></svg>`;

        let html = '';
        for (let i = 1; i <= 5; i++) {
            if (rating >= i) html += fullStar(fill);
            else if (rating >= i - 0.5) html += halfStar();
            else html += fullStar(dim);
        }
        return html;
    }

    // ─── Placeholder avatar SVG ──────────────────────────────────────────────────

    _avatarSVG() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="rgba(255,255,255,0.80)">
            <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z"/>
        </svg>`;
    }

    // ─── Height tracking (adapted from workshop carousel) ────────────────────────

    setupHeightTracking() {
        this.resizeObserver?.disconnect();

        const observed = [this, this.parentElement, this.findConstraintContainer()].filter(Boolean);
        this.resizeObserver = new ResizeObserver(() => {
            this.syncHeightToContainer();
            this.updateCarousel();
        });
        observed.forEach(el => this.resizeObserver.observe(el));
    }

    findConstraintContainer() {
        const ancestors = [];
        let current = this.parentElement;
        while (current && current !== document.body && current !== document.documentElement) {
            if (current instanceof HTMLElement) ancestors.push(current);
            current = current.parentElement;
        }

        const wixCandidates = ancestors.filter(el =>
            (el.matches('.wixui-box') ||
                el.matches('[data-testid="responsive-container-content"]') ||
                el.id?.startsWith('comp-') ||
                el.className?.includes('comp-')) &&
            el.clientWidth > 0 && el.clientHeight > 0
        );

        if (wixCandidates.length) {
            const outerBox = wixCandidates.find(el => el.matches('.wixui-box') && el.clientHeight > 0);
            if (outerBox) return outerBox;
            return wixCandidates[0];
        }

        const generic = ancestors.filter(el => el.clientWidth > 0 && el.clientHeight > 0);
        return generic.length ? generic[0] : null;
    }

    syncHeightToContainer() {
        if (!this.rootEl || !this.stage) return;

        const container = this.findConstraintContainer();
        const selfRect = this.getBoundingClientRect();

        let containerWidth = selfRect.width > 0 ? Math.floor(selfRect.width) : 0;
        let containerHeight = selfRect.height > 0 ? Math.floor(selfRect.height) : 0;

        if ((!containerHeight || !containerWidth) && container) {
            const r = container.getBoundingClientRect();
            if (!containerHeight) containerHeight = Math.floor(r.height);
            if (!containerWidth) containerWidth = Math.floor(r.width);
        }

        if (!containerHeight || containerHeight < 100) containerHeight = 420;
        if (!containerWidth || containerWidth < 100) containerWidth = this.parentElement?.clientWidth || window.innerWidth;

        const rootStyles = window.getComputedStyle(this.rootEl);
        const wrapStyles = this.carouselWrap ? window.getComputedStyle(this.carouselWrap) : null;
        const padTop = parseFloat(rootStyles.paddingTop) || 0;
        const padBottom = parseFloat(rootStyles.paddingBottom) || 0;
        const padStart = parseFloat(rootStyles.paddingInlineStart) || parseFloat(rootStyles.paddingRight) || 0;
        const padEnd = parseFloat(rootStyles.paddingInlineEnd) || parseFloat(rootStyles.paddingLeft) || 0;
        const wrapMBottom = wrapStyles ? parseFloat(wrapStyles.marginBottom) || 0 : 0;
        const navHeight = this.navEl?.offsetHeight || 0;
        const reserved = padTop + padBottom + navHeight + wrapMBottom + 8;

        const stageHeight = Math.max(220, containerHeight - reserved);
        const stageWidth = Math.max(260, containerWidth - padStart - padEnd);

        this.style.setProperty('--carousel-available-width', `${containerWidth}px`);
        this.style.setProperty('--carousel-available-height', `${containerHeight}px`);
        this.style.setProperty('--carousel-stage-height', `${stageHeight}px`);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    _escHTML(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _escAttr(str) {
        return String(str ?? '').replace(/"/g, '&quot;');
    }
}

customElements.define('wix-review-carousel', WixReviewCarousel);