import type { WorkoutExercise } from '@/store/workout-store';

import type { WorkoutPresenceSnapshot } from './presence';

export type WorkoutSnapshotState = {
  sessionId: string | null;
  label: string;
  exercises: WorkoutExercise[];
  currentIndex: number;
  restEndsAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
};

export function buildWorkoutPresenceSnapshot(
  state: WorkoutSnapshotState,
): WorkoutPresenceSnapshot | null {
  if (!state.sessionId || !state.startedAt) return null;
  const current = state.exercises[state.currentIndex];
  const completedSets = state.exercises.reduce(
    (sum, exercise) => sum + exercise.loggedSets.length,
    0,
  );
  const totalSets = state.exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0);
  return {
    sessionId: state.sessionId,
    label: state.label,
    exerciseName: current?.exercise.nameZh ?? '选择一个动作',
    completedSets,
    totalSets,
    currentSet: Math.min((current?.loggedSets.length ?? 0) + 1, current?.targetSets ?? 1),
    targetSets: current?.targetSets ?? 1,
    restEndsAt: state.restEndsAt,
    startedAt: state.startedAt,
    status: state.endedAt ? 'finished' : state.restEndsAt ? 'resting' : 'training',
  };
}

export type WatchWorkoutCommand =
  | { eventId: string; type: 'startWorkout' }
  | {
      eventId: string;
      type: 'logSet';
      sessionId?: string;
      weightKg: number | null;
      reps: number | null;
      source: 'watch_manual' | 'watch_auto';
      confidence: number | null;
    };

export function parseWatchWorkoutCommand(
  value: Record<string, unknown>,
): WatchWorkoutCommand | null {
  const type = value.type;
  const eventId = typeof value.eventId === 'string' ? value.eventId : '';
  if (!eventId) return null;
  if (type === 'startWorkout') return { eventId, type };
  if (type !== 'logSet') return null;
  const source = value.source === 'watch_auto' ? 'watch_auto' : 'watch_manual';
  const numberOrNull = (item: unknown): number | null =>
    typeof item === 'number' && Number.isFinite(item) ? item : null;
  return {
    eventId,
    type,
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined,
    weightKg: numberOrNull(value.weightKg),
    reps: numberOrNull(value.reps),
    source,
    confidence: source === 'watch_auto' ? numberOrNull(value.confidence) : null,
  };
}
