import { Ionicons } from '@expo/vector-icons';
import { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'purple' | 'red';

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  action,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.headerCopy}>
        {eyebrow ? (
          <ThemedText type="overline" themeColor="textSecondary">
            {eyebrow}
          </ThemedText>
        ) : null}
        <ThemedText type="subtitle">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.headerSubtitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: pressed ? theme.accentSurface : theme.card,
          borderColor: theme.border,
        },
      ]}>
      <Ionicons name={icon} size={20} color={theme.foreground} />
    </Pressable>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: Tone }>) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <ThemedText type="smallBold" style={{ color }}>
        {children}
      </ThemedText>
    </View>
  );
}

export function MetricGrid({ children }: PropsWithChildren) {
  return <View style={styles.metricGrid}>{children}</View>;
}

export function MetricCard({
  icon,
  label,
  value,
  unit,
  caption,
  tone = 'neutral',
  progress,
  style,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  unit?: string;
  caption?: string;
  tone?: Tone;
  progress?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: theme.card, borderColor: theme.border },
        style,
      ]}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={17} color={color} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.metricLabel}>
          {label}
        </ThemedText>
      </View>
      <View style={styles.metricValueRow}>
        <ThemedText type="metric">{value}</ThemedText>
        {unit ? (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.metricUnit}>
            {unit}
          </ThemedText>
        ) : null}
      </View>
      {progress != null ? <ProgressBar value={progress} color={color} /> : null}
      {caption ? (
        <ThemedText type="small" style={[styles.metricCaption, { color }]}>
          {caption}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function ProgressBar({
  value,
  color,
  trackColor,
}: {
  value: number;
  color?: string;
  trackColor?: string;
}) {
  const theme = useTheme();
  const bounded = Math.max(0, Math.min(1, value));
  return (
    <View
      style={[
        styles.progressTrack,
        { backgroundColor: trackColor ?? theme.muted },
      ]}>
      <View
        style={[
          styles.progressFill,
          {
            backgroundColor: color ?? theme.primary,
            width: `${Math.round(bounded * 100)}%`,
          },
        ]}
      />
    </View>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.muted }]}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && {
                backgroundColor: theme.card,
                borderColor: theme.border,
              },
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: selected ? theme.foreground : theme.mutedForeground }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  tone = 'neutral',
  onPress,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  tone?: Tone;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.listRow,
        {
          borderBottomColor: theme.border,
          backgroundColor: pressed ? theme.accentSurface : 'transparent',
        },
      ]}>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={17} color={color} />
        </View>
      ) : null}
      <View style={styles.listCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {trailing}
    </Wrapper>
  );
}

function toneColor(
  theme: ReturnType<typeof useTheme>,
  tone: Tone,
): string {
  switch (tone) {
    case 'blue':
      return theme.chart1;
    case 'green':
      return theme.chart2;
    case 'amber':
      return theme.chart3;
    case 'purple':
      return theme.chart4;
    case 'red':
      return theme.chart5;
    default:
      return theme.foreground;
  }
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  headerCopy: { flex: 1, gap: 2 },
  headerSubtitle: { marginTop: 2 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.twoHalf,
  },
  metricCard: {
    width: '48%',
    minHeight: 144,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { flex: 1 },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: Spacing.twoHalf,
  },
  metricUnit: { marginLeft: 4 },
  metricCaption: { marginTop: Spacing.two, fontWeight: '500' },
  progressTrack: {
    height: 5,
    borderRadius: Radii.full,
    overflow: 'hidden',
    marginTop: Spacing.two,
  },
  progressFill: { height: '100%', borderRadius: Radii.full },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radii.md,
    marginBottom: Spacing.three,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  listRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.twoHalf,
    paddingHorizontal: Spacing.one,
    borderRadius: Radii.sm,
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCopy: { flex: 1 },
});
