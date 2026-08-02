import type { AIComplete, AIConfig } from '@/ai/types';
import { runAgent, type AgentDefinition, type OutputValidation } from '@/ai/runtime';
import { forbiddenExerciseIds } from '@/data/exercises';
import { getDb } from '@/db/client';
import {
  createAgentLog,
  type AgentUserDecision,
  updateAgentDecision,
} from '@/db/repositories/agent-log-repo';
import { listExercises, type Exercise } from '@/db/repositories/exercise-repo';
import type { PlanInput } from '@/db/repositories/plan-repo';
import { getProfile, type UserProfile } from '@/db/repositories/profile-repo';
import { getMetricHistory } from '@/db/repositories/body-repo';
import { getRecentSessions, getSessionSets } from '@/db/repositories/workout-repo';
import { computeBaseline } from '@/lib/nutrition';
import { isExerciseSupportedByProfile } from '@/lib/equipment-availability';
import {
  EQUIPMENT_TYPES,
  EXPERIENCE_VALUES,
  GOAL_VALUES,
  INJURY_TAGS,
  resolveConversationProfile,
  SEX_VALUES,
  TRAINING_LOCATION_VALUES,
} from '@/lib/plan-conversation-profile';
import {
  AI_PLAN_JSON_SCHEMA,
  AiPlanSchema,
  toPlanInput,
  type AiPlan,
} from '@/lib/plan-schema';
import { generateTemplatePlan } from '@/lib/plan-templates';
import { validatePlanInput } from '@/lib/plan-validators';
import {
  createDefaultIntelligenceRouter,
  defaultIntelligencePolicy,
} from '@/intelligence/default-router';
import { loadLocalModelConfig } from '@/intelligence/local-model-config';
import { estimateCostUsdMicros, executionWasDegraded } from '@/intelligence/metrics';
import { IntelligenceRoutingError, type IntelligenceRouter } from '@/intelligence/router';
import type {
  IntelligenceProviderSession,
  IntelligenceRouteAttempt,
  IntelligenceRouteMode,
} from '@/intelligence/types';

export const PLAN_AGENT_PROMPT_VERSION = 'plan-generation-v1';
export const PLAN_CONVERSATION_PROMPT_VERSION = 'plan-generation-conversation-v1';

export type GeneratedPlanProposal = {
  plan: PlanInput;
  warnings: string[];
  source: 'ai' | 'template';
  providerId: string;
  model?: string;
  routeReason?: string;
  logId?: string;
  fallbackReason?: string;
  resolvedProfile?: UserProfile;
};

export type PlanClarificationTurn = {
  question: string;
  answer: string;
};

export type InteractivePlanGenerationResult =
  | {
      kind: 'question';
      question: string;
      providerId: string;
      model?: string;
      routeReason?: string;
    }
  | {
      kind: 'plan';
      proposal: GeneratedPlanProposal;
    };

type PlanAgentConversationOutput =
  | { kind: 'question'; question: string }
  | { kind: 'plan'; plan: AiPlan; resolvedProfile: UserProfile };

type PlanGenerationContext = {
  db: ReturnType<typeof getDb>;
  profile: UserProfile;
  exercises: Exercise[];
  exerciseMap: Map<string, Exercise>;
  forbidden: Set<string>;
  available: Exercise[];
  trainingSummary: Awaited<ReturnType<typeof buildTrainingSummary>>;
  baseline: ReturnType<typeof computeBaseline>;
};

export async function generatePlanProposal(
  config: AIConfig | null,
  options: {
    userRequest?: string;
    complete?: AIComplete;
    router?: IntelligenceRouter;
    onText?: (delta: string) => void;
    onProgress?: (message: string) => void;
  } = {},
): Promise<GeneratedPlanProposal> {
  const startedAt = Date.now();
  const context = await preparePlanGenerationContext();
  const { db, profile, exerciseMap, forbidden, available, trainingSummary, baseline } = context;

  const definition = buildDefinition({
    profile,
    available,
    trainingSummary,
    baseline,
    exerciseMap,
    forbidden,
  });
  const request = options.userRequest?.trim() || '请根据我的档案生成一份新的完整训练计划。';
  const state = {
    user_request: request,
    user_profile: profile,
    recent_training_summary: trainingSummary,
    nutrition_baseline: baseline,
    exercise_library_summary: available.map(compactExercise),
  };
  const policy = defaultIntelligencePolicy('plan_generation');
  const localModelConfig = options.router ? null : await loadLocalModelConfig();
  const router =
    options.router ??
    createDefaultIntelligenceRouter(config, {
      cloudComplete: options.complete,
      localModelConfig,
    });
  let completedAttempts: IntelligenceRouteAttempt[] = [];

  try {
    const routed = await router.execute(policy, (provider) =>
      runAgent(
        provider,
        definition,
        `以下是本次任务的可信本地状态。工具返回与这里的信息冲突时，以工具返回为准：\n${JSON.stringify(state)}`,
        {
          onText: options.onText,
          onProgress: options.onProgress,
        },
      ),
    );
    completedAttempts = routed.attempts;
    const result = routed.result;
    const hard = validateAiPlan(result.data, profile, exerciseMap, forbidden, baseline.tdee);
    if (!hard.success) throw new Error(hard.errors.join('；'));
    const validated = validatePlanInput(toPlanInput(result.data, 'ai'), {
      exercises: exerciseMap,
      forbiddenIds: forbidden,
      profile,
      tdee: baseline.tdee,
    });
    const logId = await createAgentLog(db, {
      agent: 'PlanGenerationAgent',
      promptVersion: PLAN_AGENT_PROMPT_VERSION,
      inputSummary: JSON.stringify({
        goal: profile.goal,
        daysPerWeek: profile.daysPerWeek,
        equipment: profile.equipment,
        gymEquipmentIds: profile.gymEquipmentIds,
        injuries: profile.injuries,
        request,
      }),
      output: result.raw,
      validationResult: result.validationRetries ? 'retry_pass' : 'pass',
      latencyMs: result.latencyMs,
      providerId: routed.provider.id,
      providerKind: routed.provider.kind,
      model: routed.provider.model,
      routeReason: routed.routeReason,
      routeMode: routed.routeMode,
      fallbackHistory: routed.attempts,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      toolRounds: result.rounds,
      privacyClass: policy.privacyClass,
      estimatedCostUsdMicros: estimateCostUsdMicros(result.usage, routed.provider.pricing),
      degraded: executionWasDegraded(routed),
    });
    return {
      plan: validated.plan,
      warnings: validated.warnings,
      source: 'ai',
      providerId: routed.provider.id,
      model: routed.provider.model,
      routeReason: routed.routeReason,
      logId,
    };
  } catch (error) {
    const reason = humanizeGenerationError(error);
    const attempts =
      error instanceof IntelligenceRoutingError ? error.attempts : completedAttempts;
    const fallback = templateFallback(
      profile,
      exerciseMap,
      forbidden,
      `AI 计划未能通过完整校验（${reason}），已安全降级为本地模板。`,
    );
    const logId = await createAgentLog(db, {
      agent: 'PlanGenerationAgent',
      promptVersion: PLAN_AGENT_PROMPT_VERSION,
      inputSummary: JSON.stringify({
        goal: profile.goal,
        daysPerWeek: profile.daysPerWeek,
        request,
      }),
      output: { error: reason },
      validationResult: 'pass',
      latencyMs: Date.now() - startedAt,
      providerId: 'local-template',
      providerKind: 'template',
      model: 'deterministic-plan-template-v1',
      routeMode: 'template',
      degraded: true,
      routeReason: '所有模型 Provider 均不可用或执行失败，回退本地模板',
      fallbackHistory: attempts,
      privacyClass: policy.privacyClass,
    });
    return { ...fallback, logId };
  }
}

export async function generateTraditionalPlanProposal(): Promise<GeneratedPlanProposal> {
  const started = Date.now();
  const { profile, exerciseMap, forbidden } = await preparePlanGenerationContext();
  const generated = generateTemplatePlan(profile, exerciseMap, forbidden);
  if (!generated.ok) {
    throw new Error(generated.errors.join('；') || '本地模板未能生成可用计划');
  }
  const logId = await createAgentLog(getDb(), {
    agent: 'PlanGenerationAgent',
    promptVersion: PLAN_AGENT_PROMPT_VERSION,
    validationResult: 'pass',
    latencyMs: Date.now() - started,
    providerId: 'local-template',
    providerKind: 'template',
    model: 'deterministic-plan-template-v1',
    routeReason: '用户选择传统本地生成',
    routeMode: 'template',
  });
  return {
    plan: generated.plan,
    warnings: generated.warnings,
    source: 'template',
    providerId: 'local-template',
    routeReason: '用户选择传统本地生成',
    logId,
  };
}

export async function generateInteractivePlanTurn(
  config: AIConfig | null,
  options: {
    userRequest?: string;
    history?: PlanClarificationTurn[];
    complete?: AIComplete;
    router?: IntelligenceRouter;
    onText?: (delta: string) => void;
    onProgress?: (message: string) => void;
  } = {},
): Promise<InteractivePlanGenerationResult> {
  const context = await preparePlanGenerationContext();
  const { db, profile, exerciseMap, available, trainingSummary, baseline } = context;
  const definition = buildConversationDefinition(context);
  const request =
    options.userRequest?.trim() || '请结合我已填写的资料，制定一份安全、可执行的训练计划。';
  const history = (options.history ?? []).map((turn) => ({
    question: turn.question.trim(),
    answer: turn.answer.trim(),
  }));
  const state = {
    user_request: request,
    user_profile: profile,
    recent_training_summary: trainingSummary,
    nutrition_baseline: baseline,
    exercise_library_summary: available.map(compactExercise),
    clarification_history: history,
  };
  const policy = defaultIntelligencePolicy('plan_generation');
  const localModelConfig = options.router ? null : await loadLocalModelConfig();
  const router =
    options.router ??
    createDefaultIntelligenceRouter(config, {
      cloudComplete: options.complete,
      localModelConfig,
    });
  let completedAttempts: IntelligenceRouteAttempt[] = [];
  let completedProvider: IntelligenceProviderSession | undefined;
  let completedRouteMode: IntelligenceRouteMode = 'single';

  try {
    const routed = await router.execute(policy, (provider) =>
      runAgent(
        provider,
        definition,
        `以下是本次任务的可信本地状态。用户未填写的字段代表未知，不要当作否定回答。工具返回与这里的信息冲突时，以工具返回为准：\n${JSON.stringify(state)}`,
        {
          onText: options.onText,
          onProgress: options.onProgress,
        },
      ),
    );
    completedAttempts = routed.attempts;
    completedProvider = routed.provider;
    completedRouteMode = routed.routeMode;
    const result = routed.result;
    if (result.data.kind === 'question') {
      return {
        kind: 'question',
        question: result.data.question,
        providerId: routed.provider.id,
        model: routed.provider.model,
        routeReason: routed.routeReason,
      };
    }

    const resolvedProfile = result.data.resolvedProfile;
    const resolvedForbidden = forbiddenExerciseIds(resolvedProfile.injuries ?? []);
    const resolvedBaseline = computeBaseline(resolvedProfile);
    const validated = validatePlanInput(toPlanInput(result.data.plan, 'ai'), {
      exercises: exerciseMap,
      forbiddenIds: resolvedForbidden,
      profile: resolvedProfile,
      tdee: resolvedBaseline.tdee,
    });
    if (!validated.ok) throw new Error(validated.errors.join('；'));

    const logId = await createAgentLog(db, {
      agent: 'InteractivePlanGenerationAgent',
      promptVersion: PLAN_CONVERSATION_PROMPT_VERSION,
      inputSummary: JSON.stringify({
        goal: profile.goal,
        daysPerWeek: profile.daysPerWeek,
        equipment: profile.equipment,
        gymEquipmentIds: profile.gymEquipmentIds,
        injuries: profile.injuries,
        request,
        clarificationRounds: history.length,
      }),
      output: result.raw,
      validationResult: result.validationRetries ? 'retry_pass' : 'pass',
      latencyMs: result.latencyMs,
      providerId: routed.provider.id,
      providerKind: routed.provider.kind,
      model: routed.provider.model,
      routeReason: routed.routeReason,
      routeMode: routed.routeMode,
      fallbackHistory: routed.attempts,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      toolRounds: result.rounds,
      privacyClass: policy.privacyClass,
      estimatedCostUsdMicros: estimateCostUsdMicros(result.usage, routed.provider.pricing),
      degraded: executionWasDegraded(routed),
    });
    return {
      kind: 'plan',
      proposal: {
        plan: validated.plan,
        warnings: validated.warnings,
        source: 'ai',
        providerId: routed.provider.id,
        model: routed.provider.model,
        routeReason: routed.routeReason,
        logId,
        resolvedProfile,
      },
    };
  } catch (error) {
    const reason = humanizeGenerationError(error);
    const attempts =
      error instanceof IntelligenceRoutingError ? error.attempts : completedAttempts;
    const lastAttempt = attempts.at(-1);
    await createAgentLog(db, {
      agent: 'InteractivePlanGenerationAgent',
      promptVersion: PLAN_CONVERSATION_PROMPT_VERSION,
      inputSummary: JSON.stringify({
        goal: profile.goal,
        daysPerWeek: profile.daysPerWeek,
        request,
        clarificationRounds: history.length,
      }),
      output: { error: reason },
      validationResult: 'fail',
      providerId: completedProvider?.id ?? lastAttempt?.providerId,
      providerKind: completedProvider?.kind ?? lastAttempt?.providerKind,
      model: completedProvider?.model ?? lastAttempt?.model,
      isBadcase: true,
      routeReason: 'AI 交互式计划生成失败，不自动降级本地模板',
      routeMode:
        error instanceof IntelligenceRoutingError ? error.routeMode : completedRouteMode,
      degraded: true,
      fallbackHistory: attempts,
      privacyClass: policy.privacyClass,
    });
    throw new Error(reason);
  }
}

export async function recordPlanDecision(
  logId: string | undefined,
  decision: AgentUserDecision,
): Promise<void> {
  if (logId) await updateAgentDecision(getDb(), logId, decision);
}

function buildDefinition(context: {
  profile: UserProfile;
  available: Exercise[];
  trainingSummary: unknown;
  baseline: ReturnType<typeof computeBaseline>;
  exerciseMap: Map<string, Exercise>;
  forbidden: Set<string>;
}): AgentDefinition<AiPlan> {
  const search = async (input: unknown) => {
    const params = asSearchInput(input);
    return context.available
      .filter((exercise) => {
        if (params.muscle_group && !exercise.primaryMuscles.includes(params.muscle_group)) {
          return false;
        }
        if (params.equipment && exercise.equipment !== params.equipment) return false;
        if (params.keyword) {
          const keyword = params.keyword.toLowerCase();
          if (
            !exercise.nameZh.includes(params.keyword) &&
            !exercise.nameEn.toLowerCase().includes(keyword) &&
            !exercise.id.toLowerCase().includes(keyword)
          ) {
            return false;
          }
        }
        return true;
      })
      .slice(0, 80)
      .map(compactExercise);
  };

  return {
    name: 'PlanGenerationAgent',
    promptVersion: PLAN_AGENT_PROMPT_VERSION,
    systemPrompt: PLAN_GENERATION_SYSTEM_PROMPT,
    outputDescription: JSON.stringify(AI_PLAN_JSON_SCHEMA),
    proposalToolName: 'propose_plan',
    maxValidationRetries: 2,
    tools: [
      {
        kind: 'read',
        name: 'get_user_profile',
        description: '获取当前用户档案。',
        inputSchema: emptyObjectSchema(),
        execute: async () => context.profile,
      },
      {
        kind: 'read',
        name: 'search_exercises',
        description: '从用户器械可用且未被伤病禁忌的动作中检索。只能使用返回的 exercise_id。',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            muscle_group: { type: 'string' },
            equipment: { type: 'string' },
            keyword: { type: 'string' },
          },
        },
        execute: search,
      },
      {
        kind: 'read',
        name: 'get_training_summary',
        description: '获取近期训练频率、训练量与主要动作最佳组。',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['weeks'],
          properties: { weeks: { type: 'integer', minimum: 1, maximum: 12 } },
        },
        execute: async () => context.trainingSummary,
      },
      {
        kind: 'read',
        name: 'get_nutrition_baseline',
        description: '获取本地公式计算的 BMR、TDEE 与体重趋势。',
        inputSchema: emptyObjectSchema(),
        execute: async () => context.baseline,
      },
      {
        kind: 'propose',
        name: 'propose_plan',
        description:
          '提交完整计划草案。此工具只生成待用户确认的卡片，不会写数据库。参数必须是完整计划对象。',
        inputSchema: AI_PLAN_JSON_SCHEMA,
      },
    ],
    validateOutput: (value) =>
      validateAiPlan(
        value,
        context.profile,
        context.exerciseMap,
        context.forbidden,
        context.baseline.tdee,
      ),
  };
}

function buildConversationDefinition(
  context: PlanGenerationContext,
): AgentDefinition<PlanAgentConversationOutput> {
  const conversationContext = {
    ...context,
    available: hasExplicitEquipmentProfile(context.profile)
      ? context.available
      : context.exercises.filter((exercise) => !context.forbidden.has(exercise.id)),
  };
  const base = buildDefinition(conversationContext);
  return {
    ...base,
    name: 'InteractivePlanGenerationAgent',
    promptVersion: PLAN_CONVERSATION_PROMPT_VERSION,
    systemPrompt: PLAN_CONVERSATION_SYSTEM_PROMPT,
    outputDescription: JSON.stringify(AI_PLAN_CONVERSATION_JSON_SCHEMA),
    proposalToolName: 'respond_plan_generation',
    tools: [
      ...base.tools.filter((tool) => tool.name !== 'propose_plan'),
      {
        kind: 'propose',
        name: 'respond_plan_generation',
        description:
          '资料不足时返回一个最新问题；资料足够时返回完整计划。每轮只能选择其中一种结果。',
        inputSchema: AI_PLAN_CONVERSATION_JSON_SCHEMA,
      },
    ],
    validateOutput: (value) => validateConversationOutput(value, conversationContext),
  };
}

function validateConversationOutput(
  value: unknown,
  context: PlanGenerationContext,
): OutputValidation<PlanAgentConversationOutput> {
  if (!value || typeof value !== 'object') {
    return { success: false, errors: ['root: 必须返回对象'] };
  }
  const input = value as Record<string, unknown>;
  if (input.kind === 'question') {
    const question = typeof input.question === 'string' ? input.question.trim() : '';
    if (!question) {
      return { success: false, errors: ['question: 追问内容不能为空'] };
    }
    if (question.length > 1000) {
      return { success: false, errors: ['question: 追问内容不能超过 1000 字'] };
    }
    return { success: true, data: { kind: 'question', question } };
  }
  if (input.kind === 'plan') {
    if (!input.resolved_profile || typeof input.resolved_profile !== 'object') {
      return {
        success: false,
        errors: ['resolved_profile: 生成计划时必须整理已确认的用户信息'],
      };
    }
    const resolvedProfile = resolveConversationProfile(
      context.profile,
      input.resolved_profile,
    );
    const validated = validateAiPlan(
      input.plan,
      resolvedProfile,
      context.exerciseMap,
      forbiddenExerciseIds(resolvedProfile.injuries ?? []),
      computeBaseline(resolvedProfile).tdee,
    );
    return validated.success
      ? {
          success: true,
          data: { kind: 'plan', plan: validated.data, resolvedProfile },
        }
      : validated;
  }
  return { success: false, errors: ['kind: 必须是 question 或 plan'] };
}

function validateAiPlan(
  value: unknown,
  profile: UserProfile,
  exerciseMap: Map<string, Exercise>,
  forbidden: Set<string>,
  tdee: number,
): OutputValidation<AiPlan> {
  const parsed = AiPlanSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`,
      ),
    };
  }
  const hard = validatePlanInput(toPlanInput(parsed.data, 'ai'), {
    exercises: exerciseMap,
    forbiddenIds: forbidden,
    profile,
    tdee,
  });
  return hard.ok ? { success: true, data: parsed.data } : { success: false, errors: hard.errors };
}

async function preparePlanGenerationContext(): Promise<PlanGenerationContext> {
  const db = getDb();
  const profile = (await getProfile(db)) ?? {};
  const exercises = await listExercises(db);
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const forbidden = forbiddenExerciseIds(profile.injuries ?? []);
  const available = availableExercises(profile, exercises, forbidden);
  const trainingSummary = await buildTrainingSummary(4);
  const weightTrend = await getWeightTrend();
  const baseline = computeBaseline(profile, weightTrend);
  return {
    db,
    profile,
    exercises,
    exerciseMap,
    forbidden,
    available,
    trainingSummary,
    baseline,
  };
}

function hasExplicitEquipmentProfile(profile: UserProfile): boolean {
  return (
    profile.trainingLocation === 'bodyweight' ||
    profile.equipment !== undefined ||
    profile.gymEquipmentIds !== undefined
  );
}

function availableExercises(
  profile: UserProfile,
  exercises: Exercise[],
  forbidden: Set<string>,
): Exercise[] {
  return exercises.filter(
    (exercise) => isExerciseSupportedByProfile(profile, exercise) && !forbidden.has(exercise.id),
  );
}

function compactExercise(exercise: Exercise) {
  return {
    exercise_id: exercise.id,
    name: exercise.nameZh,
    equipment: exercise.equipment,
    primary_muscles: exercise.primaryMuscles,
    counting_type: exercise.countingType,
    difficulty: exercise.difficulty,
  };
}

async function buildTrainingSummary(weeks: number) {
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const sessions = (await getRecentSessions(getDb(), 120)).filter(
    (session) => session.startedAt >= cutoff && session.endedAt != null,
  );
  const byExercise = new Map<
    string,
    { sets: number; volumeKg: number; bestWeightKg: number; bestE1rm: number }
  >();
  let totalSets = 0;
  let volumeKg = 0;
  for (const session of sessions) {
    const sets = await getSessionSets(getDb(), session.id);
    for (const set of sets.filter((item) => item.status === 'confirmed' && !item.isWarmup)) {
      totalSets += 1;
      const volume = (set.weightKg ?? 0) * (set.reps ?? 0);
      volumeKg += volume;
      const row = byExercise.get(set.exerciseId) ?? {
        sets: 0,
        volumeKg: 0,
        bestWeightKg: 0,
        bestE1rm: 0,
      };
      row.sets += 1;
      row.volumeKg += volume;
      row.bestWeightKg = Math.max(row.bestWeightKg, set.weightKg ?? 0);
      if (set.weightKg && set.reps) {
        row.bestE1rm = Math.max(row.bestE1rm, set.weightKg * (1 + set.reps / 30));
      }
      byExercise.set(set.exerciseId, row);
    }
  }
  return {
    weeks,
    completed_sessions: sessions.length,
    frequency_per_week: Math.round((sessions.length / weeks) * 10) / 10,
    total_working_sets: totalSets,
    total_volume_kg: Math.round(volumeKg),
    exercise_highlights: [...byExercise]
      .sort((a, b) => b[1].sets - a[1].sets)
      .slice(0, 20)
      .map(([exerciseId, value]) => ({
        exercise_id: exerciseId,
        sets: value.sets,
        volume_kg: Math.round(value.volumeKg),
        best_weight_kg: value.bestWeightKg || null,
        best_e1rm_kg: value.bestE1rm ? Math.round(value.bestE1rm * 10) / 10 : null,
      })),
  };
}

async function getWeightTrend(): Promise<number | null> {
  const rows = await getMetricHistory(getDb(), 'weight_kg');
  if (rows.length < 2) return null;
  const newest = rows[0];
  const oldest = rows[Math.min(rows.length - 1, 7)];
  const days = Math.max(
    1,
    (new Date(`${newest.date}T00:00:00`).getTime() -
      new Date(`${oldest.date}T00:00:00`).getTime()) /
      86_400_000,
  );
  return Math.round(((newest.value - oldest.value) / days) * 7 * 100) / 100;
}

function templateFallback(
  profile: UserProfile,
  exerciseMap: Map<string, Exercise>,
  forbidden: Set<string>,
  fallbackReason: string,
): GeneratedPlanProposal {
  const result = generateTemplatePlan(profile, exerciseMap, forbidden);
  return {
    plan: result.plan,
    warnings: result.warnings,
    source: 'template',
    providerId: 'local-template',
    routeReason: '确定性本地模板回退',
    fallbackReason,
  };
}

function humanizeGenerationError(error: unknown): string {
  if (!(error instanceof Error)) return '未知错误';
  return error.message.length > 160 ? `${error.message.slice(0, 160)}…` : error.message;
}

function emptyObjectSchema(): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, properties: {} };
}

function asSearchInput(value: unknown): {
  muscle_group?: string;
  equipment?: string;
  keyword?: string;
} {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  return {
    muscle_group: typeof input.muscle_group === 'string' ? input.muscle_group : undefined,
    equipment: typeof input.equipment === 'string' ? input.equipment : undefined,
    keyword: typeof input.keyword === 'string' ? input.keyword : undefined,
  };
}

const PLAN_GENERATION_SYSTEM_PROMPT = `
你是 Nexset 应用的资深健身教练“Nex”，负责把用户档案转化为安全、可执行的周期训练计划。

知识边界：
- 你精通训练分化、渐进超负荷、容量/强度管理、周期化、动作技术与基础运动营养。
- 你不是医生。遇到疼痛、伤病或用药，只做规避安排并提醒持续不适请就医；禁止诊断和药物建议。

工作流程：
1. 读取用户档案、近 4 周训练摘要和营养基线；必要时检索动作。
2. 只能使用 search_exercises 或可信本地状态中出现的 exercise_id，绝对禁止编造。
3. 新手起始重量宁低勿高；无历史时复合动作从空杆或不高于体重的 50% 起步，有历史时参考最佳组的 85%-90%。
4. 营养以 TDEE 为基线：增肌 +5%-15%，减脂 -10%-20%，蛋白质 1.6-2.2g/kg，绝不超出 TDEE ±25%。
5. 每次训练安排 4-7 个动作，总时长匹配用户预算；每组按约 2.5 分钟估算。避开伤病禁忌。
6. 新手每肌群每周约 10-12 个有效组；有经验者可在 10-20 组内按目标分配。
7. progression_rule 只能是 linear、double_progression、rpe_based。
8. 最终必须调用 propose_plan 提交完整计划。该调用只生成待确认草案，不会修改用户数据。

输出要求：
- propose_plan 参数必须包含 plan 与 explanation，字段严格遵守工具 Schema。
- explanation 用中文、不超过 6 句话，说明分化原因、容量、进阶方式与营养依据。
- 不在普通对话中粘贴计划 JSON，不提交残缺计划。

示例原则：70kg 新手、每周 4 天增肌可采用上下肢分化；卧推约 30kg、深蹲约 35kg、硬拉约 40kg；双重递进 8-12 次；TDEE 2450 时可取约 2700kcal、蛋白约 140g。
`.trim();

const AI_PLAN_CONVERSATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'question', 'plan', 'resolved_profile'],
  properties: {
    kind: { type: 'string', enum: ['question', 'plan'] },
    question: {
      anyOf: [{ type: 'string', minLength: 1, maxLength: 1000 }, { type: 'null' }],
    },
    plan: {
      anyOf: [AI_PLAN_JSON_SCHEMA, { type: 'null' }],
    },
    resolved_profile: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'sex',
            'birth_year',
            'height_cm',
            'weight_kg',
            'goal',
            'experience',
            'days_per_week',
            'session_minutes',
            'training_location',
            'equipment',
            'injuries',
          ],
          properties: {
            sex: { anyOf: [{ type: 'string', enum: SEX_VALUES }, { type: 'null' }] },
            birth_year: {
              anyOf: [
                {
                  type: 'integer',
                  minimum: new Date().getFullYear() - 100,
                  maximum: new Date().getFullYear() - 12,
                },
                { type: 'null' },
              ],
            },
            height_cm: {
              anyOf: [
                { type: 'number', minimum: 100, maximum: 250 },
                { type: 'null' },
              ],
            },
            weight_kg: {
              anyOf: [
                { type: 'number', minimum: 25, maximum: 350 },
                { type: 'null' },
              ],
            },
            goal: { anyOf: [{ type: 'string', enum: GOAL_VALUES }, { type: 'null' }] },
            experience: {
              anyOf: [{ type: 'string', enum: EXPERIENCE_VALUES }, { type: 'null' }],
            },
            days_per_week: {
              anyOf: [{ type: 'integer', minimum: 1, maximum: 7 }, { type: 'null' }],
            },
            session_minutes: {
              anyOf: [{ type: 'integer', minimum: 15, maximum: 240 }, { type: 'null' }],
            },
            training_location: {
              anyOf: [
                { type: 'string', enum: TRAINING_LOCATION_VALUES },
                { type: 'null' },
              ],
            },
            equipment: {
              anyOf: [
                {
                  type: 'array',
                  uniqueItems: true,
                  items: { type: 'string', enum: EQUIPMENT_TYPES },
                },
                { type: 'null' },
              ],
            },
            injuries: {
              anyOf: [
                {
                  type: 'array',
                  uniqueItems: true,
                  items: { type: 'string', enum: INJURY_TAGS },
                },
                { type: 'null' },
              ],
            },
          },
        },
        { type: 'null' },
      ],
    },
  },
};

const PLAN_CONVERSATION_SYSTEM_PROMPT = `
${PLAN_GENERATION_SYSTEM_PROMPT.replace(
  '8. 最终必须调用 propose_plan 提交完整计划。该调用只生成待确认草案，不会修改用户数据。',
  '8. 最终必须调用 respond_plan_generation 返回追问或完整计划。该调用不会修改用户数据。',
).replace(
  '- propose_plan 参数必须包含 plan 与 explanation，字段严格遵守工具 Schema。',
  '- 生成计划时，plan 必须包含完整计划与 explanation，字段严格遵守工具 Schema。',
)}

交互式生成规则：
1. 用户填写的所有资料都可能为空；空字段表示“未知”，不能擅自理解为“没有”。
2. 先结合 user_request、user_profile 与 clarification_history 判断是否已足够制定安全且可执行的计划。
3. 只在缺少会显著影响安全性或可执行性的必要信息时追问。每轮只问一个具体问题，不重复 history 中已经回答的问题。
4. 可以保守推断的偏好不要反复追问；伤病、可用训练时间、训练条件等关键信息不清楚时优先询问。
5. 每轮最终必须调用 respond_plan_generation：
   - 需要追问：kind="question"，question 填最新问题，plan=null，resolved_profile=null。
   - 可以生成：kind="plan"，question=null，plan 填完整且符合原计划 Schema 的对象；resolved_profile 将表单和问答中已经明确的信息整理为结构化档案。
6. 不得在普通文本中输出问题或计划，不得同时返回问题和计划。
7. resolved_profile 只能整理用户明确提供的信息，不得覆盖 user_profile 中已有值，也不得把未知信息编造成用户事实。所有未明确的字段填 null；用户明确表示没有器械或伤病时，equipment 或 injuries 才填空数组。
`.trim();
