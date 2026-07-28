import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getAppleIntelligenceAvailability,
  type AppleIntelligenceAvailability,
} from '@/platform/apple/apple-intelligence';
import { activateWorkoutAudio, playWorkoutHaptic } from '@/platform/apple/feedback';
import {
  authorizeAppleHealth,
  isAppleHealthAvailable,
  syncAppleHealth,
} from '@/platform/apple/healthkit';
import {
  DEFAULT_APPLE_PREFERENCES,
  loadApplePreferences,
  saveApplePreferences,
  type AppleIntegrationPreferences,
  type WorkoutAudioMode,
} from '@/platform/apple/preferences';
import {
  getWatchIntegrationStatus,
  type WatchIntegrationStatus,
} from '@/platform/apple/watch-connectivity';
import { useWorkoutStore } from '@/store/workout-store';

const EMPTY_WATCH: WatchIntegrationStatus = {
  supported: false,
  paired: false,
  installed: false,
  reachable: false,
};

export default function AppleSettingsScreen() {
  const theme = useTheme();
  const [preferences, setPreferences] = useState<AppleIntegrationPreferences>(
    DEFAULT_APPLE_PREFERENCES,
  );
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [watch, setWatch] = useState<WatchIntegrationStatus>(EMPTY_WATCH);
  const [intelligence, setIntelligence] = useState<AppleIntelligenceAvailability>({
    available: false,
    reason: '检测中…',
  });
  const [working, setWorking] = useState<'health' | 'sync' | null>(null);

  useEffect(() => {
    void Promise.all([
      loadApplePreferences().then(setPreferences),
      isAppleHealthAvailable().then(setHealthAvailable),
      getWatchIntegrationStatus().then(setWatch),
      getAppleIntelligenceAvailability().then(setIntelligence),
    ]);
  }, []);

  async function connectHealth() {
    setWorking('health');
    try {
      const granted = await authorizeAppleHealth();
      setPreferences(await loadApplePreferences());
      Alert.alert(
        granted ? 'Apple 健康已连接' : '未完成授权',
        granted ? '你可以立即同步最近 30 天的数据。' : '可稍后在系统“健康”权限中调整。',
      );
    } catch (error) {
      Alert.alert('无法连接', error instanceof Error ? error.message : 'Apple 健康授权失败');
    } finally {
      setWorking(null);
    }
  }

  async function syncHealth() {
    setWorking('sync');
    try {
      const result = await syncAppleHealth();
      setPreferences(await loadApplePreferences());
      Alert.alert(
        '同步完成',
        `新增 ${result.workoutsImported} 条有氧记录、${result.bodyMetricsImported} 条身体数据。`,
      );
    } catch (error) {
      Alert.alert('同步失败', error instanceof Error ? error.message : '暂时无法读取健康数据');
    } finally {
      setWorking(null);
    }
  }

  async function setHaptics(enabled: boolean) {
    const next = await saveApplePreferences({ hapticsEnabled: enabled });
    setPreferences(next);
    if (enabled) void playWorkoutHaptic('set');
  }

  async function setAudioMode(audioMode: WorkoutAudioMode) {
    const next = await saveApplePreferences({ audioMode });
    setPreferences(next);
    const workout = useWorkoutStore.getState();
    if (Platform.OS !== 'web' && workout.sessionId && !workout.endedAt) {
      void activateWorkoutAudio(audioMode);
    }
  }

  return (
    <ScreenContainer>
      <Row style={styles.header}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.flex}>
          <ThemedText type="subtitle">Apple 生态</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Watch、健康、快捷指令与系统训练体验
          </ThemedText>
        </View>
      </Row>

      <SectionTitle>Apple Watch</SectionTitle>
      <Card>
        <StatusRow
          icon="watch-outline"
          title={watch.installed ? 'Nexset Watch 已安装' : watch.paired ? '已配对 Apple Watch' : '等待配对设备'}
          detail={
            watch.reachable
              ? '手表在线，可开始训练并进行手动/自动组数记录。'
              : '离线记录会排队，手表与 iPhone 恢复连接后自动送达。'
          }
          ok={watch.installed}
        />
      </Card>

      <SectionTitle>Apple 健康</SectionTitle>
      <Card>
        <StatusRow
          icon="heart-outline"
          title={preferences.healthEnabled ? '健康数据同步已启用' : '由你决定是否授权'}
          detail={
            healthAvailable
              ? '同步体重、体脂、心率和有氧训练；完成的 Nexset 力量训练会写回健康。'
              : 'Apple 健康需要 iPhone 原生开发构建，Expo Go 中不可用。'
          }
          ok={preferences.healthEnabled}
        />
        <View style={styles.gap} />
        <Button onPress={connectHealth} loading={working === 'health'} disabled={!healthAvailable || working === 'sync'}>
          {preferences.healthEnabled ? '重新检查健康权限' : '连接 Apple 健康'}
        </Button>
        <View style={styles.smallGap} />
        <Button variant="secondary" onPress={syncHealth} loading={working === 'sync'} disabled={!preferences.healthEnabled || working === 'health'}>
          同步最近 30 天
        </Button>
        {preferences.lastHealthSyncAt ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            最近同步：{new Date(preferences.lastHealthSyncAt).toLocaleString()}
          </ThemedText>
        ) : null}
      </Card>

      <SectionTitle>训练反馈</SectionTitle>
      <Card>
        <ThemedText type="smallBold">触感反馈</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          开始训练、完成一组、休息结束和训练完成时提供不同触感。
        </ThemedText>
        <ChipRow>
          <Chip label="开启" selected={preferences.hapticsEnabled} onPress={() => setHaptics(true)} />
          <Chip label="关闭" selected={!preferences.hapticsEnabled} onPress={() => setHaptics(false)} />
        </ChipRow>

        <ThemedText type="smallBold" style={styles.subsection}>系统音频策略</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          控制训练提示与音乐的共存方式；Nexset 不会读取或操控第三方播放器的播放队列。
        </ThemedText>
        <ChipRow>
          <Chip label="不打断音乐" selected={preferences.audioMode === 'mix'} onPress={() => setAudioMode('mix')} />
          <Chip label="提示时压低" selected={preferences.audioMode === 'duck'} onPress={() => setAudioMode('duck')} />
          <Chip label="训练提示优先" selected={preferences.audioMode === 'exclusive'} onPress={() => setAudioMode('exclusive')} />
        </ChipRow>
      </Card>

      <SectionTitle>快捷指令与 Apple Intelligence</SectionTitle>
      <Card>
        <StatusRow
          icon="logo-apple"
          title={intelligence.available ? '设备端模型可用' : '能力接口已预留'}
          detail={intelligence.reason}
          ok={intelligence.available}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          “开始训练”“记录当前组”“同步健康数据”会出现在快捷指令、Siri、Spotlight 和支持的操作按钮中。App Intents 同时为 Apple Intelligence 暴露清晰的训练动作。
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="smallBold">锁屏、通知中心与灵动岛</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          开始训练后自动创建 Live Activity，展示当前动作、组数、休息倒计时和训练进度；结束训练后立即收起。
        </ThemedText>
      </Card>
    </ScreenContainer>
  );
}

function StatusRow({
  icon,
  title,
  detail,
  ok,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  ok: boolean;
}) {
  const theme = useTheme();
  return (
    <Row style={styles.statusRow}>
      <Ionicons name={icon} size={23} color={ok ? theme.success : theme.textSecondary} />
      <View style={styles.flex}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.statusDetail}>
          {detail}
        </ThemedText>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: Spacing.two, alignItems: 'center' },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  statusRow: { alignItems: 'flex-start' },
  statusDetail: { marginTop: 2, lineHeight: 19 },
  hint: { marginTop: Spacing.one, marginBottom: Spacing.two, lineHeight: 19 },
  subsection: { marginTop: Spacing.four },
  gap: { height: Spacing.two },
  smallGap: { height: Spacing.one },
});
