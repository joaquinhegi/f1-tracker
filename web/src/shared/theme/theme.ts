/**
 * Theme selection. Pure: no React, no globals. The browser objects
 * (storage, matchMedia, <html>) are passed in, so every piece is testable.
 *
 * - The *mode* is what the viewer picked: "system" (the default, follows the
 *   OS live), "light" or "dark". Only "light" / "dark" are stored.
 * - The *theme* is what is painted: the mode resolved against the OS
 *   preference. It goes on <html> as `data-theme` + `color-scheme`.
 */

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type Theme = "light" | "dark";

/**
 * --color-surface of each theme, for colours computed in JS (e.g. a driver
 * name tuned to read on a radio bubble). Kept equal to tokens.css by a test.
 */
export const SURFACE_COLOUR: Record<Theme, string> = { dark: "#161B22", light: "#FFFFFF" };

export const THEME_STORAGE_KEY = "f1-tracker:theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Anything unknown (nothing stored, a stale or tampered value) is "system". */
export function parseThemeMode(raw: unknown): ThemeMode {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): Theme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

/** The stored mode; "system" when nothing is stored or storage is unreadable. */
export function readThemeMode(storage: Pick<Storage, "getItem"> | null | undefined): ThemeMode {
  try {
    return parseThemeMode(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** Stores the mode ("system" clears it). False when storage is missing, full or blocked. */
export function writeThemeMode(storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined, mode: ThemeMode): boolean {
  if (!storage) return false;
  try {
    if (mode === "system") storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** `window.localStorage`, or null when even reading the property throws (blocked site data). */
export function safeLocalStorage(win: { localStorage?: Storage } | undefined = globalThis as { localStorage?: Storage }): Storage | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

type ChangeListener = (event: { matches: boolean }) => void;

/** The part of MediaQueryList used here (method syntax, so the DOM type fits). */
export interface MediaQueryLike {
  matches: boolean;
  addEventListener?(type: "change", listener: ChangeListener): void;
  removeEventListener?(type: "change", listener: ChangeListener): void;
  /** Safari < 14. */
  addListener?(listener: ChangeListener): void;
  removeListener?(listener: ChangeListener): void;
}

export type MatchMedia = (query: string) => MediaQueryLike;

/** Whether the OS prefers dark; false (light) when matchMedia is unavailable. */
export function systemPrefersDark(matchMedia: MatchMedia | undefined): boolean {
  try {
    return matchMedia?.(DARK_QUERY).matches ?? false;
  } catch {
    return false;
  }
}

/** Calls `onChange(prefersDark)` whenever the OS preference flips. Returns the unsubscribe. */
export function subscribeToSystemTheme(matchMedia: MatchMedia | undefined, onChange: (prefersDark: boolean) => void): () => void {
  if (!matchMedia) return () => {};
  const list = matchMedia(DARK_QUERY);
  const listener: ChangeListener = (event) => onChange(event.matches);
  if (list.addEventListener) {
    list.addEventListener("change", listener);
    return () => list.removeEventListener?.("change", listener);
  }
  // Safari < 14.
  list.addListener?.(listener);
  return () => list.removeListener?.(listener);
}

/** Paints `theme`: `data-theme` drives the tokens, `color-scheme` the native controls. */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Inline <head> script: the same resolution as above, run while the HTML is
 * parsed, so the first paint already has the right theme. Self-contained
 * ES5, no external file; kept in sync with the functions above by tests.
 */
export const THEME_INIT_SCRIPT =
  `(function(){var m="system";try{var v=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(v==="light"||v==="dark")m=v}catch(e){}` +
  `var d=false;try{d=window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches}catch(e){}` +
  `var t=m==="system"?(d?"dark":"light"):m,r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t})()`;
