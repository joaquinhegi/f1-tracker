# Main Specs: f1-tracker

These baseline specs describe the behaviour implemented as of 2026-10-02. They are the source of truth that SDD changes extend through delta specs. Each spec lists RFC 2119 requirements with Given/When/Then scenarios, followed by known limitations.

| Domain | Covers | Code |
|---|---|---|
| [weekend](weekend/spec.md) | Meeting selection, session status, tabs, countdown, `?session=` | `web/src/features/weekend` |
| [circuit-map](circuit-map/spec.md) | Outline, raw to SVG transform, pit lane, sectors and colours, outline cache, fallbacks | `web/src/features/circuit` |
| [car-tracking](car-tracking/spec.md) | Entry list, selection persistence, markers, track/pit/garage, box slots, motion, reduced motion | `web/src/features/drivers` |
| [playback](playback/spec.md) | Shared clock, live delay, replay controls, `?t=`, location chunks and buffer | `web/src/features/playback` |
| [timing-grid](timing-grid/spec.md) | Columns and alignment, chip colours, pace, ordering, gaps, tyres, focus | `web/src/features/timing` |
| [team-radio](team-radio/spec.md) | All-drivers feed, filter, counts, empty states, audio, playhead gating | `web/src/features/radio` |
| [theme](theme/spec.md) | System/Light/Dark, persistence, no flash, live OS follow, token parity | `web/src/shared/theme` |
| [bff-data-access](bff-data-access/spec.md) | Endpoints, error envelope, routing, rate limits, cache TTLs, window validation | `web/src/app/api`, `web/src/shared` |
| [live-ingestion](live-ingestion/spec.md) | Recording windows, single ingestor, token health, schedule sync, backfill, MongoDB 7 | `infra/` |

Engram mirrors: `sdd/f1-tracker/specs/<domain>` and the index `sdd/f1-tracker/specs/index`.
