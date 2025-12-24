import { useState, useEffect } from 'react';

type PerfModeState = {
  isMobile: boolean;
  reduceMotion: boolean;
  perfMode: boolean;
};

export function usePerfMode(): PerfModeState {
  const [state, setState] = useState<PerfModeState>({
    isMobile: false,
    reduceMotion: false,
    perfMode: false,
  });

  useEffect(() => {
    const checkPerfMode = () => {
      const isMobile = window.innerWidth <= 768;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const perfMode = isMobile || reduceMotion;

      setState({ isMobile, reduceMotion, perfMode });
    };

    checkPerfMode();

    window.addEventListener('resize', checkPerfMode);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener('change', checkPerfMode);

    return () => {
      window.removeEventListener('resize', checkPerfMode);
      mediaQuery.removeEventListener('change', checkPerfMode);
    };
  }, []);

  return state;
}
