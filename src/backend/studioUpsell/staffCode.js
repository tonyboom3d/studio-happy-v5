/**
 * studioUpsell/staffCode.js — deterministic 4-digit confirmation code shown
 * to the customer on the Thank You page and cross-checked by on-site staff.
 * No extra persistence needed: the same order id always yields the same code.
 */
export function generateStaffCode(seed) {
    const str = String(seed || Date.now());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return String(hash % 10000).padStart(4, '0');
}
