/**
 * v1.0.3: scrolling screens end above the Android navigation bar (gesture pill / 3-button bar). Stack screens
 * add the safe-area bottom inset (`useBottomInset`, src/components/layout.tsx); bottom-tab screens don't need it
 * because the tab bar already sits above the system bar.
 */
import { render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { StyleSheet, Text } from 'react-native';

import { BottomBarCoversInsetProvider, useBottomInset } from '@/components/layout';

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

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.3' } } }));

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

  it('is 0 inside the bottom tab bar (it already clears the system bar) and without a provider', () => {
    render(
      <SafeAreaProvider>
        <BottomBarCoversInsetProvider value>
          <Probe />
        </BottomBarCoversInsetProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('0');
    screen.unmount();
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('0');
  });
});

describe('screens', () => {
  it('Settings: the version line clears the navigation bar', async () => {
    renderRouter(routes(), { initialUrl: '/settings' });
    const scroll = await screen.findByTestId('settings-screen');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(16 + NAV_BAR);
    expect(await screen.findByTestId('app-version')).toHaveTextContent('Version 1.0.3');
  });

  it('Recipes tab (inside the bottom bar): no extra inset', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    const scroll = await screen.findByTestId('recipes-home');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(16);
  });
});
