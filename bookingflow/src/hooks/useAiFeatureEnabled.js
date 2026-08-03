import { useCallback } from 'react';

export function useAiFeatureEnabled() {
  const handleAiButtonClick = useCallback((onChooseAi) => {
    onChooseAi();
  }, []);

  return { aiEnabled: true, handleAiButtonClick };
}
