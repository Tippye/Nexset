import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
import { useTheme } from '@/hooks/use-theme';
import { localDate } from '@/lib/id';
import { proteinFoodExample } from '@/lib/nutrition';
import { useAppStore } from '@/store/app-store';
import { useWorkoutStore } from '@/store/workout-store';

/** JS getDay(): 0=Sun..6=Sat → plan dayOfWeek 1=Mon..7=Sun */
function todayDayOfWeek(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

export default function TodayScreen() {
  const theme = useTheme();
  const { onboardingDone, activePlan, profile } = useAppStore();
  const [exNames, setExNames] = useState<Map<string, string>>(new Map());
  const [doneToday, setDoneToday] = useState(false);
  const [todayActivity, setTodayActivity] = useState({ strength: 0, cardioMin: 0 });
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
        const [sessions, cardio] = await Promise.all([
          getSessionsByDate(db, localDate()),
          getCardioByDate(db, localDate()),
        ]);
        if (alive) {
          const completedStrength = sessions.filter((session) => session.endedAt != null).length;
          setDoneToday(completedStrength > 0 || cardio.length > 0);
          setTodayActivity({
            strength: completedStrength,
            cardioMin: Math.round(cardio.reduce((sum, row) => sum + row.durationMin, 0)),
          });
        }
      })();
      return () => {
        alive = false;
      };
    }, [todayPlanDay]),
  );

  if (!onboardingDone) {
    return <Redirect href="/onboarding" />;
  }

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
