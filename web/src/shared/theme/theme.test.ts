import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  parseThemeMode,
  readThemeMode,
  resolveTheme,
  safeLocalStorage,
  SURFACE_COLOUR,
  subscribeToSystemTheme,
  systemPrefersDark,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  writeThemeMode,
} from "./theme";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

const blocked = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

const fakeMedia = (prefersDark: boolean) => {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const list = {
    matches: prefersDark,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.add(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.delete(l),
  };
  return {
    matchMedia: vi.fn(() => list),
    flip(next: boolean) {
      list.matches = next;
      listeners.forEach((l) => l({ matches: next }));
    },
    listeners,
  };
};

describe("theme mode", () => {
  it("parses only light / dark, anything else is system", () => {
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode(null)).toBe("system");
    expect(parseThemeMode("DARK")).toBe("system");
  });

  it("resolves system against the OS preference and keeps an explicit choice", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("theme storage", () => {
  it("round-trips light / dark and clears the key for system", () => {
    const storage = memoryStorage();
    expect(writeThemeMode(storage, "dark")).toBe(true);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemeMode(storage)).toBe("dark");
    expect(writeThemeMode(storage, "system")).toBe(true);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readThemeMode(storage)).toBe("system");
  });

  it("falls back to system and reports failure when storage is missing or blocked", () => {
    expect(readThemeMode(null)).toBe("system");
    expect(readThemeMode(blocked)).toBe("system");
    expect(readThemeMode(memoryStorage({ [THEME_STORAGE_KEY]: "sepia" }))).toBe("system");
    expect(writeThemeMode(null, "light")).toBe(false);
    expect(writeThemeMode(blocked, "light")).toBe(false);
    expect(writeThemeMode(blocked, "system")).toBe(false);
  });

  it("returns null when even reading window.localStorage throws", () => {
    const win = Object.defineProperty({}, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(safeLocalStorage(win)).toBeNull();
  });
});

describe("system preference", () => {
  it("reads the OS preference, light when matchMedia is missing", () => {
    expect(systemPrefersDark(fakeMedia(true).matchMedia)).toBe(true);
    expect(systemPrefersDark(fakeMedia(false).matchMedia)).toBe(false);
    expect(systemPrefersDark(undefined)).toBe(false);
  });

  it("reports live OS changes until unsubscribed", () => {
    const media = fakeMedia(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(media.matchMedia, onChange);
    media.flip(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    unsubscribe();
    media.flip(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("supports the legacy addListener API", () => {
    const list = { matches: false, addListener: vi.fn(), removeListener: vi.fn() };
    const unsubscribe = subscribeToSystemTheme(() => list, () => {});
    expect(list.addListener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(list.removeListener).toHaveBeenCalledWith(list.addListener.mock.calls[0][0]);
  });
});

describe("applyTheme", () => {
  it("sets data-theme and color-scheme on the root", () => {
    const root = document.createElement("html");
    applyTheme(root, "light");
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("inline init script", () => {
  const run = (storage: unknown, prefersDark: boolean | "throws") => {
    const root = document.createElement("html");
    const win = {
      matchMedia: () => {
        if (prefersDark === "throws") throw new Error("no matchMedia");
        return { matches: prefersDark };
      },
    };
    new Function("window", "document", "localStorage", THEME_INIT_SCRIPT)(win, { documentElement: root }, storage);
    return { theme: root.getAttribute("data-theme"), scheme: root.style.colorScheme };
  };

  it("matches resolveTheme for every stored mode and OS preference", () => {
    for (const mode of ["system", "light", "dark"] as const) {
      for (const dark of [true, false]) {
        const storage = memoryStorage(mode === "system" ? {} : { [THEME_STORAGE_KEY]: mode });
        const expected = resolveTheme(mode, dark);
        expect(run(storage, dark)).toEqual({ theme: expected, scheme: expected });
      }
    }
  });

  it("survives blocked storage and a missing matchMedia", () => {
    expect(run(blocked, true).theme).toBe("dark");
    expect(run(blocked, "throws").theme).toBe("light");
  });
});

describe("tokens.css", () => {
  const css = readFileSync(path.join(__dirname, "../ui/styles/tokens.css"), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(selector);
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const dark = block(':root[data-theme="dark"]');
  const light = block(':root[data-theme="light"]');

  it("gives every dark colour token a light value", () => {
    expect(dark.size).toBeGreaterThan(30);
    expect([...dark.keys()].filter((k) => !light.has(k))).toEqual([]);
    expect([...light.keys()].filter((k) => !dark.has(k))).toEqual([]);
  });

  it("keeps SURFACE_COLOUR equal to --color-surface", () => {
    expect(dark.get("--color-surface")?.toUpperCase()).toBe(SURFACE_COLOUR.dark);
    expect(light.get("--color-surface")?.toUpperCase()).toBe(SURFACE_COLOUR.light);
  });
});
