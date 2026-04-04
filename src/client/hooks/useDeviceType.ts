// ============================================================
// useDeviceType.ts — スマホ/PC判定（§6-4）
// ============================================================

import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>(getDeviceType);

  useEffect(() => {
    const handleResize = () => setDevice(getDeviceType());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return device;
}

function getDeviceType(): DeviceType {
  const w = window.innerWidth;
  if (w < MOBILE_BREAKPOINT) return 'mobile';
  if (w < TABLET_BREAKPOINT) return 'tablet';
  return 'desktop';
}

/** タッチ対応端末かどうか */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
