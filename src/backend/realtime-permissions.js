/**
 * Realtime channel permissions (Velo standard file).
 * `scheduling-updates` carries no sensitive payloads (reason + date only);
 * subscribed clients re-fetch their own permission-filtered data.
 */
export function realtime_check_permission(channel, subscriber) {
    if (channel.name === 'scheduling-updates') {
        return { read: !!subscriber?.id }; // logged-in members only
    }
    return { read: false };
}
