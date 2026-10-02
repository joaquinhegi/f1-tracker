import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarMarker } from "./CarMarker";

describe("CarMarker", () => {
  it("draws the car in the team colour, hidden until placed, with its acronym", () => {
    const { container } = render(
      <svg>
        <CarMarker acronym="NOR" colour="#F47600" scale={1} focused />
      </svg>,
    );
    const marker = container.querySelector("g[data-acronym='NOR']")!;
    expect(marker.getAttribute("visibility")).toBe("hidden");
    expect(container.querySelector("path[data-part='body']")?.getAttribute("fill")).toBe("#F47600");
    expect(container.querySelector("text")?.textContent).toBe("NOR");
    expect(container.querySelector("circle.focusRing")).not.toBeNull(); // focus ring
    // Papaya is light: the label pill keeps the colour and uses dark text.
    expect(container.querySelector("rect[rx]")).not.toBeNull();
    expect(container.querySelector("text")?.getAttribute("fill")).toBe("#0D1117");
  });

  it("darkens a mid-tone red pill so white text reaches AA, and has no ring when not focused", () => {
    const { container } = render(
      <svg>
        <CarMarker acronym="LEC" colour="#ED1131" scale={1} />
      </svg>,
    );
    expect(container.querySelector("circle.focusRing")).toBeNull();
    expect(container.querySelector("text")?.getAttribute("fill")).toBe("#FFFFFF");
  });
});
