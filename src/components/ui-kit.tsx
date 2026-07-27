import { Ionicons } from '@expo/vector-icons';
import { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonProps = PropsWithChildren<{
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  compact,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const bg =
    variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.destructive
        : variant === 'ghost'
          ? 'transparent'
          : theme.secondary;
  const fg =
    variant === 'primary'
      ? theme.primaryForeground
      : variant === 'danger'
        ? theme.destructiveForeground
        : theme.secondaryForeground;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: pressed && variant === 'ghost' ? theme.accentSurface : bg,
          borderColor: variant === 'secondary' ? theme.border : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.78 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <ThemedText type={compact ? 'small' : 'default'} style={{ color: fg, fontWeight: '600' }}>
          {children}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.card,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}>
      <ThemedText
        type="small"
        style={{ color: selected ? theme.primaryForeground : theme.mutedForeground }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function ChipRow({ children }: PropsWithChildren) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** Numeric stepper with press-and-obvious +/- controls (workout logging). */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  format,
  bigStep,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  bigStep?: number;
}) {
  const theme = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <View style={styles.stepper}>
      {bigStep ? (
        <StepBtn label={`-${bigStep}`} onPress={() => onChange(clamp(value - bigStep))} />
      ) : null}
      <StepBtn icon="remove" onPress={() => onChange(clamp(value - step))} />
      <View style={[styles.stepperValue, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {format ? format(value) : String(value)}
        </ThemedText>
      </View>
      <StepBtn icon="add" onPress={() => onChange(clamp(value + step))} />
      {bigStep ? (
        <StepBtn label={`+${bigStep}`} onPress={() => onChange(clamp(value + bigStep))} />
      ) : null}
    </View>
  );
}

function StepBtn({
  icon,
  label,
  onPress,
}: {
  icon?: 'add' | 'remove';
  label?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepBtn,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
      ]}>
      {icon ? (
        <Ionicons name={icon} size={20} color={theme.text} />
      ) : (
        <ThemedText type="small" style={{ fontWeight: '600' }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border },
        props.style,
      ]}
    />
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return (
    <ThemedText type="headline" style={styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.three,
    marginBottom: Spacing.twoHalf,
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.035)',
    elevation: 1,
  },
  button: {
    minHeight: 48,
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: {
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: Spacing.twoHalf,
    borderRadius: Radii.sm,
  },
  chip: {
    borderRadius: Radii.full,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperValue: {
    minWidth: 76,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  sectionTitle: { marginTop: Spacing.four, marginBottom: Spacing.twoHalf },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
