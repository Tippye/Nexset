import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { generatePlanProposal, recordPlanDecision } from '@/ai/agents/plan-generation';
import { loadAIConfig } from '@/ai/config';
import { EquipmentSelector } from '@/components/equipment-selector';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Input, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import {
  DEFAULT_GYM_EQUIPMENT_IDS,
  DEFAULT_HOME_EQUIPMENT_IDS,
  equipmentTypesForSelection,
  type GymEquipmentId,
  type TrainingLocation,
} from '@/data/gym-equipment';
import { getDb } from '@/db/client';
import { getExercisesByIds } from '@/db/repositories/exercise-repo';
import { activatePlan, createPlan } from '@/db/repositories/plan-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';
import { useTheme } from '@/hooks/use-theme';
import type { PlanValidationResult } from '@/lib/plan-validators';
import { useAppStore } from '@/store/app-store';

const GOALS = [
  ['hypertrophy', '增肌'],
  ['fat_loss', '减脂'],
  ['strength', '力量'],
  ['endurance', '耐力'],
  ['toning', '塑形'],
] as const;

const EXPERIENCE = [
  ['novice', '新手（<1年）'],
  ['intermediate', '进阶（1-3年）'],
  ['advanced', '高级（3年+）'],
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

export default function OnboardingScreen() {
  const theme = useTheme();
  const { updateProfile, completeOnboarding, refreshPlan } = useAppStore();

  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<UserProfile['sex']>();
  const [birthYear, setBirthYear] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [goal, setGoal] = useState<UserProfile['goal']>();
  const [experience, setExperience] = useState<UserProfile['experience']>();
  const [daysPerWeek, setDaysPerWeek] = useState<number>();
  const [sessionMinutes, setSessionMinutes] = useState<number>();
  const [trainingLocation, setTrainingLocation] = useState<TrainingLocation>();
  const [gymEquipmentIds, setGymEquipmentIds] = useState<GymEquipmentId[]>([]);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [preview, setPreview] = useState<PlanValidationResult | null>(null);
  const [previewLogId, setPreviewLogId] = useState<string>();
  const [generationNotice, setGenerationNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const totalSteps = 5;

  const profile = useMemo<UserProfile>(() => {
    return {
      sex,
      birthYear: birthYear ? Number(birthYear) : undefined,
      heightCm: heightCm ? Number(heightCm) : undefined,
      weightKg: weightKg ? Number(weightKg) : undefined,
      goal,
      experience,
      daysPerWeek,
      sessionMinutes,
      equipment: trainingLocation
        ? equipmentTypesForSelection(gymEquipmentIds, trainingLocation)
        : undefined,
      trainingLocation,
      gymEquipmentIds:
        trainingLocation === 'bodyweight' ? [] : trainingLocation ? gymEquipmentIds : undefined,
      injuries,
      incomplete: !sex || !weightKg || !goal || !experience || !daysPerWeek,
    };
  }, [
    sex,
    birthYear,
    heightCm,
    weightKg,
    goal,
    experience,
    daysPerWeek,
    sessionMinutes,
    trainingLocation,
    gymEquipmentIds,
    injuries,
  ]);

  function chooseTrainingLocation(location: TrainingLocation) {
    setTrainingLocation(location);
    if (location === 'gym' && gymEquipmentIds.length === 0) {
      setGymEquipmentIds([...DEFAULT_GYM_EQUIPMENT_IDS]);
    }
    if (location === 'home' && gymEquipmentIds.length === 0) {
      setGymEquipmentIds([...DEFAULT_HOME_EQUIPMENT_IDS]);
    }
  }

  async function buildPreview() {
    setBusy(true);
    try {
      await updateProfile(profile);
      const generated = await generatePlanProposal(await loadAIConfig());
      setPreview({
        ok: true,
        errors: [],
        warnings: generated.warnings,
        plan: generated.plan,
      });
      setPreviewLogId(generated.logId);
      setGenerationNotice(
        generated.fallbackReason ??
          'AI 草案已通过动作、伤病、起始重量与营养范围四道本地校验。',
      );
      setStep(totalSteps);
    } finally {
      setBusy(false);
    }
  }

  async function applyPlan() {
    if (!preview) return;
    setBusy(true);
    try {
      const db = getDb();
      const planId = await createPlan(db, preview.plan);
      await activatePlan(db, planId);
      await recordPlanDecision(previewLogId, 'accept');
      await refreshPlan();
      await completeOnboarding();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  async function skipAll() {
    await recordPlanDecision(previewLogId, 'reject');
    await updateProfile({ ...profile, incomplete: true });
    await completeOnboarding();
    router.replace('/');
  }

  async function returnToEdit() {
    await recordPlanDecision(previewLogId, 'reject');
    setPreview(null);
    setPreviewLogId(undefined);
    setGenerationNotice('');
    setStep(4);
  }

  return (
    <ScreenContainer>
      <ThemedText type="subtitle">
        {step < totalSteps ? '让 Nexset 认识你' : '你的计划草案'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.stepHint}>
        {step < totalSteps ? `第 ${step + 1} / ${totalSteps} 步 · 数据只存在你的设备上` : '确认后即可开始训练'}
      </ThemedText>

      {step === 0 && (
        <View>
          <SectionTitle>基本信息</SectionTitle>
          <ChipRow>
            <Chip label="男" selected={sex === 'male'} onPress={() => setSex('male')} />
            <Chip label="女" selected={sex === 'female'} onPress={() => setSex('female')} />
            <Chip label="其他" selected={sex === 'other'} onPress={() => setSex('other')} />
          </ChipRow>
          <SectionTitle>出生年份</SectionTitle>
          <Input value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" placeholder="如 1998" />
          <SectionTitle>身高 (cm)</SectionTitle>
          <Input value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" placeholder="如 175" />
          <SectionTitle>体重 (kg)</SectionTitle>
          <Input value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" placeholder="如 70" />
        </View>
      )}

      {step === 1 && (
        <View>
          <SectionTitle>训练目标</SectionTitle>
          <ChipRow>
            {GOALS.map(([k, label]) => (
              <Chip key={k} label={label} selected={goal === k} onPress={() => setGoal(k)} />
            ))}
          </ChipRow>
          <SectionTitle>训练经验</SectionTitle>
          <ChipRow>
            {EXPERIENCE.map(([k, label]) => (
              <Chip key={k} label={label} selected={experience === k} onPress={() => setExperience(k)} />
            ))}
          </ChipRow>
        </View>
      )}

      {step === 2 && (
        <View>
          <SectionTitle>每周训练几天</SectionTitle>
          <ChipRow>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Chip key={n} label={`${n}天`} selected={daysPerWeek === n} onPress={() => setDaysPerWeek(n)} />
            ))}
          </ChipRow>
          <SectionTitle>单次训练时长</SectionTitle>
          <ChipRow>
            {[30, 45, 60, 90, 120].map((n) => (
              <Chip key={n} label={`${n}分钟`} selected={sessionMinutes === n} onPress={() => setSessionMinutes(n)} />
            ))}
          </ChipRow>
        </View>
      )}

      {step === 3 && (
        <View>
          <SectionTitle>主要训练场地</SectionTitle>
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
                {trainingLocation === 'gym'
                  ? '选择这家健身房实际具备的器材，计划只会使用已选器材。'
                  : '选择家中已有器材，仍可随时改回徒手训练。'}
              </ThemedText>
              <EquipmentSelector
                selectedIds={gymEquipmentIds}
                onChange={setGymEquipmentIds}
              />
            </View>
          ) : null}
        </View>
      )}

      {step === 4 && (
        <View>
          <SectionTitle>是否有伤病部位（可多选，计划会避开相关动作）</SectionTitle>
          <ChipRow>
            {INJURIES.map(([k, label]) => (
              <Chip
                key={k}
                label={label}
                selected={injuries.includes(k)}
                onPress={() =>
                  setInjuries((prev) =>
                    prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
                  )
                }
              />
            ))}
          </ChipRow>
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
            提示：Nexset 不提供医疗建议，如有持续疼痛请先就医。
          </ThemedText>
        </View>
      )}

      {step === totalSteps && preview && (
        <>
          {generationNotice ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {generationNotice}
              </ThemedText>
            </Card>
          ) : null}
          <PlanPreview preview={preview} />
        </>
      )}

      <View style={styles.footer}>
        {step < totalSteps ? (
          <>
            <Button
              onPress={() => (step === totalSteps - 1 ? buildPreview() : setStep(step + 1))}
              disabled={
                step === 3 &&
                (!trainingLocation ||
                  ((trainingLocation === 'gym' || trainingLocation === 'home') &&
                    gymEquipmentIds.length === 0))
              }
              loading={busy}>
              {step === totalSteps - 1 ? '生成计划' : '下一步'}
            </Button>
            <Row style={{ justifyContent: 'space-between', marginTop: Spacing.two }}>
              {step > 0 ? (
                <Button variant="ghost" compact onPress={() => setStep(step - 1)}>
                  上一步
                </Button>
              ) : (
                <View />
              )}
              <Button variant="ghost" compact onPress={skipAll}>
                跳过引导
              </Button>
            </Row>
          </>
        ) : (
          <>
            <Button onPress={applyPlan} loading={busy}>
              启用这份计划
            </Button>
            <Row style={{ justifyContent: 'space-between', marginTop: Spacing.two }}>
              <Button variant="ghost" compact onPress={returnToEdit}>
                返回修改
              </Button>
              <Button variant="ghost" compact onPress={skipAll}>
                暂不启用
              </Button>
            </Row>
          </>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.three, color: theme.textSecondary }}>
        配置 AI 后（「我的」→ AI 设置）会优先生成个性化 AI 计划；连接或校验失败时自动使用本地安全模板。
      </ThemedText>
    </ScreenContainer>
  );
}

function PlanPreview({ preview }: { preview: PlanValidationResult }) {
  const theme = useTheme();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const plan = preview.plan;

  useMemo(() => {
    const ids = plan.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
    getExercisesByIds(getDb(), ids).then((m) => {
      setNames(new Map([...m].map(([id, ex]) => [id, ex.nameZh])));
    });
  }, [plan]);

  const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <View style={{ marginTop: Spacing.three }}>
      <Card>
        <ThemedText style={{ fontWeight: '700' }}>{plan.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          每周 {plan.daysPerWeek} 天 · {plan.durationWeeks} 周 · 渐进方式：
          {plan.progressionRule === 'linear' ? '线性加重' : plan.progressionRule === 'double_progression' ? '双重递进' : 'RPE 自调'}
        </ThemedText>
        {plan.nutrition && (
          <ThemedText type="small" style={{ marginTop: 4, color: theme.accent }}>
            营养目标 {plan.nutrition.dailyKcal}kcal · 蛋白 {plan.nutrition.proteinG}g
          </ThemedText>
        )}
      </Card>
      {plan.days.map((d) => (
        <Card key={`${d.dayOfWeek}-${d.label}`}>
          <ThemedText type="smallBold">
            周{DAY_NAMES[d.dayOfWeek - 1]} · {d.label}
          </ThemedText>
          {d.exercises.map((e, i) => (
            <ThemedText key={i} type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
              {names.get(e.exerciseId) ?? e.exerciseId} {e.sets}组×{e.reps}
              {e.weightKg != null ? ` @${e.weightKg}kg` : ''}
            </ThemedText>
          ))}
          {d.cardio && (
            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
              有氧：{d.cardio.type} {d.cardio.durationMin}min
            </ThemedText>
          )}
        </Card>
      ))}
      {plan.explanation ? (
        <ThemedText type="small" themeColor="textSecondary">
          {plan.explanation}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stepHint: { marginTop: 4, marginBottom: Spacing.two },
  footer: { marginTop: Spacing.four },
  equipmentSelector: { marginTop: Spacing.three },
  equipmentHint: { marginBottom: Spacing.three },
});
