/**
 * Shift confirmation web methods (Module D) — the token in the WhatsApp link
 * is the authentication (Permissions.Anyone, validated in shiftConfirmations).
 * Used by the shift-confirm Velo page.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { getShiftDetailsByToken, respondByToken } from 'backend/shiftConfirmations.js';

export const getShiftByToken = webMethod(Permissions.Anyone, async (token) => {
    const details = await getShiftDetailsByToken(token);
    if (!details) throw new Error('NOT_FOUND: הקישור אינו תקף.');
    return details;
});

/** @param {string} action 'confirm' | 'cancel' */
export const respondToShift = webMethod(Permissions.Anyone, async (token, action, notes) => {
    if (action !== 'confirm' && action !== 'cancel') {
        throw new Error('BAD_REQUEST: פעולה לא מוכרת.');
    }
    return respondByToken(token, action === 'confirm', notes);
});
