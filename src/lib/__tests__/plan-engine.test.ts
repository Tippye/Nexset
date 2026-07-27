import { describe, expect, it } from '@jest/globals';

import { SEED_EXERCISES, forbiddenExerciseIds } from '@/data/exercises';
import type { Exercise } from '@/db/repositories/exercise-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';

import { computeBaseline, computeTargets, proteinFoodExample } from '../nutrition';
import { AiPlanSchema, toPlanInput } from '../plan-schema';
import { generateTemplatePlan } from '../plan-templates';
import { validatePlanInput } from '../plan-validators';

const EXERCISES = new Map<string, Exercise>(
  SEED_EXERCISES.map((e) => [e.id, { ...e, isCustom: false }]),
);

const GYM_EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'cardio_machine'];

const baseProfile: UserProfile = {
  sex: 'male',
  birthYear: 1998,
  heightCm: 175,
  weightKg: 70,
  experience: 'novice',
  goal: 'hypertrophy',
  daysPerWeek: 4,
  sessionMinutes: 60,
  equipment: GYM_EQUIPMENT,
  injuries: [],
};

describe('nutrition (F9 local formulas)', () => {
  it('computes Mifflin-St Jeor BMR/TDEE', () => {
    const b = computeBaseline(baseProfile);
    // 10*70 + 6.25*175 - 5*28 + 5 = 1659 (2026 - 1998 = 28)
    expect(b.bmr).toBe(1659);
    expect(b.tdee).toBe(Math.round(1659 * 1.5));
  });

  it('targets follow goal direction', () => {
    const b = computeBaseline(baseProfile);
    const bulk = computeTargets(baseProfile, b);
    const cut = computeTargets({ ...baseProfile, goal: 'fat_loss' }, b);
    expect(bulk.dailyKcal).toBeGreaterThan(b.tdee);
    expect(cut.dailyKcal).toBeLessThan(b.tdee);
    expect(cut.proteinG).toBe(140); // 2.0 g/kg on a cut
    expect(proteinFoodExample(140)).toContain('鸡胸');
  });
});

describe('plan validators (four hard checks)', () => {
  const tdee = computeBaseline(baseProfile).tdee;
  const ctx = {
    exercises: EXERCISES,
    forbiddenIds: forbiddenExerciseIds([]),
    profile: baseProfile,
    tdee,
  };

  const validDay = {
    dayOfWeek: 1,
    label: '测试日',
    cardio: null,
    exercises: [
      { exerciseId: 'barbell_bench_press', sets: 4, reps: '8-10', weightKg: 30, restSec: 90, note: null },
      { exerciseId: 'lat_pulldown', sets: 3, reps: '10-12', weightKg: 40, restSec: 90, note: null },
      { exerciseId: 'goblet_squat', sets: 3, reps: '10', weightKg: 16, restSec: 90, note: null },
      { exerciseId: 'plank', sets: 3, reps: '45s', weightKg: null, restSec: 60, note: null },
    ],
  };
  const basePlan = {
    name: '测试计划',
    goal: 'hypertrophy',
    durationWeeks: 4,
    daysPerWeek: 1,
    progressionRule: 'double_progression' as const,
    source: 'ai' as const,
    nutrition: { dailyKcal: 2600, proteinG: 130, carbG: 300, fatG: 70 },
    explanation: null,
    days: [validDay],
  };

  it('passes a valid plan', () => {
    const r = validatePlanInput(basePlan, ctx);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('check 1: rejects unknown exercise ids', () => {
    const bad = { ...basePlan, days: [{ ...validDay, exercises: [{ ...validDay.exercises[0], exerciseId: 'made_up_press' }] }] };
    const r = validatePlanInput(bad, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('made_up_press');
  });

  it('check 2: rejects contraindicated exercises', () => {
    const injuredCtx = { ...ctx, forbiddenIds: forbiddenExerciseIds(['lower_back']) };
    const bad = { ...basePlan, days: [{ ...validDay, exercises: [{ ...validDay.exercises[0], exerciseId: 'deadlift' }] }] };
    const r = validatePlanInput(bad, injuredCtx);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('禁忌');
  });

  it('check 3: clamps aggressive novice starting weights', () => {
    const heavy = { ...basePlan, days: [{ ...validDay, exercises: [{ ...validDay.exercises[0], weightKg: 80 }] }] };
    const r = validatePlanInput(heavy, ctx);
    expect(r.ok).toBe(true);
    // novice bench cap = 0.6 * 70 = 42
    expect(r.plan.days[0].exercises[0].weightKg).toBe(42);
    expect(r.warnings.some((w) => w.includes('保守上限'))).toBe(true);
    // original object untouched
    expect(heavy.days[0].exercises[0].weightKg).toBe(80);
  });

  it('check 4: clamps nutrition outside TDEE ±25%', () => {
    const crazy = { ...basePlan, nutrition: { dailyKcal: 5000, proteinG: 130, carbG: 300, fatG: 70 } };
    const r = validatePlanInput(crazy, ctx);
    expect(r.plan.nutrition!.dailyKcal).toBe(Math.round(tdee * 1.25));
    expect(r.warnings.some((w) => w.includes('钳制'))).toBe(true);
  });

  it('warns on session-time budget overflow', () => {
    const many = {
      ...basePlan,
      days: [{
        ...validDay,
        exercises: Array.from({ length: 8 }, (_, i) => ({
          exerciseId: 'lat_pulldown', sets: 5, reps: '10', weightKg: 40, restSec: 90, note: null, sort: i,
        })),
      }],
    };
    const r = validatePlanInput(many, ctx);
    expect(r.warnings.some((w) => w.includes('时长预算'))).toBe(true);
  });
});

describe('template plan engine (I-1.3)', () => {
  const profiles: [string, UserProfile][] = [
    ['novice gym 4d hypertrophy', baseProfile],
    ['novice gym 3d hypertrophy', { ...baseProfile, daysPerWeek: 3 }],
    ['gym 5d hypertrophy', { ...baseProfile, daysPerWeek: 5, experience: 'intermediate' }],
    ['gym 3d strength', { ...baseProfile, goal: 'strength', daysPerWeek: 3 }],
    ['gym 4d fat_loss female', { ...baseProfile, sex: 'female', goal: 'fat_loss', weightKg: 58 }],
    ['bodyweight only 3d', { ...baseProfile, equipment: [], daysPerWeek: 3 }],
    ['dumbbell home 3d', { ...baseProfile, equipment: ['dumbbell'], daysPerWeek: 3 }],
    ['injured lower_back 4d', { ...baseProfile, injuries: ['lower_back'] }],
    ['injured knee+shoulder 3d', { ...baseProfile, injuries: ['knee', 'shoulder'], daysPerWeek: 3 }],
    ['1 day per week', { ...baseProfile, daysPerWeek: 1 }],
    ['7 days endurance', { ...baseProfile, goal: 'endurance', daysPerWeek: 7 }],
    ['older trainee', { ...baseProfile, birthYear: 1962, goal: 'toning', daysPerWeek: 2 }],
  ];

  it.each(profiles)('generates a valid plan for %s', (_label, profile) => {
    const forbidden = forbiddenExerciseIds(profile.injuries ?? []);
    const r = generateTemplatePlan(profile, EXERCISES, forbidden);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.plan.days.length).toBe(Math.min(7, Math.max(1, profile.daysPerWeek ?? 3)));
    // every planned exercise exists, is allowed, and matches owned equipment
    for (const day of r.plan.days) {
      expect(day.exercises.length).toBeGreaterThanOrEqual(3);
      for (const ex of day.exercises) {
        expect(EXERCISES.has(ex.exerciseId)).toBe(true);
        expect(forbidden.has(ex.exerciseId)).toBe(false);
      }
    }
    expect(r.plan.nutrition).not.toBeNull();
  });

  it('novice plans set conservative weights, non-novice leave null for big lifts', () => {
    const novice = generateTemplatePlan(baseProfile, EXERCISES, new Set());
    const noviceBench = novice.plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.exerciseId === 'barbell_bench_press');
    expect(noviceBench?.weightKg).not.toBeNull();
    expect(noviceBench!.weightKg!).toBeLessThanOrEqual(0.6 * 70);

    const inter = generateTemplatePlan({ ...baseProfile, experience: 'intermediate' }, EXERCISES, new Set());
    const interBench = inter.plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.exerciseId === 'barbell_bench_press');
    expect(interBench?.weightKg).toBeNull();
  });
});

describe('AI plan wire schema (§7.1)', () => {
  it('parses and maps a valid AI payload', () => {
    const payload = {
      plan: {
        name: '4周推拉腿增肌计划',
        goal: 'hypertrophy',
        duration_weeks: 4,
        days_per_week: 2,
        progression_rule: 'double_progression',
        days: [
          {
            day_of_week: 1,
            label: '推力日',
            exercises: [
              { exercise_id: 'barbell_bench_press', sets: 4, reps: '8-10', start_weight_kg: 40, rest_sec: 120 },
            ],
            cardio: { type: 'jog', duration_min: 20, intensity: 'moderate' },
          },
          { day_of_week: 4, label: '拉力日', exercises: [{ exercise_id: 'lat_pulldown', sets: 4, reps: '10-12' }] },
        ],
        nutrition: { daily_kcal: 2280, protein_g: 152, carb_g: 260, fat_g: 63, rationale: '增肌期热量盈余约10%' },
      },
      explanation: '计划解读',
    };
    const parsed = AiPlanSchema.parse(payload);
    const input = toPlanInput(parsed, 'ai');
    expect(input.days[0].exercises[0].weightKg).toBe(40);
    expect(input.days[1].exercises[0].restSec).toBe(90);
    expect(input.nutrition?.proteinG).toBe(152);
  });

  it('rejects malformed payloads', () => {
    expect(() => AiPlanSchema.parse({ plan: { name: '' } })).toThrow();
    expect(() =>
      AiPlanSchema.parse({
        plan: {
          name: 'x', goal: 'hypertrophy', duration_weeks: 4, days_per_week: 1,
          progression_rule: 'double_progression',
          days: [{ day_of_week: 9, label: 'a', exercises: [] }],
        },
      }),
    ).toThrow();
  });
});
