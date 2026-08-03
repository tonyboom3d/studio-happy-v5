import { useState, useCallback } from 'react';
import { isAiTestModeEnabled } from '@/lib/utils';

const AI_SECRET_TAP_TARGET = 10;

export function useAiFeatureEnabled() {
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  const aiEnabled = isAiTestModeEnabled() || secretUnlocked;

  const handleAiButtonClick = useCallback((onChooseAi) => {
    if (isAiTestModeEnabled()) {
      onChooseAi();
      return;
    }
    if (secretUnlocked) {
      onChooseAi();
      return;
    }
    const nextTap = tapCount + 1;
    setTapCount(nextTap);
    if (nextTap >= AI_SECRET_TAP_TARGET) {
      setSecretUnlocked(true);
      onChooseAi();
    }
  }, [secretUnlocked, tapCount]);

  return { aiEnabled, handleAiButtonClick };
}
