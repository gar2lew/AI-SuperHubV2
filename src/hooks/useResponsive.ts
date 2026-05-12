import { useEffect, useState } from 'react';
import { getResponsiveState, type ResponsiveState } from '@/lib/responsive';

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => getResponsiveState());

  useEffect(() => {
    const update = () => setState(getResponsiveState());
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(pointer: coarse)');

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    motionQuery.addEventListener('change', update);
    pointerQuery.addEventListener('change', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      motionQuery.removeEventListener('change', update);
      pointerQuery.removeEventListener('change', update);
    };
  }, []);

  return state;
}
