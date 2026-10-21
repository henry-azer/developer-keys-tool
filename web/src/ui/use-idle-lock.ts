import { useEffect } from 'react';

/** Calls `onIdle` after `minutes` with no pointer or keyboard activity. */
export function useIdleLock(minutes: number, onIdle: () => void) {
  useEffect(() => {
    if (minutes <= 0) return;
    let timer = window.setTimeout(onIdle, minutes * 60_000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onIdle, minutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'pointermove'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, onIdle]);
}
