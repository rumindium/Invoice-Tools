/**
 * Colour theme of a document template. A company picks one accent colour; every other
 * colour the layouts need (tints, readable text on white, text on an accent fill) is derived
 * from it, so any accent produces a legible document.
 */

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export interface TemplateTheme {
  /** The chosen colour, normalised to lowercase #rrggbb. */
  accent: string;
  /** Accent safe for text and thin lines on white (darkened when the accent is very light). */
  accentText: string;
  /** A darker shade for gradients and borders on accent fills. */
  accentDeep: string;
  /** Text colour on an accent fill: white, or near-black for light accents. */
  onAccent: string;
  /** Light tint for panels and header rows. */
  soft: string;
  /** Very light tint for zebra rows. */
  tint: string;
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return color.map((channel, index) => channel + (target[index]! - channel) * amount) as Rgb;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function normaliseColor(value: string, fallback: string): string {
  return isHexColor(value) ? value.toLowerCase() : fallback.toLowerCase();
}

export function buildTheme(accentColor: string, fallback = '#2563eb'): TemplateTheme {
  const accent = normaliseColor(accentColor, fallback);
  const rgb = toRgb(accent);
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];

  // Darken until the accent reads on white (4.5:1 for text), at most 12 steps.
  let text = rgb;
  for (let step = 0; step < 12 && contrastRatio(toHex(text), '#ffffff') < 4.5; step += 1) {
    text = mix(text, black, 0.12);
  }

  return {
    accent,
    accentText: toHex(text),
    accentDeep: toHex(mix(rgb, black, 0.28)),
    onAccent: contrastRatio(accent, '#ffffff') >= 3 ? '#ffffff' : '#111827',
    soft: toHex(mix(rgb, white, 0.88)),
    tint: toHex(mix(rgb, white, 0.95)),
  };
}
