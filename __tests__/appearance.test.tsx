/**
 * v1.0.3 Settings → Appearance: theme mode (System / Light / Dark, default System) and accent color, applied
 * app-wide through `src/hooks/use-theme.tsx` and saved in local settings. Free (no entitlement gate).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';

import {
  ACCENT_CONTRAST_BACKGROUNDS,
  ACCENTS,
  BADGE_COLORS,
  DARK_ON_ACCENT_IDS,
  THEME_MODES,
  buildColors,
  contrastRatio,
  resolveScheme,
  type ColorScheme,
} from '@/lib/theme';
import { createSettingsStore, settingsStore, SETTINGS_STORAGE_KEY } from '@/storage/settings';
import { DEFAULT_SETTINGS } from '@/types/recipe';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.5' } } }));

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/more': require('@/app/(tabs)/more').default,
  '(tabs)/add-menu': require('@/app/(tabs)/add-menu').default,
  settings: require('@/app/settings').default,
});

beforeAll(() => {
  routes();
}, 60_000);

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
});

describe('palettes', () => {
  const schemes: ColorScheme[] = ['dark', 'light'];
  it.each(schemes.flatMap((s) => ACCENTS.map((a) => [s, a.id] as const)))(
    '%s + %s has readable contrast',
    (scheme, accent) => {
      const c = buildColors(scheme, accent);
      for (const bg of [c.background, c.card, ...ACCENT_CONTRAST_BACKGROUNDS]) {
        expect(contrastRatio(c.primary, bg)).toBeGreaterThanOrEqual(3); // one shade on white and the dark card
        expect(contrastRatio(c.text, bg === '#FFFFFF' || bg === '#1D211D' ? c.card : bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(c.muted, c.card)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(c.primaryText, c.primary)).toBeGreaterThanOrEqual(3); // on-color on the fill
      expect(c.accent).toBe(c.primary);
      expect(c.accentText).toBe(c.primaryText);
      expect(c.badge).toBe(BADGE_COLORS.badge);
      expect(c.badgeText).toBe(BADGE_COLORS.badgeText);
      expect(c.badgeRing).toBe(BADGE_COLORS.badgeRing);
      // Fixed badge pair #E53935 / white is ~4.23:1 (Eve: keep this red, do not darken it to clear 4.5).
      expect(contrastRatio(c.badgeText, c.badge)).toBeGreaterThanOrEqual(4.2);
      expect(contrastRatio(c.text, c.tagBg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(c.danger, c.card)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('v1.0.5: dark-mode accents are saturated, not pastel; Red is a true red in both modes', () => {
    const hsl = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      let h = 0;
      if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, s: sat, l };
    };
    // Slate is a gray by design. Every other accent stays saturated enough to read as its name.
    for (const a of ACCENTS.filter((x) => x.id !== 'slate'))
      expect([a.id, hsl(a.dark.primary).s >= 0.35]).toEqual([a.id, true]);
    for (const scheme of ['dark', 'light'] as const) {
      const red = hsl(buildColors(scheme, 'red').primary);
      expect(red.h <= 8 || red.h >= 352).toBe(true);
      expect(red.s).toBeGreaterThanOrEqual(0.6);
    }
    expect(buildColors('dark', 'red').primary).toBe('#E6423F');
    expect(buildColors('light', 'red').primary).toBe('#E6423F');
    expect(buildColors('light', 'red').primaryText).toBe('#FFFFFF');
    expect(buildColors('dark', 'red').primary).not.toBe(BADGE_COLORS.badge);
  });

  it('v1.0.9: one shade per accent, dark on Amber and Lime, badges fixed red', () => {
    const hsl = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      let h = 0;
      if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, l };
    };
    for (const a of ACCENTS) {
      expect(a.dark.primary).toBe(a.light.primary);
      expect(a.dark.primaryText).toBe(a.light.primaryText);
      const darkOn = (DARK_ON_ACCENT_IDS as readonly string[]).includes(a.id);
      expect(a.dark.primaryText).toBe(darkOn ? '#121412' : '#FFFFFF');
      for (const scheme of ['dark', 'light'] as const) {
        const c = buildColors(scheme, a.id);
        for (const bg of ACCENT_CONTRAST_BACKGROUNDS) {
          expect(contrastRatio(c.primary, bg)).toBeGreaterThanOrEqual(3);
        }
        expect(contrastRatio(c.primaryText, c.primary)).toBeGreaterThanOrEqual(darkOn ? 4.5 : 3.9);
      }
    }
    const amber = hsl(buildColors('dark', 'amber').primary);
    expect(amber.h).toBeGreaterThanOrEqual(38);
    expect(amber.h).toBeLessThanOrEqual(50);
    expect(amber.l).toBeGreaterThan(hsl('#A77500').l);
    expect(ACCENTS.find((a) => a.id === 'amber')?.label).toBe('Amber');
    for (const id of ['green', 'blue', 'red', 'amber'] as const) {
      for (const scheme of ['dark', 'light'] as const) {
        const c = buildColors(scheme, id);
        expect(c.switchTrack).toBe('#43A047');
        expect(c.switchThumb).toBe('#C8E6C9');
      }
    }
    expect(buildColors('dark', 'red').dangerIcon).toBe(buildColors('dark', 'red').muted);
    expect(buildColors('light', 'red').dangerIcon).toBe(buildColors('light', 'red').muted);
    expect(buildColors('dark', 'green').dangerIcon).toBe(buildColors('dark', 'green').danger);
    for (const scheme of ['dark', 'light'] as const) {
      const c = buildColors(scheme, 'green');
      expect(contrastRatio(c.placeholder, c.card)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.muted, c.card)).toBeGreaterThanOrEqual(3);
    }
  });

  it('Green is one shade in both modes and the + button uses that shade', () => {
    const dark = buildColors('dark', 'green');
    const light = buildColors('light', 'green');
    expect(dark.primary).toBe('#3C8F40');
    expect(light.primary).toBe(dark.primary);
    expect(dark.accent).toBe(dark.primary);
    expect(light.accent).toBe(light.primary);
    expect(dark.background).toBe('#121412');
  });

  it('System follows the phone; unknown falls back to dark', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('offers System / Light / Dark and twelve accents (six more in v1.0.5)', () => {
    expect(THEME_MODES.map((m) => m.label)).toEqual(['System', 'Light', 'Dark']);
    expect(ACCENTS.map((a) => a.label)).toEqual([
      'Green',
      'Orange',
      'Blue',
      'Purple',
      'Red',
      'Teal',
      'Pink',
      'Amber',
      'Indigo',
      'Brown',
      'Lime',
      'Slate',
    ]);
    expect(new Set(ACCENTS.map((a) => a.dark.primary)).size).toBe(ACCENTS.length);
    expect(ACCENTS.every((a) => a.dark.primary === a.light.primary)).toBe(true);
  });
});

describe('appearance settings', () => {
  it('defaults to System + Green, persists changes, and ignores unknown stored values', async () => {
    expect(DEFAULT_SETTINGS.appearance).toEqual({ themeMode: 'system', accent: 'green', appIcon: 'default' });
    expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'system', accent: 'green', appIcon: 'default' });
    await settingsStore.update({ appearance: { accent: 'teal' } });
    await settingsStore.update({ appearance: { themeMode: 'light' } });
    expect((await createSettingsStore().get()).appearance).toEqual({ themeMode: 'light', accent: 'teal', appIcon: 'default' });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ appearance: { themeMode: 'neon', accent: 'gold', appIcon: 'rainbow' } }),
    );
    expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'system', accent: 'green', appIcon: 'default' });
  });
});

describe('Settings → Appearance (UI)', () => {
  it('picking Light + Blue recolors the app live and is saved', async () => {
    renderRouter(routes(), { initialUrl: '/settings' });
    await act(async () => fireEvent.press(await screen.findByTestId('settings-theme-light')));
    await act(async () => fireEvent.press(screen.getByTestId('settings-accent-blue')));
    await waitFor(async () =>
      expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'light', accent: 'blue', appIcon: 'default' }),
    );
    const blue = buildColors('light', 'blue');
    await waitFor(() =>
      expect(screen.getByTestId('settings-theme-light')).toHaveStyle({ backgroundColor: blue.primary }),
    );
    expect(screen.getByTestId('settings-accent-blue')).toHaveProp('accessibilityState', { selected: true });
    screen.unmount();

    // Another screen picks it up: the Recipes list's Add recipe button uses the blue accent, the + button too.
    renderRouter(routes(), { initialUrl: '/' });
    const fab = await screen.findByTestId('list-add-recipe-button');
    await waitFor(() => expect(StyleSheet.flatten(fab.props.style).backgroundColor).toBe(blue.primary));
    expect(screen.getByTestId('tab-add-button')).toHaveStyle({ backgroundColor: blue.accent });
  });

  it('off switches use a visible knob and track (on stays green)', async () => {
    await settingsStore.update({
      appearance: { themeMode: 'dark' },
      features: { mealPlan: false },
      cookingModeKeepAwake: false,
    });
    renderRouter(routes(), { initialUrl: '/settings' });
    const dark = buildColors('dark', 'green');
    await screen.findByTestId('feature-toggle-mealPlan');
    await waitFor(() => {
      for (const id of ['feature-toggle-mealPlan', 'keep-awake-toggle']) {
        const props = screen.getByTestId(id).props;
        const thumb = props.thumbColor ?? props.thumbTintColor;
        const off = props.trackColor?.false ?? props.tintColor ?? props.trackColorForFalse;
        const on = props.trackColor?.true ?? props.onTintColor ?? props.trackColorForTrue;
        expect(thumb).toBe(dark.muted);
        expect(off).toBe(dark.placeholder);
        expect(on).toBe('#43A047');
      }
    });
  });

  it('is never gated (shown with every optional feature hidden)', async () => {
    await settingsStore.update({ features: { mealPlan: false, shopping: false, pantry: false } });
    renderRouter(routes(), { initialUrl: '/settings' });
    expect(await screen.findByText('Appearance')).toBeTruthy();
    expect(within(screen.getByTestId('settings-accent-green')).getByText('Default')).toBeTruthy();
    expect(within(screen.getByTestId('settings-accent-blue')).queryByText('Default')).toBeNull();
    for (const a of ACCENTS) expect(screen.getByTestId(`settings-accent-${a.id}`)).toBeTruthy();
  });

  it('v1.0.5: picks one of the new accents (dark pink) and lays the 12 swatches out as equal-width wrapping tiles', async () => {
    await settingsStore.update({ appearance: { themeMode: 'dark' } });
    renderRouter(routes(), { initialUrl: '/settings' });
    const pink = await screen.findByTestId('settings-accent-pink');
    await act(async () => fireEvent.press(pink));
    await waitFor(async () => expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'dark', accent: 'pink', appIcon: 'default' }));
    const widths = new Set(
      ACCENTS.map((a) => StyleSheet.flatten(screen.getByTestId(`settings-accent-${a.id}`).props.style).width),
    );
    expect(widths.size).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('settings-accent-pink').props.style).borderColor).toBe(
      buildColors('dark', 'pink').primary,
    );
  });
});

describe('no hard-coded colors', () => {
  const { readdirSync, readFileSync, statSync } = jest.requireActual('fs');
  const { join, resolve } = jest.requireActual('path');
  // Screens read colors from the theme. Exempt: the palette itself, and the printable PDF (always black on white).
  const exempt = [join('lib', 'theme.ts'), join('lib', 'recipe-pdf.ts')];
  it('only src/lib/theme.ts defines colors', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(name) && !exempt.some((e) => p.endsWith(e))) {
          if (/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(|['"](white|black)['"]/.test(readFileSync(p, 'utf8')))
            offenders.push(p);
        }
      }
    };
    walk(resolve('src')); // jest runs from the repo root
    expect(offenders).toEqual([]);
  });
});
