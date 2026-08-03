/**
 * Shared sketch-status vocabulary used by both the customer-facing booking flow
 * (bookingService.web.js) and the staff dashboard (dashboardService.web.js).
 *
 * SketchSelections.sketchStatus is a free-text field. Older records used
 * 'Changeable' / 'סקיצה מוכנה' — normalizeSketchStatus() maps those to the
 * current 4-state vocabulary so both old and new records render correctly.
 */

export const SKETCH_STATUS = {
    OPEN: 'פתוח לשינויים',
    PREPARING: 'בהכנה',
    READY: 'מוכנה',
    REJECTED: 'לא מאושרת לביצוע',
};

export const SKETCH_STATUSES = Object.values(SKETCH_STATUS);

const LEGACY_MAP = {
    Changeable: SKETCH_STATUS.OPEN,
    'סקיצה מוכנה': SKETCH_STATUS.READY,
};

export function normalizeSketchStatus(status) {
    if (!status) return SKETCH_STATUS.OPEN;
    if (LEGACY_MAP[status]) return LEGACY_MAP[status];
    if (SKETCH_STATUSES.includes(status)) return status;
    return SKETCH_STATUS.OPEN;
}

/** Statuses where the customer-facing selection flow is locked (staff owns the sketch). */
export function isLockedStatus(status) {
    const normalized = normalizeSketchStatus(status);
    return normalized === SKETCH_STATUS.READY || normalized === SKETCH_STATUS.PREPARING;
}

/** Statuses where the customer is allowed to (re-)select a sketch. */
export function isEditableStatus(status) {
    return !isLockedStatus(status);
}

/** Stable identity for catalog / AI sketches when enforcing locked minimum counts. */
export function getSelectionDesignKey(sel) {
    if (!sel) return null;
    if (sel.source === 'ai' || sel.aiTaskId) {
        return `ai:${sel.aiTaskId || `rug-${sel.rugIndex}`}`;
    }
    if (sel.productId) return `catalog:${sel.productId}`;
    return `rug-${sel.rugIndex}`;
}

export function computeLockedDesignCounts(selections) {
    const counts = {};
    (selections || []).forEach((sel) => {
        if (!isLockedStatus(sel?.sketchStatus)) return;
        const key = getSelectionDesignKey(sel);
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

export function computeDesignCounts(selections) {
    const counts = {};
    (selections || []).forEach((sel) => {
        const key = getSelectionDesignKey(sel);
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

/**
 * @typedef {Object} LockedMinimumCheckOpts
 * @property {number} [rugIndex]
 * @property {object} [replacement]
 */

/**
 * Returns locked minimum violation after hypothetically replacing one rug slot.
 * @param {any[]} selections
 * @param {LockedMinimumCheckOpts} [checkOpts]
 */
export function wouldViolateLockedMinimum(selections, checkOpts = {}) {
    const rugIndex = checkOpts.rugIndex;
    const replacement = checkOpts.replacement;
    const lockedMins = computeLockedDesignCounts(selections);
    const after = (selections || []).filter((s) => s.rugIndex !== rugIndex);
    if (replacement) after.push(replacement);
    const afterCounts = computeDesignCounts(after);
    for (const [key, min] of Object.entries(lockedMins)) {
        if ((afterCounts[key] || 0) < min) {
            return { violated: true, designKey: key, minimum: min, actual: afterCounts[key] || 0 };
        }
    }
    return { violated: false };
}
