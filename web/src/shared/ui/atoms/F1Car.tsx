import { mixColour, relativeLuminance } from "@/shared/ui/format/colour";

export interface F1CarProps {
  /** Body colour (team colour, "#RRGGBB"). */
  colour: string;
}

export { F1_CAR_LENGTH, F1_CAR_WIDTH } from "./f1-car-geometry";

const TYRE = "#15171C";
const TYRE_TREAD = "#2B2F36";
const CARBON = "#1E2228";

/**
 * Top-down modern F1 car, centred on the origin and pointing along +x
 * (rotate the parent group by the heading). Drawn inside an existing <svg>:
 * it renders a <g>, not an <svg>.
 *
 * Front wing, nose, halo over the cockpit, sidepods, engine cover, rear wing
 * and four dark tyres. The body uses the team colour with a darker floor /
 * sidepod shade and a lighter spine for depth; a thin outline (light on dark
 * colours, dark on light ones) from the theme tokens keeps every livery visible on either map.
 */
export function F1Car({ colour }: F1CarProps) {
  const dark = mixColour(colour, "#000000", 0.38);
  const light = mixColour(colour, "#FFFFFF", 0.32);
  // Theme tokens (a CSS value, so it goes in `style`, not the presentation attribute).
  const outline = relativeLuminance(colour) < 0.3 ? "var(--car-outline-on-dark-body)" : "var(--car-outline-on-light-body)";
  const stroke = { style: { stroke: outline }, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* tyres: wide rears, narrower fronts */}
      <g fill={TYRE} style={{ stroke: outline }} strokeWidth={0.75}>
        <rect x={-12.6} y={-6.9} width={5.4} height={3.3} rx={1.1} vectorEffect="non-scaling-stroke" />
        <rect x={-12.6} y={3.6} width={5.4} height={3.3} rx={1.1} vectorEffect="non-scaling-stroke" />
        <rect x={5} y={-6.5} width={4.4} height={2.7} rx={0.9} vectorEffect="non-scaling-stroke" />
        <rect x={5} y={3.8} width={4.4} height={2.7} rx={0.9} vectorEffect="non-scaling-stroke" />
      </g>
      <g stroke={TYRE_TREAD} strokeWidth={0.35}>
        <line x1={-11.8} y1={-5.25} x2={-8} y2={-5.25} />
        <line x1={-11.8} y1={5.25} x2={-8} y2={5.25} />
        <line x1={5.7} y1={-5.15} x2={8.7} y2={-5.15} />
        <line x1={5.7} y1={5.15} x2={8.7} y2={5.15} />
      </g>
      {/* suspension arms */}
      <g stroke={CARBON} strokeWidth={0.5}>
        <line x1={3.4} y1={-1.4} x2={6.6} y2={-4.2} />
        <line x1={3.4} y1={1.4} x2={6.6} y2={4.2} />
        <line x1={-6.8} y1={-2.6} x2={-9.6} y2={-4} />
        <line x1={-6.8} y1={2.6} x2={-9.6} y2={4} />
      </g>
      {/* floor (darker shade), wider than the body */}
      <path d="M-11.6 -3.4 L-6 -4.9 L1 -4.6 L4 -2.2 L4 2.2 L1 4.6 L-6 4.9 L-11.6 3.4 Z" fill={dark} {...stroke} />
      {/* rear wing: main plane + dark endplates */}
      <rect x={-15} y={-5.4} width={2.8} height={10.8} rx={0.5} fill={colour} {...stroke} />
      <rect x={-15} y={-5.6} width={2.8} height={1.2} rx={0.3} fill={CARBON} />
      <rect x={-15} y={4.4} width={2.8} height={1.2} rx={0.3} fill={CARBON} />
      {/* body: gearbox, sidepods, monocoque, nose */}
      <path
        data-part="body"
        d="M-12.6 -1.3 L-9 -2 L-5.4 -3.9 L-0.6 -4 L2.4 -2.1 L5.6 -1.25 L12.4 -0.85 L13.9 -0.35 L13.9 0.35 L12.4 0.85 L5.6 1.25 L2.4 2.1 L-0.6 4 L-5.4 3.9 L-9 2 L-12.6 1.3 Z"
        fill={colour}
        {...stroke}
      />
      {/* sidepod inlets (dark) */}
      <path d="M-0.9 -3.8 L1.6 -2.3 L-0.4 -2.3 Z" fill={dark} />
      <path d="M-0.9 3.8 L1.6 2.3 L-0.4 2.3 Z" fill={dark} />
      {/* engine cover spine (lighter shade) */}
      <path d="M-11.8 -0.45 L-3 -1 L-1.2 -0.7 L-1.2 0.7 L-3 1 L-11.8 0.45 Z" fill={light} />
      {/* front wing: swept main plane + endplates */}
      <path d="M12.2 -6.6 L14.6 -6.2 L15 -1 L15 1 L14.6 6.2 L12.2 6.6 L13.2 1 L13.2 -1 Z" fill={colour} {...stroke} />
      <rect x={12} y={-6.8} width={2.8} height={0.9} rx={0.3} fill={CARBON} />
      <rect x={12} y={5.9} width={2.8} height={0.9} rx={0.3} fill={CARBON} />
      {/* cockpit opening + halo */}
      <ellipse cx={1.2} cy={0} rx={2.3} ry={1.25} fill={TYRE} />
      <path d="M-0.6 -1.15 Q3.4 -1.3 3.9 0 Q3.4 1.3 -0.6 1.15" fill="none" stroke={CARBON} strokeWidth={0.75} />
      <line x1={3.9} y1={0} x2={5.2} y2={0} stroke={CARBON} strokeWidth={0.7} />
      {/* helmet */}
      <circle cx={0.9} cy={0} r={0.75} fill={light} />
    </g>
  );
}
