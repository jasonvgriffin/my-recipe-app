/**
 * App colors (spec #13; Appearance since v1.0.3). Pure data + helpers, no React: the live palette comes from
 * `useColors()` / `makeStyles()` in `src/hooks/use-theme.tsx`, driven by Settings → Appearance
 * (`AppSettings.appearance`: theme mode System / Light / Dark + accent color). Never hard-code colors in screens. No imports on purpose: `src/types/recipe.ts` (shared with the
 * MCP Edge Function) imports its types.
 */
export interface ThemeColors {
  /** Accent color: links, primary buttons, tab highlight, selected chips. */
  primary: string;
  /** Text/icons on a `primary` background. */
  primaryText: string;
  /** Center + button and the + menu icons (v1.0.2, Cronometer-style). */
  accent: string;
  /** Text/icons on an `accent` background. */
  accentText: string;
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  danger: string;
  /** Tinted background for tags, today's calendar cell, selected rows. */
  tagBg: string;
  input: string;
  placeholder: string;
  /** Dimmed backdrop behind sheets/modals. */
  backdrop: string;
  shadow: string;
}

export type ColorScheme = 'light' | 'dark';
export type ThemeMode = 'system' | ColorScheme;
export type AccentId = 'green' | 'orange' | 'blue' | 'purple' | 'red' | 'teal';

export const THEME_MODES: readonly { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

type AccentSwatch = Pick<ThemeColors, 'primary' | 'primaryText' | 'accent' | 'accentText'>;

/**
 * Accent themes. Each has a dark- and light-mode shade chosen for WCAG AA contrast (≥ 4.5:1) as text on the
 * background/card and against its own `primaryText`. Green is the original look (green + orange + button);
 * every other accent tints the + button and + menu icons with the same hue.
 */
export const ACCENTS: readonly { id: AccentId; label: string; dark: AccentSwatch; light: AccentSwatch }[] = [
  {
    id: 'green',
    label: 'Green',
    dark: { primary: '#66BB6A', primaryText: '#0B1F0C', accent: '#FF8A3D', accentText: '#1F1206' },
    light: { primary: '#2E7D32', primaryText: '#FFFFFF', accent: '#C2410C', accentText: '#FFFFFF' },
  },
  {
    id: 'orange',
    label: 'Orange',
    dark: { primary: '#FF9E5E', primaryText: '#1F1206', accent: '#FF8A3D', accentText: '#1F1206' },
    light: { primary: '#B54708', primaryText: '#FFFFFF', accent: '#B54708', accentText: '#FFFFFF' },
  },
  {
    id: 'blue',
    label: 'Blue',
    dark: { primary: '#64B5F6', primaryText: '#08192B', accent: '#64B5F6', accentText: '#08192B' },
    light: { primary: '#1565C0', primaryText: '#FFFFFF', accent: '#1565C0', accentText: '#FFFFFF' },
  },
  {
    id: 'purple',
    label: 'Purple',
    dark: { primary: '#B39DDB', primaryText: '#1A1030', accent: '#B39DDB', accentText: '#1A1030' },
    light: { primary: '#6A1B9A', primaryText: '#FFFFFF', accent: '#6A1B9A', accentText: '#FFFFFF' },
  },
  {
    id: 'red',
    label: 'Red',
    dark: { primary: '#F28B82', primaryText: '#2B0B09', accent: '#F28B82', accentText: '#2B0B09' },
    light: { primary: '#C62828', primaryText: '#FFFFFF', accent: '#C62828', accentText: '#FFFFFF' },
  },
  {
    id: 'teal',
    label: 'Teal',
    dark: { primary: '#4DB6AC', primaryText: '#06201D', accent: '#4DB6AC', accentText: '#06201D' },
    light: { primary: '#00796B', primaryText: '#FFFFFF', accent: '#00796B', accentText: '#FFFFFF' },
  },
];

type Base = Omit<ThemeColors, keyof AccentSwatch | 'tagBg'>;

const BASES: Record<ColorScheme, Base> = {
  dark: {
    background: '#121412',
    card: '#1D211D',
    text: '#ECEFEC',
    muted: '#9AA59C',
    border: '#2E352F',
    danger: '#EF5350',
    input: '#181B18',
    placeholder: '#6C766E',
    backdrop: 'rgba(0,0,0,0.55)',
    shadow: '#000000',
  },
  light: {
    background: '#F5F7F5',
    card: '#FFFFFF',
    text: '#151A16',
    muted: '#566159',
    border: '#D3DAD4',
    danger: '#C62828',
    input: '#FFFFFF',
    placeholder: '#6E7970',
    backdrop: 'rgba(0,0,0,0.4)',
    shadow: '#000000',
  },
};

/** Mix two #RRGGBB colors (t = share of `b`). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative-luminance contrast ratio between two #RRGGBB colors (used by tests). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = parseHex(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DEFAULT_ACCENT: AccentId = 'green';

export function isThemeMode(v: unknown): v is ThemeMode {
  return THEME_MODES.some((m) => m.id === v);
}

export function isAccentId(v: unknown): v is AccentId {
  return ACCENTS.some((a) => a.id === v);
}

/** Resolve the mode against the OS scheme (System follows the phone; unknown → dark, the original look). */
export function resolveScheme(mode: ThemeMode, system: ColorScheme | null | undefined): ColorScheme {
  if (mode === 'system') return system === 'light' ? 'light' : 'dark';
  return mode;
}

const cache = new Map<string, ThemeColors>();

/** The full palette for a scheme + accent (memoized, so the same object is returned for the same inputs). */
export function buildColors(scheme: ColorScheme, accentId: AccentId = DEFAULT_ACCENT): ThemeColors {
  const key = `${scheme}:${accentId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0];
  const swatch = accent[scheme];
  const base = BASES[scheme];
  const colors: ThemeColors = {
    ...base,
    ...swatch,
    tagBg: mixHex(base.background, swatch.primary, scheme === 'dark' ? 0.16 : 0.12),
  };
  cache.set(key, colors);
  return colors;
}

/** Original dark + green palette: the default before settings load, and the fallback outside the provider. */
export const defaultColors: ThemeColors = buildColors('dark', DEFAULT_ACCENT);
