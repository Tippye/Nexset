import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'caption'
    | 'smallBold'
    | 'subtitle'
    | 'headline'
    | 'metric'
    | 'overline'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'caption' && styles.caption,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'headline' && styles.headline,
        type === 'metric' && styles.metric,
        type === 'overline' && styles.overline,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: 400,
  },
  caption: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: 400,
  },
  smallBold: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: 600,
  },
  default: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 400,
  },
  title: {
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 48,
    letterSpacing: -1.2,
  },
  subtitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: 700,
    letterSpacing: -0.7,
  },
  headline: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.25,
  },
  metric: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
