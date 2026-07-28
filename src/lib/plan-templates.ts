import type { Exercise } from '@/db/repositories/exercise-repo';
import type { PlanDayInput, PlanInput } from '@/db/repositories/plan-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';

import { computeBaseline, computeTargets } from './nutrition';
import { isExerciseSupportedByProfile } from './equipment-availability';
import { validatePlanInput, type PlanValidationResult } from './plan-validators';

/**
 * I-1.3 模板计划引擎：AI 不可用时的完整降级路径。
 * 输出与 AI 计划同构（PlanInput），同样经过四道硬校验。
 */

type ExSpec = {
  /** preference-ordered candidate ids; first available wins */
  ids: string[];
  sets: number;
  reps?: string;
  /** starting weight as bodyweight multiple (novice only) */
  mult?: number;
  rest?: number;
};

type DayBlueprint = { label: string; specs: ExSpec[]; cardioMin?: number };

const GOAL_REPS: Record<string, string> = {
  hypertrophy: '8-12',
  strength: '5',
  fat_loss: '10-15',
  endurance: '12-20',
  toning: '10-15',
};

const GOAL_REST: Record<string, number> = {
  hypertrophy: 90,
  strength: 180,
  fat_loss: 60,
  endurance: 60,
  toning: 75,
};

function spreadDays(n: number): number[] {
  const patterns: Record<number, number[]> = {
    1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 7],
  };
  return patterns[Math.min(7, Math.max(1, n))];
}

class TemplateBuilder {
  constructor(
    private profile: UserProfile,
    private exercises: Map<string, Exercise>,
    private forbidden: Set<string>,
  ) {}

  private available(id: string): boolean {
    const ex = this.exercises.get(id);
    return !!ex && !this.forbidden.has(id) && isExerciseSupportedByProfile(this.profile, ex);
  }

  /** First available candidate, following substitutes as fallback. */
  pick(ids: string[]): string | null {
    for (const id of ids) if (this.available(id)) return id;
    for (const id of ids) {
      const ex = this.exercises.get(id);
      if (!ex) continue;
      for (const sub of ex.substitutes) if (this.available(sub)) return sub;
    }
    return null;
  }

  buildDay(bp: DayBlueprint, dayOfWeek: number, goal: string): PlanDayInput {
    const isNovice = (this.profile.experience ?? 'novice') === 'novice';
    const bw = this.profile.weightKg ?? 65;
    const exercises = [];
    for (const spec of bp.specs) {
      const id = this.pick(spec.ids);
      if (!id) continue;
      const ex = this.exercises.get(id)!;
      const useWeight = ex.countingType === 'weight_reps' || ex.countingType === 'assisted_weight_reps';
      exercises.push({
        exerciseId: id,
        sets: spec.sets,
        reps: spec.reps ?? (ex.countingType === 'duration' ? '30-60s' : GOAL_REPS[goal]),
        weightKg: isNovice && useWeight && spec.mult ? Math.round(bw * spec.mult * 2) / 2 : null,
        restSec: spec.rest ?? GOAL_REST[goal],
        note: null,
      });
    }
    const cardio = bp.cardioMin
      ? {
          type: this.pick(['treadmill_run', 'stationary_bike', 'elliptical', 'outdoor_run', 'jump_rope', 'walk']) ?? 'walk',
          durationMin: bp.cardioMin,
          intensity: goal === 'fat_loss' ? 'moderate' : 'low',
        }
      : null;
    return { dayOfWeek, label: bp.label, cardio, exercises };
  }
}

// ── Blueprints ─────────────────────────────────────────────

const FULLBODY: DayBlueprint[] = [
  {
    label: '全身A',
    specs: [
      { ids: ['back_squat', 'goblet_squat', 'leg_press'], sets: 3, mult: 0.4 },
      { ids: ['barbell_bench_press', 'dumbbell_bench_press', 'push_up'], sets: 3, mult: 0.35 },
      { ids: ['barbell_row', 'seated_cable_row', 'dumbbell_row'], sets: 3, mult: 0.35 },
      { ids: ['plank'], sets: 3 },
    ],
  },
  {
    label: '全身B',
    specs: [
      { ids: ['romanian_deadlift', 'dumbbell_rdl', 'glute_bridge'], sets: 3, mult: 0.4 },
      { ids: ['dumbbell_shoulder_press', 'machine_shoulder_press'], sets: 3, mult: 0.15 },
      { ids: ['lat_pulldown', 'assisted_pull_up', 'inverted_row'], sets: 3, mult: 0.4 },
      { ids: ['crunch', 'cable_crunch'], sets: 3 },
    ],
  },
  {
    label: '全身C',
    specs: [
      { ids: ['leg_press', 'goblet_squat', 'walking_lunge'], sets: 3, mult: 0.6 },
      { ids: ['incline_dumbbell_press', 'machine_chest_press', 'incline_push_up'], sets: 3, mult: 0.15 },
      { ids: ['seated_cable_row', 'machine_row', 'dumbbell_row'], sets: 3, mult: 0.35 },
      { ids: ['lateral_raise', 'cable_lateral_raise'], sets: 3, mult: 0.05 },
    ],
  },
];

const UPPER_LOWER: DayBlueprint[] = [
  {
    label: '上肢A',
    specs: [
      { ids: ['barbell_bench_press', 'dumbbell_bench_press'], sets: 4, mult: 0.4 },
      { ids: ['barbell_row', 'seated_cable_row'], sets: 4, mult: 0.4 },
      { ids: ['dumbbell_shoulder_press', 'machine_shoulder_press'], sets: 3, mult: 0.15 },
      { ids: ['lat_pulldown', 'assisted_pull_up'], sets: 3, mult: 0.4 },
      { ids: ['dumbbell_curl', 'cable_curl'], sets: 2, mult: 0.08 },
      { ids: ['cable_pushdown', 'rope_pushdown'], sets: 2, mult: 0.2 },
    ],
  },
  {
    label: '下肢A',
    specs: [
      { ids: ['back_squat', 'goblet_squat', 'leg_press'], sets: 4, mult: 0.5 },
      { ids: ['romanian_deadlift', 'dumbbell_rdl'], sets: 3, mult: 0.45 },
      { ids: ['leg_extension', 'walking_lunge'], sets: 3 },
      { ids: ['leg_curl', 'lying_leg_curl', 'seated_leg_curl'], sets: 3 },
      { ids: ['standing_calf_raise', 'single_leg_calf_raise'], sets: 3 },
    ],
    cardioMin: 15,
  },
  {
    label: '上肢B',
    specs: [
      { ids: ['incline_dumbbell_press', 'incline_barbell_press'], sets: 4, mult: 0.15 },
      { ids: ['seated_cable_row', 'machine_row', 'dumbbell_row'], sets: 4, mult: 0.35 },
      { ids: ['lateral_raise', 'cable_lateral_raise'], sets: 3, mult: 0.05 },
      { ids: ['face_pull', 'reverse_pec_deck', 'bent_over_lateral_raise'], sets: 3 },
      { ids: ['hammer_curl', 'dumbbell_curl'], sets: 2, mult: 0.08 },
      { ids: ['overhead_cable_extension', 'skullcrusher'], sets: 2 },
    ],
  },
  {
    label: '下肢B',
    specs: [
      { ids: ['leg_press', 'hack_squat', 'goblet_squat'], sets: 4, mult: 0.7 },
      { ids: ['hip_thrust', 'glute_bridge', 'machine_hip_thrust'], sets: 3, mult: 0.4 },
      { ids: ['bulgarian_split_squat', 'reverse_lunge'], sets: 3 },
      { ids: ['seated_calf_raise', 'standing_calf_raise'], sets: 3 },
      { ids: ['hanging_knee_raise', 'lying_leg_raise'], sets: 3 },
    ],
    cardioMin: 15,
  },
];

const PPL: DayBlueprint[] = [
  {
    label: '推力日',
    specs: [
      { ids: ['barbell_bench_press', 'dumbbell_bench_press'], sets: 4, mult: 0.4 },
      { ids: ['incline_dumbbell_press', 'smith_incline_press'], sets: 3, mult: 0.15 },
      { ids: ['dumbbell_shoulder_press', 'machine_shoulder_press'], sets: 3, mult: 0.15 },
      { ids: ['lateral_raise', 'cable_lateral_raise'], sets: 3, mult: 0.05 },
      { ids: ['cable_pushdown', 'rope_pushdown'], sets: 3, mult: 0.2 },
    ],
  },
  {
    label: '拉力日',
    specs: [
      { ids: ['barbell_row', 't_bar_row'], sets: 4, mult: 0.4 },
      { ids: ['lat_pulldown', 'assisted_pull_up', 'pull_up'], sets: 4, mult: 0.4 },
      { ids: ['seated_cable_row', 'machine_row'], sets: 3, mult: 0.35 },
      { ids: ['face_pull', 'reverse_pec_deck'], sets: 3 },
      { ids: ['dumbbell_curl', 'ez_bar_curl'], sets: 3, mult: 0.08 },
    ],
  },
  {
    label: '腿部日',
    specs: [
      { ids: ['back_squat', 'goblet_squat', 'leg_press'], sets: 4, mult: 0.5 },
      { ids: ['romanian_deadlift', 'dumbbell_rdl'], sets: 3, mult: 0.45 },
      { ids: ['leg_press', 'hack_squat', 'walking_lunge'], sets: 3 },
      { ids: ['leg_curl', 'lying_leg_curl'], sets: 3 },
      { ids: ['standing_calf_raise', 'seated_calf_raise'], sets: 4 },
    ],
    cardioMin: 15,
  },
];

const HOME_BODYWEIGHT: DayBlueprint[] = [
  {
    label: '徒手全身A',
    specs: [
      { ids: ['push_up', 'incline_push_up', 'knee_push_up'], sets: 4 },
      { ids: ['split_squat', 'lateral_lunge'], sets: 4 },
      { ids: ['inverted_row', 'superman'], sets: 3 },
      { ids: ['glute_bridge'], sets: 3 },
      { ids: ['plank'], sets: 3 },
    ],
    cardioMin: 15,
  },
  {
    label: '徒手全身B',
    specs: [
      { ids: ['decline_push_up', 'push_up'], sets: 4 },
      { ids: ['jump_squat', 'split_squat'], sets: 4 },
      { ids: ['single_leg_calf_raise'], sets: 3 },
      { ids: ['dead_bug', 'bird_dog'], sets: 3 },
      { ids: ['mountain_climber'], sets: 3 },
    ],
    cardioMin: 15,
  },
  {
    label: '徒手全身C',
    specs: [
      { ids: ['diamond_push_up', 'knee_push_up'], sets: 3 },
      { ids: ['reverse_lunge', 'curtsy_lunge'], sets: 4 },
      { ids: ['glute_bridge', 'single_leg_rdl'], sets: 3 },
      { ids: ['side_plank'], sets: 3 },
      { ids: ['hollow_hold', 'crunch'], sets: 3 },
    ],
    cardioMin: 20,
  },
];

const STRENGTH_BASE: DayBlueprint[] = [
  {
    label: '深蹲日',
    specs: [
      { ids: ['back_squat', 'goblet_squat'], sets: 5, reps: '5', mult: 0.5, rest: 180 },
      { ids: ['barbell_bench_press', 'dumbbell_bench_press'], sets: 3, reps: '8', mult: 0.4 },
      { ids: ['barbell_row', 'seated_cable_row'], sets: 3, reps: '8', mult: 0.4 },
      { ids: ['plank'], sets: 3 },
    ],
  },
  {
    label: '卧推日',
    specs: [
      { ids: ['barbell_bench_press', 'dumbbell_bench_press'], sets: 5, reps: '5', mult: 0.45, rest: 180 },
      { ids: ['overhead_press', 'dumbbell_shoulder_press'], sets: 3, reps: '8', mult: 0.25 },
      { ids: ['lat_pulldown', 'assisted_pull_up', 'pull_up'], sets: 3, reps: '8', mult: 0.4 },
      { ids: ['cable_pushdown', 'rope_pushdown'], sets: 3, reps: '10', mult: 0.2 },
    ],
  },
  {
    label: '硬拉日',
    specs: [
      { ids: ['deadlift', 'trap_bar_deadlift', 'kettlebell_deadlift'], sets: 5, reps: '5', mult: 0.6, rest: 180 },
      { ids: ['leg_press', 'goblet_squat'], sets: 3, reps: '10', mult: 0.7 },
      { ids: ['seated_cable_row', 'machine_row', 'dumbbell_row'], sets: 3, reps: '10', mult: 0.35 },
      { ids: ['hanging_knee_raise', 'lying_leg_raise'], sets: 3 },
    ],
  },
];

const FAT_LOSS_MIX: DayBlueprint[] = [
  {
    label: '燃脂全身A',
    specs: [
      { ids: ['goblet_squat', 'back_squat', 'leg_press'], sets: 3, mult: 0.35 },
      { ids: ['push_up', 'dumbbell_bench_press', 'machine_chest_press'], sets: 3, mult: 0.3 },
      { ids: ['seated_cable_row', 'dumbbell_row', 'inverted_row'], sets: 3, mult: 0.3 },
      { ids: ['kettlebell_swing', 'cable_pull_through', 'glute_bridge'], sets: 3, mult: 0.2 },
    ],
    cardioMin: 25,
  },
  {
    label: '燃脂全身B',
    specs: [
      { ids: ['walking_lunge', 'reverse_lunge', 'split_squat'], sets: 3, mult: 0.15 },
      { ids: ['dumbbell_shoulder_press', 'machine_shoulder_press'], sets: 3, mult: 0.12 },
      { ids: ['lat_pulldown', 'assisted_pull_up', 'inverted_row'], sets: 3, mult: 0.35 },
      { ids: ['mountain_climber', 'burpee'], sets: 3 },
    ],
    cardioMin: 25,
  },
  {
    label: '燃脂全身C',
    specs: [
      { ids: ['romanian_deadlift', 'dumbbell_rdl', 'glute_bridge'], sets: 3, mult: 0.4 },
      { ids: ['incline_dumbbell_press', 'incline_push_up'], sets: 3, mult: 0.12 },
      { ids: ['machine_row', 'seated_cable_row', 'dumbbell_row'], sets: 3, mult: 0.3 },
      { ids: ['plank', 'crunch'], sets: 3 },
    ],
    cardioMin: 30,
  },
];

// ── Engine ─────────────────────────────────────────────────

const GOAL_LABEL: Record<string, string> = {
  hypertrophy: '增肌',
  fat_loss: '减脂',
  strength: '力量',
  endurance: '耐力',
  toning: '塑形',
};

function selectBlueprints(profile: UserProfile): { name: string; days: DayBlueprint[] } {
  const goal = profile.goal ?? 'hypertrophy';
  const days = profile.daysPerWeek ?? 3;
  const eq = new Set(profile.equipment ?? []);
  const bodyweightOnly = !eq.has('barbell') && !eq.has('dumbbell') && !eq.has('machine') && !eq.has('cable');

  if (bodyweightOnly) return { name: '居家徒手计划', days: HOME_BODYWEIGHT };
  if (goal === 'strength') return { name: '力量三大项基础计划', days: STRENGTH_BASE };
  if (goal === 'fat_loss' || goal === 'endurance') return { name: `${GOAL_LABEL[goal]}混合训练计划`, days: FAT_LOSS_MIX };
  if (days <= 3) return { name: `${GOAL_LABEL[goal]}全身计划`, days: FULLBODY };
  if (days === 4) return { name: `${GOAL_LABEL[goal]}上下肢分化计划`, days: UPPER_LOWER };
  return { name: `${GOAL_LABEL[goal]}推拉腿计划`, days: PPL };
}

export function generateTemplatePlan(
  profile: UserProfile,
  exercises: Map<string, Exercise>,
  forbidden: Set<string>,
): PlanValidationResult {
  const goal = profile.goal ?? 'hypertrophy';
  const daysPerWeek = Math.min(7, Math.max(1, profile.daysPerWeek ?? 3));
  const builder = new TemplateBuilder(profile, exercises, forbidden);
  const { name, days: blueprints } = selectBlueprints(profile);
  const slots = spreadDays(daysPerWeek);

  const days = slots.map((dayOfWeek, i) =>
    builder.buildDay(blueprints[i % blueprints.length], dayOfWeek, goal),
  );

  const baseline = computeBaseline(profile);
  const targets = computeTargets(profile, baseline);

  const plan: PlanInput = {
    name: `4周${name}`,
    goal,
    durationWeeks: 4,
    daysPerWeek,
    progressionRule: goal === 'strength' ? 'linear' : 'double_progression',
    source: 'template',
    explanation:
      `这是根据你的目标（${GOAL_LABEL[goal]}）、每周 ${daysPerWeek} 天训练安排和可用器械生成的模板计划。` +
      `起始重量偏保守，前两周以熟悉动作为主；之后按计划的渐进规则逐步加重。配置 AI 后可获得更个性化的计划与每日动态调整。`,
    nutrition: {
      dailyKcal: targets.dailyKcal,
      proteinG: targets.proteinG,
      carbG: targets.carbG,
      fatG: targets.fatG,
      rationale: targets.rationale,
    },
    days,
  };

  return validatePlanInput(plan, {
    exercises,
    forbiddenIds: forbidden,
    profile,
    tdee: baseline.tdee,
  });
}
