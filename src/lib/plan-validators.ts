import type { Exercise } from '@/db/repositories/exercise-repo';
import type { PlanInput } from '@/db/repositories/plan-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';

import { isExerciseSupportedByProfile } from './equipment-availability';

/**
 * PRD 四道硬校验（§7.1 约束）：
 *  1. exercise_id 必须存在于动作库
 *  2. 禁忌动作拦截（伤病映射）
 *  3. 起始重量保守上限（超限自动下调并标注）
 *  4. 营养目标钳制在 TDEE ±25%
 * errors = 需要整体重试的致命问题；warnings = 已自动修正的问题。
 */

export type PlanValidationContext = {
  exercises: Map<string, Exercise>;
  forbiddenIds: Set<string>;
  profile: UserProfile;
  tdee: number;
};

export type PlanValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  plan: PlanInput;
};

/** bodyweight multiples: [novice, intermediate, advanced] caps for starting weights */
const LIFT_CAPS: [pattern: RegExp, caps: [number, number, number]][] = [
  [/bench_press|floor_press|incline.*press/, [0.6, 1.2, 2.0]],
  [/(^|_)squat/, [0.8, 1.6, 2.6]],
  [/deadlift|rack_pull/, [1.0, 2.0, 3.2]],
  [/overhead_press|shoulder_press|seated_barbell_press|push_press/, [0.4, 0.8, 1.2]],
  [/(^|_)row/, [0.7, 1.2, 2.0]],
];
const GENERIC_BARBELL_CAP: [number, number, number] = [1.0, 1.8, 3.0];
const GENERIC_DUMBBELL_CAP: [number, number, number] = [0.4, 0.7, 1.1]; // per implement

function experienceIndex(exp: UserProfile['experience']): number {
  return exp === 'advanced' ? 2 : exp === 'intermediate' ? 1 : 0;
}

function startingWeightCap(exercise: Exercise, profile: UserProfile): number | null {
  if (exercise.countingType !== 'weight_reps') return null;
  const bw = profile.weightKg ?? 65;
  const idx = experienceIndex(profile.experience);
  for (const [pattern, caps] of LIFT_CAPS) {
    if (pattern.test(exercise.id)) return Math.round(caps[idx] * bw * 2) / 2;
  }
  if (exercise.equipment === 'barbell') return Math.round(GENERIC_BARBELL_CAP[idx] * bw * 2) / 2;
  if (exercise.equipment === 'dumbbell' || exercise.equipment === 'kettlebell') {
    return Math.round(GENERIC_DUMBBELL_CAP[idx] * bw * 2) / 2;
  }
  return null; // machines/cables vary too much — no cap
}

export function validatePlanInput(
  input: PlanInput,
  ctx: PlanValidationContext,
): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Deep copy so clamping never mutates the caller's object.
  const plan: PlanInput = JSON.parse(JSON.stringify(input));

  // 1 & 2: exercise existence + contraindications (fatal — AI must retry).
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const known = ctx.exercises.get(ex.exerciseId);
      if (!known) {
        errors.push(`未知动作 id: ${ex.exerciseId}（${day.label}）`);
        continue;
      }
      if (ctx.forbiddenIds.has(ex.exerciseId)) {
        errors.push(`动作 ${known.nameZh}(${ex.exerciseId}) 与用户伤病禁忌冲突（${day.label}）`);
      }
      if (!isExerciseSupportedByProfile(ctx.profile, known)) {
        errors.push(`动作 ${known.nameZh}(${ex.exerciseId}) 需要用户未选择的器材（${day.label}）`);
      }
    }
  }

  // 3: conservative starting weights (clamp + warn).
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const known = ctx.exercises.get(ex.exerciseId);
      if (!known || ex.weightKg == null) continue;
      const cap = startingWeightCap(known, ctx.profile);
      if (cap != null && ex.weightKg > cap) {
        warnings.push(
          `${known.nameZh} 起始重量 ${ex.weightKg}kg 超出保守上限 ${cap}kg，已自动下调`,
        );
        ex.weightKg = cap;
        ex.note = ex.note ? `${ex.note}；起始重量已保守下调` : '起始重量已保守下调';
      }
    }
  }

  // 4: nutrition clamped to TDEE ±25%.
  if (plan.nutrition) {
    const lo = Math.round(ctx.tdee * 0.75);
    const hi = Math.round(ctx.tdee * 1.25);
    if (plan.nutrition.dailyKcal < lo || plan.nutrition.dailyKcal > hi) {
      const clamped = Math.min(hi, Math.max(lo, plan.nutrition.dailyKcal));
      warnings.push(
        `营养目标 ${plan.nutrition.dailyKcal}kcal 超出 TDEE±25% 区间 [${lo}, ${hi}]，已钳制为 ${clamped}kcal`,
      );
      plan.nutrition.dailyKcal = clamped;
    }
  }

  // Structural sanity (warnings only).
  if (plan.days.length !== plan.daysPerWeek) {
    warnings.push(`计划天数 ${plan.days.length} 与每周 ${plan.daysPerWeek} 天不一致`);
  }
  const budget = ctx.profile.sessionMinutes ?? 60;
  for (const day of plan.days) {
    const totalSets = day.exercises.reduce((s, e) => s + e.sets, 0);
    const estMin = Math.round(totalSets * 2.5) + (day.cardio ? day.cardio.durationMin : 0);
    if (estMin > budget * 1.3) {
      warnings.push(`${day.label} 预计 ${estMin} 分钟，明显超出单次时长预算 ${budget} 分钟`);
    }
    if (day.exercises.length > 0 && (day.exercises.length < 3 || day.exercises.length > 8)) {
      warnings.push(`${day.label} 动作数 ${day.exercises.length} 偏离常规范围 4-7`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, plan };
}
