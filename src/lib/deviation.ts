import type { DB } from '@/db/types';
import { getMetricHistory } from '@/db/repositories/body-repo';
import type { PlanDetail } from '@/db/repositories/plan-repo';
import { getRecentSessions, getSessionSets, type SetLog } from '@/db/repositories/workout-repo';
import { localDate } from '@/lib/id';

export type DeviationSession = {
  id: string;
  date: string;
  planDayId: string | null;
  endedAt: number | null;
  feeling: string | null;
  sets: SetLog[];
};

export type ExerciseDeviation = {
  date: string;
  planDayId: string;
  plannedExerciseId: string;
  exerciseId: string;
  plannedSets: number;
  completedSets: number;
  plannedWeightKg: number | null;
  averageWeightKg: number | null;
  averageRpe: number | null;
  status: 'met' | 'under_completed' | 'too_hard' | 'too_easy';
};

export type DeviationReport = {
  days: number;
  rangeStart: string;
  rangeEnd: string;
  plannedSessions: number;
  completedSessions: number;
  plannedSets: number;
  completedSets: number;
  completionRate: number;
  skippedDays: { date: string; planDayId: string; label: string }[];
  exerciseDeviations: ExerciseDeviation[];
  highRpeCount: number;
  lowRpeCount: number;
  consecutiveNoTrainingDays: number;
  weightTrendKgPerWeek: number | null;
  subjectiveFlags: string[];
  reasons: string[];
  shouldTriggerAgent: boolean;
};

export function computeDeviationReport(input: {
  plan: PlanDetail;
  sessions: DeviationSession[];
  bodyWeights?: { date: string; value: number }[];
  today?: string;
  days?: number;
}): DeviationReport {
  const days = input.days ?? 7;
  const today = input.today ?? localDate();
  const planStart = input.plan.startedAt ? localDate(new Date(input.plan.startedAt)) : shiftDate(today, -(days - 1));
  const rangeStart = maxDate(shiftDate(today, -(days - 1)), planStart);
  const dates = dateRange(rangeStart, today);
  const scheduled = dates.flatMap((date) => {
    const dow = dayOfWeek(date);
    return input.plan.days
      .filter((day) => day.dayOfWeek === dow)
      .map((day) => ({ date, day }));
  });
  const completedSessions = input.sessions.filter(
    (session) => session.endedAt != null && session.date >= rangeStart && session.date <= today,
  );
  const exerciseDeviations: ExerciseDeviation[] = [];
  const skippedDays: DeviationReport['skippedDays'] = [];
  let plannedSets = 0;
  let completedSets = 0;

  for (const item of scheduled) {
    const matches = completedSessions.filter(
      (session) => session.date === item.date && session.planDayId === item.day.id,
    );
    if (!matches.length) {
      skippedDays.push({ date: item.date, planDayId: item.day.id, label: item.day.label });
    }
    for (const exercise of item.day.exercises) {
      plannedSets += exercise.sets;
      const sets = matches
        .flatMap((session) => session.sets)
        .filter(
          (set) =>
            set.exerciseId === exercise.exerciseId &&
            set.status === 'confirmed' &&
            !set.isWarmup,
        );
      completedSets += Math.min(exercise.sets, sets.length);
      if (!matches.length) continue;
      const weights = sets.flatMap((set) => (set.weightKg == null ? [] : [set.weightKg]));
      const rpes = sets.flatMap((set) => (set.rpe == null ? [] : [set.rpe]));
      const averageWeightKg = average(weights);
      const averageRpe = average(rpes);
      let status: ExerciseDeviation['status'] = sets.length >= exercise.sets ? 'met' : 'under_completed';
      if (averageRpe != null && averageRpe >= 9) status = 'too_hard';
      else if (averageRpe != null && averageRpe <= 7 && sets.length >= exercise.sets) status = 'too_easy';
      exerciseDeviations.push({
        date: item.date,
        planDayId: item.day.id,
        plannedExerciseId: exercise.id,
        exerciseId: exercise.exerciseId,
        plannedSets: exercise.sets,
        completedSets: sets.length,
        plannedWeightKg: exercise.weightKg ?? null,
        averageWeightKg,
        averageRpe,
        status,
      });
    }
  }

  const completionRate = plannedSets ? Math.min(1, completedSets / plannedSets) : 1;
  const highRpeCount = exerciseDeviations.filter((item) => item.status === 'too_hard').length;
  const lowRpeCount = exerciseDeviations.filter((item) => item.status === 'too_easy').length;
  const subjectiveFlags = completedSessions
    .flatMap((session) => (session.feeling === 'bad' || session.feeling === 'tired' ? [session.feeling] : []));
  const consecutiveNoTrainingDays = noTrainingDays(completedSessions, today, planStart);
  const weightTrendKgPerWeek = weightTrend(input.bodyWeights ?? []);
  const reasons: string[] = [];
  if (completionRate < 0.9) reasons.push(`计划组完成率 ${Math.round(completionRate * 100)}%`);
  if (skippedDays.length) reasons.push(`跳过 ${skippedDays.length} 个训练日`);
  if (highRpeCount) reasons.push(`${highRpeCount} 个动作平均 RPE≥9`);
  if (lowRpeCount >= 2) reasons.push(`${lowRpeCount} 个动作完成且平均 RPE≤7`);
  if (subjectiveFlags.length) reasons.push(`主观反馈偏疲劳 ${subjectiveFlags.length} 次`);
  if (consecutiveNoTrainingDays >= 3) reasons.push(`连续 ${consecutiveNoTrainingDays} 天未训练`);
  const hasMaterialAbnormality =
    highRpeCount > 0 ||
    lowRpeCount >= 2 ||
    subjectiveFlags.length > 0 ||
    consecutiveNoTrainingDays >= 3;
  const shouldTriggerAgent =
    scheduled.length > 0 && (completionRate < 0.9 || hasMaterialAbnormality);

  return {
    days,
    rangeStart,
    rangeEnd: today,
    plannedSessions: scheduled.length,
    completedSessions: new Set(completedSessions.map((session) => session.id)).size,
    plannedSets,
    completedSets,
    completionRate,
    skippedDays,
    exerciseDeviations,
    highRpeCount,
    lowRpeCount,
    consecutiveNoTrainingDays,
    weightTrendKgPerWeek,
    subjectiveFlags,
    reasons,
    shouldTriggerAgent,
  };
}

export async function getCurrentDeviationReport(
  db: DB,
  plan: PlanDetail,
  days = 7,
): Promise<DeviationReport> {
  const recent = await getRecentSessions(db, 120);
  const sessions: DeviationSession[] = [];
  for (const session of recent) {
    sessions.push({
      id: session.id,
      date: session.date,
      planDayId: session.planDayId,
      endedAt: session.endedAt,
      feeling: session.feeling,
      sets: await getSessionSets(db, session.id),
    });
  }
  const bodyWeights = (await getMetricHistory(db, 'weight_kg')).map((row) => ({
    date: row.date,
    value: row.value,
  }));
  return computeDeviationReport({ plan, sessions, bodyWeights, days });
}

function weightTrend(rows: { date: string; value: number }[]): number | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = Math.max(1, dateDiff(first.date, last.date));
  return Math.round(((last.value - first.value) / days) * 7 * 100) / 100;
}

function noTrainingDays(sessions: DeviationSession[], today: string, planStart: string): number {
  const dates = sessions.filter((session) => session.endedAt != null).map((session) => session.date);
  const latest = dates.sort().at(-1) ?? planStart;
  return Math.max(0, dateDiff(latest, today));
}

function average(values: number[]): number | null {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : null;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
}

function dateDiff(start: string, end: string): number {
  return Math.round(
    (new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) /
      86_400_000,
  );
}

function dayOfWeek(date: string): number {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}
