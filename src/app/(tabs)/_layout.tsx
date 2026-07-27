import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(focused: IconName, unfocused: IconName) {
  function TabIcon({ color, focused: isFocused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={isFocused ? focused : unfocused} size={24} color={color} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.background },
        tabBarActiveTintColor: theme.foreground,
        tabBarInactiveTintColor: theme.mutedForeground,
        tabBarActiveBackgroundColor: theme.secondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 14,
          fontWeight: '600',
          marginTop: 1,
        },
        tabBarItemStyle: {
          borderRadius: Radii.full,
          marginVertical: 5,
          marginHorizontal: 2,
        },
        tabBarStyle: {
          position: 'absolute',
          left: Platform.OS === 'web' ? 16 : 16,
          right: Platform.OS === 'web' ? 16 : 16,
          bottom: Platform.OS === 'web' ? 18 : 10,
          maxWidth: Platform.OS === 'web' ? 720 : undefined,
          marginHorizontal: Platform.OS === 'web' ? 'auto' : undefined,
          height: 72,
          paddingTop: 4,
          paddingBottom: 4,
          paddingHorizontal: 4,
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderTopWidth: 1,
          borderWidth: 1,
          borderRadius: 28,
          boxShadow: '0 8px 28px rgba(0, 0, 0, 0.14)',
          elevation: 12,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: '今日', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="logbook"
        options={{ title: '日志', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
      />
      <Tabs.Screen
        name="coach"
        options={{ title: '教练', tabBarIcon: tabIcon('sparkles', 'sparkles-outline') }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: '趋势', tabBarIcon: tabIcon('pulse', 'pulse-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: '我的', tabBarIcon: tabIcon('person', 'person-outline') }}
      />
    </Tabs>
  );
}
