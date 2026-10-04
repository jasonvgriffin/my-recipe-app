/**
 * v1.0.8: stack screens pad their frame by the safe-area bottom inset (`SystemNavFrame`) so mid-screen controls
 * clear the Android navigation bar. The bottom tab bar is in normal flow, so tab scenes already end above it.
 * `useBottomInset` inside tabs is only `TAB_PLUS_CLEARANCE` (~32dp) so content clears the raised center +.
 */
import { render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { StyleSheet, Text } from 'react-native';

import { BottomBarCoversInsetProvider, TAB_PLUS_CLEARANCE, useBottomInset } from '@/components/layout';

const NAV_BAR = 48;

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const React = require('react');
  const insets = { top: 24, left: 0, right: 0, bottom: 48 };
  const frame = { x: 0, y: 0, width: 411, height: 800 };
  const SafeAreaProvider = ({ children }: { children: unknown }) =>
    React.createElement(
      actual.SafeAreaInsetsContext.Provider,
      { value: insets },
      React.createElement(actual.SafeAreaFrameContext.Provider, { value: frame }, children),
    );
  return { ...actual, SafeAreaProvider, initialWindowMetrics: { insets, frame } };
});

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.5' } } }));

const { SafeAreaProvider } = jest.requireMock('react-native-safe-area-context');

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
    expect(TAB_PLUS_CLEARANCE).toBe(32);
    screen.unmount();
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('0');
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
