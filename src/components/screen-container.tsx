import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
}>;

/** Standard page wrapper: safe area, max content width, themed background. */
export function ScreenContainer({ children, scroll = true, style }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.content, { paddingTop: insets.top + Spacing.three }, style]}>
      {children}
    </View>
  );

  if (!scroll) {
    return <View style={[styles.root, { backgroundColor: theme.background }]}>{content}</View>;
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: BottomTabInset }]}>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.threeHalf,
    paddingBottom: Spacing.five,
  },
});
