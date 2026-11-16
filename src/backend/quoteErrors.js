// Live sites mask thrown web-method errors ("Unable to handle the request"), so errors travel back as data.
const TAG_RE = /^(VALIDATION|NOT_FOUND|ACCESS_DENIED|STATE|PAYMENT):/;

/** Wraps a web-method handler: thrown errors resolve to { __error }. Untagged errors are shown only when exposeRaw. */
export const guard = (fn, { exposeRaw = true } = {}) => async (...args) => {
    try {
        return await fn(...args);
    } catch (err) {
        const msg = String(err?.message || err || '').trim();
        console.error('[quotes] web method failed:', msg, err?.stack || '');
        if (TAG_RE.test(msg)) return { __error: msg };
        return { __error: exposeRaw ? `VALIDATION:שגיאת שרת: ${msg.slice(0, 300) || 'לא ידועה'}` : 'STATE:אירעה שגיאה. נסו שוב או פנו אלינו.' };
    }
};
