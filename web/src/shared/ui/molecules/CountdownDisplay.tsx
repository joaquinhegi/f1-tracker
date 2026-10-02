import styles from "./CountdownDisplay.module.css";

export interface CountdownDisplayProps {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Accessible summary, e.g. "Starts in 2 days 3 hours". */
  label: string;
  /** Render "--" instead of digits (e.g. before the client clock is known). */
  placeholder?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Big DD:HH:MM:SS display. Days are hidden when zero. */
export function CountdownDisplay({ days, hours, minutes, seconds, label, placeholder }: CountdownDisplayProps) {
  const units = [
    ...(days > 0 ? [{ value: String(days), unit: days === 1 ? "day" : "days" }] : []),
    { value: pad(hours), unit: "hrs" },
    { value: pad(minutes), unit: "min" },
    { value: pad(seconds), unit: "sec" },
  ];
  return (
    <div className={styles.countdown} role="timer" aria-label={label}>
      {units.map(({ value, unit }) => (
        <div key={unit} className={styles.unit} aria-hidden="true">
          <span className={styles.value}>{placeholder ? "--" : value}</span>
          <span className={styles.name}>{unit}</span>
        </div>
      ))}
    </div>
  );
}
