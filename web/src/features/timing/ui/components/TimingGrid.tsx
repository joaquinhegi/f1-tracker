import type { ReactNode } from "react";
import type { Driver } from "@/features/drivers/domain/driver";
import { SectorSwatch, type SectorNumber } from "@/shared/ui/atoms/SectorSwatch";
import { formatGap, formatLapTime } from "../../domain/gap";
import type { SectorCell, TimingRow } from "../../domain/timing-board";
import type { TimeMark } from "../../domain/timing";
import styles from "./TimingGrid.module.css";

export interface TimingGridProps {
  rows: TimingRow[];
  drivers: Map<number, Driver>;
  checked: readonly number[];
  focused: number | null;
  raceLike: boolean;
  /** Team radio messages per driver in the whole session (null: unknown). */
  radioCounts?: Map<number, number> | null;
  onToggle: (driverNumber: number) => void;
  onFocus: (driverNumber: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

const MARK_LABEL: Record<TimeMark, string> = {
  "overall-best": "fastest overall",
  "personal-best": "personal best",
  normal: "",
};

function TimeChip({ seconds, mark, previous = false }: { seconds: number | null; mark: TimeMark; previous?: boolean }) {
  const label = MARK_LABEL[mark];
  return (
    <span
      className={[styles.chip, styles[mark], previous && styles.previous].filter(Boolean).join(" ")}
      title={[label, previous && "previous lap"].filter(Boolean).join(", ") || undefined}
    >
      {formatLapTime(seconds)}
      {label && <span className="visually-hidden"> ({label})</span>}
    </span>
  );
}

/** A plain (chip-less) numeric value, inset like a chip's text so every right edge lines up. */
function Value({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <span className={[styles.value, muted && styles.muted].filter(Boolean).join(" ")}>{children}</span>;
}

const Missing = () => <Value muted>—</Value>;

function Sector({ cell }: { cell: SectorCell | null }) {
  if (!cell) return <Missing />;
  return <TimeChip seconds={cell.seconds} mark={cell.mark} previous={cell.previous} />;
}

function RadioCount({ count }: { count: number }) {
  return (
    <span className={styles.radio} title={`${count} team radio ${count === 1 ? "message" : "messages"} in this session`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="M5 12a7 7 0 0 1 14 0" />
        <path d="M8.5 12a3.5 3.5 0 0 1 7 0" />
        <path d="M12 12v8" />
      </svg>
      {count}
      <span className="visually-hidden"> team radio {count === 1 ? "message" : "messages"}</span>
    </span>
  );
}

function Tyre({ tyre }: { tyre: TimingRow["tyre"] }) {
  if (!tyre) return <span className={styles.muted}>—</span>;
  const compound = (tyre.compound ?? "UNKNOWN").toUpperCase();
  return (
    <span className={styles.tyre} title={`${compound.toLowerCase()} tyre${tyre.age !== null ? `, ${tyre.age} laps old` : ""}`}>
      <span className={`${styles.compound} ${styles[compound] ?? ""}`} aria-hidden="true">
        {compound === "UNKNOWN" ? "?" : compound[0]}
      </span>
      <span className="visually-hidden">{compound.toLowerCase()}</span>
      {tyre.age !== null ? `${tyre.age}L` : ""}
    </span>
  );
}

export type ColumnAlign = "start" | "center" | "end";

export interface GridColumn {
  key: string;
  /** Header text ("" for a visually hidden label). */
  label: string;
  hiddenLabel?: string;
  align: ColumnAlign;
  /** Fixed width (CSS length); the driver column takes the rest. */
  width?: string;
  sector?: SectorNumber;
  sticky?: "check" | "pos" | "driver";
}

/**
 * The grid's columns. Header, cells and `<col>` widths all come from here,
 * so a header always has the alignment of its values. Numbers are
 * right-aligned (tabular, monospaced) and every chip fills its column, so
 * the coloured boxes have the same width in every row.
 */
export const GRID_COLUMNS: readonly GridColumn[] = [
  { key: "check", label: "", hiddenLabel: "Show on map", align: "center", width: "2.25rem", sticky: "check" },
  { key: "pos", label: "Pos", align: "end", width: "2.75rem", sticky: "pos" },
  { key: "driver", label: "Driver", align: "start", sticky: "driver" },
  { key: "last", label: "Last lap", align: "end", width: "5.75rem" },
  { key: "s1", label: "S1", align: "end", width: "4.75rem", sector: 1 },
  { key: "s2", label: "S2", align: "end", width: "4.75rem", sector: 2 },
  { key: "s3", label: "S3", align: "end", width: "4.75rem", sector: 3 },
  { key: "best", label: "Best", align: "end", width: "5.75rem" },
  { key: "pace", label: "Pace", align: "end", width: "5.25rem" },
  { key: "tyre", label: "Tyre", align: "start", width: "4.5rem" },
  { key: "ahead", label: "Ahead", align: "end", width: "5.25rem" },
  { key: "behind", label: "Behind", align: "end", width: "5.25rem" },
];

const ALIGN_CLASS: Record<ColumnAlign, string> = { start: styles.alignStart, center: styles.alignCenter, end: styles.alignEnd };
const STICKY_CLASS = { check: styles.stickyCheck, pos: styles.stickyPos, driver: styles.stickyDriver } as const;

function columnClass(column: GridColumn, extra?: string | false): string {
  return [ALIGN_CLASS[column.align], column.sticky && STICKY_CLASS[column.sticky], extra].filter(Boolean).join(" ");
}

function headerTitle(key: string, raceLike: boolean): string | undefined {
  if (key === "pace") return "Mean of the last 5 clean laps";
  if (key === "ahead") return raceLike ? "Interval to the car ahead" : "Best-lap gap to the car ahead";
  if (key === "behind") return raceLike ? "Interval to the car behind" : "Best-lap gap to the car behind";
  return undefined;
}

const column = (key: string) => GRID_COLUMNS.find((c) => c.key === key)!;

/**
 * Organism: the drivers grid. One row per car in running order with its
 * "show on map" checkbox, timing, tyre and gaps. Clicking a row (or its
 * driver button) focuses that driver for the team radio below.
 */
export function TimingGrid(props: TimingGridProps) {
  const { rows, drivers, checked, focused, raceLike } = props;
  return (
    <div>
      <div className={styles.toolbar}>
        <p className={styles.hint}>Tick drivers to show them on the map. Select a driver to hear their team radio.</p>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.toolbarButton} onClick={props.onSelectAll}>
            Show all
          </button>
          <button type="button" className={styles.toolbarButton} onClick={props.onSelectNone}>
            Show none
          </button>
        </div>
      </div>
      <div className={styles.scroller} tabIndex={0} role="region" aria-label="Timing table (scrolls horizontally)">
        <table className={styles.table}>
          <colgroup>
            {GRID_COLUMNS.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {GRID_COLUMNS.map((c) => (
                <th key={c.key} scope="col" className={columnClass(c)} title={headerTitle(c.key, raceLike)} data-column={c.key}>
                  {c.hiddenLabel ? (
                    <span className="visually-hidden">{c.hiddenLabel}</span>
                  ) : c.sector ? (
                    <span className={styles.sectorHead}>
                      <SectorSwatch sector={c.sector} />
                      {c.label}
                    </span>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const driver = drivers.get(row.driverNumber);
              const acronym = driver?.acronym ?? String(row.driverNumber);
              const isFocused = row.driverNumber === focused;
              return (
                <tr
                  key={row.driverNumber}
                  className={[styles.row, isFocused && styles.focused].filter(Boolean).join(" ")}
                  aria-current={isFocused || undefined}
                  onClick={() => props.onFocus(row.driverNumber)}
                >
                  <td className={columnClass(column("check"))}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={checked.includes(row.driverNumber)}
                      aria-label={`Show ${acronym} on the map`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => props.onToggle(row.driverNumber)}
                    />
                  </td>
                  <td className={columnClass(column("pos"), styles.pos)}>
                    <Value>{row.position ?? "—"}</Value>
                  </td>
                  <td className={columnClass(column("driver"))}>
                    <button
                      type="button"
                      className={styles.driver}
                      aria-pressed={isFocused}
                      aria-label={`${driver?.fullName ?? acronym}, focus for team radio`}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onFocus(row.driverNumber);
                      }}
                    >
                      <span className={styles.colourBar} style={{ background: driver?.teamColour }} aria-hidden="true" />
                      <span className={styles.acronym}>{acronym}</span>
                      <span className={styles.team}>{driver?.teamName ?? ""}</span>
                      {(props.radioCounts?.get(row.driverNumber) ?? 0) > 0 && (
                        <RadioCount count={props.radioCounts!.get(row.driverNumber)!} />
                      )}
                    </button>
                  </td>
                  <td className={columnClass(column("last"), styles.time)}>
                    {row.lastLap ? <TimeChip seconds={row.lastLap.seconds} mark={row.lastLap.mark} /> : <Missing />}
                  </td>
                  {row.sectors.map((cell, i) => (
                    <td key={i} className={columnClass(column(`s${i + 1}`), styles.time)}>
                      <Sector cell={cell} />
                    </td>
                  ))}
                  <td className={columnClass(column("best"), styles.time)}>
                    {row.bestLap ? <TimeChip seconds={row.bestLap.seconds} mark={row.bestLap.mark} /> : <Missing />}
                  </td>
                  <td className={columnClass(column("pace"), styles.time)}>
                    {row.pace === null ? <Missing /> : <Value>{formatLapTime(row.pace)}</Value>}
                  </td>
                  <td className={columnClass(column("tyre"))}>
                    <Tyre tyre={row.tyre} />
                  </td>
                  <td className={columnClass(column("ahead"), styles.time)}>
                    {row.position === 1 && raceLike ? <Value muted>Leader</Value> : <Value muted={!row.gapAhead}>{formatGap(row.gapAhead)}</Value>}
                  </td>
                  <td className={columnClass(column("behind"), styles.time)}>
                    <Value muted={!row.gapBehind}>{formatGap(row.gapBehind)}</Value>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.legend}>
        <span>
          <span className={`${styles.chip} ${styles.swatch} ${styles["overall-best"]}`} aria-hidden="true" /> Fastest overall
        </span>
        <span>
          <span className={`${styles.chip} ${styles.swatch} ${styles["personal-best"]}`} aria-hidden="true" /> Personal best
        </span>
        <span>
          <span className={`${styles.chip} ${styles.swatch} ${styles.normalSwatch}`} aria-hidden="true" /> No improvement
        </span>
        <span>
          <SectorSwatch sector={1} />
          <SectorSwatch sector={2} />
          <SectorSwatch sector={3} /> Sector colours, as on the track map
        </span>
        <span>Faded: previous lap. Pace: mean of the last 5 clean laps (no pit laps, none slower than 107% of the driver&apos;s median).</span>
      </p>
    </div>
  );
}
