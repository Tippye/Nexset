/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#FAFAFA',
    foreground: '#09090B',
    card: '#FFFFFF',
    cardForeground: '#09090B',
    popover: '#FFFFFF',
    popoverForeground: '#09090B',
    primary: '#18181B',
    primaryForeground: '#FAFAFA',
    secondary: '#F4F4F5',
    secondaryForeground: '#18181B',
    muted: '#F4F4F5',
    mutedForeground: '#71717A',
    accentSurface: '#F4F4F5',
    accentForeground: '#18181B',
    destructive: '#DC2626',
    destructiveForeground: '#FAFAFA',
    border: '#E4E4E7',
    input: '#E4E4E7',
    ring: '#A1A1AA',
    chart1: '#2563EB',
    chart2: '#16A34A',
    chart3: '#D97706',
    chart4: '#7C3AED',
    chart5: '#E11D48',
    text: '#09090B',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F4F4F5',
    textSecondary: '#71717A',
    accent: '#18181B',
    onAccent: '#FAFAFA',
    accentSoft: '#F4F4F5',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    chartLine: '#2563EB',
    chartGrid: '#E4E4E7',
  },
  dark: {
    background: '#09090B',
    foreground: '#FAFAFA',
    card: '#18181B',
    cardForeground: '#FAFAFA',
    popover: '#18181B',
    popoverForeground: '#FAFAFA',
    primary: '#FAFAFA',
    primaryForeground: '#18181B',
    secondary: '#27272A',
    secondaryForeground: '#FAFAFA',
    muted: '#27272A',
    mutedForeground: '#A1A1AA',
    accentSurface: '#27272A',
    accentForeground: '#FAFAFA',
    destructive: '#EF4444',
    destructiveForeground: '#FAFAFA',
    border: '#2C2C30',
    input: '#3F3F46',
    ring: '#71717A',
    chart1: '#60A5FA',
    chart2: '#4ADE80',
    chart3: '#FBBF24',
    chart4: '#A78BFA',
    chart5: '#FB7185',
    text: '#FAFAFA',
    backgroundElement: '#18181B',
    backgroundSelected: '#27272A',
    textSecondary: '#A1A1AA',
    accent: '#FAFAFA',
    onAccent: '#18181B',
    accentSoft: '#27272A',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#F87171',
    chartLine: '#60A5FA',
    chartGrid: '#27272A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  twoHalf: 12,
  three: 16,
  threeHalf: 20,
  four: 24,
  five: 32,
  fiveHalf: 40,
  six: 64,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 118, android: 110, web: 112 }) ?? 110;
export const MaxContentWidth = 760;
