export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveState {
  width: number;
  height: number;
  deviceType: DeviceType;
  orientation: 'portrait' | 'landscape';
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  prefersReducedMotion: boolean;
}

export function getResponsiveState(): ResponsiveState {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const height = typeof window === 'undefined' ? 800 : window.innerHeight;
  const isTouch =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches);
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deviceType: DeviceType = width < 760 ? 'mobile' : width < 1120 ? 'tablet' : 'desktop';

  return {
    width,
    height,
    deviceType,
    orientation: width >= height ? 'landscape' : 'portrait',
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    isTouch,
    prefersReducedMotion,
  };
}
