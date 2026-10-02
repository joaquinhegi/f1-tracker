import styles from "./SectorSwatch.module.css";

export type SectorNumber = 1 | 2 | 3;

export const SECTORS: readonly SectorNumber[] = [1, 2, 3];

/** CSS class that sets `--sector-colour` for a sector (for strokes, underlines, labels). */
export function sectorColourClass(sector: SectorNumber): string {
  return styles[`s${sector}`];
}

/** Small decorative dot in a sector's colour (the same colours as the map). */
export function SectorSwatch({ sector }: { sector: SectorNumber }) {
  return <span className={`${styles.swatch} ${sectorColourClass(sector)}`} aria-hidden="true" data-sector={sector} />;
}
