import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "@/shared/theme/theme";
import { resetThemeModeForTests } from "@/shared/ui/hooks/use-theme-mode";
import { ThemeToggleContainer } from "./ThemeToggleContainer";

let prefersDark = false;
const listeners = new Set<(e: { matches: boolean }) => void>();

function flipOs(dark: boolean) {
  prefersDark = dark;
  act(() => listeners.forEach((l) => l({ matches: dark })));
}

beforeEach(() => {
  prefersDark = false;
  listeners.clear();
  localStorage.clear();
  resetThemeModeForTests();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return prefersDark;
      },
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.add(l),
      removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.delete(l),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const theme = () => document.documentElement.dataset.theme;

describe("ThemeToggleContainer", () => {
  it("defaults to system and follows the OS preference live", () => {
    render(<ThemeToggleContainer />);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(theme()).toBe("light");
    flipOs(true);
    expect(theme()).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("persists an explicit choice, which overrides the OS", async () => {
    render(<ThemeToggleContainer />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(theme()).toBe("dark");
    flipOs(false);
    expect(theme()).toBe("dark");
    await userEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(theme()).toBe("light");
  });

  it("restores the stored mode", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    prefersDark = true;
    render(<ThemeToggleContainer />);
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(theme()).toBe("light");
  });

  it("still switches when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<ThemeToggleContainer />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(theme()).toBe("dark");
  });
});
