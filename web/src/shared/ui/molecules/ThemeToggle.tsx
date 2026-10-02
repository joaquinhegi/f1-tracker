import type { ReactNode } from "react";
import type { ThemeMode } from "@/shared/theme/theme";
import styles from "./ThemeToggle.module.css";

export interface ThemeToggleProps {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

const icon = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const OPTIONS: Array<{ mode: ThemeMode; label: string; icon: ReactNode }> = [
  {
    mode: "system",
    label: "System",
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>,
    ),
  },
  {
    mode: "light",
    label: "Light",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </>,
    ),
  },
  {
    mode: "dark",
    label: "Dark",
    icon: icon(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
  },
];

/**
 * Molecule: System / Light / Dark as a segmented control. Native radios, so
 * the group gets arrow-key navigation and radio semantics for free; the
 * visible part is the icon, the label stays available to assistive tech and
 * as a tooltip.
 */
export function ThemeToggle({ mode, onChange }: ThemeToggleProps) {
  return (
    <fieldset className={styles.toggle}>
      <legend className="visually-hidden">Theme</legend>
      {OPTIONS.map((option) => (
        <label key={option.mode} className={styles.option} title={`${option.label} theme`}>
          <input
            type="radio"
            name="theme-mode"
            value={option.mode}
            checked={mode === option.mode}
            onChange={() => onChange(option.mode)}
            className={styles.input}
          />
          {option.icon}
          <span className="visually-hidden">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
