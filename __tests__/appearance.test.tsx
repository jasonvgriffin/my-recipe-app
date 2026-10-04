/**
 * v1.0.3 Settings → Appearance: theme mode (System / Light / Dark, default System) and accent color, applied
 * app-wide through `src/hooks/use-theme.tsx` and saved in local settings. Free (no entitlement gate).
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';

import { ACCENTS, THEME_MODES, buildColors, contrastRatio, resolveScheme, type ColorScheme } from '@/lib/theme';
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
      for (const bg of [c.background, c.card]) {
        expect(contrastRatio(c.primary, bg)).toBeGreaterThanOrEqual(4.5); // links / outlined buttons
        expect(contrastRatio(c.text, bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(c.muted, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(c.primaryText, c.primary)).toBeGreaterThanOrEqual(4.5); // filled buttons, chips
      expect(contrastRatio(c.accentText, c.accent)).toBeGreaterThanOrEqual(4.5); // + button
      expect(contrastRatio(c.accent, c.card)).toBeGreaterThanOrEqual(3); // + menu icons (large glyphs)
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
    // Green keeps the original look; Slate is a gray by design.
    for (const a of ACCENTS.filter((x) => x.id !== 'green' && x.id !== 'slate'))
      expect([a.id, hsl(a.dark.primary).s >= 0.5]).toEqual([a.id, true]);
    for (const scheme of ['dark', 'light'] as const) {
      const red = hsl(buildColors(scheme, 'red').primary);
      expect(red.h <= 8 || red.h >= 352).toBe(true);
      expect(red.s).toBeGreaterThanOrEqual(0.6);
    }
    expect(buildColors('dark', 'red').primary).toBe('#FF4444');
    expect(buildColors('light', 'red').primary).toBe('#D32F2F');
    expect(buildColors('light', 'red').primaryText).toBe('#FFFFFF');
  });

  it('Green dark is the original palette (green links, orange + button)', () => {
    const c = buildColors('dark', 'green');
    expect(c.primary).toBe('#66BB6A');
    expect(c.accent).toBe('#FF8A3D');
    expect(c.background).toBe('#121412');
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
    expect(new Set(ACCENTS.flatMap((a) => [a.dark.primary, a.light.primary])).size).toBe(ACCENTS.length * 2);
  });
});

describe('appearance settings', () => {
  it('defaults to System + Green, persists changes, and ignores unknown stored values', async () => {
    expect(DEFAULT_SETTINGS.appearance).toEqual({ themeMode: 'system', accent: 'green' });
    expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'system', accent: 'green' });
    await settingsStore.update({ appearance: { accent: 'teal' } });
    await settingsStore.update({ appearance: { themeMode: 'light' } });
    expect((await createSettingsStore().get()).appearance).toEqual({ themeMode: 'light', accent: 'teal' });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ appearance: { themeMode: 'neon', accent: 'gold' } }),
    );
    expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'system', accent: 'green' });
  });
});

describe('Settings → Appearance (UI)', () => {
  it('picking Light + Blue recolors the app live and is saved', async () => {
    renderRouter(routes(), { initialUrl: '/settings' });
    await act(async () => fireEvent.press(await screen.findByTestId('settings-theme-light')));
    await act(async () => fireEvent.press(screen.getByTestId('settings-accent-blue')));
    await waitFor(async () =>
      expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'light', accent: 'blue' }),
    );
    const blue = buildColors('light', 'blue');
    await waitFor(() =>
      expect(screen.getByTestId('settings-theme-light')).toHaveStyle({ backgroundColor: blue.primary }),
    );
    expect(screen.getByTestId('settings-accent-blue')).toHaveProp('accessibilityState', { selected: true });
    screen.unmount();

    // Another screen picks it up: the Recipes list's “+ Add recipe” button uses the blue accent, the + button too.
    renderRouter(routes(), { initialUrl: '/' });
    const fab = await screen.findByTestId('list-add-recipe-button');
    await waitFor(() => expect(StyleSheet.flatten(fab.props.style).backgroundColor).toBe(blue.primary));
    expect(screen.getByTestId('tab-add-button')).toHaveStyle({ backgroundColor: blue.accent });
  });

  it('is never gated (shown with every optional feature hidden)', async () => {
    await settingsStore.update({ features: { mealPlan: false, shopping: false, pantry: false } });
    renderRouter(routes(), { initialUrl: '/settings' });
    expect(await screen.findByText('Appearance')).toBeTruthy();
    for (const a of ACCENTS) expect(screen.getByTestId(`settings-accent-${a.id}`)).toBeTruthy();
  });

  it('v1.0.5: picks one of the new accents (dark pink) and lays the 12 swatches out as equal-width wrapping tiles', async () => {
    await settingsStore.update({ appearance: { themeMode: 'dark' } });
    renderRouter(routes(), { initialUrl: '/settings' });
    const pink = await screen.findByTestId('settings-accent-pink');
    await act(async () => fireEvent.press(pink));
    await waitFor(async () => expect((await settingsStore.get()).appearance).toEqual({ themeMode: 'dark', accent: 'pink' }));
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
