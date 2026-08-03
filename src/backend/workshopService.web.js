import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';

const BG_COLORS = ['#541F7E'];
const ROTATIONS = [-1.5, 1.5, -1, 1, -2, 2];

// Converts wix:image://v1/{hash}/{filename} to an optimised static URL.
// targetWidth is the render width in CSS pixels; 2× for retina = 700–800px is ideal.
function wixImageToUrl(src, targetWidth = 800) {
    if (!src || typeof src !== 'string') return '';
    if (!src.startsWith('wix:image://')) return src;
    const withoutScheme = src.replace('wix:image://v1/', '').split('#')[0];
    const parts = withoutScheme.split('/');
    const hash = parts[0];
    const filename = parts.slice(1).join('/') || 'image.jpg';
    const targetHeight = Math.round(targetWidth / 2); // matches 2:1 card image ratio
    return `https://static.wixstatic.com/media/${hash}/v1/fill/w_${targetWidth},h_${targetHeight},al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/${filename}`;
}

function resolveHomePageImages(raw) {
    if (!Array.isArray(raw) || !raw.length) return [];
    return raw.map(item => {
        if (typeof item === 'string') return wixImageToUrl(item);
        const src = item.src || item.url || item.image || '';
        return wixImageToUrl(src);
    }).filter(Boolean);
}

function resolveHref(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    return raw.url || raw.href || '';
}

export const getWorkshops = webMethod(Permissions.Anyone, async () => {
    try {
        const results = await wixData.query('workshops')
            .fields('paragraphTop', 'workshopName', 'homePageImages', 'duration', 'minAge')
            .find({ omitTotalCount: true });

        return results.items.map((item, index) => ({
            title: item.workshopName || '',
            desc: item.paragraphTop || '',
            homePageImages: resolveHomePageImages(item.homePageImages),
            duration: item.duration || '',
            age: item.minAge || '',
            href: resolveHref(item['link-workshops-topTitle']),
            bgColor: BG_COLORS[index % BG_COLORS.length],
            rotation: ROTATIONS[index % ROTATIONS.length],
            rating: null,
            reviews: []
        }));
    } catch (error) {
        console.error('Error fetching workshops:', error);
        return [];
    }
});