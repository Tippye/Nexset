import type { AIComplete, AIConfig } from '@/ai/types';
import { runAgent, type AgentDefinition, type OutputValidation } from '@/ai/runtime';
import { forbiddenExerciseIds } from '@/data/exercises';
import { getDb } from '@/db/client';
import {
  createAgentLog,
  type AgentUserDecision,
  updateAgentDecision,
} from '@/db/repositories/agent-log-repo';
import {
  listExercises,
  type Exercise,
} from '@/db/repositories/exercise-repo';
import type { PlanInput } from '@/db/repositories/plan-repo';
import { getProfile, type UserProfile } from '@/db/repositories/profile-repo';
import { getMetricHistory } from '@/db/repositories/body-repo';
import { getRecentSessions, getSessionSets } from '@/db/repositories/workout-repo';
import { computeBaseline } from '@/lib/nutrition';
import { isExerciseSupportedByProfile } from '@/lib/equipment-availability';
import {
  AI_PLAN_JSON_SCHEMA,
  AiPlanSchema,
  toPlanInput,
  type AiPlan,
} from '@/lib/plan-schema';
import { generateTemplatePlan } from '@/lib/plan-templates';
import { validatePlanInput } from '@/lib/plan-validators';

export const PLAN_AGENT_PROMPT_VERSION = 'plan-generation-v1';

export type GeneratedPlanProposal = {
  plan: PlanInput;
  warnings: string[];
  source: 'ai' | 'template';
  logId?: string;
  fallbackReason?: string;
};

export async function generatePlanProposal(
  config: AIConfig | null,
  options: {
    userRequest?: string;
    complete?: AIComplete;
    onText?: (delta: string) => void;
    onProgress?: (message: string) => void;
  } = {},
): Promise<GeneratedPlanProposal> {
  const db = getDb();
  const profile = (await getProfile(db)) ?? {};
  const exercises = await listExercises(db);
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const forbidden = forbiddenExerciseIds(profile.injuries ?? []);
  const available = availableExercises(profile, exercises, forbidden);
  const trainingSummary = await buildTrainingSummary(4);
  const weightTrend = await getWeightTrend();
  const baseline = computeBaseline(profile, weightTrend);

  if (!config?.apiKey.trim() || !config.model.trim()) {
    return templateFallback(
      profile,
      exerciseMap,
      forbidden,
      '尚未配置可用的 AI，已生成安全的本地模板计划。',
    );
  }

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

  try {
    const result = await runAgent(
      config,
      definition,
      `以下是本次任务的可信本地状态。工具返回与这里的信息冲突时，以工具返回为准：\n${JSON.stringify(state)}`,
      {
        complete: options.complete,
        onText: options.onText,
        onProgress: options.onProgress,
      },
    );
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
    });
    return { plan: validated.plan, warnings: validated.warnings, source: 'ai', logId };
  } catch (error) {
    const reason = humanizeGenerationError(error);
    await createAgentLog(db, {
      agent: 'PlanGenerationAgent',
      promptVersion: PLAN_AGENT_PROMPT_VERSION,
      inputSummary: JSON.stringify({
        goal: profile.goal,
        daysPerWeek: profile.daysPerWeek,
        request,
      }),
      output: { error: reason },
      validationResult: 'fail',
      isBadcase: true,
    });
    return templateFallback(
      profile,
      exerciseMap,
      forbidden,
      `AI 计划未能通过完整校验（${reason}），已安全降级为本地模板。`,
    );
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
