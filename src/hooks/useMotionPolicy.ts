import { useState, useEffect } from 'react';

type MotionMode = 'off' | 'lite' | 'full';

type MotionPolicyState = {
  mode: MotionMode;
  isMobile: boolean;
  reduceMotion: boolean;
};

export function useMotionPolicy(): MotionPolicyState {
  const [state, setState] = useState<MotionPolicyState>({
    mode: 'full',
    isMobile: false,
    reduceMotion: false,
  });

  useEffect(() => {
    const checkMotionPolicy = () => {
      const isMobile = window.innerWidth <= 768;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let mode: MotionMode = 'full';

      if (reduceMotion) {
        mode = 'off';
      } else if (isMobile) {
        mode = 'lite';
      } else {
        mode = 'full';
      }

      setState({ mode, isMobile, reduceMotion });
    };

    checkMotionPolicy();

    window.addEventListener('resize', checkMotionPolicy);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener('change', checkMotionPolicy);

    return () => {
      window.removeEventListener('resize', checkMotionPolicy);
      mediaQuery.removeEventListener('change', checkMotionPolicy);
    };
  }, []);

  return state;
}
