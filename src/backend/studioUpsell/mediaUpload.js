/**
 * studioUpsell/mediaUpload.js — uploads add-on images to the Wix Media
 * Manager (instead of accepting arbitrary external "open" URLs), so images
 * are served from Wix's own CDN and stay valid/optimizable long-term.
 *
 * Canonical storage format: the `wix:image://...` fileUrl returned by
 * mediaManager.upload() — the same value Wix's own Image field would store.
 * A `publicUrl` (https://static.wixstatic.com/media/...) is also returned
 * for immediate <img> preview use, but is never persisted to CMS.
 */
import { mediaManager } from 'wix-media-backend';

const UPLOAD_FOLDER = '/studio-happy/studio-upsell-addons';
const MAX_BYTES = 8 * 1024 * 1024; // 8MB safety cap for admin-uploaded add-on images.

function inferImageMimeType(filename) {
    if (/\.jpe?g$/i.test(filename || '')) return 'image/jpeg';
    if (/\.webp$/i.test(filename || '')) return 'image/webp';
    if (/\.gif$/i.test(filename || '')) return 'image/gif';
    return 'image/png';
}

/** Converts a canonical `wix:image://...` fileUrl into a public CDN URL for <img> use. */
export function wixMediaToPublicUrl(wixUrl) {
    if (!wixUrl) return null;
    if (wixUrl.startsWith('http')) return wixUrl;
    const match = wixUrl.match(/wix:image:\/\/v1\/([^/#]+)/);
    return match?.[1] ? `https://static.wixstatic.com/media/${match[1]}` : null;
}

export async function uploadBase64ImageToWixMedia(base64, filename) {
    if (!base64 || !base64.startsWith('data:')) {
        throw new Error('לא התקבל קובץ תמונה תקין.');
    }
    const mimeMatch = base64.match(/^data:(image\/[^;]+);base64,/);
    const mimeType = mimeMatch?.[1] || inferImageMimeType(filename);
    const raw = base64.replace(/^data:image\/[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');

    if (!buffer.byteLength) throw new Error('לא התקבל תוכן תקין להעלאה.');
    if (buffer.byteLength > MAX_BYTES) throw new Error('התמונה גדולה מהמותר (מקסימום 8MB).');

    const upload = await mediaManager.upload(
        UPLOAD_FOLDER,
        buffer,
        filename || `addon-${Date.now()}.png`,
        {
            mediaOptions: { mimeType, mediaType: 'image' },
            metadataOptions: { isPrivate: false, isVisitorUpload: false, context: { source: 'studio-upsell-addon' } },
        },
    );

    const fileUrl = typeof upload?.fileUrl === 'string' ? upload.fileUrl : null;
    if (!fileUrl || !fileUrl.startsWith('wix:')) {
        console.error('[studioUpsell/mediaUpload] Missing fileUrl from mediaManager.upload:', upload);
        throw new Error('העלאת התמונה נכשלה — לא התקבלה כתובת קובץ מהמדיה של Wix.');
    }

    return { fileUrl, publicUrl: wixMediaToPublicUrl(fileUrl) };
}
