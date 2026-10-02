import { describe, expect, it } from "vitest";
import { nearestOnPolyline } from "./geometry";
import { displayPitLane, garageRail, laneAt, laneParking, railParking } from "./pit-display";

// SVG space: a straight along y = 100, lane 4 units above it (y down: y = 96).
const track = [{ x: 0, y: 100 }, { x: 1000, y: 100 }, { x: 1000, y: 900 }, { x: 0, y: 900 }];
const lane = [{ x: 100, y: 100 }, { x: 200, y: 96 }, { x: 800, y: 96 }, { x: 900, y: 100 }];

describe("displayPitLane", () => {
  const drawn = displayPitLane(lane, track, 20)!;

  it("pushes the lane clear of the track in the middle and keeps its real ends", () => {
    const mid = laneAt(drawn, drawn.along.at(-1)! / 2).point;
    expect(nearestOnPolyline(mid, track, true)!.distance).toBeGreaterThanOrEqual(19.9);
    expect(mid.y).toBeLessThan(96); // pushed away from the track, not across it
    expect(drawn.points[0]).toEqual(lane[0]);
    expect(drawn.points.at(-1)).toEqual(lane.at(-1));
  });

  it("points outward (away from the track) and parks cars nose to the lane", () => {
    const pose = laneAt(drawn, 400);
    expect(pose.outward.y).toBeCloseTo(-1, 1);
    expect(pose.direction.x).toBeCloseTo(1, 1);
    const spot = laneParking(drawn, { from: 200, to: 600 }, 0.5, 10);
    expect(spot.point.y).toBeLessThan(laneAt(drawn, 400).point.y);
    expect(spot.heading).toBeCloseTo(90, 0); // nose down, towards the lane
  });

  it("needs a lane and a track", () => {
    expect(displayPitLane([lane[0]], track, 20)).toBeNull();
  });
});

describe("garageRail", () => {
  it("sits beside the start/finish line on the side away from the rest of the track", () => {
    const rail = garageRail({ point: { x: 500, y: 100 }, direction: { x: 1, y: 0 } }, track, 30, 200);
    expect(rail.from.y).toBeCloseTo(70); // outside (above) the loop, not inside it
    expect(rail.to.x - rail.from.x).toBeCloseTo(200);
    const spot = railParking(rail, 0.5);
    expect(spot.point).toEqual({ x: 500, y: 70 });
    expect(spot.heading).toBeCloseTo(90); // nose towards the track
  });
});
