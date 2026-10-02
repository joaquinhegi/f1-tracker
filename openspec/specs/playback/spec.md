# Playback Specification

## Purpose

Provide the single session clock that the map, the timing grid and the team radio read. The clock follows live with a delay, or replays with transport controls. Car locations are fetched and buffered in chunks around the playhead.

Sources: `web/src/features/playback/**`, `web/src/features/drivers/application/chunk-plan.ts`, `web/src/features/drivers/application/location-buffer.ts`, `web/src/features/drivers/ui/containers/CarOverlayContainer.tsx`.

## Requirements

### Requirement: Shared playback clock

The system MUST provide exactly one playback clock per selected session. The map, the grid and the radio MUST read it. The clock's mode MUST follow the session status:
- `live` gives a live clock,
- `finished` gives a replay clock,
- `upcoming` or `cancelled` gives no clock (nothing to play).

The status MUST be re-derived every second. An upcoming session MUST therefore switch to live, and a live one to replay, without a reload. Reading the playhead MUST be cheap enough to call every animation frame.

#### Scenario: Session starts while the page is open
- GIVEN an upcoming session is selected
- WHEN its start time passes
- THEN the clock switches to live mode without reloading

### Requirement: Live delay

In live mode, the playhead MUST be wall time minus 4 s (`LIVE_DELAY_MS`). Cars are then interpolated between samples already received. Live mode MUST ignore play, pause, seek and rate changes. The controls MUST show a Live badge explaining that positions and timing run 4 s behind real time.

#### Scenario: Live playhead
- GIVEN a live session
- WHEN the wall clock reads 14:00:10
- THEN the playhead is 14:00:06

### Requirement: Replay controls

A replay MUST start paused, at the session start or at the `?t=` offset. While playing, session time MUST advance at `rate` times real time and stop at the session end. Rates MUST be 1x, 2x, 4x, 8x and 16x. Play, pause and rate changes MUST re-anchor at the current playhead, so time never jumps. Pressing play at the end MUST restart from the session start. The scrubber MUST cover [0, duration] in 1 s steps and seek on change. Seeks MUST be clamped to the session bounds. The controls MUST show elapsed time, the playhead's wall-clock time in the viewer's zone, and the duration.

#### Scenario: Speed change
- GIVEN a replay playing at 1x at minute 12
- WHEN the viewer selects 8x
- THEN the playhead continues from minute 12 at eight times real speed

#### Scenario: Play at the end
- GIVEN a replay paused at the session end
- WHEN the viewer presses play
- THEN playback restarts from the session start

### Requirement: Replay start offset

`?t=<seconds>` MUST set the replay's initial playhead to session start + t seconds, clamped to the session. The value MUST be ignored unless it is a finite, non-negative number.

#### Scenario: Shared link
- GIVEN `/?session=11728&t=600` for a finished session
- WHEN the page loads
- THEN the replay is paused at 10:00 into the session

#### Scenario: Invalid offset
- GIVEN `?t=-5`
- WHEN the page loads
- THEN the replay starts at the session start

### Requirement: Location chunk fetching

Locations MUST be fetched in aligned chunks from `/api/sessions/:key/locations`, at most 2 requests at a time. A scheduler running every 500 ms MUST work through the plan in priority order.

- Replay: 60 s chunks. The plan is the current chunk, then enough chunks ahead for about 20 s of real time at the current rate (at least one), then the previous chunk. All chunks are clamped to the session.
- Live: 10 s chunks, from the chunk containing playhead − 2 s up to the chunk containing now. A live chunk MUST be re-fetched every 1 s until its end is at least 15 s behind the wall clock (settled).

A failed chunk MUST be retried after the shared exponential backoff.

#### Scenario: Fast replay prefetch
- GIVEN a replay at 16x
- WHEN the plan is computed
- THEN it holds the current chunk, 6 chunks ahead (ceil(16 × 20 s / 60 s)), and the previous chunk

### Requirement: Bounded location buffer

Inserting a window MUST replace whatever the buffer held for that time range. The buffer MUST track which ranges are loaded. A driver with no samples in a loaded range then counts as having no position, rather than as still loading. Every scheduler pass MUST trim the buffer to [playhead − 3 min, playhead + 10 min] and forget chunk bookkeeping outside it.

#### Scenario: Long replay
- GIVEN a two-hour race replayed from start to finish
- WHEN the playhead reaches the end
- THEN the buffer holds only samples within 3 min before to 10 min after the playhead

### Requirement: Playhead gating of other features

In replay, the timing grid and the team radio MUST only use data up to the playhead. A replay MUST never show laps, sectors, positions, pit stops or messages from after the playhead.

#### Scenario: Before the first lap
- GIVEN a replay paused at the session start
- WHEN the grid renders
- THEN no lap or sector times are shown

## Known limitations

- Live mode has not been tested end to end against a real live session. The 4 s delay and the 10 s / 15 s live chunk timings are untested against real feed latency.
- `?t=` is read only at load. Scrubbing does not update the URL.
