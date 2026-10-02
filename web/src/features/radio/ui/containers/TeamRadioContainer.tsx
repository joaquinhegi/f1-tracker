"use client";

import { useMemo } from "react";
import { useSessionDrivers } from "@/features/drivers/ui/containers/SessionDriversProvider";
import { formatElapsed } from "@/features/playback/domain/playback-clock";
import { usePlayback, usePlayhead } from "@/features/playback/ui/containers/PlaybackProvider";
import { describeError } from "@/shared/ui/format/error-message";
import { formatClockTime } from "@/shared/ui/format/date-time";
import { Skeleton } from "@/shared/ui/atoms/Skeleton";
import { SectionCard } from "@/shared/ui/molecules/SectionCard";
import { StatusMessage } from "@/shared/ui/molecules/StatusMessage";
import { feedEmptyCopy } from "../../application/feed-empty-copy";
import { feedEmptyState, feedMessages } from "../../domain/radio";
import { RadioChat, type ChatMessage, type RadioEmpty } from "../components/RadioChat";
import { useTeamRadio } from "./TeamRadioProvider";

/**
 * The team radio feed: all drivers by default (group chat), or the driver
 * picked in the grid / the picker. Messages appear as the playback clock
 * passes them; before the first one, the empty state says how many there are
 * and jumps the replay there.
 */
export function TeamRadioContainer() {
  const { state, sessionStart, seek } = usePlayback();
  const { drivers, byNumber, radioFilter, setRadioFilter } = useSessionDrivers();
  const { resource: radio, messages: all, counts } = useTeamRadio();
  const playhead = usePlayhead(1000);
  const clock = useMemo(() => formatClockTime(), []);

  const visible = useMemo(
    () => (playhead === null ? [] : feedMessages(all, radioFilter, playhead)),
    [all, radioFilter, playhead],
  );
  const options = useMemo(
    () => drivers.map((driver) => ({ driver, count: counts.get(driver.number) ?? 0 })),
    [drivers, counts],
  );

  if (!state) return null;
  const live = state.mode === "live";

  const messages: ChatMessage[] = visible.flatMap((m) => {
    const driver = byNumber.get(m.driverNumber);
    return driver
      ? [{ id: `${m.driverNumber}-${m.date}`, driver, recordingUrl: m.recordingUrl, timeLabel: clock(new Date(m.date)), lapNumber: m.lapNumber }]
      : [];
  });

  let empty: RadioEmpty = { title: "No messages yet" };
  const emptyState = playhead === null ? null : feedEmptyState(all, radioFilter, playhead);
  if (emptyState) {
    const who = radioFilter === "all" ? null : (byNumber.get(radioFilter)?.acronym ?? `#${radioFilter}`);
    const copy = feedEmptyCopy(emptyState, {
      who,
      live,
      when: (date) => `${clock(new Date(date))} (${formatElapsed(date - sessionStart)} into the session)`,
    });
    const jumpTo = copy.jumpTo;
    empty = {
      title: copy.title,
      message: copy.message,
      action: jumpTo !== undefined && !live ? { label: "Jump to the first message", onClick: () => seek(jumpTo) } : undefined,
    };
  }

  let body;
  if (radio.error && !radio.data) {
    const { title, message } = describeError(radio.error);
    body = <StatusMessage tone="error" title={title} message={message} action={{ label: "Retry", onClick: radio.retry }} />;
  } else if (!radio.data || drivers.length === 0) {
    body = <Skeleton height="22rem" />;
  } else {
    body = (
      <RadioChat
        filter={radioFilter}
        options={options}
        totalCount={all.length}
        messages={messages}
        onFilterChange={setRadioFilter}
        empty={empty}
      />
    );
  }

  return (
    <SectionCard id="radio-title" title="Team radio" busy={!radio.data && !radio.error}>
      {body}
    </SectionCard>
  );
}
