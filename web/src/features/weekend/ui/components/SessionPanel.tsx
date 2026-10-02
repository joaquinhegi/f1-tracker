import { Badge } from "@/shared/ui/atoms/Badge";
import { CountdownDisplay } from "@/shared/ui/molecules/CountdownDisplay";
import type { Countdown } from "../../domain/countdown";
import type { SessionStatus } from "../../domain/weekend";
import styles from "./SessionPanel.module.css";

export interface SessionPanelProps {
  panelId: string;
  tabId: string;
  sessionName: string;
  status: SessionStatus;
  /** "Sat 3 Oct · 10:00 – 11:00 CEST" in the viewer's timezone. */
  schedule: string;
  /** null until the client clock is available. */
  countdown: Countdown | null;
}

function describe(countdown: Countdown, sessionName: string): string {
  const { days, hours, minutes } = countdown;
  return `${sessionName} starts in ${days} days, ${hours} hours and ${minutes} minutes`;
}

export function SessionPanel({ panelId, tabId, sessionName, status, schedule, countdown }: SessionPanelProps) {
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.name}>{sessionName}</h2>
        {status === "live" && <Badge tone="live">Live</Badge>}
        {status === "finished" && <Badge tone="accent">Replay</Badge>}
        {status === "cancelled" && <Badge tone="muted">Cancelled</Badge>}
      </div>
      <p className={styles.schedule}>{schedule}</p>

      {status === "upcoming" && (
        <div className={styles.body}>
          <p className={styles.caption}>Lights out in</p>
          {countdown ? (
            <CountdownDisplay {...countdown} label={describe(countdown, sessionName)} />
          ) : (
            <CountdownDisplay days={0} hours={0} minutes={0} seconds={0} label="Loading countdown" placeholder />
          )}
        </div>
      )}
      {status === "live" && (
        <p className={styles.message}>This session is running now. Live timing and car positions follow below.</p>
      )}
      {status === "finished" && (
        <p className={styles.message}>This session has finished. Select it to replay the timing and car positions.</p>
      )}
      {status === "cancelled" && <p className={styles.message}>This session was cancelled.</p>}
    </div>
  );
}
