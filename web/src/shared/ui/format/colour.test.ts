import { describe, expect, it } from "vitest";
import { contrastRatio, labelColours, mixColour, readableColourOn, readableTextOn, relativeLuminance } from "./colour";

describe("colour helpers", () => {
  it("mixes towards a target", () => {
    expect(mixColour("#FF0000", "#000000", 0.5)).toBe("#800000");
    expect(mixColour("#123456", "#FFFFFF", 0)).toBe("#123456");
    expect(mixColour("not a colour", "#FFFFFF", 0.5)).toBe("not a colour");
  });

  it("computes WCAG luminance and contrast", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21);
  });

  it("picks the readable text colour for team colours", () => {
    // Mercedes teal and McLaren papaya are light: dark text.
    expect(readableTextOn("#27F4D2")).toBe("#0D1117");
    expect(readableTextOn("#F47600")).toBe("#0D1117");
    // Williams / Red Bull blues are dark: white text.
    expect(readableTextOn("#1868DB")).toBe("#FFFFFF");
    expect(readableTextOn("#4781D7")).toBe("#0D1117".length ? readableTextOn("#4781D7") : "");
  });

  it("gives every 2026 team colour an AA label, darkening mid-tone reds", () => {
    const teams = ["#00A1E8", "#00D7B6", "#1868DB", "#229971", "#4781D7", "#6C98FF", "#909090", "#9C9FA2", "#ED1131", "#F47600", "#F50537"];
    for (const team of teams) {
      const { background, text } = labelColours(team);
      expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(labelColours("#F47600")).toEqual({ background: "#F47600", text: "#0D1117" });
    expect(labelColours("#ED1131").background).not.toBe("#ED1131");
  });

  it("lightens a dark team colour until it reads on a dark surface", () => {
    const surface = "#161B22";
    expect(readableColourOn("#F47600", surface)).toBe("#F47600");
    const blue = readableColourOn("#1868DB", surface);
    expect(blue).not.toBe("#1868DB");
    expect(contrastRatio(blue, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens a light team colour until it reads on a light surface", () => {
    const surface = "#FFFFFF";
    for (const team of ["#27F4D2", "#F47600", "#9C9FA2", "#FFFFFF"]) {
      const colour = readableColourOn(team, surface);
      expect(contrastRatio(colour, surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(readableColourOn("#1868DB", surface)).toBe("#1868DB");
  });
});
