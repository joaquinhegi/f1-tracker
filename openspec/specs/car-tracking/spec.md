# Car Tracking Specification

## Purpose

Show the session's entry list and let the viewer choose which cars appear on the map. Each car is drawn at its interpolated position, classified as on track, in the pit lane or in its garage, with smooth hand-overs between those states.

Sources: `web/src/features/drivers/**`, `web/src/features/circuit/domain/pit-display.ts`, `web/src/features/circuit/ui/components/PitLaneLayer.tsx`.

## Requirements

### Requirement: Entry list

The system MUST return one driver per car number, sorted by number. When OpenF1 repeats a driver, the last row MUST win. A team colour MUST be normalized to `#RRGGBB`. An invalid or missing colour MUST fall back to `#8B949E`. While the session is live, the client MUST re-poll the entry list every 60 s.

#### Scenario: Duplicate driver rows
- GIVEN OpenF1 returns two rows for car 4 with different team colours
- WHEN the entry list is built
- THEN car 4 appears once, with the later row's data

### Requirement: Driver selection and persistence

The cars shown on the map MUST be resolved in this order:
1. the viewer's choice in this page view,
2. the stored choice for this session,
3. the default.

The default MUST be the first 3 cars of the running order. It MUST be applied once, the first time any row has a position. The focused driver MUST default to the leader. The choice MUST be stored in localStorage under `f1-tracker:checked-drivers:<sessionKey>` as a JSON array of positive integers. Unreadable, blocked or full storage MUST NOT break the page: the choice simply is not remembered. Changes MUST propagate to other tabs (`storage` event) and within the tab. The server snapshot MUST be "nothing stored", so hydration never mismatches. The grid MUST offer "Show all" and "Show none".

#### Scenario: First visit
- GIVEN no stored selection for the session
- WHEN the running order becomes known
- THEN the top 3 cars are checked and the leader is focused

#### Scenario: Return visit
- GIVEN a stored selection `[44, 1]` for the session
- WHEN the page loads
- THEN exactly cars 44 and 1 are drawn

#### Scenario: Storage blocked
- GIVEN localStorage throws on access
- WHEN the viewer toggles a driver
- THEN the map updates for this page view and nothing is persisted

### Requirement: Car markers

Each checked car present in the entry list MUST be drawn as a car shape in its team colour. The shape MUST carry an acronym label pill. The focused driver MUST get a highlight ring, a highlighted pill, and be drawn on top. A car's length MUST be 3.2% of the map's rendered width, clamped to 20 to 30 px. Before the map is measured, a 780 px map MUST be assumed. Markers MUST be moved directly on the SVG every animation frame, without React re-renders.

#### Scenario: Narrow screen
- GIVEN the map renders 360 px wide
- WHEN car size is computed
- THEN cars are 20 px long (the minimum)

### Requirement: Position interpolation and heading

A car's position at time `t` MUST be linearly interpolated between the samples around `t`. Interpolation MUST NOT cross a gap over 5 s. Past the last sample (or before the first), or across a gap, the car MUST be held at the edge sample for at most 1.5 s, then have no position. The heading MUST point from the position at `t` toward the position 250 ms later, in SVG space. Below 0.5 SVG units of movement, the previous heading MUST be kept.

#### Scenario: Feed gap
- GIVEN samples at 10.0 s and 17.0 s
- WHEN the playhead is 13.0 s
- THEN the car has no interpolated position there; it is held at the 10.0 s sample only until 11.5 s

### Requirement: Car state classification

Every frame, each car MUST be classified as `garage`, `pit` or `track` from its samples and the outline. Raw units are about decimetres.

- `garage` applies when the car has no position at `t`. It also applies when the car is parked and either of these holds:
  - a pit lane is known and the car is closer to the lane than to the track, within 15 m (150 units) of it;
  - no pit lane is known and the car is more than 4 m (40 units) off the racing line.
- Parked means the car stayed within 3 m (30 units) of its position over `t` ± 15 s, with at least 14 s of samples in that window.
- `pit` applies when the car is not in the garage and is within 6 m (60 units) of the pit lane while closer to it than to the track.
- `track` applies otherwise. A car parked on the racing line (grid, stopped on track) MUST stay `track`.

#### Scenario: Parked in the box
- GIVEN a car reporting the same position (±2 units) for 30 s, 13 m from the racing line next to the pit lane
- WHEN it is classified
- THEN it is `garage`

#### Scenario: Short pit stop
- GIVEN a car halted for 3 s in the pit lane during a race stop
- WHEN it is classified
- THEN it is `pit` (the still window needs 14 s of coverage)

#### Scenario: Car not yet out
- GIVEN a car with no samples (its `(0, 0)` reports were dropped)
- WHEN it is classified
- THEN it is `garage`

### Requirement: Pit lane drawing and box slots

When a pit lane is known, the system MUST draw it pushed clear of the track casing, blending back to the real lane at entry and exit. The blend at each end covers 12% of the lane length, at most 70 SVG units. `pit` cars MUST follow the drawn lane at their real arc length.

Every car in the entry list MUST get a box on the boxes stretch, shown or not. Teams MUST be grouped, ordered by their lowest car number, with teammates ordered by number. A car without a team MUST get its own garage. A gap of 0.25 car widths MUST separate teams. Parked cars MUST be scaled down to fit their box. Their labels MUST be hidden when they do not fit side by side, except for the focused driver.

Without a pit lane, cars MUST park on a rail beside the start/finish line, outside the track. The rail MUST be at most 40% of the map width, on the outside of the circuit when there is room. Otherwise it goes on the side with the most clearance.

#### Scenario: Stable box
- GIVEN the same entry list in two sessions of a season
- WHEN box slots are computed
- THEN each car parks in the same position along the stretch

#### Scenario: Circuit without a traced lane
- GIVEN the outline has `pitLane: null`
- WHEN parked cars are drawn
- THEN they sit on a garage rail beside the start/finish line, not on the track

### Requirement: Motion between states

A change between `track`, `pit` and `garage` MUST glide rather than jump. Changes to or from `garage` take 0.9 s. Changes between `track` and `pit` take 0.35 s. Glides MUST be eased and turn the short way round. A playhead jump of more than 5 s (a seek) MUST snap with no glide. While the window around the playhead is still loading, markers MUST keep their last pose. Once it is loaded, a car that cannot be placed MUST be hidden.

#### Scenario: Seek
- GIVEN a replay at minute 10
- WHEN the viewer scrubs to minute 40
- THEN every car snaps to its new position without gliding

### Requirement: Reduced motion

When `prefers-reduced-motion: reduce` matches, markers MUST update once per second instead of every frame. They MUST NOT glide between states.

#### Scenario: Reduced motion enabled
- GIVEN the OS requests reduced motion
- WHEN a replay plays
- THEN cars move in discrete one-second steps

### Requirement: Overlay notices

The overlay MUST show "Car positions unavailable, retrying…" when the chunk under the playhead failed. When the buffer holds no samples at all, it MUST show one of these:
- live: "No car positions in the live feed (they need an F1TV token on the recorder)."
- replay: "No car positions for this part of the session."

#### Scenario: Live without token
- GIVEN a live session whose recorder has no F1TV token
- WHEN location chunks load empty
- THEN the live "no car positions" notice is shown

## Known limitations

- Box order is not the real garage order. It is derived from car numbers and teams, because the feed carries no constructor standings.
- Classification thresholds were calibrated on 2026 Kuala Lumpur FP1/FP2 (sessions 11727/11728) only.
- In live mode, the ±15 s still window has little future data, so parking is detected later than in replay.
