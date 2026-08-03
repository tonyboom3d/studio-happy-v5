/**
 * Wix Custom Element: workshops-dashboard
 * ----------------------------------------
 *
 * הוראות התקנה בוויקס:
 * 1. בעורך וויקס: הוסף רכיב "Custom Element" (Elements Panel > Embed > Custom Element).
 * 2. בהגדרות הרכיב, הגדר "Tag Name" בדיוק לפי הערך: workshops-dashboard
 * 3. העלה קובץ זה תחת "Source: Upload a file" (או ארח אותו ב-URL חיצוני ותן שם קובץ עם סיומת .js).
 * 4. אין צורך בשום קוד נוסף ב-Velo - כל הלוגיקה עצמאית בתוך הקובץ.
 *
 * הערות חשובות:
 * - האלמנט משתמש ב"Light DOM" (ללא Shadow DOM) כדי לאפשר לטיילווינד (Tailwind Play CDN),
 *   לפונט Heebo ולאייקוני Phosphor להיטען כרגיל ולפעול על כל האלמנטים שבתוכו.
 * - כתוצאה מכך, אם תשתמש ביותר ממופע אחד של הרכיב הזה באותו עמוד, יתכנו התנגשויות
 *   של מזהי ID (getElementById) - הרכיב תוכנן לשימוש כמופע יחיד בעמוד.
 * - הנתונים (mockWorkshops, mockOrders, waTemplates) הם נתוני דמה (mock) בדיוק כמו בקובץ
 *   המקורי. כדי לחבר לנתונים אמיתיים מוויקס, יש להחליף את מקורות הנתונים האלו בקריאות אמיתיות.
 * - חשוב: וויקס טוען את קובץ ה-Custom Element כ-ES module (לא כ-script רגיל), ובתוך
 *   module, הצהרות פונקציה ברמה העליונה *אינן* נהיות אוטומטית properties של window.
 *   תגי onclick="..." בתוך ה-HTML תמיד רצים מול ה-scope הגלובלי (window) - ולכן בסוף
 *   הקובץ יש בלוק מפורש שמצמיד כל פונקציה שנקראת מ-onclick אל window, כדי שזה יעבוד
 *   בוודאות גם ב-module וגם ב-script רגיל.
 */

// ============================================================
// ===================  תבנית ה-HTML של האלמנט  ===================
// ============================================================
var __wdTemplateHtml = `
    <!-- Header -->
    <header class="wd-header bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shrink-0 shadow-sm z-10 relative">
        <div class="flex items-center gap-3">
            <div class="wd-header-logo bg-primary text-white p-2 rounded-lg">
                <i class="ph ph-palette text-xl"></i>
            </div>
            <h1 class="wd-header-title text-xl font-bold text-gray-900">ניהול סדנאות</h1>
            <nav class="wd-header-tabs flex items-center gap-1 mr-4 bg-gray-100 p-1 rounded-lg" id="wdMainTabsNav">
                <button id="wdTabOrdersBtn" onclick="switchDashboardTab('orders')" class="px-3 py-1.5 rounded-md text-sm font-semibold bg-white text-primary shadow-sm">הזמנות</button>
                <button id="wdTabStaffBtn" onclick="switchDashboardTab('staff')" class="hidden px-3 py-1.5 rounded-md text-sm font-semibold text-gray-600 hover:bg-white/60 transition-colors">צוות ומשמרות</button>
            </nav>
        </div>
        
        <div class="flex items-center gap-4">
            <button id="templatesManagerBtn" onclick="openTemplatesManager()" class="text-sm font-medium text-gray-600 hover:text-primary transition-colors flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200 hover:bg-white">
                <i class="ph ph-whatsapp-logo text-lg text-green-500"></i>
                <span class="wd-header-btn-text">תבניות הודעה</span>
            </button>
            <div class="wd-header-divider h-6 w-px bg-gray-200"></div>
            <div class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg transition-colors">
                <div id="headerUserInitials" class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    ?
                </div>
                <div class="wd-header-user-text text-right">
                    <p id="headerUserName" class="text-sm font-semibold leading-tight">משתמש/ת</p>
                    <p id="headerUserRole" class="text-xs text-gray-500 leading-tight"></p>
                </div>
                <i class="wd-header-user-text ph ph-caret-down text-gray-400 text-xs"></i>
            </div>
        </div>
    </header>

    <!-- Main Layout -->
    <main id="wdOrdersMain" class="flex-1 overflow-hidden flex flex-col p-6 bg-gray-100 relative">
        
        <!-- Alerts Bar -->
        <div id="alertsContainer" class="mb-4 hidden shrink-0">
            <div class="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between shadow-sm cursor-pointer hover:bg-red-100 transition-colors" onclick="toggleAlertFilter()">
                <div class="flex items-center gap-3 text-red-700">
                    <i class="ph-fill ph-warning-circle text-xl text-red-500"></i>
                    <p class="text-sm font-medium" id="alertText">ישנן הזמנות ללא סקיצה ב-6 הימים הקרובים!</p>
                </div>
                <button class="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-md font-medium hover:bg-red-200 transition-colors" id="alertFilterBtn">
                    סנן תצוגה
                </button>
            </div>
        </div>

        <!-- Filters Bar -->
        <section class="wd-filters-panel" aria-label="סינון הזמנות">
            <div class="wd-filters-header">
                <div class="wd-filters-title">
                    <span class="wd-filters-icon"><i class="ph ph-funnel-simple"></i></span>
                    <div>
                        <h2>סינון הזמנות</h2>
                        <p id="workshopsCount">מציג 0 סדנאות</p>
                    </div>
                </div>
                <div class="wd-filters-actions">
                    <button onclick="clearFilters()" class="wd-clear-filters hidden" id="clearFiltersBtn">
                        <i class="ph ph-x"></i>
                        איפוס
                    </button>
                    <span id="lastDataRefreshLabel" class="wd-refresh-label" title="עדכון נתונים אחרון">עודכן לאחרונה: —</span>
                    <button id="refreshDataBtn" onclick="refreshDashboard()" class="wd-refresh-button" title="רענן נתונים">
                        <i id="refreshDataIcon" class="ph ph-arrows-clockwise"></i>
                    </button>
                    <button id="wdFiltersToggleBtn" onclick="toggleFiltersPanel()" class="wd-filters-toggle-button" title="הצג/הסתר סינון">
                        <i class="ph ph-caret-down" id="wdFiltersToggleIcon"></i>
                    </button>
                </div>
            </div>

            <div class="wd-filters-body" id="wdFiltersBody">
            <div class="wd-filters-grid">
                <label class="wd-filter-field wd-filter-search">
                    <span>חיפוש</span>
                    <div class="wd-filter-control">
                        <i class="ph ph-magnifying-glass"></i>
                        <input type="text" id="searchInput" placeholder="סוג סדנה..." onkeyup="onFilterInputChange()">
                    </div>
                </label>

                <label class="wd-filter-field">
                    <span>סוג סדנה</span>
                    <select id="typeFilter" onchange="onFilterInputChange()">
                        <option value="">הכול</option>
                    </select>
                </label>

                <label class="wd-filter-field">
                    <span>מדריך</span>
                    <select id="instructorFilter" onchange="onFilterInputChange()">
                        <option value="">כולם</option>
                    </select>
                </label>

                <fieldset class="wd-date-field">
                    <legend>טווח תאריכים</legend>
                    <div class="wd-date-controls">
                        <label>
                            <span>מתאריך</span>
                            <input type="date" id="dateRangeFromFilter" onchange="onDateRangeFilterChange()">
                        </label>
                        <i class="ph ph-arrow-left"></i>
                        <label>
                            <span>עד תאריך</span>
                            <input type="date" id="dateRangeToFilter" onchange="onDateRangeFilterChange()">
                        </label>
                    </div>
                </fieldset>
            </div>

            <div class="wd-filters-footer">
                <div class="wd-filter-toggles">
                    <label class="wd-toggle">
                        <input type="checkbox" id="missingSketchesFilter" onchange="onFilterInputChange()">
                        <span class="wd-toggle-track"></span>
                        <span>חסרות סקיצות</span>
                    </label>
                    <label class="wd-toggle" title="כולל הזמנות ישנות שאינן שמורות ב-CMS">
                        <input type="checkbox" id="showAllOrdersToggle" onchange="onShowAllOrdersChange()">
                        <span class="wd-toggle-track"></span>
                        <span>כולל הזמנות ישנות</span>
                    </label>
                    <label class="wd-toggle" title="הצג גם הזמנות שבוטלו דרך Wix Bookings">
                        <input type="checkbox" id="showCancelledOrdersFilter" onchange="onFilterInputChange()">
                        <span class="wd-toggle-track"></span>
                        <span>כולל מבוטלות</span>
                    </label>
                </div>
                <div class="wd-selected-range">
                    <i class="ph ph-calendar-check"></i>
                    <span>הטווח שנבחר:</span>
                    <strong id="dateRangeLabel">—</strong>
                </div>
            </div>
            </div>
        </section>

        <!-- Workshops Table -->
        <div class="relative flex-1 min-h-0">
            <div class="wd-ws-table-wrap h-full overflow-auto bg-white border border-gray-200 rounded-xl shadow-sm">
                <table class="wd-ws-table w-full text-right divide-y divide-gray-200">
                    <thead class="bg-gray-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th scope="col" class="px-6 py-4 text-sm font-semibold text-gray-600">תאריך ושעות</th>
                            <th scope="col" class="px-6 py-4 text-sm font-semibold text-gray-600">סוג סדנה</th>
                            <th scope="col" class="px-6 py-4 text-sm font-semibold text-gray-600">צוות מדריכים</th>
                            <th scope="col" class="px-6 py-4 text-sm font-semibold text-gray-600">תפוסה וקבוצות</th>
                            <th scope="col" class="px-6 py-4 text-sm font-semibold text-gray-600 w-48 text-center">התקדמות סקיצות</th>
                        </tr>
                    </thead>
                    <tbody id="workshopsTableBody" class="divide-y divide-gray-100 bg-white">
                        <!-- Rows injected here -->
                    </tbody>
                </table>
            </div>
            <div id="tableFilterOverlay" class="wd-table-filter-overlay" style="display:none;">
                <div class="wd-spinner" style="width:36px;height:36px;border-width:3px;"></div>
                <p class="wd-loading-text" style="font-size:15px;">מסנן נתונים...</p>
            </div>
        </div>

        <!-- Pagination -->
        <div id="workshopsPagination" class="flex items-center justify-between gap-3 pt-3 shrink-0 hidden">
            <span class="text-sm text-gray-500 font-medium" id="paginationInfo"></span>
            <div class="flex items-center gap-2">
                <button onclick="__wdGoToPage(-1)" id="paginationPrevBtn" class="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                    <i class="ph ph-caret-right"></i> הקודם
                </button>
                <span class="text-sm font-semibold text-gray-700" id="paginationPageLabel"></span>
                <button onclick="__wdGoToPage(1)" id="paginationNextBtn" class="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                    הבא <i class="ph ph-caret-left"></i>
                </button>
            </div>
        </div>
    </main>

    <!-- Staff & Shifts tab (Phase 2, Module B core) -->
    <section id="wdStaffAdminSection" class="wd-staff-section hidden flex-1 overflow-hidden flex flex-col p-6 bg-gray-100 relative gap-4">
        <div class="wd-staff-toolbar flex items-center justify-between shrink-0">
            <div class="flex items-center gap-3">
                <h2 class="text-lg font-bold text-gray-900">צוות ומשמרות</h2>
                <div class="wd-staff-view-tabs flex items-center gap-1 bg-gray-200/70 p-1 rounded-lg">
                    <button id="saViewListBtn" onclick="setStaffAdminView('list')" class="px-3 py-1 rounded-md text-xs font-semibold bg-white shadow-sm text-primary">רשימה</button>
                    <button id="saViewHeatmapBtn" onclick="setStaffAdminView('heatmap')" class="px-3 py-1 rounded-md text-xs font-semibold text-gray-600 hover:bg-white/60">מפת חום</button>
                    <button id="saViewEmployeesBtn" onclick="setStaffAdminView('employees')" class="px-3 py-1 rounded-md text-xs font-semibold text-gray-600 hover:bg-white/60">עובדים</button>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <input type="month" id="saMonthPicker" onchange="onStaffAdminMonthChange()" class="compact-input bg-white text-sm">
                <button onclick="refreshStaffAdminTab()" class="text-sm font-medium text-gray-600 hover:text-primary flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-md border border-gray-200">
                    <i class="ph ph-arrows-clockwise"></i> <span class="wd-header-btn-text">רענן</span>
                </button>
            </div>
        </div>

        <div class="flex-1 overflow-auto bg-white border border-gray-200 rounded-xl shadow-sm p-4" id="saContentContainer">
            <p class="text-sm text-gray-400 text-center py-10" id="saLoadingLabel">טוען נתוני צוות...</p>
        </div>
    </section>

    <!-- Nudge Modal (Staff Admin) -->
    <div id="saNudgeModal" class="modal fixed inset-0 z-[60] items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md modal-content border border-gray-200">
            <div class="px-5 py-3 border-b flex justify-between items-center bg-green-50 rounded-t-xl">
                <h3 class="font-bold text-green-800 flex items-center gap-2"><i class="ph-fill ph-whatsapp-logo text-green-500"></i> שליחת תזכורת זמינות</h3>
                <button onclick="closeModal('saNudgeModal')" class="text-gray-400 hover:text-gray-700"><i class="ph ph-x"></i></button>
            </div>
            <div class="p-5 flex flex-col gap-4">
                <p class="text-sm text-gray-600" id="saNudgeTargetLabel"></p>
                <textarea id="saNudgeText" rows="5" class="compact-input w-full resize-none bg-gray-50" style="direction: rtl;" placeholder="טקסט ההודעה..."></textarea>
                <button onclick="sendStaffNudge()" class="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <i class="ph ph-paper-plane-right"></i> שלח עכשיו
                </button>
            </div>
        </div>
    </div>

    <!-- Employee Edit Modal (Staff Admin) -->
    <div id="saEmployeeModal" class="modal fixed inset-0 z-[60] items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md modal-content border border-gray-200">
            <div class="px-5 py-3 border-b flex justify-between items-center">
                <h3 class="font-bold text-gray-800" id="saEmployeeModalTitle">עריכת עובד/ת</h3>
                <button onclick="closeModal('saEmployeeModal')" class="text-gray-400 hover:text-gray-700"><i class="ph ph-x"></i></button>
            </div>
            <div class="p-5 flex flex-col gap-3">
                <input type="hidden" id="saEmpId">
                <label class="text-xs font-medium text-gray-700">מכסת משמרות מינימלית לחודש
                    <input type="number" id="saEmpMinShifts" min="0" class="compact-input w-full bg-gray-50 mt-1">
                </label>
                <label class="text-xs font-medium text-gray-700">מינימום שעות למשמרת
                    <input type="number" id="saEmpMinHours" min="0" step="0.5" class="compact-input w-full bg-gray-50 mt-1">
                </label>
                <label class="text-xs font-medium text-gray-700">צבע
                    <input type="color" id="saEmpColor" class="w-full h-9 bg-gray-50 mt-1 rounded">
                </label>
                <label class="text-xs font-medium text-gray-700">דירוג עדיפות (פנימי, לא גלוי לעובד)
                    <input type="number" id="saEmpPriorityRank" min="1" class="compact-input w-full bg-gray-50 mt-1">
                </label>
                <label class="text-xs font-medium text-gray-700">טלפון (לוואטסאפ)
                    <input type="text" id="saEmpPhone" class="compact-input w-full bg-gray-50 mt-1" style="direction: ltr;">
                </label>
                <label class="flex items-center gap-2 text-xs font-medium text-gray-700 mt-1">
                    <input type="checkbox" id="saEmpActive"> פעיל/ה
                </label>
                <button onclick="saveStaffEmployee()" class="w-full bg-primary hover:bg-primary-hover text-white font-medium py-2 rounded-lg mt-2">שמור</button>
            </div>
        </div>
    </div>

    <!-- Side Panel Overlay -->
    <div id="sidePanelOverlay" class="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 hidden opacity-0 transition-opacity duration-300" onclick="closeSidePanel()"></div>

    <!-- Side Panel -->
    <div id="sidePanel" class="wd-side-panel fixed top-0 left-0 h-full w-[1000px] max-w-full bg-white shadow-2xl z-50 transform -translate-x-full transition-transform duration-300 flex flex-col border-r border-gray-200">
        
        <!-- Side Panel Header -->
        <div class="wd-sp-header px-8 py-6 border-b border-gray-100 flex justify-between items-start shrink-0 bg-gray-50/50">
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-3">
                    <h2 class="text-2xl font-bold text-gray-800" id="spTitle">סדנת טאפטינג בוקר</h2>
                    <span id="spTag" class="px-2.5 py-1 rounded-md text-xs font-semibold">טאפטינג</span>
                </div>
                <div class="wd-sp-meta flex items-center gap-5 text-sm text-gray-600 font-medium">
                    <span class="flex items-center gap-1.5"><i class="ph ph-calendar-blank text-gray-400"></i> <span id="spDate">15/08/2026</span></span>
                    <span class="flex items-center gap-1.5"><i class="ph ph-clock text-gray-400"></i> <span id="spTime">10:00</span></span>
                    <span class="flex items-center gap-1.5"><i class="ph ph-users text-gray-400"></i> <span id="spCapacity">0/15 משתתפים</span></span>
                </div>
            </div>
            <button onclick="closeSidePanel()" class="p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-200 rounded-full transition-colors bg-white shadow-sm border border-gray-200">
                <i class="ph ph-x text-lg"></i>
            </button>
        </div>

        <!-- Side Panel Body (Orders List - Accordion Style) -->
        <div class="wd-sp-body flex-1 overflow-y-auto overflow-x-hidden p-0 bg-white">
            <table class="wd-orders-table w-full divide-y divide-gray-200 table-fixed">
                <thead class="bg-white sticky top-0 shadow-sm z-10">
                    <tr>
                        <th scope="col" class="px-8 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-[40%]">לקוח ופרטים</th>
                        <th scope="col" id="spProgressHeader" class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-[30%]">התקדמות סקיצות</th>
                        <th scope="col" id="spItemsHeader" class="px-8 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[30%]">סקיצות</th>
                    </tr>
                </thead>
                <tbody id="ordersTableBody" class="bg-white divide-y divide-gray-100">
                    <!-- Orders will be injected here -->
                </tbody>
            </table>
        </div>
    </div>

    <!-- Modals Background Overlay -->
    <div id="modalOverlay" class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[55] hidden opacity-0 transition-opacity duration-300"></div>

    <!-- Fullscreen Image Modal -->
    <div id="imageModal" class="modal fixed inset-0 z-[80] items-center justify-center p-4 bg-gray-900/90 backdrop-blur-sm cursor-pointer transition-opacity duration-300" onclick="closeModal('imageModal')">
        <div class="relative max-w-5xl w-full max-h-[90vh] p-2 flex flex-col items-center justify-center" onclick="event.stopPropagation()">
            <button onclick="closeModal('imageModal')" class="absolute -top-10 right-0 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 transition-colors"><i class="ph ph-x text-xl"></i></button>
            <img id="fullscreenImg" src="" class="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain border border-white/20">
        </div>
    </div>

    <!-- WhatsApp Modal -->
    <div id="waModal" class="modal fixed inset-0 z-[60] items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md modal-content border border-gray-200">
            <div class="px-5 py-3 border-b flex justify-between items-center bg-green-50 rounded-t-xl">
                <h3 class="font-bold text-green-800 flex items-center gap-2"><i class="ph-fill ph-whatsapp-logo text-green-500"></i> שליחת הודעה</h3>
                <button onclick="closeModal('waModal')" class="text-gray-400 hover:text-gray-700"><i class="ph ph-x"></i></button>
            </div>
            <div class="p-5 flex flex-col gap-4">
                <p class="text-sm text-gray-600">שליחה ללקוח: <strong id="waCustomerName"></strong></p>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">בחר תבנית:</label>
                    <select id="waTemplateSelect" onchange="updateWaPreview()" class="compact-input w-full bg-gray-50"></select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">תצוגה מקדימה (ניתן לערוך):</label>
                    <textarea id="waPreviewText" rows="4" class="compact-input w-full resize-none bg-gray-50" style="direction: rtl;"></textarea>
                </div>
                <button onclick="sendWhatsApp()" class="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <i class="ph ph-paper-plane-right"></i> שלח עכשיו
                </button>
            </div>
        </div>
    </div>

    <!-- Add Note Modal -->
    <div id="noteModal" class="modal fixed inset-0 z-[60] items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm modal-content">
            <div class="px-5 py-3 border-b flex justify-between items-center">
                <h3 class="font-bold text-gray-800">הערות הזמנה</h3>
                <button onclick="closeModal('noteModal')" class="text-gray-400"><i class="ph ph-x"></i></button>
            </div>
            <div class="p-5 flex flex-col gap-3">
                <textarea id="newNoteText" rows="3" class="compact-input w-full bg-gray-50" placeholder="הקלד הערה כאן..."></textarea>
                <button id="saveNoteBtn" onclick="saveNote()" class="bg-primary hover:bg-primary-hover text-white font-medium py-2 rounded-lg">שמור הערה</button>
            </div>
        </div>
    </div>

    <!-- Unapproved Sketch Modal — step 1: delete warning -->
    <div id="unapprovedModal" class="modal fixed inset-0 z-[70] items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md modal-content p-6">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">פסילת סקיצה</h3>
                <button onclick="closeUnapprovedModal()" class="text-gray-400 hover:text-gray-700"><i class="ph ph-x"></i></button>
            </div>
            <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-4 flex gap-2 items-start">
                <i class="ph-fill ph-warning text-red-500 text-lg mt-0.5"></i>
                <div>
                    <p class="font-semibold mb-1">פעולה זו תמחק את הסקיצה שנבחרה.</p>
                    <p>הלקוח יוכל לבחור סקיצה חדשה לאחר המחיקה. לא ניתן לבטל פעולה זו.</p>
                </div>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="closeUnapprovedModal()" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">ביטול</button>
                <button onclick="confirmUnapprovedDeleteWarning()" class="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors">המשך</button>
            </div>
        </div>
    </div>

    <!-- Unapproved Sketch Modal — step 2: WhatsApp choice -->
    <div id="unapprovedWaModal" class="modal fixed inset-0 z-[70] items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md modal-content p-6">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">הודעת וואטסאפ</h3>
                <button onclick="closeUnapprovedWaModal()" class="text-gray-400 hover:text-gray-700"><i class="ph ph-x"></i></button>
            </div>
            <div class="bg-green-50 border border-green-100 rounded-lg p-4 text-sm text-green-800 mb-4 flex gap-2 items-start">
                <i class="ph-fill ph-whatsapp-logo text-green-500 text-lg mt-0.5"></i>
                <p>האם לשלוח הודעת וואטסאפ למנהל הקבוצה על כך שהסקיצה לא אושרה?</p>
            </div>
            <div class="flex flex-col gap-3 mb-2">
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">בחר תבנית:</label>
                    <select id="unapprovedWaTemplateSelect" onchange="updateUnapprovedWaPreview()" class="compact-input w-full bg-gray-50"></select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">תצוגה מקדימה (ניתן לערוך):</label>
                    <textarea id="unapprovedWaPreviewText" rows="4" class="compact-input w-full resize-none bg-gray-50" style="direction: rtl;" placeholder="בחר/י תבנית כדי לראות את ההודעה..."></textarea>
                </div>
            </div>
            <div class="flex gap-3 mt-4">
                <button onclick="confirmRejectSketch(false)" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">לא, רק מחק</button>
                <button onclick="confirmRejectSketch(true)" class="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                    <i class="ph ph-paper-plane-right"></i> מחק ושלח הודעה
                </button>
            </div>
        </div>
    </div>

    <!-- Templates Manager Modal -->
    <div id="templatesModal" class="modal fixed inset-0 z-[60] items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col modal-content">
            <div class="px-6 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <i class="ph ph-whatsapp-logo text-green-500"></i> ניהול תבניות הודעה
                </h2>
                <button onclick="closeModal('templatesModal')" class="text-gray-400 hover:text-gray-700"><i class="ph ph-x"></i></button>
            </div>
            <div class="p-6 overflow-y-auto flex-1 bg-gray-50/50">
                <div class="mb-4 bg-blue-50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800">
                    <i class="ph ph-info mr-1"></i> משתנים נתמכים: <code>{{Name}}</code> (שם לקוח), <code>{{Date}}</code> (תאריך סדנה), <code>{{Time}}</code> (שעת סדנה), <code>{{OrderUrl}}</code> (קישור להזמנה).
                </div>
                <div id="templatesList" class="flex flex-col gap-4"></div>
                <button onclick="openTemplateEditor()" class="border-2 border-dashed border-gray-300 rounded-lg p-4 w-full text-gray-500 font-medium hover:bg-gray-50 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 mt-2">
                    <i class="ph ph-plus"></i> הוסף תבנית חדשה
                </button>
            </div>
        </div>
    </div>

    <!-- Template Edit/Create Modal -->
    <div id="templateEditModal" class="modal fixed inset-0 z-[70] items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg modal-content">
            <div class="px-5 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                <h3 class="font-bold text-gray-800" id="templateEditTitle">עריכת תבנית</h3>
                <button onclick="closeTemplateEditor()" class="text-gray-400 hover:text-gray-700"><i class="ph ph-x"></i></button>
            </div>
            <div class="p-5 flex flex-col gap-4">
                <input type="hidden" id="editTemplateId">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">שם התבנית:</label>
                    <input type="text" id="editTemplateName" class="compact-input w-full" placeholder="לדוגמה: תזכורת הגעה">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">גוף ההודעה:</label>
                    <textarea id="editTemplateBody" rows="6" class="compact-input w-full resize-y" placeholder="הקלד את הודעת הוואטסאפ כאן..."></textarea>
                    <p class="text-xs text-gray-500 mt-2 font-mono" dir="ltr">{{Name}}, {{Date}}, {{Time}}, {{OrderUrl}}</p>
                </div>
                <div class="flex gap-3 mt-2">
                    <button onclick="closeTemplateEditor()" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">ביטול</button>
                    <button onclick="saveTemplate()" class="flex-1 py-2 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors">שמור תבנית</button>
                    <button id="deleteTemplateBtn" onclick="deleteTemplate()" class="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors hidden" title="מחק תבנית"><i class="ph ph-trash text-lg"></i></button>
                </div>
            </div>
        </div>
    </div>
`;

// ============================================================
// ===================  מסך טעינה (Loading Screen)  ===================
// ============================================================
var __wdLoadingHtml = `
    <div id="wdLoadingOverlay" class="wd-loading-overlay">
        <div class="wd-spinner"></div>
        <p class="wd-loading-text">טוען נתונים...</p>
    </div>
`;

var __wdAccessDeniedHtml = `
    <div id="wdAccessDeniedOverlay" class="wd-access-denied-overlay">
        <div class="wd-access-denied-card">
            <i class="ph ph-lock-key wd-access-denied-icon" aria-hidden="true"></i>
            <h2 class="wd-access-denied-title">אין הרשאת גישה</h2>
            <p class="wd-access-denied-text">המשתמש המחובר אינו רשום במערכת ההרשאות של הדאשבורד. פנה/י למנהל/ת המערכת להוספה.</p>
        </div>
    </div>
`;

// ============================================================
// ===================  עיצוב (CSS) ייעודי לדאשבורד  ===================
// ============================================================
var __wdTagName = 'workshops-dashboard';

var __wdCustomCss = `
        body { font-family: 'Heebo', sans-serif; background-color: #F3F4F6; }
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
        
        .modal { display: none; }
        .modal.active { display: flex; animation: fadeIn 0.2s ease-out; }
        .modal-content { animation: slideUp 0.3s ease-out; }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .compact-input {
            @apply border border-gray-200 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all;
        }

        /* Compact, self-contained filter panel. Explicit font sizes prevent
           the dashboard's global text scaling from inflating these controls. */
        .wd-filters-panel {
            flex-shrink: 0;
            margin-bottom: 14px;
            overflow: hidden;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #fff;
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
            color: #374151;
        }
        .wd-filters-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 48px;
            padding: 7px 12px;
            border-bottom: 1px solid #eef0f3;
        }
        .wd-filters-title,
        .wd-filters-actions,
        .wd-filter-toggles,
        .wd-selected-range {
            display: flex;
            align-items: center;
        }
        .wd-filters-title { gap: 9px; }
        .wd-filters-icon {
            display: grid;
            width: 30px;
            height: 30px;
            place-items: center;
            border-radius: 8px;
            background: #eef2ff;
            color: #4f46e5;
            font-size: 17px;
        }
        .wd-filters-title h2 {
            margin: 0;
            color: #1f2937;
            font-size: 15px !important;
            font-weight: 700;
            line-height: 1.2 !important;
        }
        .wd-filters-title p {
            margin: 2px 0 0;
            color: #9ca3af;
            font-size: 12px !important;
            line-height: 1.2 !important;
        }
        .wd-filters-actions { gap: 8px; }
        .wd-clear-filters,
        .wd-refresh-button {
            border: 0;
            background: transparent;
            cursor: pointer;
        }
        .wd-clear-filters {
            display: flex;
            align-items: center;
            gap: 3px;
            padding: 5px 8px;
            border-radius: 6px;
            color: #dc2626;
            font-size: 13px !important;
            font-weight: 600;
        }
        .wd-clear-filters:hover { background: #fef2f2; }
        .wd-clear-filters.hidden { display: none; }
        .wd-refresh-label {
            color: #9ca3af;
            font-size: 12px !important;
            white-space: nowrap;
        }
        .wd-refresh-button {
            display: grid;
            width: 30px;
            height: 30px;
            place-items: center;
            border-radius: 7px;
            color: #6b7280;
            font-size: 17px;
        }
        .wd-refresh-button:hover { background: #f3f4f6; color: #374151; }
        .wd-refresh-button:disabled { opacity: .5; cursor: wait; }

        .wd-filters-grid {
            display: grid;
            grid-template-columns: minmax(170px, 1.2fr) minmax(125px, .75fr) minmax(125px, .75fr) minmax(330px, 1.55fr);
            gap: 10px;
            padding: 10px 12px;
        }
        .wd-filter-field {
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 4px;
        }
        .wd-filter-field > span,
        .wd-date-field > legend {
            padding: 0;
            color: #6b7280;
            font-size: 12px !important;
            font-weight: 600;
            line-height: 1.2 !important;
        }
        .wd-filter-field select,
        .wd-filter-control,
        .wd-date-controls {
            height: 34px;
            border: 1px solid #dfe3e8;
            border-radius: 7px;
            background: #f9fafb;
        }
        .wd-filter-field select {
            width: 100%;
            padding: 0 9px;
            color: #374151;
            outline: none;
            font-family: inherit;
            font-size: 13px !important;
        }
        .wd-filter-control {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 0 9px;
        }
        .wd-filter-control i { color: #9ca3af; font-size: 15px; }
        .wd-filter-control input {
            width: 100%;
            min-width: 0;
            border: 0;
            outline: none;
            background: transparent;
            color: #374151;
            font-family: inherit;
            font-size: 13px !important;
        }
        .wd-filter-control input::placeholder { color: #9ca3af; font-size: 13px !important; }
        .wd-filter-field select:focus,
        .wd-filter-control:focus-within,
        .wd-date-controls:focus-within {
            border-color: #818cf8;
            background: #fff;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, .12);
        }
        .wd-date-field {
            min-width: 0;
            margin: 0;
            padding: 0;
            border: 0;
        }
        .wd-date-controls {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 5px;
            margin-top: 4px;
            padding: 0 8px;
        }
        .wd-date-controls > i { color: #c3c8d0; font-size: 13px; }
        .wd-date-controls label {
            display: flex;
            min-width: 0;
            align-items: center;
            gap: 5px;
        }
        .wd-date-controls label > span {
            color: #9ca3af;
            font-size: 11px !important;
            white-space: nowrap;
        }
        .wd-date-controls input {
            width: 100%;
            min-width: 100px;
            border: 0;
            outline: none;
            background: transparent;
            color: #374151;
            font-family: inherit;
            font-size: 12px !important;
        }
        .wd-filter-field select:disabled,
        .wd-filter-control:has(input:disabled),
        .wd-date-controls:has(input:disabled) {
            opacity: .55;
            cursor: not-allowed;
        }

        .wd-filters-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 40px;
            padding: 6px 12px;
            border-top: 1px solid #eef0f3;
            background: #fafbfc;
        }
        .wd-filter-toggles { gap: 18px; }
        .wd-toggle {
            display: flex;
            align-items: center;
            gap: 7px;
            color: #4b5563;
            cursor: pointer;
            font-size: 13px !important;
            font-weight: 500;
            white-space: nowrap;
        }
        .wd-toggle input {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
        }
        .wd-toggle-track {
            position: relative;
            width: 30px;
            height: 17px;
            flex-shrink: 0;
            border-radius: 999px;
            background: #d1d5db;
            transition: background .18s ease;
        }
        .wd-toggle-track::after {
            position: absolute;
            top: 2px;
            right: 2px;
            width: 13px;
            height: 13px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 1px 2px rgba(0, 0, 0, .2);
            content: '';
            transition: transform .18s ease;
        }
        .wd-toggle input:checked + .wd-toggle-track { background: #4f46e5; }
        .wd-toggle input:checked + .wd-toggle-track::after { transform: translateX(-13px); }
        .wd-toggle input:focus-visible + .wd-toggle-track { outline: 2px solid #a5b4fc; outline-offset: 2px; }
        .wd-toggle input:disabled ~ * { opacity: .5; cursor: not-allowed; }
        .wd-selected-range {
            gap: 5px;
            color: #6b7280;
            font-size: 12px !important;
            white-space: nowrap;
        }
        .wd-selected-range i { color: #6366f1; font-size: 15px; }
        .wd-selected-range strong { color: #374151; font-size: 12px !important; }

        @media (max-width: 1050px) {
            .wd-filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .wd-filters-footer { align-items: flex-start; gap: 8px; flex-direction: column; }
        }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* Custom scrollbar for inline logs */
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

        /* Print Styles */
        @media print {
            body * { visibility: hidden; }
            #print-area, #print-area * { visibility: visible; }
            #print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }

    /* --------------------------------------------------------------
       הגדלת גופנים: כל טקסט בממשק מתועל לטווח קריא של 16-19px
       (הקלאסים המקוריים של Tailwind היו קטנים מדי - 10px עד 24px).
       משתמשים ב-!important + selector ממוקד לרכיב כדי לגבור בבטחה
       על ה-CSS שמחולל Tailwind Play CDN, ללא תלות בסדר טעינה.
       -------------------------------------------------------------- */
    ${__wdTagName} .text-\[10px\],
    ${__wdTagName} .text-\[11px\],
    ${__wdTagName} .text-xs {
        font-size: 16px !important;
        line-height: 1.45 !important;
    }
    ${__wdTagName} .text-sm {
        font-size: 17px !important;
        line-height: 1.5 !important;
    }
    ${__wdTagName} .text-base {
        font-size: 17px !important;
        line-height: 1.6 !important;
    }
    ${__wdTagName} .text-lg {
        font-size: 18px !important;
        line-height: 1.6 !important;
    }
    ${__wdTagName} .text-xl {
        font-size: 19px !important;
        line-height: 1.6 !important;
    }
    ${__wdTagName} .text-2xl {
        font-size: 19px !important;
        line-height: 1.5 !important;
    }
    /* text-3xl לא נכלל בכוונה - בקובץ המקורי הוא משמש רק לגודל אייקונים (ph ph-...),
       ולא לטקסט קריא, כך שהגדלתו לא רלוונטית לבקשה. */

    /* .compact-input משתמש ב-@apply text-sm, כך ש-Tailwind מטמיע את גודל
       הגופן (14px) ישירות בתוך הכלל של .compact-input עצמו - וה-selector
       ".text-sm" למעלה לא תופס אותו כלל. בלי הכלל המפורש הזה, כל שדות
       הסינון (חיפוש/סוג/מדריך/תאריך) יוצאים קטנים מ-16px. */
    ${__wdTagName} .compact-input,
    ${__wdTagName} select.compact-input option {
        font-size: 16px !important;
    }
    ${__wdTagName} .compact-input::placeholder {
        font-size: 16px !important;
    }

    /* --------------------------------------------------------------
       מסך טעינה - מוצג 3.5 שניות לפני חשיפת הדאשבורד
       -------------------------------------------------------------- */
    ${__wdTagName} {
        position: relative;
    }
    ${__wdTagName} .wd-loading-overlay {
        position: absolute;
        inset: 0;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background-color: #F3F4F6;
        transition: opacity 0.4s ease;
    }
    ${__wdTagName} .wd-spinner {
        width: 48px;
        height: 48px;
        border-radius: 9999px;
        border: 4px solid #E0E7FF;
        border-top-color: #4F46E5;
        animation: wd-spin 0.8s linear infinite;
    }
    ${__wdTagName} .wd-loading-text {
        font-family: 'Heebo', sans-serif;
        font-size: 17px;
        font-weight: 600;
        color: #4F46E5;
    }
    @keyframes wd-spin {
        to { transform: rotate(360deg); }
    }
    ${__wdTagName} .wd-spin {
        display: inline-block;
        animation: wd-spin 0.8s linear infinite;
    }
    /* Overlay used specifically over the workshops table while a filter
       change (date range / include-all-orders) is being applied server-side.
       Unlike .wd-loading-overlay this does not cover the whole dashboard. */
    ${__wdTagName} .wd-table-filter-overlay {
        position: absolute;
        inset: 0;
        z-index: 30;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        background-color: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(1px);
        border-radius: 0.75rem;
    }

    ${__wdTagName} .wd-access-denied-overlay {
        position: absolute;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background-color: #F3F4F6;
    }
    ${__wdTagName} .wd-access-denied-card {
        max-width: 420px;
        text-align: center;
        font-family: 'Heebo', sans-serif;
    }
    ${__wdTagName} .wd-access-denied-icon {
        font-size: 48px;
        color: #DC2626;
        display: block;
        margin-bottom: 12px;
    }
    ${__wdTagName} .wd-access-denied-title {
        font-size: 22px;
        font-weight: 700;
        color: #111827;
        margin: 0 0 8px;
    }
    ${__wdTagName} .wd-access-denied-text {
        font-size: 17px;
        line-height: 1.6;
        color: #4B5563;
        margin: 0;
    }

    /* ================================================================
       תצוגת מובייל (מסכי טלפון קטנים) - max-width: 640px
       הכל בבלוק הזה מכוון אך ורק למובייל: פונטים קומפקטיים, כרטיסים
       במקום טבלאות, ריפוד/מרווחים מוקטנים ופאנלים במסך מלא.
       ================================================================ */
    @media (max-width: 640px) {
        /* --- טיפוגרפיה קומפקטית --- */
        ${__wdTagName} .text-\[10px\],
        ${__wdTagName} .text-\[11px\],
        ${__wdTagName} .text-xs {
            font-size: 11px !important;
            line-height: 1.35 !important;
        }
        ${__wdTagName} .text-sm {
            font-size: 12.5px !important;
            line-height: 1.4 !important;
        }
        ${__wdTagName} .text-base {
            font-size: 13.5px !important;
            line-height: 1.45 !important;
        }
        ${__wdTagName} .text-lg {
            font-size: 14.5px !important;
            line-height: 1.4 !important;
        }
        ${__wdTagName} .text-xl {
            font-size: 15.5px !important;
            line-height: 1.4 !important;
        }
        ${__wdTagName} .text-2xl {
            font-size: 16.5px !important;
            line-height: 1.35 !important;
        }
        ${__wdTagName} .compact-input,
        ${__wdTagName} select.compact-input option {
            font-size: 13px !important;
            padding-top: 5px !important;
            padding-bottom: 5px !important;
        }
        ${__wdTagName} .compact-input::placeholder {
            font-size: 13px !important;
        }
        ${__wdTagName} .wd-filters-title h2 { font-size: 13px !important; }
        ${__wdTagName} .wd-filters-title p { font-size: 10.5px !important; }
        ${__wdTagName} .wd-filter-field > span,
        ${__wdTagName} .wd-date-field > legend { font-size: 10.5px !important; }
        ${__wdTagName} .wd-filter-field select,
        ${__wdTagName} .wd-filter-control input { font-size: 12px !important; }
        ${__wdTagName} .wd-date-controls input { font-size: 11px !important; }
        ${__wdTagName} .wd-toggle { font-size: 11px !important; }
        ${__wdTagName} .wd-selected-range,
        ${__wdTagName} .wd-selected-range strong { font-size: 10.5px !important; }
        ${__wdTagName} .wd-clear-filters { font-size: 11px !important; }
        ${__wdTagName} .wd-refresh-label { font-size: 10.5px !important; }

        /* --- Header --- */
        ${__wdTagName} .wd-header {
            padding: 8px 10px !important;
            gap: 6px !important;
        }
        ${__wdTagName} .wd-header-logo {
            padding: 6px !important;
        }
        ${__wdTagName} .wd-header-logo i { font-size: 15px !important; }
        ${__wdTagName} .wd-header-title { font-size: 14px !important; }
        ${__wdTagName} .wd-header-tabs { margin-right: 6px !important; }
        ${__wdTagName} .wd-header-tabs button {
            padding: 5px 8px !important;
            font-size: 11px !important;
        }
        ${__wdTagName} #templatesManagerBtn {
            padding: 6px 8px !important;
            gap: 0 !important;
        }
        ${__wdTagName} .wd-header-btn-text,
        ${__wdTagName} .wd-header-divider,
        ${__wdTagName} .wd-header-user-text {
            display: none !important;
        }
        ${__wdTagName} header .flex.items-center.gap-4 { gap: 8px !important; }

        /* --- Filters panel: single column + collapsible body --- */
        ${__wdTagName} .wd-filters-panel { margin-bottom: 10px !important; }
        ${__wdTagName} .wd-filters-header { padding: 6px 10px !important; min-height: 40px !important; }
        ${__wdTagName} .wd-filters-icon { width: 24px !important; height: 24px !important; font-size: 13px !important; }
        ${__wdTagName} .wd-filters-actions { gap: 4px !important; }
        ${__wdTagName} .wd-refresh-label { display: none !important; }
        ${__wdTagName} .wd-refresh-button { width: 26px !important; height: 26px !important; font-size: 14px !important; }
        ${__wdTagName} .wd-filters-toggle-button {
            display: grid !important;
            width: 26px;
            height: 26px;
            place-items: center;
            border: 0;
            border-radius: 7px;
            background: #eef2ff;
            color: #4f46e5;
            font-size: 14px;
            cursor: pointer;
        }
        ${__wdTagName} .wd-filters-body { display: none; }
        ${__wdTagName} .wd-filters-body.wd-filters-open { display: block; }
        ${__wdTagName} .wd-filters-grid {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            padding: 8px 10px !important;
        }
        ${__wdTagName} .wd-date-controls { grid-template-columns: 1fr auto 1fr !important; }
        ${__wdTagName} .wd-filters-footer {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 6px !important;
            padding: 8px 10px !important;
        }
        ${__wdTagName} .wd-filter-toggles { gap: 10px !important; flex-wrap: wrap; }

        /* --- Main layout / alerts --- */
        ${__wdTagName} #wdOrdersMain,
        ${__wdTagName} #wdStaffAdminSection {
            padding: 8px !important;
        }
        ${__wdTagName} #alertsContainer { margin-bottom: 8px !important; }
        ${__wdTagName} #alertsContainer > div {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
            padding: 8px !important;
        }
        ${__wdTagName} #alertFilterBtn { align-self: flex-end; }

        /* --- Workshops table: horizontal scroll (preserve table layout) --- */
        ${__wdTagName} .wd-ws-table-wrap {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
        }
        ${__wdTagName} .wd-ws-table {
            min-width: 620px;
        }
        ${__wdTagName} .wd-ws-table th,
        ${__wdTagName} .wd-ws-table td {
            padding: 8px 10px !important;
        }

        /* --- Pagination --- */
        ${__wdTagName} #workshopsPagination {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 6px !important;
        }
        ${__wdTagName} #workshopsPagination > div {
            justify-content: space-between !important;
        }

        /* --- Side panel: full-screen sheet + card-style orders --- */
        ${__wdTagName} .wd-side-panel {
            width: 100vw !important;
        }
        ${__wdTagName} .wd-sp-header {
            padding: 12px 14px !important;
            align-items: center !important;
        }
        ${__wdTagName} .wd-sp-header h2 { font-size: 15px !important; }
        ${__wdTagName} .wd-sp-meta {
            gap: 8px !important;
            flex-wrap: wrap;
        }

        /* Side panel orders: keep table layout + horizontal scroll; detail rows stay collapsed until click */
        ${__wdTagName} .wd-sp-body {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
        }
        ${__wdTagName} .wd-orders-table {
            min-width: 560px;
        }
        ${__wdTagName} .wd-orders-table th,
        ${__wdTagName} .wd-orders-table td {
            padding: 8px 10px !important;
        }
        ${__wdTagName} .wd-orders-table tr.hidden {
            display: none !important;
        }

        /* Expanded order detail content reuses px-8/px-6 etc. Tailwind utilities
           extensively; scoping the override to the side panel keeps every other
           screen's padding untouched. */
        ${__wdTagName} .wd-side-panel .px-8 { padding-left: 12px !important; padding-right: 12px !important; }
        ${__wdTagName} .wd-side-panel .px-6 { padding-left: 10px !important; padding-right: 10px !important; }
        ${__wdTagName} .wd-side-panel .w-\[240px\] { width: 168px !important; }

        /* --- Modals --- */
        ${__wdTagName} .modal { padding: 8px !important; }
        ${__wdTagName} .modal-content {
            width: 100% !important;
            max-width: 100% !important;
            max-height: 92dvh !important;
            overflow-y: auto !important;
        }
        ${__wdTagName} .modal-content [class*="p-6"] { padding: 14px !important; }
        ${__wdTagName} .modal-content [class*="p-5"] { padding: 12px !important; }
        ${__wdTagName} .modal-content [class*="px-6"] { padding-left: 14px !important; padding-right: 14px !important; }
        ${__wdTagName} .modal-content [class*="px-5"] { padding-left: 12px !important; padding-right: 12px !important; }
        ${__wdTagName} .modal-content [class*="py-4"] { padding-top: 10px !important; padding-bottom: 10px !important; }
        ${__wdTagName} .modal-content [class*="py-3"] { padding-top: 8px !important; padding-bottom: 8px !important; }

        /* --- Staff & shifts tab --- */
        ${__wdTagName} .wd-staff-section { padding: 8px !important; }
        ${__wdTagName} .wd-staff-toolbar {
            flex-wrap: wrap !important;
            gap: 8px !important;
        }
        ${__wdTagName} .wd-staff-view-tabs button {
            padding: 4px 6px !important;
            font-size: 10.5px !important;
        }
        ${__wdTagName} #saMonthPicker { max-width: 128px !important; }
    }

    /* Toggle button only exists for mobile; hide it above the breakpoint. */
    ${__wdTagName} .wd-filters-toggle-button { display: none; }
`;

// ============================================================
// ===================  הגדרות טיילווינד (Tailwind)  ===================
// ============================================================
var __wdTailwindConfig = {
    theme: {
        extend: {
            fontFamily: {
                sans: ['Heebo', 'sans-serif'],
            },
            colors: {
                primary: '#4F46E5',
                'primary-hover': '#4338CA',
                tufting: '#FDF4FF',
                'tufting-text': '#A21CAF',
                ceramics: '#F0FDF4',
                'ceramics-text': '#15803D',
                candles: '#FFFBEB',
                'candles-text': '#B45309',
            }
        }
    }
};

function __wdApplyTailwindConfig() {
    if (window.tailwind) {
        window.tailwind.config = __wdTailwindConfig;
    }
}

// ============================================================
// ===========  הזרקת נכסים גלובליים (פונטים/CSS/סקריפטים)  ===========
// (רק פעם אחת לעמוד, גם אם יש כמה מופעים של הרכיב)
// ============================================================
function __wdInjectGlobalAssets() {
    if (!document.getElementById('wd-heebo-font')) {
        var fontLink = document.createElement('link');
        fontLink.id = 'wd-heebo-font';
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap';
        document.head.appendChild(fontLink);
    }

    if (!document.getElementById('wd-dashboard-style')) {
        var styleTag = document.createElement('style');
        styleTag.id = 'wd-dashboard-style';
        styleTag.textContent = __wdCustomCss;
        document.head.appendChild(styleTag);
    }

    if (!document.getElementById('wd-phosphor-icons')) {
        var iconScript = document.createElement('script');
        iconScript.id = 'wd-phosphor-icons';
        iconScript.src = 'https://unpkg.com/@phosphor-icons/web';
        document.head.appendChild(iconScript);
    }

    if (window.tailwind) {
        __wdApplyTailwindConfig();
    } else if (!document.getElementById('wd-tailwind-cdn')) {
        var twScript = document.createElement('script');
        twScript.id = 'wd-tailwind-cdn';
        twScript.src = 'https://cdn.tailwindcss.com';
        twScript.onload = __wdApplyTailwindConfig;
        document.head.appendChild(twScript);
    }
}

// ============================================================
// ===================  לוגיקת הדאשבורד המקורית  ===================
// (זהה במהותה לקובץ ה-HTML המקורי - כל הפונקציות/משתנים נשארים
//  ברמת ה-scope העליון. בסוף הקובץ הן מוצמדות במפורש ל-window
//  כדי לעבוד גם כאשר הקובץ נטען כ-ES module)
// ============================================================

        // --- LIVE DATA STATE ---
        // Populated by applyDashboardData() from the `dashboard-data` attribute
        // (see dashboardService.web.js getInitialDashboardData for the shape).

        let workshopTypes = {};
        let waTemplates = [];
        let mockWorkshops = [];
        let mockOrders = [];
        let currentDashboardUser = null;
        let __wdDataLoaded = false;
        let __wdAccessDenied = false;
        let __wdLastDataJson = null;

        /**
         * Permissions arrive from the backend as a normalized boolean map built
         * from the Dashboard_Roles CMS boolean fields (with legacy JSON fallback).
         * Missing keys fall back to PERMISSION_DEFAULTS — mirrors dashboardService.web.js.
         */
        const PERMISSION_DEFAULTS = {
            viewDashboard: true,
            manageRoles: true,
            deleteSketchImage: true,
            editSketchStatus: true,
            editOrderNotes: true,
            sendWhatsApp: true,
            manageTemplates: true,
            rejectSketchStatus: true,
        };

        function hasDashboardPermission(key) {
            const perms = currentDashboardUser && currentDashboardUser.permissions;
            const value = perms && typeof perms === 'object' ? perms[key] : undefined;
            if (value === undefined || value === null) return PERMISSION_DEFAULTS[key] !== false;
            return !!value;
        }

        /** Focused debug logs for staff-tab permission issues — filter console by "[staff-admin]". */
        window.__wdStaffDebug = function (label, payload) {
            console.log(`[staff-admin] ${label}`, payload);
        };
        const __wdStaffDebug = window.__wdStaffDebug;

        // Default view shows only orders saved via the new flow (WorkshopOrders
        // CMS). Orders flagged `isLegacyOrder` (real Wix Bookings with no CMS
        // record) are hidden unless the user opts in via showAllOrdersToggle.
        let showAllOrders = false;

        // Currently active server-side date range filter (Date objects).
        // Defaults to "today → +30 days", matching the backend's own default
        // when no explicit range is supplied, and is re-sent with every
        // subsequent refresh so it "sticks" across toggles/mutations too.
        let __wdDateRangeStart = null;
        let __wdDateRangeEnd = null;
        // Callbacks queued to run the next time a refresh finishes (used to
        // clear the table's filter-loading overlay regardless of which code
        // path ultimately calls setDataRefreshLoading(false)).
        let __wdRefreshDoneCallbacks = [];

        // Cancelled orders (booking cancelled via Wix Bookings — see
        // events.js wixBookingsV2_onBookingCanceled) are hidden by default,
        // shown greyed-out with a "בוטל" badge when this toggle is on.
        let showCancelledOrders = false;

        let currentWorkshopId = null;
        let currentOrderId = null;
        let currentSketchId = null;
        let isAlertFilterActive = false;

        const __wdPageSize = 15;
        let __wdCurrentPage = 1;

        const __wdAutoRefreshMs = 5 * 60 * 1000;
        let __wdAutoRefreshTimerId = null;
        let __wdLastDataRefreshAt = null;
        let __wdPreserveUiOnNextApply = false;
        let __wdIsDataRefreshing = false;
        let __wdRefreshSafetyTimerId = null;
        let __wdDownloadRequestSeq = 0;
        const __wdPendingSketchDownloads = new Map();
        
        // Variables for unapproved flow
        let unapprovedOrderId = null;
        let unapprovedSketchId = null;

        // --- CORE LOGIC ---

        function init() {
            initDateRangeFilter();
            applyFilters();
            renderTemplatesManager();
            renderLastDataRefreshLabel();
            startAutoDataRefresh();
        }

        // Host element reference, set in connectedCallback, used to dispatch
        // dashboard-action CustomEvents up to the Velo page code.
        let __wdHostElement = null;

        function dispatchDashboardAction(type, payload) {
            if (!__wdHostElement) return;
            console.log(`[workshops-dashboard] Dispatching action "${type}":`, payload);
            __wdHostElement.dispatchEvent(new CustomEvent('dashboard-action', {
                detail: { type, payload },
                bubbles: true,
                composed: true,
            }));
        }

        function formatLastDataRefreshLabel(date) {
            if (!date) return 'עודכן לאחרונה: —';
            const d = date instanceof Date ? date : new Date(date);
            if (Number.isNaN(d.getTime())) return 'עודכן לאחרונה: —';
            const pad = (n) => String(n).padStart(2, '0');
            return `עודכן לאחרונה: ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }

        function renderLastDataRefreshLabel() {
            const el = document.getElementById('lastDataRefreshLabel');
            if (el) el.textContent = formatLastDataRefreshLabel(__wdLastDataRefreshAt);
        }

        function setDataRefreshLoading(isLoading) {
            __wdIsDataRefreshing = isLoading;
            const btn = document.getElementById('refreshDataBtn');
            const icon = document.getElementById('refreshDataIcon');
            const label = document.getElementById('lastDataRefreshLabel');
            if (btn) btn.disabled = isLoading;
            if (icon) icon.classList.toggle('wd-spin', isLoading);
            if (label && isLoading) label.textContent = 'מתעדכן...';
            if (label && !isLoading) renderLastDataRefreshLabel();

            // Notify anyone waiting for this refresh cycle to finish
            // (e.g. the table filter-loading overlay), regardless of which
            // code path ultimately flips isLoading back to false.
            if (!isLoading && __wdRefreshDoneCallbacks.length) {
                const callbacks = __wdRefreshDoneCallbacks.splice(0);
                callbacks.forEach((cb) => {
                    try { cb(); } catch (e) { console.error('[workshops-dashboard] refresh-done callback failed:', e); }
                });
            }
        }

        /**
         * Toggles the "מסנן נתונים..." overlay over the workshops table and
         * disables every filter control, so the user can't stack another
         * filter change on top of one that's still being fetched from the
         * server (date range / include-all-orders toggle).
         */
        function setFilterBusy(isBusy) {
            const overlay = __wdHostElement && __wdHostElement.querySelector('#tableFilterOverlay');
            if (overlay) overlay.style.display = isBusy ? 'flex' : 'none';

            ['searchInput', 'typeFilter', 'instructorFilter', 'dateRangeFromFilter', 'dateRangeToFilter',
                'missingSketchesFilter', 'showAllOrdersToggle', 'showCancelledOrdersFilter', 'clearFiltersBtn']
                .forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = isBusy;
                });
        }

        /** Triggers a server refresh while showing the table's filter-loading overlay until it resolves. */
        function triggerFilterRefresh(options) {
            if (__wdIsDataRefreshing) return;
            setFilterBusy(true);
            __wdRefreshDoneCallbacks.push(() => setFilterBusy(false));
            refreshDashboard(options);
        }

        function pad2(n) { return String(n).padStart(2, '0'); }

        /** 'YYYY-MM-DD' for <input type="date">, in local time (not UTC). */
        function formatDateForInput(date) {
            return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
        }

        /** 'DD/MM/YYYY' for display. */
        function formatDateForDisplay(date) {
            return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
        }

        function getMidnight(date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            return d;
        }

        /** Mirrors the backend's own default when no explicit range is supplied: today → +30 days. */
        function getDefaultDateRange() {
            const start = getMidnight(new Date());
            const end = getMidnight(new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000));
            return { start, end };
        }

        function isDefaultDateRange() {
            const def = getDefaultDateRange();
            return __wdDateRangeStart && __wdDateRangeEnd
                && __wdDateRangeStart.getTime() === def.start.getTime()
                && __wdDateRangeEnd.getTime() === def.end.getTime();
        }

        function renderDateRangeLabel() {
            const label = document.getElementById('dateRangeLabel');
            if (!label || !__wdDateRangeStart || !__wdDateRangeEnd) return;
            label.textContent = `${formatDateForDisplay(__wdDateRangeStart)} - ${formatDateForDisplay(__wdDateRangeEnd)}`;
        }

        /** Called once on init — sets the default range into state, inputs and label. */
        function initDateRangeFilter() {
            const def = getDefaultDateRange();
            __wdDateRangeStart = def.start;
            __wdDateRangeEnd = def.end;
            const fromInput = document.getElementById('dateRangeFromFilter');
            const toInput = document.getElementById('dateRangeToFilter');
            if (fromInput) fromInput.value = formatDateForInput(def.start);
            if (toInput) toInput.value = formatDateForInput(def.end);
            renderDateRangeLabel();
        }

        /** Wired to both date-range inputs' onchange — validates then triggers a server-side refresh. */
        function onDateRangeFilterChange() {
            const fromInput = document.getElementById('dateRangeFromFilter');
            const toInput = document.getElementById('dateRangeToFilter');
            if (!fromInput || !toInput || !fromInput.value || !toInput.value) return;

            const start = getMidnight(new Date(fromInput.value));
            const end = getMidnight(new Date(toInput.value));
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

            if (start.getTime() > end.getTime()) {
                alert('תאריך ההתחלה חייב להיות לפני תאריך הסיום');
                fromInput.value = formatDateForInput(__wdDateRangeStart);
                toInput.value = formatDateForInput(__wdDateRangeEnd);
                return;
            }

            __wdDateRangeStart = start;
            __wdDateRangeEnd = end;
            renderDateRangeLabel();
            __wdCurrentPage = 1;
            triggerFilterRefresh();
        }

        function clearRefreshSafetyTimer() {
            if (__wdRefreshSafetyTimerId != null) {
                clearTimeout(__wdRefreshSafetyTimerId);
                __wdRefreshSafetyTimerId = null;
            }
        }

        function startAutoDataRefresh() {
            stopAutoDataRefresh();
            __wdAutoRefreshTimerId = setInterval(() => {
                refreshDashboard({ silent: true });
            }, __wdAutoRefreshMs);
        }

        function stopAutoDataRefresh() {
            if (__wdAutoRefreshTimerId != null) {
                clearInterval(__wdAutoRefreshTimerId);
                __wdAutoRefreshTimerId = null;
            }
        }

        function refreshDashboard(options) {
            const silent = options && options.silent === true;
            if (__wdIsDataRefreshing) return;

            __wdPreserveUiOnNextApply = true;
            setDataRefreshLoading(true);
            clearRefreshSafetyTimer();
            __wdRefreshSafetyTimerId = setTimeout(() => {
                __wdRefreshSafetyTimerId = null;
                if (__wdIsDataRefreshing) setDataRefreshLoading(false);
            }, 60000);

            dispatchDashboardAction('refresh', {
                includeAllOrders: showAllOrders,
                dateRangeStart: __wdDateRangeStart ? __wdDateRangeStart.toISOString() : null,
                dateRangeEnd: __wdDateRangeEnd ? __wdDateRangeEnd.toISOString() : null,
                silent,
            });
        }

        /**
         * Orders eligible for display. The backend itself only returns legacy
         * (non-CMS) orders when `includeAllOrders` was requested, so this is
         * mostly a safety net — it filters them out client-side too, in case
         * showAllOrders is toggled off again before a fresh refresh completes.
         */
        function getVisibleOrders() {
            return showAllOrders ? mockOrders : mockOrders.filter(o => !o.isLegacyOrder);
        }

        /**
         * Wired to showAllOrdersToggle onchange. Both directions require a backend
         * refresh so the workshops table is rebuilt from the correct dataset
         * (CMS-only vs CMS + legacy Wix Bookings).
         */
        function onShowAllOrdersChange() {
            const checkbox = document.getElementById('showAllOrdersToggle');
            showAllOrders = checkbox.checked;
            triggerFilterRefresh();
        }

        /**
         * Called by the custom element when the `dashboard-data` attribute changes
         * (i.e. whenever the page code pushes fresh data after load or after a
         * mutation). Replaces local state and re-renders.
         */
        function applyDashboardData(data, options) {
            if (!data) return;
            const isLightRefresh = !!(options && options.isLightRefresh);

            if (data.error === 'ACCESS_DENIED') {
                console.warn('[workshops-dashboard] ACCESS_DENIED — showing access denied screen.');
                __wdAccessDenied = true;
                __wdShowAccessDenied();
                clearRefreshSafetyTimer();
                setDataRefreshLoading(false);
                return;
            }

            const showAllOrdersCheckbox = document.getElementById('showAllOrdersToggle');
            if (showAllOrdersCheckbox) {
                showAllOrdersCheckbox.disabled = false;
                if (typeof data.includeAllOrders === 'boolean') {
                    showAllOrders = data.includeAllOrders;
                    showAllOrdersCheckbox.checked = showAllOrders;
                }
            }

            if (!isLightRefresh) {
                console.log('[workshops-dashboard] Received dashboard data:', {
                    workshopTypesCount: Object.keys(data.workshopTypes || {}).length,
                    workshopsCount: (data.workshops || []).length,
                    ordersCount: (data.orders || []).length,
                    templatesCount: (data.templates || []).length,
                    alertsSummary: data.alertsSummary,
                    currentUser: data.currentUser,
                });
                console.warn('👥 [workshops-dashboard] All customer orders:', data.orders || []);
            }

            if (data.workshopTypes) workshopTypes = data.workshopTypes;
            if (data.workshops) mockWorkshops = data.workshops;
            if (data.orders) mockOrders = data.orders;
            if (data.templates) waTemplates = data.templates;
            if (data.currentUser) currentDashboardUser = data.currentUser;
            if (!isLightRefresh) {
                if (data.currentUser) {
                    const p = data.currentUser.permissions || {};
                    __wdStaffDebug('currentUser loaded', {
                        name: data.currentUser.name,
                        role: data.currentUser.role,
                        viewDashboard: p.viewDashboard,
                        manageEmployees: p.manageEmployees,
                        manageScheduling: p.manageScheduling,
                        viewTeamSchedule: p.viewTeamSchedule,
                    });
                } else {
                    __wdStaffDebug('currentUser missing', {
                        hint: 'Dashboard_Roles row not matched — check userEmail/userId + connectedStaff',
                    });
                }
            }
            __wdDataLoaded = true;
            const preserveUi = __wdPreserveUiOnNextApply;
            __wdPreserveUiOnNextApply = false;
            if (!preserveUi) {
                __wdCurrentPage = 1;
            }

            // Guard against attributeChangedCallback firing before connectedCallback
            // has injected the template into the DOM (order isn't spec-guaranteed).
            if (!document.getElementById('searchInput')) return;

            if (isLightRefresh || preserveUi) {
                applyFilters();
            } else {
                renderCurrentUser();
                populateFilterOptions();
                applyFilters();
                renderTemplatesManager();
            }
            __wdHideLoadingOverlay();

            // Refreshing data (e.g. after toggling "show all orders") should also
            // update the side panel if it's currently open on a workshop.
            if (currentWorkshopId && !document.getElementById('sidePanel').classList.contains('-translate-x-full')) {
                const expandedOrderIds = (isLightRefresh || preserveUi) ? getExpandedOrderIdsInSidePanel() : [];
                const w = mockWorkshops.find(x => x.id === currentWorkshopId);
                if (w) {
                    const displayCapacity = showAllOrders ? w.currentCapacity : (typeof w.cmsCapacity === 'number' ? w.cmsCapacity : w.currentCapacity);
                    document.getElementById('spCapacity').innerText = `${displayCapacity}/${w.maxCapacity} משתתפים`;
                    renderOrdersTable(w.id, workshopTypes[w.type].requiresSketch);
                    restoreExpandedOrderIds(expandedOrderIds);
                } else {
                    closeSidePanel();
                    currentWorkshopId = null;
                }
            }

            __wdLastDataRefreshAt = new Date();
            renderLastDataRefreshLabel();
            clearRefreshSafetyTimer();
            setDataRefreshLoading(false);
        }

        function getExpandedOrderIdsInSidePanel() {
            const ids = [];
            document.querySelectorAll('[id^="detail-"]').forEach((el) => {
                if (!el.classList.contains('hidden')) {
                    ids.push(el.id.replace('detail-', ''));
                }
            });
            return ids;
        }

        function restoreExpandedOrderIds(orderIds) {
            for (const orderId of orderIds) {
                const row = document.getElementById(`detail-${orderId}`);
                const icon = document.getElementById(`icon-${orderId}`);
                if (row) row.classList.remove('hidden');
                if (icon) icon.classList.add('-rotate-90');
            }
        }

        /** Rebuilds the type/instructor filter dropdowns from the live dataset, preserving the current selection when still valid. */
        function populateFilterOptions() {
            const typeSelect = document.getElementById('typeFilter');
            const instructorSelect = document.getElementById('instructorFilter');
            if (!typeSelect || !instructorSelect) return;

            const prevType = typeSelect.value;
            const prevInstructor = instructorSelect.value;

            const typeOptions = Object.values(workshopTypes)
                .map(t => `<option value="${t.id}">${t.title}</option>`)
                .join('');
            typeSelect.innerHTML = `<option value="">כל הסוגים</option>${typeOptions}`;

            const instructorNames = Array.from(new Set(
                mockWorkshops.flatMap(w => w.instructors || [])
            )).sort((a, b) => a.localeCompare(b, 'he'));
            const instructorOptions = instructorNames.map(name => `<option value="${name}">${name}</option>`).join('');
            instructorSelect.innerHTML = `<option value="">כל המדריכים</option>${instructorOptions}`;

            if (Array.from(typeSelect.options).some(o => o.value === prevType)) typeSelect.value = prevType;
            if (Array.from(instructorSelect.options).some(o => o.value === prevInstructor)) instructorSelect.value = prevInstructor;
        }

        /** Renders the logged-in dashboard user's name/role in the header, from Dashboard_Roles. */
        function renderCurrentUser() {
            const nameEl = document.getElementById('headerUserName');
            const roleEl = document.getElementById('headerUserRole');
            const initialsEl = document.getElementById('headerUserInitials');
            if (!nameEl || !roleEl || !initialsEl) return;

            const user = currentDashboardUser;
            const name = (user && user.name) ? user.name : 'משתמש/ת';
            const role = (user && user.role) ? user.role : '';

            nameEl.innerText = name;
            roleEl.innerText = role;
            initialsEl.innerText = name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';

            applyPermissionGatingToStaticUi();
        }

        /** Shows/hides static (non-per-row) UI controls per the current user's permissions. */
        function applyPermissionGatingToStaticUi() {
            const templatesBtn = document.getElementById('templatesManagerBtn');
            if (templatesBtn) templatesBtn.classList.toggle('hidden', !hasDashboardPermission('manageTemplates'));

            const staffTabBtn = document.getElementById('wdTabStaffBtn');
            if (!staffTabBtn) {
                __wdStaffDebug('wdTabStaffBtn missing — CE file may not be updated on Wix', null);
                return;
            }
            const canSeeStaffTab = hasDashboardPermission('manageEmployees');
            staffTabBtn.classList.toggle('hidden', !canSeeStaffTab);
            __wdStaffDebug('staff tab visibility', {
                visible: canSeeStaffTab,
                manageEmployees: currentDashboardUser?.permissions?.manageEmployees,
                hint: canSeeStaffTab ? 'ok' : 'set manageEmployees=true on your Dashboard_Roles row',
            });
        }


        function __wdHideLoadingOverlay() {
            if (!__wdHostElement) return;
            const overlay = __wdHostElement.querySelector('#wdLoadingOverlay');
            if (overlay && !overlay.classList.contains('wd-hiding')) {
                overlay.classList.add('wd-hiding');
                overlay.style.opacity = '0';
                setTimeout(function () {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 400);
            }
        }

        function __wdShowAccessDenied() {
            if (!__wdHostElement) return;
            __wdHideLoadingOverlay();
            if (__wdHostElement.querySelector('#wdAccessDeniedOverlay')) return;
            __wdHostElement.insertAdjacentHTML('afterbegin', __wdAccessDeniedHtml);
        }

        /**
         * workshops.colorTag is a HEX color field (e.g. "#4F46E5"). Badges use a
         * tinted background (low-opacity version of the hex) with the solid hex
         * as the text color, replacing the old Tailwind bg-color / text-color pairs.
         */
        function colorHexToBadgeStyle(hex) {
            const safeHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex || '') ? hex : '#6B7280';
            let r, g, b;
            if (safeHex.length === 4) {
                r = parseInt(safeHex[1] + safeHex[1], 16);
                g = parseInt(safeHex[2] + safeHex[2], 16);
                b = parseInt(safeHex[3] + safeHex[3], 16);
            } else {
                r = parseInt(safeHex.slice(1, 3), 16);
                g = parseInt(safeHex.slice(3, 5), 16);
                b = parseInt(safeHex.slice(5, 7), 16);
            }
            return `background-color: rgba(${r}, ${g}, ${b}, 0.14); color: ${safeHex};`;
        }

        function buildSketchAlertBadge(kind, isUrgent, isCups) {
            if (kind === 'missing') {
                const label = isCups ? 'כוסות חסרות!' : 'סקיצות חסרות!';
                return `<div class="inline-flex items-center gap-1.5 bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-bold border ${isUrgent ? 'border-red-400' : 'border-red-100'}">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    ${label}
                </div>`;
            }
            return `<div class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs font-bold border ${isUrgent ? 'border-amber-400' : 'border-amber-200'}">
                <span class="relative flex h-2 w-2">
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                </span>
                סקיצות לא מוכנות
            </div>`;
        }

        /**
         * Re-derives workshop alert flags client-side (CMS-only vs CMS+legacy).
         * `hasAlert` = missing selections; `hasNotReadyAlert` = not all מוכנה.
         */
        function checkAlerts() {
            let alertCount = 0;
            mockWorkshops.forEach(w => {
                const typeInfo = workshopTypes[w.type];
                w.hasAlert = false;
                w.hasNotReadyAlert = false;
                w.isUrgent = false;
                w.isCupsWorkshop = isCandlesWorkshop(w.id);
                const tracksSketches = !w.isCupsWorkshop && !!typeInfo?.requiresSketch;
                if (!tracksSketches && !w.isCupsWorkshop) return;

                const hoursToStart = (typeof w.startTimestamp === 'number')
                    ? (w.startTimestamp - Date.now()) / (60 * 60 * 1000)
                    : null;
                if (hoursToStart === null || hoursToStart < 0 || hoursToStart > 6 * 24) return;

                const { selected, ready, total } = calcWorkshopSketchProgress(w.id);
                if (total > 0 && selected < total) w.hasAlert = true;
                // "לא מוכנות" applies to sketches only — cups have no readiness state.
                if (tracksSketches && total > 0 && ready < total) w.hasNotReadyAlert = true;
                if (w.hasAlert || w.hasNotReadyAlert) {
                    w.isUrgent = hoursToStart <= 48;
                    alertCount++;
                }
            });

            const alertsContainer = document.getElementById('alertsContainer');
            if (alertCount > 0) {
                document.getElementById('alertText').innerText = `שימו לב! ישנן ${alertCount} סדנאות ב-6 הימים הקרובים עם סקיצות/כוסות חסרות או לא מוכנות.`;
                alertsContainer.classList.remove('hidden');
            } else {
                alertsContainer.classList.add('hidden');
            }
        }

        // --- FILTERS & MAIN TABLE RENDERING ---

        function toggleAlertFilter() {
            __wdCurrentPage = 1;
            isAlertFilterActive = !isAlertFilterActive;
            const btn = document.getElementById('alertFilterBtn');
            if(isAlertFilterActive) {
                btn.innerText = "בטל סינון";
                btn.classList.replace('bg-red-100', 'bg-red-600');
                btn.classList.replace('text-red-700', 'text-white');
            } else {
                btn.innerText = "סנן תצוגה";
                btn.classList.replace('bg-red-600', 'bg-red-100');
                btn.classList.replace('text-white', 'text-red-700');
            }
            applyFilters();
        }

        /** Wired to filter control onchange/onkeyup — a real filter change always jumps back to page 1. */
        function onFilterInputChange() {
            __wdCurrentPage = 1;
            applyFilters();
        }

        /**
         * Authoritative per-order sketch counts.
         * `rugCount` = how many rugs the group ordered; `sketches.length` may be
         * lower when not every slot has a selection yet — always use max().
         */
        function getOrderSketchTotals(order) {
            const sketches = order.sketches || [];
            const total = Math.max(sketches.length, order.rugCount || 0);
            const ready = sketches.filter(s => s.status === 'מוכנה').length;
            const selected = sketches.filter(s => !!s.img).length;
            return {
                total,
                ready,
                selected,
                missing: Math.max(0, total - selected),
                hasMissing: total > 0 && selected < total,
                hasNotReady: total > 0 && ready < total,
            };
        }

        function isCandlesOrder(order) {
            return order?.workshopType === 'candles';
        }

        /** True when the workshop's orders are candles ("סדנת נרות") orders — cups tracking, no sketches. */
        function isCandlesWorkshop(workshopId) {
            const orders = getVisibleOrders().filter(o => o.workshopId === workshopId && !o.isLegacyOrder);
            return orders.length > 0 && orders.every(isCandlesOrder);
        }

        function getOrderCupTotals(order) {
            const selected = (order.selectedProducts || []).reduce(
                (sum, cup) => sum + (Number(cup.quantity) || 1),
                0,
            );
            const total = order.rugCount || 0;
            return {
                total,
                ready: selected,
                selected,
                missing: Math.max(0, total - selected),
                hasMissing: total > 0 && selected < total,
                hasNotReady: false,
            };
        }

        function expandCupSelections(order) {
            const items = [];
            for (const cup of (order.selectedProducts || [])) {
                const qty = Math.max(1, Number(cup.quantity) || 1);
                for (let i = 0; i < qty; i++) {
                    items.push({
                        img: cup.image || null,
                        productId: cup.productId,
                        index: items.length,
                    });
                }
            }
            return items;
        }

        function buildCupProgressBarHtml(selected, total, opts) {
            const options = opts || {};
            const barHeight = options.barHeight || 'h-2';
            const innerBarHeight = options.innerBarHeight || barHeight;
            const widthClass = options.widthClass || 'w-full max-w-[140px]';
            const ratio = total > 0 ? (selected / total) * 100 : 0;
            const color = ratio === 100 ? 'bg-green-500' : (ratio > 0 ? 'bg-amber-400' : 'bg-red-500');

            return `
                <div class="flex flex-col gap-1 ${widthClass} mx-auto">
                    <div class="flex justify-between text-[11px] font-semibold text-gray-600">
                        <span>${selected}/${total} כוסות</span>
                        <span>${Math.round(ratio)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full ${barHeight}">
                        <div class="${color} ${innerBarHeight} rounded-full transition-all duration-500" style="width: ${ratio}%"></div>
                    </div>
                </div>
            `;
        }

        /** Label for ready progress bar — singular when only one rug in scope. */
        function getReadyProgressLabel(total) {
            return total === 1 ? 'מוכנה' : 'מוכנות';
        }

        /** Dual progress bars: נבחרו (has image) + מוכנה/מוכנות (ready status). */
        function buildSketchProgressBarsHtml(selected, ready, total, opts) {
            const options = opts || {};
            const barHeight = options.barHeight || 'h-2';
            const innerBarHeight = options.innerBarHeight || barHeight;
            const widthClass = options.widthClass || 'w-full max-w-[140px]';
            const gapClass = options.gapClass || 'gap-2';
            const readyLabel = getReadyProgressLabel(total);

            const selectedRatio = total > 0 ? (selected / total) * 100 : 0;
            const readyRatio = total > 0 ? (ready / total) * 100 : 0;
            const selectedColor = selectedRatio === 100 ? 'bg-green-500' : (selectedRatio > 0 ? 'bg-amber-400' : 'bg-red-500');
            const readyColor = readyRatio === 100 ? 'bg-green-500' : (readyRatio > 0 ? 'bg-indigo-400' : 'bg-gray-300');

            return `
                <div class="flex flex-col ${gapClass} ${widthClass} mx-auto">
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-[11px] font-semibold text-gray-600">
                            <span>${selected}/${total} נבחרו</span>
                            <span>${Math.round(selectedRatio)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full ${barHeight}">
                            <div class="${selectedColor} ${innerBarHeight} rounded-full transition-all duration-500" style="width: ${selectedRatio}%"></div>
                        </div>
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-[10px] font-semibold text-gray-600">
                            <span>${ready}/${total} ${readyLabel}</span>
                            <span>${Math.round(readyRatio)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full ${barHeight}">
                            <div class="${readyColor} ${innerBarHeight} rounded-full transition-all duration-500" style="width: ${readyRatio}%"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        function sortSketchesByRugIndex(sketches) {
            return (sketches || []).slice().sort((a, b) => {
                const aIdx = a.rugIndex != null ? Number(a.rugIndex) : Number.MAX_SAFE_INTEGER;
                const bIdx = b.rugIndex != null ? Number(b.rugIndex) : Number.MAX_SAFE_INTEGER;
                return aIdx - bIdx;
            });
        }

        /** Stable sketch number — always based on rugIndex from CMS, not array position. */
        function getSketchDisplayNumber(sketch, listIndex = 0) {
            if (sketch && sketch.rugIndex != null && !Number.isNaN(Number(sketch.rugIndex))) {
                return Number(sketch.rugIndex) + 1;
            }
            return listIndex + 1;
        }

        function getSketchGroupLabel(sketch, listIndex = 0, order = null) {
            const name = (sketch?.participantName || '').trim();
            if (name) return name;
            const organizerName = (order?.organizerName || '').trim();
            if (organizerName) return organizerName;
            return `משתתף ${getSketchDisplayNumber(sketch, listIndex)}`;
        }

        function formatSketchLogContext(order, sketch) {
            const sketches = order?.sketches || [];
            const listIndex = Math.max(0, sketches.findIndex((s) => s.id === sketch?.id));
            return `${getSketchGroupLabel(sketch, listIndex, order)} · סקיצה ${getSketchDisplayNumber(sketch, listIndex)}`;
        }

        function buildChildSketchBadge(sketch) {
            if (!sketch?.includesChild) return '';
            const label = (sketch.childrenCount || 0) > 1
                ? `ה+${sketch.childrenCount} ילדים`
                : 'ה+ילד';
            return `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">${label}</span>`;
        }

        /** Aggregates sketch/cup selection counts across every visible order in a workshop. */
        function calcWorkshopSketchProgress(workshopId) {
            const workshop = mockWorkshops.find(w => w.id === workshopId);
            const typeInfo = workshop ? workshopTypes[workshop.type] : null;
            const orders = getVisibleOrders().filter(o => o.workshopId === workshopId && o.orderStatus !== 'cancelled');
            let selected = 0;
            let ready = 0;
            let total = 0;
            for (const o of orders) {
                // Candles orders track cups — even if the workshop type row in the
                // CMS is (mis)configured with requiresSketch=true.
                let counts = null;
                if (isCandlesOrder(o)) {
                    counts = getOrderCupTotals(o);
                } else if (typeInfo?.requiresSketch) {
                    counts = getOrderSketchTotals(o);
                }
                if (!counts) continue;
                total += counts.total;
                selected += counts.selected;
                ready += counts.ready;
            }
            return { selected, ready, total };
        }

        function applyFilters() {
            checkAlerts();
            const search = document.getElementById('searchInput').value.toLowerCase();
            const type = document.getElementById('typeFilter').value;
            const instructor = document.getElementById('instructorFilter').value;
            const onlyMissingSketches = document.getElementById('missingSketchesFilter').checked;
            showCancelledOrders = document.getElementById('showCancelledOrdersFilter').checked;
            const clearBtn = document.getElementById('clearFiltersBtn');

            let filtered = mockWorkshops;

            // Safety net: main table shows only workshops with CMS orders by default.
            if (!showAllOrders) {
                filtered = filtered.filter(w => (w.groupsCount || 0) > 0);
            } else {
                filtered = filtered.filter(w => (w.allGroupsCount || w.groupsCount || 0) > 0);
            }

            if (isAlertFilterActive) {
                filtered = filtered.filter(w => w.hasAlert || w.hasNotReadyAlert);
            }
            if (search) {
                filtered = filtered.filter(w => workshopTypes[w.type].title.toLowerCase().includes(search));
            }
            if (type) {
                filtered = filtered.filter(w => w.type === type);
            }
            if (instructor) {
                filtered = filtered.filter(w => w.instructors.includes(instructor));
            }
            if (onlyMissingSketches) {
                filtered = filtered.filter(w => {
                    const typeInfo = workshopTypes[w.type];
                    const isCups = isCandlesWorkshop(w.id);
                    if (!isCups && !typeInfo?.requiresSketch) return false;
                    const { selected, ready, total } = calcWorkshopSketchProgress(w.id);
                    if (isCups) return selected < total;
                    return selected < total || ready < total;
                });
            }

            // Nearest date/time first (backend already sorts, this keeps it stable after client-side filtering).
            filtered = filtered.slice().sort((a, b) => {
                if (a.startTimestamp == null) return 1;
                if (b.startTimestamp == null) return -1;
                return a.startTimestamp - b.startTimestamp;
            });

            if (search || type || instructor || onlyMissingSketches || isAlertFilterActive || !isDefaultDateRange()) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }

            renderWorkshopsTable(filtered);
        }

        /** Expands/collapses the filters panel body on mobile (hidden by default there via CSS; no-op/invisible button on desktop). */
        function toggleFiltersPanel() {
            const body = document.getElementById('wdFiltersBody');
            const icon = document.getElementById('wdFiltersToggleIcon');
            if (!body) return;
            const isOpen = body.classList.toggle('wd-filters-open');
            if (icon) icon.className = isOpen ? 'ph ph-caret-up' : 'ph ph-caret-down';
        }

        function clearFilters() {
            __wdCurrentPage = 1;
            document.getElementById('searchInput').value = '';
            document.getElementById('typeFilter').value = '';
            document.getElementById('instructorFilter').value = '';
            document.getElementById('missingSketchesFilter').checked = false;
            document.getElementById('showCancelledOrdersFilter').checked = false;
            if (isAlertFilterActive) toggleAlertFilter();

            const wasDefaultRange = isDefaultDateRange();
            const wasShowAllOrders = showAllOrders;
            initDateRangeFilter();
            showAllOrders = false;
            const showAllOrdersCheckbox = document.getElementById('showAllOrdersToggle');
            if (showAllOrdersCheckbox) showAllOrdersCheckbox.checked = false;

            applyFilters();

            // Only the server-side filters (date range / include-all-orders)
            // require a fresh fetch — everything else is filtered client-side above.
            if (!wasDefaultRange || wasShowAllOrders) {
                triggerFilterRefresh();
            }
        }

        function renderWorkshopsTable(allFilteredWorkshops) {
            const tbody = document.getElementById('workshopsTableBody');
            tbody.innerHTML = '';
            document.getElementById('workshopsCount').innerText = `מציג ${allFilteredWorkshops.length} סדנאות`;

            if(allFilteredWorkshops.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500 font-medium">לא נמצאו סדנאות התואמות לחיפוש.</td></tr>`;
                __wdRenderPagination(0, 0);
                return;
            }

            const totalPages = Math.max(1, Math.ceil(allFilteredWorkshops.length / __wdPageSize));
            if (__wdCurrentPage > totalPages) __wdCurrentPage = totalPages;
            if (__wdCurrentPage < 1) __wdCurrentPage = 1;

            const pageStart = (__wdCurrentPage - 1) * __wdPageSize;
            const workshops = allFilteredWorkshops.slice(pageStart, pageStart + __wdPageSize);

            workshops.forEach(w => {
                const typeInfo = workshopTypes[w.type];
                
                // Instructors badge list generation
                let instructorsHtml = '';
                if (w.instructors && w.instructors.length > 0) {
                    const firstInstructor = w.instructors[0];
                    instructorsHtml += `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs border border-emerald-200 font-semibold whitespace-nowrap">${firstInstructor}</span>`;
                    
                    if (w.instructors.length > 1) {
                        const secondInstructor = w.instructors[1];
                        instructorsHtml += `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs border border-amber-200 font-medium whitespace-nowrap" title="STANDBY">גיבוי: ${secondInstructor}</span>`;
                    }
                    
                    if (w.instructors.length > 2) {
                        const extraCount = w.instructors.length - 2;
                        const extraNames = w.instructors.slice(2).join(', ');
                        instructorsHtml += `
                            <div class="relative group inline-block">
                                <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs border border-gray-200 cursor-help font-semibold">
                                    +${extraCount}
                                </span>
                                <div class="absolute bottom-full right-1/2 translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-[11px] rounded py-1 px-2.5 z-20 whitespace-nowrap shadow-lg">
                                    ${extraNames}
                                </div>
                            </div>
                        `;
                    }
                } else {
                    instructorsHtml = `<span class="text-xs text-gray-400 font-medium">לא הוגדר</span>`;
                }

                // Calculate Capacity Colors — currentCapacity is the REAL Wix Bookings headcount
                // (includes legacy/non-CMS bookings); cmsCapacity only counts WorkshopOrders CMS
                // records. Default view shows the CMS-only number, matching the orders list below.
                const displayCapacity = showAllOrders ? w.currentCapacity : (typeof w.cmsCapacity === 'number' ? w.cmsCapacity : w.currentCapacity);
                const availableSpots = w.maxCapacity - displayCapacity;
                let capacityColor = 'text-green-600 font-bold'; 
                if (availableSpots === 0) capacityColor = 'text-red-600 font-bold';
                else if (availableSpots <= 2) capacityColor = 'text-orange-500 font-bold';

                // Groups count — active CMS orders only (cancelled bookings excluded).
                const groupsCount = getVisibleOrders()
                    .filter(o => o.workshopId === w.id && o.orderStatus !== 'cancelled')
                    .reduce((sum, o) => {
                        if (o.selectionMode === 'participants' && (o.participantGroups || []).length > 0) {
                            return sum + o.participantGroups.length;
                        }
                        return sum + 1;
                    }, 0);
                const groupsLabel = groupsCount === 1 ? 'קבוצה' : 'קבוצות';
                const groupsHtml = `<div class="text-xs text-gray-500 font-medium flex items-center gap-1 mt-0.5"><i class="ph ph-users-three text-gray-400"></i> ${groupsCount} ${groupsLabel}</div>`;

                const isCupsWs = isCandlesWorkshop(w.id);
                let progressHtml = '<span class="text-xs text-gray-400 font-medium">לא נדרש</span>';
                if (isCupsWs) {
                    const { selected, total } = calcWorkshopSketchProgress(w.id);
                    progressHtml = total > 0
                        ? buildCupProgressBarHtml(selected, total)
                        : '<span class="text-xs text-gray-400 font-medium">—</span>';
                } else if (typeInfo.requiresSketch) {
                    const { selected, ready, total } = calcWorkshopSketchProgress(w.id);
                    progressHtml = total > 0
                        ? buildSketchProgressBarsHtml(selected, ready, total)
                        : '<span class="text-xs text-gray-400 font-medium">—</span>';
                }

                const alertTags = [];
                if (w.hasAlert) alertTags.push(buildSketchAlertBadge('missing', w.isUrgent, isCupsWs));
                if (w.hasNotReadyAlert) alertTags.push(buildSketchAlertBadge('notReady', w.isUrgent));
                const alertHtml = alertTags.length
                    ? `<div class="mt-2 flex flex-col items-start gap-1">${alertTags.join('')}</div>`
                    : '';

                const tr = document.createElement('tr');
                tr.className = "wd-ws-row hover:bg-gray-50/80 cursor-pointer transition-colors group";
                tr.onclick = () => openSidePanel(w.id);
                
                tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap" data-label="תאריך ושעות">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-gray-900">${w.date}</span>
                            <span class="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><i class="ph ph-clock"></i> ${w.time} - ${w.endTime}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap" data-label="סוג סדנה">
                        <div class="flex flex-col items-start gap-1">
                            <span class="px-2.5 py-1 rounded-md text-sm font-bold" style="${colorHexToBadgeStyle(typeInfo.colorHex)}">${typeInfo.title}</span>
                            ${alertHtml}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap" data-label="צוות מדריכים">
                        <div class="flex items-center gap-1.5 flex-wrap w-44">${instructorsHtml}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap" data-label="תפוסה וקבוצות">
                        <div class="flex flex-col items-start">
                            <div class="flex items-center gap-1.5 text-sm ${capacityColor}">
                                <i class="ph-fill ph-users"></i>
                                <span>${displayCapacity} / ${w.maxCapacity}</span>
                            </div>
                            ${groupsHtml}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-center" data-label="התקדמות סקיצות">
                        ${progressHtml}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            __wdRenderPagination(allFilteredWorkshops.length, totalPages);
        }

        /** Updates the pagination bar (info text + prev/next state) below the workshops table. */
        function __wdRenderPagination(totalCount, totalPages) {
            const bar = document.getElementById('workshopsPagination');
            const info = document.getElementById('paginationInfo');
            const pageLabel = document.getElementById('paginationPageLabel');
            const prevBtn = document.getElementById('paginationPrevBtn');
            const nextBtn = document.getElementById('paginationNextBtn');
            if (!bar || !info || !pageLabel || !prevBtn || !nextBtn) return;

            if (totalCount <= __wdPageSize) {
                bar.classList.add('hidden');
                return;
            }
            bar.classList.remove('hidden');

            const pageStart = (__wdCurrentPage - 1) * __wdPageSize + 1;
            const pageEnd = Math.min(__wdCurrentPage * __wdPageSize, totalCount);
            info.innerText = `מציג ${pageStart}-${pageEnd} מתוך ${totalCount} סדנאות`;
            pageLabel.innerText = `עמוד ${__wdCurrentPage} מתוך ${totalPages}`;
            prevBtn.disabled = __wdCurrentPage <= 1;
            nextBtn.disabled = __wdCurrentPage >= totalPages;
        }

        /** delta: -1/+1 to move relative to the current page (called from inline onclick, which runs in global scope). */
        function __wdGoToPage(delta) {
            __wdCurrentPage += delta;
            applyFilters();
        }

        // --- SIDE PANEL & ORDERS ACCORDION ---

        function openSidePanel(id) {
            currentWorkshopId = id;
            const w = mockWorkshops.find(x => x.id === id);
            const typeInfo = workshopTypes[w.type];
            const wOrders = getVisibleOrders().filter(o => o.workshopId === id);
            console.warn('🏫 [workshops-dashboard] Opened workshop:', w);
            console.warn(`📋 [workshops-dashboard] Orders for workshop ${id} (${wOrders.length}):`, wOrders);

            // Update Header
            document.getElementById('spTitle').innerText = w.title;
            const tagEl = document.getElementById('spTag');
            tagEl.innerText = typeInfo.title;
            tagEl.className = 'px-2.5 py-1 rounded-md text-xs font-semibold';
            tagEl.setAttribute('style', colorHexToBadgeStyle(typeInfo.colorHex));
            document.getElementById('spDate').innerText = w.date;
            document.getElementById('spTime').innerText = `${w.time} - ${w.endTime}`;
            const spDisplayCapacity = showAllOrders ? w.currentCapacity : (typeof w.cmsCapacity === 'number' ? w.cmsCapacity : w.currentCapacity);
            document.getElementById('spCapacity').innerText = `${spDisplayCapacity}/${w.maxCapacity} משתתפים`;

            // Column headers adapt to the workshop's tracked item (sketches vs cups).
            const isCupsWs = isCandlesWorkshop(w.id);
            const progressHeader = document.getElementById('spProgressHeader');
            const itemsHeader = document.getElementById('spItemsHeader');
            if (progressHeader) progressHeader.innerText = isCupsWs ? 'התקדמות כוסות' : 'התקדמות סקיצות';
            if (itemsHeader) itemsHeader.innerText = isCupsWs ? 'כוסות' : 'סקיצות';

            renderOrdersTable(w.id, typeInfo.requiresSketch);

            // Show Panel
            const overlay = document.getElementById('sidePanelOverlay');
            const panel = document.getElementById('sidePanel');
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10);
            panel.classList.remove('-translate-x-full');
        }

        function closeSidePanel() {
            const overlay = document.getElementById('sidePanelOverlay');
            const panel = document.getElementById('sidePanel');
            panel.classList.add('-translate-x-full');
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }

        function toggleOrderDetails(orderId, event) {
            // Prevent toggle when clicking actions like Whatsapp or dropdowns
            if (event && (event.target.closest('button') || event.target.tagName === 'SELECT')) return; 
            
            const row = document.getElementById(`detail-${orderId}`);
            const icon = document.getElementById(`icon-${orderId}`);
            
            if (row) {
                if (row.classList.contains('hidden')) {
                    row.classList.remove('hidden');
                    icon.classList.add('-rotate-90');
                } else {
                    row.classList.add('hidden');
                    icon.classList.remove('-rotate-90');
                }
            }
        }

        function toggleInlineLogs(orderId, totalCount) {
            const wrapper = document.getElementById(`inline-logs-wrapper-${orderId}`);
            const fade = document.getElementById(`inline-logs-fade-${orderId}`);
            const btn = document.getElementById(`inline-logs-btn-${orderId}`);
            
            if (wrapper.classList.contains('max-h-[75px]')) {
                wrapper.classList.remove('max-h-[75px]', 'overflow-hidden');
                wrapper.classList.add('max-h-[200px]', 'overflow-y-auto');
                if(fade) fade.style.opacity = '0';
                btn.innerHTML = '<i class="ph ph-caret-up"></i> סגור';
            } else {
                wrapper.classList.add('max-h-[75px]', 'overflow-hidden');
                wrapper.classList.remove('max-h-[200px]', 'overflow-y-auto');
                if(fade) fade.style.opacity = '1';
                btn.innerHTML = `<i class="ph ph-caret-down"></i> הצג הכל (${totalCount})`;
                wrapper.scrollTop = 0;
            }
        }

        function renderOrdersTable(workshopId, requiresSketch) {
            const tbody = document.getElementById('ordersTableBody');
            tbody.innerHTML = '';
            const orders = getVisibleOrders()
                .filter(o => o.workshopId === workshopId && (showCancelledOrders || o.orderStatus !== 'cancelled'))
                .slice()
                .sort((a, b) => (b.quantity || 0) - (a.quantity || 0));

            if(orders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="px-8 py-16 text-center text-gray-500">אין הזמנות לסדנה זו.</td></tr>`;
                return;
            }

            const canSendWhatsApp = hasDashboardPermission('sendWhatsApp');
            const canEditSketchStatus = hasDashboardPermission('editSketchStatus');
            const canRejectSketchStatus = hasDashboardPermission('rejectSketchStatus');

            orders.forEach(o => {
                const isCancelled = o.orderStatus === 'cancelled';
                const isLegacy = !!o.isLegacyOrder;
                const opacityClass = isCancelled ? 'opacity-50 grayscale bg-gray-50/50' : '';
                const groupName = o.organizerName || 'ללא שם';
                const groupPhone = o.organizerPhone || '—';
                const groupEmail = o.organizerEmail || '—';
                const legacyBadge = isLegacy
                    ? `<span class="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-gray-300 whitespace-nowrap" title="הזמנה שנעשתה מחוץ למערכת החדשה - ללא מעקב סקיצות/הערות">הזמנה ישנה</span>`
                    : '';
                const isCandles = isCandlesOrder(o);
                const unitWord = isCandles ? 'נרות' : 'שטיחים';
                // Clear breakdown: adults / children (if any) / total rugs needed —
                // replaces the ambiguous "x{quantity} משתתפים" single number.
                const groupBreakdownHtml = `
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1" title="מבוגרים">
                            <i class="ph-fill ph-user"></i>${o.adults || 0} מבוגרים
                        </span>
                        ${(o.children || 0) > 0 ? `
                        <span class="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1" title="ילדים">
                            <i class="ph-fill ph-baby"></i>${o.children} ילדים
                        </span>` : ''}
                        <span class="bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1" title="סה״כ ${unitWord} לקבוצה">
                            <i class="ph-fill ph-squares-four"></i>${o.rugCount || 0} ${unitWord}
                        </span>
                    </div>`;
                
                let readyCount = 0;
                let totalSketches = 0;
                let selectedCount = 0;
                let orderAlertsHtml = '';
                let progressHtml = isLegacy
                    ? '<span class="text-xs text-gray-400">ללא מעקב</span>'
                    : '<span class="text-xs text-gray-400">לא נדרש</span>';

                if (!isLegacy && isCancelled && (isCandles || requiresSketch)) {
                    progressHtml = '<span class="text-xs text-gray-400">הזמנה מבוטלת</span>';
                } else if (!isLegacy && isCandles) {
                    // Candles order: single cups bar, no readiness tracking, no sketch wording.
                    const cupTotals = getOrderCupTotals(o);
                    if (cupTotals.total > 0) {
                        orderAlertsHtml = cupTotals.hasMissing
                            ? `<div class="flex flex-wrap items-center gap-1.5 mt-1.5">${buildSketchAlertBadge('missing', false, true)}</div>`
                            : '';
                        progressHtml = buildCupProgressBarHtml(
                            cupTotals.selected,
                            cupTotals.total,
                            { widthClass: 'w-36', barHeight: 'h-1.5', innerBarHeight: 'h-1.5' }
                        );
                    }
                } else if (!isLegacy && requiresSketch) {
                    const sketchTotals = getOrderSketchTotals(o);
                    totalSketches = sketchTotals.total;
                    readyCount = sketchTotals.ready;
                    selectedCount = sketchTotals.selected;

                    if (totalSketches > 0) {
                        const orderAlertTags = [];
                        if (sketchTotals.hasMissing) orderAlertTags.push(buildSketchAlertBadge('missing', false));
                        if (sketchTotals.hasNotReady) orderAlertTags.push(buildSketchAlertBadge('notReady', false));
                        orderAlertsHtml = orderAlertTags.length
                            ? `<div class="flex flex-wrap items-center gap-1.5 mt-1.5">${orderAlertTags.join('')}</div>`
                            : '';

                        progressHtml = buildSketchProgressBarsHtml(
                            selectedCount,
                            readyCount,
                            totalSketches,
                            { widthClass: 'w-36', barHeight: 'h-1.5', innerBarHeight: 'h-1.5', gapClass: 'gap-1.5' }
                        );
                    }
                }

                let stackedSketchesHtml = '';
                if (!isLegacy && !isCandles && requiresSketch && o.sketches && o.sketches.length > 0) {
                    stackedSketchesHtml = '<div class="flex items-center justify-end -space-x-4 space-x-reverse opacity-90 group-hover:opacity-100 transition-opacity" dir="rtl">';
                    const displayLimit = 5;
                    const sortedStackSketches = sortSketchesByRugIndex(o.sketches);
                    const totalSketchesCount = sortedStackSketches.length;
                    
                    sortedStackSketches.slice(0, displayLimit).forEach((s, idx) => {
                        const isLastInLimit = (idx === displayLimit - 1 && totalSketchesCount > displayLimit);
                        const imgSrc = s.img || 'https://placehold.co/100x100/F3F4F6/9CA3AF?text=-';
                        
                        if (isLastInLimit) {
                            stackedSketchesHtml += `
                                <div class="relative w-11 h-11 rounded-lg border-2 border-white shadow-sm overflow-hidden" style="z-index: ${10-idx}">
                                    <img src="${imgSrc}" class="w-full h-full object-cover">
                                    <div class="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-[1px]">
                                        <div class="flex items-center text-gray-900">
                                            <i class="ph ph-plus text-[10px] font-bold"></i><span class="text-sm font-bold leading-none">${totalSketchesCount}</span>
                                        </div>
                                    </div>
                                </div>`;
                        } else {
                            stackedSketchesHtml += `
                                <div class="relative w-11 h-11 rounded-lg border-2 border-white shadow-sm overflow-hidden" style="z-index: ${10-idx}">
                                    <img src="${imgSrc}" class="w-full h-full object-cover">
                                </div>`;
                        }
                    });
                    stackedSketchesHtml += '</div>';
                } else if (!isLegacy && isCandles) {
                    const cups = expandCupSelections(o);
                    if (cups.length > 0) {
                        stackedSketchesHtml = '<div class="flex items-center justify-end -space-x-4 space-x-reverse opacity-90 group-hover:opacity-100 transition-opacity" dir="rtl">';
                        const displayLimit = 5;
                        cups.slice(0, displayLimit).forEach((cup, idx) => {
                            const isLastInLimit = (idx === displayLimit - 1 && cups.length > displayLimit);
                            const imgSrc = cup.img || 'https://placehold.co/100x100/F3F4F6/9CA3AF?text=-';
                            if (isLastInLimit) {
                                stackedSketchesHtml += `
                                    <div class="relative w-11 h-11 rounded-lg border-2 border-white shadow-sm overflow-hidden" style="z-index: ${10-idx}">
                                        <img src="${imgSrc}" class="w-full h-full object-cover">
                                        <div class="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-[1px]">
                                            <div class="flex items-center text-gray-900">
                                                <i class="ph ph-plus text-[10px] font-bold"></i><span class="text-sm font-bold leading-none">${cups.length}</span>
                                            </div>
                                        </div>
                                    </div>`;
                            } else {
                                stackedSketchesHtml += `
                                    <div class="relative w-11 h-11 rounded-lg border-2 border-white shadow-sm overflow-hidden" style="z-index: ${10-idx}">
                                        <img src="${imgSrc}" class="w-full h-full object-cover">
                                    </div>`;
                            }
                        });
                        stackedSketchesHtml += '</div>';
                    } else {
                        stackedSketchesHtml = '<span class="text-xs text-gray-400">-</span>';
                    }
                } else {
                    stackedSketchesHtml = '<span class="text-xs text-gray-400">-</span>';
                }

                const tr = document.createElement('tr');
                tr.className = `wd-order-row hover:bg-gray-50 transition-colors cursor-pointer group ${opacityClass}`;
                tr.onclick = (e) => toggleOrderDetails(o.id, e);
                tr.innerHTML = `
                    <td class="px-8 py-4" data-label="לקוח ופרטים">
                        <div class="flex items-start gap-4">
                            <div class="text-gray-400 transition-transform duration-300 mt-0.5" id="icon-${o.id}"><i class="ph-bold ph-caret-left"></i></div>
                            <div class="flex flex-col">
                                <div class="font-bold text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                                    ${groupName}
                                    ${legacyBadge}
                                    ${isCancelled ? '<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded-md text-[10px] font-bold">בוטל</span>' : ''}
                                </div>
                                <div class="text-xs text-gray-500 mt-1 flex gap-3 font-medium">
                                    <span><i class="ph ph-phone mr-1"></i>${groupPhone}</span>
                                    <span><i class="ph ph-envelope-simple mr-1"></i>${groupEmail}</span>
                                </div>
                                <div class="mt-1.5">${groupBreakdownHtml}</div>
                                ${orderAlertsHtml}
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4" data-label="התקדמות סקיצות">${progressHtml}</td>
                    <td class="px-8 py-4 text-left" data-label="סקיצות">
                        <div class="flex items-center justify-end gap-3 ${isCancelled?'pointer-events-none opacity-50':''}">
                            <button onclick="openWaModal('${o.id}')" class="w-9 h-9 flex items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-500 hover:text-white transition-all shadow-sm border border-green-200 shrink-0 ${!canSendWhatsApp?'pointer-events-none opacity-40':''}" title="שלח הודעה ללקוח">
                                <i class="ph-fill ph-whatsapp-logo text-xl"></i>
                            </button>
                            ${stackedSketchesHtml}
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);

                const detailTr = document.createElement('tr');
                detailTr.id = `detail-${o.id}`;
                detailTr.className = `hidden bg-gray-50/60 border-t border-gray-100 shadow-inner ${opacityClass}`;
                
                let innerContent = '';
                
                // 1. Sketches Carousel
                let sketchesHtml = '';
                const orderSketchTotals = getOrderSketchTotals(o);
                if (requiresSketch && !isLegacy && !isCandles && orderSketchTotals.total > 0) {
                    const existingSketches = sortSketchesByRugIndex(o.sketches || []);
                    sketchesHtml = `
                        <div class="px-8 pt-5 pb-2 w-full">
                            <div class="flex justify-between items-center mb-4">
                                <h4 class="text-sm font-bold text-gray-800">סקיצות להכנה: <span class="text-gray-500 font-medium">${orderSketchTotals.selected}/${orderSketchTotals.total} נבחרו · ${orderSketchTotals.ready}/${orderSketchTotals.total} ${getReadyProgressLabel(orderSketchTotals.total)}</span></h4>
                                <div class="flex items-center gap-2" dir="ltr">
                                    <button onclick="scrollCarousel('${o.id}', -256, event)" class="bg-white shadow-sm border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 hover:text-primary hover:bg-gray-50 transition-all"><i class="ph-bold ph-caret-left text-sm"></i></button>
                                    <button onclick="scrollCarousel('${o.id}', 256, event)" class="bg-white shadow-sm border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 hover:text-primary hover:bg-gray-50 transition-all"><i class="ph-bold ph-caret-right text-sm"></i></button>
                                </div>
                            </div>
                            <div id="carousel-${o.id}" class="flex gap-4 overflow-x-auto overflow-y-hidden hide-scrollbar snap-x snap-mandatory pb-4 w-full" style="scroll-behavior: smooth;">`;
                    
                    existingSketches.forEach((s, idx) => {
                        const statusColors = {
                            'מוכנה': 'bg-green-100 text-green-700 border-green-200',
                            'בהכנה': 'bg-orange-100 text-orange-700 border-orange-200',
                            'פתוח לשינויים': 'bg-gray-100 text-gray-700 border-gray-200',
                            'לא מאושרת לביצוע': 'bg-red-100 text-red-700 border-red-300 font-bold'
                        };
                        const badgeClass = statusColors[s.status] || 'bg-gray-100 text-gray-700 border-gray-200';
                        const sketchNum = getSketchDisplayNumber(s, idx);
                        const sketchLabel = getSketchGroupLabel(s, idx, o);
                        const childBadge = buildChildSketchBadge(s);
                        const sketchNumberBadge = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">סקיצה ${sketchNum}</span>`;

                        const frameTypeLabels = { square: 'ריבוע', circle: 'עיגול', custom: 'צורה חופשית' };
                        const frameBadge = s.frameType && frameTypeLabels[s.frameType]
                            ? `<span class="text-[10px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-100 shadow-sm" title="מסגרת">${frameTypeLabels[s.frameType]}</span>`
                            : '';

                        const downloadBtnHtml = s.wixFileUrl
                            ? `<button type="button" id="sketch-dl-btn-${s.id}" onclick="downloadSketchImage('${o.id}', '${s.id}', event)" class="w-10 h-10 rounded-full bg-white/90 text-gray-800 hover:bg-white flex items-center justify-center shadow-md disabled:opacity-60" title="הורדת סקיצה">
                                     <i class="ph ph-download-simple text-xl"></i>
                                 </button>`
                            : '';

                        const imgHtml = s.img ? 
                            `<img src="${s.img}" class="object-cover w-full h-full bg-white group-hover:scale-105 transition-transform duration-300" style="background-color:#ffffff;">
                             <div class="absolute inset-0 bg-gray-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3" onclick="event.stopPropagation()">
                                 <button type="button" onclick="openFullscreenImg('${s.img.replace(/'/g, "\\'")}')" class="w-10 h-10 rounded-full bg-white/90 text-gray-800 hover:bg-white flex items-center justify-center shadow-md" title="הגדלה">
                                     <i class="ph ph-corners-out text-xl"></i>
                                 </button>
                                 ${downloadBtnHtml}
                             </div>` : 
                            `<div class="flex flex-col items-center justify-center w-full h-full text-gray-400 bg-gray-100/80">
                                 <i class="ph ph-image-broken text-3xl mb-2 text-gray-300"></i>
                                 <span class="text-[11px] font-bold text-gray-500">טרם נבחרה סקיצה</span>
                             </div>`;

                        sketchesHtml += `
                            <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col gap-3 w-[240px] shrink-0 snap-start relative overflow-hidden transition-shadow hover:shadow-md">
                                <div class="flex justify-between items-center z-10 gap-1 flex-wrap">
                                    ${sketchNumberBadge}
                                    <span class="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">${sketchLabel}</span>
                                    ${childBadge}
                                    ${frameBadge}
                                    <span class="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 shadow-sm ml-auto" dir="ltr">${s.size}</span>
                                </div>
                                <div class="relative w-full aspect-square rounded-lg overflow-hidden group cursor-pointer border border-gray-200 shadow-sm z-10">
                                    ${imgHtml}
                                    <div class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold border shadow-sm z-20 opacity-95 ${badgeClass}">
                                        ${s.status}
                                    </div>
                                </div>
                                <div class="z-10">
                                    <select onchange="updateSketchStatus('${o.id}', '${s.id}', this.value, this)" class="compact-input w-full py-1.5 text-xs bg-gray-50 font-medium ${(isCancelled||!canEditSketchStatus)?'pointer-events-none':''}" ${(isCancelled||!canEditSketchStatus)?'disabled':''} title="${!canEditSketchStatus?'אין לך הרשאה לעדכן סטטוס סקיצה':''}">
                                        <option value="פתוח לשינויים" ${s.status==='פתוח לשינויים'?'selected':''}>פתוח לשינויים</option>
                                        <option value="בהכנה" ${s.status==='בהכנה'?'selected':''}>בהכנה</option>
                                        <option value="מוכנה" ${s.status==='מוכנה'?'selected':''}>מוכנה</option>
                                        <option value="לא מאושרת לביצוע" ${s.status==='לא מאושרת לביצוע'?'selected':''} ${!canRejectSketchStatus?'disabled':''}>לא מאושרת לביצוע</option>
                                    </select>
                                </div>
                            </div>
                        `;
                    });

                    const missingSlots = Math.max(0, orderSketchTotals.total - existingSketches.length);
                    for (let slot = 0; slot < missingSlots; slot++) {
                        const slotIndex = existingSketches.length + slot;
                        const slotSketchNum = slotIndex + 1;
                        sketchesHtml += `
                            <div class="bg-white border-2 border-dashed border-gray-300 rounded-xl p-3 shadow-sm flex flex-col gap-3 w-[240px] shrink-0 snap-start relative overflow-hidden">
                                <div class="flex justify-between items-center z-10 gap-1 flex-wrap">
                                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">סקיצה ${slotSketchNum}</span>
                                    <span class="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">שטיח ${slotSketchNum}</span>
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">טרם נבחר</span>
                                </div>
                                <div class="relative w-full aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400">
                                    <i class="ph ph-image-broken text-3xl mb-2 text-gray-300"></i>
                                    <span class="text-[11px] font-bold text-gray-500">טרם נבחרה סקיצה</span>
                                </div>
                            </div>
                        `;
                    }

                    sketchesHtml += `</div></div>`;
                } else if (isLegacy) {
                    sketchesHtml = `<div class="p-8 pb-4 text-sm text-gray-500 flex items-center gap-2"><i class="ph ph-info text-xl text-gray-400"></i> הזמנה ישנה שנעשתה מחוץ למערכת החדשה - אין מעקב סקיצות עבורה.</div>`;
                } else if (isCandles) {
                    const cupTotals = getOrderCupTotals(o);
                    const cups = expandCupSelections(o);
                    if (cupTotals.total > 0) {
                        sketchesHtml = `
                            <div class="px-8 pt-5 pb-2 w-full">
                                <div class="flex justify-between items-center mb-4">
                                    <h4 class="text-sm font-bold text-gray-800">כוסות שנבחרו: <span class="text-gray-500 font-medium">${cupTotals.selected}/${cupTotals.total}</span></h4>
                                    <div class="flex items-center gap-2" dir="ltr">
                                        <button onclick="scrollCarousel('${o.id}', -256, event)" class="bg-white shadow-sm border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 hover:text-primary hover:bg-gray-50 transition-all"><i class="ph-bold ph-caret-left text-sm"></i></button>
                                        <button onclick="scrollCarousel('${o.id}', 256, event)" class="bg-white shadow-sm border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 hover:text-primary hover:bg-gray-50 transition-all"><i class="ph-bold ph-caret-right text-sm"></i></button>
                                    </div>
                                </div>
                                <div id="carousel-${o.id}" class="flex gap-4 overflow-x-auto overflow-y-hidden hide-scrollbar snap-x snap-mandatory pb-4 w-full" style="scroll-behavior: smooth;">`;
                        cups.forEach((cup, idx) => {
                            const imgHtml = cup.img
                                ? `<img src="${cup.img}" class="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300">
                                   <div class="absolute inset-0 bg-gray-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" onclick="event.stopPropagation()">
                                       <button type="button" onclick="openFullscreenImg('${cup.img.replace(/'/g, "\\'")}')" class="w-10 h-10 rounded-full bg-white/90 text-gray-800 hover:bg-white flex items-center justify-center shadow-md" title="הגדלה">
                                           <i class="ph ph-corners-out text-xl"></i>
                                       </button>
                                   </div>`
                                : `<div class="flex flex-col items-center justify-center w-full h-full text-gray-400 bg-gray-100/80">
                                       <i class="ph ph-image-broken text-3xl mb-2 text-gray-300"></i>
                                       <span class="text-[11px] font-bold text-gray-500">ללא תמונה</span>
                                   </div>`;
                            sketchesHtml += `
                                <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col gap-3 w-[240px] shrink-0 snap-start relative overflow-hidden transition-shadow hover:shadow-md">
                                    <div class="flex justify-between items-center z-10 gap-1 flex-wrap">
                                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">כוס ${idx + 1}</span>
                                    </div>
                                    <div class="relative w-full aspect-square rounded-lg overflow-hidden group cursor-pointer border border-gray-200 shadow-sm z-10">
                                        ${imgHtml}
                                    </div>
                                </div>`;
                        });
                        const missingCups = Math.max(0, cupTotals.total - cups.length);
                        for (let slot = 0; slot < missingCups; slot++) {
                            const slotNum = cups.length + slot + 1;
                            sketchesHtml += `
                                <div class="bg-white border-2 border-dashed border-gray-300 rounded-xl p-3 shadow-sm flex flex-col gap-3 w-[240px] shrink-0 snap-start relative overflow-hidden">
                                    <div class="flex justify-between items-center z-10 gap-1 flex-wrap">
                                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">כוס ${slotNum}</span>
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">טרם נבחר</span>
                                    </div>
                                    <div class="relative w-full aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400">
                                        <i class="ph ph-image-broken text-3xl mb-2 text-gray-300"></i>
                                        <span class="text-[11px] font-bold text-gray-500">טרם נבחרה כוס</span>
                                    </div>
                                </div>`;
                        }
                        sketchesHtml += `</div></div>`;
                    } else {
                        sketchesHtml = `<div class="p-8 pb-4 text-sm text-gray-500 flex items-center gap-2"><i class="ph ph-info text-xl text-gray-400"></i> אין עדיין כוסות שנבחרו.</div>`;
                    }
                } else {
                    sketchesHtml = `<div class="p-8 pb-4 text-sm text-gray-500 flex items-center gap-2"><i class="ph ph-info text-xl text-gray-400"></i> אין עדיין סקיצות שנבחרו.</div>`;
                }
                innerContent += sketchesHtml;

                // 2. Customer notes (from checkout, read-only)
                if (o.customerNotes) {
                    innerContent += `<div class="px-8 pb-2 pt-0 w-full"><div class="bg-sky-50 border border-sky-100 rounded-lg p-3 text-sm text-sky-800 flex items-start gap-2"><i class="ph-fill ph-chat-circle-text text-sky-500 mt-0.5"></i><div><strong class="block mb-0.5 text-xs text-sky-600">הערות לקוח:</strong>${o.customerNotes}</div></div></div>`;
                }

                // 2b. Internal team notes
                if (o.notes) {
                    innerContent += `<div class="px-8 pb-2 pt-0 w-full"><div class="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2"><i class="ph-fill ph-note text-amber-500 mt-0.5"></i><div><strong class="block mb-0.5 text-xs text-amber-600">הערות צוות:</strong>${o.notes}</div></div></div>`;
                }
                
                // 3. Inline Logs (History)
                let logsHtml = '';
                if (o.logs && o.logs.length > 0) {
                    const displayLogs = o.logs;
                    let logsItemsHtml = '<div class="flex flex-col gap-3 relative before:absolute before:inset-y-0 before:right-[15px] before:w-px before:bg-gray-200 ml-2">';
                    
                    displayLogs.forEach((log) => {
                        logsItemsHtml += `
                        <div class="relative pl-4 pr-10">
                            <div class="absolute right-[11px] top-1.5 w-[9px] h-[9px] rounded-full bg-primary border-2 border-white shadow-sm"></div>
                            <p class="text-xs text-gray-500 mb-0.5">${log.time} • <span class="font-medium text-gray-700">${log.user}</span></p>
                            <div class="bg-gray-50 border border-gray-100 rounded-md p-2 text-sm text-gray-800">
                                ${log.action}
                            </div>
                        </div>`;
                    });
                    logsItemsHtml += '</div>';

                    logsHtml = `
                        <div class="px-8 pb-6 pt-2 w-full">
                            <div class="flex justify-between items-center mb-3">
                                <h4 class="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <i class="ph ph-clock-counter-clockwise text-gray-500"></i> היסטוריית פעולות
                                </h4>
                                <button onclick="openNoteModal('${o.id}')" class="px-3 py-1.5 flex items-center gap-1.5 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-all shadow-sm border border-gray-200 text-xs font-medium ${(isCancelled||isLegacy)?'pointer-events-none opacity-50':''}" title="הערות הזמנה">
                                    <i class="ph ph-pencil-simple text-base"></i> הערות הזמנה
                                </button>
                            </div>
                            <div class="relative bg-white border border-gray-100 rounded-xl p-4 shadow-sm w-full">
                                <div id="inline-logs-wrapper-${o.id}" class="relative max-h-[75px] overflow-hidden transition-all duration-300 custom-scrollbar pr-2">
                                    ${logsItemsHtml}
                                </div>
                                ${displayLogs.length > 1 ? `
                                <div id="inline-logs-fade-${o.id}" class="absolute bottom-[52px] left-0 w-full h-12 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none transition-opacity duration-300"></div>
                                <button id="inline-logs-btn-${o.id}" onclick="toggleInlineLogs('${o.id}', ${displayLogs.length})" class="text-xs font-bold text-primary hover:text-primary-hover mt-3 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg w-fit transition-colors">
                                    <i class="ph ph-caret-down"></i> הצג הכל (${displayLogs.length})
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                } else {
                    logsHtml = `
                        <div class="px-8 pb-6 pt-2 w-full">
                            <div class="flex justify-between items-center mb-3">
                                <h4 class="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <i class="ph ph-clock-counter-clockwise text-gray-500"></i> היסטוריית פעולות
                                </h4>
                                <button onclick="openNoteModal('${o.id}')" class="px-3 py-1.5 flex items-center gap-1.5 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-all shadow-sm border border-gray-200 text-xs font-medium ${(isCancelled||isLegacy)?'pointer-events-none opacity-50':''}" title="הערות הזמנה">
                                    <i class="ph ph-pencil-simple text-base"></i> הערות הזמנה
                                </button>
                            </div>
                            <p class="text-sm text-gray-500">${isLegacy ? 'הזמנה ישנה - אין היסטוריית פעולות עבורה במערכת החדשה.' : 'אין היסטוריה להזמנה זו.'}</p>
                        </div>
                    `;
                }
                innerContent += logsHtml;

                detailTr.innerHTML = `<td colspan="3" class="p-0 w-full max-w-0">${innerContent}</td>`;
                tbody.appendChild(detailTr);
            });
        }

        // --- SUB-MODALS & ACTIONS ---

        function toggleOverlay(show) {
            const overlay = document.getElementById('modalOverlay');
            if(show) {
                overlay.classList.remove('hidden');
                setTimeout(() => overlay.classList.add('opacity-100'), 10);
            } else {
                overlay.classList.remove('opacity-100');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            }
        }

        function openModal(modalId) {
            toggleOverlay(true);
            document.getElementById(modalId).classList.add('active');
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
            toggleOverlay(false);
            if(modalId === 'imageModal') {
                setTimeout(() => { document.getElementById('fullscreenImg').src = ''; }, 300);
            }
        }

        function openFullscreenImg(src) {
            document.getElementById('fullscreenImg').src = src;
            openModal('imageModal');
        }

        function sanitizeDownloadFileName(value) {
            return String(value || 'sketch')
                .replace(/[\\/:*?"<>|]/g, '_')
                .replace(/\s+/g, '_')
                .slice(0, 80) || 'sketch';
        }

        function buildSketchDownloadFileName(order, sketch, sketchId) {
            const sketches = order?.sketches || [];
            const idx = Math.max(0, sketches.findIndex((s) => s.id === sketchId));
            const sketchNum = getSketchDisplayNumber(sketch, idx);
            const group = sanitizeDownloadFileName(getSketchGroupLabel(sketch, idx, order));
            return `${group}_sketch_${sketchNum}.jpg`;
        }

        function setSketchDownloadLoading(sketchId, isLoading) {
            const btn = document.getElementById(`sketch-dl-btn-${sketchId}`);
            if (!btn) return;
            btn.disabled = isLoading;
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('ph-download-simple', !isLoading);
                icon.classList.toggle('wd-spin', isLoading);
                if (isLoading) icon.classList.add('ph-arrows-clockwise');
                else icon.classList.remove('ph-arrows-clockwise');
            }
        }

        const __wdSketchDownloadTimeoutMs = 30000;

        function clearSketchDownloadPending(requestId) {
            const pending = __wdPendingSketchDownloads.get(requestId);
            if (!pending) return null;
            if (pending.timeoutId) clearTimeout(pending.timeoutId);
            __wdPendingSketchDownloads.delete(requestId);
            return pending;
        }

        function handleSketchDownloadAttribute(newValue) {
            if (!newValue) return;
            try {
                const payload = JSON.parse(newValue);
                const pending = payload.requestId
                    ? clearSketchDownloadPending(payload.requestId)
                    : null;
                if (pending?.sketchId) {
                    setSketchDownloadLoading(pending.sketchId, false);
                }

                if (payload.error) {
                    console.error('[workshops-dashboard] Sketch download failed:', payload.error);
                    alert('לא ניתן להוריד את הסקיצה כרגע.');
                    return;
                }

                if (!payload.url) return;

                const link = document.createElement('a');
                link.href = payload.url;
                link.target = '_blank';
                link.rel = 'noopener';
                if (pending?.fileName) link.download = pending.fileName;
                document.body.appendChild(link);
                link.click();
                link.remove();
            } catch (err) {
                console.error('[workshops-dashboard] Failed to handle sketch-download attribute:', err);
            }
        }

        function downloadSketchImage(orderId, sketchId, event) {
            if (event) event.stopPropagation();

            const order = mockOrders.find((o) => o.id === orderId);
            const sketch = order?.sketches?.find((s) => s.id === sketchId);
            const wixFileUrl = sketch?.wixFileUrl;
            if (!order || !wixFileUrl) {
                alert('לא ניתן להוריד את הסקיצה — חסר קישור מדיה של וויקס.');
                return;
            }

            const requestId = `dl_${++__wdDownloadRequestSeq}`;
            const fileName = buildSketchDownloadFileName(order, sketch, sketchId);
            const timeoutId = setTimeout(() => {
                const pending = clearSketchDownloadPending(requestId);
                if (pending?.sketchId) {
                    setSketchDownloadLoading(pending.sketchId, false);
                    alert('לא ניתן להוריד את הסקיצה כרגע.');
                }
            }, __wdSketchDownloadTimeoutMs);
            __wdPendingSketchDownloads.set(requestId, { sketchId, fileName, timeoutId });
            setSketchDownloadLoading(sketchId, true);

            dispatchDashboardAction('getSketchDownloadUrl', {
                requestId,
                sketchId,
                fileUrl: wixFileUrl,
                downloadedFileName: fileName,
            });
        }

        function scrollCarousel(orderId, offset, event) {
            if(event) event.stopPropagation();
            const container = document.getElementById(`carousel-${orderId}`);
            if(container) {
                container.scrollBy({ left: offset, behavior: 'smooth' });
            }
        }

        function updateSketchStatus(orderId, sketchId, newStatus, selectElement) {
            if (!hasDashboardPermission('editSketchStatus')) {
                alert('אין לך הרשאה לעדכן סטטוס סקיצה.');
                if (selectElement) renderCurrentSketchStatusSelect(selectElement, orderId, sketchId);
                return;
            }
            if (newStatus === 'לא מאושרת לביצוע') {
                if (!hasDashboardPermission('rejectSketchStatus')) {
                    alert('אין לך הרשאה לסמן סקיצה כ"לא מאושרת לביצוע".');
                    if (selectElement) renderCurrentSketchStatusSelect(selectElement, orderId, sketchId);
                    return;
                }
                unapprovedOrderId = orderId;
                unapprovedSketchId = sketchId;
                openModal('unapprovedModal');
                return; // halt actual update until confirmed
            }
            executeSketchStatusUpdate(orderId, sketchId, newStatus);
        }

        /** Reverts a sketch-status <select> back to the sketch's stored status (e.g. after a denied change). */
        function renderCurrentSketchStatusSelect(selectElement, orderId, sketchId) {
            const order = mockOrders.find(o => o.id === orderId);
            const sketch = order?.sketches?.find(s => s.id === sketchId);
            if (sketch) selectElement.value = sketch.status;
        }
        
        function closeUnapprovedModal() {
            closeModal('unapprovedModal');
            closeModal('unapprovedWaModal');
            // Re-render to revert the select UI if cancelled
            const w = mockWorkshops.find(x => x.id === currentWorkshopId);
            renderOrdersTable(currentWorkshopId, workshopTypes[w.type].requiresSketch);
            const row = document.getElementById(`detail-${unapprovedOrderId}`);
            const icon = document.getElementById(`icon-${unapprovedOrderId}`);
            if(row) {
                row.classList.remove('hidden');
                icon.classList.add('-rotate-90');
            }
        }

        function closeUnapprovedWaModal() {
            closeModal('unapprovedWaModal');
            closeUnapprovedModal();
        }

        function confirmUnapprovedDeleteWarning() {
            closeModal('unapprovedModal');
            populateUnapprovedWaModal();
            openModal('unapprovedWaModal');
        }

        function populateUnapprovedWaModal() {
            const select = document.getElementById('unapprovedWaTemplateSelect');
            const preview = document.getElementById('unapprovedWaPreviewText');
            if (!select || !preview) return;

            select.innerHTML = '<option value="">בחר/י תבנית...</option>';
            waTemplates.forEach((t) => {
                const systemMark = t.isSystem ? ' (מערכת)' : '';
                select.innerHTML += `<option value="${t.id}">${t.title}${systemMark}</option>`;
            });

            const defaultId = findRejectTemplateId();
            select.value = defaultId || '';
            updateUnapprovedWaPreview();
        }

        function updateUnapprovedWaPreview() {
            const tId = document.getElementById('unapprovedWaTemplateSelect')?.value;
            const preview = document.getElementById('unapprovedWaPreviewText');
            if (!preview) return;
            if (!tId) {
                preview.value = '';
                return;
            }
            preview.value = buildWhatsAppMessageForOrder(unapprovedOrderId, tId) || '';
        }

        function findRejectTemplateId() {
            const byTitle = waTemplates.find((t) => {
                const title = (t.title || '').toLowerCase();
                return title.includes('לא מאושר') || title.includes('סקיצה לא');
            });
            return byTitle?.id || waTemplates.find((t) => t.isSystem)?.id || null;
        }

        function buildWhatsAppMessageForOrder(orderId, templateId) {
            const template = waTemplates.find((t) => t.id === templateId);
            if (!template?.body) return null;

            const order = mockOrders.find((o) => o.id === orderId);
            const w = mockWorkshops.find((x) => x.id === order?.workshopId);
            const orderUrl = `https://www.studiohappy.art/user-selections?admin=${orderId}`;

            return template.body
                .replace(/{{Name}}/g, (order?.organizerName || '').split(' ')[0])
                .replace(/{{Date}}/g, w?.date || '')
                .replace(/{{Time}}/g, w?.time || '')
                .replace(/{{OrderUrl}}/g, orderUrl);
        }

        function confirmRejectSketch(sendWhatsApp) {
            let customMessage = null;
            if (sendWhatsApp) {
                customMessage = document.getElementById('unapprovedWaPreviewText')?.value?.trim() || '';
                if (!customMessage) {
                    alert('יש לבחור תבנית או להזין הודעה לפני השליחה.');
                    return;
                }
            }
            closeModal('unapprovedWaModal');
            executeRejectSketch(unapprovedOrderId, unapprovedSketchId, sendWhatsApp, customMessage);
        }

        function executeRejectSketch(orderId, sketchId, sendWhatsApp, customMessage) {
            const order = mockOrders.find(o => o.id === orderId);
            const sketch = order?.sketches?.find(s => s.id === sketchId);
            if (!order || !sketch) return;

            sketch.img = null;
            sketch.status = 'פתוח לשינויים';

            const logContext = formatSketchLogContext(order, sketch);
            const logAction = sendWhatsApp
                ? `${logContext} — לא אושרה, נמחקה ונשלחה הודעת וואטסאפ`
                : `${logContext} — לא אושרה, הסקיצה נמחקה`;
            addLog(orderId, logAction);

            dispatchDashboardAction('updateSketchState', {
                orderId,
                sketchId,
                newStatus: 'לא מאושרת לביצוע',
                sendWhatsApp: !!(sendWhatsApp && customMessage),
                customMessage: sendWhatsApp ? customMessage : null,
                expectedUpdatedDate: sketch.updatedDate || null,
            });

            const w = mockWorkshops.find(x => x.id === currentWorkshopId);
            let readySum = 0;
            mockOrders.filter(o => o.workshopId === w.id).forEach(o => {
                if(o.sketches) readySum += o.sketches.filter(s => s.status === 'מוכנה').length;
            });
            w.sketchesReady = readySum;

            renderOrdersTable(currentWorkshopId, workshopTypes[w.type].requiresSketch);
            const row = document.getElementById(`detail-${orderId}`);
            const icon = document.getElementById(`icon-${orderId}`);
            if(row) {
                row.classList.remove('hidden');
                icon.classList.add('-rotate-90');
            }
            applyFilters();
        }

        function executeDeleteSketch() {
            if (!hasDashboardPermission('deleteSketchImage')) {
                alert('אין לך הרשאה למחוק תמונת סקיצה.');
                closeModal('confirmModal');
                return;
            }
            const order = mockOrders.find(o => o.id === currentOrderId);
            const sketch = order.sketches.find(s => s.id === currentSketchId);
            
            sketch.img = null;
            sketch.status = 'פתוח לשינויים';
            addLog(currentOrderId, `${formatSketchLogContext(order, sketch)} — תמונת הסקיצה נמחקה על ידי העובד`);
            dispatchDashboardAction('deleteSketchImage', { orderId: currentOrderId, sketchId: currentSketchId });
            
            closeModal('confirmModal');
            
            const w = mockWorkshops.find(x => x.id === currentWorkshopId);
            let readySum = 0;
            mockOrders.filter(o => o.workshopId === w.id).forEach(o => {
                if(o.sketches) readySum += o.sketches.filter(s => s.status === 'מוכנה').length;
            });
            w.sketchesReady = readySum;

            renderOrdersTable(currentWorkshopId, workshopTypes[w.type].requiresSketch);
            
            const row = document.getElementById(`detail-${currentOrderId}`);
            const icon = document.getElementById(`icon-${currentOrderId}`);
            if(row) {
                row.classList.remove('hidden');
                icon.classList.add('-rotate-90');
            }
            
            applyFilters();
        }

        function executeSketchStatusUpdate(orderId, sketchId, newStatus) {
            const order = mockOrders.find(o => o.id === orderId);
            const sketch = order.sketches.find(s => s.id === sketchId);
            
            const expectedUpdatedDate = sketch.updatedDate || null;
            sketch.status = newStatus;
            addLog(orderId, `${formatSketchLogContext(order, sketch)} — סטטוס עודכן ל: ${newStatus}`);
            dispatchDashboardAction('updateSketchState', { orderId, sketchId, newStatus, expectedUpdatedDate });
            
            const w = mockWorkshops.find(x => x.id === currentWorkshopId);
            let readySum = 0;
            mockOrders.filter(o => o.workshopId === w.id).forEach(o => {
                if(o.sketches) readySum += o.sketches.filter(s => s.status === 'מוכנה').length;
            });
            w.sketchesReady = readySum;

            renderOrdersTable(currentWorkshopId, workshopTypes[w.type].requiresSketch);
            const row = document.getElementById(`detail-${orderId}`);
            const icon = document.getElementById(`icon-${orderId}`);
            if(row) {
                row.classList.remove('hidden');
                icon.classList.add('-rotate-90');
            }
        }

        function openWaModal(orderId, preselectTemplateId = null) {
            if (!hasDashboardPermission('sendWhatsApp')) {
                alert('אין לך הרשאה לשלוח הודעות WhatsApp.');
                return;
            }
            currentOrderId = orderId;
            const order = mockOrders.find(o => o.id === orderId);
            document.getElementById('waCustomerName').innerText = order.organizerName || 'ללא שם';
            
            const select = document.getElementById('waTemplateSelect');
            select.innerHTML = '<option value="">בחר/י תבנית...</option>';
            waTemplates.forEach(t => { 
                const systemMark = t.isSystem ? ' (מערכת)' : '';
                select.innerHTML += `<option value="${t.id}">${t.title}${systemMark}</option>`; 
            });
            
            if (preselectTemplateId) {
                select.value = preselectTemplateId;
            } else {
                select.value = '';
            }
            updateWaPreview();
            
            openModal('waModal');
        }

        function updateWaPreview() {
            const tId = document.getElementById('waTemplateSelect').value;
            if(!tId) { document.getElementById('waPreviewText').value = ''; return; }
            
            const template = waTemplates.find(t => t.id === tId).body;
            const order = mockOrders.find(o => o.id === currentOrderId);
            const w = mockWorkshops.find(x => x.id === order.workshopId);
            const mockOrderUrl = `https://studio.co.il/order/${order.id}`;

            document.getElementById('waPreviewText').value = template
                .replace(/{{Name}}/g, (order.organizerName || '').split(' ')[0])
                .replace(/{{Date}}/g, w.date)
                .replace(/{{Time}}/g, w.time)
                .replace(/{{OrderUrl}}/g, mockOrderUrl);
        }

        function sendWhatsApp() {
            if (!hasDashboardPermission('sendWhatsApp')) {
                alert('אין לך הרשאה לשלוח הודעות WhatsApp.');
                closeModal('waModal');
                return;
            }
            const msg = document.getElementById('waPreviewText').value;
            if(!msg) return;
            const order = mockOrders.find(o => o.id === currentOrderId);
            
            const tId = document.getElementById('waTemplateSelect').value;
            const template = waTemplates.find(t => t.id === tId);
            const templateName = template ? template.title : "הודעה מותאמת אישית";
            
            addLog(currentOrderId, 'נשלחה הודעת וואטסאפ - ' + templateName);
            dispatchDashboardAction('sendWhatsApp', {
                orderId: currentOrderId,
                phone: order.organizerPhone,
                templateId: tId || null,
                customMessage: msg,
            });
            closeModal('waModal');
            
            // Refresh inline log to show the new message sent action
            const w = mockWorkshops.find(x => x.id === currentWorkshopId);
            renderOrdersTable(currentWorkshopId, workshopTypes[w.type].requiresSketch);
            const row = document.getElementById(`detail-${currentOrderId}`);
            const icon = document.getElementById(`icon-${currentOrderId}`);
            if(row) {
                row.classList.remove('hidden');
                icon.classList.add('-rotate-90');
            }
        }

        function getCurrentActorName() {
            return (currentDashboardUser && currentDashboardUser.name) ? currentDashboardUser.name : 'מערכת';
        }

        function formatClientLogTime(date = new Date()) {
            const d = date instanceof Date ? date : new Date(date);
            const day = d.getDate().toString().padStart(2, '0');
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const hours = d.getHours().toString().padStart(2, '0');
            const minutes = d.getMinutes().toString().padStart(2, '0');
            return `${day}/${month} ${hours}:${minutes}`;
        }

        function addLog(orderId, actionText) {
            const order = mockOrders.find(o => o.id === orderId);
            if (!order) return;
            const timeStr = formatClientLogTime();
            const userName = getCurrentActorName();
            if (!order.logs) order.logs = [];
            order.logs.unshift({ time: timeStr, user: userName, action: actionText });
            console.log(`[workshops-dashboard] ${timeStr} • ${userName}: ${actionText}`);
        }

        function openNoteModal(orderId) {
            currentOrderId = orderId;
            const canEdit = hasDashboardPermission('editOrderNotes');
            const textEl = document.getElementById('newNoteText');
            const saveBtn = document.getElementById('saveNoteBtn');
            textEl.value = mockOrders.find(o => o.id === orderId).notes || '';
            textEl.readOnly = !canEdit;
            textEl.classList.toggle('bg-gray-100', !canEdit);
            if (saveBtn) saveBtn.classList.toggle('hidden', !canEdit);
            openModal('noteModal');
        }

        function saveNote() {
            if (!hasDashboardPermission('editOrderNotes')) {
                alert('אין לך הרשאה לעדכן הערות הזמנה.');
                return;
            }
            const note = document.getElementById('newNoteText').value;
            mockOrders.find(o => o.id === currentOrderId).notes = note;
            addLog(currentOrderId, 'הערת הזמנה עודכנה.');
            dispatchDashboardAction('updateOrderInternalNotes', { orderId: currentOrderId, text: note });
            closeModal('noteModal');
            
            const w = mockWorkshops.find(x => x.id === currentWorkshopId);
            renderOrdersTable(currentWorkshopId, workshopTypes[w.type].requiresSketch);
            
            const row = document.getElementById(`detail-${currentOrderId}`);
            const icon = document.getElementById(`icon-${currentOrderId}`);
            if(row) {
                row.classList.remove('hidden');
                icon.classList.add('-rotate-90');
            }
        }

        function openTemplatesManager() {
            if (!hasDashboardPermission('manageTemplates')) {
                alert('אין לך הרשאה לנהל תבניות הודעה.');
                return;
            }
            openModal('templatesModal');
        }

        function renderTemplatesManager() {
            const container = document.getElementById('templatesList');
            container.innerHTML = '';
            waTemplates.forEach(t => {
                const systemBadge = t.isSystem ? `<span class="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-xs ml-2 font-medium">תבנית מערכת</span>` : '';
                const editBtn = t.isSystem ? 
                    `<i class="ph ph-lock-key text-gray-300 text-lg" title="לא ניתן לערוך או למחוק תבניות מערכת"></i>` : 
                    `<button onclick="openTemplateEditor('${t.id}')" class="text-gray-400 hover:text-primary transition-colors" title="ערוך"><i class="ph ph-pencil-simple text-lg"></i></button>`;
                
                container.innerHTML += `
                <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col gap-2 relative">
                    <h4 class="font-bold text-gray-800 flex items-center">${t.title} ${systemBadge}</h4>
                    <p class="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-100">${t.body}</p>
                    <div class="absolute top-4 left-4 flex gap-2">
                        ${editBtn}
                    </div>
                </div>`;
            });
        }
        
        function openTemplateEditor(templateId = null) {
            const modalTitle = document.getElementById('templateEditTitle');
            const nameInput = document.getElementById('editTemplateName');
            const bodyInput = document.getElementById('editTemplateBody');
            const idInput = document.getElementById('editTemplateId');
            const deleteBtn = document.getElementById('deleteTemplateBtn');

            if (templateId) {
                const t = waTemplates.find(x => x.id === templateId);
                modalTitle.innerText = 'עריכת תבנית';
                nameInput.value = t.title;
                bodyInput.value = t.body;
                idInput.value = t.id;
                deleteBtn.classList.remove('hidden');
            } else {
                modalTitle.innerText = 'יצירת תבנית חדשה';
                nameInput.value = '';
                bodyInput.value = '';
                idInput.value = '';
                deleteBtn.classList.add('hidden');
            }

            openModal('templateEditModal');
        }

        function closeTemplateEditor() {
            closeModal('templateEditModal');
        }

        function saveTemplate() {
            if (!hasDashboardPermission('manageTemplates')) {
                alert('אין לך הרשאה לנהל תבניות הודעה.');
                return;
            }
            const id = document.getElementById('editTemplateId').value;
            const title = document.getElementById('editTemplateName').value.trim();
            const body = document.getElementById('editTemplateBody').value.trim();

            if (!title || !body) {
                return; // basic validation
            }

            if (id) {
                const t = waTemplates.find(x => x.id === id);
                if (t && !t.isSystem) {
                    t.title = title;
                    t.body = body;
                }
            } else {
                waTemplates.push({
                    id: 't_custom_' + Date.now(),
                    title: title,
                    body: body,
                    isSystem: false
                });
            }

            dispatchDashboardAction('saveTemplate', { id: id || null, title, body });
            renderTemplatesManager();
            closeTemplateEditor();
        }

        function deleteTemplate() {
            if (!hasDashboardPermission('manageTemplates')) {
                alert('אין לך הרשאה לנהל תבניות הודעה.');
                return;
            }
            const id = document.getElementById('editTemplateId').value;
            const index = waTemplates.findIndex(x => x.id === id);
            
            if (index > -1 && !waTemplates[index].isSystem) {
                waTemplates.splice(index, 1);
            }
            
            dispatchDashboardAction('deleteTemplate', { id });
            renderTemplatesManager();
            closeTemplateEditor();
        }

// ============================================================
// ===================  צוות ומשמרות (Phase 2, Module B core)  ===================
// ============================================================
// Isolated, additive module: does not read/write any of the order-management
// state above. All functions/ids are prefixed sa*/Sa/StaffAdmin to avoid clashes.
(function () {
    let saCurrentView = 'list';
    let saData = null;
    let saMonthKey = new Date().toISOString().slice(0, 7);
    let saNudgeTargetIds = [];

    function currentMonthInputValue() {
        const el = document.getElementById('saMonthPicker');
        return (el && el.value) || saMonthKey;
    }

    window.switchDashboardTab = function (tab) {
        const ordersMain = document.getElementById('wdOrdersMain');
        const staffSection = document.getElementById('wdStaffAdminSection');
        const ordersBtn = document.getElementById('wdTabOrdersBtn');
        const staffBtn = document.getElementById('wdTabStaffBtn');
        if (!ordersMain || !staffSection) return;

        const showStaff = tab === 'staff';
        ordersMain.classList.toggle('hidden', showStaff);
        staffSection.classList.toggle('hidden', !showStaff);
        if (ordersBtn) {
            ordersBtn.classList.toggle('bg-white', !showStaff);
            ordersBtn.classList.toggle('shadow-sm', !showStaff);
            ordersBtn.classList.toggle('text-primary', !showStaff);
            ordersBtn.classList.toggle('text-gray-600', showStaff);
        }
        if (staffBtn) {
            staffBtn.classList.toggle('bg-white', showStaff);
            staffBtn.classList.toggle('shadow-sm', showStaff);
            staffBtn.classList.toggle('text-primary', showStaff);
            staffBtn.classList.toggle('text-gray-600', !showStaff);
        }

        if (showStaff && !saData) {
            const monthEl = document.getElementById('saMonthPicker');
            if (monthEl && !monthEl.value) monthEl.value = saMonthKey;
            loadStaffAdminTab();
        }
    };

    function loadStaffAdminTab() {
        saMonthKey = currentMonthInputValue();
        if (window.__wdStaffDebug) window.__wdStaffDebug('load requested', { monthKey: saMonthKey });
        dispatchDashboardAction('staffAdmin:load', { monthKey: saMonthKey });
    }
    window.refreshStaffAdminTab = loadStaffAdminTab;
    window.onStaffAdminMonthChange = loadStaffAdminTab;

    window.setStaffAdminView = function (view) {
        saCurrentView = view;
        ['saViewListBtn', 'saViewHeatmapBtn', 'saViewEmployeesBtn'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const active = id === `saView${view.charAt(0).toUpperCase()}${view.slice(1)}Btn`;
            btn.classList.toggle('bg-white', active);
            btn.classList.toggle('shadow-sm', active);
            btn.classList.toggle('text-primary', active);
            btn.classList.toggle('text-gray-600', !active);
        });
        renderStaffAdminContent();
    };

    const COVERAGE_LABELS = {
        FULL: 'מכוסה', PARTIAL: 'חלקי', NONE: 'ללא הגשות',
        NO_WORKSHOPS: 'אין סדנאות', HOLIDAY: 'חג',
    };
    const COVERAGE_COLORS = {
        FULL: '#DCFCE7', PARTIAL: '#FEF9C3', NONE: '#FEE2E2',
        NO_WORKSHOPS: '#F3F4F6', HOLIDAY: '#E0E7FF',
    };

    function formatDateHe(dateKey) {
        const d = new Date(`${dateKey}T12:00:00Z`);
        return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    }

    function renderStaffHeatmap() {
        if (!saData) return '';
        const cells = saData.days.map(day => `
            <div class="rounded-lg border border-gray-200 p-2 text-center text-xs flex flex-col gap-1" style="background:${COVERAGE_COLORS[day.coverage] || '#fff'}" title="${day.workshopCount} סדנאות, ${day.submittedCount} הגישו">
                <strong>${formatDateHe(day.date)}</strong>
                <span>${COVERAGE_LABELS[day.coverage] || day.coverage}</span>
                ${day.workshopCount ? `<span class="text-gray-500">${day.submittedCount}/${day.workshopCount * 2}</span>` : ''}
            </div>
        `).join('');
        return `<div class="grid grid-cols-7 gap-2">${cells}</div>`;
    }

    function renderStaffList() {
        if (!saData) return '';
        if (!saData.upcomingWorkshops.length) {
            return '<p class="text-sm text-gray-400 text-center py-10">אין סדנאות קרובות בחודש זה.</p>';
        }
        const rows = saData.upcomingWorkshops.map(w => {
            const candidates = w.candidateEmployees.length
                ? w.candidateEmployees.map(c => `<span class="px-2 py-0.5 bg-gray-100 rounded-md text-xs">${c.name}</span>`).join(' ')
                : '<span class="text-xs text-red-500">אין עדיין מועמדים</span>';
            const dateStr = new Date(w.workshopStart).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `
                <tr class="border-b border-gray-100">
                    <td class="px-4 py-3 text-sm font-medium text-gray-700">${dateStr}</td>
                    <td class="px-4 py-3 text-sm text-gray-600">${w.organizerName || ''}</td>
                    <td class="px-4 py-3 text-sm text-gray-600">${w.adults + w.children}</td>
                    <td class="px-4 py-3 flex flex-wrap gap-1">${candidates}</td>
                </tr>`;
        }).join('');
        return `
            <table class="w-full text-right">
                <thead><tr class="text-xs text-gray-500 border-b border-gray-200">
                    <th class="px-4 py-2">תאריך ושעה</th><th class="px-4 py-2">מזמין/ה</th><th class="px-4 py-2">משתתפים</th><th class="px-4 py-2">מועמדים למשמרת</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function renderStaffEmployees() {
        if (!saData) return '';
        const rows = saData.employees.map(e => `
            <tr class="border-b border-gray-100">
                <td class="px-4 py-3 text-sm font-medium text-gray-700 flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full inline-block" style="background:${e.color || '#ccc'}"></span>${e.displayName}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500">${e.roleLabel}${e.isTrainee ? ' (חניכה)' : ''}</td>
                <td class="px-4 py-3 text-xs text-gray-600">${e.skills.map(s => s.name).join(', ') || '—'}</td>
                <td class="px-4 py-3 text-xs text-gray-600">${e.minShiftsPerMonth ?? '—'}</td>
                <td class="px-4 py-3 text-xs">${e.active ? '<span class="text-green-600">פעיל/ה</span>' : '<span class="text-gray-400">לא פעיל/ה</span>'}</td>
                <td class="px-4 py-3 flex items-center gap-2">
                    <input type="checkbox" class="sa-emp-check" data-id="${e.id}">
                    <button onclick="openStaffEmployeeModal('${e.id}')" class="text-xs text-primary hover:underline">עריכה</button>
                </td>
            </tr>`).join('');
        return `
            <div class="flex justify-end mb-3">
                <button onclick="openStaffNudgeModal('selected')" class="text-sm bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <i class="ph ph-whatsapp-logo"></i> שלח תזכורת לנבחרים
                </button>
            </div>
            <table class="w-full text-right">
                <thead><tr class="text-xs text-gray-500 border-b border-gray-200">
                    <th class="px-4 py-2">שם</th><th class="px-4 py-2">תפקיד</th><th class="px-4 py-2">סקילים</th><th class="px-4 py-2">מכסה חודשית</th><th class="px-4 py-2">סטטוס</th><th class="px-4 py-2"></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function renderStaffAdminContent() {
        const container = document.getElementById('saContentContainer');
        if (!container) return;
        if (!saData) {
            container.innerHTML = '<p class="text-sm text-gray-400 text-center py-10">טוען נתוני צוות...</p>';
            return;
        }
        if (saCurrentView === 'heatmap') container.innerHTML = renderStaffHeatmap();
        else if (saCurrentView === 'employees') container.innerHTML = renderStaffEmployees();
        else container.innerHTML = renderStaffList();
    }

    window.renderStaffAdminData = function (data) {
        if (data && data.error) {
            if (window.__wdStaffDebug) window.__wdStaffDebug('load failed', { message: data.message || 'unknown' });
            const container = document.getElementById('saContentContainer');
            if (container) container.innerHTML = '<p class="text-sm text-red-500 text-center py-10">אין הרשאה לצפות בנתוני צוות.</p>';
            return;
        }
        if (window.__wdStaffDebug) {
            window.__wdStaffDebug('load ok', {
                monthKey: data?.monthKey,
                employees: data?.employees?.length ?? 0,
                days: data?.days?.length ?? 0,
                workshops: data?.upcomingWorkshops?.length ?? 0,
            });
        }
        saData = data;
        renderStaffAdminContent();
    };

    window.handleStaffAdminActionResult = function (result) {
        if (result.type === 'sendAvailabilityNudge') {
            closeModal('saNudgeModal');
            const skippedCount = (result.skipped || []).length;
            alert(`נשלחו ${result.sent || 0} הודעות.${skippedCount ? ` דילוג על ${skippedCount} (ללא טלפון/שגיאה).` : ''}`);
        }
        if (result.type === 'updateEmployeeProfile') {
            closeModal('saEmployeeModal');
        }
    };

    window.openStaffEmployeeModal = function (id) {
        const emp = (saData?.employees || []).find(e => e.id === id);
        if (!emp) return;
        document.getElementById('saEmpId').value = emp.id;
        document.getElementById('saEmployeeModalTitle').innerText = `עריכת ${emp.displayName}`;
        document.getElementById('saEmpMinShifts').value = emp.minShiftsPerMonth ?? '';
        document.getElementById('saEmpMinHours').value = emp.minShiftHours ?? '';
        document.getElementById('saEmpColor').value = emp.color || '#6B7280';
        document.getElementById('saEmpPriorityRank').value = emp.priorityRank ?? '';
        document.getElementById('saEmpPhone').value = emp.phone || '';
        document.getElementById('saEmpActive').checked = !!emp.active;
        openModal('saEmployeeModal');
    };

    window.saveStaffEmployee = function () {
        const id = document.getElementById('saEmpId').value;
        if (!id) return;
        const patch = {
            minShiftsPerMonth: Number(document.getElementById('saEmpMinShifts').value) || null,
            minShiftHours: Number(document.getElementById('saEmpMinHours').value) || null,
            color: document.getElementById('saEmpColor').value || null,
            priorityRank: Number(document.getElementById('saEmpPriorityRank').value) || null,
            phone: document.getElementById('saEmpPhone').value.trim(),
            active: document.getElementById('saEmpActive').checked,
        };
        dispatchDashboardAction('staffAdmin:updateEmployee', { id, patch });
    };

    window.openStaffNudgeModal = function (mode) {
        if (mode === 'selected') {
            saNudgeTargetIds = Array.from(document.querySelectorAll('.sa-emp-check:checked')).map(el => el.dataset.id);
        } else {
            saNudgeTargetIds = (saData?.employees || []).filter(e => e.active).map(e => e.id);
        }
        if (!saNudgeTargetIds.length) {
            alert('לא נבחרו עובדים.');
            return;
        }
        document.getElementById('saNudgeTargetLabel').innerText = `נמענים: ${saNudgeTargetIds.length} עובדים`;
        document.getElementById('saNudgeText').value = 'היי! תזכורת קטנה להגיש זמינות למשמרות החודש הקרוב 😊';
        openModal('saNudgeModal');
    };

    window.sendStaffNudge = function () {
        const text = document.getElementById('saNudgeText').value.trim();
        if (!text || !saNudgeTargetIds.length) return;
        dispatchDashboardAction('staffAdmin:sendNudge', { roleIds: saNudgeTargetIds, message: text });
    };
})();

// ============================================================
// ===  חשיפה מפורשת ל-window - חובה עבור onclick="..." בתוך ה-HTML  ===
// ============================================================
window.applyFilters = applyFilters;
window.onFilterInputChange = onFilterInputChange;
window.clearFilters = clearFilters;
window.toggleFiltersPanel = toggleFiltersPanel;
window.__wdGoToPage = __wdGoToPage;
window.closeModal = closeModal;
window.closeSidePanel = closeSidePanel;
window.closeTemplateEditor = closeTemplateEditor;
window.closeUnapprovedModal = closeUnapprovedModal;
window.closeUnapprovedWaModal = closeUnapprovedWaModal;
window.confirmUnapprovedDeleteWarning = confirmUnapprovedDeleteWarning;
window.confirmRejectSketch = confirmRejectSketch;
window.updateUnapprovedWaPreview = updateUnapprovedWaPreview;
window.deleteTemplate = deleteTemplate;
window.downloadSketchImage = downloadSketchImage;
window.openFullscreenImg = openFullscreenImg;
window.openNoteModal = openNoteModal;
window.openTemplateEditor = openTemplateEditor;
window.openTemplatesManager = openTemplatesManager;
window.openWaModal = openWaModal;
window.refreshDashboard = refreshDashboard;
window.saveNote = saveNote;
window.saveTemplate = saveTemplate;
window.scrollCarousel = scrollCarousel;
window.sendWhatsApp = sendWhatsApp;
window.onShowAllOrdersChange = onShowAllOrdersChange;
window.onDateRangeFilterChange = onDateRangeFilterChange;
window.toggleAlertFilter = toggleAlertFilter;
window.toggleInlineLogs = toggleInlineLogs;
window.updateSketchStatus = updateSketchStatus;
window.updateWaPreview = updateWaPreview;


// ============================================================
// ===================  רישום ה-Custom Element  ===================
// ============================================================
class WorkshopsDashboardElement extends HTMLElement {
    static get observedAttributes() {
        return ['dashboard-data', 'sketch-download', 'action-error', 'staff-admin-data', 'staff-admin-action-result'];
    }

    connectedCallback() {
        __wdInjectGlobalAssets();
        __wdHostElement = this;

        // בקובץ המקורי ה-RTL הוגדר על תגית ה-<html> (dir="rtl").
        // כשהתוכן רץ בתוך עמוד וויקס שאינו RTL כברירת מחדל, זה גורם
        // להיפוך של סדר עמודות בטבלאות/flex (גם אם הקלאסים text-right/text-left נשארים).
        // לכן קובעים RTL ישירות על האלמנט עצמו:
        this.setAttribute('dir', 'rtl');
        this.setAttribute('lang', 'he');

        // מציגים קודם את מסך הטעינה + את תוכן הדאשבורד (מוסתר מתחתיו),
        // כדי שהנתונים כבר יהיו מוכנים ברגע שמסך הטעינה נעלם.
        this.innerHTML = __wdLoadingHtml + __wdTemplateHtml;
        console.log('[staff-admin] connectedCallback', {
            hasStaffTabBtn: !!this.querySelector('#wdTabStaffBtn'),
            hasStaffSection: !!this.querySelector('#wdStaffAdminSection'),
        });

        // ממתינים לפריים הבא כדי לוודא שה-DOM התייצב וש-Tailwind
        // ביצע סריקה ראשונית, ורק אז מריצים את פונקציית האתחול המקורית
        requestAnimationFrame(function () {
            if (typeof init === 'function') {
                init();
            }
            // אם הנתונים כבר הגיעו (attributeChangedCallback רץ לפני ש-innerHTML
            // הוזרק ל-DOM), מציגים אותם כעת שה-DOM מוכן.
            if (__wdAccessDenied) {
                __wdShowAccessDenied();
            } else if (__wdDataLoaded) {
                renderCurrentUser();
                populateFilterOptions();
                applyFilters();
                renderTemplatesManager();
                __wdHideLoadingOverlay();
            }
        });

        // אם התכונה dashboard-data כבר הוגדרה לפני החיבור ל-DOM, אין
        // attributeChangedCallback שיירוץ מחדש — קוראים לנתונים ישירות.
        const existing = this.getAttribute('dashboard-data');
        if (existing) {
            this.attributeChangedCallback('dashboard-data', null, existing);
        }
    }

    disconnectedCallback() {
        stopAutoDataRefresh();
        clearRefreshSafetyTimer();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'sketch-download') {
            if (!newValue || newValue === oldValue) return;
            handleSketchDownloadAttribute(newValue);
            return;
        }

        if (name === 'action-error') {
            if (!newValue || newValue === oldValue) return;
            try {
                const info = JSON.parse(newValue);
                if (info?.message) alert(info.message);
            } catch (err) {
                console.error('[workshops-dashboard] Failed to parse action-error attribute:', err);
            }
            return;
        }

        if (name === 'staff-admin-data') {
            if (!newValue || newValue === oldValue) return;
            try {
                if (typeof window.renderStaffAdminData === 'function') window.renderStaffAdminData(JSON.parse(newValue));
            } catch (err) {
                console.error('[workshops-dashboard] Failed to parse staff-admin-data attribute:', err);
            }
            return;
        }

        if (name === 'staff-admin-action-result') {
            if (!newValue || newValue === oldValue) return;
            try {
                if (typeof window.handleStaffAdminActionResult === 'function') window.handleStaffAdminActionResult(JSON.parse(newValue));
            } catch (err) {
                console.error('[workshops-dashboard] Failed to parse staff-admin-action-result attribute:', err);
            }
            return;
        }

        if (name !== 'dashboard-data' || !newValue) return;
        if (newValue === oldValue) return;
        const isDuplicateJson = newValue === __wdLastDataJson;
        if (isDuplicateJson && !__wdIsDataRefreshing) return;
        __wdLastDataJson = newValue;
        try {
            const data = JSON.parse(newValue);
            const isLightRefreshPayload = !!(data && data.refreshOnly);
            if (data && typeof data === 'object') {
                delete data.__fetchedAt;
                delete data.refreshOnly;
            }
            if (isDuplicateJson && __wdIsDataRefreshing) {
                __wdLastDataRefreshAt = new Date();
                renderLastDataRefreshLabel();
                clearRefreshSafetyTimer();
                setDataRefreshLoading(false);
                return;
            }
            applyDashboardData(data, { isLightRefresh: isLightRefreshPayload });
        } catch (err) {
            console.error('[workshops-dashboard] Failed to parse dashboard-data attribute:', err);
            clearRefreshSafetyTimer();
            setDataRefreshLoading(false);
        }
    }
}

if (!customElements.get(__wdTagName)) {
    customElements.define(__wdTagName, WorkshopsDashboardElement);
}

// Always-on boot marker — if you don't see this in the browser console, the CE
// file on the live site was NOT updated (Publish alone does not refresh uploaded CE files).
console.log('[staff-admin] CE build loaded', '2026-07-28-staff-tab-v2');