import { DarkTheme, type Theme } from 'expo-router';

/** Dark theme is the default (and, for v1, only) theme — spec #13. */
export const colors = {
  primary: '#66BB6A',
  primaryText: '#0B1F0C',
  background: '#121412',
  card: '#1D211D',
  text: '#ECEFEC',
  muted: '#9AA59C',
  border: '#2E352F',
  danger: '#EF5350',
  tagBg: '#1F3321',
  input: '#181B18',
  placeholder: '#6C766E',
};

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
  },
};
