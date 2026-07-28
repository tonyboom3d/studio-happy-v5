import { timeline } from 'wix-animations-frontend';

$w.onReady(() => {
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
});