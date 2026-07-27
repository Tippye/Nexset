import { and, asc, eq, inArray } from 'drizzle-orm';

import { newId } from '@/lib/id';

import { logOp } from '../oplog';
import { planDays, plannedExercises, planRevisions, plans } from '../schema';
import type { DB } from '../types';

export type PlanCardio = { type: string; durationMin: number; intensity: string } | null;

export type PlanExerciseInput = {
  exerciseId: string;
  sets: number;
  reps: string;
  weightKg?: number | null;
  restSec?: number;
  note?: string | null;
};

export type PlanDayInput = {
  dayOfWeek: number; // 1(Mon)-7(Sun)
  label: string;
  cardio?: PlanCardio;
  exercises: PlanExerciseInput[];
};

export type PlanNutrition = {
  dailyKcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  rationale?: string;
};

export type PlanInput = {
  name: string;
  goal: string;
  durationWeeks: number;
  daysPerWeek: number;
  progressionRule: 'linear' | 'double_progression' | 'rpe_based';
  source: 'ai' | 'template';
  nutrition?: PlanNutrition | null;
  explanation?: string | null;
  days: PlanDayInput[];
};

export type PlanDayDetail = {
  id: string;
  dayOfWeek: number;
  label: string;
  cardio: PlanCardio;
  exercises: (PlanExerciseInput & { id: string })[];
};

export type PlanDetail = {
  id: string;
  name: string;
  goal: string;
  status: 'draft' | 'active' | 'archived';
  durationWeeks: number;
  daysPerWeek: number;
  progressionRule: PlanInput['progressionRule'];
  source: 'ai' | 'template';
  nutrition: PlanNutrition | null;
  explanation: string | null;
  startedAt: number | null;
  days: PlanDayDetail[];
};

export async function createPlan(db: DB, input: PlanInput): Promise<string> {
  const now = Date.now();
  const planId = newId();
  const planRow = {
    id: planId,
    name: input.name,
    goal: input.goal,
    status: 'draft',
    durationWeeks: input.durationWeeks,
    daysPerWeek: input.daysPerWeek,
    progressionRule: input.progressionRule,
    source: input.source,
    nutritionJson: input.nutrition ? JSON.stringify(input.nutrition) : null,
    explanation: input.explanation ?? null,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(plans).values(planRow);
  await logOp(db, 'plans', planId, 'put', planRow);

  for (let d = 0; d < input.days.length; d++) {
    const day = input.days[d];
    const dayRow = {
      id: newId(),
      planId,
      dayOfWeek: day.dayOfWeek,
      label: day.label,
      cardioJson: day.cardio ? JSON.stringify(day.cardio) : null,
      sort: d,
    };
    await db.insert(planDays).values(dayRow);
    await logOp(db, 'plan_days', dayRow.id, 'put', dayRow);

    for (let i = 0; i < day.exercises.length; i++) {
      const ex = day.exercises[i];
      const exRow = {
        id: newId(),
        planDayId: dayRow.id,
        exerciseId: ex.exerciseId,
        sets: ex.sets,
        reps: ex.reps,
        weightKg: ex.weightKg ?? null,
        restSec: ex.restSec ?? 90,
        note: ex.note ?? null,
        sort: i,
      };
      await db.insert(plannedExercises).values(exRow);
      await logOp(db, 'planned_exercises', exRow.id, 'put', exRow);
    }
  }
  return planId;
}

async function loadPlanDetail(db: DB, planRow: typeof plans.$inferSelect): Promise<PlanDetail> {
  const dayRows = await db
    .select()
    .from(planDays)
    .where(eq(planDays.planId, planRow.id))
    .orderBy(asc(planDays.sort));
  const days: PlanDayDetail[] = [];
  for (const day of dayRows) {
    const exRows = await db
      .select()
      .from(plannedExercises)
      .where(eq(plannedExercises.planDayId, day.id))
      .orderBy(asc(plannedExercises.sort));
    days.push({
      id: day.id,
      dayOfWeek: day.dayOfWeek,
      label: day.label,
      cardio: day.cardioJson ? JSON.parse(day.cardioJson) : null,
      exercises: exRows.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        sets: e.sets,
        reps: e.reps,
        weightKg: e.weightKg,
        restSec: e.restSec,
        note: e.note,
      })),
    });
  }
  return {
    id: planRow.id,
    name: planRow.name,
    goal: planRow.goal,
    status: planRow.status as PlanDetail['status'],
    durationWeeks: planRow.durationWeeks,
    daysPerWeek: planRow.daysPerWeek,
    progressionRule: planRow.progressionRule as PlanInput['progressionRule'],
    source: planRow.source as 'ai' | 'template',
    nutrition: planRow.nutritionJson ? JSON.parse(planRow.nutritionJson) : null,
    explanation: planRow.explanation,
    startedAt: planRow.startedAt,
    days,
  };
}

export async function getPlan(db: DB, planId: string): Promise<PlanDetail | null> {
  const rows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  return rows.length ? loadPlanDetail(db, rows[0]) : null;
}

export async function getActivePlan(db: DB): Promise<PlanDetail | null> {
  const rows = await db.select().from(plans).where(eq(plans.status, 'active')).limit(1);
  return rows.length ? loadPlanDetail(db, rows[0]) : null;
}

/** Activates a draft plan, archiving any currently active plan. */
export async function activatePlan(db: DB, planId: string): Promise<void> {
  const now = Date.now();
  const active = await db
    .select()
    .from(plans)
    .where(and(eq(plans.status, 'active')))
    .limit(1);
  if (active.length > 0 && active[0].id !== planId) {
    await db
      .update(plans)
      .set({ status: 'archived', updatedAt: now })
      .where(eq(plans.id, active[0].id));
    await logOp(db, 'plans', active[0].id, 'put', { ...active[0], status: 'archived', updatedAt: now });
  }
  await db
    .update(plans)
    .set({ status: 'active', startedAt: now, updatedAt: now })
    .where(eq(plans.id, planId));
  const updated = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (updated.length) await logOp(db, 'plans', planId, 'put', updated[0]);
}

export async function addPlanRevision(
  db: DB,
  planId: string,
  diff: unknown,
  rollback: unknown,
  reason: string | null,
  source: 'ai' | 'user',
): Promise<void> {
  const prev = await db.select().from(planRevisions).where(eq(planRevisions.planId, planId));
  const row = {
    id: newId(),
    planId,
    revisionNo: prev.length + 1,
    diffJson: JSON.stringify(diff),
    rollbackJson: rollback === undefined ? null : JSON.stringify(rollback),
    reason,
    source,
    createdAt: Date.now(),
  };
  await db.insert(planRevisions).values(row);
  await logOp(db, 'plan_revisions', row.id, 'put', row);
}

/** Replaces one plan's editable content while preserving its id/status/history. */
export async function replacePlanContent(
  db: DB,
  planId: string,
  input: PlanInput,
): Promise<void> {
  const existing = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!existing.length) throw new Error(`Plan not found: ${planId}`);
  const oldDays = await db.select().from(planDays).where(eq(planDays.planId, planId));
  const oldDayIds = oldDays.map((day) => day.id);
  if (oldDayIds.length) {
    const oldExercises = await db
      .select()
      .from(plannedExercises)
      .where(inArray(plannedExercises.planDayId, oldDayIds));
    for (const exercise of oldExercises) {
      await logOp(db, 'planned_exercises', exercise.id, 'delete');
    }
    await db.delete(plannedExercises).where(inArray(plannedExercises.planDayId, oldDayIds));
  }
  for (const day of oldDays) await logOp(db, 'plan_days', day.id, 'delete');
  await db.delete(planDays).where(eq(planDays.planId, planId));

  const now = Date.now();
  await db
    .update(plans)
    .set({
      name: input.name,
      goal: input.goal,
      durationWeeks: input.durationWeeks,
      daysPerWeek: input.daysPerWeek,
      progressionRule: input.progressionRule,
      source: input.source,
      nutritionJson: input.nutrition ? JSON.stringify(input.nutrition) : null,
      explanation: input.explanation ?? null,
      updatedAt: now,
    })
    .where(eq(plans.id, planId));
  for (let dayIndex = 0; dayIndex < input.days.length; dayIndex++) {
    const day = input.days[dayIndex];
    const dayRow = {
      id: newId(),
      planId,
      dayOfWeek: day.dayOfWeek,
      label: day.label,
      cardioJson: day.cardio ? JSON.stringify(day.cardio) : null,
      sort: dayIndex,
    };
    await db.insert(planDays).values(dayRow);
    await logOp(db, 'plan_days', dayRow.id, 'put', dayRow);
    for (let exerciseIndex = 0; exerciseIndex < day.exercises.length; exerciseIndex++) {
      const exercise = day.exercises[exerciseIndex];
      const row = {
        id: newId(),
        planDayId: dayRow.id,
        exerciseId: exercise.exerciseId,
        sets: exercise.sets,
        reps: exercise.reps,
        weightKg: exercise.weightKg ?? null,
        restSec: exercise.restSec ?? 90,
        note: exercise.note ?? null,
        sort: exerciseIndex,
      };
      await db.insert(plannedExercises).values(row);
      await logOp(db, 'planned_exercises', row.id, 'put', row);
    }
  }
  const updated = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (updated.length) await logOp(db, 'plans', planId, 'put', updated[0]);
}
