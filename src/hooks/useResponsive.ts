import { useEffect, useState } from 'react';
import { getResponsiveState, type ResponsiveState } from '@/lib/responsive';
import { recordViewportMetrics } from '@/lib/telemetry/runtimeTelemetry';

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => getResponsiveState());

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const viewport = window.visualViewport;
      if (viewport) {
        const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        document.documentElement.style.setProperty('--keyboard-inset-height', `${Math.round(keyboardInset)}px`);
        document.documentElement.classList.toggle('keyboard-open', keyboardInset > 80);
      } else {
        document.documentElement.style.setProperty('--keyboard-inset-height', '0px');
        document.documentElement.classList.remove('keyboard-open');
      }
      const nextState = getResponsiveState();
      recordViewportMetrics({
        width: nextState.width,
        height: nextState.height,
        deviceType: nextState.deviceType,
        orientation: nextState.orientation,
        visualViewportHeight: viewport ? Math.round(viewport.height) : undefined,
        keyboardInset: viewport
          ? Math.round(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop))
          : 0,
      });
      setState(nextState);
    };
    const scheduleUpdate = () => {
      if (frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(update);
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(pointer: coarse)');
    const viewport = window.visualViewport;

    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
    viewport?.addEventListener('resize', scheduleUpdate, { passive: true });
    viewport?.addEventListener('scroll', scheduleUpdate, { passive: true });
    motionQuery.addEventListener('change', scheduleUpdate);
    pointerQuery.addEventListener('change', scheduleUpdate);

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      viewport?.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('scroll', scheduleUpdate);
      motionQuery.removeEventListener('change', scheduleUpdate);
      pointerQuery.removeEventListener('change', scheduleUpdate);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      document.documentElement.style.removeProperty('--keyboard-inset-height');
      document.documentElement.classList.remove('keyboard-open');
    };
  }, []);

  return state;
}
