/**
 * v1.0.8: stack screens pad their frame by the safe-area bottom inset (`SystemNavFrame`) so mid-screen controls
 * clear the Android navigation bar. The bottom tab bar is in normal flow, so tab scenes already end above it.
 * `useBottomInset` inside tabs is `TAB_PLUS_CLEARANCE` (how far the + rises above the bar, plus a margin).
 */
import { render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { StyleSheet, Text } from 'react-native';

import { HEADER_HORIZONTAL_PADDING, SETTINGS_GEAR_ICON_SIZE } from '@/components/app-header';
import { BottomBarCoversInsetProvider, TAB_PLUS_CLEARANCE, TAB_PLUS_MARGIN, TAB_PLUS_RAISE, useBottomInset } from '@/components/layout';

const NAV_BAR = 48;

/** Phone width unless a test opts into the expanded side rail. */
let mockWidth = 411;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const React = require('react');
  const state = { insets: { top: 24, left: 0, right: 0, bottom: 48 } };
  const frame = { x: 0, y: 0, width: 411, height: 800 };
  const SafeAreaProvider = ({ children }: { children: unknown }) =>
    React.createElement(
      actual.SafeAreaInsetsContext.Provider,
      { value: state.insets },
      React.createElement(actual.SafeAreaFrameContext.Provider, { value: frame }, children),
    );
  return { ...actual, SafeAreaProvider, initialWindowMetrics: { insets: state.insets, frame }, __safeAreaState: state };
});

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.5' } } }));

const { SafeAreaProvider } = jest.requireMock('react-native-safe-area-context');
const safeAreaState = jest.requireMock('react-native-safe-area-context').__safeAreaState as {
  insets: { top: number; left: number; right: number; bottom: number };
};

type StyledNode = {
  props: { style?: unknown; testID?: string };
  parent: StyledNode | null;
  children: (StyledNode | string)[];
};

function flatStyle(node: { props?: { style?: unknown } } | null | undefined): Record<string, unknown> {
  return (StyleSheet.flatten(node?.props?.style) ?? {}) as Record<string, unknown>;
}

function ancestors(node: StyledNode): StyledNode[] {
  const list: StyledNode[] = [];
  let current: StyledNode | null = node;
  while (current) {
    list.push(current);
    current = current.parent;
  }
  return list;
}

/** Header slot that holds the settings gear (`justifyContent: 'flex-end'`). */
function headerRightContainer(gear: StyledNode): StyledNode {
  const slot = ancestors(gear).find((node) => flatStyle(node).justifyContent === 'flex-end');
  if (!slot) throw new Error('tab header right container not found');
  return slot;
}

/** Centered title slot. The gear's container is a sibling, so the title must be inset on both sides. */
function headerTitleContainer(title: StyledNode): StyledNode {
  const slot = ancestors(title).find((node) => {
    if (node.props.testID === 'app-header') return false;
    const style = flatStyle(node);
    return style.maxWidth != null || style.left != null || style.right != null;
  });
  if (!slot) throw new Error('tab header title container not found');
  return slot;
}

/** Spacer the tab header uses for the top safe-area inset (not a hard-coded status-bar height). */
function headerTopInset(gear: StyledNode): number | undefined {
  const box = ancestors(gear).find((node) => {
    const style = flatStyle(node);
    return style.pointerEvents === 'box-none' && typeof style.height === 'number';
  });
  if (!box) return undefined;
  for (const child of box.children) {
    if (typeof child === 'string') continue;
    const style = flatStyle(child);
    if (style.pointerEvents === 'none' && typeof style.height === 'number') return style.height;
  }
  return undefined;
}

/**
 * Room the centered title must leave on each side so it cannot cover the gear.
 * The header also applies `marginEnd: right inset` on the right slot, and that slot's padding
 * is the right inset plus horizontal padding.
 */
function titleSideInset(insets: { left: number; right: number }): number {
  const paddingRight = insets.right + HEADER_HORIZONTAL_PADDING;
  const gearReach = SETTINGS_GEAR_ICON_SIZE + HEADER_HORIZONTAL_PADDING * 2 + paddingRight + insets.right;
  return Math.max(gearReach, insets.left + HEADER_HORIZONTAL_PADDING);
}

function Probe() {
  return <Text testID="probe">{String(useBottomInset())}</Text>;
}

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
  mockWidth = 411;
  safeAreaState.insets.top = 24;
  safeAreaState.insets.left = 0;
  safeAreaState.insets.right = 0;
  safeAreaState.insets.bottom = NAV_BAR;
  await require('@react-native-async-storage/async-storage').clear();
});

describe('useBottomInset', () => {
  it('is the safe-area bottom inset on stack screens', () => {
    render(
      <SafeAreaProvider>
        <Probe />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent(String(NAV_BAR));
  });

  it('is a small clearance for the raised + inside bottom tabs, and is 0 without a provider', () => {
    render(
      <SafeAreaProvider>
        <BottomBarCoversInsetProvider value>
          <Probe />
        </BottomBarCoversInsetProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent(String(TAB_PLUS_CLEARANCE));
    // The circle rises this far above the bar; clearance is that plus a margin, or the last control stays covered.
    expect(TAB_PLUS_RAISE).toBeGreaterThanOrEqual(36);
    expect(TAB_PLUS_MARGIN).toBeGreaterThanOrEqual(16);
    expect(TAB_PLUS_CLEARANCE).toBe(TAB_PLUS_RAISE + TAB_PLUS_MARGIN);
    screen.unmount();
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('0');
  });
});

describe('tab header gear', () => {
  it('includes the right inset and horizontal padding, and insets the title on both sides', async () => {
    safeAreaState.insets.left = 8;
    safeAreaState.insets.right = 12;
    renderRouter(routes(), { initialUrl: '/' });
    const gear = (await screen.findByTestId('settings-button')) as unknown as StyledNode;
    const right = flatStyle(headerRightContainer(gear));
    const paddingRight = right.paddingRight ?? right.paddingEnd;
    expect(paddingRight).toBe(safeAreaState.insets.right + HEADER_HORIZONTAL_PADDING);

    const title = flatStyle(headerTitleContainer(screen.getByTestId('app-header') as unknown as StyledNode));
    const side = titleSideInset(safeAreaState.insets);
    expect(title.left).toBe(side);
    expect(title.right).toBe(side);
    expect(title.left).toBeGreaterThan(0);
    expect(title.right).toBeGreaterThan(0);
    // The gear stays fully tappable: the header does not clip it to fit.
    expect(flatStyle(gear).overflow).not.toBe('hidden');
    expect(right.overflow).not.toBe('hidden');
  });

  it('keeps horizontal padding when the right inset is zero', async () => {
    safeAreaState.insets.right = 0;
    renderRouter(routes(), { initialUrl: '/' });
    const gear = (await screen.findByTestId('settings-button')) as unknown as StyledNode;
    const right = flatStyle(headerRightContainer(gear));
    const paddingRight = right.paddingRight ?? right.paddingEnd;
    expect(paddingRight).toBe(HEADER_HORIZONTAL_PADDING);
    expect(paddingRight).toBeGreaterThan(0);
    const title = flatStyle(headerTitleContainer(screen.getByTestId('app-header') as unknown as StyledNode));
    expect(title.left).toBe(title.right);
    expect(title.left).toBeGreaterThanOrEqual(HEADER_HORIZONTAL_PADDING);
  });

  it('applies the top inset on the tab header, including when a side rail is showing', async () => {
    safeAreaState.insets.top = 30;
    renderRouter(routes(), { initialUrl: '/' });
    const phoneGear = (await screen.findByTestId('settings-button')) as unknown as StyledNode;
    expect(headerTopInset(phoneGear)).toBe(safeAreaState.insets.top);
    screen.unmount();

    mockWidth = 900;
    renderRouter(routes(), { initialUrl: '/' });
    const railGear = (await screen.findByTestId('settings-button')) as unknown as StyledNode;
    expect(headerTopInset(railGear)).toBe(safeAreaState.insets.top);
  });

  it('leaves stack screens that have no gear unchanged', async () => {
    renderRouter(routes(), { initialUrl: '/settings' });
    await screen.findByTestId('settings-screen');
    expect(screen.queryByTestId('settings-button')).toBeNull();
    const side = titleSideInset(safeAreaState.insets);
    const title = screen.getByTestId('app-header') as unknown as StyledNode;
    const usesGearInset = ancestors(title).some((node) => {
      const style = flatStyle(node);
      return style.left === side || style.right === side;
    });
    expect(usesGearInset).toBe(false);
  });
});

describe('screens', () => {
  it('Settings: the version line clears the navigation bar', async () => {
    renderRouter(routes(), { initialUrl: '/settings' });
    const scroll = await screen.findByTestId('settings-screen');
    const frame = screen.getByTestId('system-nav-frame');
    expect(StyleSheet.flatten(frame.props.style).paddingBottom).toBe(NAV_BAR);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(16);
    expect(await screen.findByTestId('app-version')).toHaveTextContent('Version 1.0.5');
  });

  it('Recipes tab (inside the bottom bar): only enough padding to clear the raised +', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    // The bar is in flow. Scroll content and the absolute selection row sit just above it (24dp + ~32dp).
    const add = await screen.findByTestId('list-add-recipe-button');
    expect(StyleSheet.flatten(add.props.style).position).toBeUndefined();
    const scroll = screen.getByTestId('recipe-category-scroll');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(24 + TAB_PLUS_CLEARANCE);
  });
});
