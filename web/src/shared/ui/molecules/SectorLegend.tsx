import { SECTORS, SectorSwatch } from "../atoms/SectorSwatch";
import styles from "./SectorLegend.module.css";

/** Compact key of the sector colours shared by the track map and the timing grid. */
export function SectorLegend({ className }: { className?: string }) {
  return (
    <ul className={[styles.legend, className].filter(Boolean).join(" ")} aria-label="Track sectors">
      {SECTORS.map((sector) => (
        <li key={sector} className={styles.item}>
          <SectorSwatch sector={sector} />
          <span className={styles.label}>Sector {sector}</span>
        </li>
      ))}
    </ul>
  );
}
