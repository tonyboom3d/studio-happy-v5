// NavigationTracker - Simplified version without BASE44
// This component does nothing in the standalone version
// Navigation tracking can be done via Wix analytics

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function NavigationTracker() {
    const location = useLocation();

    useEffect(() => {
        // Log page navigation to console (for debugging)

        // Optionally notify Wix of navigation
        try {
            window.parent.postMessage({
                type: 'NAVIGATION',
                path: location.pathname
            }, '*');
        } catch (e) {
            // Ignore if not in iframe
        }
    }, [location]);

    return null;
}