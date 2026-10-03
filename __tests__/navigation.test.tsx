/**
 * v1.0.2 UI: Cronometer-style bottom bar (Recipes · Meal Plan · + · Shopping · More), the + add sheet, the More
 * screen, the "My Recipe App" header, and Settings (AI assistants / MCP URL, version). Optional features hidden in
 * Settings (or locked by the gate) disappear from the bar and the + menu; the + button and More always stay.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { renderRouter } from 'expo-router/testing-library';

import { MCP_SERVER_URL } from '@/config';
import type { FeatureId } from '@/entitlements';
import { ADD_MENU_ITEMS, addMenuHref, visibleAddMenuItems } from '@/lib/add-menu';
import { toIsoDate } from '@/lib/dates';
import { settingsStore } from '@/storage/settings';

// The real app reads the version from the embedded app config; Jest has none, so feed app.json through the mock.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: jest.requireActual('../app.json').expo.version } },
}));

let mockWidth = 411;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/meal-plan': require('@/app/(tabs)/meal-plan').default,
  '(tabs)/shopping': require('@/app/(tabs)/shopping').default,
  '(tabs)/pantry': require('@/app/(tabs)/pantry').default,
  '(tabs)/more': require('@/app/(tabs)/more').default,
  '(tabs)/add-menu': require('@/app/(tabs)/add-menu').default,
  'pantry/scan': require('@/app/pantry/scan').default,
  'shopping/scan': require('@/app/shopping/scan').default,
  recipes: require('@/app/recipes').default,
  'pantry-match': require('@/app/pantry-match').default,
  add: require('@/app/add').default,
  import: require('@/app/import').default,
  'meal-plan/[date]': require('@/app/meal-plan/[date]').default,
  settings: require('@/app/settings').default,
  household: require('@/app/household').default,
});

beforeAll(() => {
  routes();
}, 60_000);

beforeEach(async () => {
  mockWidth = 411;
  await require('@react-native-async-storage/async-storage').clear();
  await settingsStore.update({ features: { mealPlan: true, shopping: true, pantry: true } });
});

const ALL_IDS = ADD_MENU_ITEMS.map((i) => i.id);

describe('add menu items (pure)', () => {
  it('lists all nine actions in order when everything is visible', () => {
    expect(visibleAddMenuItems(() => true).map((i) => i.label)).toEqual([
      'Add Recipe',
      'Import Link',
      'Search Recipes',
      'Scan Barcode',
      'Add to Shopping List',
      'Add Pantry Item',
      'Meal Plan',
      'Share Recipe',
      'What Can I Make?',
    ]);
  });

  it('keeps only the core recipe actions when every optional feature is off', () => {
    expect(visibleAddMenuItems(() => false).map((i) => i.id)).toEqual(['add-recipe', 'search-recipes']);
  });

  it('barcode scanning needs the scan feature and pantry or shopping list', () => {
    const only =
      (...ids: FeatureId[]) =>
      (id: FeatureId) =>
        ids.includes(id);
    const has = (vis: (id: FeatureId) => boolean) => visibleAddMenuItems(vis).some((i) => i.id === 'scan-barcode');
    expect(has(only('barcodeScan'))).toBe(false);
    expect(has(only('barcodeScan', 'shoppingList'))).toBe(true);
    expect(has(only('pantry', 'shoppingList'))).toBe(false);
    expect(addMenuHref('scan-barcode', { today: '2026-10-03', pantryVisible: true })).toBe('/pantry/scan');
    expect(addMenuHref('scan-barcode', { today: '2026-10-03', pantryVisible: false })).toBe('/shopping/scan');
    expect(addMenuHref('plan-meal', { today: '2026-10-03', pantryVisible: false })).toBe('/meal-plan/2026-10-03');
  });
});

describe('bottom bar, header and + sheet', () => {
  it('shows Recipes · Meal Plan · + · Shopping · More and the app header', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    for (const label of ['Meal Plan', 'Shopping', 'More']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByText('Recipes').length).toBeGreaterThan(0);
    expect(screen.getByTestId('tab-add-button')).toBeTruthy();
    expect(screen.getByText('My Recipe App')).toBeTruthy();
    expect(screen.getByTestId('app-header-section')).toHaveTextContent('Recipes');
    expect(screen.getByTestId('settings-button')).toBeTruthy();
    expect(screen.queryByText('Pantry')).toBeNull(); // under More now

    await act(async () => fireEvent.press(screen.getByText('Shopping')));
    await waitFor(() => expect(screen.getByTestId('app-header-section')).toHaveTextContent('Shopping List'));
  });

  it('+ opens a 3-column sheet of every action; tapping outside closes it', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    expect(screen.getByTestId('add-menu-sheet')).toBeTruthy();
    for (const id of ALL_IDS) expect(screen.getByTestId(`add-menu-${id}`)).toBeTruthy();
    expect(screen).toHavePathname('/');
    await act(async () => fireEvent.press(screen.getByTestId('add-menu-backdrop')));
    await waitFor(() => expect(screen.queryByTestId('add-menu-sheet')).toBeNull());
  });

  it('each action opens its existing flow', async () => {
    const cases: [string, string][] = [
      ['add-recipe', '/add'],
      ['search-recipes', '/recipes'],
      ['plan-meal', `/meal-plan/${toIsoDate(new Date())}`],
      ['what-can-i-make', '/pantry-match'],
      ['add-pantry', '/pantry'],
      ['add-shopping', '/shopping'],
    ];
    for (const [id, path] of cases) {
      renderRouter(routes(), { initialUrl: '/' });
      await screen.findByTestId('add-recipe-button');
      await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
      await act(async () => fireEvent.press(screen.getByTestId(`add-menu-${id}`)));
      await waitFor(() => expect(screen).toHavePathname(path));
      expect(screen.queryByTestId('add-menu-sheet')).toBeNull();
      screen.unmount();
    }
  });

  it('features hidden in Settings leave the bar and the + menu; + and More stay', async () => {
    await settingsStore.update({ features: { mealPlan: false, shopping: true, pantry: false } });
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    await waitFor(() => expect(screen.queryByText('Meal Plan')).toBeNull());
    expect(screen.getByText('Shopping')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    for (const id of ['plan-meal', 'add-pantry', 'what-can-i-make'])
      expect(screen.queryByTestId(`add-menu-${id}`)).toBeNull();
    expect(screen.getByTestId('add-menu-add-shopping')).toBeTruthy();
    // Pantry hidden → Scan Barcode goes to the shopping-list scanner.
    await act(async () => fireEvent.press(screen.getByTestId('add-menu-scan-barcode')));
    await waitFor(() => expect(screen).toHavePathname('/shopping/scan'));
  });

  it('the + button also works in the expanded navigation rail', async () => {
    mockWidth = 900;
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    expect(screen.getByTestId('add-menu-add-recipe')).toBeTruthy();
  });
});

describe('Recipes home (v1.0.2)', () => {
  it('shows the five options as plain green titles (no subtitles)', async () => {
    const { colors } = require('@/lib/theme');
    const { StyleSheet } = require('react-native');
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    for (const label of [
      'Search',
      'Existing Recipes',
      'Share Recipes',
      'Add Recipe',
      'What can I make with my existing pantry?',
    ])
      expect(StyleSheet.flatten(screen.getByText(label).props.style).color).toBe(colors.primary);
    expect(screen.queryByText('Browse, filter and open your recipes')).toBeNull();
  });
});

describe('More screen', () => {
  it('lists Pantry, Household and Settings', async () => {
    renderRouter(routes(), { initialUrl: '/more' });
    expect(await screen.findByTestId('more-pantry')).toBeTruthy();
    expect(screen.getByTestId('more-household')).toBeTruthy();
    expect(screen.getByTestId('app-header-section')).toHaveTextContent('More');
    await act(async () => fireEvent.press(screen.getByTestId('more-settings')));
    expect(await screen.findByTestId('settings-screen')).toBeTruthy();
  });

  it('drops Pantry when it is hidden in Settings', async () => {
    await settingsStore.update({ features: { pantry: false } });
    renderRouter(routes(), { initialUrl: '/more' });
    expect(await screen.findByTestId('more-settings')).toBeTruthy();
    expect(screen.queryByTestId('more-pantry')).toBeNull();
  });

  it('opens Pantry with its own header section', async () => {
    renderRouter(routes(), { initialUrl: '/more' });
    await act(async () => fireEvent.press(await screen.findByTestId('more-pantry')));
    await waitFor(() => expect(screen).toHavePathname('/pantry'));
    expect(screen.getByTestId('app-header-section')).toHaveTextContent('Pantry');
  });
});

describe('Settings (v1.0.2)', () => {
  it('shows the MCP server URL with a copy button, no cooked-recently setting, and the app version', async () => {
    renderRouter(routes(), { initialUrl: '/settings' });
    expect(await screen.findByText('AI assistants (MCP)')).toBeTruthy();
    expect(screen.getByTestId('mcp-server-url')).toHaveTextContent(MCP_SERVER_URL);
    expect(screen.queryByText(/Cooked recently/i)).toBeNull();
    expect(screen.queryByTestId('cooked-recently-input')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('mcp-copy-button')));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(MCP_SERVER_URL);
    expect(await screen.findByText('Copied')).toBeTruthy();
    const { version } = require('../app.json').expo as { version: string };
    expect(screen.getByTestId('app-version')).toHaveTextContent(`Version ${version}`);
  });
});
