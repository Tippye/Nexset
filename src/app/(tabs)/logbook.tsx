import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader, SegmentedControl } from '@/components/dashboard-ui';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Input, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { addCardioLog, getCardioSince } from '@/db/repositories/cardio-repo';
import {
  createCustomExercise,
  getExercisesByIds,
  listExercises,
  type CountingType,
  type Equipment,
  type Exercise,
} from '@/db/repositories/exercise-repo';
import {
  getRecentSessions,
  getSessionSets,
  type SetLog,
} from '@/db/repositories/workout-repo';
import { useTheme } from '@/hooks/use-theme';
import { localDate } from '@/lib/id';

type Mode = 'history' | 'cardio' | 'exercises';
type SessionRow = Awaited<ReturnType<typeof getRecentSessions>>[number];
type CardioRow = Awaited<ReturnType<typeof getCardioSince>>[number];

type SessionSummary = {
  session: SessionRow;
  sets: SetLog[];
  exerciseNames: string[];
  volumeKg: number;
};

const CARDIO_TYPES = [
  ['run', '跑步'],
  ['walk', '步行'],
  ['cycle', '骑行'],
  ['row', '划船'],
  ['elliptical', '椭圆机'],
  ['swim', '游泳'],
  ['jump_rope', '跳绳'],
  ['hiit', 'HIIT'],
] as const;

const MUSCLES = [
  ['chest', '胸'],
  ['back', '背'],
  ['front_delt', '肩'],
  ['biceps', '肱二'],
  ['triceps', '肱三'],
  ['quads', '股四'],
  ['hamstrings', '腘绳'],
  ['glutes', '臀'],
  ['core', '核心'],
] as const;

const EQUIPMENT = [
  ['barbell', '杠铃'],
  ['dumbbell', '哑铃'],
  ['machine', '器械'],
  ['cable', '绳索'],
  ['bodyweight', '徒手'],
  ['kettlebell', '壶铃'],
  ['cardio_machine', '有氧器械'],
] as const satisfies readonly (readonly [Equipment, string])[];

const COUNTING_TYPES = [
  ['weight_reps', '重量 × 次数'],
  ['reps_only', '仅次数'],
  ['duration', '时长'],
  ['distance_duration', '距离 + 时长'],
  ['assisted_weight_reps', '辅助重量 × 次数'],
] as const satisfies readonly (readonly [CountingType, string])[];

export default function LogbookScreen() {
  const [mode, setMode] = useState<Mode>('history');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [cardio, setCardio] = useState<CardioRow[]>([]);

  const loadRecords = useCallback(async () => {
    const db = getDb();
    const [sessionRows, cardioRows] = await Promise.all([
      getRecentSessions(db, 30),
      getCardioSince(db, '0000-01-01'),
    ]);
    const setGroups = await Promise.all(sessionRows.map((session) => getSessionSets(db, session.id)));
    const exerciseIds = [...new Set(setGroups.flat().map((set) => set.exerciseId))];
    const exerciseMap = await getExercisesByIds(db, exerciseIds);
    setSessions(
      sessionRows.map((session, index) => {
        const sets = setGroups[index];
        return {
          session,
          sets,
          exerciseNames: [
            ...new Set(sets.map((set) => exerciseMap.get(set.exerciseId)?.nameZh ?? set.exerciseId)),
          ],
          volumeKg: Math.round(
            sets.reduce(
              (total, set) =>
                total + (set.isWarmup ? 0 : (set.weightKg ?? 0) * (set.reps ?? 0)),
              0,
            ),
          ),
        };
      }),
    );
    setCardio(cardioRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecords();
    }, [loadRecords]),
  );

  return (
    <ScreenContainer>
      <PageHeader
        eyebrow="本地训练档案"
        title="日志"
        subtitle="回看每一次训练，也可以快速补记有氧"
      />
      <SegmentedControl
        value={mode}
        options={[
          { value: 'history', label: '训练历史' },
          { value: 'cardio', label: '有氧记录' },
          { value: 'exercises', label: '动作库' },
        ]}
        onChange={setMode}
      />

      {mode === 'history' ? <HistoryList sessions={sessions} /> : null}
      {mode === 'cardio' ? <CardioLog rows={cardio} onSaved={loadRecords} /> : null}
      {mode === 'exercises' ? <ExerciseLibrary /> : null}
    </ScreenContainer>
  );
}

function HistoryList({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) {
    return (
      <Card style={styles.firstCard}>
        <ThemedText type="small" themeColor="textSecondary">
          还没有力量训练记录。到「今日」页开始第一次训练吧。
        </ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.firstCard}>
      {sessions.map(({ session, sets, exerciseNames, volumeKg }) => {
        const durationMin = session.endedAt
          ? Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000))
          : null;
        return (
          <Card key={session.id}>
            <Row style={styles.spaceBetween}>
              <ThemedText type="smallBold">{session.date}</ThemedText>
              <ThemedText type="small" themeColor={session.endedAt ? 'success' : 'warning'}>
                {session.endedAt ? '已完成' : '未结束'}
              </ThemedText>
            </Row>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardGap}>
              {exerciseNames.length ? exerciseNames.join(' · ') : '自由训练（未记录动作）'}
            </ThemedText>
            <Row style={[styles.spaceBetween, styles.cardGap]}>
              <ThemedText type="small">{sets.length} 组</ThemedText>
              <ThemedText type="small">{volumeKg.toLocaleString()} kg 容量</ThemedText>
              <ThemedText type="small">{durationMin ? `${durationMin} 分钟` : '进行中'}</ThemedText>
            </Row>
            {session.feeling ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardGap}>
                感受：{feelingLabel(session.feeling)}
                {session.note ? ` · ${session.note}` : ''}
              </ThemedText>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

function CardioLog({ rows, onSaved }: { rows: CardioRow[]; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<(typeof CARDIO_TYPES)[number][0]>('run');
  const [date, setDate] = useState(localDate());
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [intensity, setIntensity] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const durationMin = Number(duration);
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      Alert.alert('请填写有效时长', '时长必须大于 0 分钟。');
      return;
    }
    setSaving(true);
    try {
      await addCardioLog(getDb(), {
        type,
        date: date || localDate(),
        durationMin,
        distanceKm: distance ? Number(distance) : null,
        avgHr: heartRate ? Number(heartRate) : null,
        intensity,
        note: note || null,
      });
      setDuration('');
      setDistance('');
      setHeartRate('');
      setNote('');
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <SectionTitle>添加有氧</SectionTitle>
      <Card>
        <ChipRow>
          {CARDIO_TYPES.map(([key, label]) => (
            <Chip key={key} label={label} selected={type === key} onPress={() => setType(key)} />
          ))}
        </ChipRow>
        <SectionTitle>日期</SectionTitle>
        <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <SectionTitle>时长（分钟）</SectionTitle>
        <Input
          value={duration}
          onChangeText={setDuration}
          keyboardType="decimal-pad"
          placeholder="如 30"
        />
        <SectionTitle>距离（公里，可选）</SectionTitle>
        <Input
          value={distance}
          onChangeText={setDistance}
          keyboardType="decimal-pad"
          placeholder="如 5"
        />
        <SectionTitle>平均心率（可选）</SectionTitle>
        <Input
          value={heartRate}
          onChangeText={setHeartRate}
          keyboardType="number-pad"
          placeholder="如 145"
        />
        <SectionTitle>强度</SectionTitle>
        <ChipRow>
          <Chip label="低" selected={intensity === 'low'} onPress={() => setIntensity('low')} />
          <Chip
            label="中"
            selected={intensity === 'moderate'}
            onPress={() => setIntensity('moderate')}
          />
          <Chip label="高" selected={intensity === 'high'} onPress={() => setIntensity('high')} />
        </ChipRow>
        <SectionTitle>备注（可选）</SectionTitle>
        <Input value={note} onChangeText={setNote} placeholder="今天的体感、路线等" />
        <View style={styles.buttonGap} />
        <Button onPress={save} loading={saving}>
          保存有氧记录
        </Button>
      </Card>

      <SectionTitle>最近有氧</SectionTitle>
      {rows.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            暂无有氧记录。
          </ThemedText>
        </Card>
      ) : (
        rows.slice(0, 30).map((row) => (
          <Card key={row.id}>
            <Row style={styles.spaceBetween}>
              <ThemedText type="smallBold">{cardioLabel(row.type)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {row.date}
              </ThemedText>
            </Row>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardGap}>
              {row.durationMin} 分钟
              {row.distanceKm != null ? ` · ${row.distanceKm} km` : ''}
              {row.avgHr != null ? ` · 均心 ${row.avgHr}` : ''}
              {row.intensity ? ` · ${intensityLabel(row.intensity)}` : ''}
            </ThemedText>
          </Card>
        ))
      )}
    </View>
  );
}

function ExerciseLibrary() {
  const [keyword, setKeyword] = useState('');
  const [muscle, setMuscle] = useState<string>();
  const [equipment, setEquipment] = useState<Equipment>();
  const [allItems, setAllItems] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setAllItems(await listExercises(getDb()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const items = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return allItems.filter(
      (exercise) =>
        (!normalized ||
          exercise.nameZh.includes(keyword.trim()) ||
          exercise.nameEn.toLowerCase().includes(normalized)) &&
        (!muscle || exercise.primaryMuscles.includes(muscle)) &&
        (!equipment || exercise.equipment === equipment),
    );
  }, [allItems, keyword, muscle, equipment]);

  return (
    <View>
      <SectionTitle>搜索与筛选</SectionTitle>
      <Input value={keyword} onChangeText={setKeyword} placeholder="搜索中文或英文动作" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <ChipRow>
          <Chip label="全部肌群" selected={!muscle} onPress={() => setMuscle(undefined)} />
          {MUSCLES.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={muscle === key}
              onPress={() => setMuscle(muscle === key ? undefined : key)}
            />
          ))}
        </ChipRow>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <ChipRow>
          <Chip label="全部器械" selected={!equipment} onPress={() => setEquipment(undefined)} />
          {EQUIPMENT.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={equipment === key}
              onPress={() => setEquipment(equipment === key ? undefined : key)}
            />
          ))}
        </ChipRow>
      </ScrollView>
      <Row style={[styles.spaceBetween, styles.resultsHeader]}>
        <ThemedText type="small" themeColor="textSecondary">
          找到 {items.length} 个动作
        </ThemedText>
        <Button compact onPress={() => setCreating(true)}>
          + 自建动作
        </Button>
      </Row>

      {items.slice(0, 100).map((exercise) => (
        <Pressable key={exercise.id} onPress={() => setSelected(exercise)}>
          <Card>
            <Row style={styles.spaceBetween}>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">
                  {exercise.nameZh}
                  {exercise.isCustom ? ' · 自建' : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {exercise.nameEn}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {exercise.primaryMuscles.map(muscleLabel).join('/')}
              </ThemedText>
            </Row>
          </Card>
        </Pressable>
      ))}

      <ExerciseDetail exercise={selected} onClose={() => setSelected(null)} />
      <CreateExercise
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          await load();
        }}
      />
    </View>
  );
}

function ExerciseDetail({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={exercise != null} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          padding: Spacing.three,
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
        }}>
        {exercise ? (
          <>
            <Row style={styles.spaceBetween}>
              <ThemedText type="subtitle">{exercise.nameZh}</ThemedText>
              <Button variant="ghost" compact onPress={onClose}>
                关闭
              </Button>
            </Row>
            <ThemedText themeColor="textSecondary">{exercise.nameEn}</ThemedText>
            <SectionTitle>动作信息</SectionTitle>
            <Card>
              <ThemedText type="small">
                主肌群：{exercise.primaryMuscles.map(muscleLabel).join('、')}
              </ThemedText>
              <ThemedText type="small" style={styles.cardGap}>
                器械：{equipmentLabel(exercise.equipment)}
              </ThemedText>
              <ThemedText type="small" style={styles.cardGap}>
                记录方式：{countingLabel(exercise.countingType)}
              </ThemedText>
              <ThemedText type="small" style={styles.cardGap}>
                难度：{'●'.repeat(exercise.difficulty)}
                {'○'.repeat(Math.max(0, 3 - exercise.difficulty))}
              </ThemedText>
            </Card>
            <SectionTitle>动作要点</SectionTitle>
            <Card>
              {exercise.cues.length ? (
                exercise.cues.map((cue, index) => (
                  <ThemedText key={`${cue}-${index}`} type="small" style={styles.cardGap}>
                    {index + 1}. {cue}
                  </ThemedText>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  暂无动作要点。
                </ThemedText>
              )}
            </Card>
            {exercise.contraindications.length ? (
              <ThemedText type="small" style={{ color: theme.warning }}>
                注意：有这些伤病时应谨慎或避免：{exercise.contraindications.join('、')}
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

function CreateExercise({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [nameZh, setNameZh] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [muscle, setMuscle] = useState('chest');
  const [equipment, setEquipment] = useState<Equipment>('other');
  const [countingType, setCountingType] = useState<CountingType>('weight_reps');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!nameZh.trim()) {
      Alert.alert('请输入动作名称');
      return;
    }
    setSaving(true);
    try {
      await createCustomExercise(getDb(), {
        nameZh: nameZh.trim(),
        nameEn: nameEn.trim() || nameZh.trim(),
        primaryMuscles: [muscle],
        secondaryMuscles: [],
        equipment,
        countingType,
        difficulty: 1,
        cues: [],
      });
      setNameZh('');
      setNameEn('');
      await onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          padding: Spacing.three,
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
        }}>
        <Row style={styles.spaceBetween}>
          <ThemedText type="subtitle">自建动作</ThemedText>
          <Button variant="ghost" compact onPress={onClose}>
            关闭
          </Button>
        </Row>
        <SectionTitle>中文名</SectionTitle>
        <Input value={nameZh} onChangeText={setNameZh} placeholder="如 单臂地雷管推举" />
        <SectionTitle>英文名（可选）</SectionTitle>
        <Input value={nameEn} onChangeText={setNameEn} placeholder="Landmine Press" />
        <SectionTitle>主肌群</SectionTitle>
        <ChipRow>
          {MUSCLES.map(([key, label]) => (
            <Chip key={key} label={label} selected={muscle === key} onPress={() => setMuscle(key)} />
          ))}
        </ChipRow>
        <SectionTitle>器械</SectionTitle>
        <ChipRow>
          {[...EQUIPMENT, ['other', '其他'] as const].map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={equipment === key}
              onPress={() => setEquipment(key)}
            />
          ))}
        </ChipRow>
        <SectionTitle>记录方式</SectionTitle>
        <ChipRow>
          {COUNTING_TYPES.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={countingType === key}
              onPress={() => setCountingType(key)}
            />
          ))}
        </ChipRow>
        <View style={styles.buttonGap} />
        <Button onPress={save} loading={saving}>
          保存动作
        </Button>
      </ScrollView>
    </Modal>
  );
}

function feelingLabel(feeling: string) {
  return (
    {
      great: '状态爆棚',
      ok: '正常',
      tired: '有点累',
      bad: '很差',
    }[feeling] ?? feeling
  );
}

function cardioLabel(type: string) {
  return CARDIO_TYPES.find(([key]) => key === type)?.[1] ?? type;
}

function intensityLabel(intensity: string) {
  return ({ low: '低强度', moderate: '中等强度', high: '高强度' }[intensity] ?? intensity);
}

function muscleLabel(muscle: string) {
  return MUSCLES.find(([key]) => key === muscle)?.[1] ?? muscle;
}

function equipmentLabel(equipment: string) {
  return EQUIPMENT.find(([key]) => key === equipment)?.[1] ?? equipment;
}

function countingLabel(type: string) {
  return COUNTING_TYPES.find(([key]) => key === type)?.[1] ?? type;
}

const styles = StyleSheet.create({
  firstCard: { marginTop: Spacing.one },
  spaceBetween: { justifyContent: 'space-between' },
  cardGap: { marginTop: Spacing.one },
  buttonGap: { height: Spacing.three },
  filterScroll: { marginTop: Spacing.two },
  resultsHeader: { marginTop: Spacing.three, marginBottom: Spacing.two },
});
