import type { ReactNode } from "react";
import { SECTORS, sectorColourClass } from "@/shared/ui/atoms/SectorSwatch";
import type { CircuitOutlineDto } from "../../application/circuit-outline-dto";
import type { Point } from "../../domain/geometry";
import styles from "./CircuitMap.module.css";

export interface CircuitMapProps {
  outline: Pick<CircuitOutlineDto, "viewBox" | "path" | "startFinish" | "transform"> & Partial<Pick<CircuitOutlineDto, "sectors">>;
  title: string;
  /** Extra SVG layers drawn in the same coordinate space (Phase 5: car markers). */
  children?: ReactNode;
}

interface SectorMark {
  sector: 1 | 2 | 3;
  point: Point;
  direction: Point;
}

/**
 * Where a sector label goes: a little past the boundary, on the side of the
 * track facing away from the map centre (so it sits outside the loop).
 */
export function sectorLabelPosition(mark: SectorMark, centre: Point, unit: number): Point {
  const ahead = { x: mark.point.x + mark.direction.x * 40 * unit, y: mark.point.y + mark.direction.y * 40 * unit };
  let normal = { x: -mark.direction.y, y: mark.direction.x };
  if (normal.x * (ahead.x - centre.x) + normal.y * (ahead.y - centre.y) < 0) normal = { x: -normal.x, y: -normal.y };
  return { x: ahead.x + normal.x * 36 * unit, y: ahead.y + normal.y * 36 * unit };
}

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * Organism: SVG track outline. Coordinates come pre-projected from the BFF;
 * overlays must use `projectPoint(outline.transform, rawPoint)` to align.
 * With sectors known, the track is painted per sector (the same colours as
 * the grid's S1/S2/S3 headers) with a labelled tick at each boundary.
 */
export function CircuitMap({ outline, title, children }: CircuitMapProps) {
  const { viewBox, path, startFinish, transform, sectors } = outline;
  // Stroke widths scale with the viewBox so the line weight looks the same on every circuit.
  const unit = transform.width / 1000;
  const sf = startFinish;
  const half = 18 * unit;
  const centre = { x: transform.width / 2, y: transform.height / 2 };
  const marks: SectorMark[] = sectors
    ? [
        ...(sf ? [{ sector: 1 as const, point: sf.point, direction: sf.direction }] : []),
        { sector: 2, point: sectors.boundaries[0].point, direction: sectors.boundaries[0].direction },
        { sector: 3, point: sectors.boundaries[1].point, direction: sectors.boundaries[1].direction },
      ]
    : [];
  return (
    <svg className={styles.map} viewBox={viewBox} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
      <title>{title}</title>
      <path d={path} className={styles.casing} strokeWidth={22 * unit} />
      {sectors ? (
        <g data-testid="sectors">
          {SECTORS.map((sector, i) => (
            <path
              key={sector}
              d={sectors.paths[i]}
              className={`${styles.sector} ${sectorColourClass(sector)}`}
              strokeWidth={8 * unit}
              data-sector={sector}
            />
          ))}
        </g>
      ) : (
        <path d={path} className={styles.track} strokeWidth={9 * unit} />
      )}
      {marks
        .filter((m) => m.sector !== 1)
        .map((m) => (
          <line
            key={m.sector}
            className={styles.tick}
            x1={r(m.point.x - m.direction.y * 15 * unit)}
            y1={r(m.point.y + m.direction.x * 15 * unit)}
            x2={r(m.point.x + m.direction.y * 15 * unit)}
            y2={r(m.point.y - m.direction.x * 15 * unit)}
            strokeWidth={4 * unit}
            data-boundary={`S${m.sector - 1}/S${m.sector}`}
          />
        ))}
      {sf && (
        <g className={styles.startFinish} aria-label="Start / finish line">
          <line
            x1={sf.point.x - sf.direction.y * half}
            y1={sf.point.y + sf.direction.x * half}
            x2={sf.point.x + sf.direction.y * half}
            y2={sf.point.y - sf.direction.x * half}
            strokeWidth={7 * unit}
          />
          <circle cx={sf.point.x + sf.direction.x * 34 * unit} cy={sf.point.y + sf.direction.y * 34 * unit} r={6 * unit} />
        </g>
      )}
      {marks.map((m) => {
        const at = sectorLabelPosition(m, centre, unit);
        return (
          <text
            key={m.sector}
            className={`${styles.sectorLabel} ${sectorColourClass(m.sector)}`}
            x={r(at.x)}
            y={r(at.y)}
            dy="0.35em"
            textAnchor="middle"
            aria-hidden="true"
          >
            S{m.sector}
          </text>
        );
      })}
      {children}
    </svg>
  );
}
