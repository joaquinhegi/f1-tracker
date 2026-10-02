/**
 * Smooth hand-overs between how a car is drawn (on track / in the pit lane /
 * parked in its box), so a car never teleports. Pure.
 */

export interface Pose {
  x: number;
  y: number;
  /** Degrees (SVG rotate). */
  heading: number;
  /** Extra scale (parked cars shrink to fit their box). */
  scale: number;
}

/** Parking or leaving the box: a visible glide. */
export const PARK_TRANSITION_MS = 900;
/** Track <-> pit lane: the drawn lane is offset from the real one, blend it. */
export const LANE_TRANSITION_MS = 350;
/** A playhead jump bigger than this (a seek) snaps instead of gliding. */
export const SEEK_JUMP_MS = 5_000;

/** Signed smallest rotation from `from` to `to`, degrees in (-180, 180]. */
export function headingDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

export const easeInOut = (k: number) => {
  const x = Math.max(0, Math.min(1, k));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
};

/** `from` blended into `to` by k (0..1, eased), turning the short way round. */
export function blendPose(from: Pose, to: Pose, k: number): Pose {
  const e = easeInOut(k);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    heading: from.heading + headingDelta(from.heading, to.heading) * e,
    scale: from.scale + (to.scale - from.scale) * e,
  };
}

export type MarkerMode = "track" | "pit" | "garage";

/** How long the hand-over between two modes takes (0: none). */
export function transitionMs(from: MarkerMode, to: MarkerMode): number {
  if (from === to) return 0;
  return from === "garage" || to === "garage" ? PARK_TRANSITION_MS : LANE_TRANSITION_MS;
}
