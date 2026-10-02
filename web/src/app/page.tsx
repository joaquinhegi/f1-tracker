import { Suspense } from "react";
import { connection } from "next/server";
import { container } from "@/composition/server-container";
import { outlineToDto } from "@/features/circuit/application/circuit-outline-dto";
import { CircuitMapSection, CircuitMapSkeleton } from "@/features/circuit/ui/containers/CircuitMapSection";
import { CarOverlayContainer } from "@/features/drivers/ui/containers/CarOverlayContainer";
import { SessionDriversProvider } from "@/features/drivers/ui/containers/SessionDriversProvider";
import { PlaybackControlsContainer } from "@/features/playback/ui/containers/PlaybackControlsContainer";
import { PlaybackProvider } from "@/features/playback/ui/containers/PlaybackProvider";
import { TeamRadioContainer } from "@/features/radio/ui/containers/TeamRadioContainer";
import { TeamRadioProvider } from "@/features/radio/ui/containers/TeamRadioProvider";
import { TimingGridContainer } from "@/features/timing/ui/containers/TimingGridContainer";
import { parseReplayOffset, resolveSelectedSessionKey } from "@/features/weekend/application/selected-session";
import type { WeekendOverviewDto } from "@/features/weekend/application/weekend-dto";
import { WeekendSessionSwitcher } from "./_components/WeekendSessionSwitcher";
import styles from "./page.module.css";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection(); // schedule depends on "now": render per request
  const params = await searchParams;

  let overview: WeekendOverviewDto | null = null;
  try {
    overview = await container().getWeekendOverview();
  } catch (error) {
    console.error("[page] weekend overview failed", error);
  }

  if (!overview) {
    return (
      <main className={styles.main}>
        <p className={styles.error}>
          The race calendar is unavailable right now. Check that the self-hosted OpenF1 API is running, then reload.
        </p>
      </main>
    );
  }

  const { circuitKey, circuitName } = overview.meeting;
  const selectedKey = resolveSelectedSessionKey(overview, params.session);
  const selected = overview.sessions.find((s) => s.key === selectedKey) ?? null;
  const loadOutline = async () => outlineToDto(await container().getCircuitOutline(circuitKey));

  const hero = <WeekendSessionSwitcher overview={overview} selectedSessionKey={selectedKey} />;
  if (!selected) {
    return (
      <main className={styles.main}>
        {hero}
        <Suspense fallback={<CircuitMapSkeleton circuitName={circuitName} />}>
          <CircuitMapSection circuitName={circuitName} loadOutline={loadOutline} />
        </Suspense>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {hero}
      {/* Keyed by session: switching sessions starts a fresh clock, selection and buffers. */}
      <PlaybackProvider key={selected.key} session={selected} initialOffsetSeconds={parseReplayOffset(params.t)}>
        <SessionDriversProvider sessionKey={selected.key} live={selected.status === "live"}>
          <Suspense fallback={<CircuitMapSkeleton circuitName={circuitName} />}>
            <CircuitMapSection
              circuitName={circuitName}
              loadOutline={loadOutline}
              renderOverlay={(outline) => <CarOverlayContainer outline={outline} />}
              footer={<PlaybackControlsContainer />}
            />
          </Suspense>
          <TeamRadioProvider>
            <TimingGridContainer />
            <TeamRadioContainer />
          </TeamRadioProvider>
        </SessionDriversProvider>
      </PlaybackProvider>
    </main>
  );
}
