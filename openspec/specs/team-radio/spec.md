# Team Radio Specification

## Purpose

Present a session's team radio recordings as a chat feed. The feed is gated by the playback clock, can be filtered to one driver, and plays the recordings directly from F1's static host.

Sources: `web/src/features/radio/**`, `web/src/shared/ui/molecules/AudioPlayer.tsx`.

## Requirements

### Requirement: Message source and lap tagging

The BFF MUST return the session's team radio messages sorted by date. Each message MUST be tagged with the lap the driver was on, meaning the last lap that started at or before the message, or null. Only `https` recording URLs on `livetiming.formula1.com` with a parseable date MUST be passed. All others MUST be dropped. The client MUST load the radio once per session, shared by the feed and the grid. It MUST re-poll every 10 s while live.

#### Scenario: Foreign host
- GIVEN an OpenF1 radio row whose `recording_url` is on another host
- WHEN the radio DTO is built
- THEN that message is excluded

### Requirement: All-drivers feed by default

The feed MUST default to all drivers, shown as a group chat. Each bubble names its driver (acronym and full name), with the name in the team colour tuned for contrast on each theme's surface. The header MUST show "All drivers" and the session's total message count. Newest messages MUST be at the bottom.

#### Scenario: Default view
- GIVEN a replay with messages from several drivers
- WHEN the radio section first renders
- THEN it shows every driver's messages published by the playhead, oldest first

### Requirement: Filtering and counts

A picker MUST offer "All drivers (N)" and one option per entry-list driver with that driver's session message count. Drivers with zero messages MUST be disabled. Choosing a driver MUST filter the feed and focus that driver. Focusing a driver from the grid MUST also set the filter. The header MUST show the driver's avatar (headshot or acronym), team and message count. Switching filters MUST start the new conversation at the bottom, as read.

#### Scenario: Filter by grid focus
- GIVEN the all-drivers feed
- WHEN the viewer clicks driver 16's row in the timing grid
- THEN the feed shows only driver 16's messages

### Requirement: Playhead gating

The feed MUST show only messages whose date is at or before the playhead. The playhead updates every second. While the viewer is at the bottom (within 48 px), new messages MUST scroll into view, smoothly unless reduced motion is requested. If the viewer has scrolled up, a "N new message(s) ↓" pill MUST appear instead.

#### Scenario: Message arrives during replay
- GIVEN a replay playing, viewer scrolled up
- WHEN the playhead passes a new message
- THEN a "1 new message ↓" pill appears and the scroll position is kept

### Requirement: Empty states and jump to first message

When the feed is empty at the playhead, it MUST explain why:

- No message for this filter in the whole session, live: "No team radio yet" (or "from <ACR> yet"). It adds that messages appear as soon as they are published.
- No message in the whole session, replay: "No team radio in this session", saying OpenF1 published no recordings. For a driver filter: "No team radio from <ACR> in this session" and "Pick another driver, or All drivers."
- Messages exist but the first is after the playhead: "<N> message(s) [from <ACR>] in this session". It MUST give the first one's time, its elapsed time into the session and its lap. In replay only, it MUST offer "Jump to the first message", which seeks the playhead to that message.

#### Scenario: Before the first message
- GIVEN a replay at the session start and 12 messages, the first at 12:05 into the session on lap 3
- WHEN the feed renders
- THEN it says "12 messages in this session" with that time and lap, and a jump button seeks there

### Requirement: Audio playback

Each message MUST play in a compact player: play/pause, a seekable progress bar, and elapsed / duration. The player MUST use a plain `<audio>` element without `crossorigin`, so no CORS headers or audio proxy are needed. Only metadata MUST be preloaded. Starting one player MUST pause any other. A load or play failure MUST disable the button and show "Audio unavailable". The section MUST note that radio is audio only (no transcripts).

#### Scenario: Two recordings
- GIVEN recording A is playing
- WHEN the viewer starts recording B
- THEN A pauses and B plays

### Requirement: Radio error and loading states

A load error without prior data MUST show a described error with Retry. Until the radio and the entry list are loaded, a skeleton MUST show. Without a playback clock (upcoming or cancelled session), the radio section MUST NOT render.

#### Scenario: Upcoming session
- GIVEN an upcoming session is selected
- WHEN the page renders
- THEN no team radio section is shown

## Known limitations

- OpenF1 publishes recordings only. There is no transcript or search.
- The "jump to first message" action is unavailable live, since there is nothing to seek to.
