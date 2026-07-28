import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import {
  IconButton,
  MetricCard,
  MetricGrid,
  PageHeader,
} from '@/components/dashboard-ui';
import { EquipmentSelector } from '@/components/equipment-selector';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Input, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import {
  DEFAULT_GYM_EQUIPMENT_IDS,
  DEFAULT_HOME_EQUIPMENT_IDS,
  equipmentTypesForSelection,
  inferGymEquipmentIds,
  type GymEquipmentId,
  type TrainingLocation,
} from '@/data/gym-equipment';
import { getDb } from '@/db/client';
import {
  addBodyMetric,
  getMetricHistory,
  type BodyMetricKind,
} from '@/db/repositories/body-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';
import { useTheme } from '@/hooks/use-theme';
import { localDate } from '@/lib/id';
import { saveBodyMetricToAppleHealth } from '@/platform/apple/healthkit';
import { useAppStore } from '@/store/app-store';

const GOALS = [
  ['hypertrophy', '增肌'],
  ['fat_loss', '减脂'],
  ['strength', '力量'],
  ['endurance', '耐力'],
  ['toning', '塑形'],
] as const;

const EXPERIENCE = [
  ['novice', '新手'],
  ['intermediate', '进阶'],
  ['advanced', '高级'],
] as const;

const INJURIES = [
  ['shoulder', '肩'],
  ['lower_back', '下背/腰'],
  ['knee', '膝'],
  ['elbow', '肘'],
  ['wrist', '腕'],
  ['hip', '髋'],
  ['ankle', '踝'],
  ['neck', '颈'],
] as const;

const BODY_METRICS = [
  ['weight_kg', '体重', 'kg'],
  ['body_fat_pct', '体脂', '%'],
  ['waist_cm', '腰围', 'cm'],
  ['chest_cm', '胸围', 'cm'],
  ['arm_cm', '臂围', 'cm'],
  ['thigh_cm', '大腿围', 'cm'],
  ['hip_cm', '臀围', 'cm'],
] as const satisfies readonly (readonly [BodyMetricKind, string, string])[];

type MetricRow = Awaited<ReturnType<typeof getMetricHistory>>[number];

export default function ProfileScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const updateProfile = useAppStore((state) => state.updateProfile);

  const [sex, setSex] = useState<UserProfile['sex']>(profile?.sex);
  const [birthYear, setBirthYear] = useState(profile?.birthYear?.toString() ?? '');
  const [heightCm, setHeightCm] = useState(profile?.heightCm?.toString() ?? '');
  const [weightKg, setWeightKg] = useState(profile?.weightKg?.toString() ?? '');
  const [goal, setGoal] = useState<UserProfile['goal']>(profile?.goal);
  const [experience, setExperience] = useState<UserProfile['experience']>(profile?.experience);
  const [daysPerWeek, setDaysPerWeek] = useState(profile?.daysPerWeek ?? 3);
  const [sessionMinutes, setSessionMinutes] = useState(profile?.sessionMinutes ?? 60);
  const [trainingLocation, setTrainingLocation] = useState<TrainingLocation>(
    profile?.trainingLocation ?? (profile?.equipment?.length ? 'gym' : 'bodyweight'),
  );
  const [gymEquipmentIds, setGymEquipmentIds] = useState<GymEquipmentId[]>(
    profile?.gymEquipmentIds ?? inferGymEquipmentIds(profile?.equipment),
  );
  const [injuries, setInjuries] = useState<string[]>(profile?.injuries ?? []);
  const [saving, setSaving] = useState(false);

  const [metric, setMetric] = useState<BodyMetricKind>('weight_kg');
  const [metricValue, setMetricValue] = useState('');
  const [metricDate, setMetricDate] = useState(localDate());
  const [metricRows, setMetricRows] = useState<MetricRow[]>([]);
  const [savingMetric, setSavingMetric] = useState(false);

  const loadMetricHistory = useCallback(async () => {
    setMetricRows(await getMetricHistory(getDb(), metric));
  }, [metric]);

  useFocusEffect(
    useCallback(() => {
      void loadMetricHistory();
    }, [loadMetricHistory]),
  );

  async function saveProfile() {
    if (
      (trainingLocation === 'gym' || trainingLocation === 'home') &&
      gymEquipmentIds.length === 0
    ) {
      Alert.alert('请至少选择一项器材', '如果没有可用器材，请改选“徒手 / 无器械”。');
      return;
    }
    const next: UserProfile = {
      sex,
      birthYear: optionalNumber(birthYear),
      heightCm: optionalNumber(heightCm),
      weightKg: optionalNumber(weightKg),
      goal,
      experience,
      daysPerWeek,
      sessionMinutes,
      equipment: equipmentTypesForSelection(gymEquipmentIds, trainingLocation),
      trainingLocation,
      gymEquipmentIds: trainingLocation === 'bodyweight' ? [] : gymEquipmentIds,
      injuries,
      cardioPref: profile?.cardioPref,
      incomplete: !sex || !weightKg || !goal || !experience || !daysPerWeek,
    };
    setSaving(true);
    try {
      await updateProfile(next);
      Alert.alert('已保存', '个人档案已更新。现有计划不会被静默修改。');
    } finally {
      setSaving(false);
    }
  }

  async function saveMetric() {
    const value = Number(metricValue);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('请输入有效数值');
      return;
    }
    setSavingMetric(true);
    try {
      await addBodyMetric(getDb(), metric, value, metricDate || localDate());
      if (metric === 'weight_kg' || metric === 'body_fat_pct') {
        const metricAt = new Date(`${metricDate || localDate()}T12:00:00`);
        void saveBodyMetricToAppleHealth(metric, value, metricAt).catch(() => undefined);
      }
      if (metric === 'weight_kg') {
        setWeightKg(String(value));
        await updateProfile({
          ...(profile ?? {}),
          weightKg: value,
          incomplete: profile?.incomplete ?? false,
        });
      }
      setMetricValue('');
      await loadMetricHistory();
    } finally {
      setSavingMetric(false);
    }
  }

  function chooseTrainingLocation(location: TrainingLocation) {
    setTrainingLocation(location);
    if (location === 'gym' && gymEquipmentIds.length === 0) {
      setGymEquipmentIds([...DEFAULT_GYM_EQUIPMENT_IDS]);
    }
    if (location === 'home' && gymEquipmentIds.length === 0) {
      setGymEquipmentIds([...DEFAULT_HOME_EQUIPMENT_IDS]);
    }
  }

  const numericHeight = optionalNumber(heightCm);
  const numericWeight = optionalNumber(weightKg);
  const bmi =
    numericHeight && numericWeight
      ? Math.round((numericWeight / (numericHeight / 100) ** 2) * 10) / 10
      : null;

  return (
    <ScreenContainer>
      <PageHeader
        eyebrow="个人与身体数据"
        title="我的"
        subtitle="档案和记录默认只保存在这台设备上"
        action={
          <IconButton
            icon="sparkles-outline"
            label="打开 AI 设置"
            onPress={() => router.push('/settings/ai')}
          />
        }
      />
      {profile?.incomplete ? (
        <ThemedText type="small" style={{ color: theme.warning, marginBottom: Spacing.three }}>
          资料尚不完整；补充后可获得更准确的计划与营养建议。
        </ThemedText>
      ) : null}

      <MetricGrid>
        <MetricCard
          icon="scale-outline"
          label="当前体重"
          value={numericWeight ?? '—'}
          unit={numericWeight ? 'kg' : undefined}
          caption={numericWeight ? '档案中的最新体重' : '等待记录'}
          tone="blue"
        />
        <MetricCard
          icon="body-outline"
          label="BMI"
          value={bmi ?? '—'}
          caption={bmi ? bmiLabel(bmi) : '补充身高和体重'}
          tone={bmi && bmi >= 18.5 && bmi < 25 ? 'green' : 'amber'}
        />
      </MetricGrid>

      <SectionTitle>基本信息</SectionTitle>
      <Card>
        <ChipRow>
          <Chip label="男" selected={sex === 'male'} onPress={() => setSex('male')} />
          <Chip label="女" selected={sex === 'female'} onPress={() => setSex('female')} />
          <Chip label="其他" selected={sex === 'other'} onPress={() => setSex('other')} />
        </ChipRow>
        <SectionTitle>出生年份</SectionTitle>
        <Input value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" />
        <SectionTitle>身高（cm）</SectionTitle>
        <Input value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
        <SectionTitle>当前体重（kg）</SectionTitle>
        <Input value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" />
      </Card>

      <SectionTitle>训练目标与经验</SectionTitle>
      <Card>
        <ChipRow>
          {GOALS.map(([key, label]) => (
            <Chip key={key} label={label} selected={goal === key} onPress={() => setGoal(key)} />
          ))}
        </ChipRow>
        <View style={styles.innerGap} />
        <ChipRow>
          {EXPERIENCE.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={experience === key}
              onPress={() => setExperience(key)}
            />
          ))}
        </ChipRow>
      </Card>

      <SectionTitle>训练安排</SectionTitle>
      <Card>
        <ThemedText type="small">每周训练天数</ThemedText>
        <View style={styles.innerGap} />
        <ChipRow>
          {[1, 2, 3, 4, 5, 6, 7].map((days) => (
            <Chip
              key={days}
              label={`${days}天`}
              selected={daysPerWeek === days}
              onPress={() => setDaysPerWeek(days)}
            />
          ))}
        </ChipRow>
        <SectionTitle>单次时长</SectionTitle>
        <ChipRow>
          {[30, 45, 60, 90, 120].map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes}分钟`}
              selected={sessionMinutes === minutes}
              onPress={() => setSessionMinutes(minutes)}
            />
          ))}
        </ChipRow>
      </Card>

      <SectionTitle>训练场地与可用器材</SectionTitle>
      <Card>
        <ChipRow>
          <Chip
            label="商业健身房"
            selected={trainingLocation === 'gym'}
            onPress={() => chooseTrainingLocation('gym')}
          />
          <Chip
            label="家中训练"
            selected={trainingLocation === 'home'}
            onPress={() => chooseTrainingLocation('home')}
          />
          <Chip
            label="徒手 / 无器械"
            selected={trainingLocation === 'bodyweight'}
            onPress={() => chooseTrainingLocation('bodyweight')}
          />
        </ChipRow>
        {trainingLocation === 'gym' || trainingLocation === 'home' ? (
          <View style={styles.equipmentSelector}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.equipmentHint}>
              计划生成与后续调整只会使用这里选中的器材。
            </ThemedText>
            <EquipmentSelector
              selectedIds={gymEquipmentIds}
              onChange={setGymEquipmentIds}
            />
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
            已选择徒手训练，计划会使用自重动作与无需器械的有氧活动。
          </ThemedText>
        )}
      </Card>

      <SectionTitle>伤病部位</SectionTitle>
      <Card>
        <ChipRow>
          {INJURIES.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={injuries.includes(key)}
              onPress={() => setInjuries(toggle(injuries, key))}
            />
          ))}
        </ChipRow>
        <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
          Nexset 只会规避相关动作，不提供医疗诊断；持续疼痛请及时就医。
        </ThemedText>
      </Card>

      <Button onPress={saveProfile} loading={saving}>
        保存个人档案
      </Button>
      <View style={styles.innerGap} />
      <Button variant="secondary" onPress={() => router.push('/onboarding')}>
        重新生成模板计划
      </Button>

      <SectionTitle>身体数据记录</SectionTitle>
      <Card>
        <ChipRow>
          {BODY_METRICS.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={metric === key}
              onPress={() => setMetric(key)}
            />
          ))}
        </ChipRow>
        <SectionTitle>{metricLabel(metric)}数值</SectionTitle>
        <Input
          value={metricValue}
          onChangeText={setMetricValue}
          keyboardType="decimal-pad"
          placeholder={`单位：${metricUnit(metric)}`}
        />
        <SectionTitle>日期</SectionTitle>
        <Input value={metricDate} onChangeText={setMetricDate} placeholder="YYYY-MM-DD" />
        <View style={styles.buttonGap} />
        <Button onPress={saveMetric} loading={savingMetric}>
          保存身体数据
        </Button>
      </Card>

      <SectionTitle>{metricLabel(metric)}历史</SectionTitle>
      {metricRows.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            暂无记录。
          </ThemedText>
        </Card>
      ) : (
        metricRows.slice(0, 20).map((row) => (
          <Card key={row.id}>
            <Row style={styles.spaceBetween}>
              <ThemedText type="small">{row.date}</ThemedText>
              <ThemedText type="smallBold">
                {row.value} {metricUnit(metric)}
              </ThemedText>
            </Row>
          </Card>
        ))
      )}

      <SectionTitle>AI 与同步</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          配置自己的 OpenAI 兼容或 Anthropic API。Key 只保存在本机，AI 计划必须确认后才会启用。
        </ThemedText>
        <View style={styles.buttonGap} />
        <Button variant="secondary" onPress={() => router.push('/settings/ai')}>
          打开 AI 设置
        </Button>
        {Platform.OS === 'ios' ? (
          <>
            <View style={styles.buttonGap} />
            <Button variant="secondary" onPress={() => router.push('/settings/apple' as never)}>
              Apple Watch、健康与系统功能
            </Button>
            <View style={styles.buttonGap} />
            <Button variant="secondary" onPress={() => router.push('/settings/webdav' as never)}>
              WebDAV 同步设置
            </Button>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
              Apple 健康同步由你主动授权；WebDAV 密码只保存在系统安全存储中。
            </ThemedText>
          </>
        ) : null}
      </Card>
    </ScreenContainer>
  );
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function bmiLabel(value: number): string {
  if (value < 18.5) return '偏低';
  if (value < 25) return '正常范围';
  if (value < 30) return '偏高';
  return '建议关注';
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function metricLabel(metric: BodyMetricKind): string {
  return BODY_METRICS.find(([key]) => key === metric)?.[1] ?? metric;
}

function metricUnit(metric: BodyMetricKind): string {
  return BODY_METRICS.find(([key]) => key === metric)?.[2] ?? '';
}

const styles = StyleSheet.create({
  innerGap: { height: Spacing.two },
  buttonGap: { height: Spacing.three },
  cardHint: { marginTop: Spacing.two },
  equipmentSelector: { marginTop: Spacing.three },
  equipmentHint: { marginBottom: Spacing.three },
  spaceBetween: { justifyContent: 'space-between' },
});
