/**
 * When the self-hosted recorder is capturing a session. Mirrors the
 * scheduler's recording windows (infra/scheduler/f1_scheduler/domain.py):
 * Race/Sprint [start - 60 min, end + 60 min), others [start - 15 min, end + 30 min).
 */

export interface SessionTiming {
  sessionName: string;
  sessionType: string;
  start: Date;
  end: Date;
  isCancelled?: boolean;
}

const MINUTE = 60_000;

export function isRaceLike(session: Pick<SessionTiming, "sessionName" | "sessionType">): boolean {
  const type = session.sessionType.trim().toLowerCase();
  const name = session.sessionName.trim().toLowerCase();
  return type === "race" || name === "race" || name === "sprint";
}

export function recordingWindow(session: SessionTiming): { from: Date; to: Date } {
  const raceLike = isRaceLike(session);
  const lead = (raceLike ? 60 : 15) * MINUTE;
  const buffer = (raceLike ? 60 : 30) * MINUTE;
  return {
    from: new Date(session.start.getTime() - lead),
    to: new Date(session.end.getTime() + buffer),
  };
}

export function isInRecordingWindow(session: SessionTiming, now: Date): boolean {
  if (session.isCancelled) return false;
  const { from, to } = recordingWindow(session);
  return from.getTime() <= now.getTime() && now.getTime() < to.getTime();
}
