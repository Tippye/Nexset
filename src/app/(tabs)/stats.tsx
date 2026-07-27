import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  MetricCard,
  MetricGrid,
  PageHeader,
  StatusBadge,
} from '@/components/dashboard-ui';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Card, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { getMetricHistory } from '@/db/repositories/body-repo';
import { getCardioSince } from '@/db/repositories/cardio-repo';
import { getExercisesByIds } from '@/db/repositories/exercise-repo';
import { getRecentSessions, getSessionSets } from '@/db/repositories/workout-repo';
import { useTheme } from '@/hooks/use-theme';

type DayStat = { date: string; label: string; sessions: number; sets: number; volumeKg: number };
type PersonalBest = { exercise: string; weightKg: number; e1rm: number };
type StatsData = {
  totalSessions: number;
  totalSets: number;
  totalVolumeKg: number;
  cardioMinutes: number;
  week: DayStat[];
  previousWeekVolume: number;
  currentWeekVolume: number;
  heatmap: { date: string; count: number }[];
  weight: { latest: number | null; change: number | null; history: { date: string; value: number }[] };
  bests: PersonalBest[];
};

const EMPTY: StatsData = {
  totalSessions: 0,
  totalSets: 0,
  totalVolumeKg: 0,
  cardioMinutes: 0,
  week: [],
  previousWeekVolume: 0,
  currentWeekVolume: 0,
  heatmap: [],
  weight: { latest: null, change: null, history: [] },
  bests: [],
};

export default function StatsScreen() {
  const theme = useTheme();
  const [data, setData] = useState<StatsData>(EMPTY);

  const load = useCallback(async () => {
    const db = getDb();
    const since90 = dateDaysAgo(89);
    const [sessions, cardio, weightRows] = await Promise.all([
      getRecentSessions(db, 200),
      getCardioSince(db, since90),
      getMetricHistory(db, 'weight_kg', since90),
    ]);
    const completed = sessions.filter((session) => session.endedAt != null);
    const setGroups = await Promise.all(completed.map((session) => getSessionSets(db, session.id)));
    const exerciseIds = [...new Set(setGroups.flat().map((set) => set.exerciseId))];
    const exercises = await getExercisesByIds(db, exerciseIds);
    const rows = completed.map((session, index) => ({
      session,
      sets: setGroups[index],
      volumeKg: setGroups[index].reduce(
        (sum, set) => sum + (set.isWarmup ? 0 : (set.weightKg ?? 0) * (set.reps ?? 0)),
        0,
      ),
    }));

    const week = Array.from({ length: 7 }, (_, offset) => {
      const daysAgo = 6 - offset;
      const date = dateDaysAgo(daysAgo);
      const dayRows = rows.filter(({ session }) => session.date === date);
      return {
        date,
        label: weekdayLabel(date),
        sessions: dayRows.length,
        sets: dayRows.reduce((sum, row) => sum + row.sets.length, 0),
        volumeKg: Math.round(dayRows.reduce((sum, row) => sum + row.volumeKg, 0)),
      };
    });

    const currentWeekVolume = week.reduce((sum, day) => sum + day.volumeKg, 0);
    const previousWeekDates = new Set(Array.from({ length: 7 }, (_, index) => dateDaysAgo(13 - index)));
    const previousWeekVolume = Math.round(
      rows
        .filter(({ session }) => previousWeekDates.has(session.date))
        .reduce((sum, row) => sum + row.volumeKg, 0),
    );

    const countsByDate = new Map<string, number>();
    for (const { session } of rows) {
      countsByDate.set(session.date, (countsByDate.get(session.date) ?? 0) + 1);
    }
    for (const entry of cardio) {
      countsByDate.set(entry.date, (countsByDate.get(entry.date) ?? 0) + 1);
    }
    const heatmap = Array.from({ length: 28 }, (_, index) => {
      const date = dateDaysAgo(27 - index);
      return { date, count: countsByDate.get(date) ?? 0 };
    });

    const bestMap = new Map<string, { weightKg: number; e1rm: number }>();
    for (const set of setGroups.flat()) {
      if (set.isWarmup || set.weightKg == null || set.reps == null || set.reps <= 0) continue;
      const e1rm = set.weightKg * (1 + set.reps / 30);
      const previous = bestMap.get(set.exerciseId);
      bestMap.set(set.exerciseId, {
        weightKg: Math.max(previous?.weightKg ?? 0, set.weightKg),
        e1rm: Math.max(previous?.e1rm ?? 0, e1rm),
      });
    }
    const bests = [...bestMap]
      .map(([exerciseId, best]) => ({
        exercise: exercises.get(exerciseId)?.nameZh ?? exerciseId,
        weightKg: best.weightKg,
        e1rm: Math.round(best.e1rm * 10) / 10,
      }))
      .sort((a, b) => b.e1rm - a.e1rm)
      .slice(0, 5);

    const weightHistory = [...weightRows]
      .reverse()
      .map((row) => ({ date: row.date, value: row.value }));
    const latestWeight = weightRows[0]?.value ?? null;
    const oldestWeight = weightHistory[0]?.value ?? null;

    setData({
      totalSessions: completed.length,
      totalSets: setGroups.flat().length,
      totalVolumeKg: Math.round(rows.reduce((sum, row) => sum + row.volumeKg, 0)),
      cardioMinutes: Math.round(cardio.reduce((sum, row) => sum + row.durationMin, 0)),
      week,
      currentWeekVolume,
      previousWeekVolume,
      heatmap,
      weight: {
        latest: latestWeight,
        change:
          latestWeight != null && oldestWeight != null
            ? Math.round((latestWeight - oldestWeight) * 10) / 10
            : null,
        history: weightHistory.slice(-12),
      },
      bests,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const maxDayVolume = Math.max(1, ...data.week.map((day) => day.volumeKg));
  const maxWeight = Math.max(1, ...data.weight.history.map((row) => row.value));
  const minWeight = Math.min(...data.weight.history.map((row) => row.value), maxWeight);
  const volumeChange =
    data.previousWeekVolume > 0
      ? Math.round(
          ((data.currentWeekVolume - data.previousWeekVolume) / data.previousWeekVolume) * 100,
        )
      : null;

  return (
    <ScreenContainer>
      <PageHeader
        eyebrow="训练数据"
        title="趋势"
        subtitle="所有指标均由本地训练记录聚合"
      />

      <SectionTitle>数据总览</SectionTitle>
      <MetricGrid>
        <MetricCard
          icon="barbell-outline"
          label="力量训练"
          value={data.totalSessions}
          unit="次"
          caption={`${data.totalSets} 个工作组`}
          tone="blue"
        />
        <MetricCard
          icon="trending-up-outline"
          label="累计容量"
          value={compactNumber(data.totalVolumeKg)}
          unit="kg"
          caption="历史训练总量"
          tone="purple"
        />
        <MetricCard
          icon="heart-outline"
          label="有氧训练"
          value={data.cardioMinutes}
          unit="分钟"
          caption="累计有氧时长"
          tone="green"
        />
        <MetricCard
          icon="calendar-outline"
          label="近 28 天"
          value={data.heatmap.filter((day) => day.count > 0).length}
          unit="天"
          caption="保持训练节奏"
          tone="amber"
          progress={data.heatmap.filter((day) => day.count > 0).length / 28}
        />
      </MetricGrid>

      <SectionTitle>近 7 天训练容量</SectionTitle>
      <Card>
        <View style={styles.chart}>
          {data.week.map((day) => (
            <View key={day.date} style={styles.barColumn}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.barValue}>
                {day.volumeKg > 0 ? compactNumber(day.volumeKg) : ''}
              </ThemedText>
              <View style={[styles.barTrack, { backgroundColor: theme.chartGrid }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      backgroundColor: theme.chart1,
                      height: `${Math.max(4, (day.volumeKg / maxDayVolume) * 100)}%`,
                      opacity: day.volumeKg > 0 ? 1 : 0.15,
                    },
                  ]}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {day.label}
              </ThemedText>
            </View>
          ))}
        </View>
        <Row style={[styles.spaceBetween, styles.cardGap]}>
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              本周总容量
            </ThemedText>
            <ThemedText type="headline">{compactNumber(data.currentWeekVolume)} kg</ThemedText>
          </View>
          <StatusBadge
            tone={volumeChange == null ? 'neutral' : volumeChange >= 0 ? 'green' : 'amber'}>
            {volumeChange == null
              ? '暂无基线'
              : `较上周 ${volumeChange >= 0 ? '+' : ''}${volumeChange}%`}
          </StatusBadge>
        </Row>
      </Card>

      <SectionTitle>近 28 天训练日历</SectionTitle>
      <Card>
        <View style={styles.heatmap}>
          {data.heatmap.map((day) => (
            <View
              key={day.date}
              accessibilityLabel={`${day.date} ${day.count} 次活动`}
              style={[
                styles.heatCell,
                {
                  backgroundColor:
                    day.count === 0
                      ? theme.chartGrid
                      : theme.chart2,
                  opacity: day.count === 0 ? 0.5 : Math.min(1, 0.45 + day.count * 0.25),
                },
              ]}
            />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.cardGap}>
          每格代表一天；力量或有氧记录会点亮。
        </ThemedText>
      </Card>

      <SectionTitle>动作最佳表现（估算 1RM）</SectionTitle>
      {data.bests.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            记录带重量和次数的动作后，这里会显示估算 1RM。
          </ThemedText>
        </Card>
      ) : (
        <Card>
          {data.bests.map((best) => (
            <Row key={best.exercise} style={[styles.spaceBetween, styles.listRow]}>
              <ThemedText type="small">{best.exercise}</ThemedText>
              <ThemedText type="smallBold">
                {best.e1rm} kg
                <ThemedText type="small" themeColor="textSecondary">
                  {' '}
                  · 最高 {best.weightKg} kg
                </ThemedText>
              </ThemedText>
            </Row>
          ))}
        </Card>
      )}

      <SectionTitle>体重趋势</SectionTitle>
      <Card>
        {data.weight.latest == null ? (
          <ThemedText type="small" themeColor="textSecondary">
            到「我的」页记录体重后，这里会生成趋势。
          </ThemedText>
        ) : (
          <>
            <Row style={styles.spaceBetween}>
              <ThemedText style={{ fontWeight: '700' }}>{data.weight.latest} kg</ThemedText>
              <ThemedText
                type="small"
                style={{
                  color:
                    data.weight.change === 0
                      ? theme.textSecondary
                      : (data.weight.change ?? 0) < 0
                        ? theme.success
                        : theme.warning,
                }}>
                近 90 天 {signed(data.weight.change ?? 0)} kg
              </ThemedText>
            </Row>
            <View style={styles.sparkline}>
              {data.weight.history.map((point) => {
                const range = Math.max(0.1, maxWeight - minWeight);
                const normalized = (point.value - minWeight) / range;
                return (
                  <View key={`${point.date}-${point.value}`} style={styles.sparkColumn}>
                    <View
                      style={[
                        styles.sparkPoint,
                        {
                          backgroundColor: theme.chartLine,
                          borderColor: theme.card,
                          marginBottom: normalized * 48,
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}
      </Card>
    </ScreenContainer>
  );
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekdayLabel(date: string): string {
  const labels = ['日', '一', '二', '三', '四', '五', '六'];
  return labels[new Date(`${date}T12:00:00`).getDay()];
}

function compactNumber(value: number): string {
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  return value.toLocaleString();
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

const styles = StyleSheet.create({
  chart: { height: 170, flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' },
  barColumn: { flex: 1, height: '100%', alignItems: 'center' },
  barValue: { height: 22, fontSize: 10 },
  barTrack: {
    flex: 1,
    width: '70%',
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginBottom: Spacing.one,
  },
  bar: { width: '100%', borderRadius: 6 },
  spaceBetween: { justifyContent: 'space-between' },
  cardGap: { marginTop: Spacing.two },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heatCell: { width: 24, height: 24, borderRadius: 5 },
  listRow: { paddingVertical: 5 },
  sparkline: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sparkColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  sparkPoint: { width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
});
