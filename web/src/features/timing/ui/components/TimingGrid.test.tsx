import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Driver } from "@/features/drivers/domain/driver";
import type { TimingRow } from "../../domain/timing-board";
import { GRID_COLUMNS, TimingGrid } from "./TimingGrid";

const drivers = new Map<number, Driver>([
  [1, { number: 1, acronym: "NOR", fullName: "Lando NORRIS", teamName: "McLaren", teamColour: "#F47600", headshotUrl: null }],
  [44, { number: 44, acronym: "HAM", fullName: "Lewis HAMILTON", teamName: "Ferrari", teamColour: "#ED1131", headshotUrl: null }],
]);

const row = (driverNumber: number, position: number, overrides: Partial<TimingRow> = {}): TimingRow => ({
  driverNumber, position, currentLap: 12,
  lastLap: { seconds: 90.123, mark: "normal", pitOut: false },
  sectors: [{ seconds: 28.5, mark: "overall-best", previous: false }, { seconds: 30.1, mark: "personal-best", previous: false }, null],
  bestLap: { seconds: 89.9, mark: "personal-best" },
  pace: 90.4, tyre: { compound: "SOFT", age: 4 }, gapAhead: null, gapBehind: { kind: "time", seconds: 1.234 },
  ...overrides,
});

function setup() {
  const props = {
    rows: [row(1, 1), row(44, 2, { gapAhead: { kind: "laps", laps: 1 }, gapBehind: null })],
    drivers, checked: [1], focused: 44, raceLike: true,
    onToggle: vi.fn(), onFocus: vi.fn(), onSelectAll: vi.fn(), onSelectNone: vi.fn(),
  };
  render(<TimingGrid {...props} />);
  return props;
}

describe("TimingGrid", () => {
  it("renders rows in order with times, marks, tyres and gaps", () => {
    setup();
    const [, first, second] = screen.getAllByRole("row");
    expect(within(first).getByText("NOR")).toBeInTheDocument();
    expect(within(first).getByText("1:30.123")).toBeInTheDocument();
    expect(within(first).getByText("(fastest overall)")).toBeInTheDocument();
    expect(within(first).getByText("Leader")).toBeInTheDocument();
    expect(within(first).getByText("+1.234")).toBeInTheDocument();
    expect(within(first).getByText("4L")).toBeInTheDocument();
    expect(within(second).getByText("+1 LAP")).toBeInTheDocument();
  });

  it("toggles map visibility without focusing, and focuses via the driver button", async () => {
    const props = setup();
    expect(screen.getByRole("checkbox", { name: "Show NOR on the map" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Show HAM on the map" }));
    expect(props.onToggle).toHaveBeenCalledWith(44);
    expect(props.onFocus).not.toHaveBeenCalled();

    expect(screen.getByRole("button", { name: /Lewis HAMILTON/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Lando NORRIS/ }));
    expect(props.onFocus).toHaveBeenCalledWith(1);
  });

  it("offers select all / none", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Show all" }));
    await userEvent.click(screen.getByRole("button", { name: "Show none" }));
    expect(props.onSelectAll).toHaveBeenCalled();
    expect(props.onSelectNone).toHaveBeenCalled();
  });

  it("shows each driver's team radio count in the session, none when zero", () => {
    render(
      <TimingGrid
        rows={[row(1, 1), row(44, 2)]}
        drivers={drivers}
        checked={[]}
        focused={null}
        raceLike={false}
        radioCounts={new Map([[44, 3]])}
        onToggle={vi.fn()}
        onFocus={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
      />,
    );
    expect(screen.getByTitle("3 team radio messages in this session")).toBeInTheDocument();
    expect(screen.queryAllByTitle(/team radio message/)).toHaveLength(1);
  });

  it("gives every column's header and cells the same alignment, from one column definition", () => {
    const { container } = render(
      <TimingGrid rows={[row(1, 1), row(44, 2)]} drivers={drivers} checked={[]} focused={null} raceLike
        onToggle={vi.fn()} onFocus={vi.fn()} onSelectAll={vi.fn()} onSelectNone={vi.fn()} />,
    );
    const alignOf = (el: Element) => [...el.classList].filter((c) => /align/i.test(c)).join(" ");
    const headers = [...container.querySelectorAll("thead th")];
    expect(headers.map((th) => th.getAttribute("data-column"))).toEqual(GRID_COLUMNS.map((c) => c.key));
    expect(container.querySelectorAll("colgroup col")).toHaveLength(GRID_COLUMNS.length);
    for (const tr of container.querySelectorAll("tbody tr")) {
      const cells = [...tr.querySelectorAll("td")];
      expect(cells).toHaveLength(headers.length);
      cells.forEach((td, i) => {
        expect(alignOf(td)).not.toBe("");
        expect(alignOf(td)).toBe(alignOf(headers[i]));
      });
    }
    // Numeric columns share one (end) alignment; the sector headers carry the map's sector colours.
    const numeric = GRID_COLUMNS.filter((c) => ["last", "s1", "s2", "s3", "best", "pace", "ahead", "behind"].includes(c.key));
    expect(new Set(numeric.map((c) => c.align))).toEqual(new Set(["end"]));
    for (const key of ["s1", "s2", "s3"]) {
      expect(container.querySelector(`th[data-column="${key}"] [data-sector="${key[1]}"]`)).not.toBeNull();
    }
  });
});
