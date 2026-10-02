import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SectorsDto } from "../../application/circuit-outline-dto";
import { CircuitMap, sectorLabelPosition } from "./CircuitMap";

const outline = {
  viewBox: "0 0 1000 500",
  path: "M40.0 40.0 L960.0 40.0 L960.0 460.0 Z",
  startFinish: { point: { x: 500, y: 40 }, direction: { x: 1, y: 0 } },
  transform: { bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, scale: 1, padding: 40, width: 1000, height: 500 },
};

describe("CircuitMap", () => {
  it("renders the outline as an accessible SVG with a start/finish line", () => {
    const { container } = render(<CircuitMap outline={outline} title="Monza track map" />);
    const svg = screen.getByRole("img", { name: "Monza track map" });
    expect(svg).toHaveAttribute("viewBox", "0 0 1000 500");
    expect(container.querySelectorAll("path")).toHaveLength(2);
    // Perpendicular to travel direction (1, 0): a vertical line through (500, 40).
    const line = container.querySelector("line")!;
    expect([line.getAttribute("x1"), line.getAttribute("x2")]).toEqual(["500", "500"]);
  });

  it("omits the start/finish marker when unknown", () => {
    const { container } = render(<CircuitMap outline={{ ...outline, startFinish: null }} title="Map" />);
    expect(container.querySelector("line")).toBeNull();
  });

  it("paints the track per sector with labelled boundary ticks when sectors are known", () => {
    const sectors: SectorsDto = {
      paths: ["M40 40 L500 40", "M500 40 L960 40 L960 200", "M960 200 L960 460 L40 40"],
      boundaries: [
        { share: 0.3, point: { x: 500, y: 40 }, direction: { x: 1, y: 0 }, raw: { x: 0, y: 0 } },
        { share: 0.6, point: { x: 960, y: 200 }, direction: { x: 0, y: 1 }, raw: { x: 0, y: 0 } },
      ],
    };
    const { container } = render(<CircuitMap outline={{ ...outline, sectors }} title="Map" />);
    expect([...container.querySelectorAll("path[data-sector]")].map((p) => p.getAttribute("d"))).toEqual(sectors.paths);
    expect(container.querySelectorAll("line[data-boundary]")).toHaveLength(2);
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["S1", "S2", "S3"]);
    // Casing + three sectors: the single-colour track is not drawn.
    expect(container.querySelectorAll("path")).toHaveLength(4);
  });

  it("puts a sector label outside the loop", () => {
    // Boundary on the top edge heading +x: the centre is below, so the label goes above.
    const at = sectorLabelPosition({ sector: 2, point: { x: 500, y: 40 }, direction: { x: 1, y: 0 } }, { x: 500, y: 250 }, 1);
    expect(at.y).toBeLessThan(40);
  });
});
