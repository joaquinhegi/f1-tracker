import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "live" | "muted";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

/** Small pill label. `live` adds a pulsing dot. */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {tone === "live" && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
