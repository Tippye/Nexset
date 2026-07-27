import { describe, expect, it } from '@jest/globals';

import type { PlanDetail } from '@/db/repositories/plan-repo';
import type { SetLog } from '@/db/repositories/workout-repo';

import { computeDeviationReport, type DeviationSession } from '../deviation';

const plan = makePlan();

describe('deviation engine', () => {
  it('does not trigger when completion is at least 90% with normal RPE', () => {
    const report = computeDeviationReport({
      plan,
      today: '2026-07-27',
      sessions: [session([set('squat', 1, 8), set('squat', 2, 8), set('squat', 3, 8)])],
    });
    expect(report.completionRate).toBe(1);
    expect(report.shouldTriggerAgent).toBe(false);
  });

  it('triggers on under-completion', () => {
    const report = computeDeviationReport({
      plan,
      today: '2026-07-27',
      sessions: [session([set('squat', 1, 8)])],
    });
    expect(report.completionRate).toBeCloseTo(1 / 3);
    expect(report.shouldTriggerAgent).toBe(true);
  });

  it('detects high RPE even with full completion', () => {
    const report = computeDeviationReport({
      plan,
      today: '2026-07-27',
      sessions: [session([set('squat', 1, 9.5), set('squat', 2, 9), set('squat', 3, 9)])],
    });
    expect(report.highRpeCount).toBe(1);
    expect(report.shouldTriggerAgent).toBe(true);
  });

  it('detects repeated easy exercises', () => {
    const twoExercisePlan = makePlan(true);
    const report = computeDeviationReport({
      plan: twoExercisePlan,
      today: '2026-07-27',
      sessions: [
        session([
          set('squat', 1, 6),
          set('squat', 2, 7),
          set('squat', 3, 7),
          set('bench', 1, 7),
          set('bench', 2, 7),
          set('bench', 3, 7),
        ]),
      ],
    });
    expect(report.lowRpeCount).toBe(2);
    expect(report.shouldTriggerAgent).toBe(true);
  });

  it('reports a skipped scheduled day', () => {
    const report = computeDeviationReport({ plan, today: '2026-07-27', sessions: [] });
    expect(report.skippedDays).toHaveLength(1);
    expect(report.completionRate).toBe(0);
  });

  it('tracks tired subjective feedback', () => {
    const tired = session([set('squat', 1, 8), set('squat', 2, 8), set('squat', 3, 8)]);
    tired.feeling = 'tired';
    const report = computeDeviationReport({ plan, today: '2026-07-27', sessions: [tired] });
    expect(report.subjectiveFlags).toEqual(['tired']);
    expect(report.shouldTriggerAgent).toBe(true);
  });

  it('computes body-weight trend per week', () => {
    const report = computeDeviationReport({
      plan,
      today: '2026-07-27',
      sessions: [session([set('squat', 1, 8), set('squat', 2, 8), set('squat', 3, 8)])],
      bodyWeights: [
        { date: '2026-07-20', value: 70 },
        { date: '2026-07-27', value: 70.4 },
      ],
    });
    expect(report.weightTrendKgPerWeek).toBe(0.4);
  });
});

function makePlan(twoExercises = false): PlanDetail {
  return {
    id: 'plan',
    name: 'test',
    goal: 'hypertrophy',
    status: 'active',
    durationWeeks: 4,
    daysPerWeek: 1,
    progressionRule: 'double_progression',
    source: 'template',
    nutrition: null,
    explanation: null,
    startedAt: new Date('2026-07-27T00:00:00').getTime(),
    days: [
      {
        id: 'day-mon',
        dayOfWeek: 1,
        label: 'A',
        cardio: null,
        exercises: [
          {
            id: 'planned-squat',
            exerciseId: 'squat',
            sets: 3,
            reps: '8-12',
            weightKg: 50,
            restSec: 90,
            note: null,
          },
          ...(twoExercises
            ? [
                {
                  id: 'planned-bench',
                  exerciseId: 'bench',
                  sets: 3,
                  reps: '8-12',
                  weightKg: 30,
                  restSec: 90,
                  note: null,
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function session(sets: SetLog[]): DeviationSession {
  return {
    id: 'session',
    date: '2026-07-27',
    planDayId: 'day-mon',
    endedAt: Date.now(),
    feeling: 'ok',
    sets,
  };
}

function set(exerciseId: string, setNo: number, rpe: number): SetLog {
  return {
    id: `${exerciseId}-${setNo}`,
    sessionId: 'session',
    exerciseId,
    setNo,
    weightKg: 50,
    reps: 10,
    durationSec: null,
    distanceM: null,
    rpe,
    isWarmup: false,
    source: 'manual',
    confidence: null,
    status: 'confirmed',
    createdAt: Date.now(),
  };
}
