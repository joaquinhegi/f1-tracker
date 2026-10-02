import type { ReactNode } from "react";
import { Surface } from "@/shared/ui/atoms/Surface";
import styles from "./CircuitPanel.module.css";

export interface CircuitPanelProps {
  circuitName: string;
  caption?: string;
  children: ReactNode;
}

/** Section frame around the circuit map (and its loading / empty states). */
export function CircuitPanel({ circuitName, caption, children }: CircuitPanelProps) {
  return (
    <Surface as="section" aria-labelledby="circuit-title" className={styles.panel}>
      <header className={styles.header}>
        <h2 id="circuit-title" className={styles.title}>
          {circuitName}
        </h2>
        {caption && <p className={styles.caption}>{caption}</p>}
      </header>
      <div className={styles.body}>{children}</div>
    </Surface>
  );
}

/** Row under the map for its key (sector colours). */
export function CircuitMapKey({ children }: { children: ReactNode }) {
  return <div className={styles.key}>{children}</div>;
}

export function CircuitMapPlaceholder({ message }: { message: string }) {
  return <p className={styles.placeholder}>{message}</p>;
}
