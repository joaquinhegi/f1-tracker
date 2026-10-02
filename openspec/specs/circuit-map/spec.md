# Circuit Map Specification

## Purpose

Draw a circuit's track from real car positions. The derivation includes its pit lane and timing sectors. The result is cached per circuit, and the page falls back gracefully when something cannot be derived.

Sources: `web/src/features/circuit/**`.

## Requirements

### Requirement: Outline derivation

The system MUST build a circuit's outline from one clean lap's `location` trace. The lap comes from the most recent finished, non-cancelled session at that circuit. The search MUST go back one season at a time from the current UTC year to 2023, and use the first year that has finished sessions. It MUST try at most 3 sessions, newest first, and at most 2 reference laps per session.

A reference lap MUST be clean: not a pit-out lap, with a start, a positive duration, and three positive sector times. It MUST also be within 107% of the session's fastest clean lap. Faster laps MUST be tried first.

The trace MUST drop non-finite points, `(0, 0)` and consecutive duplicates. A trace with fewer than 50 points MUST be rejected. The kept points MUST be simplified with a tolerance of 0.1% of the track's larger span. The start/finish line MUST be the trace's first point. Its direction MUST come from the first point at least 2% of the span away.

#### Scenario: No finished session at the circuit
- GIVEN no finished session at the circuit since 2023
- WHEN the outline is requested
- THEN the use case fails with `OutlineUnavailableError` (BFF `404 outline_unavailable`)

#### Scenario: No usable lap
- GIVEN the 3 most recent sessions have no clean lap with at least 50 position points
- WHEN the outline is requested
- THEN it fails with `outline_unavailable`, naming how many sessions were tried

### Requirement: Raw to SVG transform

The system MUST map raw OpenF1 `(x, y)`, which is y-up, to SVG units, which is y-down, by flipping y. This keeps each circuit's real handedness. The viewBox width MUST be 1000 with 40 units of padding. The scale MUST be the same on both axes. The height MUST follow the aspect ratio, rounded to 2 decimals. The outline DTO MUST carry this transform, so overlays (cars, pit lane) can project raw points with the same mapping. Directions in the DTO MUST have their y component flipped too.

#### Scenario: Car overlay alignment
- GIVEN a car sample at a raw point that lies on the outline
- WHEN it is projected with the DTO's `transform`
- THEN it lands on the drawn track path

### Requirement: Pit lane derivation

The system MUST trace the pit lane from a real stop. A stop window MUST run from the start of the in-lap (the lap before a pit-out lap, which must be lap 2 or later) to 4 minutes after the out-lap starts. Windows longer than 25 minutes MUST be skipped. The shortest windows MUST be tried first, at most 4 per session. Sessions MUST be tried with the outline's own session first, up to 3 sessions.

Within a window, the anchor MUST be the longest halt: at least 2 s within 3 m (30 raw units). From the halt, the system MUST walk back and forward until the car is within 2.5 m (25 units) of the outline for 2 s. Each walk MUST give up after 150 s. The lane MUST be simplified at 0.5 m. A lane shorter than 150 m (1500 units) MUST be rejected. The boxes stretch MUST be where the lane keeps 0.7 to 1.3 times the stop's distance from the track. It MUST span at least 30% of the lane and stay inside 5% to 95% of its length.

#### Scenario: No usable stop
- GIVEN no stop window yields a lane
- WHEN the pit lane is derived
- THEN the outline is cached with `pitLane: null`

### Requirement: Sector boundaries

The system MUST split the outline into S1, S2 and S3 using the source lap's sector times. Arc length 0 of the closed outline MUST be the start/finish line (S3 to S1). The S1/S2 and S2/S3 boundaries MUST be the car's position at lap start + S1 and lap start + S1 + S2. That position MUST be interpolated between samples and projected onto the outline. The projection MUST only search within ±12% of the lap length around the expected spot, wrapping across the start/finish line. The expected spot is the share of lap distance driven by then.

The system MUST produce no sectors (`null`) when any of these holds:
- a sector time is missing,
- a sample gap at a boundary is over 2 s,
- any sector is shorter than 8% of the lap.

#### Scenario: Crossover circuit
- GIVEN a circuit where the track crosses itself near a boundary
- WHEN the boundary is projected
- THEN it lands on the stretch within ±12% of the expected arc length, not on the crossing stretch

#### Scenario: Short sector
- GIVEN derived boundaries that make S2 shorter than 8% of the lap
- WHEN sectors are derived
- THEN `sectors` is `null` and the track is drawn in a single colour

### Requirement: Sector colours and labels

When sectors are known, the map MUST paint each sector in its colour token (`--sector-1/2/3`):
- dark theme: `#ff6b81`, `#7c9cff`, `#4cc9f0`
- light theme: `#c42847`, `#3b5bdb`, `#0b7285`

It MUST draw a tick at the S1/S2 and S2/S3 boundaries. It MUST place S1/S2/S3 labels just past each boundary, outside the loop, and show a sector legend under the map. Without sectors, the track MUST be one colour, with no ticks and no legend. Stroke widths MUST scale with viewBox width, so line weight looks the same on every circuit.

#### Scenario: Grid and map agree
- GIVEN sectors are known
- WHEN the map and the timing grid render
- THEN the grid's S1/S2/S3 headers carry the same colour swatches as the map

### Requirement: Outline caching and upgrades

The system MUST cache each built outline in memory and in `<cacheDir>/circuit-outlines/<circuitKey>.json`. The cache directory defaults to `.cache`, or `F1_CACHE_DIR`. Writes MUST be atomic (temp file plus rename). A missing or corrupt file, or one with a mismatching key, MUST trigger a rebuild. A cached outline whose `pitLane` or `sectors` is `undefined` MUST get only the missing parts on the next request, then be re-saved. Missing sectors are derived from the outline's own source lap. A provider failure while deriving a missing part MUST leave that part `undefined`, so it is retried later; it MUST NOT cache `null`. The server MUST memoize the outline use case for 60 s.

#### Scenario: Outline cached before sectors existed
- GIVEN a cached outline file without a `sectors` field
- WHEN the outline is requested
- THEN sectors are derived from its source lap and the file is rewritten with them

#### Scenario: Transient upstream failure
- GIVEN the pit-lane derivation throws a provider error
- WHEN the outline is completed
- THEN the track is returned and cached with `pitLane` still undefined

### Requirement: Map fallbacks

If the outline cannot be loaded, the map section MUST show "The track map is not available yet. It appears once a session at this circuit has position data." The playback footer MUST still render. While the outline streams in, a skeleton saying "Drawing the track…" MUST show. A loaded map MUST carry a caption naming its source: car number, lap, session name and year.

#### Scenario: New circuit
- GIVEN a circuit with no position data yet
- WHEN the page renders
- THEN the placeholder message replaces the map and the replay controls still show

## Known limitations

- React may report hydration error #418 on the circuit map section, which is a streamed Suspense boundary. Loading the theme toggle client-only reduces how often this happens but does not remove it.
- The outline comes from one lap of one car, so it follows the racing line rather than the track edges.
- The layout is cached forever. A changed circuit layout needs its cache file deleted by hand.
