import { forwardRef, type Ref } from "react";
import { F1Car, F1_CAR_LENGTH } from "@/shared/ui/atoms/F1Car";
import { labelColours } from "@/shared/ui/format/colour";
import styles from "./CarMarker.module.css";

export interface CarMarkerProps {
  acronym: string;
  colour: string;
  /** SVG units per car unit (the car is 30 units long). */
  scale: number;
  /** The radio-focused driver: highlight ring. */
  focused?: boolean;
  /** Receives the rotation group, updated every frame with the heading (and the parked scale). */
  rotateRef?: Ref<SVGGElement>;
  /** Receives the label group, so the container can hide it for parked cars. */
  labelRef?: Ref<SVGGElement>;
}

/** Label size in car units: ~11 px on screen for a ~24 px car. */
const LABEL_FONT = 13.5;

/**
 * One car on the map. The outer group is positioned (translate) and the inner
 * one rotated by the container, directly on the DOM, every animation frame.
 * The acronym is a pill in the team colour (AA text contrast) that never
 * rotates. Hidden until the container places it.
 */
export const CarMarker = forwardRef<SVGGElement, CarMarkerProps>(function CarMarker(
  { acronym, colour, scale, focused = false, rotateRef, labelRef },
  ref,
) {
  const label = labelColours(colour);
  const font = LABEL_FONT * scale;
  const height = font * 1.5;
  const width = font * (0.7 * acronym.length + 0.9);
  return (
    <g ref={ref} className={styles.car} visibility="hidden" data-acronym={acronym} data-focused={focused || undefined}>
      <g ref={rotateRef}>
        <g transform={`scale(${scale})`}>
          {focused && (
            <>
              <circle r={F1_CAR_LENGTH * 0.72} className={styles.focusHalo} />
              <circle r={F1_CAR_LENGTH * 0.72} className={styles.focusRing} strokeWidth={2.4} />
            </>
          )}
          <F1Car colour={colour} />
        </g>
      </g>
      <g ref={labelRef} className={styles.label} transform={`translate(0 ${(-F1_CAR_LENGTH * 0.62 * scale).toFixed(2)})`}>
        <rect
          x={-width / 2}
          y={-height}
          width={width}
          height={height}
          rx={height / 2}
          fill={label.background}
          className={focused ? styles.pillFocused : styles.pill}
          strokeWidth={focused ? 2 : 1}
        />
        <text y={-height / 2} dy="0.35em" textAnchor="middle" fontSize={font} fill={label.text}>
          {acronym}
        </text>
      </g>
    </g>
  );
});
