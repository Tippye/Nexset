import { runAgent, type AgentDefinition, type OutputValidation } from '@/ai/runtime';
import type { AIComplete, AIConfig } from '@/ai/types';
import { forbiddenExerciseIds } from '@/data/exercises';
import { getDb } from '@/db/client';
import {
  createAgentLog,
  type AgentUserDecision,
  updateAgentDecision,
} from '@/db/repositories/agent-log-repo';
import { listExercises, type Exercise } from '@/db/repositories/exercise-repo';
import {
  addPlanRevision,
  replacePlanContent,
  type PlanDetail,
} from '@/db/repositories/plan-repo';
import { getProfile } from '@/db/repositories/profile-repo';
import { computeBaseline } from '@/lib/nutrition';
import {
  AdjustmentSchema,
  dryRunPlanDiff,
  type AdjustmentProposal,
  type PlanChange,
} from '@/lib/plan-diff';
import {
  getCurrentDeviationReport,
  type DeviationReport,
} from '@/lib/deviation';
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

export const DAILY_ADJUST_PROMPT_VERSION = 'daily-adjust-v1';

export type DailyAdjustmentResult = {
  report: DeviationReport;
  proposal: AdjustmentProposal | null;
  warnings: string[];
  providerId?: string;
  model?: string;
  routeReason?: string;
  logId?: string;
  fallbackReason?: string;
};

export async function generateDailyAdjustment(
  plan: PlanDetail,
  config: AIConfig | null,
  options: {
    subjectiveFeedback?: string;
    complete?: AIComplete;
    router?: IntelligenceRouter;
    onText?: (delta: string) => void;
    onProgress?: (message: string) => void;
  } = {},
): Promise<DailyAdjustmentResult> {
  const db = getDb();
  const report = await getCurrentDeviationReport(db, plan, 7);
  if (!report.shouldTriggerAgent) return { report, proposal: null, warnings: [] };
  const profile = (await getProfile(db)) ?? {};
  const exercises = await listExercises(db);
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const forbidden = forbiddenExerciseIds(profile.injuries ?? []);
  const tdee = computeBaseline(profile, report.weightTrendKgPerWeek).tdee;
  const definition = buildDefinition(plan, report, exerciseMap, forbidden, tdee);
  const started = Date.now();
  const policy = defaultIntelligencePolicy('daily_adjustment');
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
        JSON.stringify({
          current_plan: compactPlan(plan),
          deviation_report: report,
          subjective_feedback: options.subjectiveFeedback ?? null,
        }),
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
    const diff = result.data.adjustment
      ? dryRunPlanDiff(plan, result.data.adjustment.changes, {
          exercises: exerciseMap,
          forbiddenIds: forbidden,
          tdee,
        })
      : null;
    const logId = await createAgentLog(db, {
      agent: 'DailyAdjustAgent',
      promptVersion: DAILY_ADJUST_PROMPT_VERSION,
      inputSummary: JSON.stringify({
        completionRate: report.completionRate,
        highRpeCount: report.highRpeCount,
        skippedDays: report.skippedDays.length,
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
      report,
      proposal: result.data.adjustment ? result.data : null,
      warnings: diff?.warnings ?? [],
      providerId: routed.provider.id,
      model: routed.provider.model,
      routeReason: routed.routeReason,
      logId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    const attempts =
      error instanceof IntelligenceRoutingError ? error.attempts : completedAttempts;
    const lastAttempt = attempts.at(-1);
    await createAgentLog(db, {
      agent: 'DailyAdjustAgent',
      promptVersion: DAILY_ADJUST_PROMPT_VERSION,
      inputSummary: JSON.stringify({ completionRate: report.completionRate }),
      output: { error: message },
      validationResult: 'fail',
      latencyMs: Date.now() - started,
      providerId: completedProvider?.id ?? lastAttempt?.providerId,
      providerKind: completedProvider?.kind ?? lastAttempt?.providerKind,
      model: completedProvider?.model ?? lastAttempt?.model,
      isBadcase: true,
      routeReason: '所有模型 Provider 均不可用或执行失败',
      routeMode:
        error instanceof IntelligenceRoutingError ? error.routeMode : completedRouteMode,
      degraded: true,
      fallbackHistory: attempts,
      privacyClass: policy.privacyClass,
    });
    return {
      report,
      proposal: null,
      warnings: [],
      fallbackReason: `调整建议未通过校验（${message.slice(0, 120)}），仅展示偏差数据。`,
    };
  }
}

export async function applyDailyAdjustment(
  plan: PlanDetail,
  changes: PlanChange[],
  reason: string,
): Promise<string[]> {
  const db = getDb();
  const profile = (await getProfile(db)) ?? {};
  const exerciseRows = await listExercises(db);
  const result = dryRunPlanDiff(plan, changes, {
    exercises: new Map(exerciseRows.map((exercise) => [exercise.id, exercise])),
    forbiddenIds: forbiddenExerciseIds(profile.injuries ?? []),
    tdee: computeBaseline(profile).tdee,
  });
  if (!result.ok) throw new Error(result.errors.join('；'));
  await addPlanRevision(db, plan.id, changes, result.rollback, reason, 'ai');
  await replacePlanContent(db, plan.id, result.plan);
  return result.warnings;
}

export async function recordAdjustmentDecision(
  logId: string | undefined,
  decision: AgentUserDecision,
): Promise<void> {
  if (logId) await updateAgentDecision(getDb(), logId, decision);
}

function buildDefinition(
  plan: PlanDetail,
  report: DeviationReport,
  exercises: Map<string, Exercise>,
  forbidden: Set<string>,
  tdee: number,
): AgentDefinition<AdjustmentProposal> {
  return {
    name: 'DailyAdjustAgent',
    promptVersion: DAILY_ADJUST_PROMPT_VERSION,
    systemPrompt: DAILY_ADJUST_SYSTEM_PROMPT,
    outputDescription: JSON.stringify(ADJUSTMENT_JSON_SCHEMA),
    proposalToolName: 'propose_adjustment',
    maxValidationRetries: 2,
    tools: [
      {
        kind: 'read',
        name: 'get_deviation_report',
        description: '返回本地预计算的近 7 天偏差报告。',
        inputSchema: {
          type: 'object',
          properties: { days: { type: 'integer', minimum: 1, maximum: 14 } },
        },
        execute: async () => report,
      },
      {
        kind: 'read',
        name: 'get_current_plan',
        description: '返回带真实 day/exercise target id 的当前计划。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => compactPlan(plan),
      },
      {
        kind: 'read',
        name: 'search_exercises',
        description: '替换动作时检索可用动作。',
        inputSchema: {
          type: 'object',
          properties: { keyword: { type: 'string' }, muscle_group: { type: 'string' } },
        },
        execute: async (input) => {
          const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
          return [...exercises.values()]
            .filter((exercise) => !forbidden.has(exercise.id))
            .filter(
              (exercise) =>
                !value.keyword ||
                exercise.nameZh.includes(String(value.keyword)) ||
                exercise.nameEn.toLowerCase().includes(String(value.keyword).toLowerCase()),
            )
            .filter(
              (exercise) =>
                !value.muscle_group ||
                exercise.primaryMuscles.includes(String(value.muscle_group)),
            )
            .slice(0, 30)
            .map((exercise) => ({
              exercise_id: exercise.id,
              name: exercise.nameZh,
              muscles: exercise.primaryMuscles,
            }));
        },
      },
      {
        kind: 'propose',
        name: 'propose_adjustment',
        description: '提交待用户确认的调整 diff；不会写入数据库。',
        inputSchema: ADJUSTMENT_JSON_SCHEMA,
      },
    ],
    validateOutput: (value) => validateAdjustment(value, plan, exercises, forbidden, tdee),
  };
}

function validateAdjustment(
  value: unknown,
  plan: PlanDetail,
  exercises: Map<string, Exercise>,
  forbidden: Set<string>,
  tdee: number,
): OutputValidation<AdjustmentProposal> {
  const parsed = AdjustmentSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  if (!parsed.data.adjustment) return { success: true, data: parsed.data };
  const dryRun = dryRunPlanDiff(plan, parsed.data.adjustment.changes, {
    exercises,
    forbiddenIds: forbidden,
    tdee,
  });
  return dryRun.ok
    ? { success: true, data: parsed.data }
    : { success: false, errors: dryRun.errors };
}

function compactPlan(plan: PlanDetail) {
  return {
    id: plan.id,
    goal: plan.goal,
    progression_rule: plan.progressionRule,
    nutrition: plan.nutrition,
    days: plan.days.map((day) => ({
      target: day.id,
      day_of_week: day.dayOfWeek,
      label: day.label,
      exercises: day.exercises.map((exercise) => ({
        target: exercise.id,
        exercise_id: exercise.exerciseId,
        sets: exercise.sets,
        reps: exercise.reps,
        weight_kg: exercise.weightKg,
      })),
    })),
  };
}

const ADJUSTMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['adjustment', 'message'],
  properties: {
    adjustment: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['reason_summary', 'changes', 'nutrition_change', 'severity'],
          properties: {
            reason_summary: { type: 'string' },
            severity: { type: 'string', enum: ['minor', 'moderate', 'major'] },
            nutrition_change: {},
            changes: {
              type: 'array',
              maxItems: 4,
              items: {
                type: 'object',
                required: ['op', 'target', 'rationale'],
                properties: {
                  op: {
                    type: 'string',
                    enum: [
                      'modify_weight',
                      'modify_reps',
                      'add_set',
                      'remove_set',
                      'replace_exercise',
                      'move_day',
                      'skip_day',
                      'deload_week',
                      'update_nutrition',
                    ],
                  },
                  target: { type: 'string' },
                  from_kg: { type: ['number', 'null'] },
                  to_kg: { type: ['number', 'null'] },
                  from_reps: { type: ['string', 'null'] },
                  to_reps: { type: ['string', 'null'] },
                  sets_delta: { type: ['integer', 'null'] },
                  to_exercise_id: { type: ['string', 'null'] },
                  from_day_of_week: { type: ['integer', 'null'] },
                  to_day_of_week: { type: ['integer', 'null'] },
                  weight_reduction_pct: { type: ['number', 'null'] },
                  set_reduction_pct: { type: ['number', 'null'] },
                  daily_kcal: { type: ['integer', 'null'] },
                  protein_g: { type: ['integer', 'null'] },
                  carb_g: { type: ['integer', 'null'] },
                  fat_g: { type: ['integer', 'null'] },
                  rationale: { type: 'string' },
                },
              },
            },
          },
        },
      ],
    },
    message: { type: 'string' },
  },
};

const DAILY_ADJUST_SYSTEM_PROMPT = `
你是 Nexset 的计划调整教练。系统已预计算 deviation_report，你只负责归因并给出最小必要调整。

决策优先级：不调 > 微调重量/组数 > 换动作 > 重排训练日 > 减载周。
- 完成率≥90%且无 RPE/主观异常：提交 adjustment=null。
- 连续超额完成或多个动作 RPE≤7：按递进规则小幅加重。
- 单次疲劳：只降低下次同肌群强度 5%-10%。
- 同动作持续完不成：回退重量约 10%。
- 跳过训练日：优先最小重排，不挤压恢复。
- RPE 持续≥9且重量下降：可建议减载周。
- 体重趋势持续偏离目标：营养只调整 5%-8%。

硬约束：
- 普通重量变化≤±15%，组数变化≤±2，changes≤4。
- target 必须使用 current_plan 返回的真实 target id。
- op 只能使用工具 Schema 的枚举。
- 疼痛/受伤只做规避，message 必须附“如持续疼痛请及时就医”，禁止诊断。
- 最终调用 propose_adjustment；它只生成确认卡片，不写数据库。
- message 不超过 3 句话，先说结论，语气支持性。

示例：单次疲劳且深蹲 RPE9.5，可 modify_weight 从 60kg 到 54kg；连续两次完整完成且 RPE7，可从 60kg 到 65kg。两种情况都不要重做整份计划。
`.trim();
