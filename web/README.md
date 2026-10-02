# F1 Live Tracker (web)

Next.js App Router app. The browser only talks to this app's BFF (`/api/*`); the
server talks to OpenF1.

## Run

```bash
pnpm install
cp .env.example .env.local   # optional, defaults work with infra/
pnpm dev                     # http://localhost:3000
```

Production: `pnpm build && pnpm start`.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Data sources

- Self-hosted OpenF1 (`infra/`, `OPENF1_SELF_HOSTED_URL`): live recordings, sessions backfilled from the F1 static archive, and the current-season schedule.
- Public OpenF1 (`OPENF1_PUBLIC_URL`): historical sessions since 2023. It rejects free requests while any session is live.

Routing lives in `src/shared/f1-data/infrastructure/routing-f1-data-provider.ts`:

- A session that is live, or present locally (it has a local driver list), is served from self-hosted. An empty local answer is completed from public when possible. If public fails, the local answer stands.
- The local-presence probe is remembered for 10 min when the session is found and 60 s when it is not. So a session backfilled meanwhile switches to self-hosted within a minute.
- A "live session in progress" 401 from public is remembered for 60 s, so polling clients do not spend the public rate limit on it.

## Page

`/?session=<key>&t=<seconds>`.

- `session` is one of this weekend's sessions; the default is live, else next, else last finished. Picking a tab updates the URL, so the view is shareable and server-rendered.
- `t` is where a replay starts, in seconds after the session start.

Under the map:

- The drivers + timing grid. Its checkboxes choose which cars appear on the map. They are stored per session in localStorage; the default is the top 3. A radio badge shows each driver's team radio count for the session.
- The team radio feed: all drivers by default (group chat), or one driver (click a row, or use the picker; drivers without messages are disabled). Before the first message the feed says how many there are and offers to jump the replay there.

## Theme

Light and dark, with a System / Light / Dark toggle in the header. System (the default) follows `prefers-color-scheme`, live. An explicit choice is stored in localStorage (`f1-tracker:theme`); when storage is blocked the toggle still works for the page view.

- Tokens: `src/shared/ui/styles/tokens.css` has one block per theme, selected by `data-theme` on `<html>`. Every colour token exists in both (enforced by `src/shared/theme/theme.test.ts`).
- No flash: an inline script in the root layout's `<head>` (`THEME_INIT_SCRIPT`) resolves the mode and sets `data-theme` and `color-scheme` before the first paint. `<html>` has `suppressHydrationWarning` because those attributes differ from the server HTML by design.
- Logic: `src/shared/theme/theme.ts` (pure, tested); `useThemeMode` keeps `<html>` painted and listens to the OS while in System mode.
- The toggle is loaded client-only (`ThemeToggleSlot`, same-size placeholder): the server cannot know the stored mode, and server-rendering it made the map's streamed Suspense boundary lose its hydration race more often.
- Colours computed in JS (radio sender names) are computed for both surfaces (`SURFACE_COLOUR`) and picked in CSS; car outlines use the `--car-outline-*` tokens.

## Playback clock

`src/features/playback` is the single source of session time for the map, the grid and the radio.

- **Live**: wall time minus 4 s, so cars are interpolated between samples already received. Locations are polled about every second in 10 s chunks.
- **Replay**: play / pause, 1x-16x, scrubber.
  - Locations are fetched in 60 s chunks: the current one, enough ahead for ~20 s of real time at the current speed, and the previous one.
  - At most 2 requests run at once. The buffer is bounded to [playhead − 3 min, playhead + 10 min].
- Cars are drawn every animation frame directly on the SVG. Positions use the outline's raw → SVG transform, and the heading comes from the position 250 ms ahead. With `prefers-reduced-motion` they update once per second.
- In replay, the grid and the radio only use data up to the playhead.

## Cars, pit lane and garages

What the location feed sends (checked on 2026 Kuala Lumpur FP1/FP2, sessions 11727/11728): `(0, 0)` before a car's first run (dropped by the BFF, so no samples), then the box position with 1-2 units of drift for as long as the car sits in its garage, and samples keep coming after the flag. The boxes are ~13 m from the racing line, so drawn raw a parked car sat on the main straight.

- **Pit lane** (`src/features/circuit/domain/pit-lane.ts`): traced once per circuit from a real stop: a pit-out lap and the lap before it, the longest halt (>= 2 s within 3 m) in that window, then walking back and forward until the car is within 2.5 m of the reference lap for 2 s. Lanes shorter than 150 m are rejected. The boxes stretch is where the lane keeps 0.7-1.3x the stop's distance from the track. It is cached in the outline file (`pitLane`; `null` means none could be traced).
- **Car state** (`src/features/drivers/domain/car-state.ts`), every frame: *garage* when the car has no position, or moved < 3 m over +-15 s (>= 14 s of samples) within 15 m of the lane (no lane known: > 4 m off the racing line); *pit* within 6 m of the lane and closer to it than to the track; else *track*.
- **Drawing**: the lane is pushed clear of the track casing, blending back to the real lane at entry and exit. Pit cars follow it by arc length. Parked cars sit in team-grouped boxes (teams ordered by their lowest car number, teammates by number), shrunk to fit. Without a lane they park on a rail beside the start/finish line, outside the track. Mode changes glide (0.9 s to/from the garage, 0.35 s track/pit); seeks snap.
- Cars are sized from the map's rendered width (3.2%, 20-30 px long), so they stay legible at 360 px.

## Track sectors

The outline's source lap (one clean lap of one driver, the lap that drew the track) also splits it into S1 / S2 / S3 (`src/features/circuit/domain/track-sectors.ts`):

- Arc length 0 of the closed outline is the lap start, i.e. the start/finish line (S3 -> S1).
- The S1/S2 and S2/S3 boundaries are the car's position at `date_start + duration_sector_1` (and `+ duration_sector_2`), interpolated between location samples, projected onto the outline. The projection only searches ±12% of the lap around the expected spot (the share of the lap distance driven by then), wrapping around the line, so a crossover or a parallel straight cannot capture it.
- A sector shorter than 8% of the lap, a missing sector time, or a sample gap over 2 s at a boundary means no sectors: the track stays single-colour.
- Cached in the outline file (`sectors`; `null` means none could be placed). A file cached before sectors existed gets them on the next request, from its own source lap.

Colours (`--sector-1/2/3` in `tokens.css`): rose `#ff6b81`, periwinkle `#7c9cff`, cyan `#4cc9f0` in dark (`#c42847`, `#3b5bdb`, `#0b7285` in light), kept clear of the timing purple / green / yellow and the lilac accent. The map labels each boundary (S1/S2/S3) and the grid's S1/S2/S3 headers carry the same colour dots.

## Timing rules (`src/features/timing/domain`)

- **Sectors / laps**: purple = fastest of the session so far, green = the driver's best so far, else yellow. A sector shows the current lap once the car crossed it, else the previous lap's value (faded).
- **Race pace**: the mean of the last 5 clean laps, with at least 3 needed. A lap is not clean if it:
  - is untimed,
  - is a pit-out lap,
  - is a pit-in lap (the lap of a `pit` record),
  - is slower than 107% of the driver's median timed lap.
- **Gaps, race / sprint**: from `intervals`. A driver's `interval` is the gap ahead; the next car's `interval` is the gap behind. "+1 LAP" strings become lap gaps; null shows "—".
- **Gaps, practice / qualifying**: deltas between best laps. Rows are ordered by best lap set by the playhead.

## Team radio

OpenF1 only gives recordings (`recording_url` on `livetiming.formula1.com/static`), no transcript. They play directly in a plain `<audio>` element, which was verified in Chrome (metadata, duration 5.04 s).

- The host sends no CORS headers. A media element without `crossorigin` does not need them, and a foreign `Referer` is accepted (206 with ranges). So there is no audio proxy.
- The BFF only passes https URLs on that host.

## BFF endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/weekend/current` | `WeekendOverviewDto` (`src/features/weekend/application/weekend-dto.ts`) |
| `GET /api/circuits/:circuitKey/outline` | `CircuitOutlineDto` (`src/features/circuit/application/circuit-outline-dto.ts`), with `pitLane` (raw points + boxes arc range, or null) and `sectors` (three SVG paths + two boundaries, or null) |
| `GET /api/sessions/:sessionKey/drivers` | `SessionDriversDto` (`src/features/drivers/application/driver-dto.ts`) |
| `GET /api/sessions/:sessionKey/locations?from&to` | `LocationWindowDto` (`src/features/drivers/application/location-dto.ts`): all cars, flat `[msSinceFrom, x, y, ...]` per driver, one upstream call |
| `GET /api/sessions/:sessionKey/timing` | `SessionTimingDto` (`src/features/timing/application/timing-dto.ts`): laps, stints, positions, pit stops |
| `GET /api/sessions/:sessionKey/intervals?from&to` | `IntervalWindowDto` (same file), gaps parsed to `{kind:"time",seconds}` / `{kind:"laps",laps}` |
| `GET /api/sessions/:sessionKey/team-radio` | `TeamRadioDto` (`src/features/radio/application/radio-dto.ts`), with the lap of each message |

Windowed endpoints need `from` / `to` (ISO 8601) aligned to 5 s and at most 120 s apart (`src/shared/time/time-window.ts`). Clients ask for aligned chunks, so every viewer of a session shares the same cache keys.

Caching works on three levels:

- Upstream answers are cached in the server's TTL cache with in-flight coalescing: 2 s while live, 1 h otherwise.
- DTOs are memoized: 1 s live, 5 min otherwise.
- Browsers get `max-age=1` while live, 5 min for finished sessions, and `immutable` for finished windows.

Errors: `{ "error": { "code", "message" } }` with these statuses:

- `400`
- `404`: `outline_unavailable`, `no_meeting`
- `502`
- `503`: `upstream_restricted`, `rate_limited`, with `Retry-After`

The UI retries with exponential backoff (honouring `Retry-After`), pauses while offline, and keeps the last data on screen.

Circuit outlines (with their pit lane) are cached in `.cache/circuit-outlines/<circuitKey>.json`. Delete a file to rebuild that outline. A file cached before pit lanes or sectors existed gets them on the next request.
