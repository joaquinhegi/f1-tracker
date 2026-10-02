/** JSON contract of GET /api/circuits/[circuitKey]/outline. Client-safe. */
import type { Point } from "../domain/geometry";
import type { OutlineSource } from "../domain/track-outline";
import {
  createTrackTransform,
  projectPoint,
  toOpenSvgPath,
  toSvgPath,
  viewBoxOf,
  type TrackTransform,
} from "../domain/track-transform";
import type { TrackOutline } from "../domain/track-outline";
import { splitIntoSectors, type SectorBoundary } from "../domain/track-sectors";

export interface SectorBoundaryDto {
  /** Share of the lap distance from the start/finish line (0..1). */
  share: number;
  /** SVG coordinates. */
  point: Point;
  /** Direction of travel in SVG coordinates (unit vector). */
  direction: Point;
  /** Raw OpenF1 coordinates. */
  raw: Point;
}

export interface SectorsDto {
  /** Open SVG paths of S1, S2 and S3, in travel order (S3 ends at the start/finish line). */
  paths: [string, string, string];
  /** The S1/S2 and S2/S3 boundaries. */
  boundaries: [SectorBoundaryDto, SectorBoundaryDto];
}

export interface CircuitOutlineDto {
  circuitKey: number;
  /** `0 0 width height`. */
  viewBox: string;
  /** Rebuild the raw -> SVG mapping on the client with `projectPoint(transform, {x, y})`. */
  transform: TrackTransform;
  /** Closed SVG path, already projected. */
  path: string;
  /** Simplified outline in raw OpenF1 coordinates. */
  points: Point[];
  startFinish: {
    /** SVG coordinates. */
    point: Point;
    /** Direction of travel in SVG coordinates (unit vector). */
    direction: Point;
  } | null;
  /**
   * Pit lane traced from a real stop, raw OpenF1 coordinates from entry to
   * exit (project with `transform`), and the arc-length stretch (raw units)
   * that holds the boxes. null: unknown, park cars beside the start/finish line.
   */
  pitLane: {
    points: Point[];
    boxes: { from: number; to: number };
  } | null;
  /** Track split into its timing sectors. null: unknown, draw a single-colour track. */
  sectors: SectorsDto | null;
  source: OutlineSource;
  builtAt: string;
}

function boundaryToDto(transform: TrackTransform, boundary: SectorBoundary, length: number): SectorBoundaryDto {
  return {
    share: Math.round((boundary.along / length) * 10_000) / 10_000,
    point: projectPoint(transform, boundary.point),
    // y flips in SVG, so does the direction's y component.
    direction: { x: boundary.direction.x, y: -boundary.direction.y },
    raw: { x: Math.round(boundary.point.x), y: Math.round(boundary.point.y) },
  };
}

function sectorsToDto(transform: TrackTransform, outline: TrackOutline): SectorsDto | null {
  const sectors = outline.sectors;
  if (!sectors) return null;
  const [s1, s2, s3] = splitIntoSectors(outline.points, sectors);
  return {
    paths: [toOpenSvgPath(transform, s1), toOpenSvgPath(transform, s2), toOpenSvgPath(transform, s3)],
    boundaries: [
      boundaryToDto(transform, sectors.boundaries[0], sectors.length),
      boundaryToDto(transform, sectors.boundaries[1], sectors.length),
    ],
  };
}

export function outlineToDto(outline: TrackOutline): CircuitOutlineDto {
  const transform = createTrackTransform(outline.bounds);
  const sf = outline.startFinish;
  return {
    circuitKey: outline.circuitKey,
    viewBox: viewBoxOf(transform),
    transform,
    path: toSvgPath(transform, outline.points),
    points: outline.points,
    // y flips in SVG, so does the direction's y component.
    startFinish: sf
      ? {
          point: projectPoint(transform, sf.point),
          direction: { x: sf.direction.x, y: -sf.direction.y },
        }
      : null,
    pitLane: outline.pitLane ? { points: outline.pitLane.points, boxes: outline.pitLane.boxes } : null,
    sectors: sectorsToDto(transform, outline),
    source: outline.source,
    builtAt: outline.builtAt,
  };
}
