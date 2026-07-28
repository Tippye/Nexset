import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { loadAIConfig } from '@/ai/config';
import {
  generateInteractivePlanTurn,
  generateTraditionalPlanProposal,
  recordPlanDecision,
  type GeneratedPlanProposal,
  type PlanClarificationTurn,
} from '@/ai/agents/plan-generation';
import type { AIConfig } from '@/ai/types';
import { getDefaultIntelligenceStatus } from '@/intelligence/default-router';
import type { IntelligenceStatus } from '@/intelligence/types';
import { IconButton, PageHeader, StatusBadge } from '@/components/dashboard-ui';
import { PlanClarificationCard } from '@/components/plan-clarification-card';
import { ScreenContainer } from '@/components/screen-container';
import { CoachChatPanel } from '@/components/coach-chat-panel';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { forbiddenExerciseIds } from '@/data/exercises';
import { getDb } from '@/db/client';
import { listExercises } from '@/db/repositories/exercise-repo';
import {
  activatePlan,
  createPlan,
  type PlanExerciseInput,
  type PlanInput,
} from '@/db/repositories/plan-repo';
import { useTheme } from '@/hooks/use-theme';
import { computeBaseline, proteinFoodExample } from '@/lib/nutrition';
import { getMissingTraditionalPlanRequirements } from '@/lib/plan-profile-requirements';
import { validatePlanInput } from '@/lib/plan-validators';
import { useAppStore } from '@/store/app-store';

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

export default function CoachScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const activePlan = useAppStore((state) => state.activePlan);
  const refreshPlan = useAppStore((state) => state.refreshPlan);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [intelligenceStatus, setIntelligenceStatus] = useState<IntelligenceStatus | null>(null);
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<GeneratedPlanProposal | null>(null);
  const [draft, setDraft] = useState<PlanInput | null>(null);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [streamed, setStreamed] = useState('');
  const [editing, setEditing] = useState(false);
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [generationMode, setGenerationMode] = useState<'traditional' | 'ai'>();
  const [clarificationHistory, setClarificationHistory] = useState<PlanClarificationTurn[]>([]);
  const [clarificationQuestion, setClarificationQuestion] = useState('');
  const [clarificationAnswer, setClarificationAnswer] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadAIConfig().then(async (nextConfig) => {
        const nextStatus = await getDefaultIntelligenceStatus(nextConfig, 'plan_generation');
        if (!alive) return;
        setConfig(nextConfig);
        setIntelligenceStatus(nextStatus);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  useEffect(() => {
    void listExercises(getDb()).then((rows) =>
      setExerciseNames(new Map(rows.map((exercise) => [exercise.id, exercise.nameZh]))),
    );
  }, []);

  async function clearCurrentProposal() {
    if (proposal?.logId) await recordPlanDecision(proposal.logId, 'reject');
    setProposal(null);
    setDraft(null);
    setEditing(false);
    setManuallyEdited(false);
  }

  async function generateTraditional() {
    if (busy) return;
    const missing = getMissingTraditionalPlanRequirements(profile ?? {});
    if (missing.length) {
      Alert.alert(
        '还缺少必要信息',
        `传统生成需要先补充：${missing.map((item) => item.label).join('、')}。你也可以直接选择 AI 生成，让 AI 根据现有资料继续追问。`,
      );
      return;
    }

    await clearCurrentProposal();
    setBusy(true);
    setGenerationMode('traditional');
    setClarificationHistory([]);
    setClarificationQuestion('');
    setClarificationAnswer('');
    setStreamed('');
    setStatus('正在根据完整资料生成本地计划…');
    try {
      const next = await generateTraditionalPlanProposal();
      setProposal(next);
      setDraft(next.plan);
    } catch (error) {
      Alert.alert(
        '传统生成失败',
        error instanceof Error ? error.message : '暂时无法生成本地计划',
      );
    } finally {
      setStatus('');
      setBusy(false);
      setGenerationMode(undefined);
    }
  }

  async function runInteractiveTurn(
    history: PlanClarificationTurn[],
    clearProposal: boolean,
  ): Promise<boolean> {
    if (busy) return false;
    if (clearProposal) await clearCurrentProposal();
    setBusy(true);
    setGenerationMode('ai');
    setStreamed('');
    setStatus('正在整理已填写信息…');
    try {
      const result = await generateInteractivePlanTurn(config, {
        userRequest: request,
        history,
        onProgress: setStatus,
        onText: (delta) => setStreamed((current) => current + delta),
      });
      if (result.kind === 'question') {
        setClarificationQuestion(result.question);
        setClarificationAnswer('');
      } else {
        setProposal(result.proposal);
        setDraft(result.proposal.plan);
        setClarificationQuestion('');
        setClarificationAnswer('');
      }
      return true;
    } catch (error) {
      Alert.alert(
        'AI 生成失败',
        error instanceof Error ? error.message : '暂时无法连接 AI 服务',
      );
      return false;
    } finally {
      setStatus('');
      setBusy(false);
      setGenerationMode(undefined);
    }
  }

  async function startInteractiveGeneration() {
    if (intelligenceStatus && !intelligenceStatus.available) {
      Alert.alert(
        'AI 暂不可用',
        intelligenceStatus.reason ?? '请先在 AI 设置中配置可用模型。',
      );
      return;
    }
    setClarificationHistory([]);
    setClarificationQuestion('');
    setClarificationAnswer('');
    await runInteractiveTurn([], true);
  }

  async function submitClarificationAnswer() {
    const answer = clarificationAnswer.trim();
    if (!clarificationQuestion || !answer || busy) return;
    const previousHistory = clarificationHistory;
    const previousQuestion = clarificationQuestion;
    const nextHistory = [
      ...previousHistory,
      { question: previousQuestion, answer },
    ];
    setClarificationHistory(nextHistory);
    setClarificationQuestion('');
    setClarificationAnswer('');
    const accepted = await runInteractiveTurn(nextHistory, false);
    if (!accepted) {
      setClarificationHistory(previousHistory);
      setClarificationQuestion(previousQuestion);
      setClarificationAnswer(answer);
    }
  }

  function updateExercise(dayIndex: number, exerciseIndex: number, patch: Partial<PlanExerciseInput>) {
    setDraft((current) => {
      if (!current) return current;
      const next = clonePlan(current);
      next.days[dayIndex].exercises[exerciseIndex] = {
        ...next.days[dayIndex].exercises[exerciseIndex],
        ...patch,
      };
      return next;
    });
    setManuallyEdited(true);
  }

  async function apply() {
    if (!draft || !proposal) return;
    setBusy(true);
    try {
      const exercises = await listExercises(getDb());
      const map = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const validationProfile = proposal.resolvedProfile ?? profile ?? {};
      const checked = validatePlanInput(draft, {
        exercises: map,
        forbiddenIds: forbiddenExerciseIds(validationProfile.injuries ?? []),
        profile: validationProfile,
        tdee: computeBaseline(validationProfile).tdee,
      });
      if (!checked.ok) {
        Alert.alert('计划未通过安全校验', checked.errors.join('\n'));
        return;
      }
      if (proposal.resolvedProfile) {
        await updateProfile({
          ...proposal.resolvedProfile,
          incomplete:
            getMissingTraditionalPlanRequirements(proposal.resolvedProfile).length > 0,
        });
      }
      const planId = await createPlan(getDb(), checked.plan);
      await activatePlan(getDb(), planId);
      await refreshPlan();
      await recordPlanDecision(proposal.logId, manuallyEdited ? 'partial' : 'accept');
      setProposal(null);
      setDraft(null);
      setEditing(false);
      setClarificationHistory([]);
      setClarificationQuestion('');
      setClarificationAnswer('');
      Alert.alert('新计划已启用', '原计划已归档，今天页会按新计划展示。');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    await recordPlanDecision(proposal?.logId, 'reject');
    setProposal(null);
    setDraft(null);
    setEditing(false);
    setClarificationHistory([]);
    setClarificationQuestion('');
    setClarificationAnswer('');
  }

  const configured = intelligenceStatus?.available ?? false;
  const providerLabel = intelligenceStatus?.providerName ?? 'AI 未配置';

  return (
    <ScreenContainer>
      <PageHeader
        eyebrow="Nex AI"
        title="教练"
        subtitle="生成、讨论、确认，再让计划发生变化"
        action={
          <IconButton
            icon="settings-outline"
            label="AI 设置"
            onPress={() => router.push('/settings/ai')}
          />
        }
      />

      <Card>
        <Row style={styles.aiStatusRow}>
          <View
            style={[
              styles.aiIcon,
              { backgroundColor: configured ? `${theme.chart4}18` : `${theme.warning}18` },
            ]}>
          <Ionicons
            name={configured ? 'sparkles' : 'shield-checkmark-outline'}
            size={22}
              color={configured ? theme.chart4 : theme.warning}
          />
          </View>
          <View style={styles.flex}>
            <Row style={styles.aiTitleRow}>
              <ThemedText type="smallBold" style={styles.flex}>
                {configured
                  ? `${providerLabel}${intelligenceStatus?.model ? ` · ${intelligenceStatus.model}` : ''}`
                  : '本地安全模板'}
              </ThemedText>
              <StatusBadge tone={configured ? 'purple' : 'amber'}>
                {configured ? 'AI 在线' : '本地模式'}
              </StatusBadge>
            </Row>
            <ThemedText type="small" themeColor="textSecondary">
                {configured
                  ? intelligenceStatus?.providerId === 'apple-foundation-models'
                    ? '优先在设备端生成；资料不足时会逐项追问，最终结果仍由本地安全校验兜底。'
                    : '使用自定义云端模型；资料不足时会逐项追问，不会静默切换为传统模板。'
                  : '传统本地生成始终可用；如需交互式 AI 生成，请先配置可用模型。'}
            </ThemedText>
          </View>
        </Row>
      </Card>

      {activePlan ? (
        <>
          <SectionTitle>当前计划</SectionTitle>
          <Card>
            <ThemedText type="smallBold">{activePlan.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              每周 {activePlan.daysPerWeek} 天 · {activePlan.durationWeeks} 周 ·
              {activePlan.source === 'ai' ? ' AI 生成' : ' 本地模板'}
            </ThemedText>
          </Card>
        </>
      ) : null}

      <SectionTitle>你希望这份计划侧重什么？</SectionTitle>
      <Input
        value={request}
        onChangeText={setRequest}
        placeholder="可选，例如：想重点提升引体向上，周三只能练 45 分钟"
        multiline
        maxLength={2000}
        style={styles.request}
      />

      {clarificationQuestion ? (
        <PlanClarificationCard
          question={clarificationQuestion}
          answer={clarificationAnswer}
          onAnswerChange={setClarificationAnswer}
          onSubmit={() => void submitClarificationAnswer()}
          busy={busy}
        />
      ) : null}

      <Row style={styles.generationButtons}>
        <Button
          variant="secondary"
          onPress={() => void generateTraditional()}
          disabled={busy}
          loading={busy && generationMode === 'traditional'}
          style={styles.generationButton}>
          传统生成
        </Button>
        <Button
          onPress={() => void startInteractiveGeneration()}
          disabled={busy}
          loading={busy && generationMode === 'ai'}
          style={styles.generationButton}>
          AI 生成
        </Button>
      </Row>

      {busy ? (
        <Card style={styles.progressCard}>
          <Row>
            <Ionicons
              name={generationMode === 'ai' ? 'sparkles' : 'shield-checkmark-outline'}
              size={20}
              color={theme.accent}
            />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{status || '正在生成计划…'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                正在核对动作 ID、伤病禁忌、起始重量与营养范围。
              </ThemedText>
            </View>
          </Row>
          {generationMode === 'ai' && streamed.trim() ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.stream}>
              {streamed.slice(-300)}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      {proposal && draft ? (
        <PlanProposalCard
          proposal={proposal}
          draft={draft}
          exerciseNames={exerciseNames}
          editing={editing}
          busy={busy}
          onToggleEditing={() => setEditing((value) => !value)}
          onUpdateExercise={updateExercise}
          onApply={apply}
          onRegenerate={
            proposal.source === 'ai' ? startInteractiveGeneration : generateTraditional
          }
          onReject={reject}
        />
      ) : null}

      {!proposal && !busy ? <CoachChatPanel onPlanRequest={setRequest} /> : null}
    </ScreenContainer>
  );
}

function PlanProposalCard({
  proposal,
  draft,
  exerciseNames,
  editing,
  busy,
  onToggleEditing,
  onUpdateExercise,
  onApply,
  onRegenerate,
  onReject,
}: {
  proposal: GeneratedPlanProposal;
  draft: PlanInput;
  exerciseNames: Map<string, string>;
  editing: boolean;
  busy: boolean;
  onToggleEditing: () => void;
  onUpdateExercise: (
    dayIndex: number,
    exerciseIndex: number,
    patch: Partial<PlanExerciseInput>,
  ) => void;
  onApply: () => void;
  onRegenerate: () => void;
  onReject: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.proposal}>
      <SectionTitle>待确认计划</SectionTitle>
      {proposal.fallbackReason ? (
        <Card style={{ borderColor: theme.warning, borderWidth: 1 }}>
          <ThemedText type="small" style={{ color: theme.warning }}>
            {proposal.fallbackReason}
          </ThemedText>
        </Card>
      ) : null}
      <Card>
        <Row style={styles.spaceBetween}>
          <View style={styles.flex}>
            <ThemedText style={styles.planName}>{draft.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              每周 {draft.daysPerWeek} 天 · {draft.durationWeeks} 周 ·
              {draft.progressionRule === 'linear'
                ? ' 线性递进'
                : draft.progressionRule === 'double_progression'
                  ? ' 双重递进'
                  : ' RPE 自调'}
            </ThemedText>
          </View>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              {proposalProviderLabel(proposal)}
            </ThemedText>
          </View>
        </Row>
        {draft.nutrition ? (
          <View style={styles.nutrition}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {draft.nutrition.dailyKcal} kcal · 蛋白 {draft.nutrition.proteinG}g · 碳水{' '}
              {draft.nutrition.carbG}g · 脂肪 {draft.nutrition.fatG}g
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {draft.nutrition.rationale}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {proteinFoodExample(draft.nutrition.proteinG)}
            </ThemedText>
          </View>
        ) : null}
      </Card>

      {draft.days.map((day, dayIndex) => (
        <Card key={`${day.dayOfWeek}-${day.label}`}>
          <ThemedText type="smallBold">
            周{DAY_NAMES[day.dayOfWeek - 1]} · {day.label}
          </ThemedText>
          {day.exercises.map((exercise, exerciseIndex) =>
            editing ? (
              <View
                key={`${exercise.exerciseId}-${exerciseIndex}`}
                style={[styles.editRow, { borderTopColor: theme.border }]}>
                <ThemedText type="smallBold">
                  {exerciseNames.get(exercise.exerciseId) ?? exercise.exerciseId}
                </ThemedText>
                <Row style={styles.editInputs}>
                  <LabeledInput
                    label="组"
                    value={String(exercise.sets)}
                    onChange={(value) => {
                      const number = Number(value);
                      if (Number.isInteger(number) && number >= 1 && number <= 10) {
                        onUpdateExercise(dayIndex, exerciseIndex, { sets: number });
                      }
                    }}
                  />
                  <LabeledInput
                    label="次数"
                    value={exercise.reps}
                    text
                    onChange={(value) =>
                      onUpdateExercise(dayIndex, exerciseIndex, { reps: value.slice(0, 20) })
                    }
                  />
                  <LabeledInput
                    label="kg"
                    value={exercise.weightKg == null ? '' : String(exercise.weightKg)}
                    onChange={(value) => {
                      if (!value.trim()) {
                        onUpdateExercise(dayIndex, exerciseIndex, { weightKg: null });
                        return;
                      }
                      const number = Number(value);
                      if (Number.isFinite(number) && number >= 0 && number <= 500) {
                        onUpdateExercise(dayIndex, exerciseIndex, { weightKg: number });
                      }
                    }}
                  />
                </Row>
              </View>
            ) : (
              <Row key={`${exercise.exerciseId}-${exerciseIndex}`} style={styles.exerciseRow}>
                <ThemedText type="small" style={styles.flex}>
                  {exerciseNames.get(exercise.exerciseId) ?? exercise.exerciseId}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {exercise.sets}组 × {exercise.reps}
                  {exercise.weightKg != null ? ` @ ${exercise.weightKg}kg` : ''}
                </ThemedText>
              </Row>
            ),
          )}
          {day.cardio ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardio}>
              有氧：{exerciseNames.get(day.cardio.type) ?? day.cardio.type}{' '}
              {day.cardio.durationMin} 分钟 · {intensityLabel(day.cardio.intensity)}
            </ThemedText>
          ) : null}
        </Card>
      ))}

      {proposal.warnings.length ? (
        <Card>
          <ThemedText type="smallBold" style={{ color: theme.warning }}>
            本地校验提示
          </ThemedText>
          {proposal.warnings.map((warning) => (
            <ThemedText key={warning} type="small" themeColor="textSecondary">
              · {warning}
            </ThemedText>
          ))}
        </Card>
      ) : null}

      {draft.explanation ? (
        <Card>
          <ThemedText type="smallBold">Nex 的计划解读</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.explanation}>
            {draft.explanation}
          </ThemedText>
        </Card>
      ) : null}

      <Button variant="secondary" onPress={onToggleEditing}>
        {editing ? '完成逐项修改' : '逐项修改组数、次数和重量'}
      </Button>
      <View style={styles.buttonGap} />
      <Button onPress={onApply} loading={busy}>
        确认并启用计划
      </Button>
      <Row style={styles.secondaryActions}>
        <Button variant="ghost" compact onPress={onRegenerate} disabled={busy}>
          再改改
        </Button>
        <Button variant="ghost" compact onPress={onReject} disabled={busy}>
          放弃草案
        </Button>
      </Row>
      <ThemedText type="small" themeColor="textSecondary" style={styles.confirmHint}>
        点击确认前，这份草案不会写入数据库，也不会影响当前计划。
      </ThemedText>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  text,
  onChange,
}: {
  label: string;
  value: string;
  text?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.labeledInput}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Input
        value={value}
        onChangeText={onChange}
        keyboardType={text ? 'default' : 'decimal-pad'}
        style={styles.compactInput}
      />
    </View>
  );
}

function clonePlan(plan: PlanInput): PlanInput {
  return JSON.parse(JSON.stringify(plan)) as PlanInput;
}

function intensityLabel(intensity: string): string {
  return intensity === 'high' ? '高强度' : intensity === 'moderate' ? '中等强度' : '低强度';
}

function proposalProviderLabel(proposal: GeneratedPlanProposal): string {
  if (proposal.providerId === 'apple-foundation-models') return 'Apple 设备端草案';
  if (proposal.providerId === 'custom-cloud') return '自定义 LLM 草案';
  return '本地模板';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  aiStatusRow: { alignItems: 'flex-start' },
  aiIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTitleRow: { justifyContent: 'space-between', alignItems: 'flex-start' },
  request: { minHeight: 88, textAlignVertical: 'top' },
  buttonGap: { height: Spacing.two },
  generationButtons: {
    alignItems: 'stretch',
    marginTop: Spacing.three,
  },
  generationButton: { flex: 1 },
  progressCard: { marginTop: Spacing.three },
  stream: { marginTop: Spacing.two },
  proposal: { marginTop: Spacing.two },
  planName: { fontWeight: '700' },
  spaceBetween: { justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  nutrition: { marginTop: Spacing.three, gap: 3 },
  exerciseRow: { justifyContent: 'space-between', marginTop: 7, alignItems: 'flex-start' },
  cardio: { marginTop: Spacing.two },
  editRow: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.two },
  editInputs: { marginTop: Spacing.one, alignItems: 'flex-end' },
  labeledInput: { flex: 1, gap: 3 },
  compactInput: { paddingVertical: 8, fontSize: 14 },
  explanation: { marginTop: Spacing.one, lineHeight: 20 },
  secondaryActions: { justifyContent: 'space-between', marginTop: Spacing.two },
  confirmHint: { textAlign: 'center', marginTop: Spacing.one },
});
