import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/atoms/Badge";
import styles from "./WeekendHero.module.css";

export interface WeekendHeroProps {
  name: string;
  officialName: string;
  countryName: string;
  countryFlagUrl: string | null;
  circuitName: string;
  location: string;
  dateRange: string;
  phase: "current" | "upcoming" | "finished";
  children?: ReactNode;
}

const PHASE_LABEL = {
  current: "This weekend",
  upcoming: "Next race weekend",
  finished: "Latest race weekend",
} as const;

export function WeekendHero(props: WeekendHeroProps) {
  const { name, officialName, countryName, countryFlagUrl, circuitName, location, dateRange, phase, children } =
    props;
  return (
    <section className={styles.hero} aria-labelledby="weekend-title">
      <div className={styles.heading}>
        <div className={styles.eyebrow}>
          <Badge tone={phase === "current" ? "accent" : "muted"}>{PHASE_LABEL[phase]}</Badge>
          <span className={styles.dates}>{dateRange}</span>
        </div>
        <h1 id="weekend-title" className={styles.title}>
          {name}
        </h1>
        <p className={styles.official}>{officialName}</p>
        <p className={styles.place}>
          {countryFlagUrl && (
            // Remote flag from media.formula1.com; tiny, so no next/image config needed.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={countryFlagUrl} alt="" width={24} height={14} className={styles.flag} />
          )}
          <span>{countryName}</span>
          <span aria-hidden="true">·</span>
          <span>{circuitName === location ? circuitName : `${circuitName}, ${location}`}</span>
        </p>
      </div>
      {children}
    </section>
  );
}
