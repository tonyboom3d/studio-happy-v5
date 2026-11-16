// Live sites mask thrown web-method errors ("Unable to handle the request"), so errors travel back as data.
const TAG_RE = /^(VALIDATION|NOT_FOUND|ACCESS_DENIED|STATE|PAYMENT):/;

/** Caught error -> { __error }. Untagged errors are shown only when exposeRaw. */
export function quoteError(err, { exposeRaw = true } = {}) {
    const msg = String(err?.message || err || '').trim();
    console.error('[quotes] web method failed:', msg);
    if (TAG_RE.test(msg)) return { __error: msg };
    return { __error: exposeRaw ? `VALIDATION:שגיאת שרת: ${msg.slice(0, 300) || 'לא ידועה'}` : 'STATE:אירעה שגיאה. נסו שוב או פנו אלינו.' };
}
