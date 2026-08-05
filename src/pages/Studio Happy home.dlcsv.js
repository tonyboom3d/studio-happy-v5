import { timeline } from 'wix-animations-frontend';
import wixLocationFrontend from 'wix-location-frontend';
import { getActiveWorkshops } from 'backend/home/workshopsData.jsw'

$w.onReady(() => {
    const eyes = [$w('#leftEye'), $w('#rightEye')];
    const htmlElement = $w('#html1');

    setTimeout(() => {
        $w('#loading').collapse();
    }, 5000);

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

    getActiveWorkshops().then((workshops) => {
        console.log("workshops", workshops);
        if (workshops && workshops.length > 0) {
            htmlElement.postMessage({ type: 'initWorkshops', data: workshops });
        } else {
            console.log("No workshops found or error occurred.");
        }
    });

    htmlElement.onMessage((event) => {
        const message = event.data;
        if (message && message.type === 'navigate' && message.url) {
            wixLocationFrontend.to(message.url);
        }
    });
});