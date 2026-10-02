# Timing Grid Specification

## Purpose

Show the drivers and timing board of the selected session at the playback clock: position, lap and sector times with F1 colouring, race pace, tyre, gaps, and map/radio selection.

Sources: `web/src/features/timing/**`.

## Requirements

### Requirement: Columns and alignment contract

The grid MUST render these columns in order, defined once in `GRID_COLUMNS`:

| Column | Header | Alignment |
|---|---|---|
| show-on-map checkbox | hidden label | center |
| Pos | Pos | end |
| Driver | Driver | start |
| Last lap | Last lap | end |
| S1, S2, S3 | S1, S2, S3, each with its sector colour swatch | end |
| Best | Best | end |
| Pace | Pace | end |
| Tyre | Tyre | start |
| Ahead | Ahead | end |
| Behind | Behind | end |

Header cells, body cells and `<col>` widths MUST all come from that one definition, so a header always shares its values' alignment. Numbers MUST be tabular. Time chips MUST fill their column, so coloured boxes have equal width in every row. The checkbox, Pos and Driver columns MUST be sticky while the table scrolls horizontally.

#### Scenario: Header and cells agree
- GIVEN the rendered grid
- WHEN any column's header and its cells are inspected
- THEN they carry the same alignment class

### Requirement: Board at the playhead

The board MUST be built only from data up to the playhead `t`:
- laps started by `t`,
- sector times whose crossing time is at or before `t`,
- the latest position, pit and interval records at or before `t`.

Every entry-list driver MUST get a row, even without data. The client MUST poll timing every 4 s while live, and load it once in replay.

#### Scenario: Sector not reached yet
- GIVEN a car 20 s into a lap whose S1 took 30 s
- WHEN the board is built
- THEN S1 shows the previous lap's S1, faded and marked "previous lap"

### Requirement: Sector and lap chip colouring

Sector, last-lap and best-lap values MUST be coloured by F1 convention, using only data revealed by `t`:
- purple (`overall-best`) for the session's fastest so far,
- green (`personal-best`) for the driver's own best so far,
- yellow (`normal`) otherwise.

A sector cell MUST show the current lap's value once the car has crossed that sector. Otherwise it MUST show the previous lap's value, faded. A missing value MUST show "—". Times MUST format as `m:ss.sss` or `ss.sss`. The legend MUST explain the colours, the fading, and the pace rule.

#### Scenario: New fastest sector
- GIVEN the overall best S2 so far is 30.500
- WHEN a driver completes S2 in 30.400
- THEN that S2 chip is purple

### Requirement: Race pace rule

Pace MUST be the mean of the driver's last 5 clean completed laps, ordered by lap number. At least 3 clean laps MUST be available, otherwise pace is "—". A lap MUST NOT count as clean if it is any of these:
- untimed,
- a pit-out lap,
- a pit-in lap (the lap of a `pit` record at or before `t`),
- slower than 107% of the driver's median timed lap. The median is taken excluding pit laps.

#### Scenario: Safety car laps
- GIVEN a driver with laps of 92 s, 93 s, 92.5 s, 125 s (safety car) and 92.8 s
- WHEN pace is computed
- THEN the 125 s lap is excluded and pace is the mean of the four others

#### Scenario: Too few laps
- GIVEN a driver with 2 clean laps
- WHEN pace is computed
- THEN pace shows "—"

### Requirement: Ordering

In race-like sessions (Race, Sprint), rows MUST follow the position feed. Ties are broken by best lap, then car number. In other sessions, rows MUST be ordered by best lap set by `t`. Cars without a lap MUST follow, ordered by feed position, then car number. Positions MUST be rewritten as 1..n for cars with a best lap.

#### Scenario: Practice ordering overrides a lagging position feed
- GIVEN the position feed lists A ahead of B, but B has the faster best lap by `t`
- WHEN a practice board is built
- THEN B is ranked ahead of A

### Requirement: Gap rules

In race-like sessions, gaps MUST come from OpenF1 `intervals`:
- a driver's `interval` is its gap ahead,
- the next car's `interval` is its gap behind,
- the leader's Ahead cell MUST show "Leader".

The client MUST load intervals for the window [minute before the playhead's minute, +120 s). This window is aligned to 60 s and polled every 2 s while live, keeping the previous window's data until the new one arrives.

In practice and qualifying, gaps MUST be the deltas between best laps:
- ahead = own best − best of the car ahead,
- behind = best of the car behind − own best,
- no gap without both best laps.

Gaps MUST format as follows:
- `+0.523` below 10 s and `+12.3` from 10 s,
- `+1 LAP` / `+N LAPS` for lap gaps,
- "—" when the gap is null.

The section caption MUST say "Gaps from live intervals" for race-like sessions and "Gaps from best laps" otherwise.

#### Scenario: Lapped car
- GIVEN OpenF1 reports `interval: "+1 LAP"` for a car
- WHEN its Ahead gap renders
- THEN it shows `+1 LAP`

### Requirement: Tyres

The tyre cell MUST show the compound initial and its age in laps. The stint used MUST be the latest one whose start lap is at or before the current lap (live `lap_end` is not trusted). Age MUST be the tyre age at stint start plus laps since the stint start. Unknown compounds MUST show "?". With no stint, the cell MUST show "—".

#### Scenario: Second stint
- GIVEN stints `[1: laps 1–20, SOFT, age 0]` and `[2: from lap 21, HARD, age 3]`
- WHEN the car is on lap 25
- THEN the tyre shows `H 7L`

### Requirement: Focus and map selection

Clicking a row, or its driver button, MUST focus that driver. Focusing highlights the row and the map car, and sets the team radio filter to that driver. The row checkbox MUST toggle the car on the map without focusing. The driver cell MUST show a team-colour bar, the acronym, the team name, and a radio badge with the driver's session message count when it is above zero.

#### Scenario: Toggle without focus
- GIVEN driver A is focused
- WHEN the viewer ticks driver B's checkbox
- THEN B appears on the map and A stays focused

### Requirement: Grid states

With no playback clock (upcoming or cancelled session), the grid MUST say timing appears when the session starts. A load error without prior data MUST show a described error with Retry. While loading it MUST show a skeleton. With no rows it MUST say the entry list is not published yet.

#### Scenario: Upstream restricted
- GIVEN the timing request fails with `upstream_restricted` and no data was loaded
- WHEN the grid renders
- THEN it shows "Data source restricted" with a Retry action

## Known limitations

- Qualifying is ordered by best lap over the whole session. Q1/Q2/Q3 knockout order and eliminated drivers are not modelled.
- Practice and qualifying gaps are best-lap deltas, not live intervals.
- Overall-best colouring is computed from revealed sectors only. Deleted (track-limits) laps are not excluded.
