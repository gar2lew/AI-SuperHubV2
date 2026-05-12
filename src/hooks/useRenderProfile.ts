import { useEffect, useRef } from 'react';

export function useRenderProfile(name: string) {
  const renders = useRef(0);
  const startedAt = useRef(performance.now());

  useEffect(() => {
    renders.current += 1;
    if (import.meta.env.DEV && renders.current % 25 === 0) {
      const elapsed = Math.round(performance.now() - startedAt.current);
      console.debug(`[render-profile] ${name}: ${renders.current} renders in ${elapsed}ms`);
    }
  });
}
