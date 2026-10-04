/**
 * v1.0.2 UI: Cronometer-style bottom bar (Recipes · Meal Plan · + · Shopping · More), the + add sheet, the More
 * screen, the "My Recipe App" header, and Settings (AI assistants / MCP URL, version). Optional features hidden in
 * Settings (or locked by the gate) disappear from the bar and the + menu; the + button and More always stay.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

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
  it('lists all eight actions in order when everything is visible', () => {
    expect(visibleAddMenuItems(() => true).map((i) => i.label)).toEqual([
      'Add Recipe',
      'Import Link',
      'Search Recipes',
      'Add to Shopping List',
      'Add Pantry Item',
      'Meal Plan',
      'Share Recipes',
      'What Can I Make?',
    ]);
  });

  it('keeps only the core recipe actions when every optional feature is off', () => {
    expect(visibleAddMenuItems(() => false).map((i) => i.id)).toEqual(['add-recipe', 'search-recipes']);
  });

  it('has no separate Scan Barcode item (scanning lives on the Shopping and Pantry screens)', () => {
    expect(ADD_MENU_ITEMS.some((i) => /scan/i.test(i.id) || /scan/i.test(i.label))).toBe(false);
    expect(visibleAddMenuItems(() => true)).toHaveLength(8);
    expect(addMenuHref('plan-meal', { today: '2026-10-03' })).toBe('/meal-plan/2026-10-03');
    expect(addMenuHref('share-recipe', { today: '2026-10-03' })).toBe('/recipes?select=pdf'); // v1.0.3: PDF
  });
});

describe('bottom bar, header and + sheet', () => {
  it('shows Recipes · Meal Plan · + · Shopping · More and the app header', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    for (const label of ['Meal Plan', 'Shopping', 'More']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByText('Recipes').length).toBeGreaterThan(0);
    expect(screen.getByTestId('tab-add-button')).toBeTruthy();
    expect(screen.getByText('My Recipe App')).toBeTruthy();
    expect(screen.getByTestId('section-title')).toHaveTextContent('Recipes');
    expect(screen.getByTestId('settings-button')).toBeTruthy();
    expect(screen.queryByText('Pantry')).toBeNull(); // under More now

    await act(async () => fireEvent.press(screen.getByText('Shopping')));
    await waitFor(() => expect(screen.getByTestId('section-title')).toHaveTextContent('Shopping List'));
  });

  it('+ opens a 3-column sheet of every action; tapping outside closes it', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
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
      await screen.findByTestId('search-input');
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
    await screen.findByTestId('search-input');
    await waitFor(() => expect(screen.queryByText('Meal Plan')).toBeNull());
    expect(screen.getByText('Shopping')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    for (const id of ['plan-meal', 'add-pantry', 'what-can-i-make'])
      expect(screen.queryByTestId(`add-menu-${id}`)).toBeNull();
    expect(screen.getByTestId('add-menu-add-shopping')).toBeTruthy();
    expect(screen.queryByTestId('add-menu-scan-barcode')).toBeNull();
    // Scanning is reached through Add to Shopping List → the list's Scan Item button.
    await act(async () => fireEvent.press(screen.getByTestId('add-menu-add-shopping')));
    await waitFor(() => expect(screen).toHavePathname('/shopping'));
    await act(async () => fireEvent.press(await screen.findByTestId('shopping-scan-button')));
    await waitFor(() => expect(screen).toHavePathname('/shopping/scan'));
  });

  it('the + button also works in the expanded navigation rail', async () => {
    mockWidth = 900;
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    expect(screen.getByTestId('add-menu-add-recipe')).toBeTruthy();
  });
});

describe('Recipes tab (v1.0.4: the recipe list, no five-link home page)', () => {
  it('opens straight to the list with the search bar at the top, under the app header', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    expect(await screen.findByTestId('search-input')).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(screen.getByText('My Recipe App')).toBeTruthy();
    expect(screen.getByTestId('section-title')).toHaveTextContent('Recipes');
    for (const id of ['recipes-home', 'home-search', 'home-existing', 'home-share', 'home-pantry-match'])
      expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByText('Existing Recipes')).toBeNull();
  });

  it('every action from the old home page is in the + menu', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    expect(within(screen.getByTestId('add-menu-add-recipe')).getByText('Add Recipe')).toBeTruthy();
    expect(within(screen.getByTestId('add-menu-share-recipe')).getByText('Share Recipes')).toBeTruthy();
    expect(within(screen.getByTestId('add-menu-what-can-i-make')).getByText('What Can I Make?')).toBeTruthy();
    expect(within(screen.getByTestId('add-menu-search-recipes')).getByText('Search Recipes')).toBeTruthy();
  });

  it('the smaller center + (v1.0.4: 44dp raised circle, ~67% of 66dp)', async () => {
    const { StyleSheet } = require('react-native');
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    const style = StyleSheet.flatten(screen.getByTestId('tab-add-button').props.style);
    expect(style).toMatchObject({ width: 44, height: 44, borderRadius: 22 });
  });
});

describe('section title below the banner (v1.0.4)', () => {
  it('banner shows only “My Recipe App” (+ gear); the section is a big centered page title below it', async () => {
    const { StyleSheet } = require('react-native');
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    const banner = screen.getByTestId('app-header');
    expect(banner).toHaveTextContent('My Recipe App');
    expect(within(banner).queryByText('Recipes')).toBeNull();
    expect(within(banner).queryByTestId('section-title')).toBeNull();
    expect(screen.getByTestId('settings-button')).toBeTruthy();
    const title = screen.getByTestId('section-title');
    expect(title).toHaveTextContent('Recipes');
    const style = StyleSheet.flatten(title.props.style);
    expect(style.fontSize).toBeGreaterThanOrEqual(24);
    expect(style.fontSize).toBeLessThanOrEqual(26);
    expect(style).toMatchObject({ textAlign: 'center', fontWeight: '800' });
    // The search bar is in the content under the title.
    expect(within(screen.getByTestId('section-layout')).getByTestId('search-input')).toBeTruthy();
  });

  it('Meal Plan: the hint row sits under the title, nothing in the banner', async () => {
    renderRouter(routes(), { initialUrl: '/meal-plan' });
    const hint = await screen.findByTestId('meal-calendar-hint');
    const layout = screen.getByTestId('section-layout');
    expect(screen.getByTestId('section-title')).toHaveTextContent('Meal Plan');
    expect(within(layout).getByTestId('meal-calendar-hint')).toBe(hint);
    expect(within(screen.getByTestId('section-title')).queryByTestId('meal-calendar-hint')).toBeNull();
    expect(within(screen.getByTestId('app-header')).queryByText('Meal Plan')).toBeNull();
  });

  it.each([
    ['/shopping', 'Shopping List'],
    ['/more', 'More'],
    ['/pantry', 'Pantry'],
    ['/settings', 'Settings'],
  ])('%s shows the “%s” page title', async (url, section) => {
    renderRouter(routes(), { initialUrl: url });
    expect(await screen.findByTestId('section-title')).toHaveTextContent(section);
    expect(screen.getByTestId('app-header')).toHaveTextContent('My Recipe App');
    expect(within(screen.getByTestId('app-header')).queryByText(section)).toBeNull();
  });
});

describe('More screen', () => {
  it('lists just Pantry and Settings (v1.0.6: Household removed)', async () => {
    renderRouter(routes(), { initialUrl: '/more' });
    expect(await screen.findByTestId('more-pantry')).toBeTruthy();
    expect(screen.queryByTestId('more-household')).toBeNull();
    expect(screen.queryByText('Household')).toBeNull();
    expect(screen.getByTestId('section-title')).toHaveTextContent('More');
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
    expect(screen.getByTestId('section-title')).toHaveTextContent('Pantry');
  });
});

describe('Settings (v1.0.2)', () => {
  it('has no AI assistants (MCP) section or sign-in (cut in v1.0.6), no cooked-recently setting, and shows the app version', async () => {
    renderRouter(routes(), { initialUrl: '/settings' });
    expect(await screen.findByTestId('settings-screen')).toBeTruthy();
    expect(screen.queryByText(/AI assistants|MCP/)).toBeNull();
    expect(screen.queryByTestId('mcp-server-url')).toBeNull();
    expect(screen.queryByTestId('account-settings-link')).toBeNull();
    expect(screen.queryByText(/Sign in/i)).toBeNull();
    expect(screen.queryByText(/Household/)).toBeNull();
    expect(screen.queryByText(/Cooked recently/i)).toBeNull();
    expect(screen.queryByTestId('cooked-recently-input')).toBeNull();
    const { version } = require('../app.json').expo as { version: string };
    expect(screen.getByTestId('app-version')).toHaveTextContent(`Version ${version}`);
  });
});
