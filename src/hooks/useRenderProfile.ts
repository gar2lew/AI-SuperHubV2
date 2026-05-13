import { useEffect, useRef } from 'react';
import { recordRenderTiming } from '@/lib/telemetry/runtimeTelemetry';

export function useRenderProfile(name: string) {
  const renders = useRef(0);
  const startedAt = useRef(performance.now());
  const renderStartedAt = useRef(performance.now());
  const isDev = typeof import.meta.env?.DEV === 'boolean' ? import.meta.env.DEV : false;

  renderStartedAt.current = performance.now();

  useEffect(() => {
    renders.current += 1;
    recordRenderTiming(name, performance.now() - renderStartedAt.current);
    if (isDev && renders.current % 25 === 0) {
      const elapsed = Math.round(performance.now() - startedAt.current);
      console.debug(`[render-profile] ${name}: ${renders.current} renders in ${elapsed}ms`);
    }
  }, [isDev, name]);
}
