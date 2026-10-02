/**
 * Static layout of the map overlay for one rendered size: the drawn pit lane
 * (or the fallback garage rail) and each car's parking spot. Client-side,
 * pure: recomputed only when the outline, the entry list or the car size
 * changes, never per frame.
 */
import type { CircuitOutlineDto } from "@/features/circuit/application/circuit-outline-dto";
import type { Point } from "@/features/circuit/domain/geometry";
import {
  displayPitLane,
  garageRail,
  laneAt,
  laneParking,
  railParking,
  type DisplayLane,
  type GarageRail,
  type ParkingSpot,
} from "@/features/circuit/domain/pit-display";
import { projectPoint } from "@/features/circuit/domain/track-transform";
import { F1_CAR_LENGTH, F1_CAR_WIDTH } from "@/shared/ui/atoms/f1-car-geometry";
import { boxSlots, type SlotDriver } from "../domain/box-slots";

export type LayoutOutline = Pick<CircuitOutlineDto, "transform" | "points" | "startFinish" | "pitLane">;

export interface MapLayoutInput {
  outline: LayoutOutline;
  /** The whole entry list: every car has its box, shown or not. */
  drivers: readonly SlotDriver[];
  /** Car length on the map, SVG units. */
  carUnits: number;
  /** Rendered pixels per SVG unit. */
  pxPerUnit: number;
}

export interface MapLayout {
  /** Raw racing line and pit lane, for classifying cars. */
  track: Point[];
  pitLane: Point[] | null;
  /** Drawn pit lane, SVG units (null: no pit lane, see `rail`). */
  lane: DisplayLane | null;
  /** Width of the drawn lane, SVG units. */
  laneWidth: number;
  /** Fallback garages beside the start/finish line (null when a lane is drawn). */
  rail: GarageRail | null;
  /** Driver number -> where it parks. Missing: nowhere to park, hide it. */
  parking: Map<number, ParkingSpot>;
  /** Parked cars are shrunk to fit their box. */
  parkedScale: number;
  /** Labels of parked cars fit side by side. */
  parkedLabels: boolean;
  /** SVG units per raw unit (raw arc lengths -> drawn lane). */
  rawToSvg: number;
}

/** Half the track casing (CircuitMap draws it 22 units wide per 1000). */
const CASING_HALF_PER_1000 = 11;
/** Room between two parked cars, as a share of a car's width. */
const PARKED_GAP = 1.25;
/** Label pill width in car lengths (3 letters, see CarMarker). */
const LABEL_WIDTH_IN_CARS = 1.35;

export function buildMapLayout({ outline, drivers, carUnits, pxPerUnit }: MapLayoutInput): MapLayout {
  const { transform } = outline;
  const unit = transform.width / 1000;
  const px = 1 / pxPerUnit; // one screen pixel, SVG units
  const carWidth = (carUnits * F1_CAR_WIDTH) / F1_CAR_LENGTH;
  const casingHalf = CASING_HALF_PER_1000 * unit;
  const laneWidth = Math.max(3 * px, carWidth * 0.55);
  const track = outline.points;
  const trackSvg = track.map((p) => projectPoint(transform, p));
  const slots = boxSlots(drivers);
  const parking = new Map<number, ParkingSpot>();

  const fitScale = (stretch: number) => {
    const spacing = stretch * slots.spacing;
    return { spacing, scale: Math.min(1, spacing / (carWidth * PARKED_GAP)) };
  };

  // The drawn lane clears the casing and a car driving in it.
  const minOffset = casingHalf + laneWidth / 2 + carWidth * 0.5 + 3 * px;
  const pitLane = outline.pitLane;
  const lane = pitLane ? displayPitLane(pitLane.points.map((p) => projectPoint(transform, p)), trackSvg, minOffset) : null;

  if (pitLane && lane) {
    const boxes = { from: pitLane.boxes.from * transform.scale, to: pitLane.boxes.to * transform.scale };
    const { spacing, scale } = fitScale(boxes.to - boxes.from);
    const depth = laneWidth / 2 + (carUnits * scale) / 2 + px;
    for (const [driver, fraction] of slots.fractions) parking.set(driver, laneParking(lane, boxes, fraction, depth));
    return {
      track,
      pitLane: pitLane.points,
      lane,
      laneWidth,
      rail: null,
      parking,
      parkedScale: scale,
      parkedLabels: spacing >= carUnits * scale * LABEL_WIDTH_IN_CARS,
      rawToSvg: transform.scale,
    };
  }

  let rail: GarageRail | null = null;
  let parkedScale = 1;
  let parkedLabels = false;
  if (outline.startFinish) {
    const length = Math.min(transform.width * 0.4, Math.max(1, drivers.length) * carWidth * PARKED_GAP);
    const { spacing, scale } = fitScale(length);
    parkedScale = scale;
    parkedLabels = spacing >= carUnits * scale * LABEL_WIDTH_IN_CARS;
    rail = garageRail(outline.startFinish, trackSvg, casingHalf + (carUnits * scale) / 2 + 8 * px, length);
    for (const [driver, fraction] of slots.fractions) parking.set(driver, railParking(rail, fraction));
  }
  return { track, pitLane: null, lane: null, laneWidth, rail, parking, parkedScale, parkedLabels, rawToSvg: transform.scale };
}

/** Where a car driving the pit lane is drawn: on the drawn lane, at its real arc length. */
export function pitPose(layout: MapLayout, along: number): { point: Point; heading: number } | null {
  if (!layout.lane) return null;
  const pose = laneAt(layout.lane, along * layout.rawToSvg);
  return { point: pose.point, heading: (Math.atan2(pose.direction.y, pose.direction.x) * 180) / Math.PI };
}
