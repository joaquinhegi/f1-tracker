import type { ReactNode } from "react";
import type { CircuitOutlineDto } from "../../application/circuit-outline-dto";
import { CircuitMap } from "../components/CircuitMap";
import { SectorLegend } from "@/shared/ui/molecules/SectorLegend";
import { CircuitMapKey, CircuitMapPlaceholder, CircuitPanel } from "../components/CircuitPanel";

export interface CircuitMapSectionProps {
  circuitName: string;
  /** Injected by the app layer (server-side use case call). */
  loadOutline: () => Promise<CircuitOutlineDto>;
  /** SVG layers drawn on the map, in its coordinate space (car markers). */
  renderOverlay?: (outline: CircuitOutlineDto) => ReactNode;
  /** Rendered under the map inside the same card (playback controls). */
  footer?: ReactNode;
}

/** Server container: loads the outline, renders the map or a friendly fallback. */
export async function CircuitMapSection({ circuitName, loadOutline, renderOverlay, footer }: CircuitMapSectionProps) {
  let outline: CircuitOutlineDto | null = null;
  try {
    outline = await loadOutline();
  } catch {
    outline = null;
  }

  if (!outline) {
    return (
      <CircuitPanel circuitName={circuitName}>
        <CircuitMapPlaceholder message="The track map is not available yet. It appears once a session at this circuit has position data." />
        {footer}
      </CircuitPanel>
    );
  }

  const { source } = outline;
  return (
    <CircuitPanel
      circuitName={circuitName}
      caption={`Traced from car #${source.driverNumber}, lap ${source.lapNumber}, ${source.sessionName} ${source.year}`}
    >
      <CircuitMap outline={outline} title={`${circuitName} track map`}>
        {renderOverlay?.(outline)}
      </CircuitMap>
      {outline.sectors && (
        <CircuitMapKey>
          <SectorLegend />
        </CircuitMapKey>
      )}
      {footer}
    </CircuitPanel>
  );
}

export function CircuitMapSkeleton({ circuitName }: { circuitName: string }) {
  return (
    <CircuitPanel circuitName={circuitName}>
      <CircuitMapPlaceholder message="Drawing the track…" />
    </CircuitPanel>
  );
}
