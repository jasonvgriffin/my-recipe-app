/**
 * v1.0.2 UI: Cronometer-style bottom bar (Recipes · Meal Plan · + · Shopping · More), the + add sheet, the More
 * screen, the "My Recipe App" header, and Settings (version; the MCP section was cut in v1.0.6). Optional features hidden in
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
  'import-pdf': require('@/app/import-pdf').default,
  'meal-plan/[date]': require('@/app/meal-plan/[date]').default,
  settings: require('@/app/settings').default,
  contact: require('@/app/contact').default,
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
  it('lists all nine actions in order when everything is visible (v1.0.6: Import PDF, a 3×3 grid)', () => {
    expect(visibleAddMenuItems(() => true).map((i) => i.label)).toEqual([
      'Add Recipe',
      'Import Link',
      'Import PDF',
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
    expect(visibleAddMenuItems(() => true)).toHaveLength(9);
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
      ['import-pdf', '/import-pdf'],
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

  it('the center + scales with the ~33% bigger bar (v1.0.7: 58dp raised circle, was 44dp)', async () => {
    const { StyleSheet } = require('react-native');
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    const style = StyleSheet.flatten(screen.getByTestId('tab-add-button').props.style);
    expect(style).toMatchObject({ width: 58, height: 58, borderRadius: 29 });
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
    const appTitle = within(banner).getByText('My Recipe App');
    const appStyle = StyleSheet.flatten(appTitle.props.style);
    expect(appStyle.fontSize).toBeGreaterThanOrEqual(26);
    expect(appStyle.color).toBe('#3C8F40');
    const slot = StyleSheet.flatten(screen.getByTestId('tab-add-slot').props.style);
    expect(slot.width).toBe(58);
    expect(slot.flexGrow).toBe(0);
    expect(slot.flexShrink).toBe(0);
    const style = StyleSheet.flatten(title.props.style);
    expect(style.fontSize).toBeGreaterThanOrEqual(20);
    expect(style.fontSize).toBeLessThanOrEqual(23);
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
  it('lists Pantry, Settings and Contact Us (v1.0.6: Household removed; v1.0.7: Contact Us)', async () => {
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

describe('Contact Us (v1.0.7)', () => {
  it('More has a Contact Us card; Settings no longer mentions AI assistants', async () => {
    renderRouter(routes(), { initialUrl: '/more' });
    const contact = await screen.findByTestId('more-contact');
    expect(contact).toHaveTextContent(/Contact Us/);
    expect(screen.getByTestId('more-settings')).toHaveTextContent(/Appearance, units, optional features, backup/);
    expect(screen.queryByText(/AI assistants/)).toBeNull();
    const order = ['more-pantry', 'more-settings', 'more-contact'].map((id) => JSON.stringify(screen.toJSON()).indexOf(`"testID":"${id}"`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await act(async () => fireEvent.press(contact));
    await waitFor(() => expect(screen).toHavePathname('/contact'));
    expect(screen.getByTestId('section-title')).toHaveTextContent('Contact Us');
  });

  it('shows exactly Jason’s text and the address opens a mailto: with the feedback subject', async () => {
    const { Linking } = require('react-native');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderRouter(routes(), { initialUrl: '/contact' });
    const text = await screen.findByTestId('contact-text');
    expect(text).toHaveTextContent(
      "Want to report a bug or request a feature? Need something else? Email our AI assistant. She's keeping track and informs us when someone needs help. Send email to eve.chief_of_staff@agentmail.to",
    );
    await act(async () => fireEvent.press(screen.getByTestId('contact-email')));
    expect(open).toHaveBeenCalledWith('mailto:eve.chief_of_staff@agentmail.to?subject=My%20Recipe%20App%20feedback');
    open.mockRestore();
  });
});

describe('bottom bar (v1.0.9)', () => {
  it('keeps the tall bar and uses 24dp icons', () => {
    const { TAB_BAR, TAB_LABEL_MIN_SCALE } = require('@/components/layout');
    expect(TAB_BAR).toEqual({ height: 80, icon: 24, label: 13, plus: 58, plusIcon: 31 });
    expect(TAB_LABEL_MIN_SCALE).toBe(0.85);
    // Bar, label and + stay at the v1.0.7 scale (~33% over v1.0.6). Icons are 24dp so labels fit.
    for (const [now, was] of [[TAB_BAR.height, 60], [TAB_BAR.label, 10], [TAB_BAR.plus, 44], [TAB_BAR.plusIcon, 23]]) {
      expect(now / was).toBeGreaterThanOrEqual(1.3);
      expect(now / was).toBeLessThanOrEqual(1.36);
    }
  });

  it('shows Meal Plan and Shopping in full, with no item padding, and a narrow + slot', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    const meal = await screen.findByTestId('tab-meal-plan');
    const shopping = screen.getByTestId('tab-shopping');
    const label = within(meal).getByText('Meal Plan');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.minimumFontScale).toBe(0.85);
    expect(within(shopping).getByText('Shopping').props.adjustsFontSizeToFit).toBe(true);
    const { StyleSheet } = require('react-native');
    for (const tab of [meal, shopping, screen.getByTestId('tab-recipes'), screen.getByTestId('tab-more')]) {
      const flat = StyleSheet.flatten(tab.props.style);
      expect(flat.paddingHorizontal).toBe(0);
    }
    const { TAB_BAR } = require('@/components/layout');
    const slot = StyleSheet.flatten(screen.getByTestId('tab-add-slot').props.style);
    expect(slot.width).toBe(TAB_BAR.plus);
    expect(slot.minWidth).toBe(TAB_BAR.plus);
    expect(slot.flexGrow).toBe(0);
    expect(slot.flexShrink).toBe(0);
    expect(slot.paddingHorizontal).toBe(0);
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
