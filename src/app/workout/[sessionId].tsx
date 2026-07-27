import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar, StatusBadge } from '@/components/dashboard-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Input, Row, SectionTitle, Stepper } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { listExercises, type Exercise } from '@/db/repositories/exercise-repo';
import { useTheme } from '@/hooks/use-theme';
import { useWorkoutStore, type WorkoutExercise, type WorkoutSummary } from '@/store/workout-store';

function triggerHaptic() {
  if (Platform.OS !== 'web') {
    import('expo-haptics').then((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
  }
}

function useNativeKeepAwake() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const activation = activateKeepAwakeAsync('nexset-workout');
    return () => {
      // Wait for activation before releasing so fast navigation cannot race it.
      void activation
        .then(() => deactivateKeepAwake('nexset-workout'))
        .catch(() => undefined);
    };
  }, []);
}

export default function WorkoutScreen() {
  useNativeKeepAwake();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const store = useWorkoutStore();
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [pickerMode, setPickerMode] = useState<'add' | 'replace' | null>(null);

  const ex = store.exercises[store.currentIndex] ?? null;
  const completedExercises = store.exercises.filter(
    (exercise) => exercise.loggedSets.length >= exercise.targetSets,
  ).length;

  if (summary) {
    return <SummaryView summary={summary} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Row style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="overline" themeColor="textSecondary">
              训练进行中
            </ThemedText>
            <ThemedText type="headline">{store.label}</ThemedText>
          </View>
          <Button
            variant="secondary"
            compact
            onPress={async () => {
              const s = await store.finish();
              triggerHaptic();
              setSummary(s);
            }}>
            结束训练
          </Button>
        </Row>
        <Row style={styles.progressRow}>
          <View style={styles.progress}>
            <ProgressBar
              value={
                store.exercises.length > 0 ? completedExercises / store.exercises.length : 0
              }
              color={theme.chart2}
            />
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {completedExercises}/{store.exercises.length}
          </ThemedText>
        </Row>
      </View>

      {/* exercise pager */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.three }}>
        {store.exercises.length === 0 && (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              自由训练：点击下方「添加动作」开始记录。
            </ThemedText>
          </Card>
        )}
        {ex && <ExercisePanel key={ex.exerciseId + store.currentIndex} ex={ex} />}

        <RestTimer />

        <Row style={{ marginTop: Spacing.three, flexWrap: 'wrap' }}>
          <Button variant="secondary" compact onPress={() => setPickerMode('add')}>
            + 添加动作
          </Button>
          {ex && (
            <Button variant="secondary" compact onPress={() => setPickerMode('replace')}>
              替换动作
            </Button>
          )}
          {ex && (
            <Button variant="secondary" compact onPress={() => store.addTargetSet(store.currentIndex)}>
              加一组
            </Button>
          )}
          {ex && ex.loggedSets.length > 0 && (
            <Button variant="secondary" compact onPress={() => store.undoLastSet()}>
              撤销上组
            </Button>
          )}
        </Row>

        {/* exercise switcher */}
        {store.exercises.length > 1 && (
          <>
            <SectionTitle>训练动作</SectionTitle>
            <ChipRow>
              {store.exercises.map((e, i) => (
                <Chip
                  key={e.exerciseId + i}
                  label={`${e.exercise.nameZh} ${e.loggedSets.length}/${e.targetSets}`}
                  selected={i === store.currentIndex}
                  onPress={() => store.setCurrentIndex(i)}
                />
              ))}
            </ChipRow>
          </>
        )}
      </ScrollView>

      <ExercisePicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        preferSubstitutesOf={pickerMode === 'replace' ? ex : null}
        onSelect={async (id) => {
          if (pickerMode === 'replace') await store.replaceExercise(store.currentIndex, id);
          else await store.addExercise(id);
          setPickerMode(null);
        }}
      />
    </View>
  );
}

// ── Set logging panel: renders by counting_type ───────────────

function ExercisePanel({ ex }: { ex: WorkoutExercise }) {
  const theme = useTheme();
  const store = useWorkoutStore();
  const ct = ex.exercise.countingType;

  const lastSame = ex.loggedSets[ex.loggedSets.length - 1];
  const lastHistory = ex.lastSets[Math.min(ex.loggedSets.length, ex.lastSets.length - 1)];
  const defaultWeight =
    lastSame?.weightKg ?? lastHistory?.weightKg ?? ex.plannedWeightKg ?? 20;
  const defaultReps = lastSame?.reps ?? lastHistory?.reps ?? parseRepsTarget(ex.targetReps);

  const [weight, setWeight] = useState(defaultWeight);
  const [reps, setReps] = useState(defaultReps);
  const [durationSec, setDurationSec] = useState(lastSame?.durationSec ?? 40);
  const [distanceM, setDistanceM] = useState(lastSame?.distanceM ?? 1000);
  const [rpe, setRpe] = useState<number | null>(null);

  const done = ex.loggedSets.length;
  const lastLabel = ex.lastSets.length
    ? `上次: ${ex.lastSets
        .map((s) =>
          ct === 'duration'
            ? `${s.durationSec ?? 0}s`
            : ct === 'reps_only'
              ? `${s.reps ?? 0}`
              : `${s.weightKg ?? 0}kg×${s.reps ?? 0}`,
        )
        .join(', ')}`
    : '首次记录该动作';

  async function complete() {
    await store.logSet({
      weightKg: ct === 'weight_reps' || ct === 'assisted_weight_reps' ? weight : null,
      reps: ct === 'weight_reps' || ct === 'assisted_weight_reps' || ct === 'reps_only' ? reps : null,
      durationSec: ct === 'duration' || ct === 'distance_duration' ? durationSec : null,
      distanceM: ct === 'distance_duration' ? distanceM : null,
      rpe,
    });
    setRpe(null);
    triggerHaptic();
  }

  return (
    <Card style={styles.exercisePanel}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={styles.exerciseTitle}>
          <ThemedText type="small" themeColor="textSecondary">
            当前动作
          </ThemedText>
          <ThemedText type="headline">{ex.exercise.nameZh}</ThemedText>
        </View>
        <StatusBadge tone={done >= ex.targetSets ? 'green' : 'blue'}>
          {done}/{ex.targetSets} 组
        </StatusBadge>
      </Row>
      {ex.prHit && (
        <ThemedText type="small" style={{ color: theme.accent, marginTop: 2 }}>
          🎉 新纪录（{ex.prHit === 'weight' ? '最大重量' : '估算1RM'}）！
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
        {lastLabel}
      </ThemedText>
      {ex.exercise.cues.length > 0 && done === 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
          要点：{ex.exercise.cues.join('；')}
        </ThemedText>
      )}

      <View style={{ marginTop: Spacing.three, gap: Spacing.two }}>
        {(ct === 'weight_reps' || ct === 'assisted_weight_reps') && (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <ThemedText type="small">{ct === 'assisted_weight_reps' ? '辅助重量' : '重量'} (kg)</ThemedText>
              <Stepper value={weight} onChange={setWeight} step={2.5} bigStep={10} max={500}
                format={(v) => `${v}`} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <ThemedText type="small">次数</ThemedText>
              <Stepper value={reps} onChange={setReps} step={1} max={100} />
            </Row>
          </>
        )}
        {ct === 'reps_only' && (
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText type="small">次数</ThemedText>
            <Stepper value={reps} onChange={setReps} step={1} max={200} />
          </Row>
        )}
        {(ct === 'duration' || ct === 'distance_duration') && (
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText type="small">时长 (秒)</ThemedText>
            <Stepper value={durationSec} onChange={setDurationSec} step={5} bigStep={30} max={7200} />
          </Row>
        )}
        {ct === 'distance_duration' && (
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText type="small">距离 (米)</ThemedText>
            <Stepper value={distanceM} onChange={setDistanceM} step={100} bigStep={500} max={100000} />
          </Row>
        )}

        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText type="small">RPE</ThemedText>
          <ChipRow>
            {[7, 8, 9, 10].map((v) => (
              <Chip key={v} label={String(v)} selected={rpe === v} onPress={() => setRpe(rpe === v ? null : v)} />
            ))}
          </ChipRow>
        </Row>

        <Button onPress={complete}>✓ 完成第 {done + 1} 组</Button>
      </View>

      {ex.loggedSets.length > 0 && (
        <View style={{ marginTop: Spacing.two }}>
          {ex.loggedSets.map((s) => (
            <ThemedText key={s.id} type="small" themeColor="textSecondary">
              第{s.setNo}组：
              {ct === 'duration'
                ? `${s.durationSec}s`
                : ct === 'distance_duration'
                  ? `${s.distanceM}m / ${s.durationSec}s`
                  : ct === 'reps_only'
                    ? `${s.reps} 次`
                    : `${s.weightKg}kg × ${s.reps}`}
              {s.rpe ? ` @RPE${s.rpe}` : ''}
            </ThemedText>
          ))}
        </View>
      )}
    </Card>
  );
}

function parseRepsTarget(reps: string): number {
  const m = reps.match(/^(\d+)/);
  return m ? Number(m[1]) : 10;
}

// ── Rest timer ────────────────────────────────────────────────

function RestTimer() {
  const theme = useTheme();
  const restEndsAt = useWorkoutStore((s) => s.restEndsAt);
  const skipRest = useWorkoutStore((s) => s.skipRest);
  const [remain, setRemain] = useState(0);

  useEffect(() => {
    if (!restEndsAt) {
      return;
    }
    const update = () => {
      const next = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      setRemain(next);
      if (next === 0) {
        triggerHaptic();
        skipRest();
      }
    };
    update();
    const t = setInterval(() => {
      update();
    }, 1000);
    return () => clearInterval(t);
  }, [restEndsAt, skipRest]);

  if (!restEndsAt) return null;
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');

  return (
    <Card style={{ marginTop: Spacing.two }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <Ionicons name="timer-outline" size={20} color={theme.accent} />
          <ThemedText style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            组间休息 {mm}:{ss}
          </ThemedText>
        </Row>
        <Button variant="secondary" compact onPress={skipRest}>
          跳过
        </Button>
      </Row>
    </Card>
  );
}

// ── Exercise picker (add / replace) ───────────────────────────

function ExercisePicker({
  visible,
  onClose,
  onSelect,
  preferSubstitutesOf,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  preferSubstitutesOf: WorkoutExercise | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [keyword, setKeyword] = useState('');
  const [all, setAll] = useState<Exercise[]>([]);

  useEffect(() => {
    if (visible) listExercises(getDb(), {}).then(setAll);
  }, [visible]);

  const list = useMemo(() => {
    let candidates = all;
    if (keyword) {
      const kw = keyword.toLowerCase();
      candidates = all.filter(
        (e) => e.nameZh.includes(keyword) || e.nameEn.toLowerCase().includes(kw),
      );
    } else if (preferSubstitutesOf) {
      const subs = new Set(preferSubstitutesOf.exercise.substitutes);
      const muscle = preferSubstitutesOf.exercise.primaryMuscles[0];
      const sameMuscle = all.filter(
        (e) => e.primaryMuscles.includes(muscle) && e.id !== preferSubstitutesOf.exerciseId,
      );
      candidates = [
        ...sameMuscle.filter((e) => subs.has(e.id)),
        ...sameMuscle.filter((e) => !subs.has(e.id)),
      ];
    }
    return candidates.slice(0, 60);
  }, [all, keyword, preferSubstitutesOf]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top + 8 }}>
        <View style={{ paddingHorizontal: Spacing.three, gap: Spacing.two, flex: 1 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText type="smallBold">
              {preferSubstitutesOf ? `替换「${preferSubstitutesOf.exercise.nameZh}」` : '添加动作'}
            </ThemedText>
            <Button variant="ghost" compact onPress={onClose}>
              关闭
            </Button>
          </Row>
          <Input placeholder="搜索动作（中/英文）" value={keyword} onChangeText={setKeyword} />
          <FlatList
            data={list}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <Pressable onPress={() => onSelect(item.id)}>
                <Card style={{ marginBottom: 8 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <ThemedText type="small" style={{ fontWeight: '600' }}>
                      {item.nameZh}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.primaryMuscles.join('/')}
                    </ThemedText>
                  </Row>
                </Card>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Summary ───────────────────────────────────────────────────

function SummaryView({ summary }: { summary: WorkoutSummary }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reset = useWorkoutStore((s) => s.reset);
  const [feeling, setFeeling] = useState<'great' | 'ok' | 'tired' | 'bad'>();
  const [note, setNote] = useState('');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: Spacing.three, paddingTop: insets.top + Spacing.three }}>
      <ThemedText type="subtitle">训练完成 💪</ThemedText>
      <Card style={{ marginTop: Spacing.three }}>
        <Row style={{ justifyContent: 'space-around' }}>
          <Stat label="时长" value={`${summary.durationMin}min`} />
          <Stat label="总容量" value={`${summary.totalVolumeKg}kg`} />
          <Stat label="总组数" value={String(summary.totalSets)} />
        </Row>
      </Card>
      {summary.prs.length > 0 && (
        <Card>
          {summary.prs.map((p, i) => (
            <ThemedText key={i} type="small" style={{ color: theme.accent }}>
              🎉 {p.name} 创{p.kind === 'weight' ? '最大重量' : '估算1RM'}纪录
            </ThemedText>
          ))}
        </Card>
      )}
      <Card>
        {summary.plannedVsDone.map((p, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <ThemedText type="small">{p.name}</ThemedText>
            <ThemedText
              type="small"
              style={{ color: p.done >= p.target ? theme.success : theme.warning }}>
              {p.done}/{p.target} 组
            </ThemedText>
          </Row>
        ))}
      </Card>
      <SectionTitle>今天感觉如何？</SectionTitle>
      <ChipRow>
        {(
          [
            ['great', '状态爆棚'],
            ['ok', '正常'],
            ['tired', '有点累'],
            ['bad', '很差'],
          ] as const
        ).map(([k, label]) => (
          <Chip key={k} label={label} selected={feeling === k} onPress={() => setFeeling(k)} />
        ))}
      </ChipRow>
      <View style={{ height: Spacing.two }} />
      <Input placeholder="备注（可选）" value={note} onChangeText={setNote} />
      <View style={{ height: Spacing.three }} />
      <Button
        onPress={async () => {
          // endSession already ran; persist feeling/note update if provided
          if (feeling || note) {
            const { updateSessionFeedback } = await import('@/db/repositories/workout-repo');
            await updateSessionFeedback(getDb(), summary.sessionId, {
              feeling,
              note: note || undefined,
            });
          }
          reset();
          router.dismissAll();
          router.replace('/');
        }}>
        完成
      </Button>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <ThemedText style={{ fontWeight: '700', fontSize: 20 }}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.threeHalf,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: { justifyContent: 'space-between', alignItems: 'flex-start' },
  progressRow: { marginTop: Spacing.two, gap: Spacing.twoHalf },
  progress: { flex: 1 },
  exercisePanel: { padding: Spacing.threeHalf },
  exerciseTitle: { flex: 1 },
});
