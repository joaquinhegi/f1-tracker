/** Colour helpers for team colours ("#RRGGBB"). Pure. */

type Rgb = [number, number, number];

function parse(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** `hex` blended towards `target` by `amount` (0..1). Invalid input comes back unchanged. */
export function mixColour(hex: string, target: string, amount: number): string {
  const a = parse(hex);
  const b = parse(target);
  if (!a || !b) return hex;
  const k = Math.max(0, Math.min(1, amount));
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k) as Rgb);
}

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(hex: string): number {
  const rgb = parse(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const DARK_TEXT = "#0D1117";
export const LIGHT_TEXT = "#FFFFFF";

/** Text colour (near-black or white) with the higher contrast on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(DARK_TEXT, background) >= contrastRatio(LIGHT_TEXT, background) ? DARK_TEXT : LIGHT_TEXT;
}

/** WCAG AA for normal-size text. */
export const AA_TEXT_CONTRAST = 4.5;

/**
 * A label in a team colour: the colour itself with readable text, or (for
 * mid-tone colours like F1 reds, where neither black nor white reaches AA)
 * the colour darkened just enough for white text to.
 */
export function labelColours(teamColour: string): { background: string; text: string } {
  const text = readableTextOn(teamColour);
  if (contrastRatio(text, teamColour) >= AA_TEXT_CONTRAST) return { background: teamColour, text };
  for (let k = 0.05; k <= 1; k += 0.05) {
    const background = mixColour(teamColour, "#000000", k);
    if (contrastRatio(LIGHT_TEXT, background) >= AA_TEXT_CONTRAST) return { background, text: LIGHT_TEXT };
  }
  return { background: "#000000", text: LIGHT_TEXT };
}

/**
 * `colour` moved just enough to read as text on `background` at AA: lightened
 * (towards white) on a dark background, e.g. a dark team blue on a dark
 * bubble, darkened (towards black) on a light one, e.g. a team cyan on white.
 */
export function readableColourOn(colour: string, background: string): string {
  const extreme = readableTextOn(background) === DARK_TEXT ? "#000000" : "#FFFFFF";
  for (let k = 0; k <= 1; k += 0.05) {
    const candidate = mixColour(colour, extreme, k);
    if (contrastRatio(candidate, background) >= AA_TEXT_CONTRAST) return candidate;
  }
  return readableTextOn(background);
}
