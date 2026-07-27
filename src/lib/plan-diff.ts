import { z } from 'zod';

import type { Exercise } from '@/db/repositories/exercise-repo';
import type { PlanDetail, PlanInput } from '@/db/repositories/plan-repo';

export const PlanChangeSchema = z.object({
  op: z.enum([
    'modify_weight',
    'modify_reps',
    'add_set',
    'remove_set',
    'replace_exercise',
    'move_day',
    'skip_day',
    'deload_week',
    'update_nutrition',
  ]),
  target: z.string().min(1),
  from_kg: z.number().nullish(),
  to_kg: z.number().nullish(),
  from_reps: z.string().nullish(),
  to_reps: z.string().nullish(),
  sets_delta: z.number().int().nullish(),
  to_exercise_id: z.string().nullish(),
  from_day_of_week: z.number().int().min(1).max(7).nullish(),
  to_day_of_week: z.number().int().min(1).max(7).nullish(),
  weight_reduction_pct: z.number().min(0).max(100).nullish(),
  set_reduction_pct: z.number().min(0).max(100).nullish(),
  daily_kcal: z.number().int().nullish(),
  protein_g: z.number().int().nullish(),
  carb_g: z.number().int().nullish(),
  fat_g: z.number().int().nullish(),
  rationale: z.string().max(300),
});

export const AdjustmentSchema = z.object({
  adjustment: z
    .object({
      reason_summary: z.string().min(1).max(500),
      changes: z.array(PlanChangeSchema).max(4),
      nutrition_change: z.unknown().nullish(),
      severity: z.enum(['minor', 'moderate', 'major']),
    })
    .nullable(),
  message: z.string().max(500),
});

export type PlanChange = z.infer<typeof PlanChangeSchema>;
export type AdjustmentProposal = z.infer<typeof AdjustmentSchema>;

export type DiffContext = {
  exercises: Map<string, Exercise>;
  forbiddenIds: Set<string>;
  tdee: number;
};

export type DiffResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  plan: PlanInput;
  rollback: PlanInput;
};

export function dryRunPlanDiff(
  current: PlanDetail,
  changes: PlanChange[],
  context: DiffContext,
): DiffResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rollback = detailToInput(current);
  const plan = clone(rollback);
  const seen = new Set<string>();

  for (const change of changes) {
    const conflictKey = `${change.op}:${change.target}`;
    if (seen.has(conflictKey)) {
      errors.push(`冲突调整：${change.op} 重复引用 ${change.target}`);
      continue;
    }
    seen.add(conflictKey);
    if (change.op === 'deload_week') {
      applyDeload(plan, change, warnings);
      continue;
    }
    if (change.op === 'update_nutrition') {
      applyNutrition(plan, change, context.tdee, warnings, errors);
      continue;
    }
    const dayIndex = current.days.findIndex((day) => day.id === change.target);
    if (change.op === 'move_day' || change.op === 'skip_day') {
      if (dayIndex < 0) {
        errors.push(`找不到训练日 target: ${change.target}`);
        continue;
      }
      if (change.op === 'move_day') {
        if (change.to_day_of_week == null) errors.push('move_day 缺少 to_day_of_week');
        else plan.days[dayIndex].dayOfWeek = change.to_day_of_week;
      } else {
        plan.days[dayIndex].label = `${plan.days[dayIndex].label}（本周跳过）`;
        plan.days[dayIndex].exercises = [];
        plan.days[dayIndex].cardio = null;
      }
      continue;
    }
    const located = locateExercise(current, plan, change.target);
    if (!located) {
      errors.push(`找不到计划动作 target: ${change.target}`);
      continue;
    }
    const exercise = located.exercise;
    switch (change.op) {
      case 'modify_weight': {
        if (exercise.weightKg == null || change.to_kg == null) {
          errors.push(`modify_weight 缺少当前重量或 to_kg: ${change.target}`);
          break;
        }
        if (change.from_kg != null && Math.abs(change.from_kg - exercise.weightKg) > 0.01) {
          errors.push(`重量冲突：计划为 ${exercise.weightKg}kg，diff from 为 ${change.from_kg}kg`);
          break;
        }
        const lo = roundHalf(exercise.weightKg * 0.85);
        const hi = roundHalf(exercise.weightKg * 1.15);
        const clamped = Math.min(hi, Math.max(lo, change.to_kg));
        if (clamped !== change.to_kg) warnings.push(`重量调整已钳制到 ±15%：${change.to_kg}→${clamped}kg`);
        exercise.weightKg = clamped;
        break;
      }
      case 'modify_reps':
        if (!change.to_reps) errors.push(`modify_reps 缺少 to_reps: ${change.target}`);
        else exercise.reps = change.to_reps;
        break;
      case 'add_set':
      case 'remove_set': {
        const requested = Math.abs(change.sets_delta ?? 1);
        const delta = Math.min(2, requested) * (change.op === 'add_set' ? 1 : -1);
        if (requested > 2) warnings.push(`组数调整已钳制到 ±2 组：${requested}→2`);
        exercise.sets = Math.max(1, Math.min(10, exercise.sets + delta));
        break;
      }
      case 'replace_exercise': {
        const replacement = change.to_exercise_id
          ? context.exercises.get(change.to_exercise_id)
          : null;
        if (!replacement) errors.push(`替换动作不存在：${change.to_exercise_id ?? '空'}`);
        else if (context.forbiddenIds.has(replacement.id)) {
          errors.push(`替换动作与用户伤病禁忌冲突：${replacement.nameZh}`);
        } else exercise.exerciseId = replacement.id;
        break;
      }
    }
  }
  const duplicateDays = new Set<number>();
  for (const day of plan.days) {
    if (duplicateDays.has(day.dayOfWeek)) errors.push(`多个训练日被安排到周${day.dayOfWeek}`);
    duplicateDays.add(day.dayOfWeek);
  }
  return { ok: errors.length === 0, errors, warnings, plan, rollback };
}

function locateExercise(current: PlanDetail, plan: PlanInput, target: string) {
  for (let dayIndex = 0; dayIndex < current.days.length; dayIndex++) {
    const exerciseIndex = current.days[dayIndex].exercises.findIndex((item) => item.id === target);
    if (exerciseIndex >= 0) return { exercise: plan.days[dayIndex].exercises[exerciseIndex] };
  }
  return null;
}

function applyDeload(plan: PlanInput, change: PlanChange, warnings: string[]) {
  const weightPct = Math.min(40, Math.max(30, change.weight_reduction_pct ?? 35));
  const setPct = Math.min(50, Math.max(30, change.set_reduction_pct ?? 40));
  if (change.weight_reduction_pct != null && change.weight_reduction_pct !== weightPct) {
    warnings.push(`减载重量幅度已钳制到 30%-40%：${change.weight_reduction_pct}%→${weightPct}%`);
  }
  for (const day of plan.days) {
    for (const exercise of day.exercises) {
      if (exercise.weightKg != null) exercise.weightKg = roundHalf(exercise.weightKg * (1 - weightPct / 100));
      exercise.sets = Math.max(1, Math.round(exercise.sets * (1 - setPct / 100)));
    }
  }
}

function applyNutrition(
  plan: PlanInput,
  change: PlanChange,
  tdee: number,
  warnings: string[],
  errors: string[],
) {
  if (!plan.nutrition || change.daily_kcal == null) {
    errors.push('update_nutrition 缺少现有营养目标或 daily_kcal');
    return;
  }
  const current = plan.nutrition.dailyKcal;
  const changeLo = Math.round(current * 0.92);
  const changeHi = Math.round(current * 1.08);
  const tdeeLo = Math.round(tdee * 0.75);
  const tdeeHi = Math.round(tdee * 1.25);
  const clamped = Math.min(changeHi, tdeeHi, Math.max(changeLo, tdeeLo, change.daily_kcal));
  if (clamped !== change.daily_kcal) warnings.push(`营养调整已钳制：${change.daily_kcal}→${clamped}kcal`);
  plan.nutrition = {
    dailyKcal: clamped,
    proteinG: change.protein_g ?? plan.nutrition.proteinG,
    carbG: change.carb_g ?? plan.nutrition.carbG,
    fatG: change.fat_g ?? plan.nutrition.fatG,
    rationale: change.rationale,
  };
}

export function detailToInput(plan: PlanDetail): PlanInput {
  return {
    name: plan.name,
    goal: plan.goal,
    durationWeeks: plan.durationWeeks,
    daysPerWeek: plan.daysPerWeek,
    progressionRule: plan.progressionRule,
    source: plan.source,
    nutrition: clone(plan.nutrition),
    explanation: plan.explanation,
    days: plan.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      label: day.label,
      cardio: clone(day.cardio),
      exercises: day.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets,
        reps: exercise.reps,
        weightKg: exercise.weightKg,
        restSec: exercise.restSec,
        note: exercise.note,
      })),
    })),
  };
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
