/**
 * App colors (spec #13; Appearance since v1.0.3). Pure data + helpers, no React: the live palette comes from
 * `useColors()` / `makeStyles()` in `src/hooks/use-theme.tsx`, driven by Settings → Appearance
 * (`AppSettings.appearance`: theme mode System / Light / Dark + accent color). Never hard-code colors in screens. No imports on purpose: `src/types/recipe.ts` imports its types.
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
export type AccentId =
  | 'green'
  | 'orange'
  | 'blue'
  | 'purple'
  | 'red'
  | 'teal'
  | 'pink'
  | 'amber'
  | 'indigo'
  | 'brown'
  | 'lime'
  | 'slate';

export const THEME_MODES: readonly { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

type AccentSwatch = Pick<ThemeColors, 'primary' | 'primaryText' | 'accent' | 'accentText'>;

/**
 * Accent themes. Each has a dark- and light-mode shade chosen for WCAG AA contrast (≥ 4.5:1) as text on the
 * background/card and against its own `primaryText`. Green is the original look (green + orange + button);
 * every other accent tints the + button and + menu icons with the same hue. v1.0.5: dark shades are saturated so each
 * accent reads as its name (no washed-out pastels); Slate is intentionally a cool gray.
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
    dark: { primary: '#B47CFF', primaryText: '#1E0A33', accent: '#B47CFF', accentText: '#1E0A33' }, // v1.0.5: was pastel #B39DDB
    light: { primary: '#6A1B9A', primaryText: '#FFFFFF', accent: '#6A1B9A', accentText: '#FFFFFF' },
  },
  {
    id: 'red',
    label: 'Red',
    // v1.0.5: a true, saturated red (was salmon #F28B82 in dark). Dark mode keeps near-black text on it: white on a red
    // bright enough to read on the dark card would be < 4.5:1.
    dark: { primary: '#FF4444', primaryText: '#1F0000', accent: '#FF4444', accentText: '#1F0000' },
    light: { primary: '#D32F2F', primaryText: '#FFFFFF', accent: '#D32F2F', accentText: '#FFFFFF' },
  },
  {
    id: 'teal',
    label: 'Teal',
    dark: { primary: '#26BFB0', primaryText: '#04201D', accent: '#26BFB0', accentText: '#04201D' }, // v1.0.5: was #4DB6AC
    light: { primary: '#00796B', primaryText: '#FFFFFF', accent: '#00796B', accentText: '#FFFFFF' },
  },
  // v1.0.5: six more (Jason). Light shades are deepened so links stay ≥ 4.5:1 on white; dark shades are lightened.
  {
    id: 'pink',
    label: 'Pink',
    dark: { primary: '#FF5CA8', primaryText: '#2B0A17', accent: '#FF5CA8', accentText: '#2B0A17' },
    light: { primary: '#AD1457', primaryText: '#FFFFFF', accent: '#AD1457', accentText: '#FFFFFF' },
  },
  {
    id: 'amber',
    label: 'Amber',
    dark: { primary: '#FFCA28', primaryText: '#261A00', accent: '#FFCA28', accentText: '#261A00' },
    light: { primary: '#8A5300', primaryText: '#FFFFFF', accent: '#8A5300', accentText: '#FFFFFF' },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    dark: { primary: '#7C8CFF', primaryText: '#0E1440', accent: '#7C8CFF', accentText: '#0E1440' },
    light: { primary: '#3949AB', primaryText: '#FFFFFF', accent: '#3949AB', accentText: '#FFFFFF' },
  },
  {
    id: 'brown',
    label: 'Brown',
    dark: { primary: '#CD8E62', primaryText: '#21120A', accent: '#CD8E62', accentText: '#21120A' },
    light: { primary: '#6D4C41', primaryText: '#FFFFFF', accent: '#6D4C41', accentText: '#FFFFFF' },
  },
  {
    id: 'lime',
    label: 'Lime',
    dark: { primary: '#C6D93F', primaryText: '#1A1C00', accent: '#C6D93F', accentText: '#1A1C00' },
    light: { primary: '#556300', primaryText: '#FFFFFF', accent: '#556300', accentText: '#FFFFFF' },
  },
  {
    id: 'slate',
    label: 'Slate',
    dark: { primary: '#B0BEC5', primaryText: '#111A1F', accent: '#B0BEC5', accentText: '#111A1F' },
    light: { primary: '#455A64', primaryText: '#FFFFFF', accent: '#455A64', accentText: '#FFFFFF' },
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
  return `#${out
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
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
