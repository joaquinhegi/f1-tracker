import type { F1DataProvider } from "@/shared/f1-data/f1-data-provider";
import type { Clock } from "@/shared/time/clock";
import { selectMeeting, type SelectedMeeting } from "../domain/select-meeting";
import { defaultSelectedSession } from "../domain/session-status";
import { sortByStart, type Meeting, type WeekendSession } from "../domain/weekend";
import { meetingFromOpenF1, sessionFromOpenF1 } from "./openf1-mappers";
import { meetingToDto, sessionToDto, type WeekendOverviewDto } from "./weekend-dto";

export class NoMeetingFoundError extends Error {
  constructor(readonly years: number[]) {
    super(`No meetings found for ${years.join(", ")}`);
    this.name = "NoMeetingFoundError";
  }
}

async function loadSeason(
  provider: F1DataProvider,
  year: number,
): Promise<{ meetings: Meeting[]; sessions: WeekendSession[] }> {
  const [meetings, sessions] = await Promise.all([
    provider.listMeetings({ year }),
    provider.listSessions({ year }),
  ]);
  return {
    meetings: meetings.map(meetingFromOpenF1),
    sessions: sessions.map(sessionFromOpenF1),
  };
}

/**
 * Use case: the weekend to show on the landing page (current GP, else the
 * next one; after the season's last race, next season's first one).
 */
export async function getWeekendOverview(
  provider: F1DataProvider,
  clock: Clock,
): Promise<WeekendOverviewDto> {
  const now = clock();
  const year = now.getUTCFullYear();

  let season = await loadSeason(provider, year);
  let selected: SelectedMeeting | null = selectMeeting(season.meetings, season.sessions, now);

  if (!selected || selected.phase === "finished") {
    try {
      const nextSeason = await loadSeason(provider, year + 1);
      const nextSelected = selectMeeting(nextSeason.meetings, nextSeason.sessions, now);
      if (nextSelected && nextSelected.phase !== "finished") {
        season = nextSeason;
        selected = nextSelected;
      }
    } catch {
      // Next season not published yet: keep showing the last finished weekend.
    }
  }
  if (!selected) throw new NoMeetingFoundError([year, year + 1]);

  const sessions = sortByStart(season.sessions.filter((s) => s.meetingKey === selected.meeting.key));
  return {
    generatedAt: now.toISOString(),
    phase: selected.phase,
    meeting: meetingToDto(selected.meeting),
    sessions: sessions.map((s) => sessionToDto(s, now)),
    selectedSessionKey: defaultSelectedSession(sessions, now)?.key ?? null,
  };
}
