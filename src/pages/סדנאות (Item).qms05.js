import { media } from '@wix/sdk';
import { getPlainTextQuestionsByCategory } from 'backend/faqService.web.js';
import wixLocationsFrontend from 'wix-location-frontend'
$w.onReady(async function () {
    const htmlComp = $w('#htmlFAQ');
    $w('#button2').onClick(() => {
        $w('#section9').scrollTo()
    })

    try {
        const currentItem = await $w('#dynamicDataset').getCurrentItem();

        if (!currentItem) {
            console.warn('Gallery: לא נמצא פריט נוכחי ב-Dataset');
            return;
        }

        const topImages = currentItem.topGallery;
        const faqCatId = currentItem.faqCategoryId;
        const workshopId = currentItem._id;

        console.log("workshopId", workshopId);
        switch (workshopId) {
        case "d20eb0d0-0485-4e91-8ed9-ca6812a0ed12": // טאפטינג
            $w('#new-flow-section').expand();
            $w('#button7').onClick(() => { redirect("/booking-flow-tufting") })
            $w('#button2').onClick(() => { redirect("/booking-flow-tufting") })
            break;
        case "ee5072ec-3389-496c-917d-bc39a498ba54": // קרמיקה
            $w('#wixCalendar').expand();
            $w('#section10').expand();
            $w('#button2').onClick(() => { $w('#wixCalendar').scrollTo() })
            break;
        case "a5ac42ec-80d3-447a-801c-08fe8e74e0a3": // תכשיטים
            $w('#wixCalendar').expand();
            $w('#section10').expand();
            $w('#button2').onClick(() => { $w('#wixCalendar').scrollTo() })
            break;
        case "bd7f339d-ea8a-4adf-a7c1-15ff042f1558": // צארמס
            $w('#wixCalendar').expand();
            $w('#section10').expand();
            $w('#button2').onClick(() => { $w('#wixCalendar').scrollTo() })
            break;
        case "4572e26f-37ae-45c6-a767-5b49ee144bb4": // נרות
            $w('#new-flow-section').expand();
            $w('#button7').onClick(() => { redirect("/booking-flow-candels") })
            $w('#button2').onClick(() => { redirect("/booking-flow-candels") })
            break;
        default:
            break;
        }

        if (topImages && topImages.length > 0) {
            const convertedTop = convertImages(topImages);
            console.log(`TopGallery: ${convertedTop.length} תמונות`);

            $w('#topGalleryElement').postMessage({
                type: 'SET_IMAGES',
                images: convertedTop
            });
        } else {
            console.warn('TopGallery: אין תמונות ב-topGallery');
        }

        const bottomImages = currentItem.bottomGallery;

        if (bottomImages && bottomImages.length > 0) {
            const convertedBottom = convertImages(bottomImages);
            console.log(`BottomGallery: ${convertedBottom.length} תמונות`);

            $w('#bottomGalleryElement').postMessage({
                type: 'SET_IMAGES',
                images: convertedBottom
            });
        } else {
            console.warn('BottomGallery: אין תמונות ב-bottomGallery');
        }

        htmlComp.onMessage(async (event) => {
            if (event.data?.type === 'FAQ_READY') {
                try {
                    console.log("faqCatId", faqCatId);
                    const items = await getPlainTextQuestionsByCategory(faqCatId);
                    console.log("items", items);
                    htmlComp.postMessage({ type: 'FAQ_DATA', items });
                } catch (err) {
                    htmlComp.postMessage({ type: 'FAQ_ERROR', message: 'שגיאה בטעינת השאלות.' });
                }
            }
        });

    } catch (error) {
        console.error('Gallery: שגיאה בטעינת תמונות:', error);
    }
});

function redirect(path) {
    wixLocationsFrontend.to(path)
}

function convertImages(galleryImages) {
    if (!Array.isArray(galleryImages)) return [];

    // שימוש ב-reduce כדי לסנן פריטים פגומים או וידאו שלא ניתנים להמרה
    return galleryImages.reduce((acc, imgItem) => {
        if (!imgItem) return acc;

        let wixMediaIdentifier = '';

        if (typeof imgItem === 'string') {
            wixMediaIdentifier = imgItem;
        } else {
            // קריאה מאובטחת לשדות הרלוונטים - במידה ואין מחזירים מחרוזת ריקה ולא את האובייקט
            wixMediaIdentifier = imgItem.src || imgItem.url || imgItem.image || '';
        }

        // בדיקה נוקשה שהמזהה הוא בוודאות מחרוזת טקסט לפני העברה לפונקציית ה-startsWith הפנימית
        if (typeof wixMediaIdentifier !== 'string' || wixMediaIdentifier.trim() === '') {
            return acc;
        }

        try {
            const imageData = media.getImageUrl(wixMediaIdentifier);

            let optimizedUrl = imageData.url;
            let finalWidth = imageData.width || imgItem.width || null;
            let finalHeight = imageData.height || imgItem.height || null;

            // הגדרת רוחב מקסימלי לתמונה כדי לשפר זמני טעינה 
            const MAX_WIDTH = 800;

            // חיתוך ואופטימיזציה מול שרתי wixstatic
            if (finalWidth && finalHeight && finalWidth > MAX_WIDTH && optimizedUrl.includes('wixstatic.com')) {
                const ratio = MAX_WIDTH / finalWidth;
                finalWidth = Math.round(finalWidth * ratio);
                finalHeight = Math.round(finalHeight * ratio);

                // הסרת קידוד /v1/ קיים אם ישנו כדי למנוע כפילויות בפלט
                const baseUrl = optimizedUrl.split('/v1/')[0];
                optimizedUrl = `${baseUrl}/v1/fill/w_${finalWidth},h_${finalHeight},al_c,q_80,enc_auto/image.jpg`;
            }

            acc.push({
                src: optimizedUrl,
                alt: imgItem.alt || imgItem.title || '',
                width: finalWidth,
                height: finalHeight,
            });
        } catch (err) {
            console.warn('שגיאה בפרסור התמונה (ייתכן וידאו או מזהה לא תקין):', wixMediaIdentifier, err);
        }

        return acc;
    }, []);
}