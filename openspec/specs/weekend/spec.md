# Weekend Specification

## Purpose

Pick the race weekend shown on the landing page, derive each session's status, render the session tabs and countdown, and keep the selected session in the URL.

Sources: `web/src/features/weekend/**`, `web/src/app/page.tsx`, `web/src/app/_components/WeekendSessionSwitcher.tsx`, `web/src/shared/ui/molecules/Tabs.tsx`.

## Requirements

### Requirement: Meeting selection

The system MUST select one meeting from the current UTC year's schedule. It MUST ignore cancelled meetings. A meeting's span MUST run from local midnight (circuit UTC offset) before its earliest start to local midnight after its latest end. Both the meeting's own dates and its sessions count. The selection MUST be the meeting whose span contains now (phase `current`). If there is none, it MUST be the next upcoming one (`upcoming`). If there is none of those either, it MUST be the last finished one (`finished`).

When the current year yields no meeting or only a `finished` one, the system MUST try the next year. It MUST use the next year only if that year yields a non-finished meeting. A failure loading the next year MUST keep the current year's result. If neither year yields a meeting, the system MUST fail with `NoMeetingFoundError` (BFF `404 no_meeting`).

#### Scenario: Now inside a meeting's local days
- GIVEN a meeting whose sessions run Friday to Sunday in circuit local time
- WHEN now is Saturday at any hour, circuit local time
- THEN that meeting is selected with phase `current`

#### Scenario: Season over, next season published
- GIVEN every meeting of the current year has finished
- AND next year's schedule has an upcoming meeting
- WHEN the overview is built
- THEN next year's first upcoming meeting is selected with phase `upcoming`

#### Scenario: Season over, next season not published
- GIVEN every meeting of the current year has finished
- AND loading next year fails or returns nothing upcoming
- WHEN the overview is built
- THEN the last finished meeting is selected with phase `finished`

### Requirement: Session status

A session's status MUST be `cancelled` when it is cancelled. Otherwise it MUST be `upcoming` before its start, `live` in [start, published end), and `finished` from then on. The client MUST recompute statuses every second from the pure domain without refetching.

#### Scenario: Session passes its published end
- GIVEN a session that is `live`
- WHEN the wall clock reaches its published `date_end`
- THEN its status becomes `finished` without a reload

### Requirement: Default selected session

The default selected session MUST be the live session of the meeting. If none is live, it MUST be the next upcoming one. If none is upcoming, it MUST be the last finished one. If none qualifies, it MUST be null.

#### Scenario: Weekend over
- GIVEN every session of the meeting has finished
- WHEN the overview is built
- THEN `selectedSessionKey` is the last finished session (normally the race)

### Requirement: Session tabs

The hero MUST show one tab per session, ordered by start. Each tab's label MUST be the short label (FP1, FP2, FP3, SQ, Sprint, Quali, Race), falling back to the session name. Its meta line MUST be the day and start time in the viewer's zone. A `live` session MUST carry a "Live" badge. Cancelled sessions MUST be disabled. Tabs MUST follow the WAI-ARIA tablist pattern: ArrowLeft/ArrowRight/Home/End move focus over enabled tabs and select them. The selected tab MUST be scrolled into view. The panel MUST show the session name, a status badge (Live / Replay / Cancelled), and the schedule with the zone name. It MUST also show a status message.

#### Scenario: Keyboard navigation skips cancelled sessions
- GIVEN tabs FP1, FP2 (cancelled), FP3 with FP1 selected
- WHEN the viewer presses ArrowRight
- THEN FP3 is focused and selected

#### Scenario: Server render
- GIVEN the page is rendered on the server
- WHEN times are formatted before hydration
- THEN they are formatted in UTC, and switch to the viewer's zone once the client clock is available

### Requirement: Countdown

For an `upcoming` selected session, the panel MUST show a countdown to its start in days, hours, minutes and seconds. The countdown MUST work on absolute instants, so the viewer's zone and DST do not affect it. It MUST round seconds up so it reaches 00:00:00 exactly at the start. It MUST never be negative. Before the client clock is available, the panel MUST show a placeholder countdown.

#### Scenario: Last second
- GIVEN a session starting in 0.4 s
- WHEN the countdown is computed
- THEN it shows 00:00:01, and 00:00:00 with `isOver` at the start instant

### Requirement: URL session selection

The selected session MUST live in the URL as `?session=<key>`. Picking a tab MUST navigate to `?session=<key>` without scrolling. The local selection MUST update immediately. The server MUST render the map, grid and radio for the session in the URL. A `session` value that is not a non-cancelled session of the shown weekend MUST fall back to the overview's default. Switching sessions MUST start a fresh playback clock, driver selection and buffers.

#### Scenario: Foreign session key
- GIVEN `?session=99999`, which is not part of the shown weekend
- WHEN the page renders
- THEN the default session (live, else next, else last finished) is shown

### Requirement: Schedule unavailable

If the overview cannot be built, the page MUST show a message saying the race calendar is unavailable. The message MUST suggest checking the self-hosted OpenF1 API. If the meeting has no sessions, the hero MUST say the session schedule is not published yet.

#### Scenario: Upstream down
- GIVEN both OpenF1 sources fail
- WHEN the page renders
- THEN the "race calendar is unavailable" message is shown instead of the weekend

## Known limitations

- Live status uses the published session end. Overruns (red flags, delays) show `finished` while cars may still be running. The data layer's recording window adds a buffer for this.
- Selection is per meeting. A sprint weekend's ordering relies on the sessions' published starts.
