import type { ReactNode } from "react";
import { Surface } from "@/shared/ui/atoms/Surface";
import styles from "./SectionCard.module.css";

export interface SectionCardProps {
  id: string;
  title: ReactNode;
  caption?: ReactNode;
  /** aria-busy while the content is loading. */
  busy?: boolean;
  children: ReactNode;
}

/** Titled page section on a card surface. */
export function SectionCard({ id, title, caption, busy, children }: SectionCardProps) {
  return (
    <Surface as="section" aria-labelledby={id} aria-busy={busy || undefined} className={styles.card}>
      <header className={styles.header}>
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {caption && <p className={styles.caption}>{caption}</p>}
      </header>
      {children}
    </Surface>
  );
}
