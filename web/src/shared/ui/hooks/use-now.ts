"use client";

import { useEffect, useState } from "react";

/**
 * Current time, re-rendered every `intervalMs` (aligned to the wall-clock
 * second). Returns null during SSR and the first client render, so markup
 * that depends on "now" or on the viewer's timezone never mismatches on
 * hydration.
 */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, intervalMs - (current.getTime() % intervalMs));
    };
    tick();
    return () => clearTimeout(timer);
  }, [intervalMs]);

  return now;
}
