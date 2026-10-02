"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  applyTheme,
  readThemeMode,
  resolveTheme,
  safeLocalStorage,
  subscribeToSystemTheme,
  systemPrefersDark,
  writeThemeMode,
  type ThemeMode,
} from "@/shared/theme/theme";

const CHANGE_EVENT = "f1-tracker:theme-change";

/** The choice for this page view when storage is blocked: the toggle still works, it is just not remembered. */
let unsavedMode: ThemeMode | null = null;

const matchMedia = (query: string) => window.matchMedia(query);
const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

function getSnapshot(): ThemeMode {
  return unsavedMode ?? readThemeMode(safeLocalStorage());
}

/** The server cannot know: it renders "system", the inline script has already painted the real theme. */
const getServerSnapshot = (): ThemeMode => "system";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function paint(): void {
  const prefersDark = hasMatchMedia() && systemPrefersDark(matchMedia);
  applyTheme(document.documentElement, resolveTheme(getSnapshot(), prefersDark));
}

/** Test seam: forget a choice kept in memory. */
export function resetThemeModeForTests(): void {
  unsavedMode = null;
}

/**
 * The viewer's theme mode, persisted in localStorage, shared across tabs.
 * Keeps <html> painted with the resolved theme and, in "system" mode,
 * follows the OS preference live.
 */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // Paints from the live snapshot, not `mode`: during hydration `mode` is
    // still the server's "system", and painting it would undo the inline script.
    paint();
    if (getSnapshot() !== "system" || !hasMatchMedia()) return;
    return subscribeToSystemTheme(matchMedia, paint);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    unsavedMode = writeThemeMode(safeLocalStorage(), next) ? null : next;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [mode, setMode];
}
