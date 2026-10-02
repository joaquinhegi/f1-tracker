"use client";

import { useEffect, useMemo } from "react";
import { useSessionDrivers } from "@/features/drivers/ui/containers/SessionDriversProvider";
import { usePlayback, usePlayhead } from "@/features/playback/ui/containers/PlaybackProvider";
import { useTeamRadioCounts } from "@/features/radio/ui/containers/TeamRadioProvider";
import { describeError } from "@/shared/ui/format/error-message";
import { useBffResource } from "@/shared/ui/hooks/use-bff-resource";
import { Skeleton } from "@/shared/ui/atoms/Skeleton";
import { SectionCard } from "@/shared/ui/molecules/SectionCard";
import { StatusMessage } from "@/shared/ui/molecules/StatusMessage";
import { chunkStart } from "@/shared/time/time-window";
import {
  intervalsFromDto,
  timingFromDto,
  type IntervalWindowDto,
  type SessionTimingDto,
} from "../../application/timing-dto";
import { buildTimingBoard } from "../../domain/timing-board";
import { TimingGrid } from "../components/TimingGrid";

/** Interval windows: the minute before and the minute of the playhead (aligned, shared by all viewers). */
const INTERVAL_WINDOW_MS = 60_000;
const TIMING_POLL_LIVE_MS = 4_000;
const INTERVALS_POLL_LIVE_MS = 2_000;

function GridSkeleton() {
  return (
    <div aria-hidden="true" style={{ display: "grid", gap: "0.5rem" }}>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} height="1.75rem" />
      ))}
    </div>
  );
}

/**
 * The drivers + timing grid of the selected session, cut at the playback
 * clock (a replay never shows laps that have not happened yet).
 */
export function TimingGridContainer() {
  const { session, state, raceLike } = usePlayback();
  const drivers = useSessionDrivers();
  const live = state?.mode === "live";
  const playhead = usePlayhead(500);
  const radioCounts = useTeamRadioCounts();

  const timing = useBffResource<SessionTimingDto>(state ? `/api/sessions/${session.key}/timing` : null, {
    pollMs: live ? TIMING_POLL_LIVE_MS : undefined,
  });

  const windowStart = playhead === null ? null : chunkStart(playhead, INTERVAL_WINDOW_MS) - INTERVAL_WINDOW_MS;
  const intervalsUrl =
    raceLike && windowStart !== null
      ? `/api/sessions/${session.key}/intervals?from=${new Date(windowStart).toISOString()}&to=${new Date(windowStart + 2 * INTERVAL_WINDOW_MS).toISOString()}`
      : null;
  const intervals = useBffResource<IntervalWindowDto>(intervalsUrl, {
    pollMs: live ? INTERVALS_POLL_LIVE_MS : undefined,
    keepPrevious: true,
  });

  const timingModel = useMemo(() => (timing.data ? timingFromDto(timing.data) : null), [timing.data]);
  const intervalModel = useMemo(() => (intervals.data ? intervalsFromDto(intervals.data) : []), [intervals.data]);
  const driverNumbers = useMemo(() => drivers.drivers.map((d) => d.number), [drivers.drivers]);

  const rows = useMemo(
    () =>
      timingModel && playhead !== null
        ? buildTimingBoard({ timing: timingModel, intervals: intervalModel, driverNumbers, raceLike }, playhead)
        : [],
    [timingModel, intervalModel, driverNumbers, raceLike, playhead],
  );

  const { applyDefaults } = drivers;
  const orderKnown = rows.some((r) => r.position !== null);
  useEffect(() => {
    if (orderKnown) applyDefaults(rows.map((r) => r.driverNumber));
  }, [orderKnown, rows, applyDefaults]);

  const title = "Drivers & timing";
  if (!state) {
    return (
      <SectionCard id="timing-title" title={title}>
        <StatusMessage title="No timing yet" message="Drivers, timing and team radio appear here when the session starts." />
      </SectionCard>
    );
  }

  const error = timing.error ?? drivers.error;
  const loading = (timing.loading && !timing.data) || (drivers.loading && drivers.drivers.length === 0) || playhead === null;
  let body;
  if (error && !timing.data) {
    const { title: errorTitle, message } = describeError(error);
    body = (
      <StatusMessage
        tone="error"
        title={errorTitle}
        message={message}
        action={{
          label: "Retry",
          onClick: () => {
            timing.retry();
            drivers.retry();
          },
        }}
      />
    );
  } else if (loading) {
    body = <GridSkeleton />;
  } else if (rows.length === 0) {
    body = <StatusMessage title="No drivers yet" message="The entry list for this session is not published yet." />;
  } else {
    body = (
      <TimingGrid
        rows={rows}
        drivers={drivers.byNumber}
        checked={drivers.checked ?? []}
        focused={drivers.focused}
        raceLike={raceLike}
        radioCounts={radioCounts}
        onToggle={drivers.toggle}
        onFocus={drivers.focus}
        onSelectAll={() => drivers.setChecked(rows.map((r) => r.driverNumber))}
        onSelectNone={() => drivers.setChecked([])}
      />
    );
  }

  return (
    <SectionCard
      id="timing-title"
      title={title}
      busy={loading}
      caption={raceLike ? "Gaps from live intervals" : "Gaps from best laps"}
    >
      {body}
    </SectionCard>
  );
}
