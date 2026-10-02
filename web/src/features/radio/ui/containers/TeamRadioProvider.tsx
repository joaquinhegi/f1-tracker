"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePlayback } from "@/features/playback/ui/containers/PlaybackProvider";
import { useBffResource, type BffResource } from "@/shared/ui/hooks/use-bff-resource";
import { messagesFromDto, type TeamRadioDto } from "../../application/radio-dto";
import { messageCounts, type RadioMessage } from "../../domain/radio";

const RADIO_POLL_LIVE_MS = 10_000;

interface TeamRadioContextValue {
  resource: BffResource<TeamRadioDto>;
  /** The whole session's messages, oldest first. */
  messages: RadioMessage[];
  /** Messages per driver over the whole session. */
  counts: Map<number, number>;
}

const TeamRadioContext = createContext<TeamRadioContextValue | null>(null);

/** Loads the session's team radio once for the radio feed and the timing grid. */
export function TeamRadioProvider({ children }: { children: ReactNode }) {
  const { session, state } = usePlayback();
  const { data, error, loading, retry } = useBffResource<TeamRadioDto>(
    state ? `/api/sessions/${session.key}/team-radio` : null,
    { pollMs: state?.mode === "live" ? RADIO_POLL_LIVE_MS : undefined },
  );
  const messages = useMemo(() => (data ? messagesFromDto(data) : []), [data]);
  const counts = useMemo(() => messageCounts(messages), [messages]);
  const value = useMemo(
    () => ({ resource: { data, error, loading, retry }, messages, counts }),
    [data, error, loading, retry, messages, counts],
  );
  return <TeamRadioContext.Provider value={value}>{children}</TeamRadioContext.Provider>;
}

export function useTeamRadio(): TeamRadioContextValue {
  const value = useContext(TeamRadioContext);
  if (!value) throw new Error("useTeamRadio must be used inside <TeamRadioProvider>");
  return value;
}

/** Per-driver message counts, or null outside a provider (the grid works without radio). */
export function useTeamRadioCounts(): Map<number, number> | null {
  return useContext(TeamRadioContext)?.counts ?? null;
}
