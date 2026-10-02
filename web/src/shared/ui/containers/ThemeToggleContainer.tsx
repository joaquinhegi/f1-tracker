"use client";

import { useThemeMode } from "@/shared/ui/hooks/use-theme-mode";
import { ThemeToggle } from "@/shared/ui/molecules/ThemeToggle";

/** Wires the theme toggle to the persisted mode and keeps <html> painted. */
export function ThemeToggleContainer() {
  const [mode, setMode] = useThemeMode();
  return <ThemeToggle mode={mode} onChange={setMode} />;
}
