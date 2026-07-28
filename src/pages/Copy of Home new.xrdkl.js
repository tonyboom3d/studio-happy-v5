import { timeline } from 'wix-animations-frontend';
import { getWorkshops } from 'backend/workshopService.web.js';
import { getPlainTextQuestionsByCategory } from 'backend/faqService.web.js'
import { getReviews } from 'backend/reviewService.web.js';

const CAROUSEL_ID = '#customElement2';

const CAROUSEL_REVIEWS_ID = '#customElement3';

$w.onReady(async () => {
    const carousel = $w(CAROUSEL_ID);

    if (!carousel || typeof carousel.setAttribute !== 'function') {
        console.warn(`${CAROUSEL_ID} is not a Custom Element or was not found. Carousel will use default data.`);
        return;
    }

    try {
        const workshops = await getWorkshops();

        if (workshops && workshops.length) {
            carousel.setAttribute('workshops', JSON.stringify(workshops));
        }
    } catch (err) {
        console.error('Failed to load workshops from CMS:', err);
    }
    const eyes = [$w('#leftEye'), $w('#rightEye')];

    const blinkTimeline = timeline({ repeat: -1, repeatDelay: 4000 })
        .add(eyes, {
            "scaleY": 0.1,
            "duration": 100,
            "easing": "easeInQuad"
        })
        .add(eyes, {
            "scaleY": 1,
            "duration": 100,
            "easing": "easeOutQuad"
        });

    blinkTimeline.play();

    $w('#leftEye, #rightEye').onMouseIn(() => {
        blinkTimeline.play();
    });

    loadFaqData("41f1d0b9-a5f4-4b58-8e9c-9e96ca7d7a5b");

    const carouselReviews = $w(CAROUSEL_REVIEWS_ID);
    if (!carouselReviews || typeof carouselReviews.setAttribute !== 'function') return;
    try {
        const reviews = await getReviews();
        if (reviews?.length) {
            carouselReviews.setAttribute('reviews', JSON.stringify(reviews));
        }
    } catch (err) {
        console.error('Failed to load reviews:', err);
    }
});

async function loadFaqData(categoryId) {
    try {
        const rawQuestions = await getPlainTextQuestionsByCategory(categoryId);
        const formattedQuestions = rawQuestions.map(item => {
            return {
                question: item.question,
                answer: item.answer,
                plainText: item.answer
            };
        });

        const payload = {
            dynamicCategory: {
                title: "שאלות נפוצות",
                questions: formattedQuestions
            },
            generalCategory: {
                title: "שאלות כלליות",
                questions: []
            }
        };

        const htmlComponent = $w("#html1");

        setTimeout(() => {
            htmlComponent.postMessage({ type: "DATA_LOADED", payload: payload });
        }, 500);

    } catch (err) {
        console.error("Client: Failed to load FAQ", err);
    }
}