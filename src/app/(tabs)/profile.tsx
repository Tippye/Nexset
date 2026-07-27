import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  IconButton,
  MetricCard,
  MetricGrid,
  PageHeader,
} from '@/components/dashboard-ui';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Input, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import {
  addBodyMetric,
  getMetricHistory,
  type BodyMetricKind,
} from '@/db/repositories/body-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';
import { useTheme } from '@/hooks/use-theme';
import { localDate } from '@/lib/id';
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

const EQUIPMENT = [
  ['barbell', '杠铃'],
  ['dumbbell', '哑铃'],
  ['machine', '固定器械'],
  ['cable', '绳索'],
  ['kettlebell', '壶铃'],
  ['cardio_machine', '有氧器械'],
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
  const [equipment, setEquipment] = useState<string[]>(profile?.equipment ?? []);
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
    const next: UserProfile = {
      sex,
      birthYear: optionalNumber(birthYear),
      heightCm: optionalNumber(heightCm),
      weightKg: optionalNumber(weightKg),
      goal,
      experience,
      daysPerWeek,
      sessionMinutes,
      equipment,
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

      <SectionTitle>可用器械</SectionTitle>
      <Card>
        <ChipRow>
          {EQUIPMENT.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={equipment.includes(key)}
              onPress={() => setEquipment(toggle(equipment, key))}
            />
          ))}
          <Chip
            label="徒手"
            selected={equipment.length === 0}
            onPress={() => setEquipment([])}
          />
        </ChipRow>
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
        <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
          WebDAV 同步和数据导出将在后续阶段接入；本地训练记录不依赖 AI 服务。
        </ThemedText>
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
  spaceBetween: { justifyContent: 'space-between' },
});
