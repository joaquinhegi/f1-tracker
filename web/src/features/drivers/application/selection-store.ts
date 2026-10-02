/**
 * Per-session persistence of the checked drivers in localStorage. Every
 * access is guarded: storage can be disabled, full, or unavailable (private
 * mode, SSR), and the app must work the same without it.
 *
 * Exposed as an external store (subscribe + snapshot) so React reads it with
 * useSyncExternalStore: no effect, and no hydration mismatch (the server
 * snapshot is "nothing stored").
 */

const CHANGE_EVENT = "f1-tracker:selection-change";

const keyFor = (sessionKey: number) => `f1-tracker:checked-drivers:${sessionKey}`;

/** Raw stored value (a string, so snapshots compare by value), null if none or unreadable. */
export function readSelectionRaw(sessionKey: number, storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): string | null {
  try {
    return storage?.getItem(keyFor(sessionKey)) ?? null;
  } catch {
    return null;
  }
}

export function parseSelection(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((n): n is number => Number.isInteger(n) && n > 0);
  } catch {
    return null;
  }
}

export function loadSelection(sessionKey: number, storage?: Pick<Storage, "getItem">): number[] | null {
  return parseSelection(readSelectionRaw(sessionKey, storage ?? globalThis.localStorage));
}

export function saveSelection(
  sessionKey: number,
  selection: readonly number[],
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(keyFor(sessionKey), JSON.stringify(selection));
  } catch {
    // Storage full or blocked: the selection simply is not remembered.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Notifies on changes from this tab (save) and from other tabs (storage event). */
export function subscribeSelection(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
