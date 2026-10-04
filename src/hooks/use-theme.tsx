import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { useSettings } from '@/hooks/use-settings';
import { buildColors, defaultColors, resolveScheme, type ColorScheme, type ThemeColors } from '@/lib/theme';

interface ThemeValue {
  colors: ThemeColors;
  scheme: ColorScheme;
}

const ThemeContext = createContext<ThemeValue>({ colors: defaultColors, scheme: 'dark' });

/**
 * App-wide theme (v1.0.3, Settings → Appearance). Reads `settings.appearance` (mode System / Light / Dark,
 * accent) and the OS color scheme, and provides the palette to `useColors()` / `makeStyles()`. Mounted once in
 * `src/app/_layout.tsx`. Free for everyone (not an optional feature, no entitlement gate).
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { appearance } = useSettings();
  const system = useColorScheme();
  const scheme = resolveScheme(appearance.themeMode, system === 'light' || system === 'dark' ? system : null);
  const value = useMemo(
    () => ({ colors: buildColors(scheme, appearance.accent), scheme }),
    [scheme, appearance.accent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The current palette. Use for inline colors (icons, placeholderTextColor, navigator options). */
export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

/** The resolved scheme ('light' | 'dark'), e.g. for the status bar. */
export function useColorSchemeResolved(): ColorScheme {
  return useContext(ThemeContext).scheme;
}

/** React Navigation theme for the current palette. */
export function useNavigationTheme() {
  const { colors, scheme } = useContext(ThemeContext);
  return useMemo(() => buildNavigationTheme(colors, scheme), [colors, scheme]);
}

/**
 * Themed StyleSheet: `const useStyles = makeStyles((colors) => ({ ... }))` at module level, then
 * `const styles = useStyles()` in the component. Styles are built once per palette and cached.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T): () => T {
  const cache = new WeakMap<ThemeColors, T>();
  return function useStyles() {
    const colors = useColors();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}

/** React Navigation theme for a palette. */
export function buildNavigationTheme(colors: ThemeColors, scheme: ColorScheme): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
  };
}
