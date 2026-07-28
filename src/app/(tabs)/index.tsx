import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { DailyAdjustmentCard } from '@/components/daily-adjustment-card';
import {
  IconButton,
  MetricCard,
  MetricGrid,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from '@/components/dashboard-ui';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Row, SectionTitle } from '@/components/ui-kit';
import { Radii, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { getCardioByDate } from '@/db/repositories/cardio-repo';
import { getExercisesByIds } from '@/db/repositories/exercise-repo';
import type { PlanDayDetail } from '@/db/repositories/plan-repo';
import { getSessionsByDate } from '@/db/repositories/workout-repo';
import { getSetting, setSetting } from '@/db/repositories/settings-repo';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_HOME_PROMPT_DISMISSALS,
  getHomePromptVisibility,
  type HomePromptDismissals,
} from '@/lib/home-prompts';
import { localDate } from '@/lib/id';
import { proteinFoodExample } from '@/lib/nutrition';
import { loadApplePreferences } from '@/platform/apple/preferences';
import { useAppStore } from '@/store/app-store';
import { useWorkoutStore } from '@/store/workout-store';
import { isWebDavConfigured, loadWebDavConfig } from '@/sync/webdav-config';

const HOME_PROMPT_SETTINGS_KEY = 'home_prompt_dismissals';

/** JS getDay(): 0=Sun..6=Sat → plan dayOfWeek 1=Mon..7=Sun */
function todayDayOfWeek(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

export default function TodayScreen() {
  const theme = useTheme();
  const { activePlan, profile } = useAppStore();
  const [exNames, setExNames] = useState<Map<string, string>>(new Map());
  const [doneToday, setDoneToday] = useState(false);
  const [todayActivity, setTodayActivity] = useState({ strength: 0, cardioMin: 0 });
  const [promptState, setPromptState] = useState<{
    healthEnabled: boolean;
    webdavConfigured: boolean;
    dismissals: HomePromptDismissals;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const startFromPlanDay = useWorkoutStore((s) => s.startFromPlanDay);
  const startEmpty = useWorkoutStore((s) => s.startEmpty);

  const dow = todayDayOfWeek();
  const todayPlanDay: PlanDayDetail | null =
    activePlan?.days.find((d) => d.dayOfWeek === dow) ?? null;

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const db = getDb();
        if (todayPlanDay) {
          const m = await getExercisesByIds(db, todayPlanDay.exercises.map((e) => e.exerciseId));
          if (alive) setExNames(new Map([...m].map(([id, e]) => [id, e.nameZh])));
        }
        const [sessions, cardio, applePreferences, webdavConfig, dismissals] = await Promise.all([
          getSessionsByDate(db, localDate()),
          getCardioByDate(db, localDate()),
          loadApplePreferences(),
          loadWebDavConfig(),
          getSetting<Partial<HomePromptDismissals>>(db, HOME_PROMPT_SETTINGS_KEY),
        ]);
        if (alive) {
          const completedStrength = sessions.filter((session) => session.endedAt != null).length;
          setDoneToday(completedStrength > 0 || cardio.length > 0);
          setTodayActivity({
            strength: completedStrength,
            cardioMin: Math.round(cardio.reduce((sum, row) => sum + row.durationMin, 0)),
          });
          setPromptState({
            healthEnabled: applePreferences.healthEnabled,
            webdavConfigured: isWebDavConfigured(webdavConfig),
            dismissals: { ...DEFAULT_HOME_PROMPT_DISMISSALS, ...dismissals },
          });
        }
      })();
      return () => {
        alive = false;
      };
    }, [todayPlanDay]),
  );

  async function handleStart() {
    setStarting(true);
    try {
      const sessionId = todayPlanDay
        ? await startFromPlanDay(activePlan!.id, todayPlanDay)
        : await startEmpty();
      router.push(`/workout/${sessionId}`);
    } finally {
      setStarting(false);
    }
  }

  const now = new Date();
  const nutrition = activePlan?.nutrition;
  const plannedExercises = todayPlanDay?.exercises.length ?? 0;
  const sessionMinutes = profile?.sessionMinutes ?? 60;
  const promptVisibility = promptState
    ? getHomePromptVisibility({ platform: Platform.OS, ...promptState })
    : { health: false, webdav: false };

  async function dismissPrompt(prompt: keyof HomePromptDismissals) {
    if (!promptState) return;
    const previous = promptState;
    const next = {
      ...promptState,
      dismissals: { ...promptState.dismissals, [prompt]: true },
    };
    setPromptState(next);
    try {
      await setSetting(getDb(), HOME_PROMPT_SETTINGS_KEY, next.dismissals);
    } catch {
      setPromptState(previous);
    }
  }

  return (
    <ScreenContainer>
      <PageHeader
        eyebrow={`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 周${DAY_NAMES[dow - 1]}`}
        title="今天"
        subtitle="把下一组练好，剩下的交给积累"
        action={
          <IconButton
            icon="person-outline"
            label="打开个人档案"
            onPress={() => router.push('/(tabs)/profile')}
          />
        }
      />

      {promptVisibility.health ? (
        <SetupPromptCard
          icon="heart-outline"
          title="授权健康 App"
          detail="授权后可同步体重、体脂、心率和训练记录，并把完成的力量训练写回健康。"
          actionLabel="去授权"
          onPress={() => router.push('/settings/apple' as never)}
          onDismiss={() => void dismissPrompt('health')}
        />
      ) : null}

      {promptVisibility.webdav ? (
        <SetupPromptCard
          icon="cloud-outline"
          title="连接 WebDAV 同步"
          detail="连接你自己的加密 WebDAV 目录，配置成功后此提示将自动隐藏。"
          actionLabel="去连接"
          onPress={() => router.push('/settings/webdav' as never)}
          onDismiss={() => void dismissPrompt('webdav')}
        />
      ) : null}

      {profile?.incomplete && (
        <Card style={[styles.notice, { borderColor: `${theme.warning}55` }]}>
          <Row>
            <Ionicons name="alert-circle-outline" size={18} color={theme.warning} />
            <ThemedText type="small" style={{ color: theme.warning, flex: 1 }}>
              档案还不完整，补充后计划和营养建议会更准确。
            </ThemedText>
          </Row>
        </Card>
      )}

      {activePlan ? (
        todayPlanDay ? (
          <>
            <Card style={styles.heroCard}>
              <Row style={styles.heroHeader}>
                <View style={[styles.heroIcon, { backgroundColor: theme.secondary }]}>
                  <Ionicons name="barbell-outline" size={24} color={theme.foreground} />
                </View>
                <View style={styles.flex}>
                  <ThemedText type="small" themeColor="textSecondary">
                    今日训练
                  </ThemedText>
                  <ThemedText type="headline">{todayPlanDay.label}</ThemedText>
                </View>
                <StatusBadge tone={doneToday ? 'green' : 'blue'}>
                  {doneToday ? '已记录' : '计划就绪'}
                </StatusBadge>
              </Row>

              <Row style={styles.heroMeta}>
                <ThemedText type="small" themeColor="textSecondary">
                  {plannedExercises} 个动作
                </ThemedText>
                <View style={[styles.metaDot, { backgroundColor: theme.border }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  约 {sessionMinutes} 分钟
                </ThemedText>
                {todayPlanDay.cardio ? (
                  <>
                    <View style={[styles.metaDot, { backgroundColor: theme.border }]} />
                    <ThemedText type="small" themeColor="textSecondary">
                      含有氧
                    </ThemedText>
                  </>
                ) : null}
              </Row>

              <View style={[styles.exerciseList, { borderTopColor: theme.border }]}>
                {todayPlanDay.exercises.map((exercise, index) => (
                  <View key={exercise.id} style={styles.exerciseRow}>
                    <View style={[styles.exerciseIndex, { backgroundColor: theme.muted }]}>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {index + 1}
                      </ThemedText>
                    </View>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">
                        {exNames.get(exercise.exerciseId) ?? exercise.exerciseId}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {exercise.sets} 组 × {exercise.reps}
                        {exercise.weightKg != null ? ` · ${exercise.weightKg} kg` : ''}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />
                  </View>
                ))}
              </View>

              <Button onPress={handleStart} loading={starting} style={styles.heroButton}>
                {doneToday ? '再次开始训练' : '开始今日训练'}
              </Button>
            </Card>
          </>
        ) : (
          <Card style={styles.heroCard}>
            <Row style={styles.heroHeader}>
              <View style={[styles.heroIcon, { backgroundColor: `${theme.chart4}18` }]}>
                <Ionicons name="moon-outline" size={24} color={theme.chart4} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  今日安排
                </ThemedText>
                <ThemedText type="headline">恢复日</ThemedText>
              </View>
              <StatusBadge tone="purple">休息</StatusBadge>
            </Row>
            <ThemedText type="small" themeColor="textSecondary" style={styles.restCopy}>
              好好恢复。想动一动的话，可以做 20–30 分钟低强度有氧，或开启自由训练。
            </ThemedText>
            <Button variant="secondary" onPress={handleStart} loading={starting}>
              开始自由训练
            </Button>
          </Card>
        )
      ) : (
        <Card style={styles.heroCard}>
          <Row style={styles.heroHeader}>
            <View style={[styles.heroIcon, { backgroundColor: theme.secondary }]}>
              <Ionicons name="sparkles-outline" size={24} color={theme.foreground} />
            </View>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">
                Nexset 训练计划
              </ThemedText>
              <ThemedText type="headline">从适合你的第一周开始</ThemedText>
            </View>
          </Row>
          <ThemedText type="small" themeColor="textSecondary" style={styles.restCopy}>
            完成基础档案后生成安全计划，或直接开始一次自由训练。
          </ThemedText>
          <Button onPress={() => router.push('/onboarding')}>生成我的计划</Button>
          <View style={styles.buttonGap} />
          <Button variant="secondary" onPress={handleStart} loading={starting}>
            自由训练
          </Button>
        </Card>
      )}

      <SectionTitle>今日概览</SectionTitle>
      <MetricGrid>
        <MetricCard
          icon="calendar-outline"
          label="训练频率"
          value={activePlan?.daysPerWeek ?? '—'}
          unit={activePlan ? '天/周' : undefined}
          caption={activePlan ? `${activePlan.durationWeeks} 周训练周期` : '等待生成计划'}
          tone="blue"
          progress={activePlan ? activePlan.daysPerWeek / 7 : 0}
        />
        <MetricCard
          icon="checkmark-circle-outline"
          label="今日完成"
          value={doneToday ? '100' : '0'}
          unit="%"
          caption={
            doneToday
              ? `${todayActivity.strength} 次力量 · ${todayActivity.cardioMin} 分有氧`
              : '等待你的第一条记录'
          }
          tone={doneToday ? 'green' : 'amber'}
          progress={doneToday ? 1 : 0}
        />
      </MetricGrid>

      {activePlan ? (
        <DailyAdjustmentCard
          plan={activePlan}
          onApplied={useAppStore.getState().refreshPlan}
        />
      ) : null}

      {nutrition && (
        <>
          <SectionTitle>今日营养</SectionTitle>
          <Card>
            <Row style={styles.nutritionHeader}>
              <View>
                <ThemedText type="small" themeColor="textSecondary">
                  每日目标
                </ThemedText>
                <Row style={styles.calorieRow}>
                  <ThemedText type="metric">{nutrition.dailyKcal}</ThemedText>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    kcal
                  </ThemedText>
                </Row>
              </View>
              <View style={[styles.nutritionIcon, { backgroundColor: `${theme.chart3}18` }]}>
                <Ionicons name="restaurant-outline" size={22} color={theme.chart3} />
              </View>
            </Row>
            <MacroRow
              label="蛋白质"
              value={nutrition.proteinG}
              total={nutrition.proteinG + nutrition.carbG + nutrition.fatG}
              color={theme.chart1}
            />
            <MacroRow
              label="碳水"
              value={nutrition.carbG}
              total={nutrition.proteinG + nutrition.carbG + nutrition.fatG}
              color={theme.chart3}
            />
            <MacroRow
              label="脂肪"
              value={nutrition.fatG}
              total={nutrition.proteinG + nutrition.carbG + nutrition.fatG}
              color={theme.chart4}
            />
            <View style={[styles.nutritionHint, { backgroundColor: theme.muted }]}>
              <Ionicons name="bulb-outline" size={17} color={theme.mutedForeground} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {proteinFoodExample(nutrition.proteinG)}
              </ThemedText>
            </View>
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}

function SetupPromptCard({
  icon,
  title,
  detail,
  actionLabel,
  onPress,
  onDismiss,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  actionLabel: string;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={[styles.setupCard, { borderColor: `${theme.chart1}42` }]}>
      <Row style={styles.setupHeader}>
        <View style={[styles.setupIcon, { backgroundColor: `${theme.chart1}18` }]}>
          <Ionicons name={icon} size={22} color={theme.chart1} />
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.setupDetail}>
            {detail}
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`关闭${title}提示`}
          hitSlop={10}
          onPress={onDismiss}
          style={styles.setupClose}>
          <Ionicons name="close" size={19} color={theme.mutedForeground} />
        </Pressable>
      </Row>
      <Button compact onPress={onPress} style={styles.setupButton}>
        {actionLabel}
      </Button>
    </Card>
  );
}

function MacroRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <View style={styles.macroRow}>
      <Row style={styles.macroLabel}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold">{value} g</ThemedText>
      </Row>
      <ProgressBar value={total > 0 ? value / total : 0} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  setupCard: { padding: Spacing.three },
  setupHeader: { alignItems: 'flex-start' },
  setupIcon: {
    width: 42,
    height: 42,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupDetail: { marginTop: Spacing.half, lineHeight: 19 },
  setupClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupButton: { alignSelf: 'flex-start', marginTop: Spacing.twoHalf },
  notice: { paddingVertical: Spacing.twoHalf },
  heroCard: { padding: Spacing.threeHalf },
  heroHeader: { alignItems: 'center' },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMeta: { marginTop: Spacing.three, gap: Spacing.two },
  metaDot: { width: 4, height: 4, borderRadius: 2 },
  exerciseList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.three,
    paddingTop: Spacing.one,
  },
  exerciseRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  exerciseIndex: {
    width: 30,
    height: 30,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButton: { marginTop: Spacing.three },
  restCopy: { marginTop: Spacing.three, marginBottom: Spacing.three, lineHeight: 21 },
  buttonGap: { height: Spacing.two },
  nutritionHeader: { justifyContent: 'space-between', alignItems: 'flex-start' },
  calorieRow: { alignItems: 'baseline', marginTop: Spacing.one },
  nutritionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroRow: { marginTop: Spacing.three },
  macroLabel: { justifyContent: 'space-between' },
  nutritionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radii.md,
    padding: Spacing.twoHalf,
    marginTop: Spacing.three,
  },
});
