import type { Bounds, Point } from "./geometry";

/**
 * Maps OpenF1 `location` coordinates (x, y, same frame as the F1 live timing
 * Position feed) to SVG user units.
 *
 * The feed uses a y-up frame (plotted with y up, circuits have their real
 * handedness: Monza runs clockwise, Interlagos counter-clockwise). SVG is
 * y-down, so y is flipped; without the flip every circuit is mirrored.
 *
 * Phase 5 places car markers with `projectPoint` and the transform returned
 * by the outline endpoint, so markers and outline always line up.
 */
export interface TrackTransform {
  /** Raw-frame bounds the transform was built from. */
  bounds: Bounds;
  /** SVG units per raw unit (same on both axes: aspect ratio preserved). */
  scale: number;
  /** SVG units of empty space around the track. */
  padding: number;
  /** viewBox = `0 0 width height`. */
  width: number;
  height: number;
}

export interface TransformOptions {
  /** viewBox width in SVG units; height follows the track's aspect ratio. */
  width?: number;
  padding?: number;
}

export function createTrackTransform(bounds: Bounds, options: TransformOptions = {}): TrackTransform {
  const width = options.width ?? 1000;
  const padding = options.padding ?? 40;
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = (width - 2 * padding) / spanX;
  const height = Math.round((spanY * scale + 2 * padding) * 100) / 100;
  return { bounds, scale, padding, width, height };
}

/** Raw OpenF1 (x, y) -> SVG (x, y). */
export function projectPoint(transform: TrackTransform, point: Point): Point {
  const { bounds, scale, padding } = transform;
  return {
    x: padding + (point.x - bounds.minX) * scale,
    y: padding + (bounds.maxY - point.y) * scale,
  };
}

export function viewBoxOf(transform: TrackTransform): string {
  return `0 0 ${transform.width} ${transform.height}`;
}

/** Open SVG path through the projected points (1 decimal is plenty). */
export function toOpenSvgPath(transform: TrackTransform, points: readonly Point[]): string {
  return points
    .map((p, i) => {
      const { x, y } = projectPoint(transform, p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Closed SVG path through the projected points. */
export function toSvgPath(transform: TrackTransform, points: readonly Point[]): string {
  if (points.length === 0) return "";
  return `${toOpenSvgPath(transform, points)} Z`;
}
