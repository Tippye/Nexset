import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';

import type { PlanDayDetail } from '@/db/repositories/plan-repo';
import { useAppStore } from '@/store/app-store';
import { useWorkoutStore } from '@/store/workout-store';

import { consumePendingAppleIntent } from './apple-intelligence';
import { activateWorkoutAudio, deactivateWorkoutAudio, playWorkoutHaptic } from './feedback';
import { exportStrengthWorkoutToAppleHealth, syncAppleHealth } from './healthkit';
import { loadApplePreferences } from './preferences';
import { endWorkoutPresence, publishIdleWidget, publishWorkoutPresence } from './presence';
import { initializeWatchConnectivity, publishWatchWorkoutSnapshot } from './watch-connectivity';
import {
  buildWorkoutPresenceSnapshot,
  type WatchWorkoutCommand,
} from './workout-snapshot';

function todayPlanDay(): { planId: string; day: PlanDayDetail } | null {
  const activePlan = useAppStore.getState().activePlan;
  if (!activePlan) return null;
  const jsDay = new Date().getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;
  const day = activePlan.days.find((candidate) => candidate.dayOfWeek === dayOfWeek);
  return day ? { planId: activePlan.id, day } : null;
}

async function startWorkoutFromSystem(): Promise<string> {
  const store = useWorkoutStore.getState();
  if (store.sessionId && !store.endedAt) {
    router.push(`/workout/${store.sessionId}`);
    return store.sessionId;
  }
  const planned = todayPlanDay();
  const sessionId = planned
    ? await store.startFromPlanDay(planned.planId, planned.day)
    : await store.startEmpty();
  router.push(`/workout/${sessionId}`);
  return sessionId;
}

async function logCurrentSetFromSystem(command?: Extract<WatchWorkoutCommand, { type: 'logSet' }>) {
  const state = useWorkoutStore.getState();
  if (!state.sessionId || state.endedAt) throw new Error('no_active_workout');
  if (command?.sessionId && command.sessionId !== state.sessionId) {
    throw new Error('session_mismatch');
  }
  const current = state.exercises[state.currentIndex];
  if (!current) throw new Error('no_current_exercise');
  const previous = current.loggedSets[current.loggedSets.length - 1] ?? current.lastSets[0];
  const fallbackReps = Number(current.targetReps.match(/^\d+/)?.[0] ?? 10);
  await state.logSet({
    weightKg: command ? command.weightKg : previous?.weightKg ?? current.plannedWeightKg,
    reps: command ? command.reps : previous?.reps ?? fallbackReps,
    source: command?.source ?? 'manual',
    confidence: command?.confidence ?? null,
    status: command?.source === 'watch_auto' && (command.confidence ?? 0) < 0.7 ? 'pending' : 'confirmed',
  });
  await playWorkoutHaptic('set');
}

async function handleSystemAction(action: string): Promise<void> {
  if (action === 'startWorkout' || action === 'start-workout') {
    await startWorkoutFromSystem();
  } else if (action === 'logSet' || action === 'log-set') {
    await logCurrentSetFromSystem();
  } else if (action === 'syncHealth' || action === 'sync-health') {
    await syncAppleHealth();
  }
}

function actionFromUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const path = parsed.path?.replace(/^\//, '') ?? '';
  if (path.startsWith('workout/')) return null;
  if (path === 'start-workout' || path === 'log-set' || path === 'sync-health') return path;
  return null;
}

export function WorkoutPlatformBridge() {
  useEffect(() => {
    let disposed = false;
    let cleanupWatch: () => void = () => undefined;
    const seenWatchEvents = new Set<string>();
    const watchHealthSessionIds = new Set<string>();

    void loadApplePreferences();
    const planned = todayPlanDay();
    void publishIdleWidget(
      planned?.day.label ?? '开始自由训练',
      planned ? `${planned.day.exercises.length} 个动作 · 今日计划` : '今天也为自己完成一组',
    );

    const handleWatchCommand = async (command: WatchWorkoutCommand) => {
      if (seenWatchEvents.has(command.eventId)) return { ok: true, duplicate: true };
      seenWatchEvents.add(command.eventId);
      try {
        if (command.type === 'startWorkout') {
          const sessionId = await startWorkoutFromSystem();
          watchHealthSessionIds.add(sessionId);
          return { ok: true, sessionId };
        }
        await logCurrentSetFromSystem(command);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'unknown_error' };
      }
    };
    void initializeWatchConnectivity(handleWatchCommand).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupWatch = cleanup;
    });

    const unsubscribeWorkout = useWorkoutStore.subscribe((state, previous) => {
      const snapshot = buildWorkoutPresenceSnapshot(state);
      const previousSnapshot = buildWorkoutPresenceSnapshot(previous);
      if (snapshot?.status === 'finished' && previousSnapshot?.status !== 'finished') {
        void endWorkoutPresence(snapshot);
        void publishWatchWorkoutSnapshot(null);
        void deactivateWorkoutAudio();
        void playWorkoutHaptic('finish');
        if (watchHealthSessionIds.has(snapshot.sessionId)) {
          // The Watch owns its HKWorkoutSession, so exporting again on iPhone would duplicate it.
          watchHealthSessionIds.delete(snapshot.sessionId);
        } else {
          void exportStrengthWorkoutToAppleHealth({
            sessionId: snapshot.sessionId,
            startedAt: snapshot.startedAt,
            endedAt: state.endedAt ?? Date.now(),
            totalVolumeKg: state.exercises
              .flatMap((exercise) => exercise.loggedSets)
              .reduce((sum, setLog) => sum + (setLog.weightKg ?? 0) * (setLog.reps ?? 0), 0),
          }).catch(() => undefined);
        }
        return;
      }
      if (!snapshot) return;
      void publishWorkoutPresence(snapshot);
      void publishWatchWorkoutSnapshot(snapshot);
      if (!previousSnapshot) {
        void activateWorkoutAudio();
        void playWorkoutHaptic('start');
      }
    });

    const urlSubscription = Linking.addEventListener('url', ({ url }) => {
      const action = actionFromUrl(url);
      if (action) void handleSystemAction(action);
    });
    void Linking.getInitialURL().then((url) => {
      const action = url ? actionFromUrl(url) : null;
      if (action) void handleSystemAction(action);
    });
    void consumePendingAppleIntent().then((action) => {
      if (action) void handleSystemAction(action);
    });

    return () => {
      disposed = true;
      cleanupWatch();
      unsubscribeWorkout();
      urlSubscription.remove();
    };
  }, []);

  return null;
}
