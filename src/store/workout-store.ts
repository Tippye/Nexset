import { create } from 'zustand';

import { getDb } from '@/db/client';
import { getExercisesByIds, getExercise, type Exercise } from '@/db/repositories/exercise-repo';
import type { PlanDayDetail } from '@/db/repositories/plan-repo';
import {
  addSetLog,
  deleteSetLog,
  endSession,
  getExerciseBests,
  getLastSetsForExercise,
  startSession,
  type SetLog,
} from '@/db/repositories/workout-repo';

export type WorkoutExercise = {
  exerciseId: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  plannedWeightKg: number | null;
  restSec: number;
  loggedSets: SetLog[];
  lastSets: SetLog[];
  bests: { maxWeightKg: number | null; maxE1rm: number | null };
  prHit: 'weight' | 'e1rm' | null;
};

export type SetDraft = {
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
};

type WorkoutState = {
  sessionId: string | null;
  planId: string | null;
  planDayId: string | null;
  label: string;
  exercises: WorkoutExercise[];
  currentIndex: number;
  restEndsAt: number | null;
  startedAt: number | null;

  startFromPlanDay: (planId: string, day: PlanDayDetail) => Promise<string>;
  startEmpty: () => Promise<string>;
  logSet: (draft: SetDraft) => Promise<void>;
  undoLastSet: () => Promise<void>;
  addExercise: (exerciseId: string) => Promise<void>;
  replaceExercise: (index: number, newExerciseId: string) => Promise<void>;
  addTargetSet: (index: number) => void;
  setCurrentIndex: (i: number) => void;
  skipRest: () => void;
  finish: (feeling?: 'great' | 'ok' | 'tired' | 'bad', note?: string) => Promise<WorkoutSummary>;
  reset: () => void;
};

export type WorkoutSummary = {
  sessionId: string;
  durationMin: number;
  totalVolumeKg: number;
  totalSets: number;
  prs: { name: string; kind: 'weight' | 'e1rm' }[];
  plannedVsDone: { name: string; target: number; done: number }[];
};

async function loadWorkoutExercise(
  exerciseId: string,
  sessionId: string,
  target: { sets: number; reps: string; weightKg: number | null; restSec: number },
): Promise<WorkoutExercise | null> {
  const db = getDb();
  const exercise = await getExercise(db, exerciseId);
  if (!exercise) return null;
  const [lastSets, bests] = await Promise.all([
    getLastSetsForExercise(db, exerciseId, { excludeSessionId: sessionId }),
    getExerciseBests(db, exerciseId, { excludeSessionId: sessionId }),
  ]);
  return {
    exerciseId,
    exercise,
    targetSets: target.sets,
    targetReps: target.reps,
    plannedWeightKg: target.weightKg,
    restSec: target.restSec,
    loggedSets: [],
    lastSets,
    bests,
    prHit: null,
  };
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  sessionId: null,
  planId: null,
  planDayId: null,
  label: '自由训练',
  exercises: [],
  currentIndex: 0,
  restEndsAt: null,
  startedAt: null,

  startFromPlanDay: async (planId, day) => {
    const db = getDb();
    const sessionId = await startSession(db, { planId, planDayId: day.id });
    // Warm the exercise cache in one query, then build states in order.
    await getExercisesByIds(db, day.exercises.map((e) => e.exerciseId));
    const exercises: WorkoutExercise[] = [];
    for (const pe of day.exercises) {
      const we = await loadWorkoutExercise(pe.exerciseId, sessionId, {
        sets: pe.sets,
        reps: pe.reps,
        weightKg: pe.weightKg ?? null,
        restSec: pe.restSec ?? 90,
      });
      if (we) exercises.push(we);
    }
    set({
      sessionId,
      planId,
      planDayId: day.id,
      label: day.label,
      exercises,
      currentIndex: 0,
      restEndsAt: null,
      startedAt: Date.now(),
    });
    return sessionId;
  },

  startEmpty: async () => {
    const sessionId = await startSession(getDb());
    set({
      sessionId,
      planId: null,
      planDayId: null,
      label: '自由训练',
      exercises: [],
      currentIndex: 0,
      restEndsAt: null,
      startedAt: Date.now(),
    });
    return sessionId;
  },

  logSet: async (draft) => {
    const { sessionId, exercises, currentIndex } = get();
    if (!sessionId || !exercises[currentIndex]) return;
    const ex = exercises[currentIndex];
    const setNo = ex.loggedSets.length + 1;
    const log = await addSetLog(getDb(), sessionId, {
      exerciseId: ex.exerciseId,
      setNo,
      weightKg: draft.weightKg ?? null,
      reps: draft.reps ?? null,
      durationSec: draft.durationSec ?? null,
      distanceM: draft.distanceM ?? null,
      rpe: draft.rpe ?? null,
      isWarmup: draft.isWarmup ?? false,
    });
    let prHit: WorkoutExercise['prHit'] = ex.prHit;
    if (!draft.isWarmup && draft.weightKg != null) {
      if (ex.bests.maxWeightKg != null && draft.weightKg > ex.bests.maxWeightKg) prHit = 'weight';
      else if (
        ex.bests.maxE1rm != null &&
        draft.reps != null &&
        draft.weightKg * (1 + draft.reps / 30) > ex.bests.maxE1rm
      )
        prHit = prHit ?? 'e1rm';
    }
    const updated = [...exercises];
    updated[currentIndex] = { ...ex, loggedSets: [...ex.loggedSets, log], prHit };
    const doneAll = updated[currentIndex].loggedSets.length >= ex.targetSets;
    set({
      exercises: updated,
      restEndsAt: doneAll ? null : Date.now() + ex.restSec * 1000,
    });
  },

  undoLastSet: async () => {
    const { exercises, currentIndex } = get();
    const ex = exercises[currentIndex];
    if (!ex || ex.loggedSets.length === 0) return;
    const last = ex.loggedSets[ex.loggedSets.length - 1];
    await deleteSetLog(getDb(), last.id);
    const updated = [...exercises];
    updated[currentIndex] = { ...ex, loggedSets: ex.loggedSets.slice(0, -1) };
    set({ exercises: updated, restEndsAt: null });
  },

  addExercise: async (exerciseId) => {
    const { sessionId, exercises } = get();
    if (!sessionId) return;
    const we = await loadWorkoutExercise(exerciseId, sessionId, {
      sets: 3,
      reps: '8-12',
      weightKg: null,
      restSec: 90,
    });
    if (we) set({ exercises: [...exercises, we], currentIndex: exercises.length });
  },

  replaceExercise: async (index, newExerciseId) => {
    const { sessionId, exercises } = get();
    if (!sessionId || !exercises[index]) return;
    const old = exercises[index];
    const we = await loadWorkoutExercise(newExerciseId, sessionId, {
      sets: old.targetSets,
      reps: old.targetReps,
      weightKg: null,
      restSec: old.restSec,
    });
    if (!we) return;
    const updated = [...exercises];
    // Keep already-logged sets attached to the old exercise; the new one starts fresh.
    updated.splice(index, old.loggedSets.length === 0 ? 1 : 0, we);
    set({ exercises: updated });
  },

  addTargetSet: (index) => {
    const { exercises } = get();
    if (!exercises[index]) return;
    const updated = [...exercises];
    updated[index] = { ...updated[index], targetSets: updated[index].targetSets + 1 };
    set({ exercises: updated });
  },

  setCurrentIndex: (i) => set({ currentIndex: i, restEndsAt: null }),
  skipRest: () => set({ restEndsAt: null }),

  finish: async (feeling, note) => {
    const { sessionId, exercises, startedAt } = get();
    if (!sessionId) throw new Error('no active session');
    await endSession(getDb(), sessionId, { feeling, note });
    const totalVolumeKg = exercises
      .flatMap((e) => e.loggedSets)
      .filter((s) => !s.isWarmup)
      .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
    const summary: WorkoutSummary = {
      sessionId,
      durationMin: startedAt ? Math.round((Date.now() - startedAt) / 60000) : 0,
      totalVolumeKg: Math.round(totalVolumeKg),
      totalSets: exercises.reduce((n, e) => n + e.loggedSets.length, 0),
      prs: exercises
        .filter((e) => e.prHit)
        .map((e) => ({ name: e.exercise.nameZh, kind: e.prHit! })),
      plannedVsDone: exercises.map((e) => ({
        name: e.exercise.nameZh,
        target: e.targetSets,
        done: e.loggedSets.length,
      })),
    };
    return summary;
  },

  reset: () =>
    set({
      sessionId: null,
      planId: null,
      planDayId: null,
      label: '自由训练',
      exercises: [],
      currentIndex: 0,
      restEndsAt: null,
      startedAt: null,
    }),
}));
