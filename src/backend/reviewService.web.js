import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';


function wixImageToUrl(src, targetSize = 200) {
    if (!src || typeof src !== 'string') return '';
    if (!src.startsWith('wix:image://')) return src;
    const withoutScheme = src.replace('wix:image://v1/', '').split('#')[0];
    const parts = withoutScheme.split('/');
    const hash = parts[0];
    const filename = parts.slice(1).join('/') || 'image.jpg';
    return `https://static.wixstatic.com/media/${hash}/v1/fill/w_${targetSize},h_${targetSize},al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/${filename}`;
}

function formatDate(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(2);
    return `${day}.${month}.${year}`;
}

export const getReviews = webMethod(Permissions.Anyone, async () => {
    try {
        const results = await wixData.query('customerReviews')
            .descending('reviewDate')
            .find({ omitTotalCount: true });

        const ROTATIONS = [-1.5, 1.5, -1, 1];

        return results.items.map((item, index) => ({
            reviewerName: item.reviewerName || '',
            reviewDate:   formatDate(item.reviewDate),
            rating:       typeof item.rating === 'number' ? Math.min(5, Math.max(0, item.rating)) : 5,
            reviewText:   item.reviewText || '',
            profileImage: wixImageToUrl(item.profileImage),
            rotation:     ROTATIONS[index % ROTATIONS.length]
        }));
    } catch (error) {
        console.error('Error fetching reviews:', error);
        return [];
    }
});
