"use client";

import { useMemo, useState } from "react";
import {
  formatDateRange,
  formatDay,
  formatTime,
  timeZoneLabel,
  type FormatOptions,
} from "@/shared/ui/format/date-time";
import { useNow } from "@/shared/ui/hooks/use-now";
import { Badge } from "@/shared/ui/atoms/Badge";
import { Tabs, type TabItem } from "@/shared/ui/molecules/Tabs";
import { sessionFromDto, type WeekendOverviewDto } from "../../application/weekend-dto";
import { countdownTo } from "../../domain/countdown";
import { sessionStatus } from "../../domain/session-status";
import { SessionPanel } from "../components/SessionPanel";
import { WeekendHero } from "../components/WeekendHero";

const PANEL_ID = "session-panel";

export interface WeekendHeroContainerProps {
  overview: WeekendOverviewDto;
  /** Selected session (from the URL); defaults to the overview's suggestion. */
  selectedSessionKey?: number | null;
  /** Called when the viewer picks another session (the page follows it via the URL). */
  onSessionChange?: (sessionKey: number) => void;
}

/**
 * Owns the selected session and the ticking clock. Statuses and the countdown
 * are recomputed client-side every second from the pure domain, so nothing is
 * refetched while time passes.
 */
export function WeekendHeroContainer({ overview, selectedSessionKey, onSessionChange }: WeekendHeroContainerProps) {
  const now = useNow();
  const sessions = useMemo(() => overview.sessions.map(sessionFromDto), [overview.sessions]);
  const controlled = selectedSessionKey === undefined ? overview.selectedSessionKey : selectedSessionKey;
  // Local state answers the click immediately; the URL (prop) catches up after navigation.
  const [selection, setSelection] = useState({ from: controlled, key: controlled });
  if (selection.from !== controlled) setSelection({ from: controlled, key: controlled });
  const selectedKey = selection.key;
  const setSelectedKey = (key: number) => setSelection({ from: controlled, key });

  // Before hydration render UTC so server and client markup match; then the viewer's zone.
  const zone: FormatOptions = now ? {} : { timeZone: "UTC" };
  const day = formatDay(zone);
  const time = formatTime(zone);
  const statusOf = (index: number) => (now ? sessionStatus(sessions[index], now) : overview.sessions[index].status);

  const tabs: TabItem[] = sessions.map((session, index) => {
    const status = statusOf(index);
    return {
      id: String(session.key),
      label: overview.sessions[index].shortLabel,
      meta: `${day(session.start)} · ${time(session.start)}`,
      badge: status === "live" ? <Badge tone="live">Live</Badge> : undefined,
      disabled: status === "cancelled",
    };
  });

  const selectedIndex = sessions.findIndex((s) => s.key === selectedKey);
  const selected = selectedIndex >= 0 ? sessions[selectedIndex] : null;
  const zoneName = timeZoneLabel(selected?.start ?? new Date(overview.generatedAt), zone);

  const meeting = overview.meeting;
  return (
    <WeekendHero
      name={meeting.name}
      officialName={meeting.officialName}
      countryName={meeting.countryName}
      countryFlagUrl={meeting.countryFlagUrl}
      circuitName={meeting.circuitName}
      location={meeting.location}
      dateRange={formatDateRange(new Date(meeting.start), new Date(meeting.end), zone)}
      phase={overview.phase}
    >
      {sessions.length > 0 ? (
        <>
          <Tabs
            ariaLabel="Weekend sessions"
            items={tabs}
            selectedId={selectedKey === null ? null : String(selectedKey)}
            panelId={PANEL_ID}
            onSelect={(id) => {
              setSelectedKey(Number(id));
              onSessionChange?.(Number(id));
            }}
          />
          {selected && (
            <SessionPanel
              panelId={PANEL_ID}
              tabId={`tab-${selected.key}`}
              sessionName={selected.name}
              status={statusOf(selectedIndex)}
              schedule={`${day(selected.start)} · ${time(selected.start)} – ${time(selected.end)} ${zoneName}`}
              countdown={now ? countdownTo(selected.start, now) : null}
            />
          )}
        </>
      ) : (
        <p>The session schedule for this weekend is not published yet.</p>
      )}
    </WeekendHero>
  );
}
