// Server-only quote amount math. Never trust client-sent totals.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function sumExtras(extras) {
    return round2((Array.isArray(extras) ? extras : []).reduce((s, e) => s + (Number(e?.price) || 0), 0));
}

/** Children only. Adults/companions are not part of the price. */
export function childCount(participants) {
    const n = parseInt(participants, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Workshop + add-ons, per child. */
export function unitPrice(basePrice, extras) {
    return round2((Number(basePrice) || 0) + sumExtras(extras));
}

/**
 * total = priceOverride (full amount, if set) else (workshop + add-ons) × children.
 * deposit: 'fixed' (₪) or 'percent' (1-100). Returns amounts + validation error (Hebrew) if any.
 */
export function computeAmounts({ basePrice, extras, participants, priceOverride, depositType, depositValue }) {
    const kids = childCount(participants);
    const unit = unitPrice(basePrice, extras);
    const hasOverride = priceOverride !== null && priceOverride !== undefined && priceOverride !== '';
    const total = round2(hasOverride ? Number(priceOverride) : unit * kids);
    const type = depositType === 'fixed' ? 'fixed' : 'percent';
    const value = Number(depositValue) || 0;

    let error = null;
    if (!hasOverride && unit > 0 && kids < 1) error = 'יש להזין מספר ילדים. מלווים לא נספרים במחיר.';
    if (total < 0) error = 'הסכום הכולל אינו תקין.';
    if (type === 'percent' && (value < 0 || value > 100)) error = 'אחוז המקדמה חייב להיות בין 0 ל-100.';
    if (type === 'fixed' && value > total) error = 'המקדמה גבוהה מהסכום הכולל.';

    const depositAmount = round2(type === 'percent' ? (total * value) / 100 : Math.min(value, total));
    return {
        totalAmount: total,
        depositType: type,
        depositValue: value,
        depositAmount,
        balanceAmount: round2(total - depositAmount),
        error,
    };
}
