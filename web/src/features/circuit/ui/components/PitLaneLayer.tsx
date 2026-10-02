import type { Point } from "../../domain/geometry";
import type { GarageRail } from "../../domain/pit-display";
import styles from "./PitLaneLayer.module.css";

export interface PitLaneLayerProps {
  /** Drawn pit lane, SVG units (entry -> exit). */
  lane: readonly Point[] | null;
  /** Lane width, SVG units. */
  laneWidth: number;
  /** Fallback garages beside the start/finish line, when there is no lane. */
  rail: GarageRail | null;
  /** SVG units per 1/1000 of the map width (line weights). */
  unit: number;
}

const path = (points: readonly Point[]) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/**
 * Molecule: the pit lane drawn subtly beside the track (a dark road with a
 * dashed centre line), or, when the circuit's pit lane is unknown, a compact
 * garage rail beside the start/finish line.
 */
export function PitLaneLayer({ lane, laneWidth, rail, unit }: PitLaneLayerProps) {
  if (lane && lane.length > 1) {
    const d = path(lane);
    return (
      <g className={styles.layer} data-testid="pit-lane">
        <path d={d} className={styles.road} strokeWidth={laneWidth} />
        <path d={d} className={styles.centre} strokeWidth={Math.max(0.8 * unit, laneWidth * 0.12)} strokeDasharray={`${4 * unit} ${4 * unit}`} />
      </g>
    );
  }
  if (!rail) return null;
  const { from, to, outward } = rail;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const depth = laneWidth * 2.6;
  const cx = (from.x + to.x) / 2 + (outward.x * depth) / 2 - outward.x * laneWidth * 0.8;
  const cy = (from.y + to.y) / 2 + (outward.y * depth) / 2 - outward.y * laneWidth * 0.8;
  return (
    <g className={styles.layer} data-testid="garage-rail" transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${angle.toFixed(1)})`}>
      <rect x={-length / 2} y={-depth / 2} width={length} height={depth} rx={depth / 4} className={styles.rail} strokeWidth={unit} />
    </g>
  );
}
