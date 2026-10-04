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
  /**
   * Alias of `primary`. v1.0.9 removed the separate orange “+” color so this cannot diverge from the
   * accent the user picked. Center + button, More icons and add-menu icons read `primary`.
   */
  accent: string;
  /** Alias of `primaryText`. */
  accentText: string;
  /** Status badge fill. Fixed red in every accent and mode. */
  badge: string;
  /** Text on a `badge`. Always white. */
  badgeText: string;
  /** Ring around a badge so it stays visible when the Red accent is selected. */
  badgeRing: string;
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  danger: string;
  /**
   * Trash / delete icons. The danger red, except while the Red accent is selected — then a neutral muted
   * color so the outlined trash doesn't match the red edit pencils (v1.0.8).
   */
  dangerIcon: string;
  /** On/off switch track when the switch is on. Green in both schemes, independent of the accent (v1.0.8). */
  switchTrack: string;
  /** On/off switch knob when on. A green that matches `switchTrack` (not the default Android teal). */
  switchThumb: string;
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

type AccentSwatch = Pick<ThemeColors, 'primary' | 'primaryText'>;

/** Text/icons on an accent fill. Dark on Amber and Lime; white on the other ten. */
export const ACCENT_ON_DARK = '#121412';
export const ACCENT_ON_LIGHT = '#FFFFFF';

/** Accents whose fill is light enough that the on-color is dark. */
export const DARK_ON_ACCENT_IDS: readonly AccentId[] = ['amber', 'lime'];

/**
 * Fixed status badge (v1.0.9). Not an accent: it stays this red with white text in every theme.
 * `badgeRing` is a thin white outline so the badge does not disappear on the Red accent.
 */
export const BADGE_COLORS = { badge: '#E53935', badgeText: '#FFFFFF', badgeRing: '#FFFFFF' } as const;

/** Backgrounds the shared accent shade must clear at about 3:1 (white and the dark card). */
export const ACCENT_CONTRAST_BACKGROUNDS = ['#FFFFFF', '#1D211D'] as const;

function shade(primary: string, on: 'dark' | 'light'): AccentSwatch {
  return { primary, primaryText: on === 'dark' ? ACCENT_ON_DARK : ACCENT_ON_LIGHT };
}

/**
 * Accent themes (v1.0.9). One mid-tone per accent, used in both light and dark mode, with about 3:1 contrast
 * on white and on the dark card. Amber is golden and Lime is a bright lime (dark on-color). The other ten
 * use white on-color. There is no second “+ button” color.
 */
export const ACCENTS: readonly { id: AccentId; label: string; dark: AccentSwatch; light: AccentSwatch }[] = [
  { id: 'green', label: 'Green', dark: shade('#3C8F40', 'light'), light: shade('#3C8F40', 'light') },
  { id: 'orange', label: 'Orange', dark: shade('#CF5D00', 'light'), light: shade('#CF5D00', 'light') },
  { id: 'blue', label: 'Blue', dark: shade('#1981DC', 'light'), light: shade('#1981DC', 'light') },
  { id: 'purple', label: 'Purple', dark: shade('#9D5DEE', 'light'), light: shade('#9D5DEE', 'light') },
  { id: 'red', label: 'Red', dark: shade('#E6423F', 'light'), light: shade('#E6423F', 'light') },
  { id: 'teal', label: 'Teal', dark: shade('#008F80', 'light'), light: shade('#008F80', 'light') },
  { id: 'pink', label: 'Pink', dark: shade('#EB3271', 'light'), light: shade('#EB3271', 'light') },
  // Brighter than a brown-gold so the name still reads Amber. Dark on-color.
  { id: 'amber', label: 'Amber', dark: shade('#C1810A', 'dark'), light: shade('#C1810A', 'dark') },
  { id: 'indigo', label: 'Indigo', dark: shade('#6C7AC6', 'light'), light: shade('#6C7AC6', 'light') },
  { id: 'brown', label: 'Brown', dark: shade('#AC714F', 'light'), light: shade('#AC714F', 'light') },
  // A true lime, not olive. Dark on-color.
  { id: 'lime', label: 'Lime', dark: shade('#58A018', 'dark'), light: shade('#58A018', 'dark') },
  { id: 'slate', label: 'Slate', dark: shade('#69838F', 'light'), light: shade('#69838F', 'light') },
];

/** Green switch chrome in both color schemes (v1.0.8). Not derived from the accent, and not teal. */
const SWITCH_ON = { track: '#43A047', thumb: '#C8E6C9' } as const;

type Base = Omit<
  ThemeColors,
  | keyof AccentSwatch
  | 'accent'
  | 'accentText'
  | 'badge'
  | 'badgeText'
  | 'badgeRing'
  | 'tagBg'
  | 'dangerIcon'
  | 'switchTrack'
  | 'switchThumb'
>;

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
    accent: swatch.primary,
    accentText: swatch.primaryText,
    ...BADGE_COLORS,
    tagBg: mixHex(base.background, swatch.primary, scheme === 'dark' ? 0.16 : 0.12),
    dangerIcon: accentId === 'red' ? base.muted : base.danger,
    switchTrack: SWITCH_ON.track,
    switchThumb: SWITCH_ON.thumb,
  };
  cache.set(key, colors);
  return colors;
}

/** Original dark + green palette: the default before settings load, and the fallback outside the provider. */
export const defaultColors: ThemeColors = buildColors('dark', DEFAULT_ACCENT);
