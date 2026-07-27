import { describe, expect, it } from '@jest/globals';

import { SEED_EXERCISES, forbiddenExerciseIds } from '@/data/exercises';
import type { Exercise } from '@/db/repositories/exercise-repo';
import type { PlanDetail } from '@/db/repositories/plan-repo';

import { dryRunPlanDiff, type PlanChange } from '../plan-diff';

const exercises = new Map<string, Exercise>(
  SEED_EXERCISES.map((exercise) => [exercise.id, { ...exercise, isCustom: false }]),
);
const context = { exercises, forbiddenIds: new Set<string>(), tdee: 2400 };

describe('plan diff engine', () => {
  it('applies weight/reps and clamps weight to ±15%', () => {
    const result = run([
      { op: 'modify_weight', target: 'ex-1', from_kg: 50, to_kg: 80, rationale: 'test' },
      { op: 'modify_reps', target: 'ex-1', to_reps: '6-8', rationale: 'test' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].exercises[0].weightKg).toBe(57.5);
    expect(result.plan.days[0].exercises[0].reps).toBe('6-8');
  });

  it('applies add_set/remove_set with ±2 clamp', () => {
    const added = run([{ op: 'add_set', target: 'ex-1', sets_delta: 5, rationale: 'test' }]);
    expect(added.plan.days[0].exercises[0].sets).toBe(5);
    const removed = run([{ op: 'remove_set', target: 'ex-1', sets_delta: 2, rationale: 'test' }]);
    expect(removed.plan.days[0].exercises[0].sets).toBe(1);
  });

  it('replaces only with known non-forbidden exercises', () => {
    const ok = run([
      { op: 'replace_exercise', target: 'ex-1', to_exercise_id: 'goblet_squat', rationale: 'test' },
    ]);
    expect(ok.plan.days[0].exercises[0].exerciseId).toBe('goblet_squat');
    const bad = dryRunPlanDiff(
      plan(),
      [{ op: 'replace_exercise', target: 'ex-1', to_exercise_id: 'deadlift', rationale: 'test' }],
      { ...context, forbiddenIds: forbiddenExerciseIds(['lower_back']) },
    );
    expect(bad.ok).toBe(false);
  });

  it('moves and skips days', () => {
    expect(
      run([{ op: 'move_day', target: 'day-1', to_day_of_week: 2, rationale: 'test' }]).plan
        .days[0].dayOfWeek,
    ).toBe(2);
    const skipped = run([{ op: 'skip_day', target: 'day-1', rationale: 'test' }]);
    expect(skipped.plan.days[0].exercises).toHaveLength(0);
    expect(skipped.plan.days[0].label).toContain('本周跳过');
  });

  it('applies a bounded deload week', () => {
    const result = run([
      {
        op: 'deload_week',
        target: 'plan',
        weight_reduction_pct: 80,
        set_reduction_pct: 40,
        rationale: 'test',
      },
    ]);
    expect(result.plan.days[0].exercises[0].weightKg).toBe(30);
    expect(result.plan.days[0].exercises[0].sets).toBe(2);
  });

  it('applies bounded nutrition changes', () => {
    const result = run([
      { op: 'update_nutrition', target: 'nutrition', daily_kcal: 4000, rationale: 'test' },
    ]);
    expect(result.plan.nutrition?.dailyKcal).toBe(2700);
  });

  it('rejects invalid targets, stale from values and duplicate operations', () => {
    expect(run([{ op: 'modify_reps', target: 'missing', to_reps: '8', rationale: 'x' }]).ok).toBe(false);
    expect(
      run([{ op: 'modify_weight', target: 'ex-1', from_kg: 60, to_kg: 55, rationale: 'x' }]).ok,
    ).toBe(false);
    expect(
      run([
        { op: 'add_set', target: 'ex-1', rationale: 'x' },
        { op: 'add_set', target: 'ex-1', rationale: 'x' },
      ]).ok,
    ).toBe(false);
  });
});

function run(changes: PlanChange[]) {
  return dryRunPlanDiff(plan(), changes, context);
}

function plan(): PlanDetail {
  return {
    id: 'plan',
    name: 'test',
    goal: 'hypertrophy',
    status: 'active',
    durationWeeks: 4,
    daysPerWeek: 1,
    progressionRule: 'double_progression',
    source: 'template',
    nutrition: { dailyKcal: 2500, proteinG: 140, carbG: 300, fatG: 70 },
    explanation: null,
    startedAt: Date.now(),
    days: [
      {
        id: 'day-1',
        dayOfWeek: 1,
        label: 'A',
        cardio: null,
        exercises: [
          {
            id: 'ex-1',
            exerciseId: 'back_squat',
            sets: 3,
            reps: '8-12',
            weightKg: 50,
            restSec: 90,
            note: null,
          },
        ],
      },
    ],
  };
}
