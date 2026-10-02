"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { projectPoint } from "@/features/circuit/domain/track-transform";
import { PitLaneLayer } from "@/features/circuit/ui/components/PitLaneLayer";
import { usePlayback } from "@/features/playback/ui/containers/PlaybackProvider";
import { fetchBff, retryDelayMs } from "@/shared/http/bff-client";
import { F1_CAR_LENGTH } from "@/shared/ui/atoms/f1-car-geometry";
import { isLiveChunkSettled, liveChunks, LIVE_CHUNK_MS, replayChunks, REPLAY_CHUNK_MS } from "../../application/chunk-plan";
import { LocationBuffer } from "../../application/location-buffer";
import { samplesFromDto, type LocationWindowDto } from "../../application/location-dto";
import { buildMapLayout, pitPose, type LayoutOutline } from "../../application/map-layout";
import { headingDegrees } from "../../domain/car-position";
import { classifyCar } from "../../domain/car-state";
import { blendPose, SEEK_JUMP_MS, transitionMs, type MarkerMode, type Pose } from "../../domain/marker-motion";
import { CarMarker } from "../components/CarMarker";
import styles from "../components/CarMarker.module.css";
import { useSessionDrivers } from "./SessionDriversProvider";

const SCHEDULE_EVERY_MS = 500;
const MAX_CONCURRENT = 2;
const LIVE_REFRESH_MS = 1_000;
/** Heading = direction between the position now and this much later. */
const HEADING_LOOKAHEAD_MS = 250;
/** On-screen car length: 3.2% of the map's rendered width, kept between these (px). */
const CAR_PX = { min: 20, max: 30, share: 0.032 };
/** Before the map is measured (server render): a typical desktop map. */
const DEFAULT_RENDER = { width: 780, pxPerUnit: 0.78 };

interface ChunkStatus {
  state: "loading" | "loaded" | "error";
  at: number;
  attempts: number;
}

type Notice = null | "loading" | "no-data" | "error";

interface MarkerElements {
  outer: SVGGElement | null;
  rotate: SVGGElement | null;
  label: SVGGElement | null;
}

/** What each marker shows now, and the hand-over in progress. */
interface MarkerMotion {
  mode: MarkerMode;
  pose: Pose;
  from: Pose | null;
  start: number;
  duration: number;
}

export interface CarOverlayContainerProps {
  /** The outline: its raw -> SVG transform (cars and track share it), racing line, start/finish and pit lane. */
  outline: LayoutOutline;
}

/** Rendered size of the owner <svg> (it is letterboxed by preserveAspectRatio="meet"). */
function useRenderedSize(ref: RefObject<SVGGElement | null>, viewWidth: number, viewHeight: number) {
  const [size, setSize] = useState(DEFAULT_RENDER);
  useEffect(() => {
    const svg = ref.current?.ownerSVGElement;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const pxPerUnit = Math.min(rect.width / viewWidth, rect.height / viewHeight);
      setSize((current) =>
        Math.abs(current.pxPerUnit - pxPerUnit) < 0.005 ? current : { width: pxPerUnit * viewWidth, pxPerUnit },
      );
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(svg);
    return () => observer?.disconnect();
  }, [ref, viewWidth, viewHeight]);
  return size;
}

/**
 * Draws the checked drivers' cars on the circuit map, following the shared
 * playback clock. Location windows are fetched in aligned chunks ahead of the
 * playhead (prefetch), kept in a bounded buffer, and positions are
 * interpolated every animation frame without re-rendering React.
 *
 * Each frame every car is classified (track / pit lane / garage, see
 * `car-state.ts`): cars on track follow their samples, cars in the pit lane
 * follow the drawn lane, parked cars (and cars without a position) sit in
 * their box. Changes of mode glide instead of jumping.
 */
export function CarOverlayContainer({ outline }: CarOverlayContainerProps) {
  const { transform } = outline;
  const { session, state, sessionStart, sessionEnd, getPlayhead } = usePlayback();
  const { drivers, byNumber, checked, focused } = useSessionDrivers();
  const [notice, setNotice] = useState<Notice>("loading");
  const root = useRef<SVGGElement>(null);
  const rendered = useRenderedSize(root, transform.width, transform.height);

  const buffer = useMemo(() => new LocationBuffer(), []);
  const chunks = useRef(new Map<number, ChunkStatus>());
  const markers = useRef(new Map<number, MarkerElements>());
  const motions = useRef(new Map<number, MarkerMotion>());
  const headings = useRef(new Map<number, number>());
  // Loops restart only when the kind of clock changes, not on play / pause / seek.
  const active = state !== null;
  const live = state?.mode === "live";
  const rate = state?.rate ?? 1;
  const unit = transform.width / 1000;

  const carPx = Math.min(CAR_PX.max, Math.max(CAR_PX.min, rendered.width * CAR_PX.share));
  const carUnits = carPx / rendered.pxPerUnit;
  const scale = carUnits / F1_CAR_LENGTH;

  const slotDrivers = useMemo(() => drivers.map((d) => ({ number: d.number, teamName: d.teamName })), [drivers]);
  const layout = useMemo(
    () => buildMapLayout({ outline, drivers: slotDrivers, carUnits, pxPerUnit: rendered.pxPerUnit }),
    [outline, slotDrivers, carUnits, rendered.pxPerUnit],
  );

  const visible = useMemo(
    () => (checked ?? []).filter((n) => byNumber.has(n)).sort((a, b) => (a === focused ? 1 : b === focused ? -1 : 0)),
    [checked, byNumber, focused],
  );

  // Fetch scheduler: keeps the chunks around the playhead loaded.
  useEffect(() => {
    if (!active) return;
    const chunkMs = live ? LIVE_CHUNK_MS : REPLAY_CHUNK_MS;
    const statuses = chunks.current;
    let disposed = false;
    const controller = new AbortController();

    const fetchChunk = async (start: number) => {
      const previous = statuses.get(start);
      statuses.set(start, { state: "loading", at: Date.now(), attempts: previous?.attempts ?? 0 });
      const from = new Date(start).toISOString();
      const to = new Date(start + chunkMs).toISOString();
      try {
        const dto = await fetchBff<LocationWindowDto>(
          `/api/sessions/${session.key}/locations?from=${from}&to=${to}`,
          controller.signal,
        );
        if (disposed) return;
        buffer.insert(start, start + chunkMs, samplesFromDto(dto));
        statuses.set(start, { state: "loaded", at: Date.now(), attempts: 0 });
      } catch (error) {
        if (disposed) return;
        const attempts = (statuses.get(start)?.attempts ?? 0) + 1;
        statuses.set(start, { state: "error", at: Date.now() + retryDelayMs(attempts, error), attempts });
      }
    };

    const schedule = () => {
      const now = Date.now();
      const playhead = getPlayhead();
      const plan = live ? liveChunks(playhead, now) : replayChunks({ playhead, rate, sessionStart, sessionEnd });
      let inFlight = [...statuses.values()].filter((s) => s.state === "loading").length;
      for (const start of plan) {
        if (inFlight >= MAX_CONCURRENT) break;
        const status = statuses.get(start);
        const due =
          !status ||
          (status.state === "error" && now >= status.at) ||
          (live && status.state === "loaded" && !isLiveChunkSettled(start, now) && now - status.at >= LIVE_REFRESH_MS);
        if (!due) continue;
        inFlight += 1;
        void fetchChunk(start);
      }
      // Bounded memory: drop samples and chunk bookkeeping far from the playhead.
      const keepFrom = playhead - 3 * 60_000;
      const keepTo = playhead + 10 * 60_000;
      buffer.retain(keepFrom, keepTo);
      for (const [start, status] of statuses) {
        if (status.state !== "loading" && (start + chunkMs < keepFrom || start > keepTo)) statuses.delete(start);
      }
      const current = statuses.get(plan[0]);
      setNotice(
        current?.state === "error" ? "error" : current?.state !== "loaded" ? "loading" : buffer.sampleCount() === 0 ? "no-data" : null,
      );
    };

    schedule();
    const timer = setInterval(schedule, SCHEDULE_EVERY_MS);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      // Chunks still marked "loading" would never be fetched again.
      for (const [start, status] of statuses) if (status.state === "loading") statuses.delete(start);
    };
  }, [active, live, rate, session.key, sessionStart, sessionEnd, getPlayhead, buffer]);

  // Render loop: classify, interpolate and move the markers directly on the DOM.
  useEffect(() => {
    if (!active) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const context = { track: layout.track, pitLane: layout.pitLane };
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPlayhead: number | null = null;

    /** Where the car should be drawn now, or null when it cannot be placed. */
    const target = (driver: number, t: number): { mode: MarkerMode; pose: Pose } | null => {
      const carState = classifyCar(buffer.samplesOf(driver), t, context);
      if (carState.kind === "garage") {
        const spot = layout.parking.get(driver);
        return spot ? { mode: "garage", pose: { ...spot.point, heading: spot.heading, scale: layout.parkedScale } } : null;
      }
      const here = projectPoint(transform, carState.position);
      if (carState.kind === "pit") {
        const pose = pitPose(layout, carState.along);
        if (pose) {
          headings.current.set(driver, pose.heading);
          return { mode: "pit", pose: { ...pose.point, heading: pose.heading, scale: 1 } };
        }
      }
      const ahead = buffer.positionAt(driver, t + HEADING_LOOKAHEAD_MS);
      const heading = (ahead && headingDegrees(here, projectPoint(transform, ahead))) ?? headings.current.get(driver) ?? 0;
      headings.current.set(driver, heading);
      return { mode: carState.kind, pose: { ...here, heading, scale: 1 } };
    };

    const draw = () => {
      const t = getPlayhead();
      const wall = performance.now();
      const seeked = lastPlayhead !== null && Math.abs(t - lastPlayhead) > SEEK_JUMP_MS;
      lastPlayhead = t;
      // Nothing loaded around the playhead, or no positions at all (live feed without a token): hide.
      const placeable = buffer.covers(t) && buffer.sampleCount() > 0;
      for (const [driver, marker] of markers.current) {
        if (!marker.outer || !marker.rotate) continue;
        const next = placeable ? target(driver, t) : null;
        if (!next) {
          if (!placeable && motions.current.has(driver)) continue; // still loading: keep the last pose
          marker.outer.setAttribute("visibility", "hidden");
          motions.current.delete(driver);
          continue;
        }
        let motion = motions.current.get(driver);
        if (!motion || seeked || reduceMotion) {
          motion = { mode: next.mode, pose: next.pose, from: null, start: wall, duration: 0 };
        } else if (motion.mode !== next.mode) {
          motion = { mode: next.mode, pose: motion.pose, from: motion.pose, start: wall, duration: transitionMs(motion.mode, next.mode) };
        }
        const k = motion.from && motion.duration > 0 ? (wall - motion.start) / motion.duration : 1;
        const pose = motion.from && k < 1 ? blendPose(motion.from, next.pose, k) : next.pose;
        if (k >= 1) motion.from = null;
        motion.pose = pose;
        motions.current.set(driver, motion);

        marker.outer.setAttribute("transform", `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)})`);
        marker.rotate.setAttribute(
          "transform",
          `rotate(${pose.heading.toFixed(1)})${pose.scale !== 1 ? ` scale(${pose.scale.toFixed(3)})` : ""}`,
        );
        if (marker.label) {
          const parked = next.mode === "garage";
          const showLabel = !parked || layout.parkedLabels || driver === focused;
          marker.label.setAttribute("visibility", showLabel ? "visible" : "hidden");
          marker.label.setAttribute("transform", `translate(0 ${(-F1_CAR_LENGTH * 0.62 * scale * pose.scale).toFixed(2)})`);
        }
        marker.outer.setAttribute("visibility", "visible");
      }
      // Reduced motion: one discrete update per second instead of continuous movement.
      if (reduceMotion) timer = setTimeout(draw, 1000);
      else frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [active, getPlayhead, buffer, transform, layout, scale, focused]);

  if (!state) return null;

  const ref = (driver: number, part: keyof MarkerElements) => (el: SVGGElement | null) => {
    const marker = markers.current.get(driver) ?? { outer: null, rotate: null, label: null };
    marker[part] = el;
    if (!marker.outer && !marker.rotate && !marker.label) markers.current.delete(driver);
    else markers.current.set(driver, marker);
  };

  const message =
    notice === "error"
      ? "Car positions unavailable, retrying…"
      : notice === "no-data"
        ? live
          ? "No car positions in the live feed (they need an F1TV token on the recorder)."
          : "No car positions for this part of the session."
        : null;

  return (
    <g ref={root} aria-hidden="true">
      <PitLaneLayer lane={layout.lane?.points ?? null} laneWidth={layout.laneWidth} rail={layout.rail} unit={unit} />
      {visible.map((driver) => {
        const d = byNumber.get(driver)!;
        return (
          <CarMarker
            key={driver}
            ref={ref(driver, "outer")}
            rotateRef={ref(driver, "rotate")}
            labelRef={ref(driver, "label")}
            acronym={d.acronym}
            colour={d.teamColour}
            scale={scale}
            focused={driver === focused}
          />
        );
      })}
      {message && (
        <text className={styles.notice} x={transform.padding} y={transform.padding * 0.6} fontSize={14 * unit}>
          {message}
        </text>
      )}
    </g>
  );
}
